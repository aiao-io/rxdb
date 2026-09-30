import { DAISY_COLORS, GlobalOverlayEditor } from './global-overlay-editor.js';
import { lucideToSvgElement, type IconData } from './lucide-svg.js';

/**
 * 带图标的列表条目
 * @deprecated 请改用 `EnumItem`，`EnumEditor` 已原生支持 icon 和 color 字段。
 */
export interface IconLabeledItem {
  /** 显示文本 */
  text: string;
  /** 存储值 */
  value: string;
  /** Lucide 图标数据（可选，配合 color 使用） */
  icon?: IconData;
  /** 图标描边颜色（可选，配合 icon 使用） */
  color?: string;
}

/**
 * 支持图标 + 文字的单选列表编辑器
 *
 * @deprecated 请改用 `EnumEditor`，传入包含 `icon` / `color` 字段的 `EnumItem` 数组。
 * `IconListEditor` 将在未来版本移除。
 *
 * 每项包含 lucide SVG 图标和本地化标签。
 * ↑ ↓ 移动焦点，Enter / 点击选中并关闭，Esc 取消。
 */
export class IconListEditor extends GlobalOverlayEditor {
  readonly #items: IconLabeledItem[];
  #currentValue = '';

  protected get initialFocusIndex(): number {
    return this.#items.findIndex(i => i.value === this.#currentValue);
  }

  protected get itemCount(): number {
    return this.#items.length;
  }

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'icon-list';

  /**
   * 创建图标列表编辑器
   *
   * @param config 编辑器配置（values 为条目列表）
   */
  constructor(config: { values: IconLabeledItem[] }) {
    super();
    this.#items = config.values;
  }

  /** 初始化编辑：解析当前值；不在候选列表中时回退到单元格原始值 */
  override onStart(ctx: Parameters<GlobalOverlayEditor['onStart']>[0]): void {
    const raw = ctx.value ?? '';
    const isValid = this.#items.some(i => i.value === raw);
    this.#currentValue =
      isValid ? raw : (
        (((ctx.table as { getCellOriginValue(c: number, r: number): unknown } | null)?.getCellOriginValue(
          ctx.col,
          ctx.row
        ) as string | undefined) ?? '')
      );
    super.onStart(ctx);
  }

  /** 返回当前选中的条目值 */
  override getValue(): string {
    return this.#currentValue;
  }

  protected override onDeleteKey(): void {
    this.#currentValue = '';
    this.close();
  }

  protected buildRows(panel: HTMLDivElement): void {
    this.#items.forEach((item, idx) => {
      const isSelected = item.value === this.#currentValue;
      const row = document.createElement('div');
      row.dataset['value'] = item.value;
      row.dataset['idx'] = String(idx);
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:6px',
        'padding:5px 10px',
        'cursor:pointer',
        'font-size:12px',
        `color:${DAISY_COLORS.text}`,
        `background:${isSelected ? DAISY_COLORS.selectedBg : 'transparent'}`
      ].join(';');

      if (item.icon && item.color) {
        row.appendChild(lucideToSvgElement(item.icon, item.color));
        const span = document.createElement('span');
        span.textContent = item.text;
        row.appendChild(span);
      } else {
        row.textContent = item.text;
      }

      row.addEventListener('mouseenter', () => this.setFocused(idx));
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        this.onRowClick(idx);
      });

      panel.appendChild(row);
    });
  }

  protected onRowClick(idx: number): void {
    const item = this.#items[idx];
    if (!item) return;
    this.#currentValue = item.value;
    this.close();
  }

  protected onFocusChange(idx: number, prev: number): void {
    const prevRow = this.rowAt(prev);
    if (prevRow) {
      const isSelected = prevRow.dataset['value'] === this.#currentValue;
      prevRow.style.background = isSelected ? DAISY_COLORS.selectedBg : 'transparent';
    }
    const nextRow = this.rowAt(idx);
    if (nextRow) nextRow.style.background = DAISY_COLORS.focusBg;
  }
}
