import type { EditContext, IEditor } from '@visactor/vtable-editors';
import { DAISY_COLORS, positionOverlayPanel, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/**
 * JSON / KeyValue 编辑器
 *
 * 浮层显示带语法提示的 textarea，适合编辑 json 和 keyValue 类型。
 * - Ctrl+Enter：验证并提交
 * - Escape：取消（恢复原始值）
 * - 点击外部：best-effort 提交（JSON 合法则提交，否则保持原始值）
 * - 实时显示 JSON 格式错误
 */
export class JsonEditor implements IEditor<unknown> {
  #value: unknown = null;
  #originalValue: unknown = null;
  #panel: HTMLDivElement | null = null;
  #textarea: HTMLTextAreaElement | null = null;
  #errorEl: HTMLDivElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'json-editor';

  /** 打开编辑器：构建浮层 textarea 面板并初始化原始值 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
    this.#value = origin ?? null;
    this.#originalValue = this.#value;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:8px',
      'min-width:280px',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      'display:flex',
      'flex-direction:column',
      'gap:4px'
    ].join(';');

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px';

    const hint = document.createElement('div');
    hint.style.cssText = `font-size:12px;opacity:0.45;color:${DAISY_COLORS.text}`;
    hint.textContent = 'Ctrl+Enter 确认 · Esc 取消';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';
    copyBtn.title = '复制 JSON';
    copyBtn.style.cssText = [
      'font-size:12px',
      `color:${DAISY_COLORS.text}`,
      'opacity:0.6',
      'background:none',
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'cursor:pointer',
      'padding:1px 6px',
      'white-space:nowrap',
      'flex-shrink:0'
    ].join(';');
    copyBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.#textarea?.value ?? '';
      navigator.clipboard?.writeText(text).catch(() => {
        /* ignore */
      });
      copyBtn.textContent = '✓';
      setTimeout(() => {
        copyBtn.textContent = '复制';
      }, 1200);
    });

    topRow.appendChild(hint);
    topRow.appendChild(copyBtn);

    const textarea = document.createElement('textarea');
    textarea.style.cssText = [
      'width:280px',
      'height:140px',
      'resize:both',
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'padding:6px',
      'font-size:12px',
      'font-family:monospace',
      'outline:none',
      'line-height:1.5'
    ].join(';');
    try {
      textarea.value = this.#value != null ? JSON.stringify(this.#value, null, 2) : '';
    } catch {
      textarea.value = '';
    }
    this.#textarea = textarea;

    const errorEl = document.createElement('div');
    errorEl.style.cssText = `font-size:12px;color:${DAISY_COLORS.error};min-height:14px;word-break:break-all`;
    this.#errorEl = errorEl;

    textarea.addEventListener('input', () => this.#validate());
    textarea.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (this.#tryCommit()) this.#endEdit?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#originalValue; // 恢复原始值
        this.#endEdit?.();
      }
      // Enter 在 textarea 里正常换行，不拦截
    });

    panel.appendChild(topRow);
    panel.appendChild(textarea);
    panel.appendChild(errorEl);
    document.body.appendChild(panel);
    positionOverlayPanel(panel, ctx.referencePosition.rect, ctx.container as HTMLElement, 200, { maxRight: 320 });
    this.#panel = panel;

    this.#outsideHandler = (e: MouseEvent) => {
      if (!panel.contains(e.target as Node)) {
        // 点击外部：best-effort 提交
        this.#tryCommit();
        this.#cleanup();
        this.#endEdit?.();
      }
    };
    scheduleEditorSetup(() => {
      if (!this.#outsideHandler) return;
      document.addEventListener('mousedown', this.#outsideHandler, { capture: true });
      textarea.focus();
      // 光标移到末尾
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    });
  }

  /** 返回当前编辑值 */
  getValue(): unknown {
    return this.#value;
  }

  /** 结束编辑：清理浮层面板与事件监听 */
  onEnd(): void {
    this.#cleanup();
  }

  /** 判断目标元素是否属于编辑器浮层 */
  isEditorElement(el: HTMLElement | EventTarget): boolean {
    return !!this.#panel?.contains(el as Node);
  }

  #validate(): boolean {
    const text = (this.#textarea?.value ?? '').trim();
    if (!text) {
      if (this.#errorEl) this.#errorEl.textContent = '';
      return true;
    }
    try {
      JSON.parse(text);
      if (this.#errorEl) this.#errorEl.textContent = '';
      return true;
    } catch (e) {
      if (this.#errorEl) this.#errorEl.textContent = `⚠ ${(e as Error).message}`;
      return false;
    }
  }

  #tryCommit(): boolean {
    const text = (this.#textarea?.value ?? '').trim();
    if (!text) {
      this.#value = null;
      return true;
    }
    try {
      this.#value = JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  #cleanup(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, { capture: true });
      this.#outsideHandler = null;
    }
    this.#panel?.remove();
    this.#panel = null;
    this.#textarea = null;
    this.#errorEl = null;
  }
}
