import { EntityType } from '../entity/entity.interface.js';
import { RuleGroup } from './query.interface.js';

/**
 * 排序
 */
export interface OrderBy<T extends string = string> {
  /**
   * 排序字段
   */
  field: T;

  /**
   * 排序方式
   */
  sort: 'asc' | 'desc';
}

/**
 * FindOne 查询选项
 */
export interface FindOneOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
}

/**
 * FindOneOrFail 查询选项
 */
export interface FindOneOrFailOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
}

/**
 * Find 查询选项
 */
export interface FindOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;
  orderBy?: OrderBy<W>[];
  /**
   * 分组字段列表（对应 SQL GROUP BY）
   * 数组元素为列名字符串，由适配器负责标识符转义
   */
  groupBy?: string[];
  /**
   * 投影字段列表（对应 SQL 列选择）
   * 指定需要返回的列名，缺省返回所有列（SELECT *）
   */
  projection?: string[];

  /**
   * 获取数据量
   * @default 100
   */
  limit?: number;

  /**
   * 分页偏离量
   * @default 0
   */
  offset?: number;
}

/**
 * FindByCursor 查询选项
 */
export interface FindByCursorOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  where: U;

  /**
   * 排序条件
   * 指针查询的时候必须包含唯一值的排序例如: id 作为最后一个排序参数，不然无法定位指针
   * @example
   * ```ts
   * orderBy: [
   *   { field: 'createdAt', sort: 'DESC' },
   *   { field: 'id', sort: 'ASC' } // 必须包含唯一值排序
   * ]
   * ```
   */
  orderBy: OrderBy<W>[];

  /**
   * 获取这个实体之前的实体
   */
  before?: InstanceType<T>;

  /**
   * 获取这个实体之后的实体
   */
  after?: InstanceType<T>;

  /**
   * 获取数据量
   * 注意：limit 首次返回会 <=100, 但是第二次，增量场景下并不一定保持 100 他会根据实际情况变化
   * 例如：页面滚动触发有两个 FindByCursor 查询组成了一组数据，这时候有个数据被创建且数据满足第一个查询条件
   * 那么更新后的数据量就会比 limit 多 1, 第二个 FindByCursor 开头的指针是不会变的，所以没有影响第二个结果集
   * @default 100
   */
  limit?: number;
}

/**
 * FindAll 查询选项
 */
export interface FindAllOptions<
  T extends EntityType = EntityType,
  U = RuleGroup<InstanceType<T>>,
  W extends string = string
> {
  /**
   * 查询条件
   * 用于过滤查询结果
   * 支持组合查询
   * @example
   * ```ts
   * where: {
   *   combinator: 'and',
   *   rules: [
   *     { field: 'status', operator: '=', value: 'active' },
   *     { field: 'createdAt', operator: '>=', value: '2023-01-01' }
   *   ]
   * }
   * ```
   */
  where: U;

  /**
   * 排序条件
   * @example
   * ```ts
   * orderBy: [
   *   { field: 'createdAt', sort: 'desc' },
   *   { field: 'id', sort: 'asc' } // 必须包含唯一值排序
   * ]
   */
  orderBy?: OrderBy<W>[];
}

/**
 * Count 查询选项
 */
export interface CountOptions<T extends EntityType = EntityType, U = RuleGroup<InstanceType<T>>> {
  where: U;
  groupBy?: string[];
}
