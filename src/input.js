class InputState {
  constructor() {
    this.keys = new Set();
    this.mouse = new Set();
    this.locked = false;
    this.dx = 0;
    this.dy = 0;
    this.pressed = new Set();
    this.onKey = null;
    this.onMouseDown = null;
    this.onLockChange = null;
    this.canvas = null;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consume(code) {
    return this.pressed.delete(code);
  }

  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (this.locked) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.locked || ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (this.onKey) this.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.clear();
    });
    window.addEventListener('mousedown', (e) => {
      this.mouse.add(e.button);
      if (this.onMouseDown) this.onMouseDown(e.button, e);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.delete(e.button);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouse.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (this.locked || !this.canvas) return;
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  takeMouse() {
    const d = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return d;
  }
}

export const Input = new InputState();
