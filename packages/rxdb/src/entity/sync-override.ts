import { RxDBError } from '../RxDBError.js';
import { getEntityMetadata, tryGetEntityMetadata } from '../rxdb-utils.js';
import type { EntityType } from './entity.interface.js';
import { SyncType, type SyncAdapterOptions, type SyncOptions } from './metadata-options.interface.js';
import type { EntityMetadata } from './metadata.interface.js';

/**
 * 实例级实体同步覆盖条目。
 *
 * @remarks
 * `sync` 必须是一份**完整**的 `SyncOptions`：选中后整体替换实体装饰器与数据库默认配置，
 * 不逐字段合并 —— 用 `None + local` 覆盖 `QueryCache + local + remote` 后，生效配置里没有 remote。
 *
 * 目标按实体**类引用**选择，不按名字：不同 namespace 的同名实体是两个目标。
 *
 * @example
 * ```ts
 * new RxDB({
 *   dbName: 'server',
 *   entities: [Recipe],
 *   sync: { type: SyncType.None, local: { adapter: 'pglite' } },
 *   syncOverrides: [{ entity: Recipe, sync: { type: SyncType.None, local: { adapter: 'pglite' } } }]
 * });
 * ```
 */
export interface EntitySyncOverride {
  /** 覆盖目标：`entities` 里注册的业务实体类 */
  readonly entity: EntityType;
  /** 该实例对这个实体使用的完整同步配置 */
  readonly sync: SyncOptions;
}

/**
 * 覆盖条目非法的原因。
 *
 * - `unregistered`：目标不在本实例的 `entities` 里（含自动生成的关系中间实体）
 * - `system-entity`：目标是 RxDB 或插件注入的系统表
 * - `duplicate`：同一实体出现多条覆盖
 * - `invalid-entry`：`syncOverrides` 不是数组、数组里有空位，条目本身不是对象，或 `entity` 不是实体类
 * - `invalid-sync`：`sync` 为 `null`、非对象、缺少或写错 `type`、适配器选项形状不对，
 *   Full / Filter / QueryCache 缺一侧，Filter 的 `remote.filter` 不是函数，或覆盖声明的一侧未在库级注册同名适配器
 */
export type RxDBSyncOverrideErrorReason =
  'unregistered' | 'system-entity' | 'duplicate' | 'invalid-entry' | 'invalid-sync';

/**
 * 实例级同步覆盖配置非法。
 *
 * @remarks
 * 在构造 / 初始化阶段抛出，早于实体绑定与任何数据库写入。按 `reason` 判别，`entity` 指出目标
 * （条目连实体都认不出来时为 `undefined`），`index` 是条目在 `syncOverrides` 里的下标。
 */
export class RxDBSyncOverrideError extends RxDBError {
  /**
   * @param reason - 非法原因
   * @param index - 条目下标
   * @param entity - 目标实体的 `namespace.name`；认不出实体时为 `undefined`
   * @param detail - 补充说明
   */
  constructor(
    readonly reason: RxDBSyncOverrideErrorReason,
    readonly index: number,
    readonly entity: string | undefined,
    detail: string
  ) {
    super(`[RxDB] syncOverrides[${index}]${entity ? `（${entity}）` : ''} 非法 [${reason}]：${detail}`);
    this.name = 'RxDBSyncOverrideError';
    Object.setPrototypeOf(this, RxDBSyncOverrideError.prototype);
  }
}

const SYNC_TYPES: ReadonlySet<unknown> = new Set(Object.values(SyncType));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entityLabel = (metadata: EntityMetadata): string => `${metadata.namespace}.${metadata.name}`;

/** 适配器选项形状：省略合法，出现则必须是带字符串 `adapter` 的对象 */
const isAdapterSideValid = (side: unknown): boolean =>
  side === undefined || (isRecord(side) && typeof side['adapter'] === 'string');

/** 除 `None` 外的策略都跨两侧，判别联合里 local / remote 都是必填 */
const BOTH_SIDES_REQUIRED: ReadonlySet<unknown> = new Set([SyncType.Full, SyncType.Filter, SyncType.QueryCache]);

/**
 * 判别联合的必填约束：TS 只管得住字面量，JS 调用方传进来的对象要在这里补上。
 * 形状已由 {@link describeInvalidSync} 前几条确认，这里只看有没有。
 */
const describeMissingRequired = (sync: Record<string, unknown>): string | undefined => {
  const type = sync['type'];
  if (BOTH_SIDES_REQUIRED.has(type) && (sync['local'] === undefined || sync['remote'] === undefined)) {
    return `SyncType.${String(type)} 必须同时配置 local 与 remote`;
  }
  // 缺 filter 时拉取会退化成不带条件的全量拉取，与「只同步子集」的声明相反。
  // 构造期只能验它是函数；返回值要到拉取时才由 isValidRuleGroup 把关
  if (type === SyncType.Filter && typeof (sync['remote'] as Record<string, unknown>)['filter'] !== 'function') {
    return 'SyncType.Filter 的 remote.filter 必须是函数';
  }
  return undefined;
};

/**
 * 覆盖声明的一侧必须已在库级注册同名适配器；覆盖本身不会创建适配器流。
 */
const describeAdapterMismatch = (
  sync: Record<string, unknown>,
  databaseSync: SyncOptions | undefined
): string | undefined => {
  for (const side of ['local', 'remote'] as const) {
    const declared = (sync[side] as SyncAdapterOptions | undefined)?.adapter;
    if (declared === undefined) continue;
    const registered = databaseSync?.[side]?.adapter;
    if (registered === undefined) return `sync.${side}.adapter 为 '${declared}'，但库级 sync.${side} 未注册适配器`;
    if (declared === registered) continue;
    return `sync.${side}.adapter 为 '${declared}'，但库级 sync.${side} 注册的是 '${registered}'；覆盖不能换适配器`;
  }
  return undefined;
};

/** 返回 `sync` 的问题描述；合法时返回 `undefined` */
const describeInvalidSync = (sync: unknown, databaseSync: SyncOptions | undefined): string | undefined => {
  if (!isRecord(sync)) return `sync 必须是完整的 SyncOptions 对象，收到 ${sync === null ? 'null' : typeof sync}`;
  if (!SYNC_TYPES.has(sync['type'])) return `sync.type 必须是 SyncType 之一，收到 ${String(sync['type'])}`;
  if (!isAdapterSideValid(sync['local'])) return 'sync.local 必须是 { adapter: string }';
  if (!isAdapterSideValid(sync['remote'])) return 'sync.remote 必须是 { adapter: string }';
  return describeMissingRequired(sync) ?? describeAdapterMismatch(sync, databaseSync);
};

/** 读条目里的实体元数据；不是实体类时返回 `undefined` */
const metadataOfEntry = (entry: unknown): EntityMetadata | undefined => {
  if (!isRecord(entry) || typeof entry['entity'] !== 'function') return undefined;
  return tryGetEntityMetadata(entry['entity']);
};

/** 复制一侧适配器选项：纯数据复制并冻结，函数（`filter`）保留原引用且不冻结 */
const cloneSide = (side: SyncAdapterOptions | undefined): SyncAdapterOptions | undefined =>
  side === undefined ? undefined : Object.freeze({ ...side });

/**
 * 形成实例自己的稳定副本。
 *
 * @remarks
 * `SyncOptions` 只有两层（顶层 + local/remote），逐层展开即可。不用 `structuredClone`：
 * Filter 的 `remote.filter` 是函数，克隆不了；也不冻结调用方对象 —— 冻的只是本副本。
 */
const snapshotSync = (sync: SyncOptions): SyncOptions => {
  const copy: Record<string, unknown> = { ...sync };
  if ('local' in sync) copy['local'] = cloneSide(sync.local);
  if ('remote' in sync) copy['remote'] = cloneSide(sync.remote);
  return Object.freeze(copy) as unknown as SyncOptions;
};

/** {@link snapshotSyncOverrides} 的产物：同一份快照的两种形态 */
export interface SyncOverrideSnapshot {
  /** 冻结的条目数组，写回 `rxdb.config.syncOverrides` */
  readonly entries: readonly EntitySyncOverride[];
  /** 按实体元数据索引的生效配置，直接交给 `createEntitySyncResolver` */
  readonly index: ReadonlyMap<EntityMetadata, SyncOptions>;
}

/**
 * 校验并快照实例级同步覆盖。
 *
 * @param overrides - `RxDBOptions.syncOverrides`，可能来自 JS 调用方，形状不可信
 * @param entities - 本实例注册的业务实体（调用方传入的 `entities`）
 * @param isSystem - 系统表判定
 * @param databaseSync - 库级 `sync`：覆盖使用的每一侧必须已注册同名适配器
 * @returns 本实例自有的冻结副本（数组、条目与 `sync` 两层纯数据都是新对象，实体类与函数保留原引用），
 * 以及查重时顺手建好的索引 —— 两者共用同一批 `sync` 副本
 * @throws {@link RxDBSyncOverrideError} 任一条目非法时；不跳过、不取其中一条
 */
export function snapshotSyncOverrides(
  overrides: readonly EntitySyncOverride[],
  entities: readonly EntityType[],
  isSystem: (EntityClass: EntityType) => boolean,
  databaseSync: SyncOptions | undefined
): SyncOverrideSnapshot {
  const index = new Map<EntityMetadata, SyncOptions>();
  const entries: EntitySyncOverride[] = [];
  if (!Array.isArray(overrides)) {
    throw new RxDBSyncOverrideError('invalid-entry', 0, undefined, 'syncOverrides 必须是数组');
  }
  const registered = new Set(entities);
  // 按下标走而不是 forEach：稀疏数组的空位要落到 invalid-entry，不能被跳过
  for (let position = 0; position < overrides.length; position++) {
    const entry: unknown = overrides[position];
    const metadata = metadataOfEntry(entry);
    if (!metadata) {
      throw new RxDBSyncOverrideError('invalid-entry', position, undefined, '条目必须是 { entity: 实体类, sync }');
    }
    const { entity, sync } = entry as EntitySyncOverride;
    const label = entityLabel(metadata);
    assertTarget(entity, metadata, position, label, registered, isSystem, index);
    const problem = describeInvalidSync(sync, databaseSync);
    if (problem) throw new RxDBSyncOverrideError('invalid-sync', position, label, problem);
    const copy = snapshotSync(sync);
    index.set(metadata, copy);
    entries.push(Object.freeze({ entity, sync: copy }));
  }
  return { entries: Object.freeze(entries), index };
}

/** 目标必须是本实例注册的、非系统表、且尚未被覆盖过的实体 */
const assertTarget = (
  entity: EntityType,
  metadata: EntityMetadata,
  index: number,
  label: string,
  registered: ReadonlySet<EntityType>,
  isSystem: (EntityClass: EntityType) => boolean,
  seen: ReadonlyMap<EntityMetadata, SyncOptions>
): void => {
  if (isSystem(entity)) {
    throw new RxDBSyncOverrideError('system-entity', index, label, '系统表的同步策略由 RxDB 决定，不接受实例覆盖');
  }
  if (!registered.has(entity)) {
    throw new RxDBSyncOverrideError(
      'unregistered',
      index,
      label,
      '目标必须是本实例 entities 里注册的实体类；基类、子类与自动生成的关系中间实体都不算'
    );
  }
  if (seen.has(metadata)) {
    throw new RxDBSyncOverrideError('duplicate', index, label, '同一实体只能有一条覆盖');
  }
};

/**
 * 初始化阶段复核：覆盖目标不能是插件贡献的系统表。
 *
 * @param overrides - 快照后的覆盖
 * @param systemEntities - 本实例的系统表清单（含 `use()` 装上的插件贡献）
 * @throws {@link RxDBSyncOverrideError} 命中系统表时
 *
 * @remarks
 * 构造时插件还没 `use()`，它们贡献的系统表不在模块级登记簿里，只能等到 `init()` 再核一次。
 */
export function assertNoSystemEntityOverride(
  overrides: readonly EntitySyncOverride[],
  systemEntities: readonly EntityType[]
): void {
  const index = overrides.findIndex(({ entity }) => systemEntities.includes(entity));
  if (index === -1) return;
  throw new RxDBSyncOverrideError(
    'system-entity',
    index,
    entityLabel(getEntityMetadata(overrides[index].entity)),
    '系统表的同步策略由 RxDB 决定，不接受实例覆盖'
  );
}
