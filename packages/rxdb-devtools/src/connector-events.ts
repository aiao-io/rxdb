import type { RxDBEvent, RxDBEventMap } from '@aiao/rxdb';

/**
 * 事件订阅清单：键穷尽 `RxDBEventMap`，值表示是否转发到 DevTools。
 *
 * @remarks
 * `satisfies Record<keyof RxDBEventMap, boolean>` 是这份清单的**编译期契约**：
 * 上游新增事件时本文件直接编译失败，而不是像手写字符串数组那样静默漏掉。
 * 此前漏掉的正是 `ENTITY_LOCAL_NEW`、`TRANSACTION_*` 与 `MERGE_BRANCH_*` 八项 ——
 * merge 失败「已部分应用、并未回滚」的诊断完全不到 DevTools。
 *
 * 一处有意排除，必须留在这里而不是"忘了写"：
 *
 * - `REMOTE_CHANGES_PENDING`：上游有这个常量但**不在 `RxDBEventMap` 里**，
 *   因此是结构性排除 —— 想加也加不进来，加了就编译不过。
 */
export const RXDB_EVENT_SUBSCRIPTIONS = {
  ENTITY_LOCAL_NEW: true,
  ENTITY_LOCAL_CREATE: true,
  ENTITY_LOCAL_UPDATE: true,
  ENTITY_LOCAL_REMOVE: true,
  ENTITY_REMOTE_CREATE: true,
  ENTITY_REMOTE_UPDATE: true,
  ENTITY_REMOTE_REMOVE: true,
  TRANSACTION_BEGIN: true,
  TRANSACTION_COMMIT: true,
  TRANSACTION_ROLLBACK: true,
  SWITCH_BRANCH_BEGIN: true,
  SWITCH_BRANCH_COMMIT: true,
  SWITCH_BRANCH_ROLLBACK: true,
  MERGE_BRANCH_BEGIN: true,
  MERGE_BRANCH_COMMIT: true,
  MERGE_BRANCH_FAILED: true,
  SYNC_BEGIN: true,
  SYNC_COMPLETE: true,
  SYNC_ERROR: true,
  CONFLICT_DETECTED: true,
  CONFLICT_PENDING: true,
  REPOSITORY_SYNC_BEGIN: true,
  REPOSITORY_SYNC_COMPLETE: true,
  REPOSITORY_SYNC_ERROR: true
} as const satisfies Record<keyof RxDBEventMap, boolean>;

/** 实际订阅的事件类型（{@link RXDB_EVENT_SUBSCRIPTIONS} 中值为 `true` 的键）。 */
export const RXDB_EVENT_TYPES: readonly (keyof RxDBEventMap)[] = (
  Object.keys(RXDB_EVENT_SUBSCRIPTIONS) as (keyof RxDBEventMap)[]
).filter(type => RXDB_EVENT_SUBSCRIPTIONS[type]);

/**
 * 事件在遮罩 / 序列化路径上的记录视图。
 *
 * @remarks
 * `RxDBEvent` 是一组类实例的联合，TS 不认为它可赋给带索引签名的记录类型。
 * 遮罩逻辑必须按字段名动态读写（`entities` / `conflicts` / `patch` …），
 * 所以这里做一次显式转换并收口在 {@link toEventRecord}，不散落到各处。
 */
export type EventRecord = { type: string } & Record<string, unknown>;

/** 把 RxDB 事件转成记录视图。 */
export const toEventRecord = (event: RxDBEvent): EventRecord => event as unknown as EventRecord;
