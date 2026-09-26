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
 * - `invalid-entry`：条目本身不是对象，或 `entity` 不是实体类
 * - `invalid-sync`：`sync` 为 `null`、非对象、缺少或写错 `type`、适配器选项形状不对
 */
export type RxDBSyncOverrideErrorReason =
  | 'unregistered'
  | 'system-entity'
  | 'duplicate'
  | 'invalid-entry'
  | 'invalid-sync';

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

/** 返回 `sync` 的问题描述；合法时返回 `undefined` */
const describeInvalidSync = (sync: unknown): string | undefined => {
  if (!isRecord(sync)) return `sync 必须是完整的 SyncOptions 对象，收到 ${sync === null ? 'null' : typeof sync}`;
  if (!SYNC_TYPES.has(sync['type'])) return `sync.type 必须是 SyncType 之一，收到 ${String(sync['type'])}`;
  if (!isAdapterSideValid(sync['local'])) return 'sync.local 必须是 { adapter: string }';
  if (!isAdapterSideValid(sync['remote'])) return 'sync.remote 必须是 { adapter: string }';
  return undefined;
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

/**
 * 校验并快照实例级同步覆盖。
 *
 * @param overrides - `RxDBOptions.syncOverrides`，可能来自 JS 调用方，形状不可信
 * @param entities - 本实例注册的业务实体（调用方传入的 `entities`）
 * @param isSystem - 系统表判定
 * @returns 本实例自有的冻结副本：数组、条目与 `sync` 两层纯数据都是新对象，实体类与函数保留原引用
 * @throws {@link RxDBSyncOverrideError} 任一条目非法时；不跳过、不取其中一条
 */
export function snapshotSyncOverrides(
  overrides: readonly EntitySyncOverride[],
  entities: readonly EntityType[],
  isSystem: (EntityClass: EntityType) => boolean
): readonly EntitySyncOverride[] {
  const snapshot = new Map<EntityMetadata, SyncOptions>();
  const entries: EntitySyncOverride[] = [];
  if (!Array.isArray(overrides)) {
    throw new RxDBSyncOverrideError('invalid-entry', 0, undefined, 'syncOverrides 必须是数组');
  }
  const registered = new Set(entities);
  overrides.forEach((entry: unknown, index) => {
    const metadata = metadataOfEntry(entry);
    if (!metadata) {
      throw new RxDBSyncOverrideError('invalid-entry', index, undefined, '条目必须是 { entity: 实体类, sync }');
    }
    const { entity, sync } = entry as EntitySyncOverride;
    const label = entityLabel(metadata);
    assertTarget(entity, metadata, index, label, registered, isSystem, snapshot);
    const problem = describeInvalidSync(sync);
    if (problem) throw new RxDBSyncOverrideError('invalid-sync', index, label, problem);
    const copy = snapshotSync(sync);
    snapshot.set(metadata, copy);
    entries.push(Object.freeze({ entity, sync: copy }));
  });
  return Object.freeze(entries);
}

/**
 * 把快照后的覆盖条目按实体元数据身份建索引，供解析器查表。
 *
 * @param overrides - {@link snapshotSyncOverrides} 的产物
 */
export function indexSyncOverrides(overrides: readonly EntitySyncOverride[]): ReadonlyMap<EntityMetadata, SyncOptions> {
  return new Map(overrides.map(({ entity, sync }) => [getEntityMetadata(entity), sync]));
}

/** 目标必须是本实例注册的、非系统表、且尚未被覆盖过的实体 */
const assertTarget = (
  entity: EntityType,
  metadata: EntityMetadata,
  index: number,
  label: string,
  registered: ReadonlySet<EntityType>,
  isSystem: (EntityClass: EntityType) => boolean,
  snapshot: ReadonlyMap<EntityMetadata, SyncOptions>
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
  if (snapshot.has(metadata)) {
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
