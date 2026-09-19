import { DAISY_COLORS, GlobalOverlayEditor } from './global-overlay-editor.js';

/** 多选选项：id + 显示名 */
export interface MultiSelectOption {
  /** 选项唯一标识 */
  id: string;
  /** 选项显示名 */
  name: string;
}

/**
 * VTable 自定义多选编辑器
 *
 * 弹出浮层显示 checkbox 列表，支持 toggle 多选。
 * 确认后将选中 ID 以逗号分隔写回单元格。
 * 点击外部或 Esc 提交并关闭。
 */
export class MultiSelectEditor extends GlobalOverlayEditor {
  readonly #options: MultiSelectOption[];
  readonly #selectedIds: Set<string>;
  readonly #onCommit: ((ids: string[]) => void) | undefined;

  protected get initialFocusIndex(): number {
    return -1;
  }

  protected get itemCount(): number {
    return this.#options.length;
  }

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'multiselect';

  /**
   * 创建多选编辑器
   *
   * @param options - 全部可选项
   * @param selectedIds - 初始选中的选项 ID
   * @param onCommit - 结束编辑时的提交回调，收到当前选中的 ID 列表
   */
  constructor(options: MultiSelectOption[], selectedIds: string[], onCommit?: (ids: string[]) => void) {
    super();
    this.#options = options;
    this.#selectedIds = new Set(selectedIds);
    this.#onCommit = onCommit;
  }

  /** 结束编辑时以当前选中的 ID 列表触发提交回调 */
  override onEnd(): void {
    this.#onCommit?.([...this.#selectedIds]);
    super.onEnd();
  }

  /** 返回当前选中选项的显示名，以逗号加空格拼接 */
  getValue(): string {
    return this.#options
      .filter(o => this.#selectedIds.has(o.id))
      .map(o => o.name)
      .join(', ');
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
      const row = document.createElement('div');
      row.dataset['idx'] = String(idx);
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:6px',
        'padding:5px 12px',
        'cursor:pointer',
        'font-size:13px',
        'user-select:none',
        `color:${DAISY_COLORS.text}`
      ].join(';');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.#selectedIds.has(opt.id);
      checkbox.style.cssText = 'pointer-events:none;flex-shrink:0';

      const label = document.createElement('span');
      label.textContent = opt.name;

      row.appendChild(checkbox);
      row.appendChild(label);

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
    const opt = this.#options[idx];
    if (!opt) return;
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
