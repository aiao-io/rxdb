/** {@link OpfsRouteSync.sync} 需要的两个副作用回调。 */
export interface OpfsRouteActions {
  /** 首次同步时调用，负责把浏览器打开到 `path`。抛错则本轮同步失败，下次 `sync` 会重试初始化。 */
  init: (path: string) => Promise<void>;
  /** 已初始化后目标路径与当前路径不同才调用。 */
  navigateTo: (path: string) => Promise<void>;
}

/**
 * 把路由路径同步到 OPFS 浏览器视图，串行化并发请求。
 *
 * 同一时刻只跑一轮 drain：期间到来的 `sync` 只覆盖「目标路径」并共享同一个 Promise，
 * 因此**中间路径会被丢弃**，最终只保证收敛到最后一次请求的路径。
 *
 * 有状态，需按视图实例持有。
 */
export class OpfsRouteSync {
  #initialized = false;
  #requestedPath: string | undefined;
  #running: Promise<void> | undefined;

  /**
   * 请求同步到 `routePath`。
   *
   * @param available - OPFS 是否可用；`false` 时直接 resolve，不记录路径也不触发任何回调
   * @param routePath - 目标路径
   * @param getCurrentPath - 读取当前已展示路径，用于跳过无变化的导航；每轮循环读一次
   * @param actions - 见 {@link OpfsRouteActions}
   * @returns 本轮 drain 的 Promise；并发调用共享同一个实例。
   *          `actions` 抛错时以同一个异常 reject，**所有共享这轮的调用方一起 reject**
   */
  sync(available: boolean, routePath: string, getCurrentPath: () => string, actions: OpfsRouteActions): Promise<void> {
    if (!available) return Promise.resolve();
    this.#requestedPath = routePath;
    if (!this.#running) {
      // 目标路径与当前路径相同、且已初始化时，循环体一次 await 都不会碰到，
      // `#drain` 会在返回前就同步跑完。如果清理 `#running` 的 `finally` 写在
      // `#drain` 内部，`this.#running ??= this.#drain(...)` 会先求值右边
      // （这一步已经把 #running 清空），再把返回值写回 #running —— 相当于把一个
      // 已经 resolve 的 Promise 重新钉死在 #running 上，此后的 sync() 调用都会把它
      // 当成「正在跑」而只改 #requestedPath，再也没有循环去读，导航请求静默丢失。
      // `.finally()` 的回调保证进微任务队列、不会同步执行，借它来清理就不会抢在
      // 下面这行赋值前面跑，不管 `#drain` 是否同步跑完都能正确收尾。
      const running = this.#drain(getCurrentPath, actions).finally(() => {
        if (this.#running === running) this.#running = undefined;
      });
      this.#running = running;
    }
    return this.#running;
  }

  async #drain(getCurrentPath: () => string, actions: OpfsRouteActions): Promise<void> {
    while (this.#requestedPath !== undefined) {
      const path = this.#requestedPath;
      this.#requestedPath = undefined;
      if (!this.#initialized) {
        // 标记必须在 init **成功之后**置位。原实现先置 true 再 await，
        // init 抛错时标记已经留在 true 上 —— 后续所有请求都走 navigateTo 分支，
        // 那个从未初始化成功的实例再也无法重试初始化（UTL-008）
        await actions.init(path);
        this.#initialized = true;
      } else if (path !== getCurrentPath()) {
        await actions.navigateTo(path);
      }
    }
  }
}
