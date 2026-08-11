/**
 * @fileoverview Graph SQL 查询生成
 * 生成图数据库查询的 SQL 语句（递归 CTE）
 */

import { EntityMetadata, RuleGroup } from '@aiao/rxdb';
import {
  GenerateSqlResult,
  ROWID,
  type RxDBAdapterSqliteBase,
  buildRuleGroup,
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata
} from '@aiao/rxdb-adapter-sqlite-core';

import { GRAPH_DEFAULT_RESULT_LIMIT, GRAPH_MAX_PATH_EXPANSIONS } from '../constants.js';
import {
  EdgeFilterOptionsFull,
  FindNeighborsOptions,
  FindPathsOptions,
  GraphEdgePropertyValue
} from '../graph-repository.interface.js';

type SQLiteParam = string | number | null;

const isRuleGroup = (x: unknown): x is RuleGroup =>
  x !== null && typeof x === 'object' && 'combinator' in x && 'rules' in x;

const normalize_rule_group = (rule_group: unknown): RuleGroup | undefined => {
  if (!rule_group || typeof rule_group !== 'object') {
    return undefined;
  }

  if (isRuleGroup(rule_group)) {
    return rule_group;
  }

  return {
    combinator: 'and',
    rules: Object.entries(rule_group as Record<string, unknown>).map(([field, value]) => ({
      field,
      operator: '=' as const,
      value
    }))
  };
};

/**
 * 构建 rule group 对应的 SQL 片段，空结果返回 undefined 避免注入 "AND " 之类的空语句
 */
const build_rule_group_sql = (
  rule_group: unknown,
  metadata: EntityMetadata,
  adapter: RxDBAdapterSqliteBase
): string | undefined => {
  const group = normalize_rule_group(rule_group);
  if (!group) return undefined;
  return buildRuleGroup(group, new Map(), metadata, adapter) || undefined;
};

/**
 * 主表别名
 */
export const MAIN_TABLE_ALIAS = '_' as const;

const SIMPLE_JSON_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const has_control_character = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) <= 0x1f) return true;
  }
  return false;
};

const build_json_path = (key: string): string => {
  if (has_control_character(key)) {
    throw new Error(`Invalid property key: ${key}`);
  }

  if (SIMPLE_JSON_KEY.test(key)) {
    return `$.${key}`;
  }

  const escapedKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `$."${escapedKey}"`;
};

/**
 * 边属性过滤值 → SQLite 绑定参数
 *
 * @remarks
 * 与 addEdge 的 JSON.stringify 序列化保持对称：
 * - Date 存储为 ISO 字符串，过滤时同样转 ISO 字符串
 * - boolean 经 json_extract 读出为 0/1，过滤时转 0/1
 */
const edge_property_to_param = (value: GraphEdgePropertyValue): SQLiteParam => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  throw new Error(`Unsupported edge property value type: ${typeof value}`);
};

/**
 * 构建边过滤条件 SQL（参数化）
 *
 * @param edgeWhere - 边过滤选项（权重、属性）
 * @param hasWeight - 目标图是否启用了 weight 特性
 * @param hasProperties - 目标图是否定义了 properties 特性
 * @param entityName - 实体名（用于错误提示）
 * @param edgeAlias - 边表别名（默认 'e'）
 * @returns 条件数组 + 对应参数
 * @throws 当 edgeWhere 引用了图未启用的特性时抛出，避免生成引用不存在列的 SQL
 */
const build_edge_where_conditions = (
  edgeWhere: EdgeFilterOptionsFull | undefined,
  hasWeight: boolean,
  hasProperties: boolean,
  entityName: string,
  edgeAlias = 'e'
): { conditions: string[]; params: SQLiteParam[] } => {
  if (!edgeWhere) return { conditions: [], params: [] };

  if (edgeWhere.weight && !hasWeight) {
    throw new Error(`[graph] ${entityName} 未启用 features.graph.weight，不能使用 edgeWhere.weight`);
  }
  if (edgeWhere.properties && !hasProperties) {
    throw new Error(`[graph] ${entityName} 未定义 features.graph.properties，不能使用 edgeWhere.properties`);
  }

  const conditions: string[] = [];
  const params: SQLiteParam[] = [];

  // 权重过滤 — 参数化
  if (edgeWhere.weight) {
    if (edgeWhere.weight.min !== undefined) {
      conditions.push(`${edgeAlias}.weight >= ?`);
      params.push(Number(edgeWhere.weight.min));
    }
    if (edgeWhere.weight.max !== undefined) {
      conditions.push(`${edgeAlias}.weight <= ?`);
      params.push(Number(edgeWhere.weight.max));
    }
  }

  // 属性过滤（JSON 字段 — key 白名单校验，value 参数化）
  if (edgeWhere.properties) {
    for (const [key, value] of Object.entries(edgeWhere.properties)) {
      if (value !== undefined && value !== null) {
        conditions.push(`json_extract(${edgeAlias}.properties, ?) = ?`);
        params.push(build_json_path(key), edge_property_to_param(value as GraphEdgePropertyValue));
      }
    }
  }

  return { conditions, params };
};

interface TraversalSql {
  candidateParams: SQLiteParam[];
  candidateSql: string;
  recursiveParams: SQLiteParam[];
  recursiveSql: string;
}

/** 构建逐层去重遍历与最短层级入边候选。 */
const build_edge_traversal_sql = (
  edge_table_name: string,
  direction: string,
  level: number,
  hasWeight: boolean,
  hasProperties: boolean,
  entityName: string,
  edgeWhere?: EdgeFilterOptionsFull
): TraversalSql => {
  const { conditions: edge_filters, params: edge_params } = build_edge_where_conditions(
    edgeWhere,
    hasWeight,
    hasProperties,
    entityName,
    'e'
  );
  const weight_col = hasWeight ? ', e.weight' : ', NULL AS weight';
  const properties_col = hasProperties ? ', e.properties' : ', NULL AS properties';

  const build_recursive_branch = (new_id: string, join_condition: string): string => `
  SELECT ${new_id} AS id, n.level + 1 AS level
  FROM neighbors n
  JOIN ${edge_table_name} e ON ${join_condition}
  WHERE ${['n.level < ?', ...edge_filters].join(' AND ')}`;

  const build_candidate_branch = (
    join_condition: string,
    edge_direction: 'in' | 'out'
  ): string => `SELECT current.id, current.level, e.sourceId, e.targetId, '${edge_direction}' AS direction${weight_col}${properties_col}
  FROM distances current
  JOIN distances previous ON previous.level = current.level - 1
  JOIN ${edge_table_name} e ON ${join_condition}
  WHERE current.level > 0${edge_filters.length ? ` AND ${edge_filters.join(' AND ')}` : ''}`;

  const build_result = (recursiveBranches: string[], candidateBranches: string[]): TraversalSql => {
    const copies = recursiveBranches.length;
    return {
      recursiveSql: recursiveBranches.join('\n  UNION'),
      recursiveParams: Array.from({ length: copies }, () => [level, ...edge_params]).flat(),
      candidateSql: candidateBranches.join('\n  UNION ALL\n  '),
      candidateParams: Array.from({ length: copies }, () => edge_params).flat()
    };
  };

  if (direction === 'out') {
    return build_result(
      [build_recursive_branch('e.targetId', 'e.sourceId = n.id')],
      [build_candidate_branch('e.sourceId = previous.id AND e.targetId = current.id', 'out')]
    );
  }

  if (direction === 'in') {
    return build_result(
      [build_recursive_branch('e.sourceId', 'e.targetId = n.id')],
      [build_candidate_branch('e.targetId = previous.id AND e.sourceId = current.id', 'in')]
    );
  }

  return build_result(
    [
      build_recursive_branch('e.targetId', 'e.sourceId = n.id'),
      build_recursive_branch('e.sourceId', 'e.targetId = n.id')
    ],
    [
      build_candidate_branch('e.sourceId = previous.id AND e.targetId = current.id', 'out'),
      build_candidate_branch('e.targetId = previous.id AND e.sourceId = current.id', 'in')
    ]
  );
};

/**
 * 无向图把任何遍历方向折叠为单个 `out` 分支。
 *
 * @remarks
 * 无向图的 `addEdge` 已经把一条逻辑边**双向写入**（A→B 与 B→A 两行），
 * 因此只走 `out` 分支在语义上与双向遍历完全等价。若仍按 `both` 生成
 * `out UNION ALL in`，同一条逻辑边每一跳都会被走两次，递归 CTE 的中间行数
 * 按 `2^level` 翻倍 —— `GRAPH_MAX_LEVEL = 100` 给出的是虚假的安全边界。
 */
const resolve_effective_direction = (metadata: EntityMetadata, direction: string): string =>
  metadata.features?.graph?.type === 'undirected-graph' ? 'out' : direction;

/**
 * 生成邻居节点查询 SQL
 *
 * @remarks
 * - 使用递归 CTE 按 `(id, level)` 去重，避免枚举所有简单路径
 * - level=0 时仅返回起始节点（不使用递归）
 * - level>0 时使用 WITH RECURSIVE 查询 N 跳邻居
 * - 同一节点通过不同路径到达时，按最小 level 去重；同层多条边时取 weight 最小的边
 * - 排序：level 升序 → weight 升序 → id 升序
 */
export const generate_entity_find_neighbors_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindNeighborsOptions
): GenerateSqlResult => {
  const {
    entityId,
    direction = 'both',
    level = 1,
    where: rule_group,
    edgeWhere,
    limit = GRAPH_DEFAULT_RESULT_LIMIT
  } = options;
  const effective_direction = resolve_effective_direction(metadata, direction);
  const rule_sql = build_rule_group_sql(rule_group, metadata, adapter);
  const table_name = sqliteGetTableNameByMetadata(metadata);
  const edge_table_name = `"${sqliteGetTableName(metadata.name + '_edges', metadata.namespace)}"`;
  const hasWeight = metadata.features?.graph?.weight === true;
  const hasProperties = (metadata.features?.graph?.properties?.length ?? 0) > 0;

  // Level 0: 仅返回起始节点（不包含边信息）
  if (level === 0) {
    const where_clause = rule_sql ? `AND ${rule_sql}` : '';
    const sql = `SELECT *, rowid as ${ROWID}, NULL AS _edge_sourceId, NULL AS _edge_targetId, NULL AS _edge_direction, 0 AS _edge_level, NULL AS _edge_weight, NULL AS _edge_properties FROM "${table_name}" AS _ WHERE id = ? ${where_clause};`;
    return { sql, params: [entityId] };
  }

  // 构建边遍历 SQL
  const edge_join = build_edge_traversal_sql(
    edge_table_name,
    effective_direction,
    level,
    hasWeight,
    hasProperties,
    metadata.name,
    edgeWhere
  );

  const sql = `WITH RECURSIVE neighbors(id, level) AS (
  SELECT id, 0 AS level
  FROM "${table_name}"
  WHERE id = ?

  UNION${edge_join.recursiveSql}
),
distances(id, level) AS (
  SELECT id, MIN(level) AS level
  FROM neighbors
  GROUP BY id
),
edge_candidates(id, level, sourceId, targetId, direction, weight, properties) AS (
  ${edge_join.candidateSql}
),
ranked_edges AS (
  SELECT edge_candidates.*,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY weight ASC, sourceId ASC, targetId ASC
    ) AS _edge_rn
  FROM edge_candidates
)
SELECT
  ${MAIN_TABLE_ALIAS}.*,
  ${MAIN_TABLE_ALIAS}.rowid as ${ROWID},
  nb.sourceId AS _edge_sourceId,
  nb.targetId AS _edge_targetId,
  nb.direction AS _edge_direction,
  nb.level AS _edge_level,
  nb.weight AS _edge_weight,
  nb.properties AS _edge_properties
FROM ranked_edges nb
JOIN "${table_name}" ${MAIN_TABLE_ALIAS} ON ${MAIN_TABLE_ALIAS}.id = nb.id
WHERE nb._edge_rn = 1${rule_sql ? ` AND ${rule_sql}` : ''}
ORDER BY _edge_level ASC, _edge_weight ASC, id ASC
LIMIT ?;`;

  return {
    sql,
    params: [entityId, ...edge_join.recursiveParams, ...edge_join.candidateParams, limit + 1]
  };
};

/**
 * 生成邻居节点数量统计 SQL
 *
 * @remarks
 * - 统计时不包含起始节点
 * - 递归阶段按 `(id, level)` 去重，最终按最短层级归并节点
 */
export const generate_entity_count_neighbors_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindNeighborsOptions
): GenerateSqlResult => {
  const { entityId, direction = 'both', level = 1, where: rule_group, edgeWhere } = options;
  const effective_direction = resolve_effective_direction(metadata, direction);
  const table_name = sqliteGetTableNameByMetadata(metadata);
  const edge_table_name = `"${sqliteGetTableName(metadata.name + '_edges', metadata.namespace)}"`;
  const hasWeight = metadata.features?.graph?.weight === true;
  const hasProperties = (metadata.features?.graph?.properties?.length ?? 0) > 0;

  // Level 0: 返回 0（不包含起始节点）
  if (level === 0) {
    return { sql: 'SELECT 0 AS count;', params: [] };
  }

  // 构建 WHERE 条件（排除起始节点 level=0）
  const where_conditions: string[] = ['nb.level > 0'];
  const rule_sql = build_rule_group_sql(rule_group, metadata, adapter);
  if (rule_sql) where_conditions.push(rule_sql);
  const where_clause = `WHERE ${where_conditions.join(' AND ')}`;

  // 构建边遍历 SQL（传递 edgeWhere）
  const edge_join = build_edge_traversal_sql(
    edge_table_name,
    effective_direction,
    level,
    hasWeight,
    hasProperties,
    metadata.name,
    edgeWhere
  );

  const sql = `WITH RECURSIVE neighbors(id, level) AS (
  SELECT id, 0 AS level
  FROM "${table_name}"
  WHERE id = ?

  UNION${edge_join.recursiveSql}
),
distances(id, level) AS (
  SELECT id, MIN(level) AS level
  FROM neighbors
  GROUP BY id
)
SELECT COUNT(*) AS count
FROM distances nb
JOIN "${table_name}" ${MAIN_TABLE_ALIAS} ON ${MAIN_TABLE_ALIAS}.id = nb.id
${where_clause};`;

  return { sql, params: [entityId, ...edge_join.recursiveParams] };
};

/**
 * 生成路径查询 SQL（含循环检测）
 *
 * @remarks
 * - 使用递归 CTE 查询两节点间所有路径
 * - 使用 CYCLE 检测防止无限循环
 * - 返回路径节点、边、长度和总权重信息
 */
export const generate_entity_find_paths_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindPathsOptions
): GenerateSqlResult => {
  const {
    fromId,
    toId,
    direction = 'both',
    maxDepth = 10,
    where: rule_group,
    edgeWhere,
    limit = GRAPH_DEFAULT_RESULT_LIMIT
  } = options;
  const effective_direction = resolve_effective_direction(metadata, direction);
  const rule_sql = build_rule_group_sql(rule_group, metadata, adapter);
  const table_name = sqliteGetTableNameByMetadata(metadata);
  const edge_table_name = `"${sqliteGetTableName(metadata.name + '_edges', metadata.namespace)}"`;
  const hasWeight = metadata.features?.graph?.weight === true;
  const hasProperties = (metadata.features?.graph?.properties?.length ?? 0) > 0;

  // 构建边遍历 JOIN 条件
  let edge_join_condition: string;
  let edge_select_id: string;

  if (effective_direction === 'out') {
    edge_join_condition = 'e.sourceId = p.currentId';
    edge_select_id = 'e.targetId';
  } else if (effective_direction === 'in') {
    edge_join_condition = 'e.targetId = p.currentId';
    edge_select_id = 'e.sourceId';
  } else {
    // 'both' - 需要两个方向
    edge_join_condition = '(e.sourceId = p.currentId OR e.targetId = p.currentId)';
    edge_select_id = 'CASE WHEN e.sourceId = p.currentId THEN e.targetId ELSE e.sourceId END';
  }

  // 权重累加
  const weight_accumulation = hasWeight ? ', p.totalWeight + COALESCE(e.weight, 0) AS totalWeight' : '';
  const weight_init = hasWeight ? ', 0 AS totalWeight' : '';

  // 使用 JSON 构建边对象，避免字符串解析问题
  // properties 用 json() 内嵌为 JSON 对象（而非转义字符串），仓库层一次 JSON.parse 即可还原
  const weight_field = hasWeight ? `, 'weight', e.weight` : '';
  const properties_field = hasProperties ? `, 'properties', json(e.properties)` : '';
  const edge_json_format = `json_object('sourceId', e.sourceId, 'targetId', e.targetId${weight_field}${properties_field})`;

  // 节点规则只作用于**中间**节点：起点由锚点段天然豁免（:449 起的 SELECT 不拼 rule_sql），
  // 终点必须在此显式豁免。否则 A -> B -> C 在 B 命中、C 未命中时整条路径被删掉，
  // 与 IGraphRepository.findPaths 的 where 契约相反（GRAPH-005）。
  // 终点在中途出现只可能构成环，已被 cycle 判定拦下，所以豁免不会放过真正的中间节点。
  const where_clause = rule_sql ? `AND (${edge_select_id} = ? OR (${rule_sql}))` : '';
  const node_rule_params = rule_sql ? [toId] : [];

  // 构建边过滤条件（应用于递归遍历时的每条边）
  const { conditions: edge_conditions, params: edge_params } = build_edge_where_conditions(
    edgeWhere as EdgeFilterOptionsFull | undefined,
    hasWeight,
    hasProperties,
    metadata.name,
    'e'
  );
  const edge_where_sql = edge_conditions.map(c => `\n  AND ${c}`).join('');

  // 递归 CTE SQL with CYCLE detection
  // 使用 JSON 数组存储节点和边，避免字符串拼接的脆弱性
  const sql = `WITH RECURSIVE paths(
  currentId,
  path_nodes,
  path_edges,
  depth,
  cycle${hasWeight ? ',\n  totalWeight' : ''}
) AS (
  -- 起始节点
  SELECT
    id AS currentId,
    json_array(id) AS path_nodes,
    json_array() AS path_edges,
    0 AS depth,
    0 AS cycle${weight_init}
  FROM "${table_name}"
  WHERE id = ?

  UNION ALL

  -- 递归扩展路径
  SELECT
    ${edge_select_id} AS currentId,
    json_insert(p.path_nodes, '$[#]', ${edge_select_id}) AS path_nodes,
    json_insert(p.path_edges, '$[#]', ${edge_json_format}) AS path_edges,
    p.depth + 1 AS depth,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM json_each(p.path_nodes)
        WHERE json_each.value = ${edge_select_id}
      ) THEN 1
      ELSE 0
    END AS cycle${weight_accumulation}
  FROM paths p
  JOIN ${edge_table_name} e ON ${edge_join_condition}
  JOIN "${table_name}" ${MAIN_TABLE_ALIAS} ON ${MAIN_TABLE_ALIAS}.id = ${edge_select_id}
  WHERE p.depth < ?
    AND p.cycle = 0
    ${where_clause}${edge_where_sql}
  LIMIT ?
),
enumerated_paths AS (
  SELECT
    paths.*,
    ROW_NUMBER() OVER () AS expansion_order
  FROM paths
),
search_state AS (
  SELECT COUNT(*) > ? AS truncated
  FROM enumerated_paths
),
matched_paths AS (
  SELECT
    path_nodes,
    path_edges,
    depth AS length${hasWeight ? ',\n    totalWeight' : ''},
    ROW_NUMBER() OVER (ORDER BY depth ASC${hasWeight ? ', totalWeight ASC' : ''}) AS result_order
  FROM enumerated_paths
  WHERE expansion_order <= ?
    AND currentId = ?
    AND depth > 0
    AND (cycle = 0 OR (? = ? AND currentId = ?))
  ORDER BY depth ASC${hasWeight ? ', totalWeight ASC' : ''}
  LIMIT ?
)

SELECT
  path_nodes,
  path_edges,
  length${hasWeight ? ',\n  totalWeight' : ''},
  search_state.truncated AS _search_truncated,
  0 AS _search_metadata,
  result_order AS _search_order
FROM matched_paths
CROSS JOIN search_state

UNION ALL

SELECT
  NULL,
  NULL,
  NULL${hasWeight ? ',\n  NULL' : ''},
  search_state.truncated,
  1,
  NULL
FROM search_state
ORDER BY _search_metadata ASC, _search_order ASC;`;

  return {
    sql,
    params: [
      fromId,
      maxDepth,
      ...node_rule_params,
      ...edge_params,
      GRAPH_MAX_PATH_EXPANSIONS + 1,
      GRAPH_MAX_PATH_EXPANSIONS,
      GRAPH_MAX_PATH_EXPANSIONS,
      toId,
      fromId,
      toId,
      toId,
      limit + 1
    ]
  };
};
