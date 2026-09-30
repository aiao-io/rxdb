import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';
import { DAISY_COLORS, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/** 十六进制颜色（允许省略 `#`） */
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

/** 把用户输入规范化为 `#rrggbb`；输入非法返回 null。 */
const normalizeHexColor = (text: string): string | null => {
  const trimmed = text.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
};

/**
 * 颜色编辑器
 *
 * 在单元格上方弹出原生取色器 + 十六进制文本输入，两者双向同步。
 * Enter / Tab 提交；Escape 恢复原值；点击外部提交，提交失败时恢复原值。
 */
export class ColorEditor implements IEditor<unknown> {
  #value: string | null = null;
  #originalValue: string | null = null;
  #input: HTMLInputElement | null = null;
  #picker: HTMLInputElement | null = null;
  #tooltip: HTMLDivElement | null = null;
  #container: HTMLElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'color-editor';

  /** 创建并显示取色器、文本输入与错误提示浮层 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#container = container;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
    const normalized = origin != null && origin !== '' ? normalizeHexColor(String(origin)) : null;
    this.#value = normalized;
    this.#originalValue = normalized;

    const rect = ctx.referencePosition.rect;
    const cRect = container.getBoundingClientRect();
    const absLeft = cRect.left + rect.left;
    const absTop = cRect.top + rect.top;
    const w = Math.max(150, rect.width ?? 0);
    const h = Math.max(24, rect.height ?? 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '#rrggbb';
    input.value = this.#value ?? '';
    input.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:4px 6px',
      'box-sizing:border-box',
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      'border-radius:0',
      `border:2px solid ${DAISY_COLORS.primary}`,
      'outline:none',
      'font-size:13px',
      `left:${absLeft + 26}px`,
      `top:${absTop}px`,
      `width:${Math.max(60, w - 26)}px`,
      `height:${h}px`
    ].join(';');

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = this.#value ?? '#000000';
    picker.title = '选择颜色';
    picker.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'box-sizing:border-box',
      'padding:0',
      'border:none',
      'background:transparent',
      'cursor:pointer',
      `left:${absLeft + 4}px`,
      `top:${absTop + 2}px`,
      'width:22px',
      'height:20px'
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

    picker.addEventListener('input', () => {
      input.value = picker.value;
      setError(false);
    });

    input.addEventListener('input', () => {
      const normalizedInput = normalizeHexColor(input.value);
      if (input.value !== '' && normalizedInput !== null) {
        picker.value = normalizedInput;
        setError(false);
      }
    });

    const commit = (): boolean => {
      if (input.value.trim() === '') {
        this.#value = null;
        return true;
      }
      const normalizedInput = normalizeHexColor(input.value);
      if (normalizedInput === null) return false;
      this.#value = normalizedInput;
      return true;
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (commit()) {
          this.#endEdit?.();
        } else {
          setError(true, '请输入 #rrggbb 格式的颜色');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#originalValue;
        this.#endEdit?.();
      }
    });

    document.body.appendChild(picker);
    document.body.appendChild(input);
    document.body.appendChild(tooltip);
    this.#input = input;
    this.#picker = picker;
    this.#tooltip = tooltip;

    this.#outsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target !== input && target !== picker && !tooltip.contains(target)) {
        if (!commit()) {
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

  /** 返回当前颜色值，空值为 null */
  getValue(): string | null {
    return this.#value;
  }

  /** 移除输入框与提示浮层，解绑全局点击事件 */
  onEnd(): void {
    this.#cleanup();
  }

  /** 判断目标元素是否属于本编辑器 */
  isEditorElement(el: HTMLElement | EventTarget): boolean {
    const node = el as Node;
    return node === this.#input || node === this.#picker || this.#tooltip?.contains(node) === true;
  }

  /** 按新的单元格矩形重新定位取色器、输入框与提示浮层 */
  adjustPosition(rect: RectProps): void {
    const input = this.#input;
    const container = this.#container;
    if (!input || !container) return;
    const cRect = container.getBoundingClientRect();
    const absLeft = cRect.left + rect.left;
    const absTop = cRect.top + rect.top;
    const h = Math.max(24, rect.height ?? 0);
    if (this.#picker) {
      this.#picker.style.left = `${absLeft + 4}px`;
      this.#picker.style.top = `${absTop + 2}px`;
    }
    input.style.left = `${absLeft + 26}px`;
    input.style.top = `${absTop}px`;
    if (this.#tooltip) {
      this.#tooltip.style.left = `${absLeft}px`;
      this.#tooltip.style.top = `${absTop + h + 2}px`;
    }
  }

  #cleanup(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, { capture: true });
      this.#outsideHandler = null;
    }
    this.#input?.remove();
    this.#input = null;
    this.#picker?.remove();
    this.#picker = null;
    this.#tooltip?.remove();
    this.#tooltip = null;
    this.#container = null;
  }
}
