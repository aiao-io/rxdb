/**
 * @fileoverview 同步管理器的纯函数工具集
 *
 * 从 {@link SyncManager} 抽出的无状态辅助函数。US-025 阶段 D 之前它们住在
 * `@aiao/rxdb-plugin-history` 的 `version-manager.utils.ts`，随 `bulkSync` 一起搬过来 ——
 * 两个函数的形参都是 {@link SyncRepositoryResult}，这是同步侧的类型。
 */

import { RxDBPartialSyncError } from '@aiao/rxdb';
import type { SyncRepositoryResult } from './sync-repository.js';

/** 一次仓库同步是否改写了本地实体数据（undo 历史边界因此失效） */
export const hasSyncedData = (result: SyncRepositoryResult | undefined): boolean =>
  result?.historyInvalidated === true || (result?.pushResult?.pushed ?? 0) > 0;

/**
 * 取出失败项里携带的部分进度。
 *
 * @remarks
 * 仓库在失败前可能已经提交了部分结果，它只存在于 {@link RxDBPartialSyncError.result}。
 * 忽略它会让「远端数据已落库但 undo 边界没推进」的状态逃过检查。
 */
export const partialResultOf = (error: Error | undefined): SyncRepositoryResult | undefined =>
  error instanceof RxDBPartialSyncError ? (error.result as SyncRepositoryResult) : undefined;
