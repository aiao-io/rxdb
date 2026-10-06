import type { AsyncQueueExecutor } from '@aiao/utils';
import { RxDBBackupError } from './backup-error.js';

/** {@link runRxDBBackupWhenQueued} 的选项。 */
export interface RxDBBackupQueueOptions {
  /** 取消信号：只在排队期间生效。 */
  readonly signal?: AbortSignal;
  /** 排队时限（毫秒），超时报 `lock_timeout`。 */
  readonly timeoutMs: number;
  /** 错误信息里的操作名，例如 `PGlite backup`。 */
  readonly label: string;
}

/**
 * 在 adapter 的串行队列里执行备份任务，排队本身有时限、可取消。
 *
 * @remarks
 * 只有「还在排队」这一段受超时与取消控制：任务一旦开始执行就交给它自己的取消逻辑（归档写入器
 * 会在每次写之前检查信号），否则超时回调会在快照写到一半时把调用方放走，而任务仍占着数据库。
 * 超时或取消后任务轮到时直接跳过，不会在没人等待的情况下再做一次快照。
 *
 * @param queue - adapter 的串行队列
 * @param task - 轮到时执行的任务
 * @param options - 取消信号、排队时限与操作名
 * @returns 任务结果
 * @throws RxDBBackupError `aborted` 排队中被取消或被 `clearQueue()` 清出队列；`lock_timeout` 排队超时
 */
export const runRxDBBackupWhenQueued = <T>(
  queue: AsyncQueueExecutor,
  task: () => Promise<T>,
  options: RxDBBackupQueueOptions
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const { signal, timeoutMs, label } = options;
    const abortError = (): RxDBBackupError =>
      new RxDBBackupError('aborted', `${label} was aborted`, { cause: signal?.reason });
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let waiting = true;
    const stopWaiting = (): void => {
      waiting = false;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const giveUp = (error: RxDBBackupError): void => {
      if (!waiting) return;
      stopWaiting();
      reject(error);
    };
    const onAbort = (): void => giveUp(abortError());
    const timer = setTimeout(
      () =>
        giveUp(
          new RxDBBackupError('lock_timeout', `${label} waited more than ${timeoutMs}ms for the database`, {
            details: { field: 'lockTimeoutMs', expected: timeoutMs }
          })
        ),
      timeoutMs
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    queue
      .addTask(async () => {
        if (!waiting) return;
        stopWaiting();
        try {
          resolve(await task());
        } catch (error) {
          reject(error);
        }
      })
      .catch((cause: unknown) =>
        giveUp(new RxDBBackupError('aborted', `${label} was removed from the queue`, { cause }))
      );
  });
