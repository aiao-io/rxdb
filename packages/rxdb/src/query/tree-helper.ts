import { EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import { UpdateDataCache, getEntityId } from './merge-update.utils.js';
import { get_tree_parent_id } from './query-tree.utils.js';

/**
 * 树遍历的深度上限，防止环或异常深度树拖垮性能
 */
const MAX_TREE_DEPTH = 100;

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
   * 从旧结果集或更新缓存中获取父实体，避免重复查询数据库
   *
   * @param id 父实体ID
   * @returns 父实体实例，如果不存在则返回 undefined
   */
  resolveParentEntity(id: RxDBEntityId): InstanceType<T> | undefined {
    // 优先从旧结果集获取(已经序列化过的实体)
    if (this.oldResultMap.has(id)) {
      return this.oldResultMap.get(id);
    }
    // 从更新缓存中获取并缓存到结果集
    const serialized = this.cache.getSerializedUpdate(id);
    if (serialized) {
      this.oldResultMap.set(id, serialized);
    }
    return serialized;
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
   * @returns true 表示候选实体是目标的祖先
   */
  isEntityAncestor(targetEntity: InstanceType<T>, candidateEntity: InstanceType<T>): boolean {
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

    // 从目标实体向上遍历
    while (currentParentId !== null && !visited.has(currentParentId) && visited.size < MAX_TREE_DEPTH) {
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

    while (currentParentId !== null && !visited.has(currentParentId) && visited.size < MAX_TREE_DEPTH) {
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
   * 检查实体是否是目标的祖先 (用于 count 查询)
   *
   * 与 isEntityAncestor 类似，但返回 undefined 表示无法确定
   *
   * @param targetEntity 目标实体
   * @param candidateEntity 候选祖先实体
   * @returns true=是祖先, false=不是祖先, undefined=无法确定
   */
  isEntityAncestorForCount(
    targetEntity: InstanceType<T>,
    candidateEntity: InstanceType<T> | null | undefined
  ): boolean | undefined {
    const candidateId = getEntityId(candidateEntity);
    if (candidateId === undefined) {
      return undefined; // 候选实体ID不存在
    }
    let currentParentId = get_tree_parent_id<RxDBEntityId>(targetEntity);
    const visited = new Set<RxDBEntityId>(); // 防止循环引用

    while (currentParentId !== null && !visited.has(currentParentId) && visited.size < MAX_TREE_DEPTH) {
      // 找到候选实体，确认是祖先
      if (currentParentId === candidateId) {
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

    return false; // 到达根节点仍未找到候选实体
  }
}
