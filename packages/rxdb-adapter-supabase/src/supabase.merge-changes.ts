/**
 * @fileoverview Supabase `mergeChanges` 的 RPC 参数构建
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的纯函数：把 SwitchVersionActions / 原始变更
 * 翻译为 `rxdb_mutations` RPC 所需的 `p_upserts` / `p_updates` / `p_deletes` / `p_changes` 载荷。
 */

import { MAIN_BRANCH_ID, parseRxDBChangeKey, type IRxDBChange, type SwitchVersionActions } from '@aiao/rxdb';

export interface MergeChangesUpsertPayload {
  table: string;
  schema: string;
  data: Record<string, unknown>[];
}

/**
 * 部分列更新载荷，与 {@link MergeChangesUpsertPayload} 同形；
 * data 每行只含 id + 本次修改的列 + updatedBy，服务端按普通 UPDATE 落库。
 */
export interface MergeChangesUpdatePayload {
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
  p_updates: MergeChangesUpdatePayload[];
  p_deletes: MergeChangesDeletePayload[];
  p_changes: Record<string, unknown>[];
}

/**
 * 把 `${schema}.${table}` 分组的 Map 展开为 RPC 载荷数组。
 */
function to_table_payloads<T>(grouped: Map<string, T>): Array<{ table: string; schema: string; items: T }> {
  return Array.from(grouped.entries()).map(([table, items]) => {
    const [schema, tableName] = table.includes('.') ? table.split('.') : ['public', table];
    return { table: tableName, schema, items };
  });
}

/**
 * 构建 `rxdb_mutations` RPC 的载荷。
 *
 * 新增实体进 `p_upserts`（带 `createdBy` / `updatedBy`），修改进 `p_updates`（只含 id + 修改的列 +
 * `updatedBy`，不带 `createdBy`），删除进 `p_deletes`；非 main 分支三个写数组都为空。
 *
 * @param actions 待合并的版本切换动作（inserts / updates / deletes）
 * @param branchId 目标分支 ID，缺省为 `main`
 * @param changes 原始变更记录（优先于 actions 保留完整历史）
 * @param userId 当前用户 ID（新增写入 `createdBy` / `updatedBy`，修改只写 `updatedBy`）
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
  const effectiveBranchId = branchId ?? MAIN_BRANCH_ID;

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

  // 2. 构建 upserts、updates 和 deletes（始终从 actions 构建，用于实体表操作）
  const upsertsByTable = new Map<string, Record<string, unknown>[]>();
  const updatesByTable = new Map<string, Record<string, unknown>[]>();
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
    const data = updatesByTable.get(table) ?? [];
    const updateData: Record<string, unknown> = { id: entityId, ...patch };
    if (userId) updateData['updatedBy'] = userId;
    data.push(updateData);
    updatesByTable.set(table, data);
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

  // 只有 main 的变更落实体表，其余分支只写 RxDBChange 记录。
  // 判的是「是不是 main」，与本地哪条分支激活无关：本地两端早已允许任意分支激活，于是在
  // feature 分支上激活时的编辑推到这里只留变更记录、不进实体表，与本地分支语义不一致。
  // 要对齐，得先定服务端按什么判定「激活」（按连接、按用户还是全局）——登记在
  // requirements/roadmap.md「epic-006 评审顺延的架构项」。
  const isMainBranch = effectiveBranchId === MAIN_BRANCH_ID;

  if (!isMainBranch) {
    return { p_upserts: [], p_updates: [], p_deletes: [], p_changes };
  }

  const p_upserts = to_table_payloads(upsertsByTable).map(({ table, schema, items }) => ({
    table,
    schema,
    data: items
  }));
  const p_updates = to_table_payloads(updatesByTable).map(({ table, schema, items }) => ({
    table,
    schema,
    data: items
  }));
  const p_deletes = to_table_payloads(deletesByTable).map(({ table, schema, items }) => ({
    table,
    schema,
    ids: items
  }));

  return { p_upserts, p_updates, p_deletes, p_changes };
}
