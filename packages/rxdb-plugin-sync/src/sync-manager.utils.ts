/**
 * @fileoverview 同步管理器的纯函数工具集
 *
 * 从 {@link SyncManager} 抽出的无状态辅助函数。US-025 阶段 D 之前它们住在
 * `@aiao/rxdb-plugin-history` 的 `version-manager.utils.ts`，随 `bulkSync` 一起搬过来 ——
 * 两个函数的形参都是 {@link SyncRepositoryResult}，这是同步侧的类型。
 */

import { RxDBPartialSyncError } from '@aiao/rxdb';
import type { SyncRepositoryResult } from './sync-repository.js';

/**
 * 「这次同步已经改写了本地数据」的共同判据形状。
 *
 * @remarks
 * 四个粒度的结果都满足它，所以判据只需要写一份：整库 / 单仓库的 `PullResult` 只有
 * `historyInvalidated`，`SyncRepositoryResult` 还多一段 `pushResult`。两项都取可选，
 * 缺哪一段就当那一段没有进度。
 */
interface SyncedProgress {
  readonly historyInvalidated?: boolean;
  readonly pushResult?: { readonly pushed: number };
}

/** 一次仓库同步是否改写了本地实体数据（undo 历史边界因此失效） */
export const hasSyncedData = (result: SyncedProgress | undefined): boolean =>
  result?.historyInvalidated === true || (result?.pushResult?.pushed ?? 0) > 0;

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
