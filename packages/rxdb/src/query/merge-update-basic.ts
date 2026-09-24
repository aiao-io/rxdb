import { EntityType } from '../entity/entity.interface.js';
import { FindAllOptions, FindOneOptions } from '../repository/query-options.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { UpdateClassification, UpdateDataCache, applyExternalEntityUpdate, getEntityId } from './merge-update.utils.js';
import { calculateOrderBy, isEntityMatchWhere } from './query-matching.utils.js';

/**
 * 处理 findAll 查询更新
 *
 * 注意：patch 可能是增量数据（跨 Tab 场景），不是完整实体
 * 因此对于结果集中已有的实体，需要合并 patch 而不是替换
 */
export const handleFindAllUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindAllOptions<T>;
  const where = options.where;
  const oldResult = Array.from(task.resultEntitySet.values());

  // 处理结果集中已有的实体：合并 patch 并重新检查 where 匹配
  const afterMerge: InstanceType<T>[] = [];
  for (const entity of oldResult) {
    const entityId = getEntityId(entity);
    if (entityId === undefined) {
      afterMerge.push(entity);
      continue;
    }

    // 如果该实体有更新事件
    const data = cache.getData(entityId);
    if (data?.patch) {
      // 外部事件同步到缓存实体时，不能记成用户本地修改。
      applyExternalEntityUpdate(entity, data.patch);
      // 重新检查合并后的实体是否仍然匹配 where 条件
      if (!where || isEntityMatchWhere(entity, where)) {
        afterMerge.push(entity);
      }
      // 不匹配则从结果集中移除
    } else {
      // 没有更新，保留原实体
      afterMerge.push(entity);
    }
  }

  // 添加新匹配的实体（不在当前结果集中，但匹配 where 条件）
  const existingIds = new Set(afterMerge.map(e => getEntityId(e)).filter(id => id !== undefined));
  const newlyMatchedEntities = Array.from(classification.newlyMatchedIds)
    .filter(id => !existingIds.has(id)) // 排除已在结果集中的
    .map(id => cache.getSerializedUpdate(id))
    .filter((entity): entity is InstanceType<T> => !!entity);

  let newResult = [...afterMerge, ...newlyMatchedEntities];

  // 如果有排序,重新排序
  if (options.orderBy?.length) {
    newResult = calculateOrderBy(newResult, options.orderBy);
  }

  task.next(newResult, true);
};

/**
 * 处理 findOne/findOneOrFail 查询更新
 *
 * 注意：patch 可能是增量数据（跨 Tab 场景），不是完整实体
 * 因此对于当前结果，需要合并 patch 而不是替换
 */
export const handleFindOneUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindOneOptions<T>;
  const where = options.where;

  if (task.result === null || task.result === undefined) {
    // 如果当前无结果,检查是否有新匹配的实体
    if (classification.newlyMatchedIds.size > 0) {
      task.refresh();
    }
    return;
  }

  const currentResult = task.result as InstanceType<T>;
  const currentId = getEntityId(currentResult);
  if (currentId === undefined) {
    return;
  }

  // 检查当前结果是否有更新
  const data = cache.getData(currentId);
  if (data?.patch) {
    applyExternalEntityUpdate(currentResult, data.patch);
    // 重新检查合并后的实体是否仍然匹配 where 条件
    if (where && !isEntityMatchWhere(currentResult, where)) {
      // 不再匹配，需要刷新找新的结果
      task.refresh();
      return;
    }

    // 如果有排序规则，需要刷新确认是否仍然是第一个
    if (options.orderBy?.length) {
      task.refresh();
      return;
    }

    // 仍然匹配且无排序，更新当前实体
    task.next(currentResult);
    return;
  }

  // 当前结果没有更新，但如果有新匹配的实体，可能影响结果
  if (classification.newlyMatchedIds.size > 0) {
    task.refresh();
  }
};
