/**
 * @fileoverview 快照适配器上的只读捕获钩子：只读三层防线的第二层（US-313）。
 *
 * @remarks
 * 第一层是核心的 `readOnly`（公开写入口抛 {@link RxDBReadOnlyError}），第三层是引擎封印
 * （`sealWorktreeReadOnly()`）。这一层拦的是绕过核心写入口、却仍经过适配器挂载点的写：
 * 批量合并、切分支、`upsertMany` / `deleteByIds`、raw 写与外部通知。它们落到引擎上也会被封印拒绝，
 * 在这里先拒是为了让调用方拿到类型化的错误，而不是一条后端各异的驱动错误。
 *
 * 挂载点 1（事务）放行：读也要开事务，事务里的写由第三层兜住。
 */

import type { InterceptedBulkWrite, WorkingTreeCaptureHook } from '@aiao/rxdb';
import { RxDBReadOnlyError } from '@aiao/rxdb';
import { containsWriteStatement } from '../working-tree/raw-write-judgment.js';

const BULK_WRITE_METHODS: Readonly<Record<InterceptedBulkWrite, string>> = {
  upsert_many: 'upsertMany',
  delete_by_ids: 'deleteByIds'
};

/**
 * 造一个拒绝一切写的捕获钩子。
 *
 * @returns 装到快照适配器上的钩子（`adapter.setWorkingTreeCaptureHook()`）
 */
export const createReadOnlyCaptureHook = (): WorkingTreeCaptureHook => ({
  bindMountTarget: () => undefined,
  interceptTransaction: (_host, next, fun, transactionLog) => next(fun, transactionLog),
  interceptMergeChanges: () => Promise.reject(new RxDBReadOnlyError('mergeChanges')),
  interceptSwitchBranch: () => Promise.reject(new RxDBReadOnlyError('switchBranch')),
  // 与工作树的批量写门同一个时点：返回 Observable 之前同步拒绝
  interceptBulkWrite: (_host, _next, entityName, operation) => {
    throw new RxDBReadOnlyError(BULK_WRITE_METHODS[operation], entityName);
  },
  gateRawWrite: async (sql, execute) => {
    if (containsWriteStatement(sql)) throw new RxDBReadOnlyError('rawQuery');
    return execute();
  },
  gateExternalNotify: entityName => {
    throw new RxDBReadOnlyError('notifyExternalUpdate', entityName);
  }
});
