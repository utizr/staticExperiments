/**
 * SimpleEditor — A lightweight, dependency-free WYSIWYG editor.
 *
 * Turns any HTMLElement into a contentEditable rich-text surface with:
 *   - Paste sanitization (delegates to Converter.sanitizeHTML from converter.js)
 *   - Keyboard-driven formatting via a modal (Cmd/Ctrl+J or ".f." trigger)
 *   - Auto list creation (type "-" at the start of a line)
 *   - Notion-style block drag & drop (requires DragDrop from dragndrop.js)
 *
 * Dependencies (loaded before this script):
 *   - lib/dragndrop.js  → DragDrop
 *   - lib/converter.js  → Converter (sanitizeHTML, DOM↔JSON helpers)
 *
 * Usage:
 *   const editor = SimpleEditor.mount(document.getElementById('my-div'), { allowedTags: [...] });
 *   editor.on('change', (html) => console.log(html));
 *   editor.destroy();
 */
const SimpleEditor = (() => {

  const DEFAULT_ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'b', 'i', 'a', 'u', 'strong', 'em',
    'pre', 'code', 'br',
    'ul', 'ol', 'li',
  ];

  // ════════════════════════════════════════════
  //  mount() — Main entry point
  // ════════════════════════════════════════════

  function mount(element, options = {}) {
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('SimpleEditor.mount requires an HTMLElement');
    }

    const allowedTags = options.allowedTags || DEFAULT_ALLOWED_TAGS;

    // Event bus: maps event names → arrays of listener functions.
    const listeners = { change: [], modechange: [] };

    // A single AbortController governs every event listener the editor
    // registers. Calling abort() in destroy() removes them all at once.
    const abortController = new AbortController();
    const signal = abortController.signal;

    element.contentEditable = 'true';

    // Tell the browser to wrap bare text in <p> tags (not <div>) on Enter.
    document.execCommand('defaultParagraphSeparator', false, 'p');

    // ── Event helpers ──────────────────────────

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

    // ════════════════════════════════════════════
    //  Paste Handling
    // ════════════════════════════════════════════

    function handlePaste(e) {
      e.preventDefault();

      const plainText = e.clipboardData.getData('text/plain').trim();
      const selection = window.getSelection();

      // ── URL-over-selection: wrap selected text in a link ──
      // If the user has text selected and pastes a URL, turn the selection
      // into an anchor instead of replacing it with the URL text.
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

      // ── HTML paste (with plain-text fallback) ──
      let rawHTML = e.clipboardData.getData('text/html');

      if (!rawHTML) {
        // No HTML on the clipboard — treat plain text as a paragraph,
        // converting newlines to <br> so line breaks are preserved.
        // TODO: attempt markdown parsing here for richer results.
        rawHTML = `<p>${plainText.replace(/\n/g, '<br>')}</p>`;
      }

      let cleanHTML = Converter.sanitizeHTML(rawHTML, allowedTags, {
        allowedAttributes: { a: ['href', 'target'] },
        tagConversions: { strong: 'b', em: 'i' },
      });

      // ── Context-aware list merging ──
      // When pasting inside a list item, strip the outer <ul>/<ol> wrapper
      // so the pasted items merge into the existing list instead of nesting.
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

      // Ensure every link opens in a new tab (belt-and-suspenders).
      const linkTemp = document.createElement('div');
      linkTemp.innerHTML = cleanHTML;
      linkTemp.querySelectorAll('a[href]').forEach(a => a.setAttribute('target', '_blank'));
      cleanHTML = linkTemp.innerHTML;

      document.execCommand('insertHTML', false, cleanHTML);
      notifyChange();
    }

    // ════════════════════════════════════════════
    //  Keyboard Handling (keydown)
    // ════════════════════════════════════════════

    function handleKeydown(e) {
      // ── Cmd/Ctrl+J → open the format modal ──
      if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const sel = window.getSelection();
        const savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        openFormatModal(savedRange);
        return;
      }

      // ── Enter key — custom paragraph/list splitting ──
      // We intercept Enter (without Shift) so we can:
      //   • create clean new <p> or <li> elements (no leftover <br><div>),
      //   • handle double-Enter in an empty <li> to break out of the list.
      if (e.key === 'Enter' && !e.shiftKey) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let range = sel.getRangeAt(0);

        // Delete the selected content first (if any) before splitting.
        if (!range.collapsed) {
          range.deleteContents();
          range = sel.getRangeAt(0);
        }

        const container = range.startContainer;
        const parent = container.nodeType === 3 ? container.parentNode : container;
        const blockElement = parent.closest('li') || parent.closest('p');

        if (!blockElement) return;

        // Build a range covering everything *after* the cursor to the end
        // of the current block. If that tail is empty, the cursor is at the
        // very end of the block.
        const tailRange = range.cloneRange();
        tailRange.selectNodeContents(blockElement);
        tailRange.setStart(range.endContainer, range.endOffset);
        const cursorAtEnd = tailRange.toString().trim().length === 0;

        if (!cursorAtEnd) return; // let the browser handle mid-block Enter

        // ── Double-Enter in an empty <li>: break out of the list ──
        if (blockElement.tagName.toLowerCase() === 'li' && blockElement.textContent.trim().length === 0) {
          e.preventDefault();

          const parentList = blockElement.parentElement;       // immediate <ul>/<ol>
          const parentListItem = parentList.closest('li');     // wrapping <li> if nested

          blockElement.remove();
          if (parentList.children.length === 0) parentList.remove();

          if (parentListItem) {
            // Nested list → step out one level by appending a new <li>
            // after the parent list item.
            const newLi = document.createElement('li');
            newLi.innerHTML = '<br>';

            if (parentListItem.nextSibling) {
              parentListItem.parentNode.insertBefore(newLi, parentListItem.nextSibling);
            } else {
              parentListItem.parentNode.appendChild(newLi);
            }

            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStart(newLi, 0);
            newRange.collapse(true);
            sel.addRange(newRange);
          } else {
            // Top-level list → break out into a new <p>.
            const p = document.createElement('p');
            p.innerHTML = '<br>';

            if (parentList.nextSibling) {
              parentList.parentNode.insertBefore(p, parentList.nextSibling);
            } else {
              parentList.parentNode.appendChild(p);
            }

            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.setStart(p, 0);
            newRange.collapse(true);
            sel.addRange(newRange);
          }
          return;
        }

        // ── Normal end-of-block Enter: create a new sibling block ──
        e.preventDefault();
        const newBlock = document.createElement(blockElement.tagName.toLowerCase());
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

    // ════════════════════════════════════════════
    //  Input Handling (auto-list, format trigger)
    // ════════════════════════════════════════════

    function handleInput(event) {

      // ── Auto-list creation ──
      // Typing "-" as the only content of a block converts it into a <ul>.
      // This mimics the Notion/Bear shortcut for quickly starting a list.
      if (event.inputType === 'insertText' && event.data === '-') {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);

        // Walk up from the cursor to the nearest element node.
        let container = range.startContainer;
        while (container && container.nodeType !== 1) container = container.parentNode;
        if (!container) return;

        // Only trigger if the block's entire visible text is just "-".
        const textWithoutZWSP = container.textContent.replace('\u200B', '');
        if (textWithoutZWSP === '-') {
          container.textContent = '';

          const ul = document.createElement('ul');
          const li = document.createElement('li');
          ul.appendChild(li);

          if (container.tagName === 'P') {
            // Replace the paragraph with the new list.
            container.parentNode.replaceChild(ul, container);
          } else if (container.tagName === 'LI') {
            // Inside an existing list — nest a sub-list under the
            // previous sibling, or insert after the parent list.
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

      // ── ".f." trigger for format modal ──
      // Typing ".f." anywhere opens the format modal (handy on mobile or
      // when you don't want to reach for Cmd+J).  The three characters are
      // deleted before the modal opens.
      if (event.inputType === 'insertText' || event.inputType === 'insertCompositionText') {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const container = range.startContainer;

        if (container.nodeType === 3) {
          const text = container.textContent;
          const offset = range.startOffset;

          if (offset >= 3 && text.substring(offset - 3, offset) === '.f.') {
            // Select the ".f." characters and delete them.
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

    /**
     * Guarantees the editor always has at least one block-level wrapper.
     *
     * Browsers can leave bare text nodes directly inside the contentEditable
     * root (e.g. after deleting the last paragraph). This wraps any stray
     * content in a <p> so the DOM stays consistent and Enter handling works.
     */
    function ensureParagraphWrapper() {
      // Already has block content — nothing to do.
      if (element.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, pre')) return;

      const sel = window.getSelection();

      // Editor is completely empty — seed it with an empty paragraph.
      if (!element.textContent && !element.querySelector('br')) {
        element.innerHTML = '<p><br></p>';
        const newRange = document.createRange();
        newRange.setStart(element.firstChild, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        return;
      }

      // There's loose text — wrap it in <p> and restore the cursor position.
      let cursorOffset = null;
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (element.contains(range.startContainer)) {
          cursorOffset = range.startOffset;
        }
      }

      const p = document.createElement('p');
      while (element.firstChild) p.appendChild(element.firstChild);
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

    // ════════════════════════════════════════════
    //  Format Modal
    // ════════════════════════════════════════════
    //
    // A lightweight modal that accepts single-key commands:
    //   b = bold,  i = italic,  u = underline,  l = link,
    //   h1–h6 = convert block to heading,  e = exit/remove formatting,
    //   clear = wipe entire editor content.
    //
    // The modal restores the user's original selection on close so that
    // formatting commands apply to the right text.

    function openFormatModal(savedRange) {
      // If the cursor is already inside a link, jump straight to
      // the link-editing form instead of showing the command menu.
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

      // Maps single-key shortcuts to execCommand names.
      const inlineCommands = { b: 'bold', i: 'italic', u: 'underline' };

      /** Close the modal and restore the saved selection. */
      function close() {
        overlay.remove();
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        notifyChange();
      }

      // ── Link editing sub-form ──────────────────

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
            // Update the existing link in-place.
            linkEl.setAttribute('href', href);
            linkEl.setAttribute('target', '_blank');
            linkEl.textContent = text;
            close();
            notifyChange();
          } else {
            // Insert a brand-new link at the saved cursor position.
            close();
            const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeHref = href.replace(/"/g, '&quot;');
            document.execCommand('insertHTML', false,
              `<a href="${safeHref}" target="_blank">${safeText}</a>`);
            notifyChange();
          }
        }

        function onKeydown(e) {
          if (e.key === 'Enter') { e.preventDefault(); insertLink(); }
          else if (e.key === 'Escape') { e.preventDefault(); close(); }
        }

        textInput.addEventListener('keydown', onKeydown);
        hrefInput.addEventListener('keydown', onKeydown);
        cancelBtn.addEventListener('click', (e) => { e.preventDefault(); close(); });
      }

      // If the cursor is inside a link, skip the command menu entirely.
      if (existingLink) {
        showLinkForm(existingLink);
        return;
      }

      // ── Command menu UI ────────────────────────

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

        // "l" → switch to the link form.
        if (val === 'l') {
          showLinkForm(null);
          return;
        }

        // "clear" → wipe editor content and start fresh.
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

        // "h1"–"h6" → convert the enclosing block to a heading.
        const headingMatch = val.match(/^h([1-6])$/);
        if (headingMatch) {
          close();
          const sel = window.getSelection();
          if (!sel.rangeCount) return;

          // Walk up from the cursor to find the nearest replaceable block.
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

        // Apply inline formatting or remove all formatting ("e").
        close();
        element.focus();

        if (inlineCommands[val]) {
          document.execCommand(inlineCommands[val], false, null);

        } else if (val === 'e') {
          removeFormattingAroundCursor();
        }

        notifyChange();
      }

      /**
       * Removes all inline formatting (bold/italic/underline) from the
       * current selection or, if the cursor is collapsed, toggles off any
       * formatting inherited from ancestor elements.
       *
       * execCommand is a toggle with no "remove only" mode.  When a
       * selection is *partially* formatted (e.g. "hello <b>world</b> foo"),
       * queryCommandState returns false and a single execCommand call would
       * APPLY bold everywhere. We work around this by calling it twice:
       * once to normalize (apply to all), once to remove.
       */
      function removeFormattingAroundCursor() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const FORMATTING_TAGS = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline' };

        if (!sel.getRangeAt(0).collapsed) {
          // Selection exists — detect which formatting commands are active.
          const range = sel.getRangeAt(0);
          const root = range.commonAncestorContainer;
          const rootEl = root.nodeType === 3 ? root.parentNode : root;
          const cmdsToRemove = new Set();

          // Check ancestors of the selection root.
          let ancestor = rootEl;
          while (ancestor && ancestor !== element) {
            const tag = ancestor.tagName && ancestor.tagName.toLowerCase();
            if (FORMATTING_TAGS[tag]) cmdsToRemove.add(FORMATTING_TAGS[tag]);
            ancestor = ancestor.parentNode;
          }

          // Check formatting elements *within* the selection.
          if (rootEl.querySelectorAll) {
            rootEl.querySelectorAll('b, strong, i, em, u').forEach(el => {
              if (range.intersectsNode(el)) {
                cmdsToRemove.add(FORMATTING_TAGS[el.tagName.toLowerCase()]);
              }
            });
          }

          // Double-toggle trick: normalize then remove.
          for (const cmd of cmdsToRemove) {
            if (!document.queryCommandState(cmd)) document.execCommand(cmd, false, null);
            document.execCommand(cmd, false, null);
          }
        } else {
          // Collapsed cursor — walk up the DOM to find active formatting
          // and toggle each one off.
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

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      });

      // Clicking the overlay backdrop closes the modal.
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) { e.preventDefault(); close(); }
      });
    }

    // ════════════════════════════════════════════
    //  Selection Tracking
    // ════════════════════════════════════════════

    // Persist the last known selection within the editor so that external
    // toolbar buttons (or the format modal) can act on it even after the
    // editor loses focus.
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

    // ════════════════════════════════════════════
    //  Register Core Event Listeners
    // ════════════════════════════════════════════

    element.addEventListener('paste', handlePaste, { signal });
    element.addEventListener('keydown', handleKeydown, { signal });
    element.addEventListener('input', handleInput, { signal });

    // ════════════════════════════════════════════
    //  Block Drag & Drop (Notion-style)
    // ════════════════════════════════════════════
    //
    // Each top-level block (<p>, <h*>, <li>, <ul>, <ol>, <pre>) gets a
    // drag handle that appears on hover.  Dragging a block repositions it
    // within the editor, automatically converting between <li> and <p>
    // when dropping across list/non-list boundaries.

    const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'li']);

    // Six-dot "grip" icon (Notion-style drag handle).
    const DRAG_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>`;

    const blockHandle = document.createElement('div');
    blockHandle.className = 'editor-block-handle';
    blockHandle.innerHTML = DRAG_ICON;
    Object.assign(blockHandle.style, {
      position: 'fixed', display: 'none', opacity: '0',
      transition: 'opacity 0.15s',
      zIndex: '10', cursor: 'grab', touchAction: 'none', userSelect: 'none',
    });
    document.body.appendChild(blockHandle);

    let hoveredBlock = null;
    let hideHandleTimer = null;

    /** Walk from `node` up toward the editor root, returning the first
     *  element whose tag is in BLOCK_TAGS (i.e. a draggable block). */
    function findBlock(node) {
      while (node && node !== element) {
        if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName.toLowerCase())) return node;
        node = node.parentNode;
      }
      return null;
    }

    /** Positions the drag handle to the left of the given block. */
    function positionHandle(block) {
      const rect = block.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(block).lineHeight) || 24;
      blockHandle.style.left = (rect.left - 22) + 'px';
      blockHandle.style.top = (rect.top + (lineHeight - 18) / 2) + 'px';
      blockHandle.style.display = 'flex';
      blockHandle.style.opacity = '1';
    }

    function showHandle(block) {
      clearTimeout(hideHandleTimer);
      hoveredBlock = block;
      positionHandle(block);
    }

    function scheduleHideHandle() {
      clearTimeout(hideHandleTimer);
      hideHandleTimer = setTimeout(() => {
        blockHandle.style.opacity = '0';
        blockHandle.style.display = 'none';
        hoveredBlock = null;
      }, 150);
    }

    element.addEventListener('mousemove', (e) => {
      if (element.contentEditable !== 'true') return;
      if (blockDnd.active) return;
      const block = findBlock(e.target);
      if (block && block !== hoveredBlock) showHandle(block);
    }, { signal });

    element.addEventListener('mouseleave', () => {
      if (!blockDnd.active) scheduleHideHandle();
    }, { signal });

    element.addEventListener('scroll', () => {
      if (hoveredBlock && !blockDnd.active) positionHandle(hoveredBlock);
    }, { signal });

    blockHandle.addEventListener('mouseenter', () => clearTimeout(hideHandleTimer));
    blockHandle.addEventListener('mouseleave', () => {
      if (!blockDnd.active) scheduleHideHandle();
    });

    /** Insert `el` before or after `ref` depending on `position`. */
    function insertAtPosition(el, ref, position) {
      const next = position === 'before' ? ref : ref.nextSibling;
      if (next) ref.parentNode.insertBefore(el, next);
      else ref.parentNode.appendChild(el);
    }

    /** Find the editor child block whose vertical centre is closest to `y`,
     *  ignoring `exclude` (the block being dragged). */
    function nearestBlockByY(y, exclude) {
      let best = null;
      let bestDist = Infinity;
      for (const child of element.children) {
        const tag = child.tagName.toLowerCase();
        if (!BLOCK_TAGS.has(tag)) continue;
        const items = (tag === 'ul' || tag === 'ol')
          ? [child, ...child.querySelectorAll('li')]
          : [child];
        for (const b of items) {
          if (b === exclude) continue;
          const r = b.getBoundingClientRect();
          const d = Math.abs(y - (r.top + r.height / 2));
          if (d < bestDist) { bestDist = d; best = b; }
        }
      }
      return best;
    }

    // Wire up the DragDrop helper (from dragndrop.js) to handle the actual
    // pointer tracking, placeholder rendering, and drop callbacks.
    const blockDnd = new DragDrop({
      container: element,

      onDragStart: () => {
        blockHandle.style.opacity = '0';
        blockHandle.style.display = 'none';
      },

      onDragEnd: () => { hoveredBlock = null; },

      /** Determine which block the cursor is hovering over and whether
       *  the drop should go above or below it. */
      resolveDropTarget: (e, meta) => {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (!hit) return null;

        let block = findBlock(hit);

        // If the pointer is inside the editor but not directly over a block,
        // snap to the nearest block by vertical distance.
        if (!block && element.contains(hit)) {
          block = nearestBlockByY(e.clientY, meta.el);
        }

        if (!block || block === meta.el || meta.el.contains(block)) return null;

        const rect = block.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + rect.height / 2;
        return { el: block, position: isAbove ? 'before' : 'after' };
      },

      /** Execute the drop — handles <li>↔<p> conversion automatically. */
      onDrop: (meta, target) => {
        const src = meta.el;
        const dst = target.el;
        const pos = target.position;
        const srcTag = src.tagName.toLowerCase();
        const dstTag = dst.tagName.toLowerCase();
        const srcIsLi = srcTag === 'li';
        const dstIsLi = dstTag === 'li';

        // Detach the source element and clean up any emptied list.
        const srcList = srcIsLi ? src.parentElement : null;
        src.remove();
        if (srcList && srcList.children.length === 0) srcList.remove();

        if (dstIsLi) {
          // Dropping onto a list item → ensure src becomes a <li>.
          const li = srcIsLi ? src : document.createElement('li');
          if (!srcIsLi) li.innerHTML = src.innerHTML;
          insertAtPosition(li, dst, pos);
        } else if (dstTag === 'ul' || dstTag === 'ol') {
          // Dropping onto a list container → append as a <li>.
          const li = srcIsLi ? src : document.createElement('li');
          if (!srcIsLi) li.innerHTML = src.innerHTML;
          if (pos === 'before' && dst.firstChild) {
            dst.insertBefore(li, dst.firstChild);
          } else {
            dst.appendChild(li);
          }
        } else {
          // Dropping onto a non-list block → ensure src becomes a <p>.
          if (srcIsLi) {
            const p = document.createElement('p');
            p.innerHTML = src.innerHTML;
            insertAtPosition(p, dst, pos);
          } else {
            insertAtPosition(src, dst, pos);
          }
        }

        notifyChange();
      },
    });

    // Initiate a drag when the user presses down on the handle.
    // `hoveredBlock` is set by the mousemove listener above and tracks
    // which block the handle is currently attached to.  We pass it to
    // DragDrop.start() both as drag metadata ({ el }) and as the DOM
    // element to visually ghost during the drag.
    blockHandle.addEventListener('pointerdown', (e) => {
      if (!hoveredBlock) return;
      blockDnd.start(e, { el: hoveredBlock }, hoveredBlock);
    });

    // ════════════════════════════════════════════
    //  Public Instance API
    // ════════════════════════════════════════════

    const instance = {
      element,

      /** Current mode: 'edit' or 'read'. */
      get mode() {
        return element.contentEditable === 'true' ? 'edit' : 'read';
      },

      /** Switch between 'edit' and 'read' modes. Focuses the element
       *  when entering edit mode. */
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

      /** Register an event listener. Supported events: 'change', 'modechange'. */
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

      /** Programmatically open the format modal using the last known selection. */
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

      /** Tear down the editor: remove all event listeners and the drag handle. */
      destroy() {
        abortController.abort();
        blockDnd.destroy();
        blockHandle.remove();
        element.contentEditable = 'false';
      },
    };

    return instance;
  }

  return { mount };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleEditor;
}
