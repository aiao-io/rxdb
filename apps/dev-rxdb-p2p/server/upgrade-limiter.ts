/**
 * 信令升级的限速：每个来源地址在一个固定窗口内至多升级若干次。
 *
 * @remarks
 * 每次升级都带来一次 hello，也就是两次认证宿主调用（Supabase Auth + 设备查询）：不限速时谁都能循环开连接，
 * 借 Worker 把认证宿主打到限流。计数只在内存里，对象休眠后清零；洪泛期间对象一直醒着，不影响效果。
 * 记着的来源数有上限：超了先清掉窗口已过的，仍超就丢最早记下的，内存不随来源数无界增长。
 */

/** 限速参数。 */
export interface UpgradeLimiterOptions {
  /** 每个来源一个窗口内至多升级的次数。 */
  readonly limit: number;
  /** 窗口长度（毫秒）。 */
  readonly windowMs: number;
  /** 至多同时记着的来源数。 */
  readonly maxSources: number;
  /** 当前时刻（epoch 毫秒）。 */
  readonly now: () => number;
}

interface Window {
  readonly start: number;
  count: number;
}

/** 按来源地址的升级限速。 */
export class UpgradeLimiter {
  readonly #options: UpgradeLimiterOptions;
  readonly #windows = new Map<string, Window>();

  constructor(options: UpgradeLimiterOptions) {
    this.#options = options;
  }

  /** 记一次升级；这个来源本窗口的额度已用完时返回 false，不计数。 */
  allow(source: string): boolean {
    const now = this.#options.now();
    const window = this.#windows.get(source);
    if (window && now - window.start < this.#options.windowMs) {
      if (window.count >= this.#options.limit) return false;
      window.count += 1;
      return true;
    }
    // 先删再插：Map 按插入顺序遍历，最早开窗的来源排在最前，超量时先丢它
    this.#windows.delete(source);
    this.#windows.set(source, { start: now, count: 1 });
    this.#trim(now);
    return true;
  }

  #trim(now: number): void {
    if (this.#windows.size <= this.#options.maxSources) return;
    for (const [source, window] of this.#windows) {
      if (now - window.start >= this.#options.windowMs) this.#windows.delete(source);
    }
    for (const source of this.#windows.keys()) {
      if (this.#windows.size <= this.#options.maxSources) return;
      this.#windows.delete(source);
    }
  }
}
