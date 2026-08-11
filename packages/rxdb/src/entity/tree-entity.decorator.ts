/**
 * @fileoverview 树形实体装饰器
 *
 * `@TreeEntity(...)` 是 `@Entity(...)` 在"树形结构"特化下的封装：
 *
 * - **补全 `features.tree.type`**：缺省时落回 `'adjacency-list'`（邻接表），
 *   未来加入 `nested-set` / `path-enumeration` 等模型时只需扩这里。
 * - **补全 `features.tree.hasChildren`**：默认 `false`，由 {@link TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS}
 *   在 `hasChildren: true` 时挂上同名计算属性（`TreeRepository` 用它做轻量 hasChildren 查询）。
 * - **强制 `repository: 'TreeRepository'`**：子类不写 `repository` 也能拿到 `findDescendants` /
 *   `countAncestors` 这类树查询方法。`Entity` 装饰器单独使用时如果不写 `repository`，
 *   只会得到普通的 `Repository`（没有树 API）。
 *
 * 也就是说，业务方"用 `@Entity` 还是 `@TreeEntity`"决定了仓库能力，不要混淆。
 */

import { Entity } from './entity.decorator.js';
import { EntityMetadataOptions } from './metadata-options.interface.js';

/**
 * 树形实体装饰器
 * 用于将类标记为树形结构实体，并处理树形特定的元数据
 */
export const TreeEntity: typeof Entity = (metadataOptions: EntityMetadataOptions) => {
  const tree = metadataOptions.features?.tree ?? {};
  return Entity({
    ...metadataOptions,
    features: {
      ...metadataOptions.features,
      tree: {
        ...tree,
        type: tree.type ?? 'adjacency-list',
        hasChildren: tree.hasChildren ?? false
      }
    },
    repository: metadataOptions.repository ?? 'TreeRepository'
  });
};
