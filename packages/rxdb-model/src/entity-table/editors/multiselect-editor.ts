import { DAISY_COLORS, GlobalOverlayEditor } from './global-overlay-editor.js';

/** 多选选项：id + 显示名 + 可选色点 / 禁用 */
export interface MultiSelectOption {
  /** 选项唯一标识（也是存储值） */
  id: string;
  /** 选项显示名 */
  name: string;
  /** 色点颜色（可选，显示在复选框左侧） */
  color?: string;
  /** 是否禁用（只影响展示与选择，不改变合法性） */
  disabled?: boolean;
}

/** 从 origin 值解析出已选 id 列表：数组逐项转字符串，字符串按逗号拆分。 */
function parseSelectedIds(origin: unknown): string[] {
  if (Array.isArray(origin)) return (origin as unknown[]).map(String);
  if (typeof origin === 'string') {
    const result: string[] = [];
    for (const part of origin.split(',')) {
      const trimmed = part.trim();
      if (trimmed !== '') result.push(trimmed);
    }
    return result;
  }
  return [];
}

/**
 * VTable 自定义多选编辑器
 *
 * 弹出浮层显示 checkbox 列表，支持 toggle 多选；禁用的选项不可勾选。
 * 结束编辑时以选中 id 列表（逗号分隔）写回单元格，并通过 onCommit 回调给出 id 数组。
 * 未显式传入初始选中时，从单元格 origin 值读取。
 */
export class MultiSelectEditor extends GlobalOverlayEditor {
  readonly #options: MultiSelectOption[];
  #selectedIds: Set<string>;
  readonly #readOrigin: boolean;
  readonly #onCommit: ((ids: string[]) => void) | undefined;

  protected get initialFocusIndex(): number {
    return -1;
  }

  protected get itemCount(): number {
    return this.#options.length;
  }

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'multiselect-editor';

  /**
   * 创建多选编辑器
   *
   * @param options - 全部可选项
   * @param selectedIds - 初始选中的选项 ID；不传（null / undefined）时从单元格 origin 值读取
   * @param onCommit - 结束编辑时的提交回调，收到当前选中的 ID 列表
   */
  constructor(options: MultiSelectOption[], selectedIds?: string[] | null, onCommit?: (ids: string[]) => void) {
    super();
    this.#options = options;
    this.#selectedIds = new Set(selectedIds ?? []);
    this.#readOrigin = selectedIds == null;
    this.#onCommit = onCommit;
  }

  /** 打开浮层：无显式初始选中时从单元格 origin 值解析已选 id */
  override onStart(ctx: Parameters<GlobalOverlayEditor['onStart']>[0]): void {
    if (this.#readOrigin) {
      // 基类的 table/editCol/editRow 在 super.onStart 里才赋值，这里直接用 ctx
      const table = ctx.table as { getCellOriginValue(col: number, row: number): unknown } | null;
      const origin = table?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
      this.#selectedIds = new Set(parseSelectedIds(origin));
    }
    super.onStart(ctx);
  }

  /** 结束编辑时以当前选中的 ID 列表触发提交回调 */
  override onEnd(): void {
    this.#onCommit?.([...this.#selectedIds]);
    super.onEnd();
  }

  /** 返回当前选中选项的 id，以逗号加空格拼接（存储值口径，非显示名） */
  getValue(): string {
    return [...this.#selectedIds].join(', ');
  }

  protected buildRows(panel: HTMLDivElement): void {
    if (this.#options.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px 12px;font-size:12px;opacity:.5';
      empty.textContent = '—';
      panel.appendChild(empty);
      return;
    }

    this.#options.forEach((opt, idx) => {
      const isDisabled = opt.disabled === true;
      const row = document.createElement('div');
      row.dataset['idx'] = String(idx);
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:6px',
        'padding:5px 12px',
        `cursor:${isDisabled ? 'default' : 'pointer'}`,
        'font-size:13px',
        'user-select:none',
        `color:${DAISY_COLORS.text}`,
        `opacity:${isDisabled ? '0.55' : '1'}`
      ].join(';');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.#selectedIds.has(opt.id);
      checkbox.disabled = isDisabled;
      checkbox.style.cssText = 'pointer-events:none;flex-shrink:0';

      row.appendChild(checkbox);

      if (opt.color) {
        const dot = document.createElement('span');
        dot.style.cssText = [
          'width:8px',
          'height:8px',
          'border-radius:9999px',
          'flex-shrink:0',
          `background:${opt.color}`
        ].join(';');
        row.appendChild(dot);
      }

      const label = document.createElement('span');
      label.textContent = opt.name;
      row.appendChild(label);

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
    const opt = this.#options[idx];
    if (!opt || opt.disabled === true) return;
    const checkbox = this.rowAt(idx)?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (this.#selectedIds.has(opt.id)) {
      this.#selectedIds.delete(opt.id);
      if (checkbox) checkbox.checked = false;
    } else {
      this.#selectedIds.add(opt.id);
      if (checkbox) checkbox.checked = true;
    }
  }

  protected onFocusChange(idx: number, prev: number): void {
    const prevRow = this.rowAt(prev);
    if (prevRow) prevRow.style.background = '';
    const nextRow = this.rowAt(idx);
    if (nextRow) nextRow.style.background = DAISY_COLORS.hover;
  }
}
