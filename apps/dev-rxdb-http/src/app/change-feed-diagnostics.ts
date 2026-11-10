/**
 * 变更通知通道的计数器与连接状况（US-023 AC#24）。
 *
 * @remarks
 * 与 `etag-diagnostics.ts` 记的是**条目**不同，这里记的是**四个数**加一个连接状况——面板要
 * 回答的问题是「这条通道到底在不在干活」，而不是「第 37 条通知长什么样」。
 *
 * 其中「被抑制了几条回声」只有这个出口拿得到：抑制发生在适配器内部（D6），
 * 被抑制的通知不会走到 `invalidateRemoteEntity`，从 core 的事件流上看它和
 * 「压根没收到」完全一样。拿「后端广播了几条 − core 失效了几条」去倒推，
 * 会把断线期间丢掉的通知一并算成抑制，把一次真实故障显示成一次正常抑制。
 *
 * 连接状况同理只认适配器报来的事实（`onOpen` 报接通、`onUnavailable` 报故障），
 * 不认启用意图：`changeFeedEnabled` 在连不上、退避重连期间照样是 `true`，
 * 拿它当「已接通」正是 RV-01a1bb52dedb 那个顶栏一直显示已接通的缺陷。
 */

import type { HttpChangeFeedNotificationReport, HttpChangeFeedUnavailableReport } from '@aiao/rxdb-adapter-http';

/**
 * 通道此刻的连接状况，只由适配器报来的事实推出。
 *
 * - `connecting`：（重新）开启之后还没有任何事实，既没接通过、也没失败过；
 * - `open`：最近一个连接事实是接通；
 * - `reconnecting`：最近一个连接事实是故障，重连在路上（浏览器原生重连或适配器退避）。
 *
 * @remarks
 * `malformed-message` 不是连接事实：读不懂的是那一条消息，连接还在，状况不变。
 * `unsupported-runtime`（运行时没有 `EventSource`）也落在 `reconnecting`：它同样是「此刻没连上」，
 * 而本 demo 只跑在浏览器里，实际碰不到它；万一碰上，横幅里的故障说明会写明不会再重连。
 */
export type ChangeFeedConnection = 'connecting' | 'open' | 'reconnecting';

/** 顶栏徽标的四态：通道关着时是 `off`，不看连接事实；开着时就是连接状况本身。 */
export type ChangeFeedBadge = 'off' | ChangeFeedConnection;

/** 徽标四态的文案。 */
export const CHANGE_FEED_BADGE_LABELS: Readonly<Record<ChangeFeedBadge, string>> = {
  off: '已关闭',
  connecting: '连接中',
  open: '已接通',
  reconnecting: '重连中'
};

/**
 * 徽标该显示哪一态。
 *
 * @param enabled - 启用意图（`RxDBAdapterHttp.changeFeedEnabled` 的镜像）
 * @param connection - 适配器报来的连接状况
 * @returns 关着时恒为 `off`；开着时就是 `connection`
 *
 * @remarks
 * 故障计数**不参与**判定：判成「报过故障就是断开」的话，重连成功之后徽标会一直停在断开上。
 */
export const changeFeedBadge = (enabled: boolean, connection: ChangeFeedConnection): ChangeFeedBadge =>
  enabled ? connection : 'off';

/** 通道的当前计数、最后一次故障说明与连接状况。 */
export interface ChangeFeedStats {
  /** 收到的、读得懂的通知总数（含被抑制的） */
  readonly received: number;
  /** 其中因为「发起方就是本页」而没有触发失效的条数 */
  readonly suppressed: number;
  /** 通道不可用的上报次数 */
  readonly unavailable: number;
  /** 最后一次不可用的现成文案；从未发生时为空串 */
  readonly lastUnavailableMessage: string;
  /** 连接状况。它是此刻的事实而不是一条记录，清零不动它 */
  readonly connection: ChangeFeedConnection;
}

const EMPTY: ChangeFeedStats = {
  received: 0,
  suppressed: 0,
  unavailable: 0,
  lastUnavailableMessage: '',
  connection: 'connecting'
};

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

/**
 * 清零计数与故障说明。
 *
 * @remarks
 * 连接状况保留：清的是日志，通道通没通并不因为清了日志而改变——清完把徽标打回「连接中」，
 * 等于让一条好好的连接看起来像刚断过。
 */
export const clearChangeFeedStats = (): void => publish({ ...EMPTY, connection: stats.connection });

/**
 * 记下一次（重新）开启：上一条连接的事实作废，从「连接中」重新等。
 *
 * @remarks
 * 必须在调 `startChangeFeed()` **之前**调：有的故障是在 `startChangeFeed()` 里同步报出来的
 * （运行时没有 `EventSource`、构造器同步抛错），之后才调会把这一条刚到的事实抹掉。
 * 首屏那次开启不必调：起点本来就是「连接中」。
 */
export const recordChangeFeedStart = (): void => publish({ ...stats, connection: 'connecting' });

/**
 * 记下一次接通。可直接作为 `HttpChangeFeedOptions.onOpen` 传入。
 *
 * @remarks
 * 不读报告：面板只有一条通道，「接通了」本身就是全部要记的事。
 */
export const recordChangeFeedOpen = (): void => publish({ ...stats, connection: 'open' });

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
 *
 * 连接状况只在连接层故障时翻成「重连中」；`malformed-message` 照样计数、照样留下说明，
 * 但连接还在（见 {@link ChangeFeedConnection}）。
 */
export const recordChangeFeedUnavailable = (report: HttpChangeFeedUnavailableReport): void => {
  publish({
    ...stats,
    unavailable: stats.unavailable + 1,
    lastUnavailableMessage: report.message,
    connection: report.reason === 'malformed-message' ? stats.connection : 'reconnecting'
  });
};
