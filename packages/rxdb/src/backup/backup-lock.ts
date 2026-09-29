/** 已获得的 Web Lock。 */
export interface RxDBBackupHeldLock {
  /**
   * 释放锁，幂等。
   *
   * @remarks
   * 返回的 promise 在锁管理器真正放掉锁之后才 resolve：同步放行只是让回调的 promise settle，
   * 锁本身要晚一拍才归还，紧接着的 `tryAcquire` 会把自己刚放掉的锁误判成被别人占着。
   */
  release(): Promise<void>;
}

/**
 * 当前环境是否提供 Web Locks。
 *
 * @returns 有 `navigator.locks` 时为 `true`
 */
export const hasRxDBBackupWebLocks = (): boolean => typeof navigator !== 'undefined' && navigator.locks !== undefined;

/**
 * 立即尝试获取锁，拿不到就返回 `null`，不排队。
 *
 * @remarks
 * 恢复与正常连接之间的跨上下文互斥用它：排队意味着恢复要等一个可能永远不断开的连接，
 * 或者连接要等一次与它无关的恢复，两者都应当立刻报错交给调用方决定。
 *
 * Web Locks 的锁在回调返回的 promise settle 时释放，所以这里交出去一个不会自己结束的 promise，
 * 由 `release()` 手动 resolve。
 *
 * @param name - 锁名
 * @param mode - `exclusive` 给恢复，`shared` 给正常连接
 * @returns 持有的锁，或 `null`
 */
export const tryAcquireRxDBBackupLock = (name: string, mode: LockMode): Promise<RxDBBackupHeldLock | null> =>
  new Promise<RxDBBackupHeldLock | null>((resolve, reject) => {
    const settled: Promise<unknown> = navigator.locks.request(name, { mode, ifAvailable: true }, lock => {
      if (!lock) {
        resolve(null);
        return undefined;
      }
      return new Promise<void>(release => {
        resolve({
          release: async () => {
            release();
            await settled;
          }
        });
      });
    });
    settled.catch(reject);
  });
