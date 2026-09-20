import type { EditContext, IEditor, RectProps } from '@visactor/vtable-editors';

/** daisyUI v5 主题色引用（CSS 变量，主题自适应） */
export const DAISY_COLORS = {
  bg: 'var(--color-base-100)',
  hover: 'var(--color-base-200)',
  border: 'var(--color-base-300)',
  text: 'var(--color-base-content)',
  primary: 'var(--color-primary)',
  primaryContent: 'var(--color-primary-content)',
  error: 'var(--color-error)',
  errorContent: 'var(--color-error-content)',
  selectedBg: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
  focusBg: 'color-mix(in srgb, var(--color-primary) 30%, var(--color-base-100))'
} as const;

/** 编辑器初始化延迟，避免 VTable 点击事件立即关闭编辑器 */
const EDITOR_SETUP_DELAY = 10;

/**
 * 延迟执行编辑器初始化（注册外部点击监听 + 聚焦），避免 VTable 事件干扰
 *
 * @param fn 延迟执行的初始化回调
 */
export function scheduleEditorSetup(fn: () => void): void {
  setTimeout(fn, EDITOR_SETUP_DELAY);
}

/**
 * 编辑结束后将焦点还给 VTable root element（tabindex=0 的 .vtable div = ctx.container = table.getElement()），使方向键导航继续工作
 *
 * @param container VTable 容器元素
 */
export function refocusTable(container: HTMLElement | null | undefined): void {
  container?.focus();
}

/**
 * 将浮层面板定位到单元格下方（空间不足时翻转到上方）
 *
 * @param panel 浮层面板元素
 * @param rect 单元格相对 VTable 容器的位置矩形
 * @param container VTable 容器（用于换算页面绝对坐标）
 * @param estimatedHeight 面板估算高度（用于判断是否翻转到上方）
 * @param options 可选布局选项（maxRight 面板最大右边界、minWidth 面板最小宽度）
 */
export function positionOverlayPanel(
  panel: HTMLElement,
  rect: { left: number; top: number; width?: number; height?: number },
  container: HTMLElement | null | undefined,
  estimatedHeight: number,
  options?: { maxRight?: number; minWidth?: number }
): void {
  const cRect = container?.getBoundingClientRect();
  const absLeft = (cRect?.left ?? 0) + rect.left;
  const absTop = (cRect?.top ?? 0) + rect.top;
  const absBottom = absTop + (rect.height ?? 0);
  const showAbove = window.innerHeight - absBottom < estimatedHeight && absTop > estimatedHeight;

  const maxRight = options?.maxRight;
  panel.style.left =
    maxRight != null ?
      `${Math.max(8, Math.min(absLeft, window.innerWidth - maxRight))}px`
    : `${Math.max(8, absLeft)}px`;
  panel.style.top = showAbove ? `${absTop - estimatedHeight - 4}px` : `${absBottom + 2}px`;

  const minWidth = options?.minWidth;
  if (minWidth != null) {
    panel.style.minWidth = `${Math.max(minWidth, rect.width ?? 0)}px`;
  }
}

/**
 * 全局浮层列表编辑器抽象基类
 *
 * 提供通用基础设施，子类只需关注内容渲染与选择逻辑：
 * - `document.body` 固定浮层 + 智能上下翻转定位
 * - 点击外部关闭、Escape 关闭
 * - 键盘导航（↑ ↓ Enter）
 * - 鼠标悬停高亮（通过 `data-idx` 自动委托）
 * - `refocusTable` 焦点还原
 *
 * ### 子类实现要求
 * 1. 声明 `readonly editorType: string`
 * 2. 实现 `buildRows(panel)` — 将行渲染到面板，行必须设置 `data-idx`
 * 3. 实现 `get itemCount()` — 总行数
 * 4. 实现 `onRowClick(idx)` — 点击/Enter 触发
 * 5. 实现 `onFocusChange(idx, prev)` — 更新行视觉高亮
 * 6. 实现 `getValue()` — 返回最终值
 */
export abstract class GlobalOverlayEditor implements IEditor<string> {
  #panel: HTMLDivElement | null = null;
  #endEdit: (() => void) | null = null;
  #focusedIndex = -1;

  readonly #handleOutsideMouseDown: (e: MouseEvent) => void;
  readonly #handleKeydown: (e: KeyboardEvent) => void;

  protected container: HTMLElement | null = null;
  protected table: { getCellOriginValue(col: number, row: number): unknown } | null = null;
  protected editCol = 0;
  protected editRow = 0;

  protected abstract get initialFocusIndex(): number;
  protected abstract get itemCount(): number;

  protected get focusedIndex(): number {
    return this.#focusedIndex;
  }

  /** VTable 编辑器类型标识（注册到 VTable 的编辑器名，子类赋值） */
  abstract readonly editorType: string;

  /** 构造浮层编辑器基类（子类在 onStart 中构建面板） */
  constructor() {
    this.#handleOutsideMouseDown = (e: MouseEvent) => {
      if (!this.isEditorElement(e.target as HTMLElement)) this.close();
    };
    this.#handleKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.close();
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          this.#moveFocus(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          this.#moveFocus(-1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          if (this.#focusedIndex >= 0) this.onRowClick(this.#focusedIndex);
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation();
          this.onDeleteKey();
          break;
      }
    };
  }

  /** 打开浮层：渲染行、定位面板并注册全局鼠标/键盘监听 */
  onStart(ctx: EditContext<string>): void {
    this.#endEdit = ctx.endEdit;
    this.container = ctx.container;
    this.table = ctx.table as { getCellOriginValue(col: number, row: number): unknown } | null;
    this.editCol = ctx.col;
    this.editRow = ctx.row;
    this.#focusedIndex = this.initialFocusIndex;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'z-index:9999',
      `background:${DAISY_COLORS.bg}`,
      `border:1px solid ${DAISY_COLORS.border}`,
      'border-radius:6px',
      'padding:4px 0',
      'box-shadow:0 4px 16px rgba(0,0,0,.15)',
      'min-width:140px',
      'max-height:220px',
      'overflow-y:auto',
      'overscroll-behavior:contain'
    ].join(';');

    this.buildRows(panel);
    document.body.appendChild(panel);
    this.#panel = panel;
    this.#positionPanel(ctx.referencePosition.rect);

    document.addEventListener('mousedown', this.#handleOutsideMouseDown, { capture: true });
    document.addEventListener('keydown', this.#handleKeydown, { capture: true });

    requestAnimationFrame(() => this.#scrollToFocused());
  }

  /** 关闭浮层：移除面板并注销全局鼠标/键盘监听 */
  onEnd(): void {
    this.#panel?.remove();
    this.#panel = null;
    document.removeEventListener('mousedown', this.#handleOutsideMouseDown, { capture: true });
    document.removeEventListener('keydown', this.#handleKeydown, { capture: true });
    this.#endEdit = null;
    this.container = null;
    this.table = null;
  }

  /** 返回编辑结果值 */
  abstract getValue(): string;

  /** 判断目标元素是否属于浮层面板 */
  isEditorElement(target: HTMLElement): boolean {
    return this.#panel?.contains(target) ?? false;
  }

  /** 根据新的单元格矩形重新定位浮层面板 */
  adjustPosition(rect: RectProps): void {
    this.#positionPanel(rect);
  }

  protected abstract buildRows(panel: HTMLDivElement): void;
  protected abstract onRowClick(idx: number): void;
  protected abstract onFocusChange(idx: number, prev: number): void;

  protected rowAt(idx: number): HTMLElement | null {
    return this.#panel?.querySelector<HTMLElement>(`[data-idx="${idx}"]`) ?? null;
  }

  protected setFocused(idx: number): void {
    const prev = this.#focusedIndex;
    this.#focusedIndex = idx;
    if (prev !== idx) this.onFocusChange(idx, prev);
    this.#scrollToFocused();
  }

  protected onDeleteKey(): void {
    this.close();
  }

  protected close(): void {
    this.refocusTable();
    this.#endEdit?.();
  }

  protected refocusTable(): void {
    refocusTable(this.container);
  }

  #moveFocus(delta: 1 | -1): void {
    const len = this.itemCount;
    if (len === 0) return;
    const next =
      this.#focusedIndex < 0 ?
        delta === 1 ?
          0
        : len - 1
      : (this.#focusedIndex + delta + len) % len;
    this.setFocused(next);
  }

  #positionPanel(rect: RectProps): void {
    const panel = this.#panel;
    if (!panel || !this.container) return;

    const { left, top, width, height } = rect;
    const cRect = this.container.getBoundingClientRect();
    const vLeft = cRect.left + left;
    const vTop = cRect.top + top;

    panel.style.left = `${vLeft}px`;
    panel.style.top = `${vTop + height}px`;
    panel.style.minWidth = `${width}px`;

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      const panelH = panel.offsetHeight;
      if (vTop + height + panelH > window.innerHeight - 8) {
        panel.style.top = `${vTop - panelH}px`;
      }
    });
  }

  #scrollToFocused(): void {
    if (this.#focusedIndex < 0) return;
    this.rowAt(this.#focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }
}
