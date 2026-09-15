/**
 * @fileoverview QueryCache 出站队列占用的测试替身
 */

import type { QueryCachePendingWriteIds } from '../../index.js';

/**
 * 出站队列是空的：同步流程按「远端权威」照常处置每一行。
 *
 * @remarks
 * 绝大多数 QueryCache 用例验的是 diff 与增量拉取本身，与离线写无关。用一个具名常量
 * 把「队列空」这个前提写在明处，比每个文件各摆一个匿名闭包更好读，也让「哪些用例
 * 依赖队列非空」一眼可查 —— 队列**非空**时的行为由
 * `repository/query-cache-primary.offline-write.spec.ts` 专门守着。
 *
 * 类型走 barrel 而不是源码路径：`QueryCacheSessionContext` 的 `pendingWriteIds` 字段引用了它，
 * 那它就必须是公开导出的（插件包要按这个契约收参），这一行顺带把这件事钉住。
 */
export const noPendingWrites: QueryCachePendingWriteIds = async () => new Set<string>();
