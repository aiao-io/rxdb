/**
 * @fileoverview QueryCache 出站队列占用的测试替身
 */

import type { QueryCacheOutboxProvider, QueryCachePendingWriteIds } from '@aiao/rxdb';

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
 * 同一个「队列空」，包成核心要的注册槽形状。
 *
 * @remarks
 * 手搭 `as unknown as RxDB` 的用例要补这个槽：`Repository` 建 QueryCache 会话前会先
 * `getQueryCacheOutbox()`，空槽当场抛 `RxDBMissingPluginError`。
 *
 * 替身**只答一个空集**，不再模拟 `rxdb_change` / `rxdb_sync` / `rxdb_branch` 三张系统表 ——
 * US-025 阶段 D 把队列实现搬进了 `@aiao/rxdb-plugin-sync`，本包的读路径从此一行 changelog
 * 代码都不再触及（阶段 C 时它还要经 `getCurrentBranch()` / `getLocalSystemRepositories()`
 * 真的去读，那份系统表替身也随之作废）。这正是这道接缝要的效果：读引擎与出站队列
 * 谁都不认识谁。
 */
export const noPendingWriteOutbox: QueryCacheOutboxProvider = { pendingWriteIds: noPendingWrites };
