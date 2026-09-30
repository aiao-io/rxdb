import type { EditContext, IEditor } from '@visactor/vtable-editors';
import type { KVSchemaEntry } from '../columns/column-utils.js';
import { DAISY_COLORS, positionOverlayPanel, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

interface SchemaRow {
  keySelect: HTMLInputElement | HTMLSelectElement;
  valueEl: HTMLInputElement | HTMLSelectElement;
  valueContainer: HTMLDivElement;
  hintEl: HTMLDivElement;
  rowEl: HTMLDivElement;
}

/**
 * KeyValue (Record<string, unknown>) editor — Schema mode only
 *
 * - Key is always a dropdown derived from schema definition
 * - Value input type adapts to the key's schema type
 * - Per-row inline error hints; global summary shown at bottom
 * - Ctrl+Enter / confirm button: validate & commit
 * - Escape / cancel button: revert to original value
 */
export class KeyValueEditor implements IEditor<unknown> {
  #value: Record<string, unknown> = {};
  #panel: HTMLDivElement | null = null;
  #schemaRows: SchemaRow[] = [];
  #rowsContainer: HTMLDivElement | null = null;
  #errorEl: HTMLDivElement | null = null;
  #addBtn: HTMLButtonElement | null = null;
  #endEdit: (() => void) | null = null;
  #abortController: AbortController | null = null;
  #initialValue: Record<string, unknown> = {};
  #schema: Record<string, KVSchemaEntry> = {};

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'key-value-editor';

  /**
   * 创建 KeyValue 编辑器
   *
   * @param schema 可选的键 Schema 定义；不传或为空时进入自由模式
   */
  constructor(schema?: Record<string, KVSchemaEntry> | null) {
    this.#schema = schema ?? {};
  }

  /** 打开编辑器：构建键值对编辑浮层并按初始值 / Schema 填充行 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;

    const initial = this.#parseInitial(origin);
    this.#initialValue = initial;
    this.#value = { ...initial };
    this.#schemaRows = [];
    this.#abortController = new AbortController();

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:8px',
      'width:380px',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      'display:flex',
      'flex-direction:column',
      'gap:6px'
    ].join(';');

    // column header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:grid',
      'grid-template-columns:1fr 1fr 28px',
      'gap:4px',
      'padding:0 2px',
      'font-size:12px',
      'font-weight:600',
      'opacity:0.6',
      `color:${DAISY_COLORS.text}`
    ].join(';');
    for (const text of ['Key', 'Value', '']) {
      const cell = document.createElement('div');
      cell.textContent = text;
      header.appendChild(cell);
    }

    // rows container
    const rowsContainer = document.createElement('div');
    rowsContainer.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'max-height:280px',
      'overflow-y:auto'
    ].join(';');
    this.#rowsContainer = rowsContainer;

    // global error hint
    const errorEl = document.createElement('div');
    errorEl.style.cssText = `font-size:12px;color:${DAISY_COLORS.error};min-height:16px;word-break:break-all`;
    this.#errorEl = errorEl;

    // footer
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:4px';

    const addBtn = this.#makeBtn('+ \u6dfb\u52a0\u884c', false);
    this.#addBtn = addBtn;
    addBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      this.#appendSchemaRow();
      this.#refreshAllKeySelects();
      this.#updateAddBtn();
    });

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:4px';

    const confirmBtn = this.#makeBtn('\u2713 \u786e\u8ba4', true);
    confirmBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.#commit()) this.#endEdit?.();
    });

    const cancelBtn = this.#makeBtn('\u2717 \u53d6\u6d88', false);
    cancelBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      this.#value = this.#initialValue;
      this.#endEdit?.();
    });

    btnGroup.appendChild(confirmBtn);
    btnGroup.appendChild(cancelBtn);
    footer.appendChild(addBtn);
    footer.appendChild(btnGroup);

    panel.appendChild(header);
    panel.appendChild(rowsContainer);
    panel.appendChild(errorEl);
    panel.appendChild(footer);
    document.body.appendChild(panel);
    this.#panel = panel;

    // fill rows: schema mode uses schema key order; free-form mode uses initial data keys
    const schemaKeys = Object.keys(this.#schema);
    if (schemaKeys.length > 0) {
      for (const k of schemaKeys) {
        if (k in initial) {
          const rawVal = initial[k];
          const strVal = rawVal == null ? '' : String(rawVal);
          this.#appendSchemaRow(k, strVal);
        }
      }
    } else {
      for (const [k, v] of Object.entries(initial)) {
        this.#appendSchemaRow(k, v == null ? '' : String(v));
      }
    }
    if (this.#schemaRows.length === 0) this.#appendSchemaRow();
    this.#refreshAllKeySelects();
    this.#updateAddBtn();

    this.#positionPanel(panel, ctx.referencePosition.rect, ctx.container as HTMLElement, 340);

    panel.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (this.#commit()) this.#endEdit?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#initialValue;
        this.#endEdit?.();
      }
    });

    const outsideHandler = (e: MouseEvent) => {
      if (!panel.contains(e.target as Node)) {
        this.#commit();
        this.#cleanup();
        this.#endEdit?.();
      }
    };
    scheduleEditorSetup(() => {
      if (!this.#abortController) return;
      document.addEventListener('mousedown', outsideHandler, { capture: true, signal: this.#abortController.signal });
      this.#schemaRows[0]?.keySelect.focus();
    });
  }

  /** 返回当前编辑的键值对象 */
  getValue(): Record<string, unknown> {
    return this.#value;
  }

  /** 结束编辑：中止未决监听并清理浮层 */
  onEnd(): void {
    this.#cleanup();
  }

  /** 判断目标元素是否属于编辑器浮层 */
  isEditorElement(el: HTMLElement | EventTarget): boolean {
    return !!this.#panel?.contains(el as Node);
  }

  // ── private ───────────────────────────────────────────────────────────────

  #parseInitial(origin: unknown): Record<string, unknown> {
    if (origin == null || origin === '') return {};
    if (typeof origin === 'object' && !Array.isArray(origin)) {
      return { ...(origin as Record<string, unknown>) };
    }
    if (typeof origin === 'string') {
      try {
        const parsed = JSON.parse(origin) as unknown;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return { ...(parsed as Record<string, unknown>) };
        }
      } catch {
        /* ignore */
      }
    }
    return {};
  }

  #makeBtn(text: string, primary: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.cssText = [
      'font-size:12px',
      `color:${DAISY_COLORS.text}`,
      `background:${primary ? DAISY_COLORS.selectedBg : 'none'}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'cursor:pointer',
      'padding:2px 10px',
      'white-space:nowrap'
    ].join(';');
    return btn;
  }

  #appendSchemaRow(key?: string, value?: string): void {
    const container = this.#rowsContainer;
    if (!container) return;

    const schema = this.#schema;
    const allKeys = Object.keys(schema);
    const isFreeForm = allKeys.length === 0;

    const usedKeys = this.#getUsedSchemaKeys();
    const initialKey = key ?? (isFreeForm ? '' : (allKeys.find(k => !usedKeys.has(k)) ?? allKeys[0] ?? ''));

    const fieldStyle = [
      'min-width:0',
      'width:100%',
      'box-sizing:border-box',
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'padding:3px 6px',
      'font-size:12px',
      'outline:none'
    ].join(';');

    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 28px;gap:4px;align-items:start';

    // key element: text input (free-form) or dropdown (schema)
    let keySelect: HTMLInputElement | HTMLSelectElement;
    if (isFreeForm) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = initialKey;
      inp.placeholder = 'Key';
      inp.style.cssText = fieldStyle;
      keySelect = inp;
    } else {
      const sel = document.createElement('select');
      sel.style.cssText = fieldStyle;
      for (const [k, entry] of Object.entries(schema)) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = entry.label ?? k;
        if (k === initialKey) opt.selected = true;
        sel.appendChild(opt);
      }
      keySelect = sel;
    }

    // value container (value input + hint below)
    const valueContainer = document.createElement('div');
    valueContainer.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px';

    const initEntry = isFreeForm ? undefined : schema[initialKey];
    const nullable = initEntry?.nullable ?? true;
    const initValEl = this.#buildValueEl(initEntry?.type, value ?? '', nullable);
    initValEl.style.cssText = fieldStyle;

    const hintEl = document.createElement('div');
    hintEl.style.cssText = `font-size:11px;color:${DAISY_COLORS.error};min-height:0;display:none;word-break:break-all`;

    valueContainer.appendChild(initValEl);
    valueContainer.appendChild(hintEl);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '\u00d7';
    delBtn.title = '\u5220\u9664\u884c';
    delBtn.style.cssText = [
      'width:22px',
      'height:22px',
      'flex-shrink:0',
      'margin-top:3px',
      'background:none',
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'cursor:pointer',
      'font-size:14px',
      'line-height:1',
      'padding:0',
      `color:${DAISY_COLORS.text}`,
      'display:flex',
      'align-items:center',
      'justify-content:center'
    ].join(';');

    const row: SchemaRow = { keySelect, valueEl: initValEl, valueContainer, hintEl, rowEl };
    this.#schemaRows.push(row);

    const clearValidationState = () => {
      this.#clearRowHint(row);
      this.#clearGlobalError();
    };

    keySelect.addEventListener('change', () => {
      if (isFreeForm) return;
      const newKey = keySelect.value;
      const entry = schema[newKey];
      const nbl = entry?.nullable ?? true;
      const newValEl = this.#buildValueEl(entry?.type, '', nbl);
      newValEl.style.cssText = fieldStyle;
      valueContainer.replaceChild(newValEl, row.valueEl);
      row.valueEl = newValEl;
      clearValidationState();
      this.#refreshAllKeySelects();
    });

    if (keySelect instanceof HTMLInputElement) {
      keySelect.addEventListener('input', clearValidationState);
    }

    initValEl.addEventListener('input', () => {
      clearValidationState();
    });

    delBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const idx = this.#schemaRows.indexOf(row);
      if (idx >= 0) {
        this.#schemaRows.splice(idx, 1);
        rowEl.remove();
        this.#refreshAllKeySelects();
        this.#clearGlobalError();
        this.#updateAddBtn();
      }
    });

    rowEl.appendChild(keySelect);
    rowEl.appendChild(valueContainer);
    rowEl.appendChild(delBtn);
    container.appendChild(rowEl);
    container.scrollTop = container.scrollHeight;
  }

  #buildValueEl(type?: string, value?: string, nullable?: boolean): HTMLInputElement | HTMLSelectElement {
    const v = value ?? '';
    if (type === 'boolean') {
      const sel = document.createElement('select');
      if (nullable) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(\u672a\u8bbe\u7f6e)';
        if (v === '') opt.selected = true;
        sel.appendChild(opt);
      }
      for (const [val, label] of [
        ['true', '\u662f (true)'],
        ['false', '\u5426 (false)']
      ] as const) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === v) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }

    const inp = document.createElement('input');
    if (type === 'date') {
      inp.type = 'datetime-local';
      if (v) {
        try {
          const d = new Date(v);
          if (!isNaN(d.getTime())) {
            inp.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          } else {
            inp.value = v;
          }
        } catch {
          inp.value = v;
        }
      }
    } else {
      inp.type = type === 'number' || type === 'integer' ? 'number' : 'text';
      if (type === 'integer') inp.step = '1';
      inp.value = v;
      inp.placeholder =
        type === 'number' ? '\u5982 3.14\u3001-2'
        : type === 'integer' ? '\u5982 42\u3001-7'
        : '\u8bf7\u8f93\u5165\u503c';
    }
    return inp;
  }

  #validateRow(row: SchemaRow): string {
    const key = row.keySelect.value;
    const entry = this.#schema[key];
    const raw = row.valueEl.value.trim();
    const label = entry?.label ?? key;

    if (entry?.required && raw === '') return `\u300c${label}\u300d\u4e3a\u5fc5\u586b\u9879`;
    if (raw === '') return '';

    const type = entry?.type;
    if (type === 'number' && isNaN(Number(raw)))
      return `\u300c${label}\u300d\u8bf7\u8f93\u5165\u6709\u6548\u6570\u5b57\uff08\u5982 3.14\u3001-2\uff09`;
    if (type === 'integer' && !/^-?\d+$/.test(raw))
      return `\u300c${label}\u300d\u8bf7\u8f93\u5165\u6574\u6570\uff08\u5982 42\u3001-7\uff09`;
    if (type === 'date' && isNaN(new Date(row.valueEl.value).getTime()))
      return `\u300c${label}\u300d\u8bf7\u8f93\u5165\u6709\u6548\u65e5\u671f`;
    return '';
  }

  #getUsedSchemaKeys(): Set<string> {
    const used = new Set<string>();
    for (const r of this.#schemaRows) {
      if (r.keySelect.value) used.add(r.keySelect.value);
    }
    return used;
  }

  #getDuplicateKeys(): Set<string> {
    const counts = new Map<string, number>();
    for (const row of this.#schemaRows) {
      const key = row.keySelect.value;
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const duplicates = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) duplicates.add(key);
    });
    return duplicates;
  }

  #refreshAllKeySelects(): void {
    for (let i = 0; i < this.#schemaRows.length; i++) {
      const row = this.#schemaRows[i];
      if (!(row.keySelect instanceof HTMLSelectElement)) continue;
      const currentKey = row.keySelect.value;
      const others = new Set<string>();
      for (let j = 0; j < this.#schemaRows.length; j++) {
        if (j !== i) others.add(this.#schemaRows[j].keySelect.value);
      }
      for (const opt of Array.from(row.keySelect.options)) {
        opt.disabled = opt.value !== currentKey && others.has(opt.value);
      }
    }
  }

  #updateAddBtn(): void {
    if (!this.#addBtn) return;
    const allKeys = Object.keys(this.#schema);
    if (allKeys.length === 0) {
      this.#addBtn.disabled = false;
      this.#addBtn.style.opacity = '1';
      this.#addBtn.style.cursor = 'pointer';
      return;
    }
    const allUsed = this.#getUsedSchemaKeys().size >= allKeys.length;
    this.#addBtn.disabled = allUsed;
    this.#addBtn.style.opacity = allUsed ? '0.4' : '1';
    this.#addBtn.style.cursor = allUsed ? 'not-allowed' : 'pointer';
  }

  #clearRowHint(row: SchemaRow): void {
    row.hintEl.style.display = 'none';
    row.hintEl.textContent = '';
    row.valueEl.style.borderColor = DAISY_COLORS.border;
  }

  #clearGlobalError(): void {
    if (this.#errorEl) this.#errorEl.textContent = '';
  }

  #validate(): boolean {
    const errors: string[] = [];
    const duplicateKeys = this.#getDuplicateKeys();
    for (const row of this.#schemaRows) {
      const key = row.keySelect.value;
      const msg = key && duplicateKeys.has(key) ? `键「${key}」重复` : this.#validateRow(row);
      if (msg) {
        errors.push(msg);
        row.hintEl.textContent = msg;
        row.hintEl.style.display = 'block';
        row.valueEl.style.borderColor = DAISY_COLORS.error;
      } else {
        this.#clearRowHint(row);
      }
    }
    if (errors.length > 0 && this.#errorEl) {
      const extra = errors.length - 1;
      this.#errorEl.textContent =
        extra > 0 ? `\u26a0 ${errors[0]}\uff08\u53ca\u5176\u4ed6 ${extra} \u5904\uff09` : `\u26a0 ${errors[0]}`;
      return false;
    }
    this.#clearGlobalError();
    return true;
  }

  #commit(): boolean {
    if (!this.#validate()) return false;
    const result: Record<string, unknown> = {};
    for (const row of this.#schemaRows) {
      const k = row.keySelect.value;
      if (!k) continue;
      const entry = this.#schema[k];
      const raw = row.valueEl.value;
      if (entry?.type === 'boolean') {
        result[k] = raw === '' ? null : raw === 'true';
      } else if (entry?.type === 'number') {
        result[k] = raw !== '' ? Number(raw) : null;
      } else if (entry?.type === 'integer') {
        result[k] = raw !== '' ? parseInt(raw, 10) : null;
      } else if (entry?.type === 'date') {
        result[k] = raw !== '' ? new Date(raw).toISOString() : null;
      } else {
        result[k] =
          raw !== '' ? raw
          : entry?.nullable !== false ? null
          : '';
      }
    }
    this.#value = result;
    return true;
  }

  #positionPanel(
    panel: HTMLElement,
    rect: { left: number; top: number; width?: number; height?: number },
    container: HTMLElement,
    estimatedHeight: number
  ): void {
    positionOverlayPanel(panel, rect, container, estimatedHeight, { maxRight: 400 });
  }

  #cleanup(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    this.#panel?.remove();
    this.#panel = null;
    this.#rowsContainer = null;
    this.#errorEl = null;
    this.#addBtn = null;
    this.#schemaRows = [];
  }
}
