/**
 * @fileoverview RxDB 的 Supabase Adapter
 *
 * 提供 RxDB 与 Supabase 的集成，支持：
 * - CRUD 操作（通过 Repository 模式）
 * - 批量操作（saveMany/removeMany/mutations）
 * - 事务支持（通过 PostgreSQL RPC）
 * - 实时订阅（通过 Supabase Realtime）
 */

import type {
  EntityMetadata,
  EntityType,
  IRepository,
  IRxDBAdapter,
  IRxDBChange,
  PullBatchRequest,
  QueryCacheEntityMetadata,
  RemoteBranchInfo,
  RemoteChange,
  RemoteMergeResult,
  RepositoryInstance,
  RuleGroup,
  RxDB,
  RxDBMutationsMap,
  SwitchVersionActions
} from '@aiao/rxdb';
import {
  getEntityMetadata,
  getSyncConfig,
  parseRxDBChangeKey,
  PropertyType,
  RxDBAdapterRemoteBase,
  tryGetEntityStatus
} from '@aiao/rxdb';
import { createClient, RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { defer, from, map, Observable, of } from 'rxjs';
import { resolveEntityScope, type EntityScope } from './entity_scope.js';
import { SupabaseConfigError, SupabaseDataError, SupabaseUnsupportedPropertyTypeError } from './errors.js';
import { handleSupabaseChange } from './handle_supabase_change.js';
import { chunk_values, select_all_pages, SUPABASE_IN_CHUNK_SIZE } from './pagination.js';
import { apply_rule_group } from './rule_group_builder.js';
import { build_delete_params, build_upsert_params, group_by_type } from './RxDBAdapterSupabase.utils.js';
import { resolve_supabase_schema } from './schema.utils.js';
import {
  SupabaseAdapterOptions,
  type SupabaseRlsCheckOptions,
  type SupabaseRlsCheckTable
} from './supabase.interface.js';
import { SupabaseRepository } from './SupabaseRepository.js';
import { SupabaseTreeRepository } from './SupabaseTreeRepository.js';

export const ADAPTER_NAME = 'supabase';

/** 适配器所基于的 @supabase/supabase-js 最低支持版本（与 package.json peerDependencies 对齐） */
export const SUPABASE_SDK_VERSION = '2.88.0';

const RETRYABLE_SUPABASE_WRITE_ERROR_PATTERNS = [
  /invalid response was received from the upstream server/i,
  /fetch failed/i,
  /failed to fetch/i,
  /gateway timeout/i,
  /upstream connect error/i,
  /connection terminated/i,
  /temporarily unavailable/i
];

const RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS = 3;
const RETRYABLE_SUPABASE_WRITE_RETRY_DELAY_MS = 150;
const DEFAULT_RLS_CHECK_RPC_NAME = 'rxdb_check_rls';
const REALTIME_RECONNECT_BASE_DELAY_MS = 500;
const REALTIME_RECONNECT_MAX_DELAY_MS = 5_000;
const REALTIME_RECONNECTABLE_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

type RealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

const SNAPSHOT_FILTER_OPERATORS = new Set([
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'contains',
  'includes',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith',
  'null',
  'isNull',
  'notNull',
  'isNotNull',
  'in',
  'notIn',
  'between',
  'notBetween'
]);

function assertSnapshotFilterSupported(filter: RuleGroup<unknown>): void {
  for (const node of filter.rules as unknown as Array<Record<string, unknown>>) {
    if (Array.isArray(node['rules'])) {
      assertSnapshotFilterSupported(node as unknown as RuleGroup<unknown>);
      continue;
    }

    const field = node['field'];
    const operator = node['operator'];
    if (typeof field !== 'string' || field.includes('.') || typeof operator !== 'string') {
      throw new SupabaseConfigError('Snapshot filter sync only supports direct entity fields');
    }
    if (!SNAPSHOT_FILTER_OPERATORS.has(operator)) {
      throw new SupabaseConfigError(`Snapshot filter sync does not support operator: ${operator}`);
    }
  }
}

interface UnsupportedSupabaseProperty {
  name: string;
  type: PropertyType.bigint | PropertyType.binary;
}

function getUnsupportedProperty(
  metadata: EntityMetadata,
  resolveEntityMetadata: (entity: string, namespace: string) => EntityMetadata | undefined
): UnsupportedSupabaseProperty | undefined {
  for (const property of metadata.propertyMap.values()) {
    const type = property.type;
    if (type !== PropertyType.bigint && type !== PropertyType.binary) continue;
    return {
      name: property.name,
      type: type === PropertyType.bigint ? PropertyType.bigint : PropertyType.binary
    };
  }

  for (const [foreignKeyName, relation] of metadata.foreignKeyRelationMap) {
    const targetMetadata = resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace);
    const type = targetMetadata?.propertyMap.get('id')?.type;
    if (type !== PropertyType.bigint && type !== PropertyType.binary) continue;
    return {
      name: foreignKeyName,
      type: type === PropertyType.bigint ? PropertyType.bigint : PropertyType.binary
    };
  }

  return undefined;
}

interface SupabaseRlsCheckResult {
  schema: string;
  table: string;
  exists: boolean;
  rlsEnabled: boolean;
}

type RetryableWriteResponse = {
  data: unknown;
  error: { message?: string | null } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidWriteResponse(operationName: string): never {
  throw new SupabaseDataError(`Failed to ${operationName}: invalid response data`);
}

function validateArrayResponse<TResult>(data: unknown, operationName: string): TResult[] {
  if (!Array.isArray(data)) invalidWriteResponse(operationName);
  return data as TResult[];
}

function validateMutationsResponse<TResult>(data: unknown): TResult[] {
  if (!isRecord(data) || !Array.isArray(data['upserted'])) invalidWriteResponse('execute transaction');
  return data['upserted'] as TResult[];
}

function validateMergeResponse(data: unknown): RemoteMergeResult {
  if (!isRecord(data) || !Array.isArray(data['change_id_mapping'])) invalidWriteResponse('merge changes');

  const maxChangeId = data['max_change_id'];
  if (maxChangeId !== null && (!Number.isSafeInteger(maxChangeId) || (maxChangeId as number) < 0)) {
    invalidWriteResponse('merge changes');
  }

  const changeIdMapping = data['change_id_mapping'];
  const hasInvalidMapping = changeIdMapping.some(
    item =>
      !isRecord(item) ||
      !Number.isSafeInteger(item['localId']) ||
      !Number.isSafeInteger(item['remoteId']) ||
      (item['localId'] as number) < 0 ||
      (item['remoteId'] as number) < 0
  );
  if (hasInvalidMapping) invalidWriteResponse('merge changes');

  return {
    maxChangeId: maxChangeId === null ? undefined : (maxChangeId as number),
    changeIdMapping: changeIdMapping as NonNullable<RemoteMergeResult['changeIdMapping']>
  };
}

function validatePushBranchesResponse(data: unknown): { synced: number; skipped: string[] } {
  if (!isRecord(data)) invalidWriteResponse('sync branches');
  const synced = data['synced'];
  const skipped = data['skipped'];
  if (!Number.isSafeInteger(synced) || (synced as number) < 0 || !Array.isArray(skipped)) {
    invalidWriteResponse('sync branches');
  }
  if (!skipped.every(value => typeof value === 'string')) invalidWriteResponse('sync branches');
  return { synced: synced as number, skipped };
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableSupabaseWriteError(message: string): boolean {
  return RETRYABLE_SUPABASE_WRITE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Supabase 适配器
 *
 * @example
 * ```typescript
 * const rxdb = new RxDB({
 *   adapters: {
 *     supabase: rxdb => new RxDBAdapterSupabase(rxdb, {
 *       supabaseUrl: 'https://xxx.supabase.co',
 *       supabaseKey: 'your-anon-key'
 *     })
 *   }
 * });
 * ```
 */
export class RxDBAdapterSupabase extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  #client: SupabaseClient;
  #channel: RealtimeChannel | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempt = 0;
  #realtimeState: RealtimeState = 'idle';
  #realtimeQueue: Promise<void> = Promise.resolve();
  #rlsCheckDone = false;
  #databaseVersion: string | null = null;
  readonly name = ADAPTER_NAME;

  get client(): SupabaseClient {
    return this.#client;
  }

  constructor(
    rxdb: RxDB,
    readonly options: SupabaseAdapterOptions
  ) {
    super(rxdb);

    if (options.client) {
      this.#client = options.client;
      return;
    }

    const supabaseUrl = options.supabaseUrl?.trim();
    const supabaseKey = options.supabaseKey?.trim();
    if (!supabaseUrl || !supabaseKey) {
      throw new SupabaseConfigError('A non-empty supabaseUrl and supabaseKey are required when client is not supplied');
    }

    this.#client = createClient(supabaseUrl, supabaseKey);
  }

  // ============================================
  // 连接管理
  // ============================================

  async connect(): Promise<IRxDBAdapter> {
    this.#assertConfiguredEntitiesSupported();
    await this.#verifyRlsConfiguration();
    await this.#enqueueRealtime(async () => {
      this.#clearReconnectTimer();
      if (this.#channel) return;

      this.#realtimeState = 'connecting';
      this.#channel = this.#createRealtimeChannel();
    });
    return this;
  }

  async disconnect(): Promise<void> {
    await this.#enqueueRealtime(async () => {
      this.#realtimeState = 'closed';
      this.#clearReconnectTimer();
      this.#reconnectAttempt = 0;
      if (!this.#channel) return;

      const channel = this.#channel;
      this.#channel = null;
      await this.#client.removeChannel(channel);
    });
  }

  async version(): Promise<string> {
    if (this.#databaseVersion) return this.#databaseVersion;

    const { data, error } = await this.#client.rpc('rxdb_server_version');
    if (error) {
      throw new SupabaseDataError(`Failed to get database version: ${error.message}`);
    }
    if (typeof data !== 'string' || data.trim().length === 0) {
      throw new SupabaseDataError('Failed to get database version: invalid response data');
    }

    this.#databaseVersion = data.trim();
    return this.#databaseVersion;
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量保存实体（upsert 语义，非事务）
   */
  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    if (entities.length === 0) return [];
    return this.executeUpsert(group_by_type(entities));
  }

  /**
   * 批量删除实体（非事务）
   */
  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    if (entities.length === 0) return [];
    return this.executeDelete(group_by_type(entities));
  }

  /**
   * 批量修改实体（事务）
   *
   * 通过 PostgreSQL RPC 调用 `rxdb_mutations` 存储过程，
   * 在单个数据库事务中执行所有操作，确保原子性。
   */
  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    const userId = this.rxdb.context.userId;

    // 构建 RPC 参数。create / update 必须分别按插入、更新语义注入审计字段 ——
    // 更新集若下发 createdBy，服务端的 DO UPDATE SET 会把原作者覆写成当前用户。
    const upserts = [
      ...build_upsert_params(options.create, userId, 'insert'),
      ...build_upsert_params(options.update, userId, 'update')
    ];

    const deletes = build_delete_params(options.remove);

    if (upserts.length === 0 && deletes.length === 0) {
      return [];
    }

    // 调用 RPC（瞬时网络错误自动重试）
    const upserted = await this.executeRetryableWrite(
      'execute transaction',
      async () => {
        const { data, error } = await this.#client.rpc('rxdb_mutations', {
          p_upserts: upserts,
          p_deletes: deletes
        });
        return { data, error };
      },
      validateMutationsResponse<InstanceType<T>>
    );

    // 组装返回结果
    const results = [...upserted];
    for (const [, entities] of options.remove) {
      results.push(...entities);
    }

    return results;
  }

  // ============================================
  // Repository（仓库）
  // ============================================

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT {
    this.#assertEntitySupported(EntityType);
    const cachedRepository = this.repository_cache.get(EntityType);
    if (cachedRepository) {
      return cachedRepository as RT & RepositoryInstance<T>;
    }

    const metadata = getEntityMetadata(EntityType);
    const repository: SupabaseRepository<T> | SupabaseTreeRepository<T> =
      metadata.features?.tree ?
        new SupabaseTreeRepository<T>(this, EntityType)
      : new SupabaseRepository<T>(this, EntityType);

    this.repository_cache.set(EntityType, repository);
    return repository as unknown as RT;
  }

  // ============================================
  // 工具方法
  // ============================================

  async isTableExisted(EntityType: EntityType): Promise<boolean> {
    const metadata = getEntityMetadata(EntityType);
    const client = this.getSchemaClient(metadata.namespace);
    const result = await client.from(metadata.tableName).select('*', { count: 'exact', head: true });

    if (result.status === 200 || result.status === 206) return true;
    if (result.status === 204 || result.status === 404 || result.status === 406) return false;

    throw new SupabaseDataError(
      `Failed to check table existence: ${result.error?.message || `status ${result.status}`}`
    );
  }

  // ============================================
  // Pull/Push 同步方法
  // ============================================

  /**
   * 从远程拉取变更记录
   *
   * @param sinceId - 拉取此 ID 之后的变更（不包含该 ID）
   * @param limit - 最大拉取数量
   * @param repositoryFilter - 可选的实体过滤列表（用于 repository-level sync）
   * @param filter - 可选的行级过滤条件（用于 SyncType.Filter）
   * @returns RxDBChange 记录数组，按 id ASC 排序
   *
   * @remarks
   * 使用 id 而非 createdAt 作为游标，避免同毫秒内多条记录导致的重复问题
   *
   * 当提供 filter 参数时，会通过 JOIN 实体表并应用过滤条件，
   * 只返回满足条件的实体对应的变更记录。
   */
  async pullChanges(
    sinceId: number,
    limit: number = 1000,
    repositoryFilter?: string[],
    filter?: RuleGroup<unknown>,
    branchId?: string
  ): Promise<RemoteChange[]> {
    if (limit <= 0) return [];

    const scopes = this.#resolveRepositoryScopes(repositoryFilter);
    if (filter) {
      if (scopes?.length !== 1) {
        throw new SupabaseConfigError(
          `pullChanges: a row-level filter requires exactly one repository scope, got ${scopes?.length ?? 0}. ` +
            `Pass a single-entity repositoryFilter, or call pullChanges once per entity.`
        );
      }
      assertSnapshotFilterSupported(filter);
      const scope = scopes[0];
      const { data, error } = await this.#client.rpc('rxdb_pull_changes', {
        p_since_id: sinceId,
        p_limit: limit,
        p_namespace: scope.namespace,
        p_entity: scope.entity,
        p_branch_id: branchId ?? null,
        p_filter: filter
      });
      if (error) {
        throw new SupabaseDataError(`Failed to pull changes: ${error.message}`);
      }
      if (!Array.isArray(data)) {
        throw new SupabaseDataError('Failed to pull changes: invalid response data');
      }
      return data.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : null
      })) as RemoteChange[];
    }

    let query = this.#client
      .from('rxdb_change')
      .select('*')
      .gt('id', sinceId)
      .order('id', { ascending: true })
      .limit(limit);

    if (scopes?.length === 1) {
      query = query.eq('namespace', scopes[0].namespace).eq('entity', scopes[0].entity);
    } else if (scopes && scopes.length > 1) {
      query = query.or(scopes.map(scope => this.#buildScopeCondition(scope)).join(','));
    }

    if (branchId) {
      query = query.eq('branchId', branchId);
    }

    const { data, error } = await query;
    if (error) {
      throw new SupabaseDataError(`Failed to pull changes: ${error.message}`);
    }

    return (data ?? [])
      .map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : null
      }))
      .sort((left, right) => left.id - right.id)
      .slice(0, limit);
  }

  /**
   * 获取远程变更数量（轻量级，不下载数据）(T042, US2)
   *
   * 此方法只查询远程有多少新变更，不返回实际数据。
   * 用于实现 checkRepositoryUpdates() 功能，节省带宽。
   *
   * @param sinceId - 起始 changeId（不包含该 ID）
   * @param repositoryFilter - 可选的实体过滤列表
   * @returns 变更数量和最新 changeId
   *
   * @example
   * ```typescript
   * // 查询 Todo 实体的新变更数量
   * const { count, latestChangeId } = await adapter.getChangeCount(100, ['Todo']);
   * console.log(`有 ${count} 条新变更，最新 ID: ${latestChangeId}`);
   * ```
   */
  async getChangeCount(
    sinceId: number,
    repositoryFilter?: string[],
    branchId?: string
  ): Promise<{
    count: number;
    latestChangeId: number;
  }> {
    const scopes = this.#resolveRepositoryScopes(repositoryFilter);
    let query = this.#client.from('rxdb_change').select('id', { count: 'exact' }).gt('id', sinceId);

    if (scopes?.length === 1) {
      query = query.eq('namespace', scopes[0].namespace).eq('entity', scopes[0].entity);
    } else if (scopes && scopes.length > 1) {
      query = query.or(scopes.map(scope => this.#buildScopeCondition(scope)).join(','));
    }

    if (branchId) {
      query = query.eq('branchId', branchId);
    }

    const { data, count, error } = await query.order('id', { ascending: false }).limit(1);
    if (error) {
      throw new SupabaseDataError(`Failed to get change count: ${error.message}`);
    }

    return {
      count: count ?? 0,
      latestChangeId: count && count > 0 && data && data.length > 0 ? data[0].id : sinceId
    };
  }

  /**
   * 应用压缩后的变更到远程（事务）
   *
   * 通过 rxdb_mutations RPC 在单个事务中：
   * 1. 写入 RxDBChange 表（用于其他客户端 pull）
   * 2. 应用 actions 到实体表（INSERT/UPDATE/DELETE）
   * 3. 自动跳过同步触发器（p_skip_sync=true）
   *
   * @param actions - 压缩后的变更操作集合
   * @param branchId - 分支 ID
   * @param changes - 完整的原始变更记录（可选，用于保留完整历史）
   */
  async mergeChanges(actions: SwitchVersionActions, branchId?: string, changes?: IRxDBChange[]) {
    if (actions.inserts.size === 0 && actions.updates.size === 0 && actions.deletes.size === 0 && !changes?.length) {
      return;
    }

    const now = new Date().toISOString();
    const userId = this.rxdb.context.userId;
    const effectiveBranchId = branchId ?? 'main';

    const resolveTableKey = (namespace: string, entityName: string) => {
      const ns = namespace || 'public';
      const meta = this.rxdb.schemaManager.getEntityMetadata(entityName, ns);
      const tableName = meta?.tableName ?? entityName;
      return `${ns}.${tableName}`;
    };

    const resolveChangeTable = (namespace: string, entityName: string) => {
      const [schema, table] = resolveTableKey(namespace, entityName).split('.');
      return { schema, table };
    };

    // 1. 构建 RxDBChange 记录
    const p_changes: Record<string, unknown>[] = [];

    if (changes?.length) {
      // 使用所有原始变更记录，保留完整历史
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
          clientId: change.clientId ?? this.rxdb.context.clientId,
          localId: change.id,
          ...table,
          createdAt: now,
          updatedAt: now
        });
      }
    } else {
      // 从 actions 构建（向后兼容）
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
          clientId: this.rxdb.context.clientId,
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
          clientId: this.rxdb.context.clientId,
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
          clientId: this.rxdb.context.clientId,
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

    // 构建 RPC 参数
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

    // 调用 RPC（单一事务，跳过触发器；瞬时网络错误自动重试）
    return this.executeRetryableWrite(
      'merge changes',
      async () => {
        const { data, error } = await this.#client.rpc('rxdb_mutations', {
          p_upserts,
          p_deletes,
          p_changes,
          p_skip_sync: true
        });
        return { data, error };
      },
      validateMergeResponse
    );
  }

  /**
   * 批量拉取多个实体的变更记录（单次 HTTP 请求）
   *
   * 通过 PostgREST 的 OR 过滤器实现：
   * `or=(and(entity.eq.Todo,id.gt.6),and(entity.eq.RxDBBranch,id.gt.0),...)`
   *
   * 每个实体使用独立的 sinceId 水位线，避免下载多余数据。
   */
  override async pullChangesBatch(
    requests: PullBatchRequest[],
    limit: number = 1000,
    branchIds?: string[]
  ): Promise<RemoteChange[]> {
    if (requests.length === 0) return [];

    // 单实体降级到 pullChanges
    if (requests.length === 1 && (!branchIds || branchIds.length <= 1)) {
      const request = requests[0];
      const identifier = request.namespace ? `${request.namespace}:${request.entity}` : request.entity;
      return this.pullChanges(request.sinceId, limit, [identifier], undefined, branchIds?.[0]);
    }

    const orConditions = requests
      .map(request => {
        const identifier = request.namespace ? `${request.namespace}:${request.entity}` : request.entity;
        const scope = resolveEntityScope(this.rxdb, identifier);
        return `and(namespace.eq.${scope.namespace},entity.eq.${scope.entity},id.gt.${request.sinceId})`;
      })
      .join(',');

    let query = this.#client
      .from('rxdb_change')
      .select('*')
      .or(orConditions)
      .order('id', { ascending: true })
      .limit(limit);

    // 支持多分支过滤（包括祖先分支）
    if (branchIds && branchIds.length > 0) {
      if (branchIds.length === 1) {
        query = query.eq('branchId', branchIds[0]);
      } else {
        query = query.in('branchId', branchIds);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new SupabaseDataError(`Failed to batch pull changes: ${error.message}`);
    }

    return (data ?? []).map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null
    }));
  }

  // ============================================
  // 分支同步
  // ============================================

  override async pushBranches(branches: Record<string, unknown>[]): Promise<{ synced: number; skipped: string[] }> {
    if (branches.length === 0) {
      return { synced: 0, skipped: [] };
    }

    const { data, error } = await this.#client.rpc('rxdb_enable_sync_for_branch', {
      p_branches: branches
    });

    if (error) {
      throw new SupabaseDataError(`Failed to sync branches: ${error.message}`);
    }

    return validatePushBranchesResponse(data);
  }

  override async branchExists(branchId: string): Promise<boolean> {
    const { count, error } = await this.#client
      .from('rxdb_branch')
      .select('id', { count: 'exact', head: true })
      .eq('id', branchId);

    if (error) {
      throw new SupabaseDataError(`Failed to check branch existence: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  override async pullBranches(): Promise<RemoteBranchInfo[]> {
    // 分支数超过 PostgREST 的 max-rows 时，单次 select 会被静默截断：
    // 缺失的分支在本地表现为「远端没有这个分支」，同步会据此做出错误的分支决策。
    const data = await select_all_pages(
      (from, to) =>
        this.#client
          .from('rxdb_branch')
          .select('id, fromChangeId, parentId, createdAt, updatedAt')
          .order('id', { ascending: true })
          .range(from, to),
      'Failed to pull branches'
    );

    return data.map(row => ({
      id: row.id as string,
      fromChangeId: row.fromChangeId as number | null,
      parentId: row.parentId as string | null,
      createdAt: row.createdAt as string | null,
      updatedAt: row.updatedAt as string | null
    }));
  }

  // ============================================
  // QueryCache 方法
  // ============================================

  /**
   * 获取实体元数据，用于新鲜度比较（QueryCache 专用）
   *
   * 只返回 `{ id, updatedAt }` 元数据，网络传输量比完整数据减少 90%+。
   *
   * @param entityName - 实体名称
   * @param query - 查询条件
   * @returns Observable<QueryCacheEntityMetadata[]>
   *
   * @example
   * ```typescript
   * adapter.fetchMetadata('Product', { combinator: 'and', rules: [{ field: 'status', operator: 'eq', value: 'active' }] })
   *   .subscribe(metadata => console.log(metadata));
   * ```
   */
  fetchMetadata(entityName: string, queryFilter: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]> {
    return defer(() => {
      const scope = resolveEntityScope(this.rxdb, entityName);

      // 元数据用于新鲜度比较，被截断掉的那些 id 会被 QueryCache 当成「远端已删除」，
      // 因此这里必须翻页取全，不能依赖服务端的 max-rows。
      const rows = select_all_pages<{ id: unknown; updatedAt: unknown }>((rangeFrom, rangeTo) => {
        const query = this.#client.schema(scope.schema).from(scope.tableName).select('id, updatedAt');
        return apply_rule_group(query, queryFilter).order('id', { ascending: true }).range(rangeFrom, rangeTo);
      }, 'Failed to fetch metadata');

      return from(rows).pipe(
        map(data =>
          data.map(row => ({
            id: row.id as string,
            updatedAt: row.updatedAt as string
          }))
        )
      );
    });
  }

  /**
   * 按 ID 列表批量获取完整数据（QueryCache 专用）
   *
   * @param entityName - 实体名称
   * @param ids - 需要获取的实体 ID 列表
   * @returns Observable<T[]>
   */
  findByIds<T>(entityName: string, ids: string[]): Observable<T[]> {
    return defer(() => {
      if (ids.length === 0) {
        return of([]);
      }
      const scope = resolveEntityScope(this.rxdb, entityName);
      return from(this.#findByIdsInChunks<T>(scope, ids));
    });
  }

  // ============================================
  // 私有方法
  // ============================================

  /** 获取带 schema 的客户端 */
  private getSchemaClient(namespace?: string) {
    const resolvedNamespace = resolve_supabase_schema(namespace);
    return resolvedNamespace ? this.#client.schema(resolvedNamespace) : this.#client;
  }

  private async executeRetryableWrite<TResult>(
    operationName: string,
    operation: () => PromiseLike<RetryableWriteResponse>,
    validate: (data: unknown) => TResult
  ): Promise<TResult> {
    let lastMessage = 'Unknown error';

    for (let attempt = 1; attempt <= RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS; attempt++) {
      const { data, error } = await operation();

      if (!error) {
        return validate(data);
      }

      lastMessage = error.message || 'Unknown error';

      if (!isRetryableSupabaseWriteError(lastMessage) || attempt === RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS) {
        throw new SupabaseDataError(`Failed to ${operationName}: ${lastMessage}`);
      }

      await wait(RETRYABLE_SUPABASE_WRITE_RETRY_DELAY_MS * attempt);
    }

    throw new SupabaseDataError(`Failed to ${operationName}: ${lastMessage}`);
  }

  /** 执行 upsert（非事务） */
  private async executeUpsert<T extends EntityType>(
    grouped: Map<EntityType, Set<InstanceType<T>>>
  ): Promise<InstanceType<T>[]> {
    const results: InstanceType<T>[] = [];
    const userId = this.rxdb.context.userId;

    for (const [EntityType, entitySet] of grouped) {
      const metadata = getEntityMetadata(EntityType);
      const client = this.getSchemaClient(metadata.namespace);
      const entities = Array.from(entitySet);
      // saveMany 的实体可能既有新建也有已存在的，按 `status.local` 逐个判定 ——
      // 这与 `getEntityMutations` 划分 create/update 用的是同一个判据。
      // 已存在的行不下发 createdBy，否则 upsert 的 DO UPDATE SET 会覆写原作者。
      const data =
        userId ?
          entities.map(entity => {
            const row: Record<string, unknown> = { ...entity, updatedBy: userId };
            if (tryGetEntityStatus(entity)?.local) {
              delete row['createdBy'];
            } else {
              row['createdBy'] = userId;
            }
            return row;
          })
        : entities;

      const result = await this.executeRetryableWrite(
        'upsert',
        async () => {
          const { data: upsertedData, error } = await client
            .from(metadata.tableName)
            .upsert(data as Record<string, unknown>[])
            .select();

          return { data: upsertedData, error };
        },
        value => validateArrayResponse<InstanceType<T>>(value, 'upsert')
      );

      results.push(...result);
    }

    return results;
  }

  /** 执行 delete（非事务） */
  private async executeDelete<T extends EntityType>(
    grouped: Map<EntityType, Set<InstanceType<T>>>
  ): Promise<InstanceType<T>[]> {
    const results: InstanceType<T>[] = [];

    for (const [EntityType, entitySet] of grouped) {
      const metadata = getEntityMetadata(EntityType);
      const client = this.getSchemaClient(metadata.namespace);
      const entities = Array.from(entitySet);
      const ids = entities.map(e => e.id);

      const deletedRows = await this.executeRetryableWrite(
        'delete',
        async () => {
          const { data, error } = await client.from(metadata.tableName).delete().in('id', ids).select('id');
          return { data, error };
        },
        value => validateArrayResponse<{ id: unknown }>(value, 'delete')
      );
      const deletedIds = new Set(deletedRows.map(row => String(row.id)));
      const missingIds = [...new Set(ids.map(id => String(id)))].filter(id => !deletedIds.has(id));
      if (missingIds.length > 0) {
        throw new SupabaseDataError(`Failed to delete: no row returned for id(s): ${missingIds.join(', ')}`);
      }

      results.push(...entities);
    }

    return results;
  }

  #assertConfiguredEntitiesSupported(): void {
    for (const EntityType of this.rxdb.config.entities) {
      this.#assertEntitySupported(EntityType);
    }
  }

  #assertEntitySupported(EntityType: EntityType): void {
    const metadata = getEntityMetadata(EntityType);
    const sync = getSyncConfig(metadata, this.rxdb.config.sync);
    if (sync?.remote?.adapter !== ADAPTER_NAME) return;

    const property = getUnsupportedProperty(metadata, (entity, namespace) =>
      this.rxdb.schemaManager.getEntityMetadata(entity, namespace)
    );
    if (!property) return;

    throw new SupabaseUnsupportedPropertyTypeError(metadata.name, property.name, property.type);
  }

  async #verifyRlsConfiguration(): Promise<void> {
    if (this.#rlsCheckDone || this.options.rlsCheck === false) {
      return;
    }

    const options = this.#getRlsCheckOptions();
    const tables = this.#resolveRlsCheckTables(options.tables);
    if (tables.length === 0) {
      this.#rlsCheckDone = true;
      return;
    }

    const response = await Promise.resolve(
      this.#client.rpc(options.rpcName, {
        p_tables: tables
      })
    ).catch((error: unknown) => {
      this.#handleRlsCheckFailure(this.#formatRlsUnexpectedError(error), options.failureMode);
      return null;
    });
    if (!response) {
      return;
    }

    const { data, error } = response;
    if (error) {
      this.#handleRlsCheckFailure(this.#formatRlsRpcError(options.rpcName, error.message), options.failureMode);
      this.#rlsCheckDone = !isRetryableSupabaseWriteError(error.message?.trim() ?? '');
      return;
    }

    const results = Array.isArray(data) ? (data as SupabaseRlsCheckResult[]) : [];
    const resultsByTable = new Map(results.map(item => [`${item.schema}:${item.table}`, item]));
    const resultOf = (table: SupabaseRlsCheckTable): SupabaseRlsCheckResult | undefined =>
      resultsByTable.get(`${table.schema ?? 'public'}:${table.table}`);
    const label = (items: SupabaseRlsCheckTable[]): string =>
      items
        .map(item => `${item.schema ?? 'public'}.${item.table}`)
        .sort()
        .join(', ');

    const missingOrDisabled = tables.filter(table => {
      const result = resultOf(table);
      return result?.exists !== true || result.rlsEnabled !== true;
    });
    if (missingOrDisabled.length > 0) {
      this.#handleRlsCheckFailure(
        `[RxDB Supabase] RLS is disabled for tables: ${label(missingOrDisabled)}. Fix the policies before exposing this adapter to untrusted clients.`,
        options.failureMode
      );
    }
    this.#rlsCheckDone = true;
  }

  #getRlsCheckOptions(): Required<SupabaseRlsCheckOptions> {
    if (this.options.rlsCheck && typeof this.options.rlsCheck === 'object') {
      return {
        rpcName: this.options.rlsCheck.rpcName ?? DEFAULT_RLS_CHECK_RPC_NAME,
        failureMode: this.options.rlsCheck.failureMode ?? 'warn',
        tables: this.options.rlsCheck.tables ?? []
      };
    }

    return {
      rpcName: DEFAULT_RLS_CHECK_RPC_NAME,
      failureMode: 'warn',
      tables: []
    };
  }

  #resolveRlsCheckTables(overrideTables: SupabaseRlsCheckTable[]): SupabaseRlsCheckTable[] {
    const inputTables =
      overrideTables.length > 0 ?
        overrideTables
      : [
          { schema: 'public', table: 'rxdb_change' },
          { schema: 'public', table: 'rxdb_branch' },
          ...this.rxdb.config.entities.map(entity => {
            const metadata = getEntityMetadata(entity);
            return {
              schema: resolve_supabase_schema(metadata.namespace),
              table: metadata.tableName
            } satisfies SupabaseRlsCheckTable;
          })
        ];

    const deduped = new Map<string, SupabaseRlsCheckTable>();
    for (const table of inputTables) {
      const schema = table.schema ?? 'public';
      const key = `${schema}:${table.table}`;
      deduped.set(key, {
        schema,
        table: table.table
      });
    }

    return [...deduped.values()];
  }

  #formatRlsRpcError(rpcName: string, message?: string | null): string {
    const detail = message?.trim() || 'unknown error';
    if (/does not exist/i.test(detail)) {
      return `[RxDB Supabase] RLS self-check skipped because RPC "${rpcName}" is not installed. Apply docker/sql/04-rxdb-utils-functions.sql or set rlsCheck=false if you intentionally manage RLS verification elsewhere.`;
    }
    return `[RxDB Supabase] Failed to verify RLS via RPC "${rpcName}": ${detail}`;
  }

  #formatRlsUnexpectedError(error: unknown): string {
    return `[RxDB Supabase] Failed to verify RLS: ${error instanceof Error ? error.message : String(error)}`;
  }

  #handleRlsCheckFailure(message: string, mode: 'warn' | 'throw'): void {
    if (mode === 'throw') {
      throw new SupabaseDataError(message);
    }
    console.warn(message);
  }

  #createRealtimeChannel(): RealtimeChannel {
    const channel = this.#client
      .channel('rxdb-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rxdb_change' }, payload =>
        handleSupabaseChange(this, payload)
      );

    channel.subscribe((status, err) => {
      void this.#enqueueRealtime(async () => {
        if (this.#channel !== channel || this.#realtimeState === 'closed') return;

        if (status === 'SUBSCRIBED') {
          this.#realtimeState = 'connected';
          this.#reconnectAttempt = 0;
          void this.#refreshPullableCount();
          return;
        }

        if (err) {
          console.error('Supabase Realtime subscription failed:', err);
        }

        if (REALTIME_RECONNECTABLE_STATUSES.has(status)) {
          this.#scheduleRealtimeReconnect(channel, status, err?.message);
        }
      }).catch(error => {
        console.error('[RxDB Supabase] Realtime status handling failed:', error);
      });
    });

    return channel;
  }

  #scheduleRealtimeReconnect(channel: RealtimeChannel, status: string, reason?: string): void {
    if (
      this.#realtimeState === 'closed' ||
      this.#realtimeState === 'idle' ||
      this.#reconnectTimer ||
      this.#channel !== channel
    ) {
      return;
    }

    this.#reconnectAttempt += 1;
    const delay = Math.min(
      REALTIME_RECONNECT_BASE_DELAY_MS * 2 ** (this.#reconnectAttempt - 1),
      REALTIME_RECONNECT_MAX_DELAY_MS
    );
    const detail = reason?.trim();
    console.warn(
      `[RxDB Supabase] Realtime channel ${status} detected. Retrying in ${delay}ms (attempt ${this.#reconnectAttempt})${detail ? `: ${detail}` : ''}.`
    );

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#enqueueRealtime(() => this.#reconnectRealtimeChannel(channel)).catch(error => {
        console.error('[RxDB Supabase] Realtime reconnect failed:', error);
      });
    }, delay);
  }

  async #reconnectRealtimeChannel(channel: RealtimeChannel): Promise<void> {
    if (this.#realtimeState === 'closed' || this.#channel !== channel) {
      return;
    }

    this.#realtimeState = 'reconnecting';
    this.#channel = null;
    try {
      await this.#client.removeChannel(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[RxDB Supabase] Failed to remove realtime channel: ${message}.`);
    }

    this.#realtimeState = 'connecting';
    this.#channel = this.#createRealtimeChannel();
  }

  async #refreshPullableCount(): Promise<void> {
    try {
      await this.rxdb.versionManager?.refreshPullableCount();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[RxDB Supabase] Failed to refresh realtime catch-up count: ${message}.`);
    }
  }

  #enqueueRealtime(operation: () => Promise<void>): Promise<void> {
    const result = this.#realtimeQueue.then(operation);
    this.#realtimeQueue = result.catch(() => undefined);
    return result;
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  /**
   * 获取满足 filter 条件的实体 ID 列表
   *
   * @param entityName - 实体表名
   * @param filter - 过滤条件
   * @returns 满足条件的 entityId 列表
   */
  #resolveRepositoryScopes(repositoryFilter?: string[]): EntityScope[] | undefined {
    if (!repositoryFilter?.length) return undefined;
    return repositoryFilter.map(identifier => resolveEntityScope(this.rxdb, identifier));
  }

  #buildScopeCondition(scope: EntityScope): string {
    return `and(namespace.eq.${scope.namespace},entity.eq.${scope.entity})`;
  }

  /**
   * 按块查询 id 列表，避免 `in()` 把全部 id 拼进查询串
   *
   * @remarks
   * id 是主键，单块最多返回 `chunkSize` 行，因此块内不会再撞上 `max-rows` 截断。
   */
  async #findByIdsInChunks<T>(scope: EntityScope, ids: string[]): Promise<T[]> {
    const rows: T[] = [];

    for (const chunk of chunk_values(ids, SUPABASE_IN_CHUNK_SIZE)) {
      const { data, error } = await this.#client.schema(scope.schema).from(scope.tableName).select('*').in('id', chunk);

      if (error) {
        throw new SupabaseDataError(`Failed to find by ids: ${error.message}`);
      }

      rows.push(...((data ?? []) as T[]));
    }

    return rows;
  }
}
