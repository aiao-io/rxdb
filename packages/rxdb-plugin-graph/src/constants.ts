/**
 * @fileoverview Graph 插件常量
 * 图插件常量定义
 */

/**
 * 图查询最大层级
 * 防止递归查询层级过深导致性能问题
 */
export const GRAPH_MAX_LEVEL = 100 as const;

/**
 * 路径查询默认最大深度
 */
export const GRAPH_DEFAULT_MAX_DEPTH = 10 as const;

/**
 * 路径查询最大深度限制
 */
export const GRAPH_MAX_DEPTH = 100 as const;

/** 图查询默认最多返回的结果数。 */
export const GRAPH_DEFAULT_RESULT_LIMIT = 1000 as const;

/** 图查询允许调用方请求的结果数硬上限。 */
export const GRAPH_MAX_RESULT_LIMIT = 10_000 as const;

/** 单次路径查询允许加入递归 CTE 的最大行数。 */
export const GRAPH_MAX_PATH_EXPANSIONS = 100_000 as const;

/**
 * 图查询任务类型集合
 * 用于 merge 操作中快速判断是否为图相关查询
 */
export const GRAPH_QUERY_TYPES: ReadonlySet<string> = new Set(['findNeighbors', 'countNeighbors', 'findPaths']);
