/**
 * @fileoverview 过期数据清理
 *
 * 清理不再满足 Filter 条件的本地过期数据。
 * 删除操作不会记录到 RxDBChange，因此不会同步到远程。
 */

import type { RxDBEntityId } from '../entity/entity.interface.js';
import type { OperatorName, Rule, RuleGroup } from '../repository/query.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';

/**
 * 仅要求「能拿到 RxDBChange 仓库并 find」的最小结构 —— 适配器与
 * {@link TransactionExecutor} 都满足。声明成两者的联合类型会因泛型方法不可调用而失败。
 */
interface RxDBChangeRepositorySource {
  getRepository(EntityType: typeof RxDBChange): { find(options: never): Promise<unknown> };
}

import { RxDBError } from '../RxDBError.js';
import { getRxDBChangeEntityIdQueryValues, getRxDBEntityIdentityKey } from '../system/change-codec.js';
import { RxDBChange } from '../system/change.js';
import { getSyncType } from './sync-type-utils.js';
import type { SwitchVersionActions } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';

/**
 * 过期数据清理选项
 */
export interface CleanupExpiredOptions {
  /**
   * 过滤条件（可选）
   * 如果不提供，从实体元数据的 sync.remote.filter() 获取
   */
  filter?: RuleGroup;

  /**
   * 干跑模式，只返回将被删除的数量
   * @default false
   */
  dryRun?: boolean;
}

/**
 * 过期数据清理结果
 */
export interface CleanupExpiredResult {
  /**
   * 被清理的记录数量
   */
  removed: number;

  /**
   * 被清理的实体 ID 列表（仅 dryRun 模式或实际删除时）
   */
  removedIds?: RxDBEntityId[];
}

/**
 * 清理不再满足过滤条件的本地过期数据
 *
 * 注意: 删除操作不会记录到 RxDBChange，因此不会同步到远程
 * 这适用于"只保留最近 N 天数据"的场景
 *
 * @param vm - VersionManager 实例
 * @param namespace - 命名空间
 * @param entityName - 实体名
 * @param options - 清理选项
 * @returns 清理结果
 *
 * @example
 * ```ts
 * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
 * const { removed } = await cleanupExpired(vm, 'public', 'Order', {
 *   filter: {
 *     combinator: 'and',
 *     rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
 *   }
 * });
 * console.log(`Removed ${removed} expired records`);
 * ```
 */
export async function cleanupExpired(
  vm: VersionManager,
  namespace: string,
  entityName: string,
  options?: CleanupExpiredOptions
): Promise<CleanupExpiredResult> {
  const rxdb = vm.rxdb;
  const { adapter: localAdapter } = await vm.getLocalRepositories();

  // 验证实体存在
  const EntityType = rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entityName;
  });

  if (!EntityType) {
    throw new RxDBError(`Entity not found: ${namespace}:${entityName}`);
  }

  const metadata = getEntityMetadata(EntityType);
  const syncType = getSyncType(metadata, rxdb.config.sync);

  // 获取 filter 条件
  let filter = options?.filter;
  if (!filter && syncType === 'filter') {
    const syncConfig = metadata.sync as { remote?: { filter?: () => RuleGroup } };
    if (syncConfig?.remote?.filter) {
      try {
        filter = syncConfig.remote.filter();
      } catch (error) {
        throw new RxDBError(
          `Filter function failed for ${namespace}:${entityName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  if (!filter) {
    throw new RxDBError(
      `No filter provided and entity ${namespace}:${entityName} does not have a Filter sync configuration.`
    );
  }

  // 反转 filter 条件：找出不满足条件的记录
  const invertedFilter = invertRuleGroup(filter);

  /**
   * 剔除仍有未推送变更的候选。
   *
   * 删除走 `mergeChanges(..., disableTriggers=true)`，**不产生 RxDBChange**。
   * 若候选还有未推送的 INSERT/UPDATE，删掉就等于让那些变更永远推不出去，
   * 远端则永久保留一条幽灵记录 —— 本地与远端从此分叉。这类候选一律跳过。
   *
   * `source` 必须由调用方传入，**不能在闭包里取**：本函数在事务外（dryRun）与事务内
   * 各调用一次，两处的仓库归属不同 —— 事务内必须走 executor 的仓库，否则这次读会
   * 重新排队并排在自己所在的事务后面（队列并发度 1），永久挂起。
   */
  const rejectUnpushed = async (
    candidates: { id: RxDBEntityId }[],
    source: RxDBChangeRepositorySource
  ): Promise<{ id: RxDBEntityId }[]> => {
    if (candidates.length === 0) return candidates;
    const changeRepo = source.getRepository(RxDBChange);
    const unpushed = await changeRepo.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'namespace', operator: '=', value: namespace },
          { field: 'entity', operator: '=', value: entityName },
          { field: 'remoteId', operator: '=', value: null },
          { field: 'revertChangeId', operator: '=', value: null },
          {
            field: 'entityId',
            operator: 'in',
            value: getRxDBChangeEntityIdQueryValues(candidates.map(record => record.id))
          }
        ]
      }
    } as never);
    const blocked = new Set(
      (unpushed as { entityId: RxDBEntityId }[]).map(change => getRxDBEntityIdentityKey(change.entityId))
    );
    return blocked.size === 0 ?
        candidates
      : candidates.filter(record => !blocked.has(getRxDBEntityIdentityKey(record.id)));
  };

  // dryRun 模式只报数、不删除；同样要扣除被保护的候选，否则报的数字是假的
  if (options?.dryRun) {
    const repo = localAdapter.getRepository(EntityType);
    const preview = await rejectUnpushed(await repo.find({ where: invertedFilter }), localAdapter);
    return {
      removed: preview.length,
      removedIds: preview.map(record => record.id)
    };
  }

  // 复核 + 保护性检查 + 删除必须在同一本地事务内完成。
  // 此前是「事务外查一次 → 按旧快照无条件删」：查询后若用户把记录更新回满足 filter，
  // 仍会被删掉，是稳定可复现的数据破坏。
  return localAdapter.transaction(async executor => {
    // 仓库必须在事务体**内**经 executor 获取：事务外取到的句柄绑定在适配器上，
    // 其读写会重新排队并排在自己这个事务后面
    const repo = executor.getRepository(EntityType);
    // 事务内重新查询，拿到的是最新快照（复核 filter）
    const expiredRecords = await rejectUnpushed(await repo.find({ where: invertedFilter }), executor);
    const removedIds = expiredRecords.map(record => record.id);

    if (removedIds.length > 0) {
      const deletes = new Map<string, { patch: null; inversePatch: null }>();
      for (const record of expiredRecords) {
        deletes.set(`${namespace}:${entityName}:${getRxDBEntityIdentityKey(record.id)}`, {
          patch: null,
          inversePatch: null
        });
      }
      const actions: SwitchVersionActions = { deletes, updates: new Map(), inserts: new Map() };
      // 使用 mergeChanges + disableTriggers 删除，避免生成 RxDBChange 记录
      await executor.mergeChanges(actions, undefined, true);
    }

    return { removed: removedIds.length, removedIds };
  });
}

/**
 * 反转 RuleGroup 条件
 *
 * 将 filter 条件转换为"不满足条件"的查询
 * 例如: updatedAt >= 30天前 → updatedAt < 30天前
 */
function invertRuleGroup(rg: RuleGroup): RuleGroup {
  // 简单实现：使用 NOT 逻辑
  // 对于 AND 条件：NOT (A AND B) = NOT A OR NOT B
  // 对于 OR 条件：NOT (A OR B) = NOT A AND NOT B
  return {
    combinator: rg.combinator === 'and' ? 'or' : 'and',
    rules: rg.rules.map(rule => {
      if ('combinator' in rule) {
        // 嵌套 RuleGroup
        return invertRuleGroup(rule);
      }
      // 单个 Rule：反转操作符
      return invertRule(rule);
    })
  };
}

/**
 * 反转单个 Rule 的操作符
 */
function invertRule(rule: Rule): Rule {
  const invertedOperators: Partial<Record<OperatorName, OperatorName>> = {
    '=': '!=',
    '!=': '=',
    '<': '>=',
    '<=': '>',
    '>': '<=',
    '>=': '<',
    in: 'notIn',
    notIn: 'in',
    contains: 'notContains',
    notContains: 'contains',
    startsWith: 'notStartsWith',
    notStartsWith: 'startsWith',
    endsWith: 'notEndsWith',
    notEndsWith: 'endsWith',
    between: 'notBetween',
    notBetween: 'between',
    null: 'notNull',
    notNull: 'null',
    exists: 'notExists',
    notExists: 'exists'
  };

  const invertedOperator = invertedOperators[rule.operator];
  if (!invertedOperator) {
    throw new RxDBError(`Cannot invert operator: ${rule.operator}`);
  }

  return {
    ...rule,
    operator: invertedOperator
  } as Rule;
}
