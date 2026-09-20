import { DAISY_COLORS, GlobalOverlayEditor } from './global-overlay-editor.js';
import { lucideToSvgElement, type IconData } from './lucide-svg.js';

/** 枚举选项配置 */
export interface EnumItem {
  /** 存储值 */
  value: string;
  /** 显示文本（默认等于 value） */
  text?: string;
  /** Lucide 图标数据（可选，配合 color 使用） */
  icon?: IconData;
  /** 图标描边颜色（可选，配合 icon 使用） */
  color?: string;
  /** 是否禁用（只影响展示与选择，不改变枚举合法性） */
  disabled?: boolean;
}

type VTableWithColumnDef = {
  getCellOriginValue(col: number, row: number): unknown;
  getColumnDefine?(col: number): Record<string, unknown> | undefined;
};

/**
 * 枚举下拉选择编辑器
 *
 * 从列定义的 `menuList` 动态读取可选项，支持键盘导航。
 * - ↑ ↓：移动选中项
 * - Enter / 点击：确认选中并关闭
 * - Delete / Backspace：清空值并关闭
 * - Escape：取消，恢复原始值
 *
 * 未来可扩展 icon、i18n 等字段通过 menuList 传入。
 */
export class EnumEditor extends GlobalOverlayEditor {
  #currentValue = '';
  #items: EnumItem[] = [];
  #presetItems: EnumItem[] | null = null;

  protected get initialFocusIndex(): number {
    return this.#items.findIndex(i => i.value === this.#currentValue);
  }

  protected get itemCount(): number {
    return this.#items.length;
  }

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'enum-editor';

  /**
   * 创建枚举编辑器
   *
   * @param presetItems 预设选项；不传时在 onStart 中从列定义 menuList 读取
   */
  constructor(presetItems?: EnumItem[]) {
    super();
    this.#presetItems = presetItems ?? null;
  }

  /** 初始化编辑：解析原始值并加载可选项（预设选项优先，其次列定义 menuList） */
  override onStart(ctx: Parameters<GlobalOverlayEditor['onStart']>[0]): void {
    const table = ctx.table as VTableWithColumnDef | null;
    const origin = table?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
    this.#currentValue = origin != null ? String(origin) : '';

    // 优先使用构造时注入的预设选项，否则从列定义读取
    const menuList =
      this.#presetItems ?? (table?.getColumnDefine?.(ctx.col)?.['menuList'] as Array<EnumItem> | undefined);
    this.#items = (menuList ?? []).map(item => ({
      ...item,
      text: item.text ?? item.value
    }));

    // 是否允许 null（菜单列表中有 value='' 的项）
    const hasNullOption = this.#items.some(i => i.value === '');
    const realItems = this.#items.filter(i => i.value !== '');

    if (!hasNullOption && this.#currentValue === '') {
      // 不允许 null 且当前值为空，自动选择第一项
      this.#currentValue = realItems[0]?.value ?? '';
    } else if (!hasNullOption && !this.#items.some(i => i.value === this.#currentValue)) {
      // 不允许 null 且当前值不在列表中，自动选择第一项
      this.#currentValue = realItems[0]?.value ?? '';
    }

    super.onStart(ctx);
  }

  /** 返回当前选中的枚举值 */
  override getValue(): string {
    return this.#currentValue;
  }

  protected override onDeleteKey(): void {
    // 仅当列表包含 null 选项时才允许清除
    if (this.#items.some(i => i.value === '')) {
      this.#currentValue = '';
      this.close();
    }
  }

  protected buildRows(panel: HTMLDivElement): void {
    if (this.#items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `padding:8px 12px;font-size:12px;opacity:0.45;color:${DAISY_COLORS.text}`;
      empty.textContent = '暂无可选项';
      panel.appendChild(empty);
      return;
    }

    this.#items.forEach((item, idx) => {
      const isNullItem = item.value === '';
      const isSelected = item.value === this.#currentValue;
      const isDisabled = item.disabled === true;
      const row = document.createElement('div');
      row.dataset['value'] = item.value;
      row.dataset['idx'] = String(idx);
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:5px 12px',
        `cursor:${isDisabled ? 'default' : 'pointer'}`,
        'font-size:13px',
        `color:${DAISY_COLORS.text}`,
        `opacity:${isNullItem || isDisabled ? '0.55' : '1'}`,
        `font-style:${isNullItem ? 'italic' : 'normal'}`,
        `background:${isSelected ? DAISY_COLORS.selectedBg : 'transparent'}`
      ].join(';');
      if (item.icon && item.color) {
        row.appendChild(lucideToSvgElement(item.icon, item.color));
        const span = document.createElement('span');
        span.textContent = item.text ?? item.value;
        row.appendChild(span);
      } else {
        row.textContent = item.text ?? item.value;
      }

      row.addEventListener('mouseenter', () => {
        if (!isDisabled) this.setFocused(idx);
      });
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDisabled) this.onRowClick(idx);
      });

      panel.appendChild(row);
    });
  }

  protected onRowClick(idx: number): void {
    const item = this.#items[idx];
    if (!item || item.disabled === true) return;
    this.#currentValue = item.value;
    this.close();
  }

  protected onFocusChange(idx: number, prev: number): void {
    const prevRow = this.rowAt(prev);
    if (prevRow) {
      prevRow.style.background =
        prevRow.dataset['value'] === this.#currentValue ? DAISY_COLORS.selectedBg : 'transparent';
    }
    const nextRow = this.rowAt(idx);
    if (nextRow) nextRow.style.background = DAISY_COLORS.focusBg;
  }
}
