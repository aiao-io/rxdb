/**
 * @packageDocumentation
 * pullable 计数的结算规则
 *
 * `pullableCount$` 是「远端还有多少条没拉下来」。它由远端事件累加，由一次 pull 结算。
 * 结算的难点全在「这次 pull 到底覆盖了多少」：
 *
 * - `repositoryFilter` 只拉了指定仓库，其余仓库的待拉量原封不动；
 * - `hasMore` 说明这一页拉完了还有下一页；
 * - `failures` 里的仓库一条都没拉成。
 *
 * 这三种情况下把全局计数归零，界面就会显示「已经同步干净了」，而远端明明还有东西。
 * 本模块把判据和结算算式拆成纯函数，让 {@link VersionManager.pull} 和
 * {@link VersionManager.sync} 两条路径共用同一份口径 —— 此前后者根本不结算。
 */

import type { PullOptions, PullResult } from './VersionManager.interface.js';

/**
 * 结算一次 pull 所需的全部输入
 */
export interface PullableSettlement {
  /** 本次 pull 是否覆盖了当前分支的完整仓库集合，且没有遗留分页或失败 */
  complete: boolean;

  /** 结算令牌签发之后是否又有远端事件到达 */
  concurrent: boolean;

  /** 本次 pull 实际取回的变更数 */
  pulled: number;
}

/**
 * 判断一次 pull 是否算「完整同步」
 *
 * @param options - 发起 pull 时的选项
 * @param result - pull 的结果
 * @returns 覆盖了全部仓库、没有下一页、也没有失败仓库时返回 `true`
 *
 * @remarks
 * `repositoryFilter` 传了空数组等价于不过滤：判成不完整会让绝大多数正常 pull 永远清不掉计数。
 */
export function isCompletePull(options: PullOptions | undefined, result: PullResult): boolean {
  if (options?.repositoryFilter !== undefined && options.repositoryFilter.length > 0) {
    return false;
  }
  return !result.hasMore && result.failures.length === 0;
}

/**
 * 计算结算后的 pullable 计数
 *
 * @param current - 结算前的计数
 * @param settlement - 结算输入
 * @returns 结算后的计数（不会为负）
 *
 * @remarks
 * 只有「完整同步」且「期间没有新的远端事件」才归零。`concurrent` 这一关是必须的：
 * pull 期间到达的事件描述的是快照之后的新变更，本次 pull 没有覆盖它们，
 * 归零等于把它们吞掉，界面从此再也不会提示这批数据。
 */
export function settledPullableCount(current: number, settlement: PullableSettlement): number {
  if (settlement.complete && !settlement.concurrent) {
    return 0;
  }
  return Math.max(0, current - settlement.pulled);
}
