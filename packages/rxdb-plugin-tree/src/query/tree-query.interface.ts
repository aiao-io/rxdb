/**
 * @fileoverview 树查询任务类型
 *
 * 四个查询任务经 `RepositoryQueryExtensions` 的模块扩展并进核心的 `QueryOptions` 联合：
 * 那是插件往闭合联合里加支的唯一入口。不装本插件的应用，`QueryOptions` 上没有这四支，
 * `QueryTask.type` 也不会出现树类型 —— 这正是 US-025 阶段 E 要的「核心不内置树」。
 */
import { EntityType } from '@aiao/rxdb';
import type { TreeQueryType } from '../constants.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';

/**
 * FindDescendants 查询任务
 * 查找指定实体的所有后代节点
 */
export interface FindDescendantsQuery<T extends EntityType> {
  type: Extract<TreeQueryType, 'findDescendants'>;
  options: FindTreeOptions<T>;
}

/**
 * FindAncestors 查询任务
 * 查找指定实体的所有祖先节点
 */
export interface FindAncestorsQuery<T extends EntityType> {
  type: Extract<TreeQueryType, 'findAncestors'>;
  options: FindTreeOptions<T>;
}

/**
 * CountDescendants 查询任务
 * 统计指定实体的后代节点数量
 */
export interface CountDescendantsQuery<T extends EntityType> {
  type: Extract<TreeQueryType, 'countDescendants'>;
  options: FindTreeOptions<T>;
}

/**
 * CountAncestors 查询任务
 * 统计指定实体的祖先节点数量
 */
export interface CountAncestorsQuery<T extends EntityType> {
  type: Extract<TreeQueryType, 'countAncestors'>;
  options: FindTreeOptions<T>;
}

/**
 * 四支树查询任务的联合。
 *
 * @remarks
 * 与 {@link TreeQueryType} 的双向一致性由
 * `__tests__/contracts/tree-query-type-parity.spec.ts` 钉死：这里加一支而
 * {@link TREE_QUERY_TYPE_LIST} 没加（或反过来），那条断言编译失败。
 */
export type TreeQuery<T extends EntityType> =
  FindDescendantsQuery<T> | FindAncestorsQuery<T> | CountDescendantsQuery<T> | CountAncestorsQuery<T>;

declare module '@aiao/rxdb' {
  interface RepositoryQueryExtensions<T extends EntityType> {
    treeFindDescendants: FindDescendantsQuery<T>;
    treeFindAncestors: FindAncestorsQuery<T>;
    treeCountDescendants: CountDescendantsQuery<T>;
    treeCountAncestors: CountAncestorsQuery<T>;
  }
}
