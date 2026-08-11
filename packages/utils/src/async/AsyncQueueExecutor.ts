/** 任务去重标识。相同 id 的任务在前一次未结算前会复用同一个 Promise。 */
export type TaskId = string | number;

interface QueueItem {
  id?: TaskId;
  run: () => Promise<void>;
  reject: (reason?: unknown) => void;
}

/** {@link AsyncQueueExecutor.getStatus} 的返回值。 */
export interface ExecutorStatus {
  /** 正在执行的任务数。 */
  running: number;
  /** 仍在排队、尚未开始的任务数。 */
  queued: number;
  /** 当前并发上限。 */
  maxConcurrent: number;
}

const assertConcurrency = (value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('maxConcurrent must be a positive safe integer');
  }
  return value;
};

/**
 * 有并发上限的异步任务队列。
 *
 * 任务按入队顺序**开始**执行，但完成顺序取决于各自耗时，不保证有序。
 * 单个任务失败只让它自己的 Promise reject，不影响队列继续消费后续任务。
 *
 * @example
 * const executor = new AsyncQueueExecutor(2);
 * const result = await executor.addTask(() => fetch(url));
 * await executor.waitForAll();
 */
export class AsyncQueueExecutor {
  private maxConcurrent: number;
  private running = 0;
  private queue: QueueItem[] = [];
  private readonly queueMap = new Map<TaskId, Promise<unknown>>();
  private readonly drainResolvers: Array<() => void> = [];

  /**
   * @param maxConcurrent - 并发上限，默认 3
   * @throws `RangeError` `maxConcurrent` 不是正的安全整数
   */
  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = assertConcurrency(maxConcurrent);
  }

  /**
   * 入队一个任务，返回其结果。
   *
   * 传了 `id` 且同 id 的任务尚未结算时，直接复用已有 Promise，不会重复执行；
   * 任务结算（无论成功失败）后同一个 id 可以再次入队。
   *
   * @param task - 任务函数，可返回同步值或 Promise
   * @param id - 可选去重标识
   * @returns 任务结果；任务抛错时以同一个异常 reject；
   *          排队期间被 {@link AsyncQueueExecutor.clearQueue} 取消时以
   *          `Error('Task cancelled: queue cleared')` reject
   */
  addTask<T>(task: () => T | Promise<T>, id?: TaskId): Promise<T> {
    if (id !== undefined) {
      const existing = this.queueMap.get(id);
      if (existing) return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        reject,
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        }
      });
    });

    if (id !== undefined) this.queueMap.set(id, promise);
    this.runNext();
    return promise;
  }

  /**
   * 读取当前队列状态的快照。
   *
   * @returns 执行中 / 排队中数量与当前并发上限；返回的是普通对象，不随后续变化更新
   */
  getStatus(): ExecutorStatus {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * 调整并发上限。
   *
   * 调高会立即补跑排队中的任务；调低不会中断已在执行的任务，只影响后续调度。
   *
   * @param newMax - 新的并发上限
   * @throws `RangeError` `newMax` 不是正的安全整数
   */
  setMaxConcurrent(newMax: number): void {
    this.maxConcurrent = assertConcurrency(newMax);
    this.runAvailable();
  }

  /**
   * 清空**尚未开始**的任务。
   *
   * 每个被取消任务的 Promise 以 `Error('Task cancelled: queue cleared')` reject，
   * 并从去重表中移除。**已在执行**的任务不受影响，会继续跑完。
   */
  clearQueue(): void {
    const queued = this.queue.splice(0);
    const error = new Error('Task cancelled: queue cleared');
    for (const item of queued) {
      if (item.id !== undefined) this.queueMap.delete(item.id);
      item.reject(error);
    }
    this.checkDrain();
  }

  /**
   * 等待队列排空。
   *
   * 队列本就是空的时候立即 resolve。**永远不会 reject**：任务失败由
   * {@link AsyncQueueExecutor.addTask} 返回的 Promise 单独承担，这里只表示「都结算完了」。
   * 排空后再入队新任务不影响已经 resolve 的 Promise，需要重新调用。
   *
   * @returns 队列中执行中与排队中任务都结算后 resolve
   */
  waitForAll(): Promise<void> {
    if (this.running === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise<void>(resolve => this.drainResolvers.push(resolve));
  }

  /**
   * 正在执行的任务数。
   *
   * @returns 执行中的任务数，等价于 `getStatus().running`
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * 仍在排队的任务数。
   *
   * @returns 排队中的任务数，等价于 `getStatus().queued`
   */
  getQueuedCount(): number {
    return this.queue.length;
  }

  private checkDrain(): void {
    if (this.running !== 0 || this.queue.length !== 0) return;
    this.drainResolvers.splice(0).forEach(resolve => resolve());
  }

  private runAvailable(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.runNext();
    }
  }

  private runNext(): void {
    if (this.running >= this.maxConcurrent) return;
    const item = this.queue.shift();
    if (!item) {
      this.checkDrain();
      return;
    }

    this.running++;
    void item.run().finally(() => {
      this.running--;
      if (item.id !== undefined) this.queueMap.delete(item.id);
      this.runAvailable();
      this.checkDrain();
    });
  }
}
