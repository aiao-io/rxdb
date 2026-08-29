/**
 * @packageDocumentation
 * 远端可达性判定：本地优先写入与联网回推的触发源。
 *
 * @remarks
 * **为什么不复用 `RxDB.connected$`**：那是**适配器生命周期**状态（某个 adapter 的
 * `connect()` 完成没有），不是网络可达性。HTTP 适配器的 `connect()` 不发任何网络请求，
 * 断网时它照样报 connected；change-feed 也明确拒绝把连接失败外泄成离线信号
 * （一条断掉的通知连接不代表离线，可能只是后端没实现该端点）。两者语义不同，
 * 合并会让「适配器已连接但网断了」这个最常见的状态变得不可表达。
 *
 * 判据复用 {@link isNetworkError}（US-020 D11 的口径），所以「什么算离线」在
 * `offlineFallback` 的读路径与这里的写/重放路径上是同一份定义。
 */

import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { isNetworkError } from '../repository/network-error.js';

/** 退避起始间隔（毫秒） */
const DEFAULT_BASE_DELAY_MS = 1_000;

/** 退避封顶间隔（毫秒） */
const DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * 监听 `online` / `offline` 的事件源形状
 *
 * @remarks
 * 只声明用得到的两个方法，而不是收整个 `Window`：Node / Electron 主进程 / worker 里
 * 没有 `window`，收窄到这两个方法才能在测试里直接传一个假实现。
 */
export interface ReachabilityEventTarget {
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

/**
 * {@link ReachabilityMonitor} 的构造选项
 */
export interface ReachabilityOptions {
  /** 退避起始间隔，默认 1000ms */
  readonly baseDelayMs?: number;

  /** 退避封顶间隔，默认 30000ms */
  readonly maxDelayMs?: number;

  /**
   * 读取 `navigator.onLine`
   *
   * @remarks
   * 不传时自动探测全局 `navigator`；显式传 `undefined` 之外的值可用于测试与非浏览器宿主。
   */
  readonly navigatorOnLine?: () => boolean;

  /** 注册 `online` / `offline` 监听；不传时自动探测全局 `addEventListener` */
  readonly addEventListener?: ReachabilityEventTarget['addEventListener'];

  /** 注销监听，需与 {@link ReachabilityOptions.addEventListener} 成对提供 */
  readonly removeEventListener?: ReachabilityEventTarget['removeEventListener'];
}

/** 从全局对象上取一个 `ReachabilityEventTarget`，取不到返回 `undefined` */
function resolveGlobalEventTarget(): ReachabilityEventTarget | undefined {
  const candidate = globalThis as Partial<ReachabilityEventTarget>;
  if (typeof candidate.addEventListener !== 'function' || typeof candidate.removeEventListener !== 'function') {
    return undefined;
  }
  return candidate as ReachabilityEventTarget;
}

/** 从全局 `navigator` 上取 `onLine`，取不到返回 `undefined` */
function resolveGlobalNavigatorOnLine(): (() => boolean) | undefined {
  const nav = (globalThis as { navigator?: { onLine?: unknown } }).navigator;
  if (typeof nav?.onLine !== 'boolean') {
    return undefined;
  }
  return () => nav.onLine === true;
}

/**
 * 远端可达性监视器
 *
 * @remarks
 * **只在看到证据时翻转**。成功的远端调用是在线的证据，{@link isNetworkError} 命中的失败
 * 是离线的证据；除此之外一律不动状态 —— 包括退避节拍本身。退避节拍只是「现在可以再试一次」，
 * 不是「已经恢复了」；乐观地把节拍当成恢复会让状态在断网期间反复抖动，UI 上表现为
 * 待推计数不断闪回 0。
 *
 * `navigator.onLine` 的两个方向不对称：`false` 可信为「一定离线」（网卡都没链路），
 * `true` 只说明有链路、不说明后端可达，所以只用来催一次尝试。
 *
 * @example
 * ```typescript
 * const monitor = new ReachabilityMonitor();
 *
 * // 远端调用出口统一上报
 * try {
 *   const rows = await remote.findByIds('Recipe', ids);
 *   monitor.report(null);
 * } catch (error) {
 *   monitor.report(error);
 *   throw error;
 * }
 *
 * // 同步驱动订阅节拍，成功即恢复
 * monitor.wakeup$.pipe(exhaustMap(() => flushPendingWrites())).subscribe();
 * ```
 */
export class ReachabilityMonitor {
  readonly #online$ = new BehaviorSubject<boolean>(true);
  readonly #wakeup$ = new Subject<void>();
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #eventTarget: ReachabilityEventTarget | undefined;

  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;

  /**
   * 当前可达性判断的变化流（已去重，订阅即得当前值）
   */
  readonly online$: Observable<boolean>;

  /**
   * 「现在可以再试一次同步」的节拍
   *
   * @remarks
   * 离线期间按 `base * 2 ** (attempt - 1)` 退避发出（封顶 `maxDelayMs`），
   * 浏览器 `online` 事件也会催发一次。订阅方应当用 `exhaustMap` 等单飞算子消费 ——
   * 节拍可能与其它触发源叠加。
   */
  readonly wakeup$: Observable<void> = this.#wakeup$.asObservable();

  /** 当前是否判为可达 */
  get online(): boolean {
    return this.#online$.value;
  }

  constructor(options: ReachabilityOptions = {}) {
    this.#baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.online$ = this.#online$.pipe(distinctUntilChanged());

    const navigatorOnLine = options.navigatorOnLine ?? resolveGlobalNavigatorOnLine();
    if (navigatorOnLine?.() === false) {
      this.#setOnline(false);
    }

    this.#eventTarget = this.#resolveEventTarget(options);
    this.#eventTarget?.addEventListener('online', this.#onOnline);
    this.#eventTarget?.addEventListener('offline', this.#onOffline);
  }

  /**
   * 上报一次远端调用的结果
   *
   * @param error - 调用抛出的错误；调用成功时传 `null`
   *
   * @remarks
   * 认不出的错误（含所有带数字 `status` 的 HTTP 响应）**不改变状态**：拿到了状态码
   * 就说明连接是通的，401 / 422 / 503 都是远端给出的回答，不是网线断了。
   */
  report(error: unknown | null): void {
    if (this.#destroyed) return;
    if (error === null || error === undefined) {
      this.#setOnline(true);
      return;
    }
    if (isNetworkError(error)) {
      this.#setOnline(false);
    }
  }

  /**
   * 停止监视：摘掉事件监听、取消待发的节拍
   *
   * @remarks
   * 幂等。`destroy()` 之后 {@link ReachabilityMonitor.report} 不再改变状态。
   */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#clearTimer();
    this.#eventTarget?.removeEventListener('online', this.#onOnline);
    this.#eventTarget?.removeEventListener('offline', this.#onOffline);
    this.#wakeup$.complete();
    this.#online$.complete();
  }

  // 监听器保存成字段而不是方法，`removeEventListener` 才拿得到与注册时同一个引用。
  // 字段初始化早于构造体，所以构造函数里注册它们是安全的。
  readonly #onOnline = (): void => this.#wakeup$.next();

  readonly #onOffline = (): void => this.#setOnline(false);

  /** 解析事件源：显式传入优先，否则探测全局对象 */
  #resolveEventTarget(options: ReachabilityOptions): ReachabilityEventTarget | undefined {
    const { addEventListener, removeEventListener } = options;
    if (addEventListener && removeEventListener) {
      return { addEventListener, removeEventListener };
    }
    return resolveGlobalEventTarget();
  }

  /** 翻转状态并调度/取消退避节拍 */
  #setOnline(online: boolean): void {
    if (this.#online$.value === online) return;
    this.#online$.next(online);

    if (online) {
      // 退避重新从 base 起算：这次恢复说明上一轮的指数已经过时了，
      // 继续沿用会让下一次短暂抖动等上几十秒才重试。
      this.#attempt = 0;
      this.#clearTimer();
      return;
    }
    this.#scheduleWakeup();
  }

  /** 按指数退避排下一个节拍 */
  #scheduleWakeup(): void {
    this.#clearTimer();
    this.#attempt++;
    const delay = Math.min(this.#baseDelayMs * 2 ** (this.#attempt - 1), this.#maxDelayMs);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#wakeup$.next();
      // 节拍发出去不等于恢复：驱动方去试真实同步，成功了才会 report(null)。
      // 在那之前继续排下一个节拍，否则一次失败的重试就让重试链彻底断掉。
      if (!this.#online$.value) this.#scheduleWakeup();
    }, delay);
  }

  /** 取消待发的节拍 */
  #clearTimer(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
