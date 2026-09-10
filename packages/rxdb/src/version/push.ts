import { SyncBeginEvent, SyncCompleteEvent, SyncErrorEvent } from '../rxdb-events.js';
import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { BulkSyncOptions } from './bulk-sync.js';
import { pushBranch } from './push-branch.js';
import { PushOptions, PushResult } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';

/**
 * Push 功能实现
 *
 * 将本地未同步的变更推送到远程
 * 先同步分支数据，再使用 bulkSync 批量推送所有 repositories
 *
 * @param vm - VersionManager 实例
 * @param options - Push 选项
 * @returns Push 结果
 */
export async function push(vm: VersionManager, options?: PushOptions): Promise<PushResult> {
  const rxdb = vm.rxdb;

  // 验证远程适配器配置
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  // 触发同步开始事件
  rxdb.dispatchEvent(new SyncBeginEvent('push'));

  try {
    // 先同步分支数据到远程（确保远程有该分支后再推送实体数据）
    const branchPush = await pushBranch(vm);

    // 使用 bulkSync 批量推送
    const bulkOptions: BulkSyncOptions = {
      operation: 'push',
      repositories: options?.repositoryFilter?.map(item => {
        if (typeof item === 'string') {
          return { namespace: 'public', entity: item };
        }
        return item;
      }),
      ...(options?.batchSize === undefined ? {} : { push: { batchSize: options.batchSize } })
    };

    const bulkResult = await vm.bulkSync(bulkOptions);

    // 汇总结果
    const pushResult: PushResult = {
      pushed: 0,
      failed: 0,
      compacted: 0,
      originalCount: 0,
      failures: []
    };

    for (const result of bulkResult.results) {
      // 失败仓库自己已提交的进度也要累加 —— 它藏在 `RxDBPartialSyncError.result` 里，
      // 被 bulkSync 原样挂在 `result.result` 上（见 syncSingleRepository）。
      // 与 pull.ts 同口径。
      const repoResult = result.result?.pushResult;
      if (repoResult) {
        pushResult.pushed += repoResult.pushed;
        pushResult.failed += repoResult.failed;
        pushResult.compacted += repoResult.compacted;
        pushResult.originalCount += repoResult.originalCount;
      }

      if (result.success) continue;

      // 失败**不折算成 failed += 1**：failed 的单位是变更条数，混进仓库计数会破坏
      // `originalCount = pushed + failed + compacted`。失败结构化保留在 failures 里。
      const failure =
        result.error ??
        new RxDBError(`Repository push failed: ${result.repository.namespace}:${result.repository.entity}`);
      pushResult.failures.push({
        repository: result.repository,
        // 嵌套的 partial error 解包成根因，避免调用方拿到「错误里套错误」（与 pull.ts 同口径）
        error: failure instanceof RxDBPartialSyncError ? failure.cause : failure
      });
    }

    // 分叉点在本轮推送前还没有 remoteId 时，上一步只能带 null 上行。
    // 实体变更推完后分叉点已拿到 remoteId，补推一次把远端那一行补全。
    if (branchPush.forkPointPending && pushResult.pushed > 0) {
      await pushBranch(vm);
    }

    // 触发同步完成事件
    rxdb.dispatchEvent(new SyncCompleteEvent('push', pushResult));

    return pushResult;
  } catch (error) {
    // 触发同步错误事件
    rxdb.dispatchEvent(new SyncErrorEvent('push', error as Error));
    throw error;
  }
}
