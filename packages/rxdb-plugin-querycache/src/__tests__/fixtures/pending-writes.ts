/**
 * @fileoverview QueryCache 出站队列占用的测试替身
 */

import { RxDBBranch, RxDBChange, RxDBSync, type QueryCachePendingWriteIds } from '@aiao/rxdb';

/**
 * 出站队列是空的：同步流程按「远端权威」照常处置每一行。
 *
 * @remarks
 * 绝大多数 QueryCache 用例验的是 diff 与增量拉取本身，与离线写无关。用一个具名常量
 * 把「队列空」这个前提写在明处，比每个文件各摆一个匿名闭包更好读，也让「哪些用例
 * 依赖队列非空」一眼可查 —— 队列**非空**时的行为由
 * `query-cache-primary.offline-write.spec.ts` 专门守着。
 *
 * 类型从 `@aiao/rxdb` 取而不是从本包：`QueryCacheEngine` 的构造签名引用了它，
 * 那它就必须留在核心的公开面上，这一行顺带把这件事钉住（US-025 B5）。
 */
export const noPendingWrites: QueryCachePendingWriteIds = async () => new Set<string>();

/**
 * 本地适配器上的**系统表**仓储替身：分支答一个激活的 `main`，另两张表答空。
 *
 * @remarks
 * `pendingQueryCacheWriteIds` 要三样东西：当前分支、本地适配器上的 `rxdb_change` 仓储、
 * 同一仓库的 `RxDBSync` 水位线。手搭 `as unknown as RxDB` 的用例本来就没接版本子系统，
 * 这里把这三样一次补齐，让它们继续只验自己那件事。
 *
 * 替身从前挂在 `VersionManager` 上（那时 `pendingQueryCacheWriteIds` 收的就是它）。
 * US-025 阶段 C 之后它收 `RxDB`，经 `getCurrentBranch(rxdb)` /
 * `getLocalSystemRepositories(rxdb)` 真的从 `localAdapter$` 上取仓储，
 * 替身只能落到适配器的 `getRepository()` 上——**按实体类分流**，
 * 否则系统表读会打到业务行仓储上，拿一批 `CachedEntity` 当分支用。
 *
 * 分支必须答得出来：查不到激活分支时 `getCurrentBranch` 会掉进冷路径，开一次事务
 * 再 `update` / `create`，而这里的适配器替身没有 `transaction`。
 *
 * 另两张表答空 —— 没有水位线、队列里没有行 —— 于是 `pendingQueryCacheWriteIds`
 * 返回空集，同步流程照「远端权威」跑，与搬迁之前逐字一致。
 *
 * 队列**非空**时的行为不在这里验，由 `query-cache-primary.offline-write.spec.ts`
 * 用显式的占用集合专门守着。
 *
 * @param EntityType - `getRepository()` 收到的实体类
 * @returns 系统表的只读替身；不是系统表则 `undefined`，交回调用方落到业务行仓储
 */
export const systemRepositoryStub = (EntityType: unknown): { find: () => Promise<unknown[]> } | undefined => {
  if (EntityType === RxDBBranch) return { find: async () => [{ id: 'main', activated: true }] };
  if (EntityType === RxDBChange || EntityType === RxDBSync) return { find: async () => [] };
  return undefined;
};
