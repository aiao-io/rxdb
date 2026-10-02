/** 拖拽中的落点状态：从第 `fromIndex` 行拖起，当前悬停在第 `overIndex` 行。 */
export interface FixedRowDragState {
  /** 被拖行在列表中的下标 */
  fromIndex: number;
  /** 指针当前对应的落点下标，已钳在 `[0, rowCount - 1]` */
  overIndex: number;
}

/** {@link FixedRowDrag} 的构造参数。 */
export interface FixedRowDragOptions {
  /** 行高（px），必须是正有限数；虚拟列表的 itemSize */
  rowHeight: number;
  /** 滚动容器；贴近它的上下沿时自动滚动。传函数是因为框架里元素引用常常晚于控制器创建 */
  scrollElement: () => HTMLElement;
  /** 列表本体（全部行的总高度容器）；落点按指针相对它顶边的偏移换算 */
  listElement: () => HTMLElement;
  /** 落点变化时回调；拖拽结束（松手或取消）时回调 `null` */
  onChange: (state: FixedRowDragState | null) => void;
  /** 松手时回调起止下标；是否构成移动（起止相同）由调用方判断 */
  onDrop: (fromIndex: number, toIndex: number) => void;
}

/**
 * 等高行虚拟列表的指针拖拽内核。
 *
 * 虚拟滚动下视口外的行不在 DOM 里，落点不能靠「指针下是哪个元素」，只能按
 * `floor((clientY - 列表顶边) / rowHeight)` 换算下标。指针停在滚动容器上下沿一行高的
 * 范围内时逐帧滚动，并随滚动重算落点，拖到视口外的位置不需要松手再滚。
 *
 * 监听挂在 `window` 上（pointermove / pointerup / pointercancel / Escape），只在拖拽期间存在；
 * 用完调 {@link FixedRowDrag.dispose}。依赖 `window` 与 `requestAnimationFrame`，只能在浏览器使用。
 *
 * @example
 * const drag = new FixedRowDrag({
 *   rowHeight: 48,
 *   scrollElement: () => main,
 *   listElement: () => list,
 *   onChange: state => (dragState = state),
 *   onDrop: (from, to) => save(reorderTargetForMove(ids, from, to))
 * });
 * handle.addEventListener('pointerdown', event => drag.start(event, index, ids.length));
 */
export class FixedRowDrag {
  readonly #options: FixedRowDragOptions;
  #state: FixedRowDragState | null = null;
  #rowCount = 0;
  #clientY: number | null = null;
  #frame: number | null = null;

  /** 是否正在拖拽 */
  get dragging(): boolean {
    return this.#state !== null;
  }

  constructor(options: FixedRowDragOptions) {
    if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0) {
      throw new RangeError(`rowHeight 必须是正有限数：${options.rowHeight}`);
    }
    this.#options = options;
  }

  /**
   * 从第 `fromIndex` 行开始拖拽。
   *
   * 非主键按下、或已在拖拽中时忽略；`fromIndex` 不在 `[0, rowCount)` 内抛 `RangeError`。
   */
  start(event: PointerEvent, fromIndex: number, rowCount: number): void {
    if (event.button !== 0 || this.#state) return;
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= rowCount) {
      throw new RangeError(`拖拽起点越界：from=${fromIndex} rowCount=${rowCount}`);
    }
    event.preventDefault();
    this.#rowCount = rowCount;
    this.#clientY = null;
    this.#emit({ fromIndex, overIndex: fromIndex });
    window.addEventListener('pointermove', this.#onMove);
    window.addEventListener('pointerup', this.#onUp);
    window.addEventListener('pointercancel', this.#onCancel);
    window.addEventListener('keydown', this.#onKeydown);
    this.#frame = requestAnimationFrame(this.#tick);
  }

  /** 取消当前拖拽，不回调 `onDrop` */
  cancel(): void {
    if (!this.#state) return;
    this.#finish();
  }

  /** 释放监听；与 {@link FixedRowDrag.cancel} 等价，供组件销毁时调用 */
  dispose(): void {
    this.cancel();
  }

  readonly #onMove = (event: PointerEvent): void => {
    this.#clientY = event.clientY;
    this.#track();
  };

  readonly #onUp = (event: PointerEvent): void => {
    this.#clientY = event.clientY;
    this.#track();
    const state = this.#state;
    this.#finish();
    if (state) this.#options.onDrop(state.fromIndex, state.overIndex);
  };

  readonly #onCancel = (): void => this.cancel();

  readonly #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.cancel();
  };

  readonly #tick = (): void => {
    this.#autoscroll();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** 指针在滚动容器上下沿一行高范围内（含越出容器）时，按固定步长滚动并重算落点 */
  #autoscroll(): void {
    if (this.#clientY === null) return;
    const { rowHeight } = this.#options;
    const rect = this.#options.scrollElement().getBoundingClientRect();
    const step = Math.max(1, Math.round(rowHeight / 3));
    let delta = 0;
    if (this.#clientY < rect.top + rowHeight) delta = -step;
    if (this.#clientY > rect.bottom - rowHeight) delta = step;
    if (delta === 0) return;
    this.#options.scrollElement().scrollTop += delta;
    this.#track();
  }

  #track(): void {
    if (!this.#state || this.#clientY === null) return;
    const top = this.#options.listElement().getBoundingClientRect().top;
    const raw = Math.floor((this.#clientY - top) / this.#options.rowHeight);
    const overIndex = Math.min(Math.max(raw, 0), this.#rowCount - 1);
    if (overIndex !== this.#state.overIndex) this.#emit({ fromIndex: this.#state.fromIndex, overIndex });
  }

  #emit(state: FixedRowDragState | null): void {
    this.#state = state;
    this.#options.onChange(state);
  }

  #finish(): void {
    window.removeEventListener('pointermove', this.#onMove);
    window.removeEventListener('pointerup', this.#onUp);
    window.removeEventListener('pointercancel', this.#onCancel);
    window.removeEventListener('keydown', this.#onKeydown);
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#clientY = null;
    this.#emit(null);
  }
}
