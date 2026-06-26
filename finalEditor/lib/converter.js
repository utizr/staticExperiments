/**
 * Converter — HTML sanitization and DOM ↔ JSON serialization utilities.
 *
 * Provides:
 *   - sanitizeHTML()      — clean dirty HTML against an allow-list
 *   - domToJson()         — DOM node → compact JSON AST
 *   - htmlStringToJson()  — HTML string → JSON AST
 *   - jsonToDom()         — JSON AST → live DOM nodes
 *   - jsonToHtmlString()  — JSON AST → HTML string
 *
 * Used by SimpleEditor but intentionally decoupled so these utilities
 * can be reused independently (e.g. server-side rendering, tests).
 */
const Converter = (() => {

  // ════════════════════════════════════════════
  //  HTML Sanitization
  // ════════════════════════════════════════════
  //
  // The sanitizer runs in two phases:
  //   1. PRE-PROCESSING — structural fixes applied directly to a parsed DOM
  //      (unwrap spans, convert divs to <p>, rescue orphaned <li>s, etc.)
  //   2. RECURSIVE CLEAN — walks the tree node-by-node, keeping only tags in
  //      the allow-list and stripping disallowed attributes.
  //
  // This two-phase approach lets us fix messy clipboard HTML (e.g. from
  // Google Docs, Notion, or Word) before the strict whitelist pass.

  /**
   * Sanitizes an HTML string by removing disallowed tags/attributes and
   * optionally converting certain tags (e.g. <strong> → <b>).
   *
   * Disallowed tags are "unwrapped": the tag itself is removed but its
   * child content is preserved.
   *
   * @param {string} htmlString      - Raw (dirty) HTML.
   * @param {string[]} allowedTags   - Lowercase tag names to keep.
   * @param {Object} [options]
   * @param {Object} [options.allowedAttributes] - Tag → attribute[] map, e.g. { a: ['href'] }.
   * @param {Object} [options.tagConversions]     - Tag rename map, e.g. { b: 'strong' }.
   * @returns {string} Sanitized HTML.
   */
  function sanitizeHTML(htmlString, allowedTags, options = {}) {
    const { allowedAttributes = {}, tagConversions = {} } = options;

    const allowedTagSet = new Set(allowedTags);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // ── Phase 1: Pre-processing (structural fixes) ──

    // <span> tags carry styling but no semantic meaning — unwrap them so
    // their children merge into the surrounding context.
    for (const span of Array.from(doc.querySelectorAll('span'))) {
      const fragment = doc.createDocumentFragment();
      while (span.firstChild) fragment.appendChild(span.firstChild);
      span.replaceWith(fragment);
    }

    // <div> handling depends on content:
    //   • If the div contains block-level children (lists, paragraphs,
    //     nested divs), unwrap it to avoid nesting blocks inside blocks.
    //   • Otherwise, convert it to a <p> so bare text gets a proper wrapper.
    for (const div of Array.from(doc.querySelectorAll('div'))) {
      if (div.querySelector('ul, ol, li, p, div')) {
        const fragment = doc.createDocumentFragment();
        while (div.firstChild) fragment.appendChild(div.firstChild);
        div.replaceWith(fragment);
      } else {
        const p = doc.createElement('p');
        while (div.firstChild) p.appendChild(div.firstChild);
        div.replaceWith(p);
      }
    }

    // Some apps (Notion, Bear) paste <li> elements without a wrapping
    // <ul>/<ol>.  Group consecutive orphaned <li>s into a new <ul>.
    for (const li of Array.from(doc.querySelectorAll('li'))) {
      const parent = li.parentElement;
      if (parent && parent.tagName !== 'UL' && parent.tagName !== 'OL') {
        const ul = doc.createElement('ul');
        li.before(ul);
        let current = li;
        while (current && current.tagName === 'LI') {
          const next = current.nextElementSibling;
          ul.appendChild(current);
          current = next;
        }
      }
    }

    // Word/Docs sometimes wrap list-item text in <p> — remove the extra
    // paragraph layer so the <li> only contains inline content.
    for (const p of Array.from(doc.querySelectorAll('li p'))) {
      const fragment = doc.createDocumentFragment();
      while (p.firstChild) fragment.appendChild(p.firstChild);
      p.replaceWith(fragment);
    }

    // Strip every element that isn't in the allow-list. Iterate in reverse
    // so that removing a parent doesn't invalidate indices of earlier nodes.
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    for (let i = allElements.length - 1; i >= 0; i--) {
      const el = allElements[i];
      if (!allowedTagSet.has(el.tagName.toLowerCase())) {
        const fragment = doc.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        el.replaceWith(fragment);
      }
    }

    // Force links to open in a new tab.
    doc.querySelectorAll('a[href]').forEach(a => a.setAttribute('target', '_blank'));

    // ── Phase 2: Recursive clean (whitelist enforcement) ──

    const safeTagsLower = allowedTags.map(t => t.toLowerCase());

    const conversions = Object.entries(tagConversions).reduce((acc, [from, to]) => {
      acc[from.toLowerCase()] = to.toLowerCase();
      return acc;
    }, {});

    /**
     * Recursively clones a node, applying tag conversions and stripping
     * disallowed tags/attributes. Returns a clean DOM node or fragment.
     */
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const originalTag = node.tagName.toLowerCase();
      const tagName = conversions[originalTag] || originalTag;

      if (safeTagsLower.includes(tagName)) {
        // Tag is allowed — create it and copy permitted attributes.
        const el = document.createElement(tagName);
        const permitted = allowedAttributes[tagName] || [];

        for (const attr of node.attributes) {
          if (!permitted.includes(attr.name)) continue;
          // Block javascript: URIs to prevent XSS via href.
          if (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) continue;
          el.setAttribute(attr.name, attr.value);
        }

        for (const child of node.childNodes) {
          const cleaned = processNode(child);
          if (cleaned) el.appendChild(cleaned);
        }
        return el;
      }

      // Tag is NOT allowed — unwrap: keep children, discard the tag.
      const fragment = document.createDocumentFragment();
      for (const child of node.childNodes) {
        const cleaned = processNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      }
      return fragment;
    }

    const resultFragment = document.createDocumentFragment();
    for (const child of doc.body.childNodes) {
      const cleaned = processNode(child);
      if (cleaned) resultFragment.appendChild(cleaned);
    }

    const tempContainer = document.createElement('div');
    tempContainer.appendChild(resultFragment);
    return tempContainer.innerHTML;
  }

  // ════════════════════════════════════════════
  //  DOM ↔ JSON Serialization
  // ════════════════════════════════════════════
  //
  // These utilities convert editor HTML to a compact JSON AST and back.
  // The AST format:
  //   { t: "p", a: [{ name: "class", value: "intro" }], c: ["Hello ", { t: "b", ... }] }
  //
  // Text nodes become plain strings; element nodes become objects with
  // `t` (tag), `a` (attributes array), and `c` (children array).

  /**
   * Recursively converts a DOM node into a JSON AST object.
   * Whitespace-only text nodes are filtered out.
   *
   * @param {Node} node - DOM element or text node.
   * @returns {Object|string|null} JSON object, text string, or null (filtered).
   */
  function domToJson(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue.trim() === '' ? null : node.nodeValue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const obj = { t: node.tagName.toLowerCase(), a: [], c: [] };

      if (node.hasAttributes()) {
        for (const attr of node.attributes) {
          obj.a.push({ name: attr.name, value: attr.value });
        }
      }

      if (node.hasChildNodes()) {
        for (const child of node.childNodes) {
          const childJson = domToJson(child);
          if (childJson !== null) obj.c.push(childJson);
        }
      }

      return obj;
    }

    return null;
  }

  /**
   * Parses an HTML string into the JSON AST format.
   * Returns a single object if there's one root node, otherwise an array.
   *
   * @param {string} htmlString - Raw HTML to convert.
   * @returns {Object|Array}
   */
  function htmlStringToJson(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();

    const result = [];
    for (const child of template.content.childNodes) {
      const parsed = domToJson(child);
      if (parsed !== null) result.push(parsed);
    }

    return result.length === 1 ? result[0] : result;
  }

  /**
   * Recursively converts a JSON AST back into live DOM nodes.
   *
   * @param {Object|string|Array} json - JSON AST.
   * @returns {Node|DocumentFragment|null}
   */
  function jsonToDom(json) {
    if (Array.isArray(json)) {
      const fragment = document.createDocumentFragment();
      for (const item of json) {
        const node = jsonToDom(item);
        if (node) fragment.appendChild(node);
      }
      return fragment;
    }

    if (typeof json === 'string') {
      return document.createTextNode(json);
    }

    if (typeof json === 'object' && json !== null) {
      const el = document.createElement(json.t);

      if (json.a && Array.isArray(json.a)) {
        for (const attr of json.a) el.setAttribute(attr.name, attr.value);
      }

      if (json.c && Array.isArray(json.c)) {
        for (const childJson of json.c) {
          const childNode = jsonToDom(childJson);
          if (childNode) el.appendChild(childNode);
        }
      }

      return el;
    }

    return null;
  }

  /**
   * Converts a JSON AST into a raw HTML string.
   *
   * @param {Object|string|Array} json - JSON AST.
   * @returns {string} Reconstructed HTML.
   */
  function jsonToHtmlString(json) {
    const node = jsonToDom(json);
    if (!node) return '';

    if (node instanceof DocumentFragment) {
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(node);
      return tempDiv.innerHTML;
    }

    if (node instanceof Element) return node.outerHTML;
    if (node instanceof Text) return node.nodeValue;

    return '';
  }

  return { sanitizeHTML, domToJson, htmlStringToJson, jsonToDom, jsonToHtmlString };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Converter;
}
