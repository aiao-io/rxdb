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
  EntityType,
  IRepository,
  IRxDBAdapter,
  IRxDBChange,
  PullBatchRequest,
  QueryCacheEntityMetadata,
  RemoteBranchInfo,
  RemoteChange,
  RemoteEntityRef,
  RemoteMergeOptions,
  RemoteMergeResult,
  RepositoryInstance,
  RuleGroup,
  RxDB,
  RxDBIdentity,
  RxDBMutationsMap,
  SwitchVersionActions
} from '@aiao/rxdb';
import { getEntityMetadata, getSyncConfig, RxDBAdapterRemoteBase, tryGetEntityStatus } from '@aiao/rxdb';
import {
  createClient,
  RealtimeChannel,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient
} from '@supabase/supabase-js';
import { defer, from, map, Observable, of } from 'rxjs';
import { resolveEntityScope, type EntityScope } from './entity_scope.js';
import { SupabaseConfigError, SupabaseDataError, SupabaseUnsupportedPropertyTypeError } from './errors.js';
import {
  handleSupabaseChanges,
  RXDB_CHANGES_EVENT,
  RXDB_CHANGES_TOPIC,
  rxdbChangesTopicForBucket
} from './handle_supabase_change.js';
import { chunk_values, select_all_pages, SUPABASE_IN_CHUNK_SIZE } from './pagination.js';
import {
  assert_postgrest_ok,
  is_transport_failure,
  settle_postgrest_failure,
  type PostgrestErrorBody
} from './postgrest-error.js';
import { apply_rule_group } from './rule_group_builder.js';
import {
  assert_batch_primary_key_column,
  build_delete_params,
  build_upsert_params,
  group_by_type
} from './RxDBAdapterSupabase.utils.js';
import { resolve_supabase_schema } from './schema.utils.js';
import {
  ADAPTER_NAME,
  assertSnapshotFilterSupported,
  canReceiveChangeNotifications,
  getUnsupportedProperty,
  identityOfAccessToken,
  isRetryableSupabaseWriteError,
  REALTIME_RECONNECT_BASE_DELAY_MS,
  REALTIME_RECONNECT_MAX_DELAY_MS,
  REALTIME_RECONNECTABLE_STATUSES,
  RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS,
  RETRYABLE_SUPABASE_WRITE_RETRY_DELAY_MS,
  SUPABASE_SDK_VERSION,
  validateArrayResponse,
  validateMergeResponse,
  validateMutationsResponse,
  validatePushBranchesResponse,
  wait,
  type RealtimeState,
  type RetryableWriteResponse,
  type SupabaseRlsCheckResult
} from './supabase.helpers.js';
import {
  SupabaseAdapterOptions,
  type SupabaseEntityHistoryItem,
  type SupabaseEntityHistoryOptions,
  type SupabaseEntitySyncInfo,
  type SupabaseRlsCheckTable,
  type SupabaseScopedSyncIdentity
} from './supabase.interface.js';
import { build_merge_changes_payload } from './supabase.merge-changes.js';
import {
  formatRlsRpcError,
  formatRlsUnexpectedError,
  getRlsCheckOptions,
  handleRlsCheckFailure,
  resolveRlsCheckTables
} from './supabase.rls.js';
import { SupabaseRepository } from './SupabaseRepository.js';
import { SupabaseTreeRepository } from './SupabaseTreeRepository.js';

export { ADAPTER_NAME, SUPABASE_SDK_VERSION };

type AuthStateChangeListener = (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
  data: { subscription: { unsubscribe: () => void } };
};

/**
 * Supabase 适配器
 *
 * @remarks
 * 按参考 SQL 的生产权限部署后，分区日志按调用者的 caller buckets 做读取隔离：anon 默认只读 `public`，
 * authenticated 只读已授权区。通用日志拉取、推送、分支登记与实时通知仍只对已登录身份开放。
 * 传入应用里已经登录的客户端，或使用带 JWT 的 `accessToken` 回调。只给 `supabaseUrl` + `supabaseKey`
 * 时适配器自建一个没有会话的客户端，只适合公开区只读 RPC 或直读业务表。
 *
 * @example
 * ```typescript
 * const supabase = createClient('https://xxx.supabase.co', 'your-anon-key');
 * // …应用在这里完成登录，supabase 带上了用户会话
 *
 * rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: supabase }));
 * ```
 */
export class RxDBAdapterSupabase extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  #client: SupabaseClient;
  #channels: RealtimeChannel[] = [];
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempt = 0;
  #realtimeState: RealtimeState = 'idle';
  #realtimeQueue: Promise<void> = Promise.resolve();
  #realtimeGeneration = 0;
  #realtimeIdentityKey: string | null = null;
  #authStateSubscription: { unsubscribe: () => void } | null = null;
  #rlsCheckDone = false;
  #databaseVersion: string | null = null;
  #supabaseScope: string | null = null;
  readonly name = ADAPTER_NAME;
  /**
   * `rxdb_mutations` 能先把外键写空、再补写（`p_deferred_columns`，US-038）
   *
   * @remarks
   * 服务端要升级到带第七个参数的 `rxdb_mutations`；没升级时需要补写的批次报 {@link SupabaseConfigError}，
   * 不需要补写的推送照常可用。
   */
  override readonly supportsDeferredForeignKeys = true;

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
      this.#supabaseScope = resolveSupabaseScope(options.supabaseUrl, options.client);
      this.#installAuthStateListener();
      return;
    }

    const supabaseUrl = options.supabaseUrl?.trim();
    const supabaseKey = options.supabaseKey?.trim();
    if (!supabaseUrl || !supabaseKey) {
      throw new SupabaseConfigError('A non-empty supabaseUrl and supabaseKey are required when client is not supplied');
    }

    this.#client = createClient(supabaseUrl, supabaseKey);
    this.#supabaseScope = normalizeSupabaseScope(supabaseUrl);
    this.#installAuthStateListener();
  }

  // ============================================
  // 连接管理
  // ============================================

  async connect(): Promise<IRxDBAdapter> {
    this.#assertConfiguredEntitiesSupported();
    await this.#verifyRlsConfiguration();
    await this.#enqueueRealtime(async () => {
      this.#clearReconnectTimer();
      this.#installAuthStateListener();
      if (this.#channels.length > 0) {
        // 已在订阅：令牌换了主人（应用切换账号后再调 connect()）就按新身份重建
        await this.#client.realtime.setAuth();
        this.#followRealtimeIdentity(this.#client.realtime.accessTokenValue);
        return;
      }

      this.#realtimeState = 'connecting';
      this.#channels = (await this.#createRealtimeChannels()) ?? [];
      // 没登录时不订阅：保持 idle，下一次 connect() 会按新的令牌重新判断
      if (this.#channels.length === 0) this.#realtimeState = 'idle';
    });
    return this;
  }

  async disconnect(): Promise<void> {
    await this.#enqueueRealtime(async () => {
      this.#realtimeState = 'closed';
      this.#clearReconnectTimer();
      this.#reconnectAttempt = 0;
      this.#realtimeGeneration += 1;
      this.#authStateSubscription?.unsubscribe();
      this.#authStateSubscription = null;
      await this.#removeRealtimeChannels();
    });
  }

  async version(): Promise<string> {
    if (this.#databaseVersion) return this.#databaseVersion;

    const { data, error, status } = await this.#client.rpc('rxdb_server_version');
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to get database version');
    if (typeof data !== 'string' || data.trim().length === 0) {
      throw new SupabaseDataError('Failed to get database version: invalid response data');
    }

    this.#databaseVersion = data.trim();
    return this.#databaseVersion;
  }

  /**
   * 远端身份：`rxdb_backend` 单行表里的 id
   *
   * @returns 远端库的身份值；库重建或 `TRUNCATE rxdb_change` 后换新值
   * @throws {SupabaseDataError} 远端没有身份行（参考 SQL 未执行，或那一行被删）
   *
   * @remarks
   * 不缓存：远端可能在连接期间被重建，同步插件每次与远端交换数据之前都要读到当前值。
   */
  async backendId(): Promise<string> {
    const { data, error, status } = await this.#client.rpc('rxdb_backend_id');
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to get backend id');
    if (typeof data !== 'string' || data.length === 0) {
      throw new SupabaseDataError('Failed to get backend id: public.rxdb_backend has no row');
    }
    return data;
  }

  /**
   * 当前调用者的身份（US-035）
   *
   * @returns 当前 Supabase project scope 与会话令牌的 subject
   * @throws {SupabaseConfigError} 令牌声称是已登录角色却没有 `sub`
   *
   * @remarks
   * 取的是**此刻**随请求发出的令牌，每次回答之前先 `realtime.setAuth()` 让客户端刷新它，不缓存：
   * 会话可能在两次请求之间换了主人。不读 `client.auth`：客户端配了 `accessToken` 选项时，
   * supabase-js 对 `client.auth` 的任何访问都抛错；而 Realtime 持有的就是 PostgREST 请求带的那个令牌。
   * 取令牌与每个 PostgREST 请求走同一条路径（`accessToken` 回调或 `auth.getSession()`），不为身份另发请求：
   * 令牌临期时的刷新由 auth-js 去重，本来就会发生在紧接着的那个请求上。
   *
   * 令牌换了主人而 Realtime 还按旧身份订阅着时，顺带重建频道：`accessToken` 模式没有 auth 事件可听，
   * 私有频道又是在加入时按身份授权的。
   */
  override async callerIdentity(): Promise<RxDBIdentity> {
    await this.#client.realtime.setAuth();
    const accessToken = this.#client.realtime.accessTokenValue;
    const identity = this.#identityFromSubject(identityOfAccessToken(accessToken));
    this.#followRealtimeIdentity(accessToken);
    return identity;
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量保存实体（upsert 语义，非事务）
   *
   * @throws {SupabaseConfigError} 批内有实体的主键 `id` 映射到了别的物理列（批量写只支持默认 `id` 列）
   */
  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    if (entities.length === 0) return [];
    const grouped = group_by_type(entities);
    // 整批先查再写：executeUpsert 逐组落库，查到后面的组才抛会留下前面已写入的半批
    for (const EntityType of grouped.keys()) assert_batch_primary_key_column(getEntityMetadata(EntityType), 'saveMany');
    return this.executeUpsert(grouped);
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
   *
   * @returns 新增和修改的服务器最终行，以及删除的原实体
   * @throws {SupabaseConfigError} 批内有实体的主键 `id` 映射到了别的物理列，RPC 不会发出
   * @throws {SupabaseDataError} 修改被拒绝时为 `42501`，目标行不存在时为 `RX001`；整批回滚
   */
  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    for (const EntityType of [...options.create.keys(), ...options.update.keys(), ...options.remove.keys()]) {
      assert_batch_primary_key_column(getEntityMetadata(EntityType), 'mutations');
    }
    const userId = this.rxdb.context.userId;

    const upserts = build_upsert_params(options.create, userId, 'insert');
    const updates = build_upsert_params(options.update, userId, 'update');
    const deletes = build_delete_params(options.remove);

    if (upserts.length === 0 && updates.length === 0 && deletes.length === 0) {
      return [];
    }

    // 调用 RPC（瞬时网络错误自动重试）
    const upserted = await this.executeRetryableWrite(
      'execute transaction',
      async () => {
        const { data, error, status } = await this.#client.rpc('rxdb_mutations', {
          p_upserts: upserts,
          p_updates: updates,
          p_deletes: deletes
        });
        return { data, error, status };
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

    // 这里不能用 `assert_postgrest_ok`：本方法把 404 / 406 当成「表不存在」的**正常答案**，
    // 而那些响应是带 error 的。可达性只关心「够不够得着」——拿到任何状态码都算够得着，
    // 判据仍是 `is_transport_failure` 那一份，不在这儿另写。
    if (!is_transport_failure(result)) this.rxdb.reachability.report(null);

    if (result.status === 200 || result.status === 206) return true;
    if (result.status === 204 || result.status === 404 || result.status === 406) return false;

    throw settle_postgrest_failure(
      this.rxdb.reachability,
      { error: result.error ?? { message: `status ${result.status}` }, status: result.status },
      'Failed to check table existence'
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
   * 只拉未分区日志（`bucket IS NULL`）。分区日志只带元数据，正文要按调用者身份从业务表派生，经
   * {@link RxDBAdapterSupabase.pullBucketChanges} 拉取。
   *
   * 当提供 filter 参数时，调用 `rxdb_pull_changes` RPC 在变更日志的快照上求值，不 JOIN 当前业务表：
   * `beforeData` 或 `afterData` 任一命中即返回整条变更，`snapshotComplete = false` 的历史变更不经过滤直接返回。
   * 因此 filter 只用于少拉数据，不是行级隔离边界。
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
      const { data, error, status } = await this.#client.rpc('rxdb_pull_changes', {
        p_since_id: sinceId,
        p_limit: limit,
        p_namespace: scope.namespace,
        p_entity: scope.entity,
        p_branch_id: branchId ?? null,
        p_filter: filter
      });
      assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to pull changes');
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
      .is('bucket', null)
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

    const { data, error, status } = await query;
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to pull changes');

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
   * 当前调用者可读的分区（US-033）
   *
   * @returns `rxdb_caller_buckets()` 的结果：anon 默认 `['public']`，登录用户默认再加 `user:<id>`，应用可扩展租户区
   * @throws {SupabaseDataError} 远端返回的不是非空字符串数组
   */
  async getCallerBuckets(): Promise<string[]> {
    const { data, error, status } = await this.#client.rpc('rxdb_caller_buckets');
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to resolve caller buckets');
    if (!Array.isArray(data) || !data.every(bucket => typeof bucket === 'string' && bucket.length > 0)) {
      throw new SupabaseDataError('Failed to resolve caller buckets: invalid response data');
    }
    return data;
  }

  /**
   * 读一行的远端变更历史（US-229）
   *
   * @param EntityType - 实体类
   * @param entityId - 行 id
   * @param options - 分页：`afterId` 传上一页最后一条的 `id`，`limit` 一页最多几条（1～1000）
   * @returns 调用者当前能编辑的那些历史，按写入顺序；正文只含调用者有列权限的列
   * @throws {SupabaseDataError} 远端拒绝（没有部署读取 RPC，或调用者没有执行权：anon 一律没有）或返回的形状不对
   *
   * @remarks
   * 历史与同步日志分开存放：同步日志按区开放读取、分区日志不带正文；历史记每次生效的业务写入的完整前后快照、
   * 操作者与来源，只经服务端的 `rxdb_entity_history` 读取。能不能看由服务端的 `rxdb_caller_can_edit` 按每条历史
   * 记录时的行判定：一行换了租户之后，改动前的历史只对旧租户的成员可见；行删掉之后，它的历史照样按删除前的行开放。
   *
   * @example
   * ```ts
   * const adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
   * const history = await adapter.getEntityHistory(CatalogItem, item.id);
   * for (const entry of history) console.log(entry.createdAt, entry.actor, entry.patch);
   * ```
   */
  async getEntityHistory<T extends EntityType>(
    EntityType: T,
    entityId: string | number,
    options: SupabaseEntityHistoryOptions = {}
  ): Promise<SupabaseEntityHistoryItem[]> {
    const { namespace, name } = getEntityMetadata(EntityType);
    const { data, error, status } = await this.#client.rpc('rxdb_entity_history', {
      p_namespace: namespace,
      p_entity: name,
      p_entity_id: String(entityId),
      ...(options.afterId === undefined ? {} : { p_after_id: options.afterId }),
      ...(options.limit === undefined ? {} : { p_limit: options.limit })
    });
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to read entity history');
    if (!Array.isArray(data) || !data.every(isEntityHistoryRow)) {
      throw new SupabaseDataError('Failed to read entity history: invalid response data');
    }
    return data.map(item => ({ ...item, createdAt: new Date(item.createdAt) }));
  }

  /**
   * 实体在远端的登记信息（US-033）
   *
   * @param namespace - 实体命名空间（即业务表所在 schema）
   * @param entity - 实体名
   * @returns 业务表名与是否按 `rxdb_bucket` 分区；没登记过的实体 `bucketed` 为 `false`
   * @throws {SupabaseDataError} 远端返回的形状不对
   */
  async getEntitySyncInfo(namespace: string, entity: string): Promise<SupabaseEntitySyncInfo> {
    const { data, error, status } = await this.#client.rpc('rxdb_entity_sync_info', {
      p_namespace: namespace,
      p_entity: entity
    });
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to resolve entity sync info');
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data['namespace'] !== 'string' ||
      typeof data['entity'] !== 'string' ||
      (typeof data['tableName'] !== 'string' && data['tableName'] !== null) ||
      typeof data['bucketed'] !== 'boolean'
    ) {
      throw new SupabaseDataError('Failed to resolve entity sync info: invalid response data');
    }
    return data as SupabaseEntitySyncInfo;
  }

  /**
   * 分区日志的水位：某个 bucket 在给定分支上的最大日志 id（US-033）
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param branchIds - 只算这些分支（通常是当前分支及其祖先）；不传时算全部分支
   * @returns 最大日志 id，没有日志时为 0
   * @throws {SupabaseDataError} 分区不属于调用者（`42501`）或返回值不是非负整数
   *
   * @remarks
   * 拉取只拉给定分支的日志，水位必须同口径：把别的分支算进来，游标就永远追不上它。
   */
  async getBucketSnapshotPoint(
    namespace: string,
    entity: string,
    bucket: string,
    branchIds?: readonly string[]
  ): Promise<number> {
    const { data, error, status } = await this.#client.rpc('rxdb_bucket_snapshot_point', {
      p_namespace: namespace,
      p_entity: entity,
      p_bucket: bucket,
      p_branch_ids: branchIds ?? null
    });
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to read bucket snapshot point');
    const point = typeof data === 'number' ? data : Number(data);
    if (!Number.isSafeInteger(point) || point < 0) {
      throw new SupabaseDataError('Failed to read bucket snapshot point: invalid response data');
    }
    return point;
  }

  /**
   * 分区在游标之后、不是本客户端推上去的日志条数（US-233）
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param afterId - 游标：只数 id 大于它的日志
   * @param branchIds - 只算这些分支，与拉取同口径
   * @returns 条数
   * @throws {@link SupabaseDataError} 查询失败时
   *
   * @remarks
   * 直接数 `rxdb_change`：表上的 `rxdb_change_read_by_bucket` 策略只放行调用者可读分区的行，
   * 分区此刻已被撤销时数出来是 0，不需要另开 RPC。不求值实体同步规则，与快照点同口径。
   */
  async getBucketChangeCount(
    namespace: string,
    entity: string,
    bucket: string,
    afterId: number,
    branchIds: readonly string[]
  ): Promise<number> {
    const query = this.#client
      .from('rxdb_change')
      .select('id', { count: 'exact', head: true })
      .eq('namespace', namespace)
      .eq('entity', entity)
      .eq('bucket', bucket)
      .gt('id', afterId)
      .in('branchId', [...branchIds]);
    const { count, error, status } = await this.#othersOnly(query);
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to count bucket changes');
    return count ?? 0;
  }

  /**
   * 只留别人的变更（US-233）
   *
   * @remarks
   * 本客户端推上去的变更拉下来只回填 `remoteId`、不落库，不算待拉，与实时通知跳过自己的口径一致
   * （`handle_supabase_change`）。远端直写没有客户端标识，照样计入：单写 `clientId.neq.x` 会把空值一并滤掉。
   */
  #othersOnly<Q extends { or(filters: string): Q }>(query: Q): Q {
    const clientId = this.rxdb.context.clientId;
    return clientId ? query.or(`clientId.is.null,clientId.neq.${clientId}`) : query;
  }

  /**
   * 按分区从业务表读一页快照（US-033）
   *
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param filter - 实体同步规则，只能在分区内缩小范围
   * @param afterId - 上一页最后一行的 id（`String(row.id)`）；第一页传 `null`
   * @param limit - 每页行数
   * @returns 按 id 升序、以调用者身份在业务表 RLS 下读到的行
   * @throws {SupabaseDataError} 分区不属于调用者、实体未分区或返回值不是对象数组
   *
   * @remarks
   * 按 id 接着上一页读（keyset），不用 OFFSET：翻页之间有人删行时，OFFSET 会把边界上的幸存行挤掉。
   */
  async pullBucketSnapshot(
    namespace: string,
    entity: string,
    bucket: string,
    filter: RuleGroup<unknown> | undefined,
    afterId: string | null,
    limit: number
  ): Promise<Record<string, unknown>[]> {
    if (limit <= 0) return [];
    if (filter) assertSnapshotFilterSupported(filter);
    const { data, error, status } = await this.#client.rpc('rxdb_pull_bucket_snapshot', {
      p_namespace: namespace,
      p_entity: entity,
      p_bucket: bucket,
      p_filter: filter ?? null,
      p_after_id: afterId,
      p_limit: limit
    });
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to pull bucket snapshot');
    if (!Array.isArray(data) || !data.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) {
      throw new SupabaseDataError('Failed to pull bucket snapshot: invalid response data');
    }
    return data as Record<string, unknown>[];
  }

  /**
   * 拉某个分区在游标之后的增量日志（US-033）
   *
   * @param sinceId - 游标：只返回 id 大于它的日志
   * @param limit - 最多返回条数
   * @param namespace - 实体命名空间
   * @param entity - 实体名
   * @param bucket - 调用者可读的分区
   * @param filter - 实体同步规则；不再匹配的行以 DELETE 返回
   * @param branchId - 只拉这个分支；不传时不按分支过滤
   * @returns 按 id 升序的日志；正文按调用者身份从业务表当前行重新派生，行已不在或不可见时为 DELETE
   * @throws {SupabaseDataError} 分区不属于调用者、实体未分区或返回值不是数组
   */
  async pullBucketChanges(
    sinceId: number,
    limit: number,
    namespace: string,
    entity: string,
    bucket: string,
    filter?: RuleGroup<unknown>,
    branchId?: string
  ): Promise<RemoteChange[]> {
    if (limit <= 0) return [];
    if (filter) assertSnapshotFilterSupported(filter);
    const { data, error, status } = await this.#client.rpc('rxdb_pull_bucket_changes', {
      p_since_id: sinceId,
      p_limit: limit,
      p_namespace: namespace,
      p_entity: entity,
      p_bucket: bucket,
      p_branch_id: branchId ?? null,
      p_filter: filter ?? null
    });
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to pull bucket changes');
    if (!Array.isArray(data)) {
      throw new SupabaseDataError('Failed to pull bucket changes: invalid response data');
    }
    return data.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null
    })) as RemoteChange[];
  }

  /**
   * 同步插件绑定本地库时用的调用者身份（US-033）
   *
   * @returns 与 {@link RxDBAdapterSupabase.callerIdentity} 相同
   * @throws {SupabaseConfigError} 令牌声称是已登录角色却没有 `sub`
   *
   * @remarks
   * 一个令牌只有一个身份：本地库按它绑定、远端会话按它核对，两处同一编码，`service_role` 不会被记成 anon。
   */
  async syncIdentity(): Promise<SupabaseScopedSyncIdentity> {
    return this.callerIdentity();
  }

  /**
   * 获取远程变更数量（轻量级，不下载数据）(T042, US2)
   *
   * 此方法只查询远程有多少新变更，不返回实际数据。
   * 用于实现 checkRepositoryUpdates() 功能，节省带宽。
   * 只数未分区日志，与 {@link RxDBAdapterSupabase.pullChanges} 同口径；分区日志的水位见 {@link RxDBAdapterSupabase.getBucketSnapshotPoint}。
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
    let query = this.#client.from('rxdb_change').select('id', { count: 'exact' }).gt('id', sinceId).is('bucket', null);

    if (scopes?.length === 1) {
      query = query.eq('namespace', scopes[0].namespace).eq('entity', scopes[0].entity);
    } else if (scopes && scopes.length > 1) {
      query = query.or(scopes.map(scope => this.#buildScopeCondition(scope)).join(','));
    }

    if (branchId) {
      query = query.eq('branchId', branchId);
    }

    const { data, count, error, status } = await this.#othersOnly(query).order('id', { ascending: false }).limit(1);
    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to get change count');

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
   *
   * @param options - 外键成环时先写空、再补写的外键（US-038），换成 `p_deferred_columns` 发给 `rxdb_mutations`
   * @throws {SupabaseConfigError} 带了延迟外键、服务端的 `rxdb_mutations` 却还没有 `p_deferred_columns`（PGRST202）
   *
   * @remarks
   * 载荷一律以 `id` 键定位行，不读实体主键的 columnName：同步协议的两端（变更日志触发器记 `NEW.id`、
   * `rxdb_mutations` 按 `id` 判冲突）都绑定业务表的 `id` 列，只在本地改了主键列名的同步实体照常推送。
   *
   * 延迟外键只在推 main 分支、且确有要补写的列时才带：非 main 推送只写日志、不写业务表；
   * 不带时请求与从前逐字相同，没升级的服务端照常可用。列名即载荷里的键（属性名），与其他列同一口径。
   */
  async mergeChanges(
    actions: SwitchVersionActions,
    branchId?: string,
    changes?: IRxDBChange[],
    options?: RemoteMergeOptions
  ): Promise<RemoteMergeResult> {
    if (actions.inserts.size === 0 && actions.updates.size === 0 && actions.deletes.size === 0 && !changes?.length) {
      return { results: [] };
    }

    const resolveTableKey = (namespace: string, entityName: string) => {
      const ns = namespace || 'public';
      const meta = this.rxdb.schemaManager.getEntityMetadata(entityName, ns);
      const tableName = meta?.tableName ?? entityName;
      return `${ns}.${tableName}`;
    };

    const { p_upserts, p_updates, p_deletes, p_changes } = build_merge_changes_payload(
      actions,
      branchId,
      changes,
      this.rxdb.context.userId,
      this.rxdb.context.clientId,
      resolveTableKey
    );

    // 把回执 dependsOn 的表引用（schema.table）换算成本地实体引用；反查不到时没有 fallback，
    // 直接当数据错误抛出——父表若没注册同步实体，本地也没有地方承接这条 dependsOn
    const resolveDependsOnEntity = (ref: { schema: string; table: string; entityId: string }): RemoteEntityRef => {
      const metadata = this.rxdb.schemaManager.getEntityMetadataByTableName(ref.table, ref.schema);
      if (!metadata) {
        throw new SupabaseDataError(
          `Merge response dependsOn references an unregistered table: ${ref.schema}.${ref.table}`
        );
      }
      return { namespace: metadata.namespace, entity: metadata.name, entityId: ref.entityId };
    };

    const p_deferred_columns = (branchId ?? 'main') === 'main' ? this.#deferredColumns(options) : [];

    // 调用 RPC（单一事务，跳过触发器；p_receipts 开启逐实体回执，一条被拒不拖垮整批；瞬时网络错误自动重试）
    return this.executeRetryableWrite(
      'merge changes',
      async () => {
        const { data, error, status } = await this.#client.rpc('rxdb_mutations', {
          p_upserts,
          p_updates,
          p_deletes,
          p_changes,
          p_skip_sync: true,
          p_receipts: true,
          ...(p_deferred_columns.length > 0 ? { p_deferred_columns } : {})
        });
        if (p_deferred_columns.length > 0 && error?.code === 'PGRST202') {
          throw new SupabaseConfigError(
            'The server rxdb_mutations does not accept p_deferred_columns, so rows whose foreign keys form a cycle ' +
              'cannot be pushed. Upgrade the reference SQL first: website/docs/migration/supabase-fk-cycle-push.md'
          );
        }
        return { data, error, status };
      },
      data => validateMergeResponse(data, changes, resolveDependsOnEntity)
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
      .is('bucket', null)
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

    const { data, error, status } = await query;

    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to batch pull changes');

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

    const { data, error, status } = await this.#client.rpc('rxdb_enable_sync_for_branch', {
      p_branches: branches
    });

    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to sync branches');

    return validatePushBranchesResponse(data);
  }

  override async branchExists(branchId: string): Promise<boolean> {
    const { count, error, status } = await this.#client
      .from('rxdb_branch')
      .select('id', { count: 'exact', head: true })
      .eq('id', branchId);

    assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to check branch existence');

    return (count ?? 0) > 0;
  }

  override async pullBranches(): Promise<RemoteBranchInfo[]> {
    // 分支数超过 PostgREST 的 max-rows 时，单次 select 会被静默截断：
    // 缺失的分支在本地表现为「远端没有这个分支」，同步会据此做出错误的分支决策。
    const data = await select_all_pages(
      this.rxdb.reachability,
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
      const EntityType = this.rxdb.schemaManager.getEntityType(scope.entity, scope.namespace)!;
      const metadata = getEntityMetadata(EntityType);
      const repository = this.getRepository<EntityType, SupabaseRepository<EntityType>>(EntityType);
      const primaryKeyColumn = metadata.propertyMap.get('id')?.columnName ?? 'id';
      const fields = repository.buildSelectFields(
        queryFilter as RuleGroup<Record<string, unknown>>,
        `${primaryKeyColumn}, updatedAt`
      );

      // 元数据用于新鲜度比较，被截断掉的那些 id 会被 QueryCache 当成「远端已删除」，
      // 因此这里必须翻页取全，不能依赖服务端的 max-rows。
      const rows = select_all_pages<Record<string, unknown>>(
        this.rxdb.reachability,
        (rangeFrom, rangeTo) => {
          const query = this.#client
            .schema(scope.schema)
            .from(scope.tableName)
            .select<string, Record<string, unknown>>(fields);
          return apply_rule_group(query, queryFilter, metadata, this.rxdb.schemaManager)
            .order(primaryKeyColumn, { ascending: true })
            .range(rangeFrom, rangeTo);
        },
        'Failed to fetch metadata'
      );

      return from(rows).pipe(
        map(data =>
          data.map(row => ({
            id: row[primaryKeyColumn] as string,
            updatedAt: row['updatedAt'] as string
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
    let lastError: PostgrestErrorBody = { message: 'Unknown error' };
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS; attempt++) {
      const { data, error, status } = await operation();

      if (!error) {
        this.rxdb.reachability.report(null);
        return validate(data);
      }

      // 整个错误体留着而不是只留 message：code / details / hint 是推送方分类拒绝原因的输入（US-218 FR-016）
      const message = error.message || 'Unknown error';
      lastError = { ...error, message };
      lastStatus = status;

      if (!isRetryableSupabaseWriteError(message, error.code) || attempt === RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS) {
        break;
      }

      await wait(RETRYABLE_SUPABASE_WRITE_RETRY_DELAY_MS * attempt);
    }

    // 重试耗尽后才分类：传输失败重试到最后仍是传输失败，调用方（US-212 的重试策略、
    // QueryCache 的 offlineFallback）需要认得出它，不能被包成看起来像远端拒绝的 DATA_ERROR。
    // 上报同样只在这里：中途那几次可重试的失败是「还没有结论」，逐次上报会让可达性
    // 在一次写入里反复翻转，面板跟着抖。
    throw settle_postgrest_failure(
      this.rxdb.reachability,
      { error: lastError, status: lastStatus },
      `Failed to ${operationName}`
    );
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
          const {
            data: upsertedData,
            error,
            status
          } = await client
            .from(metadata.tableName)
            .upsert(data as Record<string, unknown>[])
            .select();

          return { data: upsertedData, error, status };
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
      const primaryKeyColumn = metadata.propertyMap.get('id')?.columnName ?? 'id';

      const deletedIds = new Set<string>();
      for (const chunk of chunk_values(ids)) {
        const deletedRows = await this.executeRetryableWrite(
          'delete',
          async () => {
            const { data, error, status } = await client
              .from(metadata.tableName)
              .delete()
              .in(primaryKeyColumn, chunk)
              .select(primaryKeyColumn);
            return { data, error, status };
          },
          value => validateArrayResponse<Record<string, unknown>>(value, 'delete')
        );
        for (const row of deletedRows) deletedIds.add(String(row[primaryKeyColumn]));
      }
      const missingIds = [...new Set(ids.map(id => String(id)))].filter(id => !deletedIds.has(id));
      if (missingIds.length > 0) {
        throw new SupabaseDataError(`Failed to delete: no row returned for id(s): ${missingIds.join(', ')}`);
      }

      results.push(...entities);
    }

    return results;
  }

  /** 延迟外键换成 `rxdb_mutations` 的 `p_deferred_columns`：表取实体的表名，列即属性名 */
  #deferredColumns(options: RemoteMergeOptions | undefined): { schema: string; table: string; column: string }[] {
    return (options?.deferredForeignKeys ?? []).map(key => {
      const metadata = this.rxdb.schemaManager.getEntityMetadata(key.entity, key.namespace);
      if (!metadata) {
        throw new SupabaseConfigError(
          `Deferred foreign key references an unregistered entity: ${key.namespace}.${key.entity}`
        );
      }
      return { schema: metadata.namespace, table: metadata.tableName, column: key.property };
    });
  }

  #requireSupabaseScope(): string {
    if (this.#supabaseScope) return this.#supabaseScope;
    throw new SupabaseConfigError(
      'The supplied Supabase client does not expose its project URL. Pass supabaseUrl when configuring the adapter.'
    );
  }

  #identityFromSubject(subject: string): RxDBIdentity {
    return { scope: this.#requireSupabaseScope(), subject };
  }

  #assertConfiguredEntitiesSupported(): void {
    for (const EntityType of this.rxdb.config.entities) {
      this.#assertEntitySupported(EntityType);
    }
  }

  #assertEntitySupported(EntityType: EntityType): void {
    const metadata = getEntityMetadata(EntityType);
    const sync = getSyncConfig(metadata, this.rxdb.entitySync);
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

    const options = getRlsCheckOptions(this.options.rlsCheck);
    const tables = resolveRlsCheckTables(options.tables, this.rxdb.config.entities, this.rxdb.entitySync);
    if (tables.length === 0) {
      this.#rlsCheckDone = true;
      return;
    }

    const response = await Promise.resolve(
      this.#client.rpc(options.rpcName, {
        p_tables: tables
      })
    ).catch((error: unknown) => {
      handleRlsCheckFailure(formatRlsUnexpectedError(error), options.failureMode);
      return null;
    });
    if (!response) {
      return;
    }

    const { data, error } = response;
    if (error) {
      handleRlsCheckFailure(formatRlsRpcError(options.rpcName, error.message), options.failureMode);
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
      return result?.exists !== true || (result.rlsEnabled !== true && result.relationKind !== 'view');
    });
    if (missingOrDisabled.length > 0) {
      handleRlsCheckFailure(
        `[RxDB Supabase] RLS is disabled for tables: ${label(missingOrDisabled)}. Fix the policies before exposing this adapter to untrusted clients.`,
        options.failureMode
      );
    }
    this.#rlsCheckDone = true;
  }

  /**
   * 订阅变更通知的私有频道（US-225）。
   *
   * @remarks
   * 通知由参考 SQL 在日志落库后广播，只带元数据；未分区旧日志进入统一私有频道，分区日志进入带 bucket 的
   * 私有频道。Realtime 加入频道时按 `realtime.messages` 的 RLS 策略以当前登录身份放行，anon 订阅会被拒。
   *
   * 订阅前先 `realtime.setAuth()`：Realtime 客户端取令牌是异步的，不等它就加入频道，带上的是 apikey
   * （anon 的令牌），私有频道一律拒绝。不传参时用客户端的 `accessToken` 回调或当前会话的令牌；
   * 没有会话时 supabase-js 交出的就是 apikey 本身。
   *
   * caller buckets 查询失败时只保留未分区旧日志频道。这样不会越权，拉取仍以 RPC 为准，后续重连会再次尝试
   * 获取分区频道。令牌不属于已登录身份时不订阅，返回 `null`。
   *
   * @returns 订阅中的频道；未登录时为 `null`
   */
  async #createRealtimeChannels(): Promise<RealtimeChannel[] | null> {
    await this.#client.realtime.setAuth();
    const accessToken = this.#client.realtime.accessTokenValue;
    this.#realtimeIdentityKey = this.#identityKeyForToken(accessToken);
    // 访客（anon）是正式支持的身份（epic-015 公开数据给 anon），不是配置错误：给 info 提示，不报 warning
    if (!canReceiveChangeNotifications(accessToken)) {
      console.info(
        '[RxDB Supabase] Change notifications need a signed-in session; skipping the realtime subscription. ' +
          "Call rxdb.connect('supabase') again after sign-in to receive them."
      );
      return null;
    }
    if (realtimeSubjectOf(accessToken) === undefined) {
      console.warn(
        '[RxDB Supabase] Cannot tell who the session token belongs to (a signed-in role without "sub"); ' +
          'skipping the realtime subscription.'
      );
      return null;
    }

    const topics = [RXDB_CHANGES_TOPIC];
    try {
      const buckets = await this.getCallerBuckets();
      topics.push(...buckets.map(rxdbChangesTopicForBucket));
    } catch (error) {
      // 频道通知只是拉取提示，权限与正文始终由拉取 RPC 决定；收不到分区通知要让人看得见
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[RxDB Supabase] Failed to resolve caller buckets; bucket change notifications stay off until the next realtime reconnect: ${message}.`
      );
    }

    const generation = this.#realtimeGeneration;
    return [...new Set(topics)].map(topic => {
      const channel = this.#client
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: RXDB_CHANGES_EVENT }, message => {
          if (generation !== this.#realtimeGeneration || !this.#channels.includes(channel)) return;
          handleSupabaseChanges(this, message['payload']);
        });

      channel.subscribe((status, err) => {
        void this.#enqueueRealtime(async () => {
          if (
            generation !== this.#realtimeGeneration ||
            !this.#channels.includes(channel) ||
            this.#realtimeState === 'closed'
          )
            return;

          if (status === 'SUBSCRIBED') {
            this.#realtimeState = 'connected';
            this.#reconnectAttempt = 0;
            this.#refreshPullableCount();
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
    });
  }

  #scheduleRealtimeReconnect(channel: RealtimeChannel, status: string, reason?: string): void {
    if (
      this.#realtimeState === 'closed' ||
      this.#realtimeState === 'idle' ||
      this.#reconnectTimer ||
      !this.#channels.includes(channel)
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
      void this.#enqueueRealtime(() => this.#reconnectRealtimeChannels()).catch(error => {
        console.error('[RxDB Supabase] Realtime reconnect failed:', error);
      });
    }, delay);
  }

  async #reconnectRealtimeChannels(): Promise<void> {
    if (this.#realtimeState === 'closed' || this.#channels.length === 0) {
      return;
    }

    this.#realtimeState = 'reconnecting';
    this.#realtimeGeneration += 1;
    await this.#removeRealtimeChannels();

    this.#realtimeState = 'connecting';
    this.#channels = (await this.#createRealtimeChannels()) ?? [];
    // 重连途中退出了登录：不再订阅，也就不再重试
    if (this.#channels.length === 0) this.#realtimeState = 'idle';
  }

  /**
   * 请求重算待拉数
   *
   * @remarks
   * 断线期间远端攒下的变更本地一条都没听见，重新订阅只保证「从现在起听得见」、不补历史，
   * 所以订阅一恢复就得回头按各仓库的水位线重数一遍。
   *
   * 走 `syncState` 的跳板而不是直接调 `rxdb.syncManager.refreshPullableCount()`：
   * 重数那段逻辑自 US-025 阶段 D 起住在 `@aiao/rxdb-plugin-sync` 里，本适配器不认识它。
   * 宿主没装那个插件时请求发进空里 —— 待拉数本就无人维护，这正是该有的行为。
   * 即发即忘，错误处理归执行者自己（见插件的 `sync:pullableRefresh`）。
   */
  #refreshPullableCount(): void {
    this.rxdb.syncState.requestPullableRefresh();
  }

  #enqueueRealtime(operation: () => Promise<void>): Promise<void> {
    const result = this.#realtimeQueue.then(operation);
    this.#realtimeQueue = result.catch(() => undefined);
    return result;
  }

  #installAuthStateListener(): void {
    if (this.#authStateSubscription) return;
    let auth: SupabaseClient['auth'];
    try {
      auth = this.#client.auth;
    } catch {
      return;
    }
    let onAuthStateChange: AuthStateChangeListener;
    try {
      if (!auth) return;
      onAuthStateChange = auth.onAuthStateChange as AuthStateChangeListener;
    } catch {
      return;
    }

    try {
      const { data } = onAuthStateChange.call(auth, (event, session) => {
        // INITIAL_SESSION 是订阅后补报的当前会话，不是变化：频道由 connect() 按当时的令牌建。
        // 它赶在首次 connect() 建频道之前到达时，曾被当成「身份变了」再建一遍
        if (event === 'INITIAL_SESSION') return;
        const changed = this.#updateRealtimeIdentity(session?.access_token ?? null);
        if (!changed) return;
        void this.#enqueueRealtime(() => this.#rotateRealtimeChannels()).catch(error => {
          console.error('[RxDB Supabase] Realtime identity rotation failed:', error);
        });
      });
      this.#authStateSubscription = data.subscription;
    } catch {
      this.#authStateSubscription = null;
    }
  }

  #updateRealtimeIdentity(accessToken: string | null): boolean {
    const next = this.#identityKeyForToken(accessToken);
    if (next === this.#realtimeIdentityKey) return false;
    this.#realtimeIdentityKey = next;
    this.#realtimeGeneration += 1;
    return true;
  }

  /**
   * 订阅中的频道属于别的身份时按新令牌重建。没有订阅时不动：未登录或已断开，由下一次 `connect()` 按当时的令牌建。
   */
  #followRealtimeIdentity(accessToken: string | null): void {
    if (this.#channels.length === 0 || !this.#updateRealtimeIdentity(accessToken)) return;
    void this.#enqueueRealtime(() => this.#rotateRealtimeChannels()).catch(error => {
      console.error('[RxDB Supabase] Realtime identity rotation failed:', error);
    });
  }

  /**
   * 令牌对应的 Realtime 身份键。读不出是谁的令牌（声称已登录却没有 `sub`）记为 `null`，订阅时据此跳过；
   * 不在 auth 事件回调里抛错，否则频道停在旧身份上、再也不轮换。同步照旧由 `callerIdentity()` 对它报错。
   */
  #identityKeyForToken(accessToken: string | null): string {
    const scope = this.#supabaseScope ?? '';
    return JSON.stringify([scope, realtimeSubjectOf(accessToken) ?? null]);
  }

  async #rotateRealtimeChannels(): Promise<void> {
    this.#clearReconnectTimer();
    await this.#removeRealtimeChannels();
    if (this.#realtimeState === 'closed') return;
    this.#reconnectAttempt = 0;
    this.#realtimeState = 'connecting';
    this.#channels = (await this.#createRealtimeChannels()) ?? [];
    if (this.#channels.length === 0) this.#realtimeState = 'idle';
  }

  async #removeRealtimeChannels(): Promise<void> {
    const channels = this.#channels;
    this.#channels = [];
    for (const channel of channels) {
      try {
        await this.#client.removeChannel(channel);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[RxDB Supabase] Failed to remove realtime channel: ${message}.`);
      }
    }
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
    const EntityType = this.rxdb.schemaManager.getEntityType(scope.entity, scope.namespace);
    const metadata = EntityType ? getEntityMetadata(EntityType) : undefined;
    const primaryKeyColumn = metadata?.propertyMap.get('id')?.columnName ?? 'id';

    for (const chunk of chunk_values(ids, SUPABASE_IN_CHUNK_SIZE)) {
      const { data, error, status } = await this.#client
        .schema(scope.schema)
        .from(scope.tableName)
        .select('*')
        .in(primaryKeyColumn, chunk);

      assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to find by ids');

      const batch = (data ?? []) as Record<string, unknown>[];
      // 自定义主键列只改名回 `id`：行保持 wire 形态交给本地 upsertMany 按元数据解码，
      // 不经 transform_row_to_entity 实例化；物理键必须删掉，它与 `id` 是同一列的两种写法，本地会拒收
      rows.push(
        ...(primaryKeyColumn === 'id' ?
          (batch as T[])
        : batch.map(({ [primaryKeyColumn]: id, ...rest }) => ({ ...rest, id }) as T))
      );
    }

    return rows;
  }
}

/** 令牌代表的调用者；声称已登录却没有 `sub`、读不出是谁时为 `undefined`（不猜） */
/** `rxdb_entity_history()` 返回的一行，日期还是字符串 */
type EntityHistoryRow = Omit<SupabaseEntityHistoryItem, 'createdAt'> & { createdAt: string };

const HISTORY_TYPES: readonly unknown[] = ['INSERT', 'UPDATE', 'DELETE'];
const HISTORY_SOURCES: readonly unknown[] = ['trigger', 'push', 'cascade'];

const isNullableBody = (value: unknown): boolean =>
  value === null || (typeof value === 'object' && !Array.isArray(value));

const isNullableOf = (value: unknown, type: 'string' | 'number'): boolean => value === null || typeof value === type;

/** 远端交回的一行历史形状对不对：交给调用方之前逐字段核对，坏数据整批拒绝 */
function isEntityHistoryRow(value: unknown): value is EntityHistoryRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'number' &&
    isNullableOf(row['changeId'], 'number') &&
    typeof row['namespace'] === 'string' &&
    typeof row['entity'] === 'string' &&
    typeof row['entityId'] === 'string' &&
    isNullableOf(row['bucket'], 'string') &&
    HISTORY_TYPES.includes(row['type']) &&
    ['patch', 'inversePatch', 'beforeData', 'afterData'].every(key => isNullableBody(row[key])) &&
    isNullableOf(row['actor'], 'string') &&
    isNullableOf(row['role'], 'string') &&
    HISTORY_SOURCES.includes(row['source']) &&
    isNullableOf(row['clientId'], 'string') &&
    isNullableOf(row['localId'], 'number') &&
    typeof row['branchId'] === 'string' &&
    typeof row['createdAt'] === 'string'
  );
}

function realtimeSubjectOf(accessToken: string | null): string | undefined {
  try {
    return identityOfAccessToken(accessToken);
  } catch (error) {
    if (error instanceof SupabaseConfigError) return undefined;
    throw error;
  }
}

/**
 * 身份的 scope：请求实际发往的项目。客户端自己报得出 URL 就以它为准；报不出时用配置的 `supabaseUrl`。
 * 两个都有却指向不同项目时拒绝，不猜：按配置的算，身份就会落在请求根本没去的那个项目上。
 */
function resolveSupabaseScope(configuredUrl: string | undefined, client: SupabaseClient): string | null {
  const runtimeUrl = (client as unknown as { supabaseUrl?: unknown }).supabaseUrl;
  const runtime = typeof runtimeUrl === 'string' && runtimeUrl.trim() ? normalizeSupabaseScope(runtimeUrl) : null;
  const configured = configuredUrl?.trim() ? normalizeSupabaseScope(configuredUrl) : null;
  if (runtime !== null && configured !== null && runtime !== configured) {
    throw new SupabaseConfigError(
      `supabaseUrl (${configured}) does not match the project URL of the supplied client (${runtime}).`
    );
  }
  return runtime ?? configured;
}

function normalizeSupabaseScope(value: string): string {
  try {
    return new URL(value.trim()).origin;
  } catch {
    throw new SupabaseConfigError(`Invalid Supabase project URL: ${value}`);
  }
}
