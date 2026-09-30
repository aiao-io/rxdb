import { EntityType, getEntityId, RxDBEntityId, UpdateDataCache } from '@aiao/rxdb';
import { get_tree_parent_id } from './query-tree.utils.js';

/**
 * 目标实体的祖先 id 集合，{@link TreeHelper.collectAncestorIdsForCount} 的产物
 */
export interface TreeAncestorIdSet {
  /** 自目标向上、`maxLevel` 以内解析到的全部祖先 id */
  ids: ReadonlySet<RxDBEntityId>;
  /**
   * 父链是否走到了尽头。
   *
   * `false` 表示中途有一环取不到实体 —— 集合**之外**的候选无从判定，只能回 SQL；
   * 集合**之内**的候选仍是确定的 `true`（走链在断点之前就已经经过它）。
   */
  complete: boolean;
}

/**
 * 用预先收集的祖先集合判定单个候选实体（`count` 口径）
 *
 * @param ancestors {@link TreeHelper.collectAncestorIdsForCount} 的结果
 * @param candidateEntity 候选祖先实体
 * @returns true=是祖先, false=不是祖先, undefined=无法确定（调用方回 SQL 重算）
 */
export const resolveAncestorForCount = <T extends EntityType>(
  ancestors: TreeAncestorIdSet,
  candidateEntity: InstanceType<T> | null | undefined
): boolean | undefined => {
  const candidateId = getEntityId(candidateEntity);
  if (candidateId === undefined) {
    return undefined; // 候选实体ID不存在
  }
  if (ancestors.ids.has(candidateId)) {
    return true;
  }
  return ancestors.complete ? false : undefined;
};

/**
 * 树形结构辅助函数管理器
 *
 * 提供树形查询所需的核心功能：
 * - 解析父实体引用
 * - 判断后代/祖先关系（普通 + count 专用变体）
 * - 支持层级限制和循环检测
 *
 * @template T 实体类型
 *
 * @internal 由 merge-update-tree.ts 的 handle*Update 函数使用
 */
export class TreeHelper<T extends EntityType> {
  constructor(
    private cache: UpdateDataCache<T>,
    private oldResultMap: Map<RxDBEntityId, InstanceType<T>>
  ) {}

  /**
   * 解析父实体
   *
   * 从更新缓存或旧结果集中获取父实体，避免重复查询数据库
   *
   * @param id 父实体ID
   * @returns 父实体实例，如果不存在则返回 undefined
   *
   * @remarks
   * **更新缓存优先，旧结果集兜后**。`oldResultMap` 是本批事件**之前**的快照；
   * 同一批里父节点自己也被移动时（`Y.parentId A→null` 与 `M.parentId Z→Y` 同批到达），
   * 先读旧结果集会顺着过期的 `parentId` 往上走，把已经移出子树的节点判成仍在子树内。
   * `cache.getSerializedUpdate` 给的是本批应用后的状态，与 `merge-update-tree.ts`
   * 孤儿复查里的 `resolveParent` 同口径。
   */
  resolveParentEntity(id: RxDBEntityId): InstanceType<T> | undefined {
    // 本批更新后的状态优先
    const serialized = this.cache.getSerializedUpdate(id);
    if (serialized) {
      this.oldResultMap.set(id, serialized);
      return serialized;
    }
    // 未被本批更新：回旧结果集取已序列化的实体
    return this.oldResultMap.get(id);
  }

  /**
   * 检查实体是否是目标实体的后代
   *
   * 从实体向上遍历父级链，检查是否能到达目标实体
   * 包含循环检测，防止无限递归
   *
   * @param entity 要检查的实体
   * @param targetEntityId 目标实体ID (潜在的祖先)，为 null 或 undefined 时表示查找所有树（所有节点都有效）
   * @returns 包含是否为后代和层级深度的对象
   */
  isEntityDescendant(
    entity: InstanceType<T>,
    targetEntityId: RxDBEntityId | null | undefined
  ): { isDescendant: boolean; level: number } {
    // 特殊情况：当 targetEntityId 为 null 或 undefined 时，表示查询所有树
    // 此时所有节点都是有效的（包括根节点和子节点）
    if (targetEntityId === null || targetEntityId === undefined) {
      // 计算层级：根节点层级为 0，子节点层级根据到根节点的距离计算
      let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
      let level = 0;
      const visited = new Set<RxDBEntityId>();

      while (currentParentId !== null && !visited.has(currentParentId)) {
        level++;
        visited.add(currentParentId);
        const parent = this.resolveParentEntity(currentParentId);
        if (parent) {
          currentParentId = get_tree_parent_id<RxDBEntityId>(parent);
        } else {
          break;
        }
      }

      return { isDescendant: true, level };
    }

    let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
    const visited = new Set<RxDBEntityId>(); // 防止循环引用
    let currentLevel = 0;

    // 向上遍历父级链
    while (currentParentId !== null && !visited.has(currentParentId)) {
      currentLevel++;
      // 找到目标实体，确认是后代
      if (currentParentId === targetEntityId) {
        return { isDescendant: true, level: currentLevel };
      }
      visited.add(currentParentId);

      // 解析并继续向上查找
      const parent = this.resolveParentEntity(currentParentId);
      if (parent) {
        currentParentId = get_tree_parent_id<RxDBEntityId>(parent);
      } else {
        break; // 父实体不存在，停止遍历
      }
    }
    return { isDescendant: false, level: 0 };
  }

  /**
   * 检查实体是否是目标的祖先
   *
   * 从目标实体向上遍历父级链，检查是否能到达候选实体
   *
   * @param targetEntity 目标实体 (要查找其祖先)
   * @param candidateEntity 候选祖先实体
   * @param maxLevel 层级上限，口径同 `FindTreeOptions.level`：目标自身为 0、父节点为 1。
   *   `undefined` 表示不限层级。
   * @returns true 表示候选实体是目标的祖先
   *
   * @remarks
   * `maxLevel` 不是可选的性能优化，而是正确性要求：调用方给了 `level` 时，
   * 适配器的递归成员带 `c.__level < level`，`__level` 超出上限的祖先 SQL 根本不会返回；
   * 这里不跟着截断就会把深处的祖先并进增量结果，与全量刷新分叉。
   * 调用方没给 `level`（不限深度）时传 `undefined`，两边都走到根。
   */
  isEntityAncestor(targetEntity: InstanceType<T>, candidateEntity: InstanceType<T>, maxLevel?: number): boolean {
    const candidateId = getEntityId(candidateEntity);
    if (candidateId === undefined) {
      return false;
    }

    // 实体不是自己的祖先
    if (candidateId === getEntityId(targetEntity)) {
      return false;
    }

    let currentParentId = get_tree_parent_id<RxDBEntityId>(targetEntity);
    const visited = new Set<RxDBEntityId>(); // 防止循环引用
    let level = 0; // 距目标实体的跳数：父节点为 1

    // 从目标实体向上遍历
    while (currentParentId !== null && !visited.has(currentParentId)) {
      level++;
      // 超出层级上限：再往上的节点 SQL 都不会返回，无需继续遍历
      if (maxLevel !== undefined && level > maxLevel) {
        return false;
      }
      // 找到候选实体，确认是祖先
      if (currentParentId === candidateId) {
        return true;
      }
      visited.add(currentParentId);

      // 解析并继续向上查找
      const parent = this.resolveParentEntity(currentParentId);
      if (parent) {
        currentParentId = get_tree_parent_id<RxDBEntityId>(parent);
      } else {
        break; // 父实体不存在，停止遍历
      }
    }

    return false; // 未找到候选实体
  }

  /**
   * 检查实体是否是目标的后代 (用于 count 查询)
   *
   * 与 isEntityDescendant 类似，但返回 undefined 表示无法确定
   * 当父实体链中有实体不在更新数据中时，无法继续追踪，返回 undefined
   * 此时需要触发 SQL 刷新以获取准确结果
   *
   * @param entity 要检查的实体
   * @param targetEntityId 目标实体ID，为 null 或 undefined 时表示查找所有树（所有节点都有效）
   * @returns true=是后代, false=不是后代, undefined=无法确定
   */
  isEntityDescendantForCount(
    entity: InstanceType<T> | null | undefined,
    targetEntityId: RxDBEntityId | null | undefined
  ): boolean | undefined {
    if (!entity) {
      return undefined; // 实体不存在，无法判断
    }

    // 特殊情况：当 targetEntityId 为 null 或 undefined 时，表示查询所有树
    // 此时所有节点都是有效的（包括根节点和子节点）
    if (targetEntityId === null || targetEntityId === undefined) {
      return true;
    }

    let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
    const visited = new Set<RxDBEntityId>(); // 防止循环引用

    while (currentParentId !== null && !visited.has(currentParentId)) {
      // 找到目标实体，确认是后代
      if (currentParentId === targetEntityId) {
        return true;
      }
      visited.add(currentParentId);

      // 尝试从更新数据中获取父实体
      const parentEntity = this.cache.getSerializedUpdate(currentParentId);
      if (parentEntity) {
        currentParentId = get_tree_parent_id<RxDBEntityId>(parentEntity);
      } else {
        // 父实体不在更新数据中，无法继续追踪，返回 undefined
        return undefined;
      }
    }

    return false; // 到达根节点仍未找到目标实体
  }

  /**
   * 计算实体相对目标实体的后代深度 (用于 count 查询)
   *
   * @param entity 要检查的实体
   * @param targetEntityId 目标实体ID；为 null 或 undefined 时表示查询所有树，深度从根节点算起
   * @returns `{ isDescendant, depth }`；无法确定时返回 `undefined`
   *
   * @remarks
   * {@link isEntityDescendantForCount} 只回答「是不是后代」，答不出「隔了几层」，
   * 于是 `countDescendants` 的 `level` 限制在增量合并里整个缺席：`{ entityId, level: 0 }`
   * （只数目标节点自己，后代一个都不算）会被一个直接子节点的 where 翻转加成 1。
   *
   * 深度口径与 `FindTreeOptions.level` 一致：给了 `entityId` 时目标节点自身深度为 0、
   * 直接子节点为 1；没给 `entityId` 时根节点深度为 0。调用方用 `depth <= level` 过滤。
   *
   * 与 {@link isEntityDescendantForCount} 一样，父链上任何一环取不到就返回 `undefined`
   * 让调用方回 SQL 重算 —— 深度算不准时不能猜。
   */
  descendantDepthForCount(
    entity: InstanceType<T> | null | undefined,
    targetEntityId: RxDBEntityId | null | undefined
  ): { isDescendant: boolean; depth: number } | undefined {
    if (!entity) {
      return undefined; // 实体不存在，无法判断
    }

    const findsWholeTree = targetEntityId === null || targetEntityId === undefined;
    let currentParentId = get_tree_parent_id<RxDBEntityId>(entity);
    const visited = new Set<RxDBEntityId>(); // 防止循环引用
    let depth = 0;

    while (currentParentId !== null && !visited.has(currentParentId)) {
      depth++;
      if (!findsWholeTree && currentParentId === targetEntityId) {
        return { isDescendant: true, depth };
      }
      visited.add(currentParentId);

      // 尝试从更新数据中获取父实体
      const parentEntity = this.cache.getSerializedUpdate(currentParentId);
      if (!parentEntity) {
        return undefined; // 父实体不在更新数据中，深度无从算起
      }
      currentParentId = get_tree_parent_id<RxDBEntityId>(parentEntity);
    }

    // 走到根节点：查全树时任何节点都算命中，深度即到根的距离；限定了目标则说明不是它的后代
    return findsWholeTree ? { isDescendant: true, depth } : { isDescendant: false, depth };
  }

  /**
   * 收集目标实体的祖先 id 集合 (用于 count 查询)
   *
   * @param targetEntity 目标实体（要查找其祖先）
   * @param maxLevel 层级上限，口径同 {@link isEntityAncestor}；`undefined` 表示不限层级。
   * @returns 祖先 id 集合 + 「父链是否完整」标记，交给 {@link resolveAncestorForCount} 判定候选
   *
   * @remarks
   * `countAncestors` 的目标祖先链在一批事件内是**不变**的（目标自己改父会被调用方
   * 提前 `refresh()` 拦掉），而这条链只取决于起点的 `parentId` 加逐跳的
   * `cache.getSerializedUpdate` —— 对批内每个候选各走一遍是 O(N×depth) 的逐字节重复。
   * 走一次建 Set，候选判定降到 O(1)。
   *
   * 与 {@link isEntityAncestor} 同因，`maxLevel` 不是性能优化而是正确性要求：
   * `countAncestors` 数的是 `__level <= level` 的祖先，不带上限会把超深祖先也计进去。
   * 超出 `maxLevel` 时停止收集并标记 `complete: true` —— 更上方的祖先 SQL 不会返回，
   * 「不是祖先」是能确定的答案，不必为此回一次 SQL。只有父链中途取不到实体
   * 才标记 `complete: false`。环由 `ids` 自身兜住，无需额外的跳数上限。
   */
  collectAncestorIdsForCount(targetEntity: InstanceType<T>, maxLevel?: number): TreeAncestorIdSet {
    // `ids` 同时充当 visited：祖先链上的节点两种身份完全重合，环用它一并兜住
    const ids = new Set<RxDBEntityId>();
    let currentParentId = get_tree_parent_id<RxDBEntityId>(targetEntity);
    let level = 0; // 距目标实体的跳数：父节点为 1

    while (currentParentId !== null && !ids.has(currentParentId)) {
      level++;
      // 超出层级上限：SQL 不会返回更上方的祖先，链到此为止即可
      if (maxLevel !== undefined && level > maxLevel) {
        return { ids, complete: true };
      }
      ids.add(currentParentId);

      // 尝试从更新数据中获取父实体
      const parentEntity = this.cache.getSerializedUpdate(currentParentId);
      if (!parentEntity) {
        return { ids, complete: false }; // 父实体不在更新数据中，无法继续追踪
      }
      currentParentId = get_tree_parent_id<RxDBEntityId>(parentEntity);
    }

    return { ids, complete: true }; // 走到根节点，或被环截断
  }
}
