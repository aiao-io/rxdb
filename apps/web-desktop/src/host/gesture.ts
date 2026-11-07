import type { Bounds, WindowModel } from '../core/types.js';
import { activateWindow, constrainBounds, setWindowState, windowById, type WorkArea } from './windows.js';

export class WindowGesture {
  private gesture: { x: number; y: number; bounds: Bounds; kind: string } | null = null;
  get active(): boolean {
    return this.gesture !== null;
  }
  constructor(
    private readonly model: WindowModel,
    private id: string,
    private readonly area: () => WorkArea,
    private readonly changed: () => void,
    private readonly commit: () => void,
    private readonly minWidth = 360,
    private readonly minHeight = 240
  ) {}
  attach(id: string): void {
    this.id = id;
  }
  begin(x: number, y: number, kind: string): void {
    const win = windowById(this.model, this.id);
    if (win.state !== 'normal') return;
    activateWindow(this.model, this.id);
    this.gesture = { x, y, bounds: { ...win.bounds }, kind };
    this.changed();
  }
  move(x: number, y: number): void {
    if (!this.gesture) return;
    const { kind, bounds, x: startX, y: startY } = this.gesture;
    const dx = x - startX;
    const dy = y - startY;
    const next = { ...bounds };
    if (kind === 'move') {
      next.x += dx;
      next.y += dy;
    } else this.resize(next, kind, dx, dy);
    const win = windowById(this.model, this.id);
    win.bounds = constrainBounds(next, this.area(), this.minWidth, this.minHeight);
    win.normalBounds = { ...win.bounds };
    this.changed();
  }
  end(x: number, cancel = false): void {
    if (!this.gesture) return;
    if (this.model.mode === 'windows' && this.gesture.kind === 'move' && !cancel) this.snap(x);
    this.gesture = null;
    this.changed();
    this.commit();
  }
  private resize(next: Bounds, kind: string, dx: number, dy: number): void {
    if (kind.includes('e')) next.width += dx;
    if (kind.includes('s')) next.height += dy;
    if (kind.includes('w')) {
      next.x += dx;
      next.width -= dx;
    }
    if (kind.includes('n')) {
      next.y += dy;
      next.height -= dy;
    }
  }
  private snap(x: number): void {
    if (x < 20) setWindowState(this.model, this.id, 'left', this.area());
    if (x > this.area().width - 20) setWindowState(this.model, this.id, 'right', this.area());
  }
}
