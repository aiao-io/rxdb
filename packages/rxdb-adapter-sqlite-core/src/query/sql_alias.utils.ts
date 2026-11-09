import type { EntityMetadata, EntityRelationMetadata } from '@aiao/rxdb';
import { quote_sql_identifier } from '../sqlite-core.utils.js';

/**
 * 表别名相关的**叶子**工具模块
 *
 * @remarks
 * 这些常量与格式化函数同时被 `join_sql`（JOIN 规划）和 `query_sql.utils`（条件编译）使用。
 * 自 SQLC-010 起 `query_sql.utils` 需要为 EXISTS 子查询重跑 JOIN 规划，
 * 若把它们继续留在 `query_sql.utils` 里，就会形成 `join_sql ⇄ query_sql.utils` 的循环依赖。
 * 因此单独抽成一个不依赖任何查询模块的叶子模块。
 */

export const MAIN_TABLE_ALIAS = '_' as const;

/**
 * 规则编译所在的查询层
 *
 * @remarks
 * 规则里的裸字段、keyValue / 数组列与 EXISTS 的关联条件都指向**本层**的主表：顶层查询是 `_`，
 * EXISTS 子查询是这一层分到的别名，树查询的递归成员是 `children`。嵌套 EXISTS 每深一层都要分一个
 * 外层没用过的别名，内层关联条件引用上一层的别名；固定写 `_` 与 `child` 时，第二层会关联到顶层实体，
 * 同名的 `child` 还会遮住上一层。
 */
export interface RuleScope {
  /** 本层主表别名 */
  readonly alias: string;
  /** 本层及外层各级已占用的别名：子查询新分的别名与子查询里的 JOIN 规划都要避开 */
  readonly reservedAliases: readonly string[];
}

/**
 * 顶层查询（`FROM <table> _`）的规则作用域
 */
export const MAIN_RULE_SCOPE: RuleScope = { alias: MAIN_TABLE_ALIAS, reservedAliases: [MAIN_TABLE_ALIAS] };

/**
 * 在作用域里分一个没被占用的别名：`base` 空闲就用它，否则依次试 `base_2`、`base_3`……
 *
 * @param base - 首选别名
 * @param reserved - 已占用的别名
 * @returns 不在 `reserved` 里的别名
 */
export const allocate_scope_alias = (base: string, reserved: readonly string[]): string => {
  if (!reserved.includes(base)) return base;
  let index = 2;
  while (reserved.includes(`${base}_${index}`)) index++;
  return `${base}_${index}`;
};

/**
 * 关系路径上的一段：关系所属实体的 metadata 与关系本身
 */
export interface RelationPair {
  metadata: EntityMetadata;
  relation: EntityRelationMetadata;
}

export const format_table_alias = (alias: string): string =>
  alias === MAIN_TABLE_ALIAS ? alias : quote_sql_identifier(alias);

export const format_qualified_identifier = (alias: string, column: string): string =>
  `${format_table_alias(alias)}.${quote_sql_identifier(column)}`;

/**
 * 获取关系键
 */
export const get_relation_key = (
  relations: RelationPair[],
  joinTableName: string,
  relation: EntityRelationMetadata
): string => (relations.length === 1 ? relation.name : `${joinTableName}_${relation.name}`);
