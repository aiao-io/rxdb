import {
  applyExternalEntityUpdate,
  EntityType,
  getEntityId,
  QueryTask,
  RxDBEntityId,
  RxDBEntityLocalUpdatedEventData,
  UpdateClassification,
  UpdateDataCache
} from '@aiao/rxdb';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { get_tree_parent_id, hasTreeParentChanged } from './query-tree.utils.js';
import { resolveAncestorForCount, TreeHelper } from './tree-helper.js';

/**
 * 一个**已在结果集中**的实体在本批 UPDATE 后的去留判定
 *
 * - `keep` 留在结果里
 * - `drop-unmatched` 因 where 命中翻转而移除（不牵连子树）
 * - `drop-moved` 因改父移出子树而移除（其名下未被直接更新的子孙要做孤儿复查）
 * - `refresh` 本地判不了，交回 SQL 重算
 */
type DescendantVerdict = 'keep' | 'drop-unmatched' | 'drop-moved' | 'refresh';

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

  /**
   * 该实体是否是递归 CTE 的**基准成员**行。
   *
   * 适配器生成的 SQL 里，基准成员是 `WHERE id = ?`（指定了 entityId）或
   * `WHERE parentId IS NULL`（查全树），**既不带 where 规则、也不带
   * `c.__level < N`** —— 两者只挂在递归成员上。所以锚点（或查全树时的各个根节点）
   * 无论 where 命中怎么翻转、自身 parentId 怎么改，SQL 重跑都照样返回它。
   * 增量合并必须同口径，否则本地会摘掉一行 SQL 一定会给的记录。
   */
  const isTreeAnchor = (entityId: RxDBEntityId, current: InstanceType<T>): boolean =>
    targetEntityId === null || targetEntityId === undefined ?
      get_tree_parent_id(current) === null
    : entityId === targetEntityId;

  /**
   * 判定一个**已在结果集中**的实体在本批 UPDATE 后的去留。
   *
   * 抽成独立函数有两个理由：把原先的五层分支链压回三层以内（AGENTS.md 铁律），
   * 以及让「序列化缺失」能表达成 {@link DescendantVerdict} 的 `refresh`
   * —— `filter` 回调只能回布尔值，当初正是这个限制逼出了用裸 patch 合成假实体的兜底。
   */
  const verdictForExisting = (entityId: RxDBEntityId, entity: InstanceType<T>): DescendantVerdict => {
    if (!classification.updatedIds.has(entityId)) return 'keep';

    // 情况0: 基准成员恒在结果中 —— where 翻转与自身改父都不能把它摘掉。
    // 锚点自己改父时，下面"是否仍是自己的后代"必然判否（节点不是自己的后代），
    // 会把锚点连同整棵子树（孤儿复查）一起清空，而 SQL 其实一行没少。
    if (isTreeAnchor(entityId, cache.getSerializedUpdate(entityId) ?? entity)) return 'keep';

    // 情况1: 实体从匹配变为不匹配 where 条件 → 移除
    if (classification.newlyUnmatchedIds.has(entityId)) return 'drop-unmatched';

    // 情况2: 实体更新后仍然匹配，检查是否还是后代且在 level 范围内
    if (!classification.matchNowIds.has(entityId)) return 'keep';

    const eventData = cache.getData(entityId);
    if (!eventData || !hasTreeParentChanged(eventData)) return 'keep';

    // 序列化结果是"这个节点现在挂在哪"的唯一可信来源：`QueryManager.#serialize` 带
    // P0-004 单调性守卫，迟到事件会原样返回缓存中的实体。取不到就说明本地根本不知道
    // 它当前的位置 —— 用裸 patch 合成一个只有 `{ id, parentId }` 的假实体去走树，
    // 走出来的层级没有依据（假实体没有真实父链，`isEntityDescendant` 只能靠
    // patch 里那一跳）。交回 SQL 重算，不猜。
    const updatedEntity = cache.getSerializedUpdate(entityId);
    if (!updatedEntity) return 'refresh';

    const { isDescendant, level: entityLevel } = helper.isEntityDescendant(updatedEntity, targetEntityId);
    return isDescendant && (level === undefined || entityLevel <= level) ? 'keep' : 'drop-moved';
  };

  let needsRefresh = false;
  const afterRemoval = oldResult.filter(entity => {
    const entityId = getEntityId(entity);
    if (entityId === undefined) return true; // 无ID的实体保留（理论上不应该出现）

    const verdict = verdictForExisting(entityId, entity);
    if (verdict === 'refresh') {
      needsRefresh = true;
      return true;
    }
    if (verdict === 'keep') return true;
    if (verdict === 'drop-moved') removedDueToMove.add(entityId);
    hasChanges = true;
    return false;
  });

  if (needsRefresh) {
    task.refresh();
    return;
  }

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

    // 批级记忆：兄弟节点共享同一条父链，逐节点从头回溯是 O(n·depth)（拖拽流程每次都触发）。
    // `orphanMemo` 记「这个 id 是否已因自身或某个祖先被移出子树而脱离结果集」。
    // 走链时把"结论未知"的节点收进 `chain` —— 它们都是同一个断点/终点的后代，
    // 共享同一个结论，循环结束后统一回填，整批摊平成 O(n)。
    // 与 `merge_remove.ts` 的级联判定同构。
    const orphanMemo = new Map<RxDBEntityId, boolean>();
    const isOrphaned = (entity: InstanceType<T>): boolean => {
      const entityId = getEntityId(entity);
      const cached = entityId === undefined ? undefined : orphanMemo.get(entityId);
      if (cached !== undefined) return cached;

      const chain: RxDBEntityId[] = entityId === undefined ? [] : [entityId];
      let orphaned = false;
      let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
      const visited = new Set<RxDBEntityId>();
      while (currentParentId !== null && !visited.has(currentParentId)) {
        const known = orphanMemo.get(currentParentId);
        if (known !== undefined) {
          orphaned = known; // 这条链的上半段之前算过
          break;
        }
        if (removedDueToMove.has(currentParentId)) {
          orphaned = true; // 父链穿过被移出节点
          break;
        }
        if (currentParentId === targetEntityId) break; // 仍连到目标
        visited.add(currentParentId);
        chain.push(currentParentId);
        const parent = resolveParent(currentParentId);
        if (!parent) break; // 链路缺失，保守保留
        currentParentId = get_tree_parent_id<RxDBEntityId>(parent);
      }

      // `chain` 里只有"既没被移出、也不是 target"的节点：它们各自的父链就是本次走过的
      // 剩余后缀，结论与起点完全一致。链路断裂或循环时结论是 false（保守保留）。
      for (const id of chain) orphanMemo.set(id, orphaned);
      return orphaned;
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

  // 筛选出需要检查的实体: 更新后匹配 where 条件、不在旧结果集中、且父节点真的动了。
  // 父没动就不可能「新成为后代」；判据走 `hasTreeParentChanged` 这一处实现，
  // 不在这里重抄 —— 抄一份就等于给 null/undefined 归一再开一个分叉口（F-11）。
  const entitiesToCheck = data.filter(
    d =>
      classification.matchNowIds.has(d.id as RxDBEntityId) &&
      !oldResultMap.has(d.id as RxDBEntityId) &&
      hasTreeParentChanged(d)
  );

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
          // 检查是否已经在结果中（可能在前面步骤已添加）。
          // `oldResultMap` 已经是这个问题的完整答案：旧结果集的全部成员建图时就已入表，
          // 新加入的成员在 push 的同一步 `set` 进去。此前那两次线性 `.some()` 扫描
          // （O(N×M)）覆盖的是 `oldResultMap` 的真子集，纯属冗余。
          if (!oldResultMap.has(entityId)) {
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
  const level = options.level; // 层级上限 (undefined 表示无限制)

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

  // 祖先链是一条自 target 向上的单链。本批内**任一**节点换父，都会让移动点之上的
  // 整段链路发生变化——旧链路上方的祖先需要摘除，新链路上方的祖先需要补入。但新链路
  // 上方那些节点从未出现在本批 UPDATE 事件里（只有被移动的节点自己变了，它的新父节点
  // 及更上游对本地增量缓存完全陌生），局部只能摘除摘不了新增，无法拼出正确结果
  // （这也是此前 needRecheckAll 分支的实际缺陷：它只会做旧链路的移除判断，
  // 从不会发现新链路上方的祖先）。只能整体交回 SQL 重算。
  //
  // 判定范围必须是整批，而不能只看「target 自己」或「已在结果集里的祖先」：链上一个
  // 不匹配 where、因而不在结果集里的中间节点改父，同样会让它上方的祖先整体进出结果。
  // 这条规则与 `merge_update` 入口处的守卫是同一条（共用 `hasTreeParentChanged`），
  // 入口那层先拦一道，是因为这类节点连 recalculate 的门都进不来。
  if (data.some(hasTreeParentChanged)) {
    task.refresh();
    return;
  }

  let hasChanges = false;

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
    // 是祖先 且 在层级范围内 → 添加。
    // 层级必须传：适配器递归成员带 `c.__level < level`，超出上限的祖先 SQL 不会返回，
    // 本地补进去就会比 SQL 多行（默认 level=0 时连直接父节点都不该出现）。
    if (targetEntity && helper.isEntityAncestor(targetEntity, serialized, level)) {
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
 */
export const handleCountDescendantsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID
  const currentCount = (task.result as number) || 0; // 当前计数

  const { level } = options; // 层级上限，口径同 FindTreeOptions.level（含当前节点）

  const oldResultMap = new Map<RxDBEntityId, InstanceType<T>>();
  const helper = new TreeHelper(cache, oldResultMap);

  // 只在给了 level 时才按深度过滤：没给 level 就是「不限层级」，
  // 沿用只判后代关系的旧路径，免得为了算深度而多要一次父链（要不到就得回 SQL）。
  const isCountedDescendant = (entity: InstanceType<T> | null | undefined): boolean | undefined => {
    if (level === undefined) return helper.isEntityDescendantForCount(entity, targetEntityId);
    const resolved = helper.descendantDepthForCount(entity, targetEntityId);
    if (resolved === undefined) return undefined;
    return resolved.isDescendant && resolved.depth <= level;
  };

  /**
   * 该实体是否是递归 CTE 的基准成员行（口径同 {@link handleFindDescendantsUpdate}）。
   *
   * 基准成员不过 where 也不过 level。查全树（`entityId` 为空）时它是所有根节点，
   * 而这条分支的 SQL 是裸 `count(*)` —— 根节点恒被计入，where 命中翻转不改变计数。
   * 指定了 `entityId` 时基准成员只有目标自己，而 SQL 用 `max(count(*)-1, 0)` 把它减掉，
   * 净贡献为 0，因此这里恒为 false。
   */
  const isTreeBaseMember = (entity: InstanceType<T> | null | undefined): boolean =>
    (targetEntityId === null || targetEntityId === undefined) && !!entity && get_tree_parent_id(entity) === null;

  let needsRefresh = false; // 是否需要触发 SQL 刷新
  let countChange = 0; // 计数变化量

  // 遍历所有更新的实体，计算计数变化
  for (const updateData of data) {
    const entityId = updateData.id as RxDBEntityId;
    // where 判定必须基于"完整实体"，而 `classification` 正是拿
    // `getSerializedBefore` / `getSerializedUpdate` 出来的完整实体跑同一个
    // `isEntityMatchWhere` 算出来的（见 `classifyUpdates`）。直接读它的结论，
    // 不在这里重算第二遍。
    const beforeEntity = cache.getSerializedBefore(entityId, updateData.inversePatch);
    const matchedBefore = classification.matchBeforeIds.has(entityId);
    const isDescendantBefore = isCountedDescendant(beforeEntity);

    // 无法确定更新前的后代关系 → 触发刷新
    if (isDescendantBefore === undefined) {
      needsRefresh = true;
      break;
    }

    // 更新前: 匹配条件 且 是后代 → 计入计数（基准成员豁免 where）
    const wasDescendantBefore = isTreeBaseMember(beforeEntity) || (matchedBefore && isDescendantBefore);

    const afterEntity = cache.getSerializedUpdate(entityId);
    const matchesNow = classification.matchNowIds.has(entityId);
    // 后代判定只读起点自身的 parentId，往上每一跳读的都是 `getSerializedUpdate`
    // （更新后的祖先）。起点 parentId 没变，这趟走链与 before 那趟逐跳等价，
    // 结论必然相同 —— 直接复用，不重走。
    const parentUnchanged = !!afterEntity && get_tree_parent_id(beforeEntity) === get_tree_parent_id(afterEntity);
    const isDescendantNowResult = parentUnchanged ? isDescendantBefore : isCountedDescendant(afterEntity);

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
    if (hasTreeParentChanged(updateData) && isDescendantBefore !== isDescendantNowResult) {
      needsRefresh = true;
      break;
    }

    // 更新后: 匹配条件 且 是后代 → 计入计数（基准成员豁免 where）
    const isDescendantNow = isTreeBaseMember(afterEntity) || (matchesNow && isDescendantNowResult);

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
    // autoCache 必须传 false：`QueryTask#next` 在 autoCache=true 时无条件清空
    // `resultEntityIds`（清空逻辑在类型分支之外），而 count 结果是个 number，
    // 不会重新填充它。沿用默认值会把跨批次去重集合抹掉，同一实体被重复计数。
    // 与 merge_create.ts / merge_remove.ts 的 count 分支同口径。
    task.next(newCount, false);
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
 */
export const handleCountAncestorsUpdate = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalUpdatedEventData<T>[],
  classification: UpdateClassification,
  cache: UpdateDataCache<T>
) => {
  const options = task.options as FindTreeOptions<T>;
  const targetEntityId = options.entityId as RxDBEntityId | null | undefined; // 目标实体ID
  const currentCount = (task.result as number) || 0; // 当前计数
  const { level } = options; // 层级上限，口径同 FindTreeOptions.level

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

  // 目标的父链在本批内不变（上面 parentId 比对不等就已经 refresh 走了），链上每一跳
  // 读的又都是 `getSerializedUpdate`，于是 before / after 两趟走链逐跳等价，整批候选
  // 面对的是同一条链。走一次收成 Set，候选判定降为 O(1) 查表；此前是每个候选都从
  // target 重走一遍整条链。
  const targetAncestors = helper.collectAncestorIdsForCount(targetAfter, level);

  for (const updateData of data) {
    const entityId = updateData.id as RxDBEntityId;

    // 跳过目标实体本身（目标实体不是自己的祖先）
    if (entityId === targetEntityId) {
      continue;
    }

    // where 判定必须基于"完整实体"，`classification` 已经用
    // `getSerializedBefore` / `getSerializedUpdate` 跑过同一个 `isEntityMatchWhere`，
    // 这里读结论即可（见 `classifyUpdates`）。
    const entityBefore = cache.getSerializedBefore(entityId, updateData.inversePatch);
    const matchedBefore = classification.matchBeforeIds.has(entityId);
    // 候选的 before / after 两份序列化必须分别查：`getEntityId` 可能只在其中一份上有值。
    const wasAncestorBefore = resolveAncestorForCount(targetAncestors, entityBefore);

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
    if (wasAncestorBefore && hasTreeParentChanged(updateData)) {
      needsRefresh = true;
      break;
    }

    const entityAfter = cache.getSerializedUpdate(entityId);
    const matchesNow = classification.matchNowIds.has(entityId);
    const isAncestorNow = resolveAncestorForCount(targetAncestors, entityAfter);

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
    // autoCache 必须传 false：`QueryTask#next` 在 autoCache=true 时无条件清空
    // `resultEntityIds`（清空逻辑在类型分支之外），而 count 结果是个 number，
    // 不会重新填充它。沿用默认值会把跨批次去重集合抹掉，同一实体被重复计数。
    // 与 merge_create.ts / merge_remove.ts 的 count 分支同口径。
    task.next(newCount, false);
  }
  // 否则: 计数没有变化，不需要通知
};
