/**
 * @fileoverview 图实体的节点表在本实例挂的那套表里的物理名，以及节点表主键的物理列。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import {
  get_table_name_by_metadata,
  quote_sql_identifier,
  type RxDBAdapterSqliteBase
} from '@aiao/rxdb-adapter-sqlite-core';

/**
 * 节点实体在本实例挂的那套表里的物理名，已按 SQL 标识符转义。
 *
 * @param adapter - 适配器，提供本实例挂的表集
 * @param nodeMetadata - 节点实体的元数据
 * @returns 加好引号的节点表物理名，可直接拼进 SQL
 *
 * @remarks
 * 与 `graph_edge_table_name` 同一个返回合同：调用方拿到的就是可直接拼的引用，不再自己套引号。
 * `tableName` 允许含双引号（如 `order"line`），手写 `"${name}"` 会把它拼成 `"public$order"line"`，SQLite 直接报语法错。
 */
export const graph_node_table_name = (adapter: RxDBAdapterSqliteBase, nodeMetadata: EntityMetadata): string =>
  quote_sql_identifier(get_table_name_by_metadata(nodeMetadata, adapter.tableSet));

/**
 * 节点表主键的物理列，已按 SQL 标识符转义。
 *
 * @param nodeMetadata - 节点实体的元数据
 * @returns 加好引号的主键物理列，可直接拼进 SQL
 *
 * @remarks
 * 主键属性名恒为 `id`，但 `columnName` 是公开可配的，物理列可以叫别的名字（SQLC-014）。
 * 凡是落到节点表上的主键引用都走这里；递归 CTE 自己声明的 `id` 列不是节点表的列，不受影响。
 * sqlite-core 的 `get_primary_key_column` 不在公开导出里，与 PGlite 的 `join_sql.ts` 一样就地解析。
 */
export const graph_node_primary_key_column = (nodeMetadata: EntityMetadata): string =>
  quote_sql_identifier(nodeMetadata.propertyMap.get('id')?.columnName ?? 'id');
