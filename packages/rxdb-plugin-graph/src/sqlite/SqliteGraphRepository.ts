/**
 * @fileoverview SQLite Graph 仓库实现
 * SQLite 图数据库仓库实现
 */

import type { EntityBaseType, EntityType } from '@aiao/rxdb';
import {
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata,
  SqliteRepository,
  type RxDBAdapterSqliteBase
} from '@aiao/rxdb-adapter-sqlite-core';
import { createGraphQueryResult } from '../graph-query-result.js';
import {
  EdgeFilterOptions,
  EdgeFilterOptionsFull,
  FindNeighborsOptions,
  FindPathsOptions,
  GraphEdgeInfoType,
  GraphEdgeProperties,
  GraphEdgePropertiesRecord,
  GraphPath,
  GraphQueryResult,
  GraphWhere,
  IGraphRepository,
  NeighborResult
} from '../graph-repository.interface.js';
import { normalizeNeighborsOptions, normalizePathsOptions } from '../utils.js';
import {
  generate_entity_count_neighbors_sql,
  generate_entity_find_neighbors_sql,
  generate_entity_find_paths_sql
} from './query_graph_sql.js';

/** 从节点表整行读出的原始记录（列名 → 值）。 */
type NodeRecord = Record<string, unknown>;

/**
 * 断言查询结果里存在指定的内部边列，并返回其下标。
 *
 * @remarks
 * `_edge_*` 是 {@link generate_entity_find_neighbors_sql} 固定 SELECT 出来的内部列。
 * 缺列只可能是 SQL 生成与解析发生漂移。过去这里回退成 `''`/`'out'`/`1`，
 * 把 bug 伪装成一批空 ID 的正常结果，再经 createEntityRef 进入实体缓存与 UI（GRAPH-009）。
 *
 * @throws {@link Error} 当列不存在时
 */
const requireEdgeColumn = (columns: string[], name: string, entityName: string): number => {
  const index = columns.indexOf(name);
  if (index < 0) {
    throw new Error(`[graph] ${entityName} 邻居查询结果缺少内部列 ${name}，SQL 生成与解析已漂移`);
  }
  return index;
};

/** 断言内部边列里的节点 ID 是非空字符串。 */
const requireEdgeId = (value: unknown, name: string, entityName: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[graph] ${entityName} 邻居查询结果的 ${name} 不是非空字符串：${String(value)}`);
  }
  return value;
};

/** 断言内部边列里的方向取值合法。 */
const requireEdgeDirection = (value: unknown, entityName: string): 'in' | 'out' => {
  if (value !== 'in' && value !== 'out') {
    throw new Error(`[graph] ${entityName} 邻居查询结果的 _edge_direction 取值非法：${String(value)}`);
  }
  return value;
};

/** 断言内部边列里的层级是有限数字。 */
const requireEdgeLevel = (value: unknown, entityName: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[graph] ${entityName} 邻居查询结果的 _edge_level 不是有限数字：${String(value)}`);
  }
  return value;
};

/**
 * SQLite 图实体仓库
 * 实现基于 SQLite 递归 CTE 的图查询
 */
export class SqliteGraphRepository<
  T extends EntityBaseType = EntityBaseType,
  U extends EdgeFilterOptions = EdgeFilterOptionsFull,
  EF = GraphEdgeInfoType<U>
>
  extends SqliteRepository<T>
  implements IGraphRepository<T, U, EF>
{
  private get isUndirected(): boolean {
    return this.metadata.features?.graph?.type === 'undirected-graph';
  }

  constructor(adapter: RxDBAdapterSqliteBase, EntityType: EntityType) {
    super(adapter, EntityType as T);
  }

  /**
   * 查询邻居节点
   */
  async findNeighbors(
    options: FindNeighborsOptions<T, GraphWhere<T>, U>
  ): Promise<GraphQueryResult<NeighborResult<T, EF>>> {
    options = normalizeNeighborsOptions(options, true);
    if (options.level === 0) {
      return createGraphQueryResult([], false);
    }

    const { sql, params } = generate_entity_find_neighbors_sql(
      this.adapter,
      this.metadata,
      options as FindNeighborsOptions
    );
    const result = await this.adapter.query(sql, params);

    const rows = result.results[0]?.rows;
    const columns = result.results[0]?.columns;
    if (!rows?.length) {
      return createGraphQueryResult([], false);
    }

    const limit = options.limit!;
    const truncated = rows.length > limit;
    const limitedRows = rows.slice(0, limit);

    const sourceIdIdx = requireEdgeColumn(columns, '_edge_sourceId', this.metadata.name);
    const targetIdIdx = requireEdgeColumn(columns, '_edge_targetId', this.metadata.name);
    const directionIdx = requireEdgeColumn(columns, '_edge_direction', this.metadata.name);
    const levelIdx = requireEdgeColumn(columns, '_edge_level', this.metadata.name);
    const weightIdx = columns.indexOf('_edge_weight');
    const propertiesIdx = columns.indexOf('_edge_properties');

    // 预先筛选非边信息列，避免每行都过滤一次
    const entityCols: Array<[string, number]> = [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (!col.startsWith('_edge_')) entityCols.push([col, i]);
    }

    // 去重已由 SQL 窗口函数完成（每个节点只保留最短层级的一条边）
    const neighbors: NeighborResult<T, EF>[] = [];

    for (const row of limitedRows) {
      const entity: Record<string, unknown> = {};
      for (const [col, idx] of entityCols) {
        entity[col] = row[idx];
      }

      const edge: Record<string, unknown> = {
        sourceId: requireEdgeId(row[sourceIdIdx], '_edge_sourceId', this.metadata.name),
        targetId: requireEdgeId(row[targetIdIdx], '_edge_targetId', this.metadata.name),
        direction: requireEdgeDirection(row[directionIdx], this.metadata.name)
      };

      if (this.metadata.features?.graph?.weight === true && weightIdx >= 0) {
        edge['weight'] = row[weightIdx] === null ? null : (row[weightIdx] as number);
      }

      if ((this.metadata.features?.graph?.properties?.length ?? 0) > 0 && propertiesIdx >= 0) {
        edge['properties'] =
          row[propertiesIdx] === null ? null : (JSON.parse(row[propertiesIdx] as string) as GraphEdgePropertiesRecord);
      }

      neighbors.push({
        node: entity as InstanceType<T>,
        edge: edge as EF,
        level: requireEdgeLevel(row[levelIdx], this.metadata.name)
      });
    }

    return createGraphQueryResult(neighbors, truncated);
  }

  /**
   * 查询邻居节点数量
   */
  async countNeighbors(options: FindNeighborsOptions<T, GraphWhere<T>, U>): Promise<number> {
    options = normalizeNeighborsOptions(options, true);

    const { sql, params } = generate_entity_count_neighbors_sql(
      this.adapter,
      this.metadata,
      options as FindNeighborsOptions
    );
    const result = await this.adapter.query(sql, params);
    return result.results[0].rows[0][0] as number;
  }

  /**
   * 查询两个节点之间的所有路径
   */
  async findPaths(options: FindPathsOptions<T, GraphWhere<T>, U>): Promise<GraphQueryResult<GraphPath<T>>> {
    options = normalizePathsOptions(options);

    const { sql, params } = generate_entity_find_paths_sql(this.adapter, this.metadata, options as FindPathsOptions);

    // 路径 CTE 与节点回填必须同处一个只读事务：两次独立查询之间若发生并发删除，
    // 回填就会缺行。事务体内一律走 executor.execute —— 裸 this.adapter.query 会在
    // 并发度 1 的队列里排到自己后面，永久挂死（GRAPH-008）
    const snapshot = await this.adapter.transaction(async executor => {
      const pathResult = await executor.execute(sql, params);
      const pathRows = pathResult.results[0].rows;
      if (!pathRows?.length) {
        return { rows: [], parsedNodeIds: [], nodeMap: new Map<string, NodeRecord>(), truncated: false };
      }
      const pathColumns = pathResult.results[0].columns;
      const searchTruncatedIndex = pathColumns.indexOf('_search_truncated');
      const searchMetadataIndex = pathColumns.indexOf('_search_metadata');
      if (searchTruncatedIndex < 0 || searchMetadataIndex < 0) {
        throw new Error(`[graph] ${this.metadata.name} 路径查询结果缺少资源上限元数据`);
      }

      const searchTruncated = pathRows.some(row => row[searchTruncatedIndex] === 1);
      const resultRows = pathRows.filter(row => row[searchMetadataIndex] === 0);
      const truncated = searchTruncated || resultRows.length > options.limit!;
      const rows = resultRows.slice(0, options.limit);

      // 一次解析 path_nodes，同时收集节点 ID，避免重复 JSON.parse
      const parsedNodeIds: string[][] = new Array(rows.length);
      const allNodeIds = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const nodeIds = JSON.parse(rows[i][0] as string) as string[];
        parsedNodeIds[i] = nodeIds;
        for (const id of nodeIds) allNodeIds.add(id);
      }

      // 批量查询所有节点
      const nodeMap = new Map<string, NodeRecord>();
      if (allNodeIds.size > 0) {
        const nodeIdArray = Array.from(allNodeIds);
        const placeholders = nodeIdArray.map((_, i) => `$${i + 1}`).join(',');
        const nodeQuery = `SELECT * FROM "${sqliteGetTableNameByMetadata(this.metadata)}" WHERE id IN (${placeholders})`;
        const nodeResult = await executor.execute(nodeQuery, nodeIdArray);

        const nodeRows = nodeResult.results[0].rows;
        const nodeColumns = nodeResult.results[0].columns;
        for (const nodeRow of nodeRows) {
          const node: NodeRecord = {};
          for (let c = 0; c < nodeColumns.length; c++) {
            node[nodeColumns[c]] = nodeRow[c];
          }
          nodeMap.set(node['id'] as string, node);
        }
      }

      return { rows, parsedNodeIds, nodeMap, truncated };
    }, false);

    const { rows, parsedNodeIds, nodeMap, truncated } = snapshot;
    if (!rows.length) {
      return createGraphQueryResult([], truncated);
    }

    const seenPathKeys = this.isUndirected ? new Set<string>() : null;
    const paths: GraphPath<T>[] = [];
    const hasWeight = this.metadata.features?.graph?.weight === true;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const nodeIds = parsedNodeIds[i];

      if (seenPathKeys) {
        const key = nodeIds.join(',');
        if (seenPathKeys.has(key)) continue;
        seenPathKeys.add(key);
      }

      const edgesData = JSON.parse(row[1] as string) as Array<{
        sourceId: string;
        targetId: string;
        weight?: number | null;
        properties?: GraphEdgePropertiesRecord | null;
      }>;
      const edges: GraphPath<T>['edges'] = edgesData.map(edgeData => {
        const edge: GraphPath<T>['edges'][number] = {
          sourceId: edgeData.sourceId,
          targetId: edgeData.targetId
        };
        if ('weight' in edgeData) edge.weight = edgeData.weight ?? null;
        if ('properties' in edgeData) edge.properties = edgeData.properties ?? null;
        return edge;
      });

      const nodes: InstanceType<T>[] = [];
      for (const nodeId of nodeIds) {
        const node = nodeMap.get(nodeId);
        // 同一只读事务里 CTE 走过的节点必然可回填。取不到只可能是元数据/表名错配之类的
        // 内部不一致；静默跳过会 push 出 nodes.length !== length + 1 的路径，
        // 破坏 GraphPath 声明的不变量并让 nodes/edges 索引错位（GRAPH-008）
        if (!node) {
          throw new Error(`[graph] ${this.metadata.name} 路径节点 ${nodeId} 回填失败，路径结果与节点表不一致`);
        }
        nodes.push(node as unknown as InstanceType<T>);
      }

      paths.push({
        nodes,
        edges,
        length: row[2] as number,
        totalWeight: hasWeight ? (row[3] as number) : undefined
      });
    }

    return createGraphQueryResult(paths, truncated);
  }

  /**
   * 添加边
   *
   * @remarks
   * 无向图会同时写入 A->B 与 B->A 两条记录，两次写入在同一事务中执行；
   * 自环边（from === to）只写入一条记录；
   * 重复调用（相同 sourceId/targetId）会更新 weight/properties，不会新增行或改变行 id/createdAt
   */
  async addEdge(
    from: InstanceType<T>,
    to: InstanceType<T>,
    weight?: number | null,
    properties?: GraphEdgeProperties<U> | null
  ): Promise<void> {
    const forward = this.buildAddEdgeSql(from, to, weight, properties);
    if (!this.isUndirected || from.id === to.id) {
      await this.adapter.query(forward.sql, forward.params);
      return;
    }

    const backward = this.buildAddEdgeSql(to, from, weight, properties);
    await this.adapter.transaction(async tx => {
      await tx.execute(forward.sql, forward.params);
      await tx.execute(backward.sql, backward.params);
    }, false);
  }

  /**
   * 移除边
   *
   * @remarks
   * 无向图会同时删除 A->B 与 B->A 两条记录，两次删除在同一事务中执行
   */
  async removeEdge(from: InstanceType<T>, to: InstanceType<T>): Promise<void> {
    const forward = this.buildRemoveEdgeSql(from, to);
    if (!this.isUndirected || from.id === to.id) {
      await this.adapter.query(forward.sql, forward.params);
      return;
    }

    const backward = this.buildRemoveEdgeSql(to, from);
    await this.adapter.transaction(async tx => {
      await tx.execute(forward.sql, forward.params);
      await tx.execute(backward.sql, backward.params);
    }, false);
  }

  private getEdgeTableName(): string {
    return `"${sqliteGetTableName(this.metadata.name + '_edges', this.metadata.namespace)}"`;
  }

  private buildAddEdgeSql(
    from: InstanceType<T>,
    to: InstanceType<T>,
    weight?: number | null,
    properties?: GraphEdgeProperties<U> | null
  ): { sql: string; params: Array<string | number | null> } {
    const graph = this.metadata.features?.graph;
    const hasWeightFeature = graph?.weight === true;
    const hasPropertiesFeature = (graph?.properties?.length ?? 0) > 0;

    // 传了图不支持的实参必须报错。过去这里直接短路成不写该列，于是
    // properties-only 图上 `addEdge(a, b, { tag: 'x' })`（生成器把签名排成
    // `(from, to, properties?)` 诱导出来的写法）会让属性对象落进 weight 槽后
    // 无错误、无告警地消失（GRAPH-004）
    if (!hasWeightFeature && weight !== undefined) {
      throw new Error(
        `[graph] ${this.metadata.name} 未启用 features.graph.weight，addEdge 不能传 weight：${JSON.stringify(weight)}`
      );
    }
    if (!hasPropertiesFeature && properties !== undefined) {
      throw new Error(`[graph] ${this.metadata.name} 未定义 features.graph.properties，addEdge 不能传 properties`);
    }

    const includeWeight = weight !== undefined;
    const includeProperties = properties !== undefined;

    // 边表 createdAt/updatedAt 为 NOT NULL 且无 DB 端 DEFAULT（entity-base 的默认值是 JS 函数，
    // 建表时会被跳过，见 create_table_sql.ts 的 isFunction 判断），走原生 SQL 插入必须显式补齐，
    // 否则触发 NOT NULL constraint failed
    const now = new Date().toISOString();
    const cols = ['"sourceId"', '"targetId"', '"createdAt"', '"updatedAt"'];
    const params: Array<string | number | null> = [from.id, to.id, now, now];
    const updateAssignments: string[] = ['"updatedAt" = excluded."updatedAt"'];

    if (includeWeight) {
      cols.push('"weight"');
      params.push(weight);
      updateAssignments.push('"weight" = excluded."weight"');
    }
    if (includeProperties) {
      cols.push('"properties"');
      params.push(properties === null ? null : JSON.stringify(properties));
      updateAssignments.push('"properties" = excluded."properties"');
    }

    const placeholders = cols.map(() => '?').join(', ');
    const onConflict = updateAssignments.length > 0 ? `DO UPDATE SET ${updateAssignments.join(', ')}` : 'DO NOTHING';
    return {
      sql: `INSERT INTO ${this.getEdgeTableName()} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT ("sourceId", "targetId") ${onConflict}`,
      params
    };
  }

  private buildRemoveEdgeSql(
    from: InstanceType<T>,
    to: InstanceType<T>
  ): { sql: string; params: Array<string | number | null> } {
    return {
      sql: `DELETE FROM ${this.getEdgeTableName()} WHERE "sourceId" = ? AND "targetId" = ?`,
      params: [from.id, to.id]
    };
  }
}
