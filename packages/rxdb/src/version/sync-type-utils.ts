import { SyncOptions, SyncType } from '../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';

/**
 * @fileoverview 同步策略识别工具
 *
 * 从 EntityMetadata 读取 sync 配置，确定 repository 的同步类型
 */

/**
 * Repository 同步类型
 *
 * - `full`: 双向同步，本地和远程数据完全同步
 * - `filter`: 条件同步，根据过滤条件同步部分数据
 * - `querycache`: 查询缓存同步，按需拉取并缓存远程数据
 * - `remote`: 只读远程，数据仅存在于远程
 * - `local`: 只本地，数据仅存在于本地
 * - `none`: 不同步
 */
export type RepositorySyncType = 'full' | 'filter' | 'querycache' | 'remote' | 'local' | 'none';

/**
 * 获取实体的有效同步配置（支持全局配置回退）
 *
 * @param metadata - 实体元数据
 * @param globalSync - 全局同步配置（可选）
 * @returns 实体的有效同步配置，如果没有任何配置则返回 undefined
 */
export function getSyncConfig(metadata: EntityMetadata, globalSync?: SyncOptions): SyncOptions | undefined {
  return metadata.sync || globalSync;
}

/**
 * 从 EntityMetadata 获取同步类型
 *
 * @param metadata - 实体元数据
 * @param globalSync - 全局同步配置（可选，作为回退）
 * @returns 同步类型
 * @throws {RxDBError} 如果 sync.type === 'filter'（不支持）
 *
 * @example
 * ```ts
 * // Full sync (双向同步)
 * const metadata = {
 *   sync: {
 *     type: SyncType.Full,
 *     local: { adapter: 'sqlite' },
 *     remote: { adapter: 'supabase' }
 *   }
 * };
 * getSyncType(metadata); // 'full'
 *
 * // Remote only (只读远程)
 * const metadata = {
 *   sync: {
 *     type: SyncType.None,
 *     remote: { adapter: 'supabase' }
 *   }
 * };
 * getSyncType(metadata); // 'remote'
 *
 * // Local only (只本地)
 * const metadata = {
 *   sync: {
 *     type: SyncType.None,
 *     local: { adapter: 'sqlite' }
 *   }
 * };
 * getSyncType(metadata); // 'local'
 *
 * // No sync (系统表)
 * const metadata = { sync: undefined };
 * getSyncType(metadata); // 'none'
 *
 * // 使用全局配置回退
 * const metadata = { sync: undefined };
 * const globalSync = { type: SyncType.Full, local: {...}, remote: {...} };
 * getSyncType(metadata, globalSync); // 'full'
 * ```
 */
export function getSyncType(metadata: EntityMetadata, globalSync?: SyncOptions): RepositorySyncType {
  // 获取有效的 sync 配置（实体配置 > 全局配置）
  const sync = getSyncConfig(metadata, globalSync);

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
    const hasLocal = !!sync.local;
    const hasRemote = !!sync.remote;

    // 特殊情况：实体继承全局配置时，如果全局有 local + remote，默认使用 full 同步
    // 这允许全局配置 `type: SyncType.None` 作为"让实体自己决定"的语义
    if (!metadata.sync && hasLocal && hasRemote) {
      return 'full';
    }

    if (hasLocal && hasRemote) {
      // 两者都有但 type = None，意味着不同步（系统表）
      return 'none';
    }

    if (hasRemote && !hasLocal) {
      // 只有 remote: 只读远程数据
      return 'remote';
    }

    if (hasLocal && !hasRemote) {
      // 只有 local: 只在本地
      return 'local';
    }

    // 两者都没有: 不同步
    return 'none';
  }

  // 默认为 none（不应该到达这里）
  return 'none';
}

/**
 * 某个同步类型在两个方向上的能力
 */
export interface RepositorySyncCapability {
  /** 能否从远端拉取 */
  readonly pull: boolean;

  /** 能否向远端推送 */
  readonly push: boolean;
}

/**
 * `syncType → 能力` 的权威真值表
 *
 * @remarks
 * 此前调度侧散着五份口径（`pullIneligibility`/`pushIneligibility`、`needsPull`/`needsPush`、
 * `pull-batch` 与 `bulk-sync` 的内联跳过表、`sync-repository` 的 `shouldPull`/`shouldPush`），
 * 对 `querycache` 的判断互相矛盾：批量在拉它，报表却说它没得拉。现在全部从这张表派生。
 *
 * `querycache` 取 `pull: true` 是**向数据通路对齐**而非改行为 —— `pull-batch` 和
 * `pullRepository` 本来就在拉它，掉队的是报表侧的 `needsPull`。它不可推：本地只是
 * 按需缓存的远端副本，没有权威变更可回写。
 */
const SYNC_CAPABILITY_MATRIX: Readonly<Record<RepositorySyncType, RepositorySyncCapability>> = {
  full: { pull: true, push: true },
  filter: { pull: true, push: true },
  querycache: { pull: true, push: false },
  remote: { pull: true, push: false },
  local: { pull: false, push: false },
  none: { pull: false, push: false }
};

/**
 * `syncType` 不具备某方向能力时的原因短语
 *
 * @remarks
 * 每个 syncType 的短语只会在它**不具备能力**的那个方向上被读到，所以一份表足够：
 * `remote` / `querycache` 只在 push 侧被拒，`local` / `none` 两侧措辞相同，
 * `full` / `filter` 两侧都合格、永远读不到。
 */
const SYNC_TYPE_INELIGIBILITY: Readonly<Record<RepositorySyncType, string>> = {
  full: `syncType is 'full'`,
  filter: `syncType is 'filter'`,
  querycache: `syncType is 'querycache' (pull-only cache)`,
  remote: `syncType is 'remote' (read-only)`,
  local: `syncType is 'local' (no remote)`,
  none: `syncType is 'none'`
};

/**
 * `RxDBSync.enabled` 被关闭时的原因短语
 *
 * @remarks
 * 与 {@link SYNC_TYPE_INELIGIBILITY} 分开：前者说「这类仓库天生就没有这个方向」，
 * 是配置决定的；这条说「有能力但被人关掉了」，改一行记录就能恢复。调用方（以及用户）
 * 需要能分清这两件事。
 */
export const SYNC_DISABLED_REASON = `sync is disabled (RxDBSync.enabled = false)`;

/**
 * 读取某个同步类型的能力
 *
 * @param syncType - 同步类型
 * @returns 该类型在 pull / push 两个方向上的能力
 *
 * @example
 * ```ts
 * getSyncCapability('remote');     // { pull: true,  push: false }
 * getSyncCapability('querycache'); // { pull: true,  push: false }
 * getSyncCapability('local');      // { pull: false, push: false }
 * ```
 */
export function getSyncCapability(syncType: RepositorySyncType): RepositorySyncCapability {
  return SYNC_CAPABILITY_MATRIX[syncType];
}

/**
 * 读取某个同步类型在指定方向上不具备能力的原因
 *
 * @param syncType - 同步类型
 * @returns 原因短语（调用方需自行确认该方向确实不具备能力）
 *
 * @internal
 */
export function syncTypeIneligibility(syncType: RepositorySyncType): string {
  return SYNC_TYPE_INELIGIBILITY[syncType];
}

/**
 * 仓库同步开关：`RxDBSync` 中与资格判定相关的那一个字段
 *
 * @remarks
 * 刻意只声明 `enabled`，让判定谓词不必依赖完整的 `RxDBSync` 实例 —— 状态展示、
 * 批量枚举、单仓入口拿到的记录形态各不相同，共享的只有这一个字段。
 */
export interface RepositorySyncSwitch {
  /** 该仓库在当前分支上的同步开关 */
  enabled?: boolean | null;
}

/**
 * 判定仓库的同步开关是否处于启用状态
 *
 * @param repoSync - 该仓库在当前分支上的同步记录；查不到时传 `undefined` / `null`
 * @returns 是否启用
 *
 * @remarks
 * **查不到记录视为启用**：`RxDBSync` 是懒创建的（首次同步时才写入，且写入即
 * `enabled = true`），把「没有记录」当成禁用会让任何仓库的第一次同步都被自己挡住。
 *
 * @example
 * ```ts
 * isRepositorySyncEnabled(undefined);        // true —— 还没同步过
 * isRepositorySyncEnabled({ enabled: false }); // false
 * ```
 */
export function isRepositorySyncEnabled(repoSync?: RepositorySyncSwitch | null): boolean {
  return repoSync?.enabled !== false;
}

/**
 * 检查 repository 是否需要 pull
 *
 * @param metadata - 实体元数据
 * @param globalSync - 全局同步配置（可选）
 * @returns 是否需要 pull
 *
 * @remarks
 * 只看 `syncType` 的能力，**不看 `RxDBSync.enabled`** —— 这是报表侧谓词，
 * 「有多少可拉」和「现在允不允许拉」是两件事，后者由
 * `pullIneligibility` 在调度入口上把关。
 *
 * @example
 * ```ts
 * needsPull(metadataFull);       // true  (full)
 * needsPull(metadataFilter);     // true  (filter)
 * needsPull(metadataQueryCache); // true  (querycache —— 批量拉取一直在拉它)
 * needsPull(metadataRemote);     // true  (remote)
 * needsPull(metadataLocal);      // false (local)
 * needsPull(metadataNone);       // false (none)
 * ```
 */
export function needsPull(metadata: EntityMetadata, globalSync?: SyncOptions): boolean {
  return getSyncCapability(getSyncType(metadata, globalSync)).pull;
}

/**
 * 检查 repository 是否需要 push
 *
 * @param metadata - 实体元数据
 * @param globalSync - 全局同步配置（可选）
 * @returns 是否需要 push
 *
 * @example
 * ```ts
 * needsPush(metadataFull);   // true  (full)
 * needsPush(metadataFilter); // true  (filter - 本地变更不受 filter 限制)
 * needsPush(metadataRemote); // false (remote)
 * needsPush(metadataLocal);  // false (local —— 只在本地，不与远端同步)
 * needsPush(metadataNone);   // false (none)
 * ```
 *
 * @remarks
 * `'local'` 一律返回 `false`：它的定义是「`SyncType.None` + 只配了 local adapter、没有 remote」，
 * 公开契约写明「只在本地」。此前返回 `true` 会让私有本地数据进入推送队列（对外泄露），
 * 而且这类仓库连 remote adapter 都没有，推送本就无从执行。
 *
 * 与 {@link needsPull} 一样只看 `syncType`，不看 `RxDBSync.enabled`。
 */
export function needsPush(metadata: EntityMetadata, globalSync?: SyncOptions): boolean {
  return getSyncCapability(getSyncType(metadata, globalSync)).push;
}

/**
 * 检查 repository 是否完全不同步
 *
 * @param metadata - 实体元数据
 * @param globalSync - 全局同步配置（可选）
 * @returns 是否不同步
 *
 * @example
 * ```ts
 * isNoSync(metadataFull);   // false
 * isNoSync(metadataRemote); // false
 * isNoSync(metadataLocal);  // false
 * isNoSync(metadataNone);   // true (系统表)
 * ```
 */
export function isNoSync(metadata: EntityMetadata, globalSync?: SyncOptions): boolean {
  const syncType = getSyncType(metadata, globalSync);
  return syncType === 'none';
}

/**
 * 获取需要同步的 repository 列表
 *
 * @param entities - 实体元数据数组
 * @param globalSync - 全局同步配置（可选）
 * @returns 需要同步的实体列表
 *
 * @example
 * ```ts
 * const entities = [todoMetadata, userMetadata, systemMetadata];
 * const syncable = getSyncableRepositories(entities);
 * // 返回: [todoMetadata, userMetadata] (排除 systemMetadata)
 * ```
 */
export function getSyncableRepositories(entities: EntityMetadata[], globalSync?: SyncOptions): EntityMetadata[] {
  return entities.filter(entity => !isNoSync(entity, globalSync));
}

/**
 * 按同步类型分组 repositories
 *
 * @param entities - 实体元数据数组
 * @param globalSync - 全局同步配置（可选）
 * @returns 按同步类型分组的实体
 *
 * @example
 * ```ts
 * const grouped = groupBySyncType(entities);
 * // 返回: {
 * //   full: [todoMetadata, commentMetadata],
 * //   filter: [orderMetadata],
 * //   remote: [userMetadata],
 * //   local: [draftMetadata],
 * //   none: [systemMetadata]
 * // }
 * ```
 */
export function groupBySyncType(
  entities: EntityMetadata[],
  globalSync?: SyncOptions
): Record<RepositorySyncType, EntityMetadata[]> {
  const result: Record<RepositorySyncType, EntityMetadata[]> = {
    full: [],
    filter: [],
    querycache: [],
    remote: [],
    local: [],
    none: []
  };

  for (const entity of entities) {
    const syncType = getSyncType(entity, globalSync);
    result[syncType].push(entity);
  }

  return result;
}
