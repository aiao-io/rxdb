/**
 * @fileoverview 检出位的 Web Lock（US-313 阶段 C）：持有它的上下文正在用这个检出位。
 *
 * @remarks
 * 每个检出位一把排他锁，名字是主库库名加检出位 id。打开（写登记行之前）与 `attach()` 时拿，关闭或放开时还。
 * 标签页关掉或崩掉，浏览器替它还锁，于是「锁没人持有」就是「没有上下文在用」：回收只碰拿得到锁的检出位。
 *
 * 不设共享锁：快照库的存储本身是单上下文的（OPFS 的同步访问句柄、PGlite 的数据目录），一个检出位同一时刻
 * 只能在一处打开。Node 26 起 `navigator.locks` 在进程内可用，进程即一个会话。
 */

import { WorktreeUnavailableError } from './worktree-errors.js';

/** 释放一把检出位锁，锁真正还掉之后才落定；重复调用无副作用。 */
export type WorktreeLockRelease = () => Promise<void>;

const locksOf = (): LockManager => {
  const locks = globalThis.navigator?.locks;
  if (locks) return locks;
  throw new WorktreeUnavailableError(
    'locks_unavailable',
    '这个运行时没有 navigator.locks：检出位靠 Web Locks 判断有没有上下文在用它'
  );
};

/**
 * 检出位的锁名。
 *
 * @param mainDbName - 主库的 `config.dbName`
 * @param id - 检出位 id
 * @returns Web Lock 名
 */
export const worktreeLockName = (mainDbName: string, id: string): string => `rxdb-worktree:${mainDbName}:${id}`;

/**
 * 拿下检出位的锁并一直持有，直到调用交回的释放函数。
 *
 * @param name - {@link worktreeLockName} 的结果
 * @param ifAvailable - 为 `true` 时锁被别人持有就不等，交回 `null`
 * @returns 释放函数；`ifAvailable` 且锁被持有时为 `null`
 * @throws {@link WorktreeUnavailableError} `locks_unavailable`：运行时没有 `navigator.locks`
 */
export const holdWorktreeLock = (name: string, ifAvailable = false): Promise<WorktreeLockRelease | null> =>
  new Promise((resolve, reject) => {
    const held: Promise<unknown> = locksOf().request(name, { mode: 'exclusive', ifAvailable }, lock => {
      if (!lock) {
        resolve(null);
        return undefined;
      }
      // 回调返回的 promise 一天不落定，锁就一天不还；`request()` 自己的 promise 要等锁真还掉才落定，
      // 释放函数等它，紧接着的 `attach()` / `prune()` 才拿得到锁
      return new Promise<void>(release =>
        resolve(async () => {
          release();
          await held;
        })
      );
    });
    held.catch(reject);
  });
