class SidebarOrganizer {
  constructor(initialData) {
    this.data = initialData || { folders: [], notes: [] };
    this.currentNoteId = null;
    this.listeners = {};

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

    // Drag & drop via reusable DragDrop
    this.dnd = new DragDrop({
      container: this.overlay,
      resolveDropTarget: (e, meta) => this._resolveDropTarget(e, meta),
      onDrop: (meta, target) => this._handleDrop(meta, target)
    });
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
      fHandle.onpointerdown = (e) => this.dnd.start(e, { type: 'folder', id: folder.id }, folderDiv);

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
        nHandle.onpointerdown = (e) => this.dnd.start(e, { type: 'note', id: note.id }, noteLi);

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

  // --- Drag & Drop Callbacks ---

  _resolveDropTarget(e, meta) {
    const targetEl = document.elementFromPoint(e.clientX, e.clientY);
    if (!targetEl) return null;

    const noteTarget = targetEl.closest('.note-item');
    const folderTarget = targetEl.closest('.folder-title');
    const folderItemTarget = targetEl.closest('.folder-item');

    if (meta.type === 'note') {
      if (noteTarget && noteTarget.dataset.id !== meta.id) {
        const rect = noteTarget.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + rect.height / 2;
        return { el: noteTarget, id: noteTarget.dataset.id, type: 'note', position: isAbove ? 'before' : 'after' };
      }
      if (folderTarget) {
        return { el: folderTarget, id: folderTarget.dataset.id, type: 'folder', position: 'inside' };
      }
    } else if (meta.type === 'folder') {
      if (folderItemTarget && folderItemTarget.dataset.id !== meta.id) {
        const rect = folderItemTarget.getBoundingClientRect();
        const isAbove = e.clientY < rect.top + rect.height / 2;
        const titleEl = folderItemTarget.querySelector('.folder-title');
        return { el: titleEl || folderItemTarget, id: folderItemTarget.dataset.id, type: 'folder', position: isAbove ? 'before' : 'after' };
      }
    }

    return null;
  }

  _handleDrop(meta, target) {
    if (meta.type === 'note') {
      const noteIndex = this.data.notes.findIndex(n => n.id === meta.id);
      const note = this.data.notes.splice(noteIndex, 1)[0];

      if (target.position === 'inside' && target.type === 'folder') {
        note.folderId = target.id;
        this.data.notes.push(note);
      } else if (target.type === 'note') {
        const targetNoteIndex = this.data.notes.findIndex(n => n.id === target.id);
        note.folderId = this.data.notes[targetNoteIndex].folderId;
        const insertIndex = target.position === 'before' ? targetNoteIndex : targetNoteIndex + 1;
        this.data.notes.splice(insertIndex, 0, note);
      }
    } else if (meta.type === 'folder') {
      const folderIndex = this.data.folders.findIndex(f => f.id === meta.id);
      const folder = this.data.folders.splice(folderIndex, 1)[0];

      const targetFolderIndex = this.data.folders.findIndex(f => f.id === target.id);
      const insertIndex = target.position === 'before' ? targetFolderIndex : targetFolderIndex + 1;
      this.data.folders.splice(insertIndex, 0, folder);
    }

    this.emit('change', this.data);
    this.render();
  }
}
