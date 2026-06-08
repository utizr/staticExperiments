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

    // ==========================================
    // PASTE SANITIZATION
    // ==========================================

    function handlePaste(e) {
      e.preventDefault();

      let rawData = e.clipboardData.getData('text/html');

      if (!rawData) {
        rawData = e.clipboardData.getData('text/plain');
        rawData = `<p>${rawData.replace(/\n/g, '<br>')}</p>`;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawData, 'text/html');

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

      const preProcessedHTML = doc.body.innerHTML;

      // Sanitization
      let cleanHTML = '';
      if (typeof Sanitizer !== 'undefined' && Element.prototype.setHTML) {
        const tempDiv = document.createElement('div');
        const mySanitizer = new Sanitizer({
          elements: allowedTags,
          attributes: [{ name: 'href', elements: ['a'] }, { name: 'target', elements: ['a'] }]
        });
        tempDiv.setHTML(preProcessedHTML, { sanitizer: mySanitizer });
        cleanHTML = tempDiv.innerHTML;
      } else if (typeof DOMPurify !== 'undefined') {
        cleanHTML = DOMPurify.sanitize(preProcessedHTML, {
          ALLOWED_TAGS: allowedTags,
          ALLOWED_ATTR: ['href', 'target']
        });
      } else {
        cleanHTML = preProcessedHTML;
      }

      // Context-aware list merging
      const selection = window.getSelection();
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
      // Cmd/Ctrl+E opens format modal
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

          if (tailRange.toString().trim().length === 0) {
            if (blockElement.tagName.toLowerCase() === 'li' && blockElement.textContent.trim().length === 0) {
              return;
            }

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

      notifyChange();
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
            const sanitizedText = typeof DOMPurify !== 'undefined'
              ? DOMPurify.sanitize(text, { ALLOWED_TAGS: [] })
              : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  return { mount };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleEditor;
}
