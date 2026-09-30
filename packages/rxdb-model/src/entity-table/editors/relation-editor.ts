import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';
import type { RelatedEntityItem } from '../../entity-form/interfaces.js';
import { DAISY_COLORS, positionOverlayPanel, refocusTable } from './global-overlay-editor.js';

/** 关联实体选项项 */
// Re-export for convenience
export { type RelatedEntityItem };

/**
 * 关系字段搜索下拉编辑器（oneToOne / manyToOne）
 *
 * - 顶部搜索框：实时过滤可选实体列表
 * - 键盘导航：↑ ↓ 移动焦点，Enter / 点击确认，Escape 取消
 * - 空值支持：nullable=true 时列表首项为"(空)"
 * - 存储外键 ID，显示关联实体的 displayName
 */
export class RelationEditor implements IEditor<string> {
  #currentValue = '';
  #originalValue = '';
  readonly #itemsSource: RelatedEntityItem[] | (() => RelatedEntityItem[]);
  /** 每次 onStart 时从 source 解析出的本轮候选列表 */
  #resolvedItems: RelatedEntityItem[] = [];
  #filteredItems: RelatedEntityItem[] = [];
  readonly #nullable: boolean;
  #focusedIndex = -1;

  #panel: HTMLDivElement | null = null;
  #listContainer: HTMLDivElement | null = null;
  #searchInput: HTMLInputElement | null = null;
  #endEdit: (() => void) | null = null;
  #container: HTMLElement | null = null;

  readonly #handleOutsideMouseDown: (e: MouseEvent) => void;
  readonly #handleKeydown: (e: KeyboardEvent) => void;
  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'relation-editor';

  /**
   * 创建关系下拉编辑器
   *
   * @param items - 候选实体列表，或每次打开时重新求值的工厂函数
   * @param nullable - 是否允许空值，为 true 时列表首项为“(空)”
   */
  constructor(items: RelatedEntityItem[] | (() => RelatedEntityItem[]) = [], nullable = false) {
    this.#itemsSource = items;
    this.#nullable = nullable;

    this.#handleOutsideMouseDown = (e: MouseEvent) => {
      if (!this.#panel?.contains(e.target as HTMLElement)) {
        this.#cancelEdit();
      }
    };

    this.#handleKeydown = (e: KeyboardEvent) => {
      const inSearch = document.activeElement === this.#searchInput;
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.#cancelEdit();
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          this.#moveFocus(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          this.#moveFocus(-1);
          break;
        case 'Enter':
          if (this.#focusedIndex >= 0) {
            e.preventDefault();
            e.stopPropagation();
            this.#selectAt(this.#focusedIndex);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (!inSearch && this.#nullable) {
            e.preventDefault();
            e.stopPropagation();
            this.#currentValue = '';
            this.#commitEdit();
          }
          break;
      }
    };
  }

  /** 弹出搜索浮层，解析候选列表并绑定键盘与点击事件 */
  onStart(ctx: EditContext<string>): void {
    const table = ctx.table as { getCellOriginValue(col: number, row: number): unknown } | null;
    const origin = table?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
    this.#currentValue = origin != null ? String(origin) : '';
    this.#originalValue = this.#currentValue;
    this.#container = ctx.container;
    this.#endEdit = ctx.endEdit;

    // 每次打开编辑器时重新解析候选列表（支持动态 provider）
    this.#resolvedItems = typeof this.#itemsSource === 'function' ? this.#itemsSource() : this.#itemsSource;

    this.#buildFilteredItems('');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:6px',
      'padding:0',
      'box-shadow:0 4px 16px rgba(0,0,0,.15)',
      'min-width:200px',
      'max-width:340px',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden'
    ].join(';');

    // 搜索框
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = `padding:6px 8px;border-bottom:1px solid ${DAISY_COLORS.border};flex-shrink:0`;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '搜索…';
    input.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'padding:4px 8px',
      'font-size:12px',
      `background:${DAISY_COLORS.hover}`,
      `color:${DAISY_COLORS.text}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'outline:none'
    ].join(';');
    input.addEventListener('input', () => {
      this.#buildFilteredItems(input.value);
      this.#renderItems();
    });
    searchWrap.appendChild(input);
    panel.appendChild(searchWrap);

    // 列表容器
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'max-height:200px;overflow-y:auto;overscroll-behavior:contain;padding:4px 0';
    panel.appendChild(listContainer);

    this.#panel = panel;
    this.#listContainer = listContainer;
    this.#searchInput = input;

    this.#renderItems();
    document.body.appendChild(panel);

    positionOverlayPanel(panel, ctx.referencePosition.rect, ctx.container, 280, { minWidth: 200 });

    document.addEventListener('mousedown', this.#handleOutsideMouseDown, { capture: true });
    document.addEventListener('keydown', this.#handleKeydown, { capture: true });

    setTimeout(() => {
      input.focus();
      this.#focusedIndex = this.#filteredItems.findIndex(i => i.id === this.#currentValue);
      if (this.#focusedIndex >= 0) {
        this.#listContainer?.querySelector<HTMLElement>(`[data-idx="${this.#focusedIndex}"]`)?.scrollIntoView({
          block: 'nearest'
        });
      }
    }, 10);
  }

  /** 移除浮层并解绑全局事件 */
  onEnd(): void {
    this.#panel?.remove();
    this.#panel = null;
    this.#listContainer = null;
    this.#searchInput = null;
    document.removeEventListener('mousedown', this.#handleOutsideMouseDown, { capture: true });
    document.removeEventListener('keydown', this.#handleKeydown, { capture: true });
    this.#endEdit = null;
    this.#container = null;
  }

  /** 返回当前选中的关联实体 ID（未选中为空字符串） */
  getValue(): string {
    return this.#currentValue;
  }

  /** 判断目标元素是否位于本编辑器浮层内 */
  isEditorElement(target: HTMLElement): boolean {
    return this.#panel?.contains(target) ?? false;
  }

  /** 按新的单元格矩形重新定位浮层 */
  adjustPosition(rect: RectProps): void {
    if (this.#panel) positionOverlayPanel(this.#panel, rect, this.#container, 280, { minWidth: 200 });
  }

  #buildFilteredItems(query: string): void {
    const base: RelatedEntityItem[] =
      this.#nullable ? [{ id: '', displayName: '(空)' }, ...this.#resolvedItems] : [...this.#resolvedItems];
    if (!query.trim()) {
      this.#filteredItems = base;
      return;
    }
    const q = query.toLowerCase();
    this.#filteredItems = base.filter(i => i.displayName.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    this.#focusedIndex = -1;
  }

  #renderItems(): void {
    const list = this.#listContainer;
    if (!list) return;
    list.textContent = '';

    if (this.#filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `padding:8px 12px;font-size:12px;opacity:0.45;color:${DAISY_COLORS.text}`;
      empty.textContent = '无匹配结果';
      list.appendChild(empty);
      return;
    }

    this.#filteredItems.forEach((item, idx) => {
      const isNullItem = item.id === '';
      const isSelected = item.id === this.#currentValue;
      const isFocused = idx === this.#focusedIndex;

      const row = document.createElement('div');
      row.dataset['idx'] = String(idx);
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:5px 12px',
        'cursor:pointer',
        'font-size:13px',
        `color:${DAISY_COLORS.text}`,
        `opacity:${isNullItem ? '0.55' : '1'}`,
        `font-style:${isNullItem ? 'italic' : 'normal'}`,
        `background:${
          isFocused ? DAISY_COLORS.focusBg
          : isSelected ? DAISY_COLORS.selectedBg
          : 'transparent'
        }`
      ].join(';');
      row.textContent = item.displayName;

      row.addEventListener('mouseenter', () => {
        const prev = this.#focusedIndex;
        this.#focusedIndex = idx;
        this.#updateRowStyle(prev);
        this.#updateRowStyle(idx);
      });
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        this.#selectAt(idx);
      });

      list.appendChild(row);
    });
  }

  #updateRowStyle(idx: number): void {
    if (idx < 0) return;
    const row = this.#listContainer?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!row) return;
    const item = this.#filteredItems[idx];
    const isNullItem = item?.id === '';
    const isSelected = item?.id === this.#currentValue;
    const isFocused = idx === this.#focusedIndex;
    row.style.background =
      isFocused ? DAISY_COLORS.focusBg
      : isSelected ? DAISY_COLORS.selectedBg
      : 'transparent';
    row.style.opacity = isNullItem ? '0.55' : '1';
  }

  #moveFocus(delta: number): void {
    const count = this.#filteredItems.length;
    if (count === 0) return;
    const prev = this.#focusedIndex;
    this.#focusedIndex =
      prev < 0 ?
        delta > 0 ?
          0
        : count - 1
      : Math.max(0, Math.min(count - 1, prev + delta));
    this.#updateRowStyle(prev);
    this.#updateRowStyle(this.#focusedIndex);
    this.#listContainer
      ?.querySelector<HTMLElement>(`[data-idx="${this.#focusedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  #selectAt(idx: number): void {
    const item = this.#filteredItems[idx];
    if (!item) return;
    this.#currentValue = item.id;
    this.#commitEdit();
  }

  #commitEdit(): void {
    refocusTable(this.#container);
    this.#endEdit?.();
  }

  #cancelEdit(): void {
    this.#currentValue = this.#originalValue;
    refocusTable(this.#container);
    this.#endEdit?.();
  }
}
