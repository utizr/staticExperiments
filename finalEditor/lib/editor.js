/**
 * SimpleEditor - A lightweight WYSIWYG editor library.
 *
 * Usage:
 *   const editor = SimpleEditor.mount(document.getElementById('my-div'), { allowedTags: [...] });
 *   editor.on('change', (html) => console.log(html));
 *   editor.destroy();
 */
const SimpleEditor = (() => {

  const DEFAULT_ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'i', 'a', 'u', 'strong', 'pre', 'code', 'em', 'br', 'ul', 'ol', 'li'];

  function mount(element, options = {}) {
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('SimpleEditor.mount requires an HTMLElement');
    }

    const allowedTags = options.allowedTags || DEFAULT_ALLOWED_TAGS;
    const allowedTagSet = new Set(allowedTags);
    const listeners = { change: [], modechange: [] };
    const abortController = new AbortController();
    const signal = abortController.signal;

    element.contentEditable = 'true';
    document.execCommand('defaultParagraphSeparator', false, 'p');

    function emit(event, data) {
      for (const fn of listeners[event] || []) {
        fn(data);
      }
    }

    function notifyChange() {
      emit('change', element.innerHTML);
    }

    function isURL(str) {
      try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }

    // ==========================================
    // PASTE SANITIZATION
    // ==========================================


    /**
     * Sanitizes an HTML string based on allowed tags, attributes, and tag conversions.
     * Unsupported tags are unwrapped, preserving their inner content.
     * * @param {string} htmlString - The dirty HTML string.
     * @param {string[]} allowedTags - Array of allowed tag names (e.g., ['p', 'a', 'strong']).
     * @param {Object} [options={}] - Configuration options.
     * @param {Object} [options.allowedAttributes={}] - Map of tags to allowed attributes (e.g., { a: ['href'] }).
     * @param {Object} [options.tagConversions={}] - Map of tags to convert (e.g., { b: 'strong' }).
     * @returns {string} - The sanitized HTML string.
     */
    function sanitizeHTML(htmlString, allowedTags, options = {}) {
      // Destructure options with defaults
      const { allowedAttributes = {}, tagConversions = {} } = options;

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');


      // PRE PROCESSING

      // Unwrap <span> tags
      const spans = Array.from(doc.querySelectorAll('span'));
      spans.forEach(span => {
        const fragment = doc.createDocumentFragment();
        while (span.firstChild) fragment.appendChild(span.firstChild);
        span.replaceWith(fragment);
      });

      // Smarter <div> handling
      const divs = Array.from(doc.querySelectorAll('div'));
      divs.forEach(div => {
        if (div.querySelector('ul, ol, li, p, div')) {
          const fragment = doc.createDocumentFragment();
          while (div.firstChild) fragment.appendChild(div.firstChild);
          div.replaceWith(fragment);
        } else {
          const p = doc.createElement('p');
          while (div.firstChild) p.appendChild(div.firstChild);
          div.replaceWith(p);
        }
      });

      // Rescue orphaned <li> tags
      const lis = Array.from(doc.querySelectorAll('li'));
      lis.forEach(li => {
        if (li.parentElement && li.parentElement.tagName !== 'UL' && li.parentElement.tagName !== 'OL') {
          const ul = doc.createElement('ul');
          li.before(ul);
          let current = li;
          while (current && current.tagName === 'LI') {
            let next = current.nextElementSibling;
            ul.appendChild(current);
            current = next;
          }
        }
      });

      // Unwrap <p> inside <li>
      const listParagraphs = Array.from(doc.querySelectorAll('li p'));
      listParagraphs.forEach(p => {
        const fragment = doc.createDocumentFragment();
        while (p.firstChild) fragment.appendChild(p.firstChild);
        p.replaceWith(fragment);
      });

      // Unwrap any element not in the allow list
      const allElements = Array.from(doc.body.querySelectorAll('*'));
      for (let idx = allElements.length - 1; idx >= 0; idx--) {
        const el = allElements[idx];
        if (!allowedTagSet.has(el.tagName.toLowerCase())) {
          const fragment = doc.createDocumentFragment();
          while (el.firstChild) fragment.appendChild(el.firstChild);
          el.replaceWith(fragment);
        }
      }

      // add target:_blank to links
      doc.querySelectorAll('a[href]').forEach(a => a.setAttribute('target', '_blank'));


      // Normalize arrays and objects to lowercase for safe comparison
      const safeTags = allowedTags.map(tag => tag.toLowerCase());

      const conversions = Object.entries(tagConversions).reduce((acc, [key, value]) => {
        acc[key.toLowerCase()] = value.toLowerCase();
        return acc;
      }, {});

      function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return document.createTextNode(node.textContent);
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const originalTagName = node.tagName.toLowerCase();

          // Apply conversion if it exists, otherwise use the original tag
          const tagName = conversions[originalTagName] || originalTagName;

          // Case A: The resulting tag is ALLOWED
          if (safeTags.includes(tagName)) {
            const el = document.createElement(tagName);

            // Note: Attributes are validated against the *new* tag name
            const permittedAttrs = allowedAttributes[tagName] || [];

            for (const attr of node.attributes) {
              if (permittedAttrs.includes(attr.name)) {
                // Prevent `javascript:` URIs
                if (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
                  continue;
                }
                el.setAttribute(attr.name, attr.value);
              }
            }

            for (const child of node.childNodes) {
              const processedChild = processNode(child);
              if (processedChild) {
                el.appendChild(processedChild);
              }
            }
            return el;
          }

          // Case B: The resulting tag is NOT ALLOWED (Unwrap)
          else {
            const fragment = document.createDocumentFragment();
            for (const child of node.childNodes) {
              const processedChild = processNode(child);
              if (processedChild) {
                fragment.appendChild(processedChild);
              }
            }
            return fragment;
          }
        }

        return null;
      }

      const resultFragment = document.createDocumentFragment();
      for (const child of doc.body.childNodes) {
        const processedChild = processNode(child);
        if (processedChild) {
          resultFragment.appendChild(processedChild);
        }
      }

      const tempContainer = document.createElement('div');
      tempContainer.appendChild(resultFragment);
      return tempContainer.innerHTML;
    }



    function handlePaste(e) {
      e.preventDefault();

      const plainText = e.clipboardData.getData('text/plain').trim();
      const selection = window.getSelection();

      if (selection.rangeCount > 0 && !selection.isCollapsed && isURL(plainText)) {
        const range = selection.getRangeAt(0);
        const anchor = document.createElement('a');
        anchor.href = plainText;
        anchor.target = '_blank';
        anchor.appendChild(range.extractContents());
        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        notifyChange();
        return;
      }

      let rawData = e.clipboardData.getData('text/html');

      // TODO we should attempt markdown parsing here.
      if (!rawData) {
        rawData = e.clipboardData.getData('text/plain');
        rawData = `<p>${rawData.replace(/\n/g, '<br>')}</p>`;
      }

      let cleanHTML = sanitizeHTML(rawData, allowedTags, {
        allowedAttributes: { a: ['href', 'target'] },
        tagConversions: { strong: 'b', em: 'i' }
      });

      // Context-aware list merging
      if (selection.rangeCount > 0) {
        let cursorNode = selection.getRangeAt(0).startContainer;
        if (cursorNode.nodeType === 3) cursorNode = cursorNode.parentNode;

        if (cursorNode.closest('li')) {
          const temp = document.createElement('div');
          temp.innerHTML = cleanHTML;
          Array.from(temp.children).forEach(child => {
            if (child.tagName === 'UL' || child.tagName === 'OL') {
              child.outerHTML = child.innerHTML;
            }
          });
          cleanHTML = temp.innerHTML;
        }
      }

      // Ensure links open in new tab
      const linkTemp = document.createElement('div');
      linkTemp.innerHTML = cleanHTML;
      linkTemp.querySelectorAll('a[href]').forEach(a => a.setAttribute('target', '_blank'));
      cleanHTML = linkTemp.innerHTML;

      document.execCommand('insertHTML', false, cleanHTML);
      notifyChange();
    }

    // ==========================================
    // KEYDOWN HANDLING
    // ==========================================

    function handleKeydown(e) {
      // Cmd/Ctrl+J opens format modal
      if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const sel = window.getSelection();
        const savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        openFormatModal(savedRange);
        return;
      }

      // Enter key: clean paragraph/list item creation
      if (e.key === 'Enter' && !e.shiftKey) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let range = sel.getRangeAt(0);

        // If there's an active selection, delete its contents first
        if (!range.collapsed) {
          range.deleteContents();
          range = sel.getRangeAt(0);
        }

        let container = range.startContainer;
        const parent = container.nodeType === 3 ? container.parentNode : container;
        const blockElement = parent.closest('li') || parent.closest('p');

        if (blockElement) {
          const tailRange = range.cloneRange();
          tailRange.selectNodeContents(blockElement);
          tailRange.setStart(range.endContainer, range.endOffset);

          // Check if we are at the end of the block element
          if (tailRange.toString().trim().length === 0) {

            // --- NEW LOGIC: Handling empty LI elements (Double Enter) ---
            if (blockElement.tagName.toLowerCase() === 'li' && blockElement.textContent.trim().length === 0) {
              e.preventDefault(); // Stop the browser from creating invalid HTML

              const parentList = blockElement.parentElement; // The immediate UL or OL
              const parentListItem = parentList.closest('li'); // The wrapping LI (if nested)

              // 1. Clean up the current empty LI
              blockElement.remove();

              // 2. If the nested list is now empty, remove it too
              if (parentList.children.length === 0) {
                parentList.remove();
              }

              if (parentListItem) {
                // SCENARIO A: We are in a nested list
                // Step out one level by creating a new LI after the parent LI
                const newLi = document.createElement('li');
                newLi.innerHTML = '<br>';

                if (parentListItem.nextSibling) {
                  parentListItem.parentNode.insertBefore(newLi, parentListItem.nextSibling);
                } else {
                  parentListItem.parentNode.appendChild(newLi);
                }

                // Move cursor to the new list item
                sel.removeAllRanges();
                const newRange = document.createRange();
                newRange.setStart(newLi, 0);
                newRange.collapse(true);
                sel.addRange(newRange);

              } else {
                // SCENARIO B: We are at the top-level list
                // Break out of the list entirely into a new paragraph
                const p = document.createElement('p');
                p.innerHTML = '<br>';

                if (parentList.nextSibling) {
                  parentList.parentNode.insertBefore(p, parentList.nextSibling);
                } else {
                  parentList.parentNode.appendChild(p);
                }

                // Move cursor to the new paragraph
                sel.removeAllRanges();
                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                sel.addRange(newRange);
              }

              return;
            }
            // --- END NEW LOGIC ---

            // Normal Enter behavior for populated LIs or Ps
            e.preventDefault();
            const newTagName = blockElement.tagName.toLowerCase();
            const newBlock = document.createElement(newTagName);
            newBlock.innerHTML = '<br>';

            if (blockElement.nextSibling) {
              blockElement.parentNode.insertBefore(newBlock, blockElement.nextSibling);
            } else {
              blockElement.parentNode.appendChild(newBlock);
            }

            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStart(newBlock, 0);
            newRange.collapse(true);
            sel.addRange(newRange);
          }
        }
      }
    }

    // ==========================================
    // INPUT HANDLING (list creation, format trigger)
    // ==========================================

    function handleInput(event) {
      // List creation with "-"
      if (event.inputType === 'insertText' && event.data === '-') {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        let container = range.startContainer;

        while (container && container.nodeType !== 1) {
          container = container.parentNode;
        }
        if (!container) return;

        if (container.textContent.replace('\u200B', '') === '-') {
          container.textContent = '';

          const ul = document.createElement('ul');
          const li = document.createElement('li');
          ul.appendChild(li);

          if (container.tagName === 'P') {
            container.parentNode.replaceChild(ul, container);
          } else if (container.tagName === 'LI') {
            const prevLi = container.previousElementSibling;
            container.parentNode.removeChild(container);
            if (prevLi) {
              prevLi.appendChild(ul);
            } else {
              container.parentNode.parentNode.insertBefore(ul, container.parentNode.nextSibling);
            }
          } else {
            range.insertNode(ul);
          }

          const newRange = document.createRange();
          newRange.selectNodeContents(li);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          notifyChange();
          return;
        }
      }

      // ".f." trigger for format modal
      if (event.inputType === 'insertText' || event.inputType === 'insertCompositionText') {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        let container = range.startContainer;

        if (container.nodeType === 3) {
          const text = container.textContent;
          const offset = range.startOffset;

          if (offset >= 3 && text.substring(offset - 3, offset) === '.f.') {
            sel.removeAllRanges();
            const deleteRange = document.createRange();
            deleteRange.setStart(container, offset - 3);
            deleteRange.setEnd(container, offset);
            sel.addRange(deleteRange);
            document.execCommand('delete', false, null);

            const savedSel = window.getSelection();
            const savedRange = savedSel.rangeCount > 0 ? savedSel.getRangeAt(0).cloneRange() : null;
            openFormatModal(savedRange);
            return;
          }
        }
      }

      ensureParagraphWrapper();
      notifyChange();
    }

    function ensureParagraphWrapper() {
      if (element.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, pre')) return;

      const sel = window.getSelection();

      if (!element.textContent && !element.querySelector('br')) {
        element.innerHTML = '<p><br></p>';
        const newRange = document.createRange();
        newRange.setStart(element.firstChild, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        return;
      }

      let cursorOffset = null;
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (element.contains(range.startContainer)) {
          cursorOffset = range.startOffset;
        }
      }

      const p = document.createElement('p');
      while (element.firstChild) {
        p.appendChild(element.firstChild);
      }
      element.appendChild(p);

      if (cursorOffset !== null) {
        const newRange = document.createRange();
        const textNode = p.firstChild;
        if (textNode && textNode.nodeType === 3) {
          newRange.setStart(textNode, Math.min(cursorOffset, textNode.length));
          newRange.collapse(true);
        } else {
          newRange.selectNodeContents(p);
          newRange.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    // ==========================================
    // FORMAT MODAL
    // ==========================================

    function openFormatModal(savedRange) {
      // Detect if cursor is inside a link
      let existingLink = null;
      if (savedRange) {
        let node = savedRange.startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        existingLink = node.closest('a');
      }

      const overlay = document.createElement('div');
      overlay.className = 'format-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'format-modal';

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const commands = { b: 'bold', i: 'italic', u: 'underline' };

      function close() {
        overlay.remove();
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        notifyChange();
      }

      function showLinkForm(linkEl) {
        modal.innerHTML = '';

        const linkLabel = document.createElement('label');
        linkLabel.textContent = linkEl ? 'Edit link' : 'Insert link';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = 'Link text';
        if (linkEl) textInput.value = linkEl.textContent;

        const hrefInput = document.createElement('input');
        hrefInput.type = 'text';
        hrefInput.placeholder = 'https://...';
        if (linkEl) hrefInput.value = linkEl.getAttribute('href') || '';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = 'Cancel';

        modal.appendChild(linkLabel);
        modal.appendChild(textInput);
        modal.appendChild(hrefInput);
        modal.appendChild(cancelBtn);

        requestAnimationFrame(() => textInput.focus());

        function insertLink() {
          const text = textInput.value.trim();
          const href = hrefInput.value.trim();
          if (!text || !href) return;

          if (linkEl) {
            linkEl.setAttribute('href', href);
            linkEl.setAttribute('target', '_blank');
            linkEl.textContent = text;
            close();
            notifyChange();
          } else {
            close();
            const sanitizedText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const linkHTML = `<a href="${href.replace(/"/g, '&quot;')}" target="_blank">${sanitizedText}</a>`;
            document.execCommand('insertHTML', false, linkHTML);
            notifyChange();
          }
        }

        function onKeydown(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            insertLink();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }

        textInput.addEventListener('keydown', onKeydown);
        hrefInput.addEventListener('keydown', onKeydown);
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          close();
        });
      }

      // If cursor is inside a link, go straight to link editing
      if (existingLink) {
        showLinkForm(existingLink);
        return;
      }

      // Normal format modal UI
      const label = document.createElement('label');
      label.textContent = 'b = bold, i = italic, u = underline, l = link, h1\u2013h6 = heading, e = exit formatting, clear = clear all';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'b / i / u / l / h1-h6 / e';

      modal.appendChild(label);
      modal.appendChild(input);

      requestAnimationFrame(() => input.focus());

      function apply() {
        const val = input.value.trim().toLowerCase();

        if (val === 'l') {
          showLinkForm(null);
          return;
        }

        if (val === 'clear') {
          overlay.remove();
          element.innerHTML = '<p><br></p>';
          const sel = window.getSelection();
          const newRange = document.createRange();
          newRange.setStart(element.firstChild, 0);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          notifyChange();
          return;
        }

        const headingMatch = val.match(/^h([1-6])$/);
        if (headingMatch) {
          close();
          const sel = window.getSelection();
          if (!sel.rangeCount) return;
          let block = sel.getRangeAt(0).startContainer;
          if (block.nodeType === 3) block = block.parentNode;
          while (block && block !== element && !['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.tagName.toLowerCase())) {
            block = block.parentNode;
          }
          if (block && block !== element) {
            const heading = document.createElement('h' + headingMatch[1]);
            heading.innerHTML = block.innerHTML;
            block.parentNode.replaceChild(heading, block);
            const newRange = document.createRange();
            newRange.selectNodeContents(heading);
            newRange.collapse(false);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
          notifyChange();
          return;
        }

        close();
        element.focus();

        if (commands[val]) {
          document.execCommand(commands[val], false, null);
        } else if (val === 'e') {
          const sel = window.getSelection();
          if (!sel.rangeCount) return;

          const formattingCmds = ['bold', 'italic', 'underline'];

          if (!sel.getRangeAt(0).collapsed) {
            const range = sel.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const root = container.nodeType === 3 ? container.parentNode : container;

            const formattingTags = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline' };
            const cmdsToRemove = new Set();

            // Check if any ancestor of the selection is a formatting element
            let ancestor = root;
            while (ancestor && ancestor !== element) {
              const tag = ancestor.tagName && ancestor.tagName.toLowerCase();
              if (formattingTags[tag]) cmdsToRemove.add(formattingTags[tag]);
              ancestor = ancestor.parentNode;
            }

            // Check for formatting elements within the selection
            if (root.querySelectorAll) {
              root.querySelectorAll('b, strong, i, em, u').forEach(el => {
                if (range.intersectsNode(el)) {
                  cmdsToRemove.add(formattingTags[el.tagName.toLowerCase()]);
                }
              });
            }

            // execCommand is a toggle with no "remove only" mode.
            // When a selection is partially formatted (e.g. "hello <b>world</b> foo"),
            // queryCommandState returns false and a single execCommand call would
            // APPLY bold to everything instead of removing it.
            // So we call it twice: once to normalize (all bold), once to remove (all plain).
            // If the selection is already fully formatted, one call suffices.
            for (const cmd of cmdsToRemove) {
              if (!document.queryCommandState(cmd)) {
                document.execCommand(cmd, false, null);
              }
              document.execCommand(cmd, false, null);
            }
          } else {
            // Collapsed cursor: walk up the DOM to find active formatting
            let node = sel.getRangeAt(0).startContainer;
            if (node.nodeType === 3) node = node.parentNode;

            const activeCommands = new Set();
            while (node && node !== element) {
              const tag = node.tagName && node.tagName.toLowerCase();
              if (tag === 'strong' || tag === 'b') activeCommands.add('bold');
              if (tag === 'em' || tag === 'i') activeCommands.add('italic');
              if (tag === 'u') activeCommands.add('underline');
              node = node.parentNode;
            }
            for (const cmd of activeCommands) {
              document.execCommand(cmd, false, null);
            }
          }
        }
        notifyChange();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      });

      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) {
          e.preventDefault();
          close();
        }
      });
    }

    // ==========================================
    // SELECTION TRACKING
    // ==========================================

    // Keep track of the last known selection within the editor so that
    // external toolbar buttons can act on it even after focus moves away.
    let lastSavedRange = null;

    function handleSelectionChange() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) {
        lastSavedRange = range.cloneRange();
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange, { signal });

    // ==========================================
    // WIRE UP EVENT LISTENERS
    // ==========================================

    element.addEventListener('paste', handlePaste, { signal });
    element.addEventListener('keydown', handleKeydown, { signal });
    element.addEventListener('input', handleInput, { signal });

    // ==========================================
    // PUBLIC INSTANCE API
    // ==========================================

    const instance = {
      element,

      get mode() {
        return element.contentEditable === 'true' ? 'edit' : 'read';
      },

      setMode(mode) {
        if (mode !== 'edit' && mode !== 'read') {
          throw new Error('Mode must be "edit" or "read"');
        }
        element.contentEditable = mode === 'edit' ? 'true' : 'false';
        if (mode === 'edit') element.focus();
        emit('modechange', instance.mode);
        return this;
      },

      toggleMode() {
        return instance.setMode(instance.mode === 'edit' ? 'read' : 'edit');
      },

      on(event, fn) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
        return this;
      },

      off(event, fn) {
        if (!listeners[event]) return this;
        listeners[event] = listeners[event].filter(f => f !== fn);
        return this;
      },

      openFormatModal() {
        openFormatModal(lastSavedRange);
        return this;
      },

      getContent() {
        return element.innerHTML;
      },

      setContent(html) {
        element.innerHTML = html;
        notifyChange();
      },

      destroy() {
        abortController.abort();
        element.contentEditable = 'false';
      }
    };

    return instance;
  }

  // HELPERS


  /**
   * Recursively converts a DOM node into a custom JSON structure.
   * Filters out whitespace-only text nodes (like \n).
   * * @param {Node} node - The DOM element or text node to convert.
   * @returns {Object|string|null} The JSON object, a text string, or null for ignored nodes.
   */
  function domToJson(node) {
    // 1. Handle Text Nodes
    if (node.nodeType === Node.TEXT_NODE) {
      // If the text node is purely whitespace, line breaks, or tabs, ignore it
      if (node.nodeValue.trim() === '') {
        return null;
      }
      // Return the original text (preserving inline spaces between words)
      return node.nodeValue;
    }

    // 2. Handle Element Nodes (div, span, p, b, etc.)
    if (node.nodeType === Node.ELEMENT_NODE) {
      const obj = {
        t: node.tagName.toLowerCase(),
        a: [],
        c: []
      };

      // Extract Attributes
      if (node.hasAttributes()) {
        for (const attr of node.attributes) {
          obj.a.push({ name: attr.name, value: attr.value });
        }
      }

      // Extract Children recursively
      if (node.hasChildNodes()) {
        for (const child of node.childNodes) {
          const childJson = domToJson(child);
          // Ignore null returns (filtered text nodes, comments, etc.)
          if (childJson !== null) {
            obj.c.push(childJson);
          }
        }
      }

      return obj;
    }

    // 3. Ignore Comments and other non-essential node types
    return null;
  }

  /**
   * Helper function to convert raw HTML strings directly to JSON.
   * * @param {string} htmlString - The innerHTML string you want to convert.
   */
  function htmlStringToJson(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();

    const result = [];
    for (const child of template.content.childNodes) {
      const parsed = domToJson(child);
      if (parsed !== null) {
        result.push(parsed);
      }
    }

    // Return a single object if there's exactly one root node, otherwise return the array
    return result.length === 1 ? result[0] : result;
  }


  /**
   * Recursively converts your custom JSON AST back into live DOM nodes.
   * @param {Object|string|Array} json - The JSON AST to convert.
   * @returns {Node|DocumentFragment|null} The constructed DOM node.
   */
  function jsonToDom(json) {
    // 1. Handle Arrays (Multiple root elements)
    if (Array.isArray(json)) {
      const fragment = document.createDocumentFragment();
      for (const item of json) {
        const node = jsonToDom(item);
        if (node) fragment.appendChild(node);
      }
      return fragment;
    }

    // 2. Handle Text Nodes
    if (typeof json === 'string') {
      return document.createTextNode(json);
    }

    // 3. Handle Element Nodes
    if (typeof json === 'object' && json !== null) {
      // Create the base element
      const el = document.createElement(json.t);

      // Apply attributes
      if (json.a && Array.isArray(json.a)) {
        for (const attr of json.a) {
          el.setAttribute(attr.name, attr.value);
        }
      }

      // Append children recursively
      if (json.c && Array.isArray(json.c)) {
        for (const childJson of json.c) {
          const childNode = jsonToDom(childJson);
          if (childNode) {
            el.appendChild(childNode);
          }
        }
      }

      return el;
    }

    // Fallback for invalid data
    return null;
  }

  /**
   * Helper function to convert your JSON AST directly into a raw HTML string.
   * @param {Object|string|Array} json - The JSON AST.
   * @returns {string} The reconstructed HTML string.
   */
  function jsonToHtmlString(json) {
    const node = jsonToDom(json);

    if (!node) return '';

    // DocumentFragments don't have an outerHTML property, 
    // so we append it to a temporary container to read the innerHTML.
    if (node instanceof DocumentFragment) {
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(node);
      return tempDiv.innerHTML;
    }

    // Regular Elements
    if (node instanceof Element) {
      return node.outerHTML;
    }

    // Pure Text Nodes
    if (node instanceof Text) {
      // Escaping might be necessary here depending on your security needs,
      // but for exact restoration, textContent/nodeValue works.
      return node.nodeValue;
    }

    return '';
  }


  return { mount, jsonToHtmlString, htmlStringToJson };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleEditor;
}
