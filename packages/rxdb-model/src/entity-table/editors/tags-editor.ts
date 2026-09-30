import type { EditContext, IEditor } from '@visactor/vtable-editors';
import { DAISY_COLORS, positionOverlayPanel, refocusTable, scheduleEditorSetup } from './global-overlay-editor.js';

type TableLike = { getCellOriginValue(col: number, row: number): unknown } | null;

/** 标签编辑器模式：'string' 字符串标签 / 'number' 数字标签 */
export type TagsMode = 'string' | 'number';

/**
 * 标签（数组）输入编辑器
 *
 * 浮层显示标签芯片 + 输入框，适合编辑 stringArray / numberArray 类型。
 * - Enter 或逗号：添加当前输入为新标签
 * - Backspace（输入框为空时）：移除最后一个标签
 * - 点击 × ：移除对应标签
 * - Escape：取消（恢复原始标签）
 * - 点击外部 / Tab：提交当前输入（若有内容）并关闭
 *
 * 数字模式下（TagsMode='number'）仅接受有效数字。
 */
export class TagsEditor implements IEditor<unknown> {
  readonly #mode: TagsMode;
  #tags: string[] = [];
  #originalTags: string[] = [];
  #panel: HTMLDivElement | null = null;
  #chipsEl: HTMLDivElement | null = null;
  #input: HTMLInputElement | null = null;
  #endEdit: (() => void) | null = null;
  #outsideHandler: ((e: MouseEvent) => void) | null = null;

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名） */
  readonly editorType: string;

  /**
   * 创建标签编辑器
   *
   * @param mode - 标签模式，'string'（默认）或 'number'
   */
  constructor(mode: TagsMode = 'string') {
    this.#mode = mode;
    this.editorType = mode === 'number' ? 'number-tags-editor' : 'tags-editor';
  }

  /** 弹出标签编辑浮层，从单元格值解析初始标签并绑定交互事件 */
  onStart(ctx: EditContext<unknown>): void {
    const container = ctx.container as HTMLElement;
    this.#endEdit = () => {
      refocusTable(container);
      ctx.endEdit();
    };
    const origin = (ctx.table as TableLike)?.getCellOriginValue(ctx.col, ctx.row) ?? ctx.value;

    if (Array.isArray(origin)) {
      this.#tags = (origin as unknown[]).map(String).filter(Boolean);
    } else if (origin != null && origin !== '') {
      this.#tags = String(origin)
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
    } else {
      this.#tags = [];
    }
    this.#originalTags = [...this.#tags];

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'padding:8px',
      'min-width:220px',
      'max-width:360px',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      'display:flex',
      'flex-direction:column',
      'gap:6px'
    ].join(';');

    const chipsEl = document.createElement('div');
    chipsEl.style.cssText = ['display:flex', 'flex-wrap:wrap', 'gap:4px', 'min-height:20px'].join(';');
    this.#chipsEl = chipsEl;

    const input = document.createElement('input');
    input.type = 'text';
    if (this.#mode === 'number') input.inputMode = 'decimal';
    input.placeholder = this.#mode === 'number' ? '输入数字 Enter 添加' : '输入后 Enter 添加';
    input.style.cssText = [
      'width:100%',
      `background:${DAISY_COLORS.bg}`,
      `color:${DAISY_COLORS.text}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:4px',
      'padding:3px 6px',
      'font-size:12px',
      'outline:none',
      `placeholder-color:${DAISY_COLORS.text}`
    ].join(';');
    this.#input = input;

    const hint = document.createElement('div');
    hint.style.cssText = `font-size:12px;opacity:0.4;color:${DAISY_COLORS.text}`;
    hint.textContent = 'Enter /逗号 添加 · Backspace 删除 · Esc 取消';

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        this.#addTag(input.value.trim());
        input.value = '';
      } else if (e.key === 'Backspace' && input.value === '' && this.#tags.length > 0) {
        this.#tags.pop();
        this.#renderChips();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#tags = [...this.#originalTags]; // 恢复原始值
        this.#endEdit?.();
      } else if (e.key === 'Tab') {
        const trimmed = input.value.trim();
        if (trimmed) {
          e.preventDefault();
          this.#addTag(trimmed);
          input.value = '';
        }
      }
    });

    panel.appendChild(chipsEl);
    panel.appendChild(input);
    panel.appendChild(hint);
    document.body.appendChild(panel);
    positionOverlayPanel(panel, ctx.referencePosition.rect, ctx.container as HTMLElement, 120, { maxRight: 380 });
    this.#panel = panel;
    this.#renderChips();

    this.#outsideHandler = (e: MouseEvent) => {
      if (!panel.contains(e.target as Node)) {
        const trimmed = (this.#input?.value ?? '').trim();
        if (trimmed) this.#addTag(trimmed);
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

  /** 返回标签数组；number 模式下返回数字数组 */
  getValue(): string[] | number[] {
    if (this.#mode === 'number') {
      return this.#tags.map(Number).filter(n => !isNaN(n));
    }
    return [...this.#tags];
  }

  /** 移除浮层并解绑全局点击事件 */
  onEnd(): void {
    this.#cleanup();
  }

  /** 判断目标元素是否位于本编辑器浮层内 */
  isEditorElement(el: HTMLElement | EventTarget): boolean {
    return !!this.#panel?.contains(el as Node);
  }

  #addTag(value: string): void {
    if (!value) return;
    if (this.#mode === 'number') {
      const n = Number(value);
      if (isNaN(n)) return;
      this.#tags.push(String(n)); // 允许重复
    } else {
      this.#tags.push(value); // 允许重复
    }
    this.#renderChips();
  }

  #renderChips(): void {
    const el = this.#chipsEl;
    if (!el) return;
    el.textContent = '';
    this.#tags.forEach((tag, idx) => {
      const chip = document.createElement('span');
      chip.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:2px',
        'padding:1px 6px 1px 8px',
        'border-radius:9999px',
        'font-size:12px',
        `background:${DAISY_COLORS.hover}`,
        `color:${DAISY_COLORS.text}`,
        `border:1px solid ${DAISY_COLORS.border}`,
        'user-select:none'
      ].join(';');

      const label = document.createTextNode(tag);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.style.cssText = [
        'background:none',
        'border:none',
        'cursor:pointer',
        'font-size:13px',
        'line-height:1',
        'padding:0 1px',
        `color:${DAISY_COLORS.text}`,
        'opacity:0.5'
      ].join(';');
      removeBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        this.#tags.splice(idx, 1);
        this.#renderChips();
      });

      chip.appendChild(label);
      chip.appendChild(removeBtn);
      el.appendChild(chip);
    });
  }

  #cleanup(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, { capture: true });
      this.#outsideHandler = null;
    }
    this.#panel?.remove();
    this.#panel = null;
    this.#chipsEl = null;
    this.#input = null;
  }
}
