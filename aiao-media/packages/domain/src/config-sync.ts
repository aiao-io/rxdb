import {
  SyncType,
  isSystemEntity,
  tryGetEntityMetadata,
  type EntitySyncOverride,
  type EntityType,
  type MigrationType,
  type SyncOptions
} from '@aiao/rxdb';
import {
  MEDIA_TEMPLATE_PUBLICATION_FIELDS,
  MediaConfigCommit,
  MediaConfigCommitChange,
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy
} from './media-config.js';

/**
 * 受工作树版本控制、经变更日志双向同步的配置实体。
 *
 * @remarks
 * 只有这三类的编辑会进入 `workingTree.commit()` 并生成领域提交投影。
 */
export const MEDIA_CONFIG_VERSIONED_ENTITIES: readonly EntityType[] = Object.freeze([
  MediaPromptTemplate,
  MediaProviderPolicy,
  MediaPlatformModel
]);

/** 领域提交投影：服务端推进状态，按查询缓存读写，不进工作树。 */
const MEDIA_CONFIG_PROJECTION_ENTITIES: readonly EntityType[] = Object.freeze([
  MediaConfigCommit,
  MediaConfigCommitChange
]);

/**
 * 配置同步白名单：配置实体与领域提交投影。
 *
 * @remarks
 * RxDB 内部系统实体（含工作树的 `Commit` / `CommitChangeSet` / `WorkingTreeEntry`）不属于普通同步契约，
 * 永远不在这里；完整提交图需要单独的兼容协议（FR-017）。顺序即推送依赖顺序：提交先于变更。
 */
export const MEDIA_CONFIG_SYNC_ENTITIES: readonly EntityType[] = Object.freeze([
  ...MEDIA_CONFIG_VERSIONED_ENTITIES,
  ...MEDIA_CONFIG_PROJECTION_ENTITIES
]);

/** 配置同步两侧使用的已注册适配器名。 */
export interface MediaConfigSyncAdapters {
  /** 本地适配器，例如 Admin 的 `sqlite-wasm` 或后台节点的 `pglite`。 */
  readonly local: string;
  /** 远端适配器，固定为普通 JWT 访问的 Supabase。 */
  readonly remote: string;
}

/** {@link createMediaConfigSyncOptions} 的输入。 */
export interface MediaConfigSyncPlanOptions {
  /** 当前账号的工作区；每个实体的远端拉取都按它过滤。 */
  readonly workspaceId: string;
  /** 两侧适配器名，必须已在库级 `sync` 注册。 */
  readonly adapters: MediaConfigSyncAdapters;
  /** 要同步的实体，默认全部白名单；只能收窄，不能扩大。 */
  readonly entities?: readonly EntityType[];
}

/** 交给 `new RxDB({ sync, syncOverrides })` 的同步计划。 */
export interface MediaConfigSyncPlan {
  /** 库级默认：注册两侧适配器；系统实体由同步插件自行排除。 */
  readonly sync: SyncOptions;
  /** 配置实体各一条按工作区过滤的覆盖；投影实体各一条查询缓存覆盖。 */
  readonly syncOverrides: readonly EntitySyncOverride[];
}

const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function entityIdentity(entity: EntityType): string {
  const metadata = tryGetEntityMetadata(entity);
  if (!metadata) throw new Error(`${entity.name || '匿名类'} 不是 RxDB 实体，不能进入配置同步。`);
  return `${metadata.namespace}:${metadata.name}`;
}

const ALLOWED_IDENTITIES: ReadonlySet<string> = new Set(MEDIA_CONFIG_SYNC_ENTITIES.map(entityIdentity));

/**
 * 校验一组实体可以进入配置同步。
 *
 * @param entities - 待同步实体
 * @throws Error 含 RxDB 系统实体、白名单之外的实体、非实体类或重复项时
 *
 * @remarks
 * 先判系统实体再判白名单：同一个类既是系统表又不在白名单时，错误信息指向更具体的原因。
 * 白名单按 `namespace:name` 比对，与核心的系统表判定同一口径，避免混合解析下类引用不相等。
 */
export function assertMediaConfigSyncEntities(entities: readonly EntityType[]): void {
  const seen = new Set<string>();
  for (const entity of entities) {
    const identity = entityIdentity(entity);
    if (isSystemEntity(entity)) throw new Error(`RxDB 系统实体 ${identity} 不能进入配置同步。`);
    if (!ALLOWED_IDENTITIES.has(identity)) throw new Error(`实体 ${identity} 不在配置同步范围内。`);
    if (seen.has(identity)) throw new Error(`实体 ${identity} 在配置同步中重复出现。`);
    seen.add(identity);
  }
}

function adapterName(value: string, side: 'local' | 'remote'): string {
  const name = value.trim();
  if (!name) throw new Error(`配置同步的 ${side} 适配器名不能为空。`);
  return name;
}

/**
 * 生成配置实体与提交投影的同步计划。
 *
 * @param options - 工作区、适配器与可选的实体子集
 * @returns 库级 `sync` 与逐实体的覆盖
 * @throws Error 工作区不是 UUID、适配器名为空或实体不合法时
 *
 * @remarks
 * 配置实体用 `Filter`：编辑先落本地、进工作树，再经变更日志推送；拉取只取本工作区。
 * 投影实体用 `QueryCache`：写入先到远端再落本地，状态由服务端 RPC 推进，查询按远端新鲜度回填。
 * 投影若也走版本化同步，服务端写回的状态会以 `remote_sync` 进工作树，被下一次提交误当成配置变更。
 *
 * @example
 * ```ts
 * const plan = createMediaConfigSyncOptions({ workspaceId, adapters: { local: 'pglite', remote: 'supabase' } });
 * const db = new RxDB({ dbName, entities: [...MEDIA_CONFIG_SYNC_ENTITIES], ...plan });
 * ```
 */
export function createMediaConfigSyncOptions(options: MediaConfigSyncPlanOptions): MediaConfigSyncPlan {
  if (!WORKSPACE_ID_PATTERN.test(options.workspaceId)) throw new Error('配置同步的工作区必须是 UUID。');
  const workspaceId = options.workspaceId.toLowerCase();
  const local = adapterName(options.adapters.local, 'local');
  const remote = adapterName(options.adapters.remote, 'remote');
  const entities = options.entities ?? MEDIA_CONFIG_SYNC_ENTITIES;
  assertMediaConfigSyncEntities(entities);
  const filter = () => ({
    combinator: 'and' as const,
    rules: [{ field: 'workspaceId', operator: '=' as const, value: workspaceId }]
  });
  const projection = new Set(MEDIA_CONFIG_PROJECTION_ENTITIES.map(entityIdentity));
  return {
    sync: { type: SyncType.Full, local: { adapter: local }, remote: { adapter: remote } },
    syncOverrides: entities.map(entity => ({
      entity,
      sync:
        projection.has(entityIdentity(entity)) ?
          { type: SyncType.QueryCache, local: { adapter: local }, remote: { adapter: remote } }
        : { type: SyncType.Filter, local: { adapter: local }, remote: { adapter: remote, filter } }
    }))
  };
}

/** 为已打开过的本地配置库补上公开展示字段，保留已有草稿、提交和同步游标。 */
export function templateAttributionMigration(dialect: 'sqlite' | 'postgres'): MigrationType {
  return {
    name: 'media-template-publication-fields',
    async up(executor) {
      const table = executor.tableRef(MediaPromptTemplate);
      if (dialect === 'postgres') {
        for (const field of MEDIA_TEMPLATE_PUBLICATION_FIELDS) {
          await executor.query(`ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS "${field}" text`);
        }
        return;
      }
      const columns = await executor.query(`PRAGMA table_info(${table})`);
      const nameIndex = columns.columns.indexOf('name');
      const names = new Set(columns.rows.map(row => row[nameIndex]));
      if (!names.size) return;
      for (const field of MEDIA_TEMPLATE_PUBLICATION_FIELDS) {
        if (!names.has(field)) await executor.query(`ALTER TABLE ${table} ADD COLUMN "${field}" TEXT`);
      }
    },
    async down() {
      throw new Error('回退将丢失模板署名，请从备份恢复。');
    }
  };
}
