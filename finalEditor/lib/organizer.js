class SidebarOrganizer {
  constructor(initialData) {
    this.data = initialData || { folders: [], notes: [] };
    this.currentNoteId = null;
    this.listeners = {};

    // Drag and drop state
    this.dragState = {
      itemType: null, itemId: null, sourceEl: null, cloneEl: null,
      startX: 0, startY: 0, initLeft: 0, initTop: 0,
      dropTargetId: null, dropTargetType: null, dropPosition: null
    };

    this.initDOM();
    this.render();
  }

  // --- Event Emitter Logic ---
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(payload));
    }
  }

  // --- API for Host Page ---
  updateData(newData) {
    this.data = newData;
    this.render();
  }

  setActiveNote(noteId) {
    this.currentNoteId = noteId;
    this.render();
  }

  open() {
    this.overlay.style.display = 'flex';
    this.render();
  }

  close() {
    this.overlay.style.display = 'none';
  }

  // --- Internal Utilities ---
  generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  // --- UI Initialization ---
  initDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'sidebar-overlay';

    this.overlay.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>Folders</h3>
          <div class="header-actions">
            <button id="org-btn-new-folder">+ New</button>
            <button id="org-btn-close">✕</button>
          </div>
        </div>
        <div id="org-folder-list" class="folder-list"></div>
      </aside>
    `;

    document.body.appendChild(this.overlay);
    this.folderListEl = this.overlay.querySelector('#org-folder-list');

    // Basic UI Events
    this.overlay.querySelector('#org-btn-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.overlay.querySelector('#org-btn-new-folder').addEventListener('click', () => {
      const folderName = prompt('Enter a new folder name:');
      if (folderName && folderName.trim() !== '') {
        this.data.folders.push({ id: this.generateId(), name: folderName.trim() });
        this.emit('change', this.data);
        this.render();
      }
    });

    // Bind drag handlers to this instance
    this.handleDragMove = this.handleDragMove.bind(this);
    this.endDrag = this.endDrag.bind(this);
  }

  // --- Core Rendering ---
  render() {
    this.folderListEl.innerHTML = '';
    const dragIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>`;

    this.data.folders.forEach(folder => {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-item';
      folderDiv.dataset.id = folder.id;

      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-title';
      folderHeader.dataset.id = folder.id;

      const fHandle = document.createElement('div');
      fHandle.className = 'drag-handle';
      fHandle.innerHTML = dragIcon;
      fHandle.onpointerdown = (e) => this.startDrag(e, 'folder', folder.id, folderDiv);

      const fTitleText = document.createElement('span');
      fTitleText.className = 'folder-name-text';
      fTitleText.textContent = folder.name;
      fTitleText.title = "Click to rename folder";

      fTitleText.onclick = (e) => this.initInlineEdit(e, fTitleText, folder);

      const addNoteBtn = document.createElement('button');
      addNoteBtn.textContent = '+ Note';
      addNoteBtn.onclick = () => {
        const title = prompt('Enter a title for your new note:');
        if (title && title.trim() !== '') {
          const newNote = { id: this.generateId(), folderId: folder.id, title: title.trim(), content: null };
          this.data.notes.push(newNote);
          this.currentNoteId = newNote.id;
          this.emit('change', this.data);
          this.emit('select', newNote.id);
          this.render();
          this.close();
        }
      };

      folderHeader.appendChild(fHandle);
      folderHeader.appendChild(fTitleText);
      folderHeader.appendChild(addNoteBtn);

      const notesUl = document.createElement('ul');
      notesUl.className = 'note-list';

      const folderNotes = this.data.notes.filter(n => n.folderId === folder.id);
      folderNotes.forEach(note => {
        const noteLi = document.createElement('li');
        noteLi.className = 'note-item' + (note.id === this.currentNoteId ? ' active' : '');
        noteLi.dataset.id = note.id;

        const nHandle = document.createElement('div');
        nHandle.className = 'drag-handle';
        nHandle.innerHTML = dragIcon;
        nHandle.onclick = (e) => e.stopPropagation();
        nHandle.onpointerdown = (e) => this.startDrag(e, 'note', note.id, noteLi);

        const nTitleText = document.createElement('span');
        nTitleText.className = 'note-name-text';
        nTitleText.textContent = note.title || 'Untitled Note';

        noteLi.onclick = () => {
          this.currentNoteId = note.id;
          this.emit('select', note.id);
          this.render();
          this.close();
        };

        noteLi.appendChild(nHandle);
        noteLi.appendChild(nTitleText);
        notesUl.appendChild(noteLi);
      });

      folderDiv.appendChild(folderHeader);
      folderDiv.appendChild(notesUl);
      this.folderListEl.appendChild(folderDiv);
    });
  }

  // --- Interaction Logic ---
  initInlineEdit(e, textEl, folderObj) {
    e.stopPropagation();
    if (textEl.isContentEditable) return;

    textEl.contentEditable = "true";
    textEl.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    const finishEditing = (save) => {
      textEl.contentEditable = "false";
      const newName = textEl.textContent.trim();

      if (save && newName && newName !== folderObj.name) {
        folderObj.name = newName;
        this.emit('change', this.data);
        this.render();
      } else {
        textEl.textContent = folderObj.name;
      }
    };

    textEl.addEventListener('blur', () => finishEditing(true), { once: true });
    textEl.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter') {
        keyEvent.preventDefault();
        textEl.blur();
      } else if (keyEvent.key === 'Escape') {
        finishEditing(false);
      }
    });
  }

  // --- Drag & Drop Logic ---
  startDrag(e, type, id, sourceEl) {
    if (e.cancelable) e.preventDefault();
    this.dragState.itemType = type;
    this.dragState.itemId = id;
    this.dragState.sourceEl = sourceEl;

    const rect = sourceEl.getBoundingClientRect();
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.initLeft = rect.left;
    this.dragState.initTop = rect.top;

    this.dragState.cloneEl = sourceEl.cloneNode(true);
    Object.assign(this.dragState.cloneEl.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px',
      opacity: '0.9', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: '9999'
    });
    document.body.appendChild(this.dragState.cloneEl);
    sourceEl.style.opacity = '0.3';

    document.addEventListener('pointermove', this.handleDragMove, { passive: false });
    document.addEventListener('pointerup', this.endDrag);
  }

  clearDropStyles() {
    this.overlay.querySelectorAll('.drop-target-before, .drop-target-after, .drop-target-inside').forEach(el => {
      el.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-inside');
    });
    this.dragState.dropTargetId = null;
    this.dragState.dropPosition = null;
  }

  handleDragMove(e) {
    if (!this.dragState.cloneEl) return;
    e.preventDefault();
    this.dragState.cloneEl.style.left = (this.dragState.initLeft + e.clientX - this.dragState.startX) + 'px';
    this.dragState.cloneEl.style.top = (this.dragState.initTop + e.clientY - this.dragState.startY) + 'px';
    this.clearDropStyles();

    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    if (!targetEl) return;

    const noteTarget = targetEl.closest('.note-item');
    const folderTarget = targetEl.closest('.folder-title');
    const folderItemTarget = targetEl.closest('.folder-item');

    if (this.dragState.itemType === 'note') {
      if (noteTarget && noteTarget.dataset.id !== this.dragState.itemId) {
        const rect = noteTarget.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + (rect.height / 2);
        this.dragState.dropTargetId = noteTarget.dataset.id;
        this.dragState.dropTargetType = 'note';
        this.dragState.dropPosition = isAbove ? 'before' : 'after';
        noteTarget.classList.add(isAbove ? 'drop-target-before' : 'drop-target-after');
      } else if (folderTarget) {
        this.dragState.dropTargetId = folderTarget.dataset.id;
        this.dragState.dropTargetType = 'folder';
        this.dragState.dropPosition = 'inside';
        folderTarget.classList.add('drop-target-inside');
      }
    } else if (this.dragState.itemType === 'folder') {
      if (folderItemTarget && folderItemTarget.dataset.id !== this.dragState.itemId) {
        const rect = folderItemTarget.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + (rect.height / 2);
        this.dragState.dropTargetId = folderItemTarget.dataset.id;
        this.dragState.dropTargetType = 'folder';
        this.dragState.dropPosition = isAbove ? 'before' : 'after';
        const titleToHighlight = folderItemTarget.querySelector('.folder-title');
        if (titleToHighlight) titleToHighlight.classList.add(isAbove ? 'drop-target-before' : 'drop-target-after');
      }
    }
  }

  endDrag() {
    document.removeEventListener('pointermove', this.handleDragMove);
    document.removeEventListener('pointerup', this.endDrag);

    if (this.dragState.cloneEl) this.dragState.cloneEl.remove();
    if (this.dragState.sourceEl) this.dragState.sourceEl.style.opacity = '';

    const { itemType, itemId, dropTargetId, dropTargetType, dropPosition } = this.dragState;
    this.clearDropStyles();

    if (dropTargetId) {
      if (itemType === 'note') {
        const noteIndex = this.data.notes.findIndex(n => n.id === itemId);
        const note = this.data.notes.splice(noteIndex, 1)[0];

        if (dropPosition === 'inside' && dropTargetType === 'folder') {
          note.folderId = dropTargetId;
          this.data.notes.push(note);
        } else if (dropTargetType === 'note') {
          const targetNoteIndex = this.data.notes.findIndex(n => n.id === dropTargetId);
          note.folderId = this.data.notes[targetNoteIndex].folderId;
          const insertIndex = dropPosition === 'before' ? targetNoteIndex : targetNoteIndex + 1;
          this.data.notes.splice(insertIndex, 0, note);
        }
      } else if (itemType === 'folder') {
        const folderIndex = this.data.folders.findIndex(f => f.id === itemId);
        const folder = this.data.folders.splice(folderIndex, 1)[0];

        const targetFolderIndex = this.data.folders.findIndex(f => f.id === dropTargetId);
        const insertIndex = dropPosition === 'before' ? targetFolderIndex : targetFolderIndex + 1;
        this.data.folders.splice(insertIndex, 0, folder);
      }
      this.emit('change', this.data);
      this.render();
    }
    this.dragState = { itemType: null, itemId: null, sourceEl: null, cloneEl: null, dropTargetId: null, dropPosition: null };
  }
}