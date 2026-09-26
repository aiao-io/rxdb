import type { EntityType } from '../entity/entity.interface.js';
import type { SyncOptions } from '../entity/metadata-options.interface.js';
import type { RuleGroup } from '../repository/query.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDBChange } from '../system/change.js';
import type { RxDBSync } from '../system/sync.js';
import { toEntitySyncResolver, type EntitySyncResolver } from './entity-sync-resolver.js';
import { getSyncCapability, isRepositorySyncEnabled } from './sync-type-utils.js';

/**
 * 按「当前配置里有推送资格的仓库」构造 OR 组，同步记录只提供水位线。
 *
 * @param entities - `config.entities`，仓库集合真源
 * @param syncConfig - 实例解析器 `rxdb.entitySync`（含实例覆盖）；传 `config.sync` 时只按实体声明 > 全局回退解析
 * @param repoSyncs - 当前分支上已存在的同步记录
 * @returns 每个可推送仓库一条 AND 规则；没有仓库可推送时返回空数组
 *
 * @remarks
 * 仓库集合的唯一真源是 `config.entities × syncType`（口径见 {@link getSyncCapability}），
 * 不是「已经有 RxDBSync 记录的仓库」。记录只回答水位线在哪、开关关没关。
 * `enabled = false` 一票否决。没有记录 ⇒ 该仓库一次都没推过 ⇒ 不设上界。
 */
export function buildPushableRepositoryRules(
  entities: readonly EntityType[],
  syncConfig: SyncOptions | EntitySyncResolver,
  repoSyncs: RxDBSync[]
): RuleGroup<RxDBChange>['rules'] {
  return buildRepositoryRules(entities, syncConfig, repoSyncs, capability => capability.push);
}

/**
 * 按「离线可写但没有 changelog 端点的仓库」构造 OR 组，形状与
 * {@link buildPushableRepositoryRules} 完全一致。
 *
 * @param entities - `config.entities`，仓库集合真源
 * @param syncConfig - 实例解析器 `rxdb.entitySync`（含实例覆盖）；传 `config.sync` 时只按实体声明 > 全局回退解析
 * @param repoSyncs - 当前分支上已存在的同步记录
 * @returns 每个待重放仓库一条 AND 规则；没有这类仓库时返回空数组
 *
 * @remarks
 * 判据是 `offlineWrite && !push`（现阶段只有 `querycache`），与
 * {@link buildPushableRepositoryRules} 的 `push` 恰好互补：两组规则永不重叠，
 * 因此把两侧的计数直接相加不会重复计算同一行。
 */
export function buildOfflineWriteRepositoryRules(
  entities: readonly EntityType[],
  syncConfig: SyncOptions | EntitySyncResolver,
  repoSyncs: RxDBSync[]
): RuleGroup<RxDBChange>['rules'] {
  return buildRepositoryRules(
    entities,
    syncConfig,
    repoSyncs,
    capability => capability.offlineWrite && !capability.push
  );
}

/** 两个导出共用的规则构造：只有仓库筛选谓词不同 */
function buildRepositoryRules(
  entities: readonly EntityType[],
  syncConfig: SyncOptions | EntitySyncResolver,
  repoSyncs: RxDBSync[],
  accepts: (capability: ReturnType<typeof getSyncCapability>) => boolean
): RuleGroup<RxDBChange>['rules'] {
  const resolver = toEntitySyncResolver(syncConfig);
  const syncByRepository = new Map(repoSyncs.map(repoSync => [`${repoSync.namespace}:${repoSync.entity}`, repoSync]));
  const rules: RuleGroup<RxDBChange>['rules'] = [];

  for (const EntityClass of entities) {
    const metadata = getEntityMetadata(EntityClass);
    if (!accepts(getSyncCapability(resolver.resolveType(metadata)))) continue;

    const repoSync = syncByRepository.get(`${metadata.namespace}:${metadata.name}`);
    if (!isRepositorySyncEnabled(repoSync)) continue;

    const repoRules: RuleGroup<RxDBChange>['rules'] = [
      { field: 'namespace', operator: '=', value: metadata.namespace },
      { field: 'entity', operator: '=', value: metadata.name }
    ];
    const watermark = repoSync?.lastPushedChangeId;
    if (watermark !== null && watermark !== undefined) {
      repoRules.push({ field: 'id', operator: '>', value: watermark });
    }

    rules.push({ combinator: 'and', rules: repoRules });
  }

  return rules;
}
