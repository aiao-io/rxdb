import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from './query-options.interface.js';
import { FindTreeOptions } from './tree-repository.interface.js';

/**
 * Get 查询任务
 * 根据 ID 获取单个实体的查询任务
 */
export interface GetQuery<T extends EntityType> {
  type: 'get';
  options: EntityStaticType<T, 'idType'>;
}

/**
 * FindOne 查询任务
 * 查找符合条件的第一个实体，可能返回 null
 */
export interface FindOneQuery<T extends EntityType> {
  type: 'findOne';
  options: FindOneOptions<T>;
}

/**
 * FindOneOrFail 查询任务
 * 查找符合条件的第一个实体，找不到时抛出错误
 */
export interface FindOneOrFailQuery<T extends EntityType> {
  type: 'findOneOrFail';
  options: FindOneOrFailOptions<T>;
}

/**
 * Find 查询任务
 * 查找符合条件的所有实体
 */
export interface FindQuery<T extends EntityType> {
  type: 'find';
  options: FindOptions<T>;
}

/**
 * FindAll 查询任务
 * 查找所有实体
 */
export interface FindAllQuery<T extends EntityType> {
  type: 'findAll';
  options: FindAllOptions<T>;
}

/**
 * FindByCursor 查询任务
 * 使用游标分页查找实体
 */
export interface FindByCursorQuery<T extends EntityType> {
  type: 'findByCursor';
  options: FindByCursorOptions<T>;
}

/**
 * Count 查询任务
 * 统计符合条件的实体数量
 */
export interface CountQuery<T extends EntityType> {
  type: 'count';
  options: CountOptions<T>;
}

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

/** 由 Repository 插件通过模块扩展追加的查询任务。 */
export interface RepositoryQueryExtensions<T extends EntityType> {
  readonly __extensionBrand: { readonly entityType: T; readonly options: never; readonly type: never };
}

export type QueryOptions<T extends EntityType> =
  // 通用仓库查询任务选项
  | GetQuery<T>
  | FindOneQuery<T>
  | FindOneOrFailQuery<T>
  | FindQuery<T>
  | FindAllQuery<T>
  | FindByCursorQuery<T>
  | CountQuery<T>
  // 树形仓库查询任务选项
  | CountAncestorsQuery<T>
  | CountDescendantsQuery<T>
  | FindAncestorsQuery<T>
  | FindDescendantsQuery<T>
  | RepositoryQueryExtensions<T>[keyof RepositoryQueryExtensions<T>];

/**
 * 刷新匹配规则名称
 * 定义查询缓存刷新时的匹配规则类型
 */
type RefreshMatchRuleName =
  | 'match_where' // 匹配查询条件：当实体变更满足查询的 where 条件时触发刷新
  | 'match_order_by' // 匹配排序条件：当实体变更影响查询的排序结果时触发刷新
  | 'match_relation_where' // 匹配关系实体查询条件：当关系实体变更且与结果集相关时触发刷新
  | 'not_match_relation_where' // 不匹配关系实体查询条件：当关系实体不匹配或无关系实体变更时
  | 'result_contains' // 查询结果包含：当变更的实体在查询结果中时触发刷新
  | 'not_match_where' // 不匹配查询条件：当实体变更后不再满足查询条件时触发刷新
  | 'result_not_contains' // 查询结果不包含：当变更的实体不在查询结果中时触发刷新
  | 'match_where_before' // 匹配查询条件(更新前)：当实体更新前满足查询条件时触发刷新
  | 'not_match_where_before'; // 不匹配查询条件(更新前)：当实体更新前不满足查询条件时触发刷新

/**
 * 刷新匹配规则
 * 二维数组表示多组规则的组合，每组规则内的条件是 AND 关系，组与组之间是 OR 关系
 * 例如：[['match_where', 'result_contains'], ['not_match_where']]
 * 表示：(匹配查询条件 AND 结果包含) OR (不匹配查询条件)
 */
export type RefreshMatchRules = RefreshMatchRuleName[][];
