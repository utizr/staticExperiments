/**
 * DragDrop - A reusable pointer-based drag & drop engine.
 *
 * Usage:
 *   const dnd = new DragDrop({
 *     container: document.querySelector('.my-list'),
 *     resolveDropTarget(pointerEvent, dragMeta) {
 *       // Return { el, id, type, position: 'before'|'after'|'inside' } or null
 *     },
 *     onDrop(dragMeta, dropTarget) { ... },
 *   });
 *
 *   handleEl.onpointerdown = (e) => dnd.start(e, { id: 'item-1' }, itemEl);
 */
class DragDrop {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.resolveDropTarget = options.resolveDropTarget || (() => null);
    this.onDrop = options.onDrop || (() => {});
    this.onDragStart = options.onDragStart || null;
    this.onDragEnd = options.onDragEnd || null;
    this.dropClasses = Object.assign(
      { before: 'drop-target-before', after: 'drop-target-after', inside: 'drop-target-inside' },
      options.dropClasses
    );

    this._state = this._empty();
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  get active() {
    return this._state.active;
  }

  _empty() {
    return {
      meta: null, sourceEl: null, cloneEl: null,
      startX: 0, startY: 0, initLeft: 0, initTop: 0,
      currentTarget: null, active: false
    };
  }

  start(e, meta, sourceEl) {
    if (e.cancelable) e.preventDefault();

    const rect = sourceEl.getBoundingClientRect();
    const clone = sourceEl.cloneNode(true);
    Object.assign(clone.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      opacity: '0.9',
      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      pointerEvents: 'none',
      zIndex: '9999',
      margin: '0'
    });
    document.body.appendChild(clone);
    sourceEl.style.opacity = '0.3';

    this._state = {
      meta, sourceEl, cloneEl: clone,
      startX: e.clientX, startY: e.clientY,
      initLeft: rect.left, initTop: rect.top,
      currentTarget: null, active: true
    };

    if (this.onDragStart) this.onDragStart(meta);

    document.addEventListener('pointermove', this._onMove, { passive: false });
    document.addEventListener('pointerup', this._onUp);
  }

  clearDropStyles() {
    const classes = Object.values(this.dropClasses);
    const selector = classes.map(c => '.' + c).join(', ');
    this.container.querySelectorAll(selector).forEach(el => {
      classes.forEach(cls => el.classList.remove(cls));
    });
    this._state.currentTarget = null;
  }

  _onMove(e) {
    const s = this._state;
    if (!s.cloneEl) return;
    e.preventDefault();

    s.cloneEl.style.left = (s.initLeft + e.clientX - s.startX) + 'px';
    s.cloneEl.style.top = (s.initTop + e.clientY - s.startY) + 'px';

    this.clearDropStyles();

    const target = this.resolveDropTarget(e, s.meta);
    if (target && target.el) {
      s.currentTarget = target;
      const cls = this.dropClasses[target.position];
      if (cls) target.el.classList.add(cls);
    }
  }

  _onUp() {
    document.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerup', this._onUp);

    const s = this._state;
    if (s.cloneEl) s.cloneEl.remove();
    if (s.sourceEl) s.sourceEl.style.opacity = '';

    const target = s.currentTarget;
    this.clearDropStyles();

    if (target) this.onDrop(s.meta, target);
    if (this.onDragEnd) this.onDragEnd(s.meta);

    this._state = this._empty();
  }

  destroy() {
    document.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerup', this._onUp);
    if (this._state.cloneEl) this._state.cloneEl.remove();
    if (this._state.sourceEl) this._state.sourceEl.style.opacity = '';
    this._state = this._empty();
  }
}
