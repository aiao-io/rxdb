import { demand } from '../model.js';

/**
 * 按键缓存的按需内容，供视图同步读取。
 * - 命中：同步返回内容。
 * - 未命中：`peek` 返回 undefined，并在没有进行中的加载、且该键没失败过时后台加载一次；
 *   同一键的并发读取（含 {@link ContentCache.load}）共用一次请求，每次加载完成通知 `loaded`。
 * - 失败：记录该键，之后的 `peek` 不再自动重试，避免失败请求在重绘里形成重试风暴；
 *   {@link ContentCache.retry} 清除记录后才会再试，用户操作发起的 {@link ContentCache.load} 总会再试一次。
 * - 过期：{@link ContentCache.invalidate} 把已有内容标为过期（可变内容的失效通知点到它时）。过期的内容照常返回，
 *   下一次 `peek` 在后台重读一次，读完替换并通知；从未再被读取的过期内容不会发请求。
 * - {@link ContentCache.reset} 丢弃全部内容并使进行中的加载失效，其结果不再写入，也不再通知。
 */
export class ContentCache<T> {
  private readonly values = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly failures = new Set<string>();
  private readonly stale = new Set<string>();
  /** 每个键被标为过期的次数：读取开始之后又被标为过期的，读完仍保持过期，下一次读取再重读。 */
  private readonly marks = new Map<string, number>();
  private epoch = 0;

  /**
   * @param fetch 取回某个键的内容；必须返回 Promise（不能同步抛错）。
   * @param loaded 内容加载完成后调用，通常用来触发界面重绘。
   * @param failed 后台加载失败时调用；由用户操作发起的加载失败由调用方自己处理，不经此处。
   */
  constructor(
    private readonly fetch: (key: string) => Promise<T>,
    private readonly loaded: () => void,
    private readonly failed: (error: unknown) => void
  ) {}

  /** 同步读取：命中返回内容（过期的也返回，并在后台重读一次）；未命中返回 undefined 并触发后台加载。 */
  peek(key: string): T | undefined {
    const known = this.values.has(key);
    if (known && !this.stale.has(key)) return this.values.get(key);
    if (!this.pending.has(key) && !this.failures.has(key)) {
      const epoch = this.epoch;
      this.fetchInto(key).catch((error: unknown) => {
        if (epoch === this.epoch) this.failed(error);
      });
    }
    return known ? this.values.get(key) : undefined;
  }

  /** 异步读取：命中（且未过期）直接返回，加载进行中则共用它，否则发起加载；失败时抛出，调用方决定如何提示。 */
  load(key: string): Promise<T> {
    if (this.values.has(key) && !this.stale.has(key)) return Promise.resolve(this.values.get(key) as T);
    return this.fetchInto(key);
  }

  /** 把这些键（省略时为全部）已有的内容标为过期：照常返回，下一次读取时在后台重读。 */
  invalidate(keys?: Iterable<string>): void {
    for (const key of [...(keys ?? this.values.keys())]) {
      if (!this.values.has(key) && !this.pending.has(key)) continue;
      this.stale.add(key);
      this.marks.set(key, (this.marks.get(key) ?? 0) + 1);
    }
  }

  /** 清除失败记录，之后对失败过的键的下一次 `peek` 会再试一次。 */
  retry(): void {
    this.failures.clear();
  }

  /** 丢弃全部内容与失败记录，并使进行中的加载失效。 */
  reset(): void {
    this.epoch++;
    this.values.clear();
    this.pending.clear();
    this.failures.clear();
    this.stale.clear();
    this.marks.clear();
  }

  /** 读取一个键并写入：同一键的并发读取共用一次请求；期间被重置则结果不写入。 */
  private fetchInto(key: string): Promise<T> {
    const joined = this.pending.get(key);
    if (joined) return joined;
    const epoch = this.epoch;
    const mark = this.marks.get(key) ?? 0;
    const request: Promise<T> = this.fetch(key).then(
      value => {
        demand(epoch === this.epoch, 'cancelled', '上下文已切换');
        this.values.set(key, value);
        if ((this.marks.get(key) ?? 0) === mark) this.stale.delete(key);
        this.failures.delete(key);
        this.loaded();
        return value;
      },
      (error: unknown) => {
        if (epoch === this.epoch) this.failures.add(key);
        throw error;
      }
    );
    this.pending.set(key, request);
    const settled = () => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    };
    void request.then(settled, settled);
    return request;
  }
}
