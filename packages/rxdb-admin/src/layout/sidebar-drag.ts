import type { PreferencesStore } from '../preferences/store.js';

/** 侧栏宽度（px）的可调范围：偏好 `sidebar.width` 的取值约束与拖拽手柄共用同一份。 */
export const SIDEBAR_WIDTH_RANGE = { min: 160, max: 320 } as const;

const SLOT_SELECTOR = '.admin-sidebar-slot';
const WIDTH_VARIABLE = '--admin-sidebar-width';
const RESIZING_ATTRIBUTE = 'data-resizing';

/**
 * 一次侧栏宽度拖拽。
 *
 * @remarks
 * 拖动期间只把预览宽度写在侧栏占位元素的 CSS 变量上，不改偏好、不通知订阅者，
 * 外壳与页面不会随指针移动而重渲染；松手时一次性提交到偏好（落盘同样只有一次）。
 * 占位元素同时带上 `data-resizing`，样式据此关掉宽度过渡，侧栏才能紧跟指针而不是被动画拖在后面。
 */
export class SidebarDrag {
  readonly #preferences: PreferencesStore;
  readonly #slot: HTMLElement;
  readonly #startX: number;
  readonly #startWidth: number;
  #width: number;
  #finished = false;

  /** 当前宽度：拖动中是预览值，结束后停在最后一次的值。 */
  get width(): number {
    return this.#width;
  }

  /**
   * 开始一次拖动，宽度以此刻的偏好宽度为起点。
   * @param preferences - 松手时提交宽度的偏好存储。
   * @param handle - 拖拽手柄，必须渲染在侧栏占位元素（`.admin-sidebar-slot`）之内。
   * @param startX - 按下时的指针横坐标。
   * @throws 手柄不在侧栏占位元素内时抛错。
   */
  constructor(preferences: PreferencesStore, handle: Element, startX: number) {
    const slot = handle.closest<HTMLElement>(SLOT_SELECTOR);
    if (slot === null) throw new Error(`The sidebar resize handle must be rendered inside "${SLOT_SELECTOR}"`);
    this.#preferences = preferences;
    this.#slot = slot;
    this.#startX = startX;
    this.#startWidth = this.#width = preferences.value.sidebar.width;
    slot.setAttribute(RESIZING_ATTRIBUTE, 'true');
  }

  /**
   * 指针移动：按位移换算宽度（限制在 {@link SIDEBAR_WIDTH_RANGE}）并预览。
   * @param clientX - 指针当前横坐标。
   * @returns 预览宽度（px）；拖动已结束时原样返回最后一次的宽度。
   */
  move(clientX: number): number {
    if (this.#finished) return this.#width;
    const { min, max } = SIDEBAR_WIDTH_RANGE;
    this.#width = Math.min(max, Math.max(min, this.#startWidth + clientX - this.#startX));
    this.#slot.style.setProperty(WIDTH_VARIABLE, `${this.#width}px`);
    return this.#width;
  }

  /** 松手：把预览宽度提交到偏好，并撤掉预览。重复调用无效。 */
  end(): void {
    if (this.#finished) return;
    this.#finished = true;
    // 先提交：根节点上的 `--admin-sidebar-width` 同步更新后再撤预览，侧栏不会闪回旧宽度
    this.#preferences.setPath('sidebar.width', this.#width);
    this.#release();
  }

  /** 放弃：撤掉预览，偏好保持拖动前的宽度。重复调用无效。 */
  cancel(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#release();
  }

  #release(): void {
    this.#slot.style.removeProperty(WIDTH_VARIABLE);
    this.#slot.removeAttribute(RESIZING_ATTRIBUTE);
  }
}
