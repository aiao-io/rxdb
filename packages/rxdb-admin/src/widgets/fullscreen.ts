import { Store, type ReadableStore } from '../store.js';

/** 全屏所需的文档能力，`document` 天然满足。 */
export interface FullscreenDocument {
  /** 当前全屏的元素。 */
  readonly fullscreenElement: unknown;
  /** 根元素。 */
  readonly documentElement: { requestFullscreen(): Promise<void> };
  /** 退出全屏。 */
  exitFullscreen(): Promise<void>;
  /** 监听全屏变化。 */
  addEventListener(type: 'fullscreenchange', listener: () => void): void;
  /** 移除监听。 */
  removeEventListener(type: 'fullscreenchange', listener: () => void): void;
}

/** 浏览器全屏控制，状态随 `fullscreenchange` 同步（Esc 退出也能感知）。 */
export class FullscreenController {
  readonly #document: FullscreenDocument | undefined;
  readonly #state: Store<boolean>;

  /** 是否处于全屏。 */
  get isFullscreen(): ReadableStore<boolean> {
    return this.#state;
  }

  /**
   * 创建控制器。
   * @param document - 文档；缺省（SSR / 测试）时切换为空操作。
   */
  constructor(document: FullscreenDocument | undefined) {
    this.#document = document;
    this.#state = new Store(document?.fullscreenElement != null);
    document?.addEventListener('fullscreenchange', this.#onChange);
  }

  /** 进入或退出全屏。 */
  async toggle(): Promise<void> {
    if (!this.#document) return;
    if (this.#document.fullscreenElement) await this.#document.exitFullscreen();
    else await this.#document.documentElement.requestFullscreen();
  }

  /** 停止监听。 */
  destroy(): void {
    this.#document?.removeEventListener('fullscreenchange', this.#onChange);
  }

  readonly #onChange = (): void => this.#state.set(this.#document?.fullscreenElement != null);
}
