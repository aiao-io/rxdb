import { FixedRowDrag, type FixedRowDragState } from '@aiao/utils';
import { applyPopoverPosition } from '../query-builder/utils/popover-position.js';
import { moveListViewItem } from './list-view.js';

/** 列表配置交互控制器使用的字段顺序与重排回调。 */
export interface ListViewSettingsControllerOptions {
  /** 当前字段序列，顺序与面板中的字段行一致。 */
  fields: () => readonly string[];
  /** 提交字段的新顺序。 */
  onReorder: (fields: string[]) => void;
}

/** 三框架共用的列表配置弹层定位、指针拖拽与键盘重排。 */
export class ListViewSettingsController {
  readonly #root: HTMLElement;
  readonly #options: ListViewSettingsControllerOptions;
  readonly #drag: FixedRowDrag<string>;
  #popover: HTMLElement | null = null;

  constructor(root: HTMLElement, options: ListViewSettingsControllerOptions) {
    this.#root = root;
    this.#options = options;
    this.#drag = new FixedRowDrag({
      rowHeight: 40,
      scrollElement: () => this.#list().parentElement!,
      listElement: () => this.#list(),
      ids: options.fields,
      onChange: state => this.#showDrag(state),
      onDrop: ({ ids, fromIndex, toIndex }) => {
        if (fromIndex === toIndex) return;
        const reordered = [...ids];
        reordered.splice(toIndex, 0, ...reordered.splice(fromIndex, 1));
        options.onReorder(reordered);
      }
    });
    root.addEventListener('toggle', this.#onToggle, true);
    root.addEventListener('pointerdown', this.#onPointerDown);
    root.addEventListener('keydown', this.#onKeydown);
    window.addEventListener('resize', this.#position);
    window.addEventListener('scroll', this.#position, true);
  }

  /** 释放弹层与拖拽监听，取消尚未提交的拖拽。 */
  dispose(): void {
    this.#drag.dispose();
    this.#popover = null;
    this.#root.removeEventListener('toggle', this.#onToggle, true);
    this.#root.removeEventListener('pointerdown', this.#onPointerDown);
    this.#root.removeEventListener('keydown', this.#onKeydown);
    window.removeEventListener('resize', this.#position);
    window.removeEventListener('scroll', this.#position, true);
  }

  readonly #position = (): void => {
    const panel = this.#popover;
    if (!panel) return;
    const trigger = panel.previousElementSibling as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const available = below > 120 ? below : rect.top;
    panel.style.maxHeight = `${Math.max(0, Math.min(window.innerHeight * 0.6, available - 12))}px`;
    applyPopoverPosition(panel, rect, 4);
  };

  readonly #onToggle = (event: Event): void => {
    const panel = event.target as HTMLElement;
    if (!panel.hasAttribute('data-list-view-popover')) return;
    if ((event as ToggleEvent).newState === 'open') {
      this.#popover = panel;
      this.#position();
      return;
    }
    if (this.#popover !== panel) return;
    this.#drag.cancel();
    this.#popover = null;
  };

  readonly #onPointerDown = (event: PointerEvent): void => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-list-view-drag]');
    if (!handle) return;
    const index = this.#options.fields().indexOf(handle.dataset['listViewDrag']!);
    this.#drag.start(event, index);
  };

  readonly #onKeydown = (event: KeyboardEvent): void => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-list-view-drag]');
    if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const fields = this.#options.fields();
    const index = fields.indexOf(handle.dataset['listViewDrag']!);
    this.#options.onReorder(moveListViewItem(fields, index, event.key === 'ArrowUp' ? -1 : 1));
  };

  #list(): HTMLElement {
    return this.#root.querySelector<HTMLElement>('[data-list-view-fields]')!;
  }

  #showDrag(state: FixedRowDragState | null): void {
    this.#root.querySelectorAll<HTMLElement>('[data-list-view-field]').forEach((row, index) => {
      row.toggleAttribute('data-dragging', state?.fromIndex === index);
      row.dataset['dropTarget'] = String(state?.overIndex === index);
    });
  }
}
