import { BehaviorSubject, distinctUntilChanged } from 'rxjs';

const LISTENER_OPTIONS = {
  capture: true,
  passive: true
} as const;

const EVENTS = [
  'mousemove',
  'keydown',
  'wheel',
  'DOMMouseScroll',
  'mousewheel',
  'mousedown',
  'touchstart',
  'touchmove',
  'MSPointerDown',
  'MSPointerMove',
  'visibilitychange',
  'focus'
];

/** {@link IdleTimer} 的构造参数。 */
export interface IdleTimerOptions {
  /**
   * 多少毫秒内没有用户交互就算空闲。
   *
   * 必须是**非负安全整数**；`0` 是合法值，表示下一个宏任务即判定为空闲。
   *
   * @default 2000
   */
  timeout?: number;
}

/**
 * 浏览器空闲检测。
 *
 * 监听 `document` 上的鼠标 / 键盘 / 触摸 / 滚轮 / 可见性变化等事件（capture + passive）。
 * 每次事件把状态推回「不空闲」并重置计时；静默满 `timeout` 毫秒后推「空闲」。
 *
 * 依赖全局 `document`，只能在浏览器环境使用。用完必须 {@link IdleTimer.destroy}，
 * 否则事件监听器会一直挂在 `document` 上。
 *
 * @example
 * const timer = new IdleTimer({ timeout: 5000 });
 * timer.idle$.subscribe(idle => console.log(idle));
 * timer.start();
 * // ...
 * timer.destroy();
 */
export class IdleTimer {
  #timeout = 1000 * 2;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #isBound = false;
  #disposed = false;

  #idleSub = new BehaviorSubject(false);

  /**
   * 空闲状态流。
   *
   * 行为化（订阅即拿到当前值，初始为 `false`），且已 `distinctUntilChanged`，
   * 只在真正翻转时发射。{@link IdleTimer.destroy} 后该流 complete，不再发射。
   */
  idle$ = this.#idleSub.asObservable().pipe(distinctUntilChanged());

  /**
   * @param options - 见 {@link IdleTimerOptions}；不传则 `timeout` 为 2000
   * @throws `TypeError` `options.timeout` 不是非负安全整数（不会静默回退默认值）
   */
  constructor(options?: IdleTimerOptions) {
    // `??` 而非 `||`：`timeout: 0`（立即判定空闲）是合法值，用 `||` 会把它当「没传」回退成 2000。
    // 同时对非法值 fail-fast —— 静默回退会让调用方以为自己的配置生效了（UTL-010）
    if (options?.timeout !== undefined) {
      if (!Number.isSafeInteger(options.timeout) || options.timeout < 0) {
        throw new TypeError(`IdleTimer: timeout 必须是非负安全整数，收到 ${String(options.timeout)}`);
      }
      this.#timeout = options.timeout;
    }
  }

  /**
   * 开始检测：绑定事件监听并立即把状态置为「不空闲」、重新起算 `timeout`。
   *
   * 幂等——重复调用不会重复绑定监听器，只是重置计时。
   *
   * @throws `Error` 实例已 {@link IdleTimer.destroy}；destroy 后的实例不可复活，请新建
   */
  start() {
    // destroy 后 #idleSub 已 complete，next() 变成 no-op：此时再 start 会重新绑上事件、
    // 起一个永远不发射的计时器，监听器也再没人摘 —— 必须 fail-fast 而不是留下僵尸（UTL-010）
    this.#assertUsable('start');
    clearTimeout(this.#timer);
    this.#bindEvents();
    this.#handleEvent();
  }

  /**
   * 暂停检测：摘掉事件监听并清掉计时器。
   *
   * **不会**改变 {@link IdleTimer.idle$} 的当前值，也不会 complete 它；
   * 之后可以再 {@link IdleTimer.start} 恢复。幂等。
   *
   * @throws `Error` 实例已 {@link IdleTimer.destroy}
   */
  stop() {
    this.#assertUsable('stop');
    clearTimeout(this.#timer);
    this.#unbindEvents();
  }

  /**
   * 释放全部资源：摘监听、清计时器、complete {@link IdleTimer.idle$}。
   *
   * 幂等，重复调用是安全的 no-op。**不可逆**——此后调用
   * {@link IdleTimer.start} / {@link IdleTimer.stop} 会抛错，需要继续检测请新建实例。
   */
  destroy() {
    if (this.#disposed) return;
    clearTimeout(this.#timer);
    this.#unbindEvents();
    this.#disposed = true;
    this.#idleSub.complete();
  }

  #assertUsable(action: string): void {
    if (this.#disposed) {
      throw new Error(`IdleTimer: 实例已 destroy()，不能再调用 ${action}()；请新建实例`);
    }
  }

  #handleEvent = () => {
    this.#idleSub.next(false);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#idleSub.next(true);
    }, this.#timeout);
  };

  #bindEvents() {
    if (this.#isBound) {
      return;
    }
    this.#isBound = true;
    EVENTS.forEach(event => document.addEventListener(event, this.#handleEvent, LISTENER_OPTIONS));
  }

  #unbindEvents() {
    if (!this.#isBound) {
      return;
    }
    this.#isBound = false;
    EVENTS.forEach(event => document.removeEventListener(event, this.#handleEvent, LISTENER_OPTIONS));
  }
}
