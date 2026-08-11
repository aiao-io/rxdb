import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import { RuleGroup } from './query.interface.js';
import { IRepository } from './repository.interface.js';

/**
 * 树结构查询配置
 */
export interface FindTreeOptions<T extends EntityType = EntityType, WhereType = RuleGroup<InstanceType<T>>> {
  /**
   * 查询的根实体 ID
   */
  entityId?: EntityStaticType<T, 'idType'> | null;

  /**
   * 查询条件
   */
  where?: WhereType;

  /**
   * 查询级别（包含当前节点）
   * - 0: 当前节点  1，parentId 为 null 是查询所有根节点，2，parentId=xxx 时只有当前节点
   * - 1: 当前节点 + 直接子节点（1 层深度）
   * - 2: 当前节点 + 子节点 + 孙子节点（2 层深度）
   * - n: 查询到第 n 层深度
   * @default 0
   * 最大值：100。
   *
   * 注意：层级数包含当前节点本身
   * 例如 level=1 会返回：当前节点 + 其直接子节点
   *
   * @remarks
   * - 当 level 未提供时，默认 0
   * - 当 level < 0 时，会被规范化为 0
   * - 当 level > 100 时，会被限制为 100
   *
   * 上述裁剪只发生在 `TreeRepository` 这一层，且只对**数字**生效。
   * 适配器层不做任何兜底：`level` 会被直接插值进递归 CTE 的比较式，
   * 因此收到非 `0..100` 整数（字符串、小数、NaN）一律抛 `RxDBError`。
   * 见 `assertTreeLevel`。
   */
  level?: number;
}

/**
 * 树结构仓库接口
 */
export interface ITreeRepository<T extends EntityType> extends IRepository<T> {
  /**
   * 查询子孙实体
   *
   * @remarks
   * - 指定 entityId 时：包含当前节点 + 子孙节点
   * - 不指定 entityId 时：返回所有根节点及其子孙
   */
  findDescendants(options: FindTreeOptions<T>): Promise<InstanceType<T>[]>;

  /**
   * 查询子孙实体数量
   *
   * @remarks
   * - 指定 entityId 时：**不包含当前节点**，只统计后代数量
   * - 不指定 entityId 时：统计所有根节点及其后代的总数
   */
  countDescendants(options: FindTreeOptions<T>): Promise<number>;

  /**
   * 查询祖先节点
   *
   * @remarks
   * 指定 entityId 时：包含当前节点 + 祖先节点
   */
  findAncestors(options: FindTreeOptions<T>): Promise<InstanceType<T>[]>;

  /**
   * 查询祖先节点数量
   *
   * @remarks
   * 指定 entityId 时：**不包含当前节点**，只统计祖先数量
   */
  countAncestors(options: FindTreeOptions<T>): Promise<number>;
}
