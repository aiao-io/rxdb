/**
 * @fileoverview 树查询任务类型
 *
 * 四个查询任务经 `RepositoryQueryExtensions` 的模块扩展并进核心的 `QueryOptions` 联合：
 * 那是插件往闭合联合里加支的唯一入口。不装本插件的应用，`QueryOptions` 上没有这四支，
 * `QueryTask.type` 也不会出现树类型 —— 这正是 US-025 阶段 E 要的「核心不内置树」。
 */
import { EntityType } from '@aiao/rxdb';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';

/**
 * FindDescendants 查询任务
 * 查找指定实体的所有后代节点
 */
export interface FindDescendantsQuery<T extends EntityType> {
  type: 'findDescendants';
  options: FindTreeOptions<T>;
}

/**
 * FindAncestors 查询任务
 * 查找指定实体的所有祖先节点
 */
export interface FindAncestorsQuery<T extends EntityType> {
  type: 'findAncestors';
  options: FindTreeOptions<T>;
}

/**
 * CountDescendants 查询任务
 * 统计指定实体的后代节点数量
 */
export interface CountDescendantsQuery<T extends EntityType> {
  type: 'countDescendants';
  options: FindTreeOptions<T>;
}

/**
 * CountAncestors 查询任务
 * 统计指定实体的祖先节点数量
 */
export interface CountAncestorsQuery<T extends EntityType> {
  type: 'countAncestors';
  options: FindTreeOptions<T>;
}

declare module '@aiao/rxdb' {
  interface RepositoryQueryExtensions<T extends EntityType> {
    treeFindDescendants: FindDescendantsQuery<T>;
    treeFindAncestors: FindAncestorsQuery<T>;
    treeCountDescendants: CountDescendantsQuery<T>;
    treeCountAncestors: CountAncestorsQuery<T>;
  }
}
