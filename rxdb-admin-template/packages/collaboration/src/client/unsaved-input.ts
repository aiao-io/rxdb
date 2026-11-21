/** 注册离开提示用到的窗口能力：浏览器里就是 `window`。 */
export type LeaveTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * 编辑界面里未保存的输入（ADMIN-US-205 AC#5）。
 *
 * @remarks
 * 应用的编辑界面经 `reportDirty` 把模型驱动实体列表的未保存状态报上来：对话框里还没点保存的表单取值不在任务工作树里，
 * 同步带不上它，切走就丢了。这里记下状态；有未保存的输入时在窗口上注册 `beforeunload`，让浏览器在关闭、刷新或跳到别的地址
 * 之前提示，没有了就撤下——不留常驻监听，挂着 `beforeunload` 的页面在部分浏览器里进不了往返缓存。
 *
 * 只认当前打开着的那个编辑界面：每打开一个编辑界面换一个报告入口，旧入口随即作废。编辑界面卸载时实体列表会补报一次 false，
 * 这次报告与之后迟到的报告都不能改动新编辑界面的状态，也不能在卸载途中触发重绘——重绘会再走一遍卸载、创建编辑界面的流程。
 */
export class UnsavedInput {
  #dirty = false;
  /** 报告入口的代次：打开、关闭编辑界面都换代，旧入口随之作废。 */
  #session = 0;

  /** 当前打开着的编辑界面里有没有未保存的输入。 */
  get dirty(): boolean {
    return this.#dirty;
  }

  /**
   * @param target 注册离开提示的窗口。
   * @param changed 报告改变了状态之后调用，挂载方据此更新控制器并重绘面板；{@link UnsavedInput.close} 不调用它。
   */
  constructor(
    private readonly target: LeaveTarget,
    private readonly changed: (dirty: boolean) => void
  ) {}

  /**
   * 为新打开的编辑界面开一个报告入口，之前开过的入口一律作废。
   * @returns 交给编辑界面的 `reportDirty`：只在状态变化时生效，重复报告同一状态没有副作用。
   */
  open(): (dirty: boolean) => void {
    const session = ++this.#session;
    return dirty => {
      if (session !== this.#session || dirty === this.#dirty) return;
      this.#set(dirty);
      this.changed(dirty);
    };
  }

  /**
   * 编辑界面要卸载了：先作废它的报告入口，状态回到没有未保存的输入，撤下离开提示。挂载方在卸载编辑界面之前调用，
   * 此时它正在重绘，所以这里不调用 `changed`。
   * @returns 卸载时还有没有未保存的输入：有的话，它们随编辑界面一起丢了（例如会话失效引起的锁定），挂载方据此说明。
   */
  close(): boolean {
    this.#session++;
    const discarded = this.#dirty;
    this.#set(false);
    return discarded;
  }

  /** 离开提示：取消默认行为，浏览器就会先问用户是否离开。 */
  readonly #leave = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    // 只认 returnValue 的旧版浏览器靠它弹出提示
    event.returnValue = '';
  };

  #set(dirty: boolean): void {
    this.#dirty = dirty;
    if (dirty) this.target.addEventListener('beforeunload', this.#leave);
    else this.target.removeEventListener('beforeunload', this.#leave);
  }
}
