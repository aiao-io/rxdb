/**
 * @fileoverview Supabase `mergeChanges` 的 RPC 参数构建
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的纯函数：把 SwitchVersionActions / 原始变更
 * 翻译为 `rxdb_mutations` RPC 所需的 `p_upserts` / `p_deletes` / `p_changes` 载荷。
 */

import { parseRxDBChangeKey, type IRxDBChange, type SwitchVersionActions } from '@aiao/rxdb';

export interface MergeChangesUpsertPayload {
  table: string;
  schema: string;
  data: Record<string, unknown>[];
}

export interface MergeChangesDeletePayload {
  table: string;
  schema: string;
  ids: Array<string | number | bigint>;
}

export interface MergeChangesPayload {
  p_upserts: MergeChangesUpsertPayload[];
  p_deletes: MergeChangesDeletePayload[];
  p_changes: Record<string, unknown>[];
}

/**
 * 构建 `rxdb_mutations` RPC 的载荷。
 *
 * @param actions 待合并的版本切换动作（inserts / updates / deletes）
 * @param branchId 目标分支 ID，缺省为 `main`
 * @param changes 原始变更记录（优先于 actions 保留完整历史）
 * @param userId 当前用户 ID（写入 `createdBy` / `updatedBy`）
 * @param clientId 当前客户端 ID（写入变更的 `clientId`）
 * @param resolveTableKey 将 namespace + entity 解析为 `${schema}.${table}` 的回调
 */
export function build_merge_changes_payload(
  actions: SwitchVersionActions,
  branchId: string | undefined,
  changes: IRxDBChange[] | undefined,
  userId: string | undefined,
  clientId: string | undefined,
  resolveTableKey: (namespace: string, entityName: string) => string
): MergeChangesPayload {
  const now = new Date().toISOString();
  const effectiveBranchId = branchId ?? 'main';

  const resolveChangeTable = (namespace: string, entityName: string) => {
    const [schema, table] = resolveTableKey(namespace, entityName).split('.');
    return { schema, table };
  };

  // 1. 构建 RxDBChange 记录
  const p_changes: Record<string, unknown>[] = [];

  if (changes?.length) {
    for (const change of changes) {
      const table = resolveChangeTable(change.namespace, change.entity);
      p_changes.push({
        namespace: change.namespace || 'public',
        entity: change.entity,
        entityId: change.entityId,
        type: change.type,
        branchId: change.branchId ?? effectiveBranchId,
        patch: change.patch ?? null,
        inversePatch: change.inversePatch ?? null,
        clientId: change.clientId ?? clientId,
        localId: change.id,
        ...table,
        createdAt: now,
        updatedAt: now
      });
    }
  } else {
    for (const [entityKey, { inversePatch }] of actions.deletes) {
      const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
      const table = resolveChangeTable(namespace, entity);
      p_changes.push({
        namespace: namespace || 'public',
        entity,
        entityId,
        type: 'DELETE',
        branchId: effectiveBranchId,
        patch: null,
        inversePatch,
        ...table,
        clientId,
        createdAt: now,
        updatedAt: now
      });
    }
    for (const [entityKey, { patch, inversePatch }] of actions.updates) {
      const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
      const table = resolveChangeTable(namespace, entity);
      p_changes.push({
        namespace: namespace || 'public',
        entity,
        entityId,
        type: 'UPDATE',
        branchId: effectiveBranchId,
        patch,
        inversePatch,
        ...table,
        clientId,
        createdAt: now,
        updatedAt: now
      });
    }
    for (const [entityKey, { patch, inversePatch }] of actions.inserts) {
      const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
      const table = resolveChangeTable(namespace, entity);
      p_changes.push({
        namespace: namespace || 'public',
        entity,
        entityId,
        type: 'INSERT',
        branchId: effectiveBranchId,
        patch,
        inversePatch,
        ...table,
        clientId,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // 2. 构建 upserts 和 deletes（始终从 actions 构建，用于实体表操作）
  const upsertsByTable = new Map<string, Record<string, unknown>[]>();
  const deletesByTable = new Map<string, Array<string | number | bigint>>();

  for (const [entityKey] of actions.deletes) {
    const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
    const table = resolveTableKey(namespace, entity);
    const ids = deletesByTable.get(table) ?? [];
    ids.push(entityId);
    deletesByTable.set(table, ids);
  }

  for (const [entityKey, { patch }] of actions.updates) {
    const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
    const table = resolveTableKey(namespace, entity);
    const data = upsertsByTable.get(table) ?? [];
    const updateData: Record<string, unknown> = { id: entityId, ...patch };
    if (userId) updateData['updatedBy'] = userId;
    data.push(updateData);
    upsertsByTable.set(table, data);
  }

  for (const [entityKey, { patch }] of actions.inserts) {
    const [namespace, entity, entityId] = parseRxDBChangeKey(entityKey);
    const table = resolveTableKey(namespace, entity);
    const data = upsertsByTable.get(table) ?? [];
    const insertData: Record<string, unknown> = { id: entityId, ...patch };
    if (userId) {
      insertData['createdBy'] = userId;
      insertData['updatedBy'] = userId;
    }
    data.push(insertData);
    upsertsByTable.set(table, data);
  }

  // 非激活分支只写 RxDBChange 记录，不修改实体表
  const isActiveBranch = effectiveBranchId === 'main';

  const p_upserts =
    isActiveBranch ?
      Array.from(upsertsByTable.entries()).map(([table, data]) => {
        const [schema, tableName] = table.includes('.') ? table.split('.') : ['public', table];
        return { table: tableName, schema, data };
      })
    : [];

  const p_deletes =
    isActiveBranch ?
      Array.from(deletesByTable.entries()).map(([table, ids]) => {
        const [schema, tableName] = table.includes('.') ? table.split('.') : ['public', table];
        return { table: tableName, schema, ids };
      })
    : [];

  return { p_upserts, p_deletes, p_changes };
}
