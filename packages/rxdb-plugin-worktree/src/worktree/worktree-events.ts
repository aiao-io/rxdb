/**
 * @fileoverview 把 `rxdb_worktree` 的增删报到 RxDB 的实体事件总线上（US-310 的实时列表靠它）。
 *
 * @remarks
 * 实时查询与跨标签页网关只认 `ENTITY_LOCAL_*` 事件，而这些事件来自适配器对 `rxdb_change` /
 * `rxdb_branch` / `rxdb_migration` 三张表的变更钩子。`rxdb_worktree` 不在其中（`log: false`，也不在任何
 * 适配器的监听表里），写下去不会有任何人知道——于是由写它的人自己报。
 *
 * - **在写入的同一笔事务里派发**：`RxDB.dispatchEvent` 在事务打开期间把事件压进那一笔的队列，
 *   COMMIT 时放行、ROLLBACK 时丢弃，订阅方不会收到一次没有落库的变更。
 * - **载荷是普通对象**：网关经 BroadcastChannel 把事件转给别的标签页，实体实例与实体类都过不了
 *   结构化克隆，所以不带 `entityType`、patch 只放列值。形状与适配器给 `rxdb_branch` 发的系统事件相同。
 */

import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  getEntityMetadata,
  type RxDB,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData
} from '@aiao/rxdb';
import { Worktree } from './worktree.entity.js';

/** 一行 worktree 的列值快照；`branch` 是关系不是列，不带。 */
const columnsOf = (row: Worktree): Worktree => ({
  id: row.id,
  branchId: row.branchId,
  label: row.label,
  createdAt: row.createdAt
});

/**
 * 报告新落库的 worktree 行
 *
 * @param rxdb - 宿主实例
 * @param rows - 本事务里刚写下的行；空数组不派发
 */
export const dispatchWorktreesCreated = (rxdb: RxDB, rows: readonly Worktree[]): void => {
  if (rows.length === 0) return;
  const { namespace, name } = getEntityMetadata(Worktree);
  const entities: RxDBEntityLocalCreatedEventData[] = rows.map(row => ({
    type: 'INSERT',
    namespace,
    entity: name,
    id: row.id,
    patch: columnsOf(row),
    inversePatch: null,
    recordAt: new Date()
  }));
  rxdb.dispatchEvent(new EntityLocalCreatedEvent(entities));
};

/**
 * 报告被删掉的 worktree 行
 *
 * @param rxdb - 宿主实例
 * @param rows - 本事务里刚删掉的行；空数组不派发
 */
export const dispatchWorktreesRemoved = (rxdb: RxDB, rows: readonly Worktree[]): void => {
  if (rows.length === 0) return;
  const { namespace, name } = getEntityMetadata(Worktree);
  const entities: RxDBEntityLocalRemovedEventData[] = rows.map(row => ({
    type: 'DELETE',
    namespace,
    entity: name,
    id: row.id,
    patch: null,
    inversePatch: columnsOf(row),
    recordAt: new Date()
  }));
  rxdb.dispatchEvent(new EntityLocalRemovedEvent(entities));
};
