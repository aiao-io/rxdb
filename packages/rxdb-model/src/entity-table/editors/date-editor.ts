import type { EditContext, IEditor } from '@visactor/vtable-editors';
import { DAISY_COLORS, positionOverlayPanel, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/**
 * 日期时间选择编辑器
 *
 * 直接覆盖单元格显示原生 datetime-local 输入框。
 * - Enter / Tab：确认
 * - Escape：取消（恢复原始值）
 * - 点击外部：确认并关闭
 * - 「清除」按钮：将值设为 null
 */
export class DateEditor implements IEditor<unknown> {
  #value: Date | null = null;
  #originalValue: Date | null = null;
  #panel: HTMLDivElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType = 'date-editor';

  /** 打开编辑器：构建浮层面板并初始化原生 datetime-local 输入 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;

    if (origin instanceof Date) {
      this.#value = isNaN(origin.getTime()) ? null : new Date(origin.getTime());
    } else if (origin != null && origin !== '') {
      const d = new Date(origin as string | number);
      this.#value = isNaN(d.getTime()) ? null : d;
    } else {
      this.#value = null;
    }
    this.#originalValue = this.#value ? new Date(this.#value.getTime()) : null;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:4px 6px',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:6px',
      'box-shadow:0 2px 8px rgba(0,0,0,.15)',
      'display:flex',
      'flex-direction:row',
      'align-items:center',
      'gap:4px'
    ].join(';');

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.style.cssText = [
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      'border:none',
      'outline:none',
      'font-size:13px',
      'flex:1',
      'min-width:200px'
    ].join(';');
    if (this.#value) input.value = this.#formatForInput(this.#value);

    input.addEventListener('change', () => {
      this.#value = this.#resolveValue(input.value);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#resolveValue(input.value);
        this.#endEdit?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#value = this.#originalValue; // 恢复原始值
        this.#endEdit?.();
      }
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '清除';
    clearBtn.style.cssText = [
      'font-size:12px',
      `color:${DAISY_COLORS.text}`,
      'opacity:0.6',
      'background:none',
      'border:none',
      'cursor:pointer',
      'white-space:nowrap',
      'padding:0 2px',
      'flex-shrink:0'
    ].join(';');
    clearBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      this.#value = null;
      this.#endEdit?.();
    });

    panel.appendChild(input);
    panel.appendChild(clearBtn);
    document.body.appendChild(panel);
    positionOverlayPanel(panel, ctx.referencePosition.rect, ctx.container as HTMLElement, 80, { minWidth: 240 });
    this.#panel = panel;

    this.#outsideHandler = (e: MouseEvent) => {
      if (!panel.contains(e.target as Node)) {
        this.#value = this.#resolveValue(input.value);
        this.#cleanup();
        this.#endEdit?.();
      }
    };
    scheduleEditorSetup(() => {
      if (!this.#outsideHandler) return;
      document.addEventListener('mousedown', this.#outsideHandler, { capture: true });
      input.focus();
    });
  }

  /** 返回当前选择的日期值 */
  getValue(): Date | null {
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

  /** 将 input.value 解析为 Date，若与原始值等分钟则返回原始值（避免更新毫秒）*/
  #resolveValue(inputVal: string): Date | null {
    if (!inputVal) return null;
    const orig = this.#originalValue;
    if (orig && inputVal === this.#formatForInput(orig)) {
      return orig; // 分钟精度未变，返回原值（保留原始毫秒）
    }
    const d = new Date(inputVal);
    d.setSeconds(0, 0); // 输入框不支持秒/毫秒，统一归零
    return d;
  }

  #formatForInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  #cleanup(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, { capture: true });
      this.#outsideHandler = null;
    }
    this.#panel?.remove();
    this.#panel = null;
  }
}
