/**
 * 变更通知通道的计数器（US-023 AC#24）。
 *
 * @remarks
 * 与 `etag-diagnostics.ts` 记的是**条目**不同，这里记的是**四个数**——面板要回答的
 * 问题是「这条通道到底在不在干活」，而不是「第 37 条通知长什么样」。
 *
 * 其中「被抑制了几条回声」只有这个出口拿得到：抑制发生在适配器内部（D6），
 * 被抑制的通知不会走到 `invalidateRemoteEntity`，从 core 的事件流上看它和
 * 「压根没收到」完全一样。拿「后端广播了几条 − core 失效了几条」去倒推，
 * 会把断线期间丢掉的通知一并算成抑制，把一次真实故障显示成一次正常抑制。
 */

import type { HttpChangeFeedNotificationReport, HttpChangeFeedUnavailableReport } from '@aiao/rxdb-adapter-http';

/** 通道的当前计数与最后一次故障说明。 */
export interface ChangeFeedStats {
  /** 收到的、读得懂的通知总数（含被抑制的） */
  readonly received: number;
  /** 其中因为「发起方就是本页」而没有触发失效的条数 */
  readonly suppressed: number;
  /** 通道不可用的上报次数 */
  readonly unavailable: number;
  /** 最后一次不可用的现成文案；从未发生时为空串 */
  readonly lastUnavailableMessage: string;
}

const EMPTY: ChangeFeedStats = { received: 0, suppressed: 0, unavailable: 0, lastUnavailableMessage: '' };

let stats: ChangeFeedStats = EMPTY;
const listeners = new Set<(stats: ChangeFeedStats) => void>();

const publish = (next: ChangeFeedStats): void => {
  stats = next;
  for (const listener of listeners) listener(stats);
};

/** 当前计数。 */
export const changeFeedStats = (): ChangeFeedStats => stats;

/** 订阅变更，返回退订函数。 */
export const onChangeFeedStats = (listener: (stats: ChangeFeedStats) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 清零。 */
export const clearChangeFeedStats = (): void => publish(EMPTY);

/**
 * 收下一条通知报告。可直接作为 `HttpChangeFeedOptions.onNotification` 传入。
 *
 * @param report - 适配器给出的事实载荷（结构上带不了行数据，见 D8）
 */
export const recordChangeFeedNotification = (report: HttpChangeFeedNotificationReport): void => {
  publish({
    ...stats,
    received: stats.received + 1,
    suppressed: stats.suppressed + (report.suppressed ? 1 : 0)
  });
};

/**
 * 收下一条不可用报告。可直接作为 `HttpChangeFeedOptions.onUnavailable` 传入。
 *
 * @param report - 适配器给出的事实载荷
 *
 * @remarks
 * 面板把它单独列出来，是因为「一条通知都没收到」有两种完全不同的成因：
 * 后端没人写入，和通道压根没连上。少了这一栏，两者在面板上一模一样。
 */
export const recordChangeFeedUnavailable = (report: HttpChangeFeedUnavailableReport): void => {
  publish({ ...stats, unavailable: stats.unavailable + 1, lastUnavailableMessage: report.message });
};
