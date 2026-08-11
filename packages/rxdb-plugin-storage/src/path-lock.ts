/**
 * @fileoverview OPFS 写操作的串行化协议。
 *
 * @remarks
 * STOR-002：早先只有 `upload()` 走路径锁，`rename` / `renameDirectory` / `delete` /
 * `fetch` / `clear` 都在锁外执行「预检 → 写 OPFS → 写 metadata → 补偿」。
 * 由此产生的确定性交错会**删掉别人已提交的文件**：rename 预检目标不存在并把
 * `previousTarget` 快照成 `null`，随后 upload 在同一目标成功提交，rename 覆写目标、
 * metadata 更新因唯一索引失败，回滚按 `null` 删除目标文件 —— upload 的 meta 还在、文件没了。
 *
 * 因此所有变更必须共用同一套协议，且 rename 这类涉及两个路径的操作要**一次性**
 * 持有全部相关路径的锁。
 *
 * @module rxdb-plugin-storage/path-lock
 */

const RESOLVED: Promise<void> = Promise.resolve();
const ignore = (): void => undefined;

/**
 * 按 OPFS 路径串行化写操作，并额外提供一个覆盖全部路径的独占模式。
 *
 * 两种粒度：
 * - {@link withPaths} —— 文件级操作。同一路径互斥，不同路径可并行。
 * - {@link withExclusive} —— 目录级操作（目录改名、清库）。与**所有**路径级操作互斥。
 *
 * @remarks
 * **无死锁**：`withPaths` 内部把路径去重并按字典序排序后一次性登记，
 * 因此任意两个操作获取公共路径的顺序一致，不会互相等待成环。
 *
 * **失败不阻塞后继**：队列以「上一个操作 settle」为起点，前一个操作抛错不会把
 * 排队者一并拒绝。
 *
 * 在支持 Web Locks 的浏览器中，路径锁会再经过同一根目录的跨上下文 gate；Node/
 * happy-dom 等没有该 API 的环境继续使用进程内队列。
 */
export class PathLockManager {
  readonly #scope: string | undefined;
  readonly #webLocks: Pick<LockManager, 'request'> | null;

  /** 每个路径的队列尾指针；队列排空即删表项，避免长期运行实例无限累积键。 */
  readonly #pathTails = new Map<string, Promise<unknown>>();

  /** 独占操作的闸门：非独占操作必须先等它 resolve 才能开始。 */
  #gate: Promise<unknown> = RESOLVED;

  /** 已登记但尚未结束的路径级操作，供独占操作等待排空。 */
  readonly #pending = new Set<Promise<unknown>>();

  /**
   * @param scope - 同一 OPFS 根目录的跨上下文锁命名空间；省略时只启用进程内锁。
   * @param webLocks - Web Locks 实现；省略时从当前浏览器环境探测，传 `null` 可显式禁用。
   */
  constructor(scope?: string, webLocks: Pick<LockManager, 'request'> | null = detectWebLocks()) {
    this.#scope = scope;
    this.#webLocks = webLocks;
  }

  /**
   * 一次性持有 `paths` 的全部路径锁并执行 `fn`。
   *
   * @param paths - 本次操作会读写的全部 OPFS 路径（允许重复，内部去重）
   * @param fn - 临界区
   * @returns `fn` 的返回值（含其异常）
   */
  withPaths<T>(paths: ReadonlyArray<string>, fn: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(paths)].sort();
    // 闸门快照与登记必须同步完成：中间若 await，并发的 withExclusive 会漏掉本操作。
    const predecessors = ordered.map(path => this.#pathTails.get(path) ?? RESOLVED);
    const run = Promise.allSettled([this.#gate, ...predecessors]).then(() => this.withWebPathLocks(ordered, fn));
    const tail = run.then(ignore, ignore);

    for (const path of ordered) this.#pathTails.set(path, tail);
    this.#pending.add(tail);

    void tail.then(() => {
      this.#pending.delete(tail);
      for (const path of ordered) {
        if (this.#pathTails.get(path) === tail) this.#pathTails.delete(path);
      }
    });

    return run;
  }

  /**
   * 独占执行 `fn`：等已登记的路径级操作全部结束，期间新来的路径级操作排队等待。
   *
   * 用于目录改名、清库这类无法用有限路径集合表达的操作。
   *
   * @param fn - 临界区
   * @returns `fn` 的返回值（含其异常）
   */
  withExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previousGate = this.#gate;
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    // 先关闸：此后登记的路径级操作都会等到 `release()`
    this.#gate = previousGate.then(
      () => held,
      () => held
    );

    const inFlight = [...this.#pending];
    const run = Promise.allSettled([previousGate, ...inFlight]).then(() => this.withWebExclusiveLock(fn));

    void run.then(ignore, ignore).then(release);

    return run;
  }

  private withWebPathLocks<T>(paths: ReadonlyArray<string>, fn: () => Promise<T>, index = 0): Promise<T> {
    if (!this.#webLocks || !this.#scope) return fn();

    if (index === 0) {
      return this.#webLocks.request(createGateLockName(this.#scope), { mode: 'shared' }, () =>
        this.withWebPathLocks(paths, fn, 1)
      );
    }

    if (index > paths.length) return fn();

    return this.#webLocks.request(createPathLockName(this.#scope, paths[index - 1]), () =>
      this.withWebPathLocks(paths, fn, index + 1)
    );
  }

  private withWebExclusiveLock<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.#webLocks || !this.#scope) return fn();
    return this.#webLocks.request(createGateLockName(this.#scope), { mode: 'exclusive' }, fn);
  }
}

/** 构造稳定的路径锁名；Web Locks 的命名空间由浏览器按 origin 隔离。 */
export const createPathLockName = (scope: string, path: string): string => `${scope}:path:${encodeURIComponent(path)}`;

/** 构造覆盖同一 storage 根目录全部路径的 gate 锁名。 */
export const createGateLockName = (scope: string): string => `${scope}:gate`;

const detectWebLocks = (): Pick<LockManager, 'request'> | null => {
  if (typeof navigator === 'undefined') return null;
  return navigator.locks ?? null;
};
