import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';
import { UUID_RE } from '../../entity-value.utils.js';
import { DAISY_COLORS, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/** UUID 格式正则（re-export，定义见 entity-value.utils） */
export { UUID_RE };

/**
 * UUID 文本编辑器
 *
 * 在单元格上方弹出固定定位输入框，提交时校验 UUID 格式（非法则红色提示）。
 * Enter / Tab 提交；Escape 恢复原值；点击外部提交，非法输入恢复原值。
 */
export class UuidEditor implements IEditor<unknown> {
  #value: string | null = null;
  #originalValue: string | null = null;
  #input: HTMLInputElement | null = null;
  #tooltip: HTMLDivElement | null = null;
  #container: HTMLElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'uuid-editor';

  /** 创建并显示输入框与错误提示浮层，绑定格式校验与提交逻辑 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#container = container;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;
    this.#value = origin != null && origin !== '' ? String(origin).trim() : null;
    this.#originalValue = this.#value;

    const rect = ctx.referencePosition.rect;
    const cRect = container.getBoundingClientRect();
    const absLeft = cRect.left + rect.left;
    const absTop = cRect.top + rect.top;
    const w = Math.max(80, rect.width ?? 0);
    const h = Math.max(24, rect.height ?? 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.#value ?? '';
    input.placeholder = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
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

    const setError = (msg: string) => {
      if (msg) {
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
      const v = input.value.trim();
      if (v === '' || UUID_RE.test(v)) {
        setError('');
      } else {
        setError('请输入合法的 UUID 格式');
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const v = input.value.trim();
        if (v === '') {
          this.#value = null;
          this.#endEdit?.();
        } else if (UUID_RE.test(v)) {
          this.#value = v.toLowerCase();
          this.#endEdit?.();
        } else {
          setError('请输入合法的 UUID 格式 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
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
        const v = input.value.trim();
        if (v === '' || UUID_RE.test(v)) {
          this.#value = v === '' ? null : v.toLowerCase();
        } else {
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

  /** 返回当前 UUID 值，空值为 null */
  getValue(): string | null {
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
