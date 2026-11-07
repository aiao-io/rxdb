import { Store, type ReadableStore } from '../store.js';

/** 外壳的瞬时界面状态，不持久化。 */
export interface ShellUiState {
  /** 移动端侧栏抽屉是否打开。 */
  readonly drawerOpen: boolean;
  /** 折叠的侧栏是否因悬停而临时展开。 */
  readonly hoverExpanded: boolean;
  /** 内容最大化。 */
  readonly maximized: boolean;
  /** 偏好抽屉是否打开。 */
  readonly preferencesOpen: boolean;
  /** 页面刷新计数：作为内容区的 key，变化即重建当前页面。 */
  readonly refreshKey: number;
  /** 路由导航进行中（驱动顶部进度条与加载遮罩）。 */
  readonly navigating: boolean;
}

const INITIAL: ShellUiState = {
  drawerOpen: false,
  hoverExpanded: false,
  maximized: false,
  preferencesOpen: false,
  refreshKey: 0,
  navigating: false
};

/** 外壳瞬时界面状态的持有者与动作集合。 */
export class ShellUi implements ReadableStore<ShellUiState> {
  readonly #state = new Store<ShellUiState>(INITIAL);

  /** 当前状态的快照。 */
  get value(): ShellUiState {
    return this.#state.value;
  }

  /** 回放当前状态并推送后续变更。 */
  get changes$(): ReadableStore<ShellUiState>['changes$'] {
    return this.#state.changes$;
  }

  /**
   * 订阅后续变更。
   * @param listener - 变更回调。
   * @returns 退订函数。
   */
  subscribe(listener: (value: ShellUiState) => void): () => void {
    return this.#state.subscribe(listener);
  }

  /** 切换移动端侧栏抽屉。 */
  toggleDrawer(): void {
    this.#patch({ drawerOpen: !this.value.drawerOpen });
  }

  /**
   * 设置移动端侧栏抽屉。
   * @param open - 是否打开。
   */
  setDrawer(open: boolean): void {
    this.#patch({ drawerOpen: open });
  }

  /**
   * 设置折叠侧栏的悬停展开。
   * @param expanded - 是否展开。
   */
  setHoverExpanded(expanded: boolean): void {
    this.#patch({ hoverExpanded: expanded });
  }

  /** 切换内容最大化。 */
  toggleMaximize(): void {
    this.#patch({ maximized: !this.value.maximized });
  }

  /**
   * 设置内容最大化。
   * @param maximized - 是否最大化。
   */
  setMaximized(maximized: boolean): void {
    this.#patch({ maximized });
  }

  /**
   * 打开 / 关闭偏好抽屉。
   * @param open - 是否打开。
   */
  setPreferencesOpen(open: boolean): void {
    this.#patch({ preferencesOpen: open });
  }

  /** 刷新当前页面：递增刷新计数，内容区据此重建。 */
  refresh(): void {
    this.#patch({ refreshKey: this.value.refreshKey + 1 });
  }

  /**
   * 标记导航进行中。
   * @param navigating - 是否进行中。
   */
  setNavigating(navigating: boolean): void {
    this.#patch({ navigating });
  }

  #patch(patch: Partial<ShellUiState>): void {
    const current = this.value;
    const changed = (Object.keys(patch) as (keyof ShellUiState)[]).some(key => !Object.is(patch[key], current[key]));
    if (changed) this.#state.set({ ...current, ...patch });
  }
}
