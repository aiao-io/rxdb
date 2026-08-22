import type { SyncOptions } from '../entity/metadata-options.interface.js';
import type { EntityType } from '../entity/entity.interface.js';
import type { RuleGroup } from '../repository/query.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDBChange } from '../system/change.js';
import type { RxDBSync } from '../system/sync.js';
import { getSyncCapability, getSyncType, isRepositorySyncEnabled } from './sync-type-utils.js';

/**
 * 按「当前配置里有推送资格的仓库」构造 OR 组，同步记录只提供水位线。
 *
 * @param entities - `config.entities`，仓库集合真源
 * @param syncConfig - `config.sync`，全局同步回退
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
  syncConfig: SyncOptions,
  repoSyncs: RxDBSync[]
): RuleGroup<RxDBChange>['rules'] {
  const syncByRepository = new Map(repoSyncs.map(repoSync => [`${repoSync.namespace}:${repoSync.entity}`, repoSync]));
  const rules: RuleGroup<RxDBChange>['rules'] = [];

  for (const EntityClass of entities) {
    const metadata = getEntityMetadata(EntityClass);
    if (!getSyncCapability(getSyncType(metadata, syncConfig)).push) continue;

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
