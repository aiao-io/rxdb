/** 拖拽中的落点状态：从第 `fromIndex` 行拖起，当前悬停在第 `overIndex` 行。 */
export interface FixedRowDragState {
  /** 被拖行在列表中的下标 */
  fromIndex: number;
  /** 指针当前对应的落点下标，已钳在 `[0, rowCount - 1]` */
  overIndex: number;
}

/**
 * 松手时的落点：被拖行的 id、起拖时的 id 序列与起止下标。
 *
 * 只有在松手时列表的 id 序列仍与起拖时逐项相同才会回调，`ids[fromIndex] === id` 恒成立，
 * 下标可以直接对着 `ids` 换算邻居；是否构成移动（起止相同）由调用方判断。
 */
export interface FixedRowDrop<Id> {
  /** 被拖行的 id */
  id: Id;
  /** 起拖时（也即松手时）的 id 序列 */
  ids: readonly Id[];
  /** 被拖行的下标 */
  fromIndex: number;
  /** 落点下标，已钳在 `[0, ids.length - 1]` */
  toIndex: number;
}

/** {@link FixedRowDrag} 的构造参数。 */
export interface FixedRowDragOptions<Id> {
  /** 行高（px），必须是正有限数；虚拟列表的 itemSize */
  rowHeight: number;
  /** 滚动容器；贴近它的上下沿时自动滚动。传函数是因为框架里元素引用常常晚于控制器创建 */
  scrollElement: () => HTMLElement;
  /** 列表本体（全部行的总高度容器）；落点按指针相对它顶边的偏移换算 */
  listElement: () => HTMLElement;
  /**
   * 列表当前的 id 序列（与渲染顺序一致）。起拖时取快照；拖拽中每帧、每次指针移动与松手时复核，
   * 一旦与快照不同（插入、删除、切组、重排）就取消会话、不回调 `onDrop`
   */
  ids: () => readonly Id[];
  /** 落点变化时回调；拖拽结束（松手或取消）时回调 `null` */
  onChange: (state: FixedRowDragState | null) => void;
  /** 松手且列表未变时回调落点 */
  onDrop: (drop: FixedRowDrop<Id>) => void;
}

/** 两个 id 序列逐项相同（`Object.is`） */
const sameIds = <Id>(a: readonly Id[], b: readonly Id[]): boolean =>
  a.length === b.length && a.every((id, index) => Object.is(id, b[index]));

/**
 * 等高行虚拟列表的指针拖拽内核。
 *
 * 虚拟滚动下视口外的行不在 DOM 里，落点不能靠「指针下是哪个元素」，只能按
 * `floor((clientY - 列表顶边) / rowHeight)` 换算下标。指针停在滚动容器上下沿一行高的
 * 范围内时逐帧滚动，并随滚动重算落点，拖到视口外的位置不需要松手再滚。
 *
 * 下标只在列表不变时才指向同一行：会话绑定起拖时的 id 序列，列表在拖拽中变了就取消，
 * 不把旧下标套到新列表上（那会移动别的行或越界）。
 *
 * 监听挂在 `window` 上（pointermove / pointerup / pointercancel / Escape），只在拖拽期间存在；
 * 用完调 {@link FixedRowDrag.dispose}。依赖 `window` 与 `requestAnimationFrame`，只能在浏览器使用。
 *
 * @example
 * const drag = new FixedRowDrag({
 *   rowHeight: 48,
 *   scrollElement: () => main,
 *   listElement: () => list,
 *   ids: () => rows.map(row => row.id),
 *   onChange: state => (dragState = state),
 *   onDrop: ({ id, ids, fromIndex, toIndex }) => save(id, reorderTargetForMove(ids, fromIndex, toIndex))
 * });
 * handle.addEventListener('pointerdown', event => drag.start(event, index));
 */
export class FixedRowDrag<Id = unknown> {
  readonly #options: FixedRowDragOptions<Id>;
  #state: FixedRowDragState | null = null;
  #ids: readonly Id[] = [];
  #clientY: number | null = null;
  #frame: number | null = null;

  /** 是否正在拖拽 */
  get dragging(): boolean {
    return this.#state !== null;
  }

  constructor(options: FixedRowDragOptions<Id>) {
    if (!Number.isFinite(options.rowHeight) || options.rowHeight <= 0) {
      throw new RangeError(`rowHeight 必须是正有限数：${options.rowHeight}`);
    }
    this.#options = options;
  }

  /**
   * 从第 `fromIndex` 行开始拖拽，并对当前 id 序列取快照。
   *
   * 非主键按下、或已在拖拽中时忽略；`fromIndex` 不在当前 id 序列的下标范围内抛 `RangeError`。
   */
  start(event: PointerEvent, fromIndex: number): void {
    if (event.button !== 0 || this.#state) return;
    const ids = [...this.#options.ids()];
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= ids.length) {
      throw new RangeError(`拖拽起点越界：from=${fromIndex} rowCount=${ids.length}`);
    }
    event.preventDefault();
    this.#ids = ids;
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
    if (this.#cancelIfStale()) return;
    this.#clientY = event.clientY;
    this.#track();
  };

  readonly #onUp = (event: PointerEvent): void => {
    if (this.#cancelIfStale()) return;
    this.#clientY = event.clientY;
    this.#track();
    const state = this.#state;
    const ids = this.#ids;
    this.#finish();
    if (!state) return;
    const { fromIndex, overIndex: toIndex } = state;
    this.#options.onDrop({ id: ids[fromIndex] as Id, ids, fromIndex, toIndex });
  };

  readonly #onCancel = (): void => this.cancel();

  readonly #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.cancel();
  };

  readonly #tick = (): void => {
    if (this.#cancelIfStale()) return;
    this.#autoscroll();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** 列表的 id 序列与起拖快照不同时取消会话；返回是否已取消 */
  #cancelIfStale(): boolean {
    if (sameIds(this.#ids, this.#options.ids())) return false;
    this.cancel();
    return true;
  }

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
    const overIndex = Math.min(Math.max(raw, 0), this.#ids.length - 1);
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
    this.#ids = [];
    this.#emit(null);
  }
}
