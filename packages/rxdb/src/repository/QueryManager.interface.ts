import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from './query-options.interface.js';

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

/** 由 Repository 插件通过模块扩展追加的查询任务。 */
export interface RepositoryQueryExtensions<T extends EntityType> {
  readonly __extensionBrand: { readonly entityType: T; readonly options: never; readonly type: never };
}

/**
 * 一次查询任务的选项联合
 *
 * @remarks
 * `QueryManager.createTask()` 的入参类型，也是任务去重指纹的原料：同一个 `QueryOptions`
 * 结构序列化后相等的两次订阅会并到同一条任务上。
 *
 * 末尾那一支来自 {@link RepositoryQueryExtensions} 的模块扩展——插件包自定义的查询任务
 * 由此并进联合，因此实现 Repository 或替换 QueryManager 的插件需要这个类型。
 *
 * @typeParam T - 查询针对的实体类
 */
export type QueryOptions<T extends EntityType> =
  // 通用仓库查询任务选项
  | GetQuery<T>
  | FindOneQuery<T>
  | FindOneOrFailQuery<T>
  | FindQuery<T>
  | FindAllQuery<T>
  | FindByCursorQuery<T>
  | CountQuery<T>
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
