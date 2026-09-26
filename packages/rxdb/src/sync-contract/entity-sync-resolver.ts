import type { EntityType } from '../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RepositorySyncType } from './sync-type-utils.js';

/**
 * 解析目标：实体类或它的元数据。
 *
 * @remarks
 * 两种形态都收：调用点手上有什么就传什么。同步插件多半只握着元数据（从 schema 管理器
 * 取出来的），而仓储、批量写入握着的是实体类。按元数据**对象身份**命中，不按名字 ——
 * 不同 namespace 的同名实体是两个目标（US-026）。
 */
export type EntitySyncTarget = EntityType | EntityMetadata;

/**
 * 实体生效同步配置的**唯一**解析入口。
 *
 * @remarks
 * 优先级固定为：**实例对该实体的显式覆盖 > 实体装饰器的 `sync` > 数据库默认 `sync`**，
 * 且只写在 {@link createEntitySyncResolver} 一处。核心与插件的每个同步消费者（主适配器选择、
 * 元数据校验、仓储构造、批量写路由、推拉调度、同步状态）都经它取值 —— 各自回读
 * `metadata.sync` 的那一刻，同一个实体就会在不同子系统里归属两种策略。
 *
 * 每个 RxDB 实例持有自己的一份（{@link RxDB.entitySync}），覆盖只对该实例生效。
 */
export interface EntitySyncResolver {
  /** 数据库级默认 `sync`（`rxdb.config.sync`） */
  readonly databaseSync: SyncOptions | undefined;

  /**
   * 解析目标实体的生效同步配置。
   *
   * @param target - 实体类或实体元数据
   * @returns 生效配置；实体与数据库都没有配置时为 `undefined`
   */
  resolve(target: EntitySyncTarget): SyncOptions | undefined;

  /**
   * 解析目标实体的生效同步类型。
   *
   * @param target - 实体类或实体元数据
   * @returns 同步类型，判定口径与 {@link getSyncType} 相同
   *
   * @remarks
   * 只有「继承数据库默认配置」时才适用 `None + local + remote ⇒ full` 那条特例；
   * 覆盖与装饰器一样是**显式**声明，按字面判定。
   */
  resolveType(target: EntitySyncTarget): RepositorySyncType;
}

const metadataOf = (target: EntitySyncTarget): EntityMetadata =>
  typeof target === 'function' ? getEntityMetadata(target) : target;

/**
 * 构造实体同步配置解析器。
 *
 * @param databaseSync - 数据库级默认 `sync`
 * @param overrides - 实例级覆盖，按实体元数据身份索引；省略即没有覆盖
 * @returns 解析器
 *
 * @example
 * ```ts
 * const resolver = createEntitySyncResolver(rxdb.config.sync);
 * resolver.resolveType(Todo); // 'full'
 * ```
 */
export function createEntitySyncResolver(
  databaseSync: SyncOptions | undefined,
  overrides: ReadonlyMap<EntityMetadata, SyncOptions> = new Map()
): EntitySyncResolver {
  return {
    databaseSync,
    resolve: target => {
      const metadata = metadataOf(target);
      return overrides.get(metadata) ?? metadata.sync ?? databaseSync;
    },
    resolveType: target => {
      const metadata = metadataOf(target);
      const explicit = overrides.get(metadata) ?? metadata.sync;
      return explicit ? syncTypeOf(explicit, false) : syncTypeOf(databaseSync, true);
    }
  };
}

/**
 * 判定入参是不是解析器（而不是一份数据库级 `SyncOptions`）。
 *
 * @param source - 解析器或数据库级配置
 */
export function isEntitySyncResolver(source: SyncOptions | EntitySyncResolver | undefined): source is EntitySyncResolver {
  return typeof source === 'object' && source !== null && 'resolveType' in source;
}

/**
 * 把历史签名里的 `databaseSync` 参数归一成解析器。
 *
 * @param source - 解析器，或旧调用点传入的数据库级 `sync`
 * @returns 解析器；传入的是 `SyncOptions` 时构造一个没有实例覆盖的解析器
 *
 * @remarks
 * 公开函数（`validateEntityMetadata`、`buildPushableRepositoryRules` 等）原来收
 * `databaseSync: SyncOptions`。参数类型放宽成两者之一，旧调用照常编译、行为逐字不变；
 * 新调用传 `rxdb.entitySync` 就用上实例覆盖。
 */
export function toEntitySyncResolver(source: SyncOptions | EntitySyncResolver | undefined): EntitySyncResolver {
  return isEntitySyncResolver(source) ? source : createEntitySyncResolver(source);
}

/**
 * 把一份已经选定的同步配置判成同步类型。
 *
 * @param sync - 生效配置
 * @param inherited - 这份配置是不是从数据库默认值继承来的
 * @returns 同步类型
 *
 * @remarks
 * `inherited` 是 {@link getSyncType} 与实例级覆盖解析器（`createEntitySyncResolver`）
 * 共用判定时唯一需要多知道的一位：`None + local + remote` 只在**继承**时算 `full`。
 *
 * @internal
 */
export function syncTypeOf(sync: SyncOptions | undefined, inherited: boolean): RepositorySyncType {
  // 如果没有任何 sync 配置，默认为 none
  if (!sync) {
    return 'none';
  }

  // SyncFilter: 条件同步（只同步满足 filter 条件的数据子集）
  if (sync.type === SyncType.Filter) {
    return 'filter';
  }

  // QueryCache: 查询缓存同步（按需拉取并缓存远程数据）
  if (sync.type === SyncType.QueryCache) {
    return 'querycache';
  }

  // Full sync: 双向同步
  if (sync.type === SyncType.Full) {
    return 'full';
  }

  // SyncType.None: 根据 local/remote 配置判断
  if (sync.type === SyncType.None) {
    return noneSyncTypeOf(!!sync.local, !!sync.remote, inherited);
  }

  // 默认为 none（不应该到达这里）
  return 'none';
}

/** `SyncType.None` 按两侧有无判定；拆出来是为了守住嵌套 ≤ 3 层 */
function noneSyncTypeOf(hasLocal: boolean, hasRemote: boolean, inherited: boolean): RepositorySyncType {
  // 特殊情况：实体继承全局配置时，如果全局有 local + remote，默认使用 full 同步
  // 这允许全局配置 `type: SyncType.None` 作为"让实体自己决定"的语义
  if (inherited && hasLocal && hasRemote) return 'full';
  // 两者都有但 type = None，意味着不同步（系统表）
  if (hasLocal && hasRemote) return 'none';
  // 只有 remote: 只读远程数据
  if (hasRemote) return 'remote';
  // 只有 local: 只在本地；两者都没有: 不同步
  return hasLocal ? 'local' : 'none';
}
