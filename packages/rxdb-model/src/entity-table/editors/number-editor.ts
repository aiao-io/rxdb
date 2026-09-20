import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';
import { DAISY_COLORS, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/** 数字编辑器的可选行为配置 */
export interface NumberEditorOptions {
  /** true 为 64 位大整数模式（值类型 bigint） */
  bigint?: boolean;
  /** 最小值（含） */
  min?: number;
  /** 最大值（含） */
  max?: number;
  /** 取值步长（相对 min 对齐，容差 1e-8） */
  step?: number;
}

/** 步长对齐判定容差：浮点除法残差小于它即视为对齐。 */
const STEP_TOLERANCE = 1e-8;

/** 有符号 64 位整数字面量（十进制） */
const INTEGER_RE = /^-?\d+$/;

/**
 * 数字输入编辑器
 *
 * 在单元格上方弹出固定定位输入框，输入时实时校验并显示红色错误提示。
 * Enter / Tab 提交；Escape 恢复原值；点击外部提交，提交失败时恢复原值。
 * 支持整数 / 小数 / bigint 三种模式，并可按 min / max / step 约束值域。
 */
export class NumberEditor implements IEditor<unknown> {
  #value: number | bigint | null = null;
  #originalValue: number | bigint | null = null;
  #input: HTMLInputElement | null = null;
  #tooltip: HTMLDivElement | null = null;
  #container: HTMLElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;
  readonly #isInteger: boolean;
  readonly #isBigint: boolean;
  readonly #min: number | undefined;
  readonly #max: number | undefined;
  readonly #step: number | undefined;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType: string;

  /**
   * 创建数字编辑器
   *
   * @param isInteger - true 为整数模式，false（默认）为小数模式
   * @param options - 可选行为配置（bigint 模式与值域约束）
   */
  constructor(isInteger = false, options: NumberEditorOptions = {}) {
    this.#isInteger = isInteger;
    this.#isBigint = options.bigint === true;
    this.#min = options.min;
    this.#max = options.max;
    this.#step = options.step;
    this.editorType =
      this.#isBigint ? 'bigint-editor'
      : this.#isInteger ? 'integer-editor'
      : 'number-editor';
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
      const text = String(origin);
      if (this.#isBigint && INTEGER_RE.test(text.trim())) {
        this.#value = BigInt(text.trim());
      } else if (!this.#isBigint) {
        const n = this.#isInteger ? parseInt(text, 10) : parseFloat(text);
        this.#value = isNaN(n) ? null : n;
      } else {
        this.#value = null;
      }
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
    input.inputMode =
      this.#isBigint ? 'numeric'
      : this.#isInteger ? 'numeric'
      : 'decimal';
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
        setError(true, this.#typeErrorHint(false));
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

  /** 返回当前数值（bigint 模式下为 bigint），空值为 null */
  getValue(): number | bigint | null {
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
    if (this.#isBigint) return INTEGER_RE.test(v.trim());
    if (this.#isInteger) return INTEGER_RE.test(v.trim());
    return !isNaN(Number(v.trim()));
  }

  #typeErrorHint(detailed: boolean): string {
    if (this.#isBigint) return detailed ? '请输入 64 位整数（如 42、-7）' : '请输入 64 位整数';
    if (this.#isInteger) return detailed ? '请输入整数（如 42、-7）' : '请输入整数';
    return detailed ? '请输入有效数字（如 3.14、-2）' : '请输入有效数字';
  }

  #boundsError(v: number | bigint): string | null {
    // bigint 模式不携带 format，没有值域约束
    if (this.#isBigint) return null;
    const n = v as number;
    if (this.#min !== undefined && n < this.#min) return `必须不小于 ${this.#min}`;
    if (this.#max !== undefined && n > this.#max) return `必须不大于 ${this.#max}`;
    if (this.#step !== undefined && this.#min !== undefined) {
      const steps = (n - this.#min) / this.#step;
      if (Math.abs(steps - Math.round(steps)) >= STEP_TOLERANCE) return `必须按步长 ${this.#step} 取值`;
    }
    return null;
  }

  #tryCommit(v: string): boolean {
    if (v.trim() === '') {
      this.#value = null;
      return true;
    }
    if (this.#isBigint) {
      if (!INTEGER_RE.test(v.trim())) {
        this.#showError(this.#typeErrorHint(true));
        return false;
      }
      const value = BigInt(v.trim());
      const boundsError = this.#boundsError(value);
      if (boundsError) {
        this.#showError(boundsError);
        return false;
      }
      this.#value = value;
      return true;
    }
    if (this.#isInteger) {
      if (!INTEGER_RE.test(v.trim())) {
        this.#showError(this.#typeErrorHint(true));
        return false;
      }
      this.#value = parseInt(v.trim(), 10);
      return this.#commitNumber(this.#value);
    }
    const n = Number(v.trim());
    if (isNaN(n)) {
      this.#showError(this.#typeErrorHint(true));
      return false;
    }
    this.#value = n;
    return this.#commitNumber(n);
  }

  #commitNumber(n: number): boolean {
    const boundsError = this.#boundsError(n);
    if (boundsError) {
      this.#showError(boundsError);
      return false;
    }
    return true;
  }

  #showError(message: string): void {
    const tooltip = this.#tooltip;
    const input = this.#input;
    if (!tooltip || !input) return;
    tooltip.textContent = message;
    tooltip.style.display = 'block';
    input.style.borderColor = DAISY_COLORS.error;
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
