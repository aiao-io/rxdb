/**
 * 树形遍历配置
 */
interface TreeTraversalOptions {
  maxLevel?: number; // 最大层级限制
  maxDepth?: number; // 最大深度（防止无限循环）
}

/**
 * 获取实体的父级 ID
 * 处理 parentId 可能是对象或字符串的情况
 */
export const get_tree_parent_id = <ID = string>(entity: object | null | undefined): ID | null => {
  if (!entity) return null;
  return (Reflect.get(entity, 'parentId') as ID | null | undefined) ?? null;
};

/**
 * 向上遍历父级链路
 *
 * @param entity 起始实体
 * @param entitiesMap 实体 ID 映射表
 * @param options 遍历配置
 * @yields 每一层的父级实体和层级
 */
export function* traverseAncestors<T extends object, ID>(
  entity: T,
  entitiesMap: Map<ID, T>,
  options: TreeTraversalOptions = {}
): Generator<{ entity: T; level: number }> {
  const { maxLevel, maxDepth = 1000 } = options;
  const visited = new Set<ID>();
  let currentParentId = get_tree_parent_id<ID>(entity);
  let level = 1;

  while (currentParentId !== null && !visited.has(currentParentId) && visited.size < maxDepth) {
    visited.add(currentParentId);

    const parent = entitiesMap.get(currentParentId);
    if (!parent) break;

    // 检查层级限制
    if (maxLevel !== undefined && level > maxLevel) break;

    yield { entity: parent, level };

    currentParentId = get_tree_parent_id<ID>(parent);
    level++;
  }
}

/**
 * 检查实体是否是目标实体的后代
 *
 * @param entity 要检查的实体
 * @param targetId 目标实体 ID (为 null 或 undefined 时表示查找根节点)
 * @param entitiesMap 实体 ID 映射表
 * @param maxLevel 最大层级 (undefined 表示无限制)
 * @returns 如果是后代则返回 true
 */
export function isDescendantOf<T extends object, ID>(
  entity: T,
  targetId: ID | null | undefined,
  entitiesMap: Map<ID, T>,
  maxLevel?: number
): boolean {
  // 特殊情况: targetId 为 null 或 undefined 时,计算节点相对根节点的层级
  if (targetId === null || targetId === undefined) {
    const visited = new Set<ID>();
    let currentEntity = entity;
    let level = 0;

    while (maxLevel === undefined || level <= maxLevel) {
      const currentParentId = get_tree_parent_id<ID>(currentEntity);
      if (currentParentId === null) return true;
      if (visited.has(currentParentId)) return false;

      visited.add(currentParentId);
      const parent = entitiesMap.get(currentParentId);
      if (!parent) return false;

      currentEntity = parent;
      level++;
    }

    return false;
  }

  // 向上遍历父级链路
  const visited = new Set<ID>();
  let currentParentId = get_tree_parent_id<ID>(entity);
  let level = 1;

  while (currentParentId !== null && !visited.has(currentParentId)) {
    // 找到目标实体
    if (currentParentId === targetId) {
      // 检查层级限制
      if (maxLevel === undefined || level <= maxLevel) {
        return true;
      }
      return false;
    }

    visited.add(currentParentId);
    level++;

    // 从映射表中获取父实体以继续遍历
    const parent = entitiesMap.get(currentParentId);
    if (parent) {
      currentParentId = get_tree_parent_id<ID>(parent);
    } else {
      break; // 找不到父实体，中断遍历
    }
  }

  return false;
}

/**
 * 检查实体是否是目标实体的祖先
 *
 * @param candidateEntity 候选祖先实体
 * @param targetId 目标实体 ID (为 null 或 undefined 时直接返回 false，无 isDescendantOf 那种"查找根节点"语义)
 * @param entitiesMap 实体 ID 映射表
 * @param maxLevel 最大层级
 * @returns 如果是祖先则返回 true
 */
export function isAncestorOf<T extends object, ID>(
  candidateEntity: T,
  targetId: ID | null | undefined,
  entitiesMap: Map<ID, T>,
  maxLevel?: number
): boolean {
  if (targetId === null || targetId === undefined) return false;
  const targetEntity = entitiesMap.get(targetId);
  if (!targetEntity) return false;
  for (const { entity: parent } of traverseAncestors(targetEntity, entitiesMap, { maxLevel })) {
    if (Reflect.get(parent, 'id') === Reflect.get(candidateEntity, 'id')) {
      return true;
    }
  }

  return false;
}

/**
 * 构建实体 ID 映射表（优化查找性能）
 *
 * @param entities 实体数组
 * @param getIdFn 获取实体 ID 的函数
 * @returns 实体 ID 到实体的映射表
 */
export function buildEntityMap<T, ID>(entities: T[], getIdFn: (entity: T) => ID | null | undefined): Map<ID, T> {
  const map = new Map<ID, T>();
  entities.forEach(entity => {
    const id = getIdFn(entity);
    if (id !== null && id !== undefined) map.set(id, entity);
  });
  return map;
}
