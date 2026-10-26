/**
 * @fileoverview 同步管理器的纯函数工具集
 *
 * 从 {@link SyncManager} 抽出的无状态辅助函数。US-025 阶段 D 之前它们住在
 * `@aiao/rxdb-plugin-history` 的 `version-manager.utils.ts`，随 `bulkSync` 一起搬过来 ——
 * 两个函数的形参都是 {@link SyncRepositoryResult}，这是同步侧的类型。
 */

import { type RxDBBranch, RxDBError, RxDBPartialSyncError, type WorktreeTableSet } from '@aiao/rxdb';
import type { SyncRepositoryResult } from './sync-repository.js';

/**
 * 「这次同步使撤销边界失效」的共同判据形状。
 *
 * @remarks
 * 整库与单仓库的拉取结果提供 `historyInvalidated`，推送结果提供 `pushed`，
 * 组合结果还会嵌套一段 `pushResult`。字段都取可选，缺哪一段就当那一段没有进度。
 */
interface SyncedProgress {
  readonly historyInvalidated?: boolean;
  readonly pushed?: number;
  readonly pushResult?: { readonly pushed: number };
}

/** 同步是否已改写本地实体或向远端上行，因而需要使撤销边界失效 */
export const hasSyncedData = (result: SyncedProgress | undefined): boolean =>
  result?.historyInvalidated === true || (result?.pushed ?? 0) > 0 || (result?.pushResult?.pushed ?? 0) > 0;

/**
 * 中断的同步里是否带着「已经落库 / 已经上行」的进度。
 *
 * @remarks
 * 部分成功以 {@link RxDBPartialSyncError} 的形式抛出，进度只挂在它的 `result` 上。
 * `pull` / `pullRepository` / `sync` / `syncRepository` 四个入口共用这一条判据 ——
 * 各写各的 `instanceof` + 强转，迟早会有一个入口漏掉 `pushResult` 那一半。
 */
export const partialSyncInvalidatesHistory = (error: unknown): boolean =>
  error instanceof RxDBPartialSyncError && hasSyncedData(error.result as SyncedProgress);

/**
 * 取出失败项里携带的部分进度。
 *
 * @remarks
 * 仓库在失败前可能已经提交了部分结果，它只存在于 {@link RxDBPartialSyncError.result}。
 * 忽略它会让「远端数据已落库但 undo 边界没推进」的状态逃过检查。
 */
export const partialResultOf = (error: Error | undefined): SyncRepositoryResult | undefined =>
  error instanceof RxDBPartialSyncError ? (error.result as SyncRepositoryResult) : undefined;

/**
 * 同步只在主检出位上跑（US-314，owner 2026-10-21 定）：挂在可写检出位上时抛错。
 *
 * @param tableSet - 入口处传实例挂的那一套（`rxdb.worktreeTableSet`），写事务里传本事务落在的那一套（`executor.tableSet`）
 * @param operation - 报错里点名的入口
 * @param branch - 异步读取的分支；给出时也核对它属于主检出位，防止换挂往返后拿到旧快照
 * @throws RxDBError 挂在可写检出位上时
 *
 * @remarks
 * 查两处。入口处挡住「挂在检出位上直接调用」；写业务表的同步事务里再查一次，挡住「同步跑到一半时换挂」——
 * 排在换挂之后的事务落在新那套表上，接着写就是把主检出位那条分支的同步数据写进检出位的表。
 * 只写系统表（变更日志、分支、水位线）的事务不必查：这几张表只有一份，不分检出位。
 */
export const assertSyncOnMainCheckout = (
  tableSet: WorktreeTableSet,
  operation: string,
  branch?: Pick<RxDBBranch, 'id' | 'activated'>
): void => {
  if (!tableSet.isMain) {
    throw new RxDBError(`${operation}: 本实例挂在可写检出位上（表集 ${tableSet.suffix}），同步只在主检出位上跑`);
  }
  if (branch !== undefined && !branch.activated) {
    throw new RxDBError(`${operation}: 读取期间检出位已变，拒绝同步非主检出位分支 ${branch.id}`);
  }
};
