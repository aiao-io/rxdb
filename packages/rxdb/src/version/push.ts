import { SyncBeginEvent, SyncCompleteEvent, SyncErrorEvent } from '../rxdb-events.js';
import { RxDBError } from '../RxDBError.js';
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
    await pushBranch(vm);

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
    let totalPushed = 0;
    let totalFailed = 0;
    let totalCompacted = 0;
    let totalOriginalCount = 0;

    for (const result of bulkResult.results) {
      if (result.success && result.result) {
        // bulkSync 返回 SyncRepositoryResult (包含 pullResult 和 pushResult)
        // 我们只需要 pushResult
        const pushResult = result.result.pushResult;
        totalPushed += pushResult.pushed ?? 0;
        totalFailed += pushResult.failed ?? 0;
        totalCompacted += pushResult.compacted ?? 0;
        totalOriginalCount += pushResult.originalCount ?? 0;
      } else {
        totalFailed++;
      }
    }

    const pushResult: PushResult = {
      pushed: totalPushed,
      failed: totalFailed,
      compacted: totalCompacted,
      originalCount: totalOriginalCount
    };

    // 触发同步完成事件
    rxdb.dispatchEvent(new SyncCompleteEvent('push', pushResult));

    return pushResult;
  } catch (error) {
    // 触发同步错误事件
    rxdb.dispatchEvent(new SyncErrorEvent('push', error as Error));
    throw error;
  }
}
