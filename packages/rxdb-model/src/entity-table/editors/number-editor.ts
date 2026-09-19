import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';
import { DAISY_COLORS, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/**
 * 数字输入编辑器
 *
 * 在单元格上方弹出固定定位输入框，输入时实时校验并显示红色错误提示。
 * Enter / Tab 提交；Escape 恢复原值；点击外部提交，提交失败时恢复原值。
 */
export class NumberEditor implements IEditor<unknown> {
  #value: number | null = null;
  #originalValue: number | null = null;
  #input: HTMLInputElement | null = null;
  #tooltip: HTMLDivElement | null = null;
  #container: HTMLElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;
  readonly #isInteger: boolean;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType: string;

  /**
   * 创建数字编辑器
   *
   * @param isInteger - true 为整数模式，false（默认）为小数模式
   */
  constructor(isInteger = false) {
    this.#isInteger = isInteger;
    this.editorType = isInteger ? 'integer-editor' : 'number-editor';
  }

  /** 创建并显示输入框与错误提示浮层，绑定输入校验与提交逻辑 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#container = container;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;

    if (origin != null && origin !== '') {
      const n = this.#isInteger ? parseInt(String(origin), 10) : parseFloat(String(origin));
      this.#value = isNaN(n) ? null : n;
    } else {
      this.#value = null;
    }
    this.#originalValue = this.#value;

    const rect = ctx.referencePosition.rect;
    const cRect = container.getBoundingClientRect();
    const absLeft = cRect.left + rect.left;
    const absTop = cRect.top + rect.top;
    const w = Math.max(60, rect.width ?? 0);
    const h = Math.max(24, rect.height ?? 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = this.#isInteger ? 'numeric' : 'decimal';
    input.value = this.#value != null ? String(this.#value) : '';
    input.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:4px',
      'box-sizing:border-box',
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      'border-radius:0',
      `border:2px solid ${DAISY_COLORS.primary}`,
      'outline:none',
      'font-size:13px',
      `left:${absLeft}px`,
      `top:${absTop}px`,
      `width:${w}px`,
      `height:${h}px`
    ].join(';');

    const tooltip = document.createElement('div');
    tooltip.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'padding:4px 8px',
      'font-size:11px',
      `color:${DAISY_COLORS.errorContent}`,
      `background:${DAISY_COLORS.error}`,
      'border-radius:4px',
      'box-shadow:0 2px 8px rgba(0,0,0,.15)',
      'white-space:nowrap',
      'display:none',
      'pointer-events:none',
      `left:${absLeft}px`,
      `top:${absTop + h + 2}px`
    ].join(';');

    const setError = (show: boolean, msg?: string) => {
      if (show && msg) {
        tooltip.textContent = msg;
        tooltip.style.display = 'block';
        input.style.borderColor = DAISY_COLORS.error;
      } else {
        tooltip.textContent = '';
        tooltip.style.display = 'none';
        input.style.borderColor = DAISY_COLORS.primary;
      }
    };

    input.addEventListener('input', () => {
      const v = input.value;
      if (v !== '' && !this.#isValid(v)) {
        setError(true, this.#isInteger ? '请输入整数' : '请输入有效数字');
      } else {
        setError(false);
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (this.#tryCommit(input.value)) {
          this.#endEdit?.();
        } else {
          setError(true, this.#isInteger ? '请输入整数（如 42、-7）' : '请输入有效数字（如 3.14、-2）');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#originalValue;
        this.#endEdit?.();
      }
    });

    document.body.appendChild(input);
    document.body.appendChild(tooltip);
    this.#input = input;
    this.#tooltip = tooltip;

    this.#outsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target !== input && !tooltip.contains(target)) {
        if (!this.#tryCommit(input.value)) {
          this.#value = this.#originalValue;
        }
        this.#cleanup();
        this.#endEdit?.();
      }
    };
    scheduleEditorSetup(() => {
      if (!this.#outsideHandler) return;
      document.addEventListener('mousedown', this.#outsideHandler, { capture: true });
      input.focus();
      input.select();
    });
  }

  /** 返回当前数值，空值为 null */
  getValue(): number | null {
    return this.#value;
  }

  /** 移除输入框与提示浮层，解绑全局点击事件 */
  onEnd(): void {
    this.#cleanup();
  }

  /** 判断目标元素是否属于本编辑器（输入框或错误提示浮层） */
  isEditorElement(el: HTMLElement | EventTarget): boolean {
    const node = el as Node;
    return node === this.#input || this.#tooltip?.contains(node) === true;
  }

  /** 按新的单元格矩形重新定位输入框与错误提示浮层 */
  adjustPosition(rect: RectProps): void {
    const input = this.#input;
    const container = this.#container;
    if (!input || !container) return;
    const cRect = container.getBoundingClientRect();
    const absLeft = cRect.left + rect.left;
    const absTop = cRect.top + rect.top;
    const h = Math.max(24, rect.height ?? 0);
    input.style.left = `${absLeft}px`;
    input.style.top = `${absTop}px`;
    if (this.#tooltip) {
      this.#tooltip.style.left = `${absLeft}px`;
      this.#tooltip.style.top = `${absTop + h + 2}px`;
    }
  }

  #isValid(v: string): boolean {
    if (v.trim() === '') return true;
    if (this.#isInteger) return /^-?\d+$/.test(v.trim());
    return !isNaN(Number(v.trim()));
  }

  #tryCommit(v: string): boolean {
    if (v.trim() === '') {
      this.#value = null;
      return true;
    }
    if (this.#isInteger) {
      if (!/^-?\d+$/.test(v.trim())) return false;
      this.#value = parseInt(v.trim(), 10);
      return true;
    }
    const n = Number(v.trim());
    if (isNaN(n)) return false;
    this.#value = n;
    return true;
  }

  #cleanup(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, { capture: true });
      this.#outsideHandler = null;
    }
    this.#input?.remove();
    this.#input = null;
    this.#tooltip?.remove();
    this.#tooltip = null;
    this.#container = null;
  }
}
