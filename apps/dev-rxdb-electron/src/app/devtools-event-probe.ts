/**
 * @fileoverview 逐类派发全部 RxDB 事件（US-904 阶段 D AC#46 的「逐类派发事件」那一半）。
 *
 * @module devtools-event-probe
 */

import {
  ConflictDetectedEvent,
  ConflictPendingEvent,
  EntityLocalCreatedEvent,
  EntityLocalNewEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent,
  MergeBranchBeginEvent,
  MergeBranchCommitEvent,
  MergeBranchFailedEvent,
  RemoteEntityInvalidatedEvent,
  RepositorySyncBeginEvent,
  RepositorySyncCompleteEvent,
  RepositorySyncErrorEvent,
  SwitchBranchBeginEvent,
  SwitchBranchCommitEvent,
  SwitchBranchRollbackEvent,
  SyncBeginEvent,
  SyncCompleteEvent,
  SyncErrorEvent,
  TransactionBeginEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  type RxDB,
  type RxDBEvent
} from '@aiao/rxdb';

/**
 * 探针写进事件载荷的实体名。
 *
 * @remarks
 * 用 demo 自己就有的 `DesktopLaunch`，不是随便编一个：面板把事件按 `namespace/entity`
 * 展示，编一个不存在的名字会让读的人以为库里真有这么个实体。
 */
const PROBE_NAMESPACE = 'public';
const PROBE_ENTITY = 'DesktopLaunch';

/** 一条最小的本地实体事件载荷。`patch` / `inversePatch` 由各事件自己补。 */
const entityBase = (type: 'NEW' | 'INSERT' | 'UPDATE' | 'DELETE') => ({
  type,
  namespace: PROBE_NAMESPACE,
  entity: PROBE_ENTITY,
  id: 'devtools-event-probe',
  recordAt: new Date(0)
});

/**
 * 构造每种事件各一个实例。
 *
 * @returns 事件数组，**顺序即派发顺序**，理由见 {@link dispatchEveryRxDBEvent}。
 *
 * @remarks
 * 载荷一律取「结构合法的最小值」：冲突列表是空数组、同步结果是零计数、`recordAt` 是纪元零点。
 * 探针要证的是**每一类事件都能走完 connector → 四段 relay → 面板**这条路，
 * 不是事件内容本身——把载荷做厚只会让「面板显示了什么」依赖一堆与本条 AC 无关的编造数据。
 * 空数组与零计数都是各自类型的合法取值，没有一处 `as` 断言。
 */
function everyEvent(): readonly RxDBEvent[] {
  const error = new Error('devtools event probe');
  return [
    // 实体：本地四类 + 远程三类
    new EntityLocalNewEvent([{ ...entityBase('NEW'), patch: {}, inversePatch: null }]),
    new EntityLocalCreatedEvent([{ ...entityBase('INSERT'), patch: {}, inversePatch: null }]),
    new EntityLocalUpdatedEvent([{ ...entityBase('UPDATE'), patch: {}, inversePatch: {} }]),
    new EntityLocalRemovedEvent([{ ...entityBase('DELETE'), patch: null, inversePatch: {} }]),
    new EntityRemoteCreatedEvent([{ ...entityBase('INSERT'), data: {} }]),
    new EntityRemoteUpdatedEvent([{ ...entityBase('UPDATE'), data: {} }]),
    new EntityRemoteRemovedEvent([{ ...entityBase('DELETE'), data: {} }]),

    // 分支：切换三类 + 合并三类
    new SwitchBranchBeginEvent('main'),
    new SwitchBranchCommitEvent('main'),
    new SwitchBranchRollbackEvent('main'),
    new MergeBranchBeginEvent('probe', 'main'),
    new MergeBranchCommitEvent('probe', 'main'),
    new MergeBranchFailedEvent('probe', 'main'),

    // 同步与冲突
    new SyncBeginEvent('pull'),
    // `originalCount = pushed + failed + compacted`（PushResult 的文档不变量），全零自洽。
    new SyncCompleteEvent('push', { pushed: 0, failed: 0, compacted: 0, originalCount: 0 }),
    new SyncErrorEvent('pull', error),
    new ConflictDetectedEvent([], 0, 0),
    new ConflictPendingEvent([]),

    // Repository 同步三类 + 远端失效
    new RepositorySyncBeginEvent('sync', PROBE_NAMESPACE, PROBE_ENTITY, false),
    new RepositorySyncCompleteEvent('pull', PROBE_NAMESPACE, PROBE_ENTITY, {}),
    new RepositorySyncErrorEvent('push', PROBE_NAMESPACE, PROBE_ENTITY, error),
    new RemoteEntityInvalidatedEvent(PROBE_NAMESPACE, PROBE_ENTITY),

    // 事务三类**必须排在最后，且成对闭合**，理由见 dispatchEveryRxDBEvent 的 @remarks
    new TransactionBeginEvent('devtools-event-probe-commit'),
    new TransactionCommitEvent('devtools-event-probe-commit'),
    new TransactionBeginEvent('devtools-event-probe-rollback'),
    new TransactionRollbackEvent('devtools-event-probe-rollback')
  ];
}

/**
 * 在真实 `RxDB` 实例上逐类派发一遍全部事件。
 *
 * @param rxdb - 应用自己的 RxDB 实例（**不是**替身）。
 * @returns 实际派发出去的事件类型，去重后按派发顺序排列。
 *
 * @remarks
 * ## 为什么必须是「派发」而不是「做操作」
 *
 * AC#46 要的是「逐类派发事件」并核对**全部** `RXDB_EVENT_TYPES`。本 demo 没有远端，
 * 真实操作至多产生实体与事务那十来类；`SYNC_*` / `CONFLICT_*` / `REPOSITORY_SYNC_*` /
 * `ENTITY_REMOTE_*` / `MERGE_BRANCH_*` 在这里永远不会自然发生。要覆盖全集，只能显式派发。
 *
 * 派发口用的是 `RxDB.dispatchEvent()` —— 应用自己发事件走的同一个公开成员，**不是**测试专用
 * 后门。从这里往后（connector 的 25 条订阅 → 四段 relay → 面板 Events 页）全程是生产链路。
 *
 * ## 顺序为什么是承重的
 *
 * `RxDB.dispatchEvent()` 在**事务打开期间**会把非事务事件压进队列，等 COMMIT 才排空
 * （`rxdb.transaction.ts` 的 `handleTransactionCommit`），ROLLBACK 则直接丢弃。
 * 所以事务三类排在最后，并且 BEGIN 与 COMMIT / ROLLBACK **成对闭合**：
 *
 * - 先发完全部非事务事件——此时事务栈是空的，它们立即抵达监听器；
 * - 再发 BEGIN + COMMIT 一对、BEGIN + ROLLBACK 一对，两对各带**自己的** `transactionId`，
 *   因此各自成上下文，不会嵌套，也不会误吞应用正在进行的事务。
 *
 * 顺序写错的表征很隐蔽：面板只少掉几类事件，而不会有任何报错——所以这段注释比代码长。
 */
export function dispatchEveryRxDBEvent(rxdb: RxDB): readonly string[] {
  const events = everyEvent();
  for (const event of events) rxdb.dispatchEvent(event);
  return [...new Set(events.map(event => event.type))];
}
