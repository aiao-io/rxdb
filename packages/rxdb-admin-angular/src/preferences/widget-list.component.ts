import {
  moveVisibleWidget,
  PINNED_WIDGETS,
  toggleWidgetHidden,
  visibleWidgets,
  type WidgetKey
} from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideDynamicIcon, LucideEye, LucideEyeOff, LucideGripVertical } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

/**
 * 顶栏部件的顺序与显隐：拖拽或上下方向键调整顺序，眼睛按钮切换显隐（设置入口不可隐藏）。
 */
@Component({
  selector: 'rxdb-admin-widget-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './widget-list.component.html'
})
export class AdminWidgetListComponent {
  readonly #shell = injectAdminShell();

  protected readonly t = injectAdminText();
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly widget = computed(() => this.prefs().widget);
  protected readonly visible = computed(() => visibleWidgets(this.widget()));
  protected readonly hidden = computed(() => {
    const { order, hidden } = this.widget();
    return order.filter(key => hidden.includes(key));
  });
  protected readonly dragFrom = signal<number | null>(null);
  protected readonly dropTo = signal<number | null>(null);
  protected readonly pinned: readonly WidgetKey[] = PINNED_WIDGETS;
  protected readonly Eye = LucideEye;
  protected readonly EyeOff = LucideEyeOff;
  protected readonly GripVertical = LucideGripVertical;

  protected toggle(key: WidgetKey): void {
    this.#shell.preferences.setPath('widget.hidden', toggleWidgetHidden(this.widget().hidden, key));
  }

  protected onKeyDown(event: KeyboardEvent, index: number): void {
    const delta =
      event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowDown' ? 1
      : 0;
    if (delta === 0 || event.target !== event.currentTarget) return;
    event.preventDefault();
    const moved = this.visible()[index];
    this.#reorder(index, index + delta);
    requestAnimationFrame(() => document.getElementById(`prefs-widget-${moved}`)?.focus());
  }

  protected onDragStart(event: DragEvent, key: WidgetKey, index: number): void {
    // Firefox 没有拖拽数据就不会启动拖放
    event.dataTransfer?.setData('text/plain', key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragFrom.set(index);
  }

  protected onDragOver(event: Event, index: number): void {
    if (this.dragFrom() === null) return;
    event.preventDefault();
    this.dropTo.set(index);
  }

  protected onDrop(event: Event, index: number): void {
    event.preventDefault();
    const from = this.dragFrom();
    if (from !== null && from !== index) this.#reorder(from, index);
    this.onDragEnd();
  }

  protected onDragEnd(): void {
    this.dragFrom.set(null);
    this.dropTo.set(null);
  }

  #reorder(from: number, to: number): void {
    this.#shell.preferences.setPath('widget.order', moveVisibleWidget(this.widget(), from, to));
  }
}
