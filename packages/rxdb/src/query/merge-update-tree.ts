import { EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { UpdateClassification, UpdateDataCache, applyExternalEntityUpdate, getEntityId } from './merge-update.utils.js';
import { get_tree_parent_id } from './query-tree.utils.js';
import { TreeHelper } from './tree-helper.js';

/**
 * 处理 findDescendants 查询的增量更新
 *
 * UPDATE 场景下的复杂性:
 * 1. 实体的 parentId 可能变化，导致树形结构重组
 * 2. 实体可能从不是后代变成后代，或从后代变成非后代
 * 3. 实体仍然是后代，但字段值变化（如名称、描述等）
 * 4. 需要考虑 level 限制（只查询特定层级的后代）
 *
 * 更新策略:
 * - 移除: 不再匹配 where 条件 或 不再是后代 或 超出 level 范围
 * - 更新: 仍在结果集中的实体，更新其字段值
 * - 添加: 新匹配 where 条件 且 成为后代 且 在 level 范围内
 *
 * @param task 查询任务
 * @param data 更新的实体数据列表
 * @param classification 更新分类结果
 * @param cache 更新数据缓存
 */
export const handleFindDescendantsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID (查询谁的后代)
  const level = options.level; // 层级限制 (undefined 表示无限制)

  // 构建旧结果集的映射，用于快速查找
  const oldResult = Array.from(task.resultEntitySet.values());
  const oldResultMap = new Map<RxDBEntityId, InstanceType<T>>();
  oldResult.forEach(existing => {
    const existingId = getEntityId(existing);
    if (existingId !== undefined) {
      oldResultMap.set(existingId, existing);
    }
  });

  const helper = new TreeHelper(cache, oldResultMap);
  let hasChanges = false; // 标记是否有变化，避免不必要的更新
  // 记录"因 parentId 改变而移出子树"的节点，供孤儿复查使用
  const removedDueToMove = new Set<RxDBEntityId>();

  const afterRemoval = oldResult.filter(entity => {
    const entityId = getEntityId(entity);
    if (entityId === undefined) return true; // 无ID的实体保留（理论上不应该出现）

    if (classification.updatedIds.has(entityId)) {
      // 情况1: 实体从匹配变为不匹配 where 条件 → 移除
      if (classification.newlyUnmatchedIds.has(entityId)) {
        hasChanges = true;
        return false;
      }

      // 情况2: 实体更新后仍然匹配，检查是否还是后代且在 level 范围内
      if (classification.matchNowIds.has(entityId)) {
        const eventData = cache.getData(entityId);
        // 🐛 BUG 修复: 检查 patch 中是否包含 parentId
        // 如果 patch 中没有 parentId，说明 parentId 没有改变
        // 此时不需要重新判断树关系，实体应该保持在原位置
        const hasParentIdChanged = eventData && 'parentId' in eventData.patch;

        if (hasParentIdChanged) {
          // parentId 在 patch 中存在，需要检查树关系是否改变
          const updatedEntity = cache.getSerializedUpdate(entityId);
          if (updatedEntity) {
            const { isDescendant, level: entityLevel } = helper.isEntityDescendant(updatedEntity, targetEntityId);
            // 不再是后代 或 超出层级限制 → 移除
            if (!isDescendant || (level !== undefined && entityLevel > level)) {
              hasChanges = true;
              removedDueToMove.add(entityId);
              return false;
            }
          }
        }
        // 如果 parentId 没有改变，保留实体（树关系未变）
      }
    }
    return true; // 保留该实体
  });

  // 即使实体仍然是后代，其字段值（如 title、description）可能已变化，需要更新
  const afterFieldUpdate = afterRemoval.map(entity => {
    const entityId = getEntityId(entity);
    if (entityId !== undefined && classification.updatedIds.has(entityId)) {
      const eventData = cache.getData(entityId);
      if (eventData) {
        applyExternalEntityUpdate(entity, eventData.patch);
        hasChanges = true;
      }
    }
    return entity;
  });

  // 中间节点 P 改 parentId 移出子树后，第一步只遍历 updatedIds，无法发现
  // P 名下"未被直接更新"的子节点 X —— 它们会作为孤儿残留在结果集中。
  // 保守策略：仅当能"证明"某节点的父链穿过本批被移出的节点时才移除；
  // 父链无法解析（缺失/循环）时一律保留，避免误删合法节点。
  let updatedEntities = afterFieldUpdate;
  if (removedDueToMove.size > 0) {
    const survivingMap = new Map<RxDBEntityId, InstanceType<T>>();
    afterFieldUpdate.forEach(entity => {
      const id = getEntityId(entity);
      if (id !== undefined) survivingMap.set(id, entity);
    });
    const resolveParent = (id: RxDBEntityId): InstanceType<T> | undefined =>
      cache.getSerializedUpdate(id) ?? survivingMap.get(id) ?? oldResultMap.get(id);
    const isOrphaned = (entity: InstanceType<T>): boolean => {
      let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
      const visited = new Set<RxDBEntityId>();
      while (currentParentId !== null && !visited.has(currentParentId)) {
        if (removedDueToMove.has(currentParentId)) return true; // 父链穿过被移出节点
        if (currentParentId === targetEntityId) return false; // 仍连到目标
        visited.add(currentParentId);
        const parent = resolveParent(currentParentId);
        if (!parent) return false; // 链路缺失，保守保留
        currentParentId = get_tree_parent_id<RxDBEntityId>(parent);
      }
      return false; // 链路断裂或循环，保守保留
    };
    updatedEntities = afterFieldUpdate.filter(entity => {
      const entityId = getEntityId(entity);
      // 已被直接更新的实体在第一步已判定，这里只复查未更新的实体（潜在孤儿）
      if (entityId !== undefined && !classification.updatedIds.has(entityId) && isOrphaned(entity)) {
        hasChanges = true;
        return false;
      }
      return true;
    });
  }

  const newlyMatchedEntities: InstanceType<T>[] = [];

  // 筛选出需要检查的实体: 更新后匹配 where 条件 且 不在旧结果集中
  const entitiesToCheck = data.filter(d => {
    const entityId = d.id as RxDBEntityId;
    const alreadyInResult = oldResultMap.has(entityId);
    // 🐛 BUG 修复: 只有当 parentId 改变时，才需要检查是否新成为后代
    // 如果 patch 中没有 parentId，说明树关系未变，不会新成为后代
    // key 是否存在不代表值真的变了（如只更新 isActive 时 patch 仍会带上
    // 未变的 parentId）。必须比较 patch 与 inversePatch 的实际值，否则会对纯字段
    // 更新误判为"移动"，触发不必要的 refresh。
    const hasParentIdChanged =
      'parentId' in d.patch &&
      get_tree_parent_id(d.patch as InstanceType<T>) !== get_tree_parent_id(d.inversePatch as InstanceType<T>);
    return classification.matchNowIds.has(entityId) && !alreadyInResult && hasParentIdChanged;
  });

  // 检查这些实体是否成为后代
  for (const event of entitiesToCheck) {
    const serialized = cache.getSerializedUpdate(event.id as RxDBEntityId);
    if (!serialized) continue;

    const { isDescendant, level: entityLevel } = helper.isEntityDescendant(serialized, targetEntityId);
    // 是后代 且 在层级范围内 → 一个新子树根经由 parentId 变化进入 scope
    if (isDescendant && (level === undefined || entityLevel <= level)) {
      // 这个节点此前不在 oldResultMap（从未被追踪），若它此前已有子孙，
      // 这些子孙既不在 oldResultMap，也不在本批 UPDATE 事件里（本批只触及了被
      // 移动的根节点自己）——本地增量缓存对它们完全不可见。只把移动的根节点加入
      // 结果会漏掉整棵子树（ancestor/descendant 结果与 level 失真），且无法在本地
      // 证明"这个节点没有子孙"。跨 scope 边界的移动只能整体交回 SQL 重算。
      task.refresh();
      return;
    }
  }

  // 这些实体可能已经在结果集中（因为它们是后代），但之前不匹配 where 条件
  // 现在匹配了，需要确保它们在结果中
  data.forEach(event => {
    const entityId = event.id as RxDBEntityId;
    if (classification.newlyMatchedIds.has(entityId)) {
      const serialized = cache.getSerializedUpdate(entityId);
      if (serialized) {
        const { isDescendant, level: entityLevel } = helper.isEntityDescendant(serialized, targetEntityId);
        if (isDescendant && (level === undefined || entityLevel <= level)) {
          // 检查是否已经在结果中（可能在前面步骤已添加）
          const alreadyInResult =
            updatedEntities.some(e => getEntityId(e) === entityId) ||
            newlyMatchedEntities.some(e => getEntityId(e) === entityId) ||
            oldResultMap.has(entityId);
          if (!alreadyInResult) {
            hasChanges = true;
            newlyMatchedEntities.push(serialized);
            oldResultMap.set(entityId, serialized);
          }
        }
      }
    }
  });

  if (!hasChanges) {
    return; // 没有变化，直接返回，避免不必要的通知
  }
  // 合并更新后的实体和新添加的实体
  const newResult = [...updatedEntities, ...newlyMatchedEntities];
  // 通知查询任务结果已更新
  task.next(newResult, true);
};

/**
 * 处理 findAncestors 查询的增量更新
 *
 * UPDATE 场景下的复杂性:
 * 1. 目标实体的祖先链路可能因为其他实体的 parentId 变化而改变
 * 2. 实体可能从不是祖先变成祖先，或从祖先变成非祖先
 * 3. 实体仍然是祖先，但字段值变化
 * 4. 目标实体本身也是结果的一部分（level=0）
 *
 * 特殊情况:
 * - 如果目标实体的 parentId 变化，整个祖先链都会改变，需要完全刷新
 *
 * @param task 查询任务
 * @param data 更新的实体数据列表
 * @param classification 更新分类结果
 * @param cache 更新数据缓存
 */
export const handleFindAncestorsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID (查询谁的祖先)

  // 构建旧结果集的映射
  const oldResult = Array.from(task.resultEntitySet.values());
  const oldResultMap = new Map<RxDBEntityId, InstanceType<T>>();
  oldResult.forEach(existing => {
    const existingId = getEntityId(existing);
    if (existingId !== undefined) {
      oldResultMap.set(existingId, existing);
    }
  });

  const helper = new TreeHelper(cache, oldResultMap);

  /**
   * 获取目标实体的当前状态
   * 优先从更新数据中获取，否则从旧结果集获取
   */
  const getTargetEntity = (): InstanceType<T> | undefined => {
    if (targetEntityId === null || targetEntityId === undefined) {
      return undefined;
    }
    const targetSerialized = cache.getSerializedUpdate(targetEntityId);
    if (targetSerialized) {
      return targetSerialized;
    }
    return oldResultMap.get(targetEntityId);
  };

  let hasChanges = false;
  const targetUpdated =
    targetEntityId !== null && targetEntityId !== undefined ? classification.updatedIds.has(targetEntityId) : false;
  const targetEventData =
    targetUpdated && targetEntityId !== null && targetEntityId !== undefined ?
      cache.getData(targetEntityId)
    : undefined;
  // 🐛 BUG 修复: 只有当目标实体的 parentId 改变时，才需要重新检查所有祖先
  // key 是否存在不代表值真的变了，必须比较真实值（同 Site 1）。
  const targetParentIdChanged =
    targetEventData &&
    'parentId' in targetEventData.patch &&
    get_tree_parent_id(targetEventData.patch as InstanceType<T>) !==
      get_tree_parent_id(targetEventData.inversePatch as InstanceType<T>);

  // 祖先链是一条自 target 向上的单链。目标自己换父，或链上任一当前已
  // 追踪的祖先节点（在 oldResultMap 中）换父，都会让移动点之上的整段链路发生
  // 变化——旧链路上方的祖先需要摘除，新链路上方的祖先需要补入。但新链路上方
  // 那些节点从未出现在本批 UPDATE 事件里（只有被移动的节点自己变了，它的新
  // 父节点及更上游对本地增量缓存完全陌生），局部只能摘除摘不了新增，无法拼出
  // 正确结果（这也是此前 needRecheckAll 分支的实际缺陷：它只会做旧链路的移除
  // 判断，从不会发现新链路上方的祖先）。只能整体交回 SQL 重算。
  const anyTrackedAncestorMoved = data.some(
    d =>
      oldResultMap.has(d.id as RxDBEntityId) &&
      'parentId' in d.patch &&
      get_tree_parent_id(d.patch as InstanceType<T>) !== get_tree_parent_id(d.inversePatch as InstanceType<T>)
  );
  if (targetParentIdChanged || anyTrackedAncestorMoved) {
    task.refresh();
    return;
  }

  // 走到这里说明本批没有任何祖先链位置发生变化（上面已提前 refresh），
  // 剩下的移除原因只可能是纯 where 匹配翻转。
  const afterRemoval = oldResult.filter(entity => {
    const entityId = getEntityId(entity);
    if (entityId === undefined) return true;

    if (classification.newlyUnmatchedIds.has(entityId)) {
      hasChanges = true;
      return false;
    }
    return true; // 保留该实体
  });

  const updatedEntities = afterRemoval.map(entity => {
    const entityId = getEntityId(entity);
    if (entityId !== undefined && classification.updatedIds.has(entityId)) {
      const eventData = cache.getData(entityId);
      if (eventData) {
        applyExternalEntityUpdate(entity, eventData.patch);
        hasChanges = true;
      }
    }
    return entity;
  });

  const newlyMatchedEntities: InstanceType<T>[] = [];
  classification.newlyMatchedIds.forEach(id => {
    const serialized = cache.getSerializedUpdate(id);
    if (!serialized) return;

    const targetEntity = getTargetEntity();
    // 是祖先 → 添加
    if (targetEntity && helper.isEntityAncestor(targetEntity, serialized)) {
      hasChanges = true;
      newlyMatchedEntities.push(serialized);
      oldResultMap.set(id, serialized);
    }
  });

  // findAncestors 总是包含目标实体本身（level=0）
  const targetEntity = getTargetEntity();
  if (targetEntity) {
    const targetId = getEntityId(targetEntity);
    if (targetId !== undefined) {
      const targetInResult =
        updatedEntities.some(e => getEntityId(e) === targetId) ||
        newlyMatchedEntities.some(e => getEntityId(e) === targetId);
      if (!targetInResult) {
        hasChanges = true;
        updatedEntities.push(targetEntity);
      }
    }
  }

  if (!hasChanges) {
    return; // 没有变化，直接返回
  }

  // 合并更新后的实体和新添加的实体
  const newResult = [...updatedEntities, ...newlyMatchedEntities];

  // 通知查询任务结果已更新
  task.next(newResult, true);
};

/**
 * 处理 countDescendants 查询的增量更新
 *
 * 计数查询的特点:
 * - 只需要返回数量，不需要返回具体实体
 * - 需要精确计算增减变化
 * - 如果无法确定关系（父实体链中断），则触发 SQL 刷新
 *
 * UPDATE 场景下的计数变化:
 * 1. 实体的 parentId 变化 → 可能从非后代变为后代，或相反
 * 2. 实体从不匹配变为匹配 where 条件 → 如果是后代，计数+1
 * 3. 实体从匹配变为不匹配 where 条件 → 如果是后代，计数-1
 *
 * @param task 查询任务
 * @param data 更新的实体数据列表
 * @param classification 更新分类结果
 * @param cache 更新数据缓存
 * @param where where 条件
 * @param isEntityMatchWhere 检查实体是否匹配 where 条件的函数
 */
export const handleCountDescendantsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>,
  where: RuleGroup<InstanceType<T>> | null | undefined,
  isEntityMatchWhere: (entity: InstanceType<T> | null | undefined, where: RuleGroup<InstanceType<T>>) => boolean
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID
  const currentCount = (task.result as number) || 0; // 当前计数

  const oldResultMap = new Map<RxDBEntityId, InstanceType<T>>();
  const helper = new TreeHelper(cache, oldResultMap);

  let needsRefresh = false; // 是否需要触发 SQL 刷新
  let countChange = 0; // 计数变化量

  // 遍历所有更新的实体，计算计数变化
  for (const updateData of data) {
    // where 判定必须基于"完整实体"。裸 inversePatch 只含被改字段，复合 where
    // （涉及未被本次 update 修改的字段）下会缺字段误判，导致计数静默偏差。
    const beforeEntity = cache.getSerializedBefore(updateData.id as RxDBEntityId, updateData.inversePatch);
    const matchedBefore = !where || isEntityMatchWhere(beforeEntity, where);
    const isDescendantBefore = helper.isEntityDescendantForCount(beforeEntity, targetEntityId);

    // 无法确定更新前的后代关系 → 触发刷新
    if (isDescendantBefore === undefined) {
      needsRefresh = true;
      break;
    }

    // 更新前: 匹配条件 且 是后代 → 计入计数
    const wasDescendantBefore = matchedBefore && isDescendantBefore;

    // 同理，更新后的 where 判定也用完整的更新后实体，而非裸 patch。
    const afterEntity = cache.getSerializedUpdate(updateData.id as RxDBEntityId);
    const matchesNow = !where || isEntityMatchWhere(afterEntity, where);
    const isDescendantNowResult = helper.isEntityDescendantForCount(afterEntity, targetEntityId);

    // 无法确定更新后的后代关系 → 触发刷新
    if (isDescendantNowResult === undefined) {
      needsRefresh = true;
      break;
    }

    // 树成员关系本身（不看 where）因 parentId 变化而翻转，说明这个节点
    // 跨越了 scope 边界——它此前/此后可能带着一批未出现在本批事件里的既有子孙一起
    // 进出 scope。count 只是个数字，没有实体级追踪，无法知道被带动的子孙有多少个，
    // 局部 ±1 只会按"这一个节点"计数、漏掉整棵子树（review 描述的"count 只加减 1"）。
    // 纯 where 匹配翻转（parentId 未变）不受影响，仍走下面的 ±1 快速路径。
    // key 是否存在不代表值真的变了，必须比较真实值（同 Site 1）。
    const hasParentIdChanged =
      'parentId' in updateData.patch &&
      get_tree_parent_id(updateData.patch as InstanceType<T>) !==
        get_tree_parent_id(updateData.inversePatch as InstanceType<T>);
    if (hasParentIdChanged && isDescendantBefore !== isDescendantNowResult) {
      needsRefresh = true;
      break;
    }

    // 更新后: 匹配条件 且 是后代 → 计入计数
    const isDescendantNow = matchesNow && isDescendantNowResult;

    if (isDescendantNow && !wasDescendantBefore) {
      countChange++; // 新增后代
    } else if (!isDescendantNow && wasDescendantBefore) {
      countChange--; // 减少后代
    }
    // 否则: 更新前后都是后代 或 都不是后代 → 计数不变
  }

  if (needsRefresh) {
    // 无法准确计算，触发 SQL 刷新
    task.refresh();
  } else if (countChange !== 0) {
    // 如果计数有变化，更新结果
    const newCount = Math.max(0, currentCount + countChange);
    task.next(newCount);
  }
  // 否则: 计数没有变化，不需要通知
};

/**
 * 处理 countAncestors 查询的增量更新
 *
 * 计数查询的特点:
 * - 只需要返回数量，不需要返回具体实体
 * - 需要精确计算增减变化
 * - 如果无法确定关系（父实体链中断）或目标实体的 parentId 变化，则触发 SQL 刷新
 *
 * UPDATE 场景下的计数变化:
 * 1. 目标实体的 parentId 变化 → 整个祖先链改变，必须触发刷新
 * 2. 其他实体的 parentId 变化 → 可能从非祖先变为祖先，或相反
 * 3. 实体从不匹配变为匹配 where 条件 → 如果是祖先，计数+1
 * 4. 实体从匹配变为不匹配 where 条件 → 如果是祖先，计数-1
 *
 * @param task 查询任务
 * @param data 更新的实体数据列表
 * @param classification 更新分类结果
 * @param cache 更新数据缓存
 * @param where where 条件
 * @param isEntityMatchWhere 检查实体是否匹配 where 条件的函数
 */
export const handleCountAncestorsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>,
  where: RuleGroup<InstanceType<T>> | null | undefined,
  isEntityMatchWhere: (entity: InstanceType<T> | null | undefined, where: RuleGroup<InstanceType<T>>) => boolean
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID
  const currentCount = (task.result as number) || 0; // 当前计数

  if (targetEntityId === null || targetEntityId === undefined) {
    // 目标实体ID无效，触发刷新
    task.refresh();
    return;
  }

  const targetUpdate = cache.getData(targetEntityId);
  if (!targetUpdate) {
    // 目标实体不在更新中，我们无法准确判断祖先关系
    // 触发 SQL 刷新
    task.refresh();
    return;
  }

  const oldResultMap = new Map<RxDBEntityId, InstanceType<T>>();
  const helper = new TreeHelper(cache, oldResultMap);

  // 获取目标实体更新前后的状态
  const targetBefore = cache.getSerializedBefore(targetUpdate.id as RxDBEntityId, targetUpdate.inversePatch);
  const targetAfter = cache.getSerializedUpdate(targetUpdate.id as RxDBEntityId);

  if (!targetBefore || !targetAfter) {
    task.refresh();
    return;
  }

  const targetParentIdBefore = get_tree_parent_id(targetBefore);
  const targetParentIdAfter = get_tree_parent_id(targetAfter);

  // 如果目标实体的 parentId 发生变化，祖先链会完全改变
  // 必须触发 SQL 刷新以获取新的祖先列表
  if (targetParentIdBefore !== targetParentIdAfter) {
    task.refresh();
    return;
  }

  let countChange = 0; // 计数变化量
  let needsRefresh = false; // 是否需要触发 SQL 刷新

  // 缓存祖先判断结果，避免重复计算
  // key: entityId, value: { before: 更新前是否为祖先, after: 更新后是否为祖先 }
  const ancestorCache = new Map<RxDBEntityId, { before?: boolean | undefined; after?: boolean | undefined }>();

  for (const updateData of data) {
    const entityId = updateData.id as RxDBEntityId;

    // 跳过目标实体本身（目标实体不是自己的祖先）
    if (entityId === targetEntityId) {
      continue;
    }

    // 获取或初始化缓存条目
    let cacheEntry = ancestorCache.get(entityId);
    if (!cacheEntry) {
      cacheEntry = {};
      ancestorCache.set(entityId, cacheEntry);
    }

    // where 判定必须基于"完整实体"。裸 inversePatch 只含被改字段，复合 where
    // （涉及未被本次 update 修改的字段）下会缺字段误判，导致计数静默偏差。
    const entityBefore = cache.getSerializedBefore(entityId, updateData.inversePatch);
    const matchedBefore = !where || isEntityMatchWhere(entityBefore, where);
    if (cacheEntry.before === undefined) {
      cacheEntry.before = helper.isEntityAncestorForCount(targetBefore, entityBefore);
    }
    const wasAncestorBefore = cacheEntry.before;

    // 无法确定更新前的祖先关系 → 触发刷新
    if (wasAncestorBefore === undefined) {
      needsRefresh = true;
      break;
    }

    // 这个实体本身就是 target 的既有祖先，且它自己的 parentId 又变了——
    // 它上方的链路整体发生位移（旧链路上方的祖先需要退出计数，新链路上方的祖先
    // 需要计入）。target 走到这个实体为止的路径不受影响（该实体本身是否仍是
    // target 的祖先，只取决于它和 target 之间的节点，与它自己的父节点无关），
    // 所以下面基于 before/after 的 ±1 对这个实体自身永远算不出变化——真正的变化
    // 全部发生在它上方、完全不在本批事件里的节点上，per-entity 的 ±1 结构性地
    // 看不到，必须整体刷新（对应 review 的"count 只加减 1"）。
    // key 是否存在不代表值真的变了，必须比较真实值（同 Site 1）。
    const hasParentIdChanged =
      'parentId' in updateData.patch &&
      get_tree_parent_id(updateData.patch as InstanceType<T>) !==
        get_tree_parent_id(updateData.inversePatch as InstanceType<T>);
    if (wasAncestorBefore && hasParentIdChanged) {
      needsRefresh = true;
      break;
    }

    // 同理，更新后的 where 判定也用完整的更新后实体，而非裸 patch。
    const entityAfter = cache.getSerializedUpdate(entityId);
    const matchesNow = !where || isEntityMatchWhere(entityAfter, where);
    if (cacheEntry.after === undefined) {
      cacheEntry.after = helper.isEntityAncestorForCount(targetAfter, entityAfter);
    }
    const isAncestorNow = cacheEntry.after;

    // 无法确定更新后的祖先关系 → 触发刷新
    if (isAncestorNow === undefined) {
      needsRefresh = true;
      break;
    }

    // 更新前: 匹配条件 且 是祖先 → 计入计数
    const wasCountedBefore = matchedBefore && wasAncestorBefore;
    // 更新后: 匹配条件 且 是祖先 → 计入计数
    const isCountedNow = matchesNow && isAncestorNow;

    if (isCountedNow && !wasCountedBefore) {
      countChange++; // 新增祖先
    } else if (!isCountedNow && wasCountedBefore) {
      countChange--; // 减少祖先
    }
    // 否则: 更新前后都是祖先 或 都不是祖先 → 计数不变
  }

  if (needsRefresh) {
    // 无法准确计算，触发 SQL 刷新
    task.refresh();
  } else if (countChange !== 0) {
    // 如果计数有变化，更新结果
    const newCount = Math.max(0, currentCount + countChange);
    task.next(newCount);
  }
  // 否则: 计数没有变化，不需要通知
};
