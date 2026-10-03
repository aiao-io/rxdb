import { Entity, PropertyType, SyncType, type EntityType } from '@aiao/rxdb';
import type { eventWithTime } from '@rrweb/types';
import type { ReplayTruncatedCode } from './markers.js';

/** 会话行的状态：录制中 → 已停止 / 已截断（终态）。 */
export type ReplaySessionStatus = 'recording' | 'stopped' | 'truncated';

/**
 * 录制会话（表 `replay_session`），只存在于录制库。
 *
 * @remarks
 * 应用不应直接读写本实体，一律经 `rxdb.replay`。`bytes` / `eventCount` / `nextSeq` / `lastEventAt`
 * 只在写事件行的同一事务里推进。
 */
@Entity({
  namespace: 'replay',
  name: 'ReplaySessionRecord',
  tableName: 'replay_session',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'startedAt', type: PropertyType.date },
    { name: 'lastEventAt', type: PropertyType.date, nullable: true },
    { name: 'status', type: PropertyType.enum, enum: ['recording', 'stopped', 'truncated'] },
    { name: 'truncatedCode', type: PropertyType.enum, enum: ['session_limit', 'store_limit'], nullable: true },
    { name: 'eventCount', type: PropertyType.integer },
    { name: 'bytes', type: PropertyType.integer },
    { name: 'nextSeq', type: PropertyType.integer }
  ]
})
export class ReplaySessionRecord {
  /** 主键，`start()` 时 `crypto.randomUUID()`。 */
  id!: string;
  /** `start()` 时刻。 */
  startedAt!: Date;
  /** 最后一次成功落库那批里最大的事件时间戳；尚无事件时为 `null`。 */
  lastEventAt!: Date | null;
  status!: ReplaySessionStatus;
  /** `status === 'truncated'` 时必有，否则 `null`。 */
  truncatedCode!: ReplayTruncatedCode | null;
  /** 已落库事件行数（含标记）。 */
  eventCount!: number;
  /** 已落库事件行 `bytes` 之和。 */
  bytes!: number;
  /** 下一条要落库事件的 `seq` 下界。 */
  nextSeq!: number;
}

/**
 * 一条 rrweb 事件（表 `replay_event`），只存在于录制库。
 *
 * @remarks
 * 只增不改；只有 `deleteSession()` 删除。`data` 是整条 `eventWithTime`，读出即可交给 rrweb `Replayer`。
 */
@Entity({
  namespace: 'replay',
  name: 'ReplayEventRecord',
  tableName: 'replay_event',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'sessionId', type: PropertyType.string },
    { name: 'seq', type: PropertyType.integer },
    { name: 'type', type: PropertyType.integer },
    { name: 'timestamp', type: PropertyType.number },
    { name: 'data', type: PropertyType.json },
    { name: 'bytes', type: PropertyType.integer }
  ],
  indexes: [
    { name: 'replay_event_session_seq', properties: ['sessionId', 'seq'], unique: true },
    { name: 'replay_event_session_timestamp', properties: ['sessionId', 'timestamp'] }
  ]
})
export class ReplayEventRecord {
  /** 主键，`${sessionId}:${seq}`。 */
  id!: string;
  /** 所属会话（不建外键，删除由插件按序执行）。 */
  sessionId!: string;
  /** 会话内严格递增，跨刷新连续。 */
  seq!: number;
  /** rrweb `EventType` 数值。 */
  type!: number;
  /** rrweb 事件的 `timestamp`（epoch ms）。 */
  timestamp!: number;
  /** 整条 rrweb 事件。 */
  data!: eventWithTime;
  /** `JSON.stringify(data)` 的 UTF-8 字节数。 */
  bytes!: number;
}

/**
 * 录制库需要的全部实体；`createRecordingDb` 工厂收到的就是这一组，原样交给 `new RxDB({ entities })`。
 */
export const REPLAY_ENTITIES: readonly EntityType[] = [ReplaySessionRecord, ReplayEventRecord];
