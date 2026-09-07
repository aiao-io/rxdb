/**
 * @fileoverview QueryCache 出站队列占用的测试替身
 */

import type { QueryCachePendingWriteIds } from '../../index.js';
import type { VersionManager } from '../../version/VersionManager.js';

/**
 * 出站队列是空的：同步流程按「远端权威」照常处置每一行。
 *
 * @remarks
 * 绝大多数 QueryCache 用例验的是 diff 与增量拉取本身，与离线写无关。用一个具名常量
 * 把「队列空」这个前提写在明处，比每个文件各摆一个匿名闭包更好读，也让「哪些用例
 * 依赖队列非空」一眼可查 —— 队列**非空**时的行为由
 * `repository/query-cache-primary.offline-write.spec.ts` 专门守着。
 *
 * 类型走 barrel 而不是源码路径：`QueryCacheRepository` 的构造签名引用了它，
 * 那它就必须是公开导出的，这一行顺带把这件事钉住。
 */
export const noPendingWrites: QueryCachePendingWriteIds = async () => new Set<string>();

/**
 * 一个「分支是 main、出站队列是空的」版本管理器替身。
 *
 * @remarks
 * `pendingQueryCacheWriteIds` 要三样东西：当前分支、本地适配器上的 `rxdb_change` 仓储、
 * 同一仓库的 `RxDBSync` 水位线。手搭 `as unknown as RxDB` 的用例本来就没接版本子系统，
 * 这里把这三样一次补齐，让它们继续只验自己那件事。
 *
 * 三个仓储读都返回空数组：没有分支记录、没有水位线、队列里没有行 —— 于是
 * `pendingQueryCacheWriteIds` 返回空集，同步流程照「远端权威」跑，与本次改动之前逐字一致。
 *
 * 队列**非空**时的行为不在这里验，由 `repository/query-cache-primary.offline-write.spec.ts`
 * 用显式的占用集合专门守着。
 */
export const emptyOutboxVersionManager = (): VersionManager =>
  ({
    getCurrentBranch: async () => ({ id: 'main' }),
    getLocalRepositories: async () => ({
      adapter: { getRepository: () => ({ find: async () => [] }) }
    })
  }) as unknown as VersionManager;
