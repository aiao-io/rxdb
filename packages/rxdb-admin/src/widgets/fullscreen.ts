import { Store, type ReadableStore } from '../store.js';

/** 全屏所需的文档能力，`document` 天然满足。 */
export interface FullscreenDocument {
  /** 当前全屏的元素。 */
  readonly fullscreenElement: unknown;
  /** 环境是否允许进入全屏（iframe 缺 `allow="fullscreen"` 权限时为 false）。 */
  readonly fullscreenEnabled: boolean;
  /** 根元素。 */
  readonly documentElement: { requestFullscreen(): Promise<void> };
  /** 退出全屏。 */
  exitFullscreen(): Promise<void>;
  /** 监听全屏变化。 */
  addEventListener(type: 'fullscreenchange', listener: () => void): void;
  /** 移除监听。 */
  removeEventListener(type: 'fullscreenchange', listener: () => void): void;
}

/**
 * 全屏请求的超时上限。宿主的嵌入式视图（如桌面应用的预览面板）可能吞掉请求，
 * 既不进入全屏也不拒绝，没有超时会让调用方永远等下去。
 */
const FULLSCREEN_TIMEOUT_MS = 1000;

/** 给全屏 Promise 加超时保护；超时后按失败处理，迟到的原始结果被妥善消化。 */
async function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Fullscreen request timed out after ${ms}ms`)), ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 浏览器全屏控制，状态随 `fullscreenchange` 同步（Esc 退出也能感知）。
 *
 * @remarks
 * 浏览器可能在无用户手势、iframe 权限不足或宿主视图不支持时拒绝全屏请求（Promise
 * 拒绝甚至永不响应）。控制器把这些情况收敛为 `unsupported` 状态而不是抛出未处理
 * 错误，按钮据此禁用并提示用户当前环境不可用。
 */
export class FullscreenController {
  readonly #document: FullscreenDocument | undefined;
  readonly #state: Store<boolean>;
  readonly #unsupported: Store<boolean>;
  #pending = false;

  /** 是否处于全屏。 */
  get isFullscreen(): ReadableStore<boolean> {
    return this.#state;
  }

  /** 环境当前是否无法使用全屏：能力缺失，或最近一次切换被拒绝 / 无响应。 */
  get unsupported(): ReadableStore<boolean> {
    return this.#unsupported;
  }

  /**
   * 创建控制器。
   * @param document - 文档；缺省（SSR / 测试）时切换为空操作并标记为不支持。
   */
  constructor(document: FullscreenDocument | undefined) {
    this.#document = document;
    this.#state = new Store(document?.fullscreenElement != null);
    // 老环境没有 fullscreenEnabled 属性（undefined）按支持处理，只对显式 false 判定不支持。
    this.#unsupported = new Store(document === undefined || document.fullscreenEnabled === false);
    document?.addEventListener('fullscreenchange', this.#onChange);
  }

  /** 进入或退出全屏。 */
  async toggle(): Promise<void> {
    if (!this.#document || this.#pending) return;
    this.#pending = true;
    try {
      if (this.#document.fullscreenElement) await withTimeout(this.#document.exitFullscreen(), FULLSCREEN_TIMEOUT_MS);
      else await withTimeout(this.#document.documentElement.requestFullscreen(), FULLSCREEN_TIMEOUT_MS);
    } catch {
      this.#unsupported.set(true);
      console.warn(
        `[rxdb-admin] Fullscreen toggle failed: this environment rejected or stalled the fullscreen request.`
      );
    } finally {
      this.#pending = false;
    }
  }

  /** 停止监听。 */
  destroy(): void {
    this.#document?.removeEventListener('fullscreenchange', this.#onChange);
  }

  readonly #onChange = (): void => {
    const fullscreen = this.#document?.fullscreenElement != null;
    this.#state.set(fullscreen);
    if (fullscreen) this.#unsupported.set(false);
  };
}
