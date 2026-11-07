import { SIDEBAR_WIDTH_RANGE, SidebarDrag } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

const RESIZE_STEP = 16;

/**
 * 侧栏右边缘的宽度拖拽手柄：指针拖拽或左右方向键调整，宽度的上下限由偏好约束。
 * 指针拖拽期间只预览宽度，偏好在松手时才一次性提交，外壳不会随指针移动重新渲染。
 */
@Component({
  selector: 'rxdb-admin-sidebar-resizer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div
      class="admin-sidebar-resizer"
      [attr.aria-label]="t('layout.resize')"
      [attr.aria-valuemax]="range.max"
      [attr.aria-valuemin]="range.min"
      [attr.aria-valuenow]="live() ?? prefs().sidebar.width"
      [attr.data-dragging]="live() !== null"
      (keydown)="onKeyDown($event)"
      (pointercancel)="onPointerEnd()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerEnd()"
      aria-orientation="vertical"
      data-testid="admin-sidebar-resizer"
      role="separator"
      tabindex="0"
    ></div>
  `
})
export class AdminSidebarResizerComponent {
  #drag: SidebarDrag | undefined;

  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly range = SIDEBAR_WIDTH_RANGE;
  /** 拖动中的预览宽度，`null` 表示没有在拖动。 */
  protected readonly live = signal<number | null>(null);

  constructor() {
    // 拖动中手柄被卸载（侧栏折叠、关掉拖拽偏好）：撤掉预览，不提交
    inject(DestroyRef).onDestroy(() => this.#drag?.cancel());
  }

  protected onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    this.#drag = new SidebarDrag(this.shell.preferences, handle, event.clientX);
    this.live.set(this.#drag.width);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.#drag) this.live.set(this.#drag.move(event.clientX));
  }

  protected onPointerEnd(): void {
    this.#drag?.end();
    this.#drag = undefined;
    this.live.set(null);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const delta =
      event.key === 'ArrowRight' ? RESIZE_STEP
      : event.key === 'ArrowLeft' ? -RESIZE_STEP
      : 0;
    if (delta === 0) return;
    event.preventDefault();
    this.#resizeTo(this.prefs().sidebar.width + delta);
  }

  #resizeTo(width: number): void {
    this.shell.preferences.setPath('sidebar.width', width);
  }
}
