/**
 * @packageDocumentation
 * 主适配器选择器 —— 「这个实体的写入该落到哪一侧」的**唯一**判定点。
 *
 * @remarks
 * 这条规则原本有两份实现，且互不相同：
 * - 单条 `save()` 走 {@link Repository} 的 `primary$`，判据是 `!local && !!remote → remote`，
 *   并且用的是**实体自己的** `sync`（`metadata.sync || rxdb.config.sync`）；
 * - 批量 `saveMany()/removeMany()/mutations()` 硬等 `rxdb.localAdapter$`，只看数据库级配置。
 *
 * 于是 remote-only 配置下批量入口挂死在一条永不发射的流上，而 per-entity 声明 remote-only 的
 * 实体更会出现「单条写远端、批量写本地」这种同一份数据分裂到两个库的情况。
 *
 * 判定逻辑只在这里写一次，`Repository` 与 `EntityManager` 都从这里取。
 */
import type { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError, RxDBMixedVersionedCacheTransactionError } from '../RxDBError.js';
import type { EntityType } from './entity.interface.js';
import { type SyncOptions, SyncType } from './metadata-options.interface.js';

/** 写入落到哪一侧适配器 */
export type PrimaryAdapterKind = 'local' | 'remote';

/** 主适配器：哪一侧，以及那一侧配置的适配器名 */
export interface PrimaryAdapterSelection {
  kind: PrimaryAdapterKind;
  adapter: string;
}

/**
 * 判定主适配器落在哪一侧。
 *
 * @param sync - 生效的同步配置（实体级优先于数据库级）
 * @returns `'remote'` 仅当只配了 remote；其余一律 `'local'`
 *
 * @remarks
 * 两端都没配时返回 `'local'` 而不是抛错：这个函数只回答「主端是哪一侧」。
 * 「那一侧到底有没有适配器」是 {@link selectPrimaryAdapter} 的职责——
 * 两个问题分开，`Repository` 才能在构造期就选好流而不必处理配置错误。
 */
export function selectPrimaryAdapterKind(sync: SyncOptions | undefined): PrimaryAdapterKind {
  return !sync?.local && !!sync?.remote ? 'remote' : 'local';
}

/**
 * 解析主适配器，含适配器名。
 *
 * @param sync - 生效的同步配置
 * @returns 主端及适配器名；主端没有配置适配器时返回 `null`
 */
export function selectPrimaryAdapter(sync: SyncOptions | undefined): PrimaryAdapterSelection | null {
  const kind = selectPrimaryAdapterKind(sync);
  const adapter = kind === 'remote' ? sync?.remote?.adapter : sync?.local?.adapter;
  return adapter ? { kind, adapter } : null;
}

/**
 * 取实体生效的同步配置：实体元数据优先于数据库级配置。
 *
 * @param EntityType - 实体类
 * @param databaseSync - 数据库级 `rxdb.config.sync`
 */
export function getEntitySync(EntityType: EntityType, databaseSync: SyncOptions | undefined): SyncOptions | undefined {
  return getEntityMetadata(EntityType).sync ?? databaseSync;
}

/**
 * 收集一次批量修改里出现的所有实体类型（去重）。
 *
 * @param options - 批量修改选项
 */
export function collectMutationEntityTypes(options: RxDBMutationsMap): EntityType[] {
  const types = new Set<EntityType>();
  for (const bucket of [options.create, options.update, options.remove]) {
    for (const EntityType of bucket.keys()) types.add(EntityType as EntityType);
  }
  return [...types];
}

/**
 * 为一整批实体解析共同的主适配器。
 *
 * @param EntityTypes - 本批涉及的实体类型
 * @param databaseSync - 数据库级同步配置
 * @returns 全批共用的主适配器；空批返回 `null`
 * @throws {@link RxDBMixedPrimaryAdapterError} 批内实体的主适配器不一致
 * @throws {@link RxDBMissingPrimaryAdapterError} 主端没有配置适配器
 *
 * @remarks
 * 一次 `mutations()` 是一个原子事务，跨适配器无法保证原子性。主端不一致时拆成两次写入
 * 会把「要么全成要么全败」降级成「可能写了一半」——所以这里拒绝，让调用方自己分批。
 */
export function resolveBatchPrimaryAdapter(
  EntityTypes: readonly EntityType[],
  databaseSync: SyncOptions | undefined
): PrimaryAdapterSelection | null {
  if (EntityTypes.length === 0) return null;

  const selections = EntityTypes.map(EntityType => ({
    EntityType,
    selection: selectPrimaryAdapter(getEntitySync(EntityType, databaseSync)),
    kind: selectPrimaryAdapterKind(getEntitySync(EntityType, databaseSync))
  }));

  const kinds = new Set(selections.map(entry => entry.kind));
  if (kinds.size > 1) {
    throw new RxDBMixedPrimaryAdapterError(
      selections.map(entry => ({ entity: entityLabel(entry.EntityType), kind: entry.kind }))
    );
  }

  const resolved = selections.find(entry => entry.selection !== null)?.selection;
  if (!resolved) {
    throw new RxDBMissingPrimaryAdapterError([...kinds][0], EntityTypes.map(entityLabel));
  }
  return resolved;
}

/**
 * 判定一批修改是否走 QueryCache 的写路径。
 *
 * @param EntityTypes - 本批涉及的实体类型
 * @param databaseSync - 数据库级同步配置
 * @returns `true` 表示整批都是 QueryCache 实体，须走 remote-then-local
 * @throws {@link RxDBMixedVersionedCacheTransactionError} 批内混有 QueryCache 与非 QueryCache 实体
 *
 * @remarks
 * QueryCache 的写不是「落到哪一侧」的问题，因此它不进 {@link selectPrimaryAdapterKind}——
 * 那个枚举仍然只有 local / remote 两种，适配器模型没变（US-020 D3）。
 * 这里回答的是另一个问题：这批该交给 `adapter.mutations()`，还是交给
 * `QueryCacheRepository` 的 remote-then-local。
 *
 * 混批一律拒绝而不是拆开各写各的：版本化实体写本地并进 changelog，QueryCache 实体先写远端再落
 * 可丢弃缓存，拆开执行只会得到「一半进了变更历史、一半没有」。
 *
 * 调用点须先跑 {@link resolveBatchPrimaryAdapter}：那样「QueryCache + remote-only」报的是更准确的
 * {@link RxDBMixedPrimaryAdapterError}，而不是被这里当成「版本化实体」。
 */
export function isQueryCacheBatch(EntityTypes: readonly EntityType[], databaseSync: SyncOptions | undefined): boolean {
  const cacheEntities: string[] = [];
  const versionedEntities: string[] = [];
  for (const EntityType of EntityTypes) {
    const isCache = getEntitySync(EntityType, databaseSync)?.type === SyncType.QueryCache;
    (isCache ? cacheEntities : versionedEntities).push(entityLabel(EntityType));
  }
  if (cacheEntities.length > 0 && versionedEntities.length > 0) {
    throw new RxDBMixedVersionedCacheTransactionError(cacheEntities, versionedEntities);
  }
  return cacheEntities.length > 0;
}

/**
 * 错误消息里的实体标识。
 *
 * @remarks
 * 用元数据里的 `name` 而不是 `EntityType.name`：装饰器包装过的类在打包压缩后
 * 构造函数名会被改掉甚至清空，元数据名才是稳定可读的那个。
 */
const entityLabel = (EntityType: EntityType): string => getEntityMetadata(EntityType).name;

/** 参与主适配器判定的一条实体记录（错误消息用） */
export interface PrimaryAdapterAssignment {
  entity: string;
  kind: PrimaryAdapterKind;
}

/**
 * 一次批量修改里的实体分属不同主适配器。
 *
 * @remarks
 * 只能由调用方决定怎么拆——按主端分批各自写，或改配置让它们落到同一侧。
 */
export class RxDBMixedPrimaryAdapterError extends RxDBError {
  constructor(readonly assignments: readonly PrimaryAdapterAssignment[]) {
    super(
      `Batch mutations must target a single primary adapter, but this batch mixes them: ` +
        `${assignments.map(entry => `${entry.entity}→${entry.kind}`).join(', ')}. ` +
        `Split the batch by primary adapter, or align the entities' sync configuration.`
    );
    this.name = 'RxDBMixedPrimaryAdapterError';
    Object.setPrototypeOf(this, RxDBMixedPrimaryAdapterError.prototype);
  }
}

/**
 * 主端没有配置适配器。
 *
 * @remarks
 * 这条错误替代的是「永远不 settle 的 Promise」：主端的适配器流永不发射时，
 * `firstValueFrom` 会静默挂起，调用方既没有结果也没有错误可查。
 */
export class RxDBMissingPrimaryAdapterError extends RxDBError {
  constructor(
    readonly kind: PrimaryAdapterKind,
    readonly entityNames: readonly string[]
  ) {
    super(
      `No ${kind} adapter is configured for ${entityNames.join(', ') || 'this batch'}; ` +
        `configure \`sync.${kind}.adapter\` (on the entity or on RxDB) before writing.`
    );
    this.name = 'RxDBMissingPrimaryAdapterError';
    Object.setPrototypeOf(this, RxDBMissingPrimaryAdapterError.prototype);
  }
}
