/**
 * @fileoverview 图实体的边表在本实例挂的那套表里的物理名（US-314 B2.1）。
 */

import { RxDBError, type EntityMetadata } from '@aiao/rxdb';
import {
  get_table_name_by_metadata,
  quote_sql_identifier,
  type RxDBAdapterSqliteBase
} from '@aiao/rxdb-adapter-sqlite-core';

/**
 * 节点实体的边表在本实例挂的那套表里的物理名。
 *
 * @param adapter - 适配器，提供本实例挂的表集与实体登记
 * @param nodeMetadata - 节点实体的元数据
 * @returns 加好引号的边表物理名
 * @throws {@link RxDBError} 边表实体没有登记，或节点与边一个进了这套影子表、一个没进时
 *
 * @remarks
 * 边表是插件的实体生成器单独登记的实体（`<节点名>_edges`），按它自己的元数据解析：进不进可写检出位的影子表集，
 * 看它自己记不记变更日志、在不在版本化域里，不跟着节点走。
 *
 * 节点与边落在两套表里时，邻居与路径查询会把一套表的节点接上另一套表的边，查出来是两个检出位拼起来的图，
 * 写边还会记到另一条分支名下，所以直接拒绝。主表集上两者恒在同一套，不会走到这一支。
 */
export const graph_edge_table_name = (adapter: RxDBAdapterSqliteBase, nodeMetadata: EntityMetadata): string => {
  const edgeMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
    `${nodeMetadata.name}_edges`,
    nodeMetadata.namespace
  );
  if (!edgeMetadata) {
    throw new RxDBError(`图实体 ${nodeMetadata.namespace}.${nodeMetadata.name} 没有登记边表实体`);
  }
  const tableSet = adapter.tableSet;
  if (tableSet.has(nodeMetadata) !== tableSet.has(edgeMetadata)) {
    throw new RxDBError(
      `图实体 ${nodeMetadata.namespace}.${nodeMetadata.name} 的节点与边不在同一套表里（表集 ${tableSet.suffix}）：` +
        '一个进了可写检出位的影子表、一个没进，查出来的会是两个检出位拼起来的图'
    );
  }
  return quote_sql_identifier(get_table_name_by_metadata(edgeMetadata, tableSet));
};
