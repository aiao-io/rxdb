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
