import type { PullResult, PushResult, SyncFailure } from '@aiao/rxdb';
import { getErrorMessage } from './error-message';

/**
 * 一轮推拉在界面上的说法：完成时给提示，有仓库失败时给原因，二者只有一个
 *
 * @remarks
 * `needsAttention` 为真的（有被拒的、有失败的）消息留到用户关掉，不自己消失。
 */
export type SyncOutcome =
  | { readonly notice: string; readonly error: null; readonly needsAttention: boolean }
  | { readonly notice: null; readonly error: string; readonly needsAttention: true };

/**
 * 一轮推送的结果
 *
 * @param result - `syncManager.push()` 的结果
 * @returns 推上去与被拒的条数；推上去了就说明推送前的修改不能再撤销（US-034）；有仓库失败时按实体报出原因
 */
export function describePushOutcome(result: PushResult): SyncOutcome {
  if (result.failures.length > 0)
    return { notice: null, error: `推送没有全部完成：${describeFailures(result.failures)}`, needsAttention: true };
  const rejected = result.rejected > 0 ? `，被拒 ${result.rejected} 条（见同步中心）` : '';
  const locked = result.pushed > 0 ? '。推送前的修改不能再撤销' : '';
  return {
    notice: `推送完成：推上去 ${result.pushed} 条${rejected}${locked}`,
    error: null,
    needsAttention: result.rejected > 0
  };
}

/**
 * 一轮拉取的结果
 *
 * @param result - `syncManager.pull()` 的结果
 * @returns 拉到与落库的条数；有仓库失败时按实体报出原因
 */
export function describePullOutcome(result: PullResult): SyncOutcome {
  if (result.failures.length > 0)
    return { notice: null, error: `拉取没有全部完成：${describeFailures(result.failures)}`, needsAttention: true };
  return {
    notice: `拉取完成：拉到 ${result.pulled} 条，落库 ${result.applied} 条`,
    error: null,
    needsAttention: false
  };
}

/** 按实体列出失败原因；整机推拉的失败总带着仓库，个别没有仓库的只报原因 */
function describeFailures(failures: readonly SyncFailure[]): string {
  return failures
    .map(failure => {
      const reason = getErrorMessage(failure.error, '未知错误');
      return failure.repository ? `${failure.repository.entity}：${reason}` : reason;
    })
    .join('；');
}
