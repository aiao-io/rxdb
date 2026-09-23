import { EntityStaticType, EntityType, IRepository, RuleGroup } from '@aiao/rxdb';

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
   * 查询深度（层级数包含当前节点本身）
   *
   * - 不传：**不限深度** —— `findDescendants` 返回整棵子树、`findAncestors` 返回整条祖先链
   * - `0`：仅当前节点（`entityId` 为空时即所有根节点）
   * - `1`：当前节点 + 直接子节点
   * - `n`：查询到第 n 层深度
   *
   * @defaultValue `undefined`（不限深度）
   *
   * @remarks
   * 不裁剪、不兜底：非负整数以外的值（负数、小数、`NaN`、字符串）一律抛 `RxDBError`。
   * `level` 是树查询里唯一被直接插值进递归 CTE 比较式的选项，悄悄改写它等于把注入
   * 变成一次静默的错误查询。校验在 `assertTreeLevel` 一处收口，`TreeRepository` 与
   * 各适配器都走它 —— 绕过 Repository 直接调适配器时同样抛错。
   *
   * 不传时递归深度由各 SQL 适配器内部的失控保护常量兜底（防脏数据把 `parentId` 连成环），
   * 那是实现细节而非查询语义：正常树不会触到。
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
