import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

const RESIZE_STEP = 16;

/**
 * 侧栏右边缘的宽度拖拽手柄：指针拖拽或左右方向键调整，宽度的上下限由偏好约束。
 */
@Component({
  selector: 'rxdb-admin-sidebar-resizer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div
      class="admin-sidebar-resizer"
      [attr.aria-label]="t('layout.resize')"
      [attr.aria-valuenow]="prefs().sidebar.width"
      [attr.data-dragging]="dragging()"
      (keydown)="onKeyDown($event)"
      (pointercancel)="dragging.set(false)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="dragging.set(false)"
      aria-orientation="vertical"
      aria-valuemax="320"
      aria-valuemin="160"
      data-testid="admin-sidebar-resizer"
      role="separator"
      tabindex="0"
    ></div>
  `
})
export class AdminSidebarResizerComponent {
  #origin = { x: 0, width: 0 };

  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly dragging = signal(false);

  protected onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.#origin = { x: event.clientX, width: this.prefs().sidebar.width };
    this.dragging.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragging()) this.#resizeTo(this.#origin.width + event.clientX - this.#origin.x);
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
