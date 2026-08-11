/**
 * @fileoverview RxDB Graph 插件
 * 图数据库插件，提供图结构数据存储和查询能力
 *
 * 主要功能：
 * - 图结构实体支持（GraphEntity）
 * - 邻居节点查询（findNeighbors）
 * - 路径查询（findPaths）
 * - 边管理（addEdge/removeEdge）
 *
 * @module rxdb-plugin-graph
 */

export * from './@GraphEntity.js';
export * from './constants.js';
export * from './graph-query-result.js';
export * from './graph-query.interface.js';
export * from './graph-repository.interface.js';
export * from './graph.interface.js';
export * from './GraphEntityBase.js';
export * from './GraphRepository.js';
export * from './plugin.js';
// 不在这里再导出 './sqlite.js'：SQLite 实现已有独立的 `@aiao/rxdb-plugin-graph/sqlite` 入口。
// 从根入口再导一次会让只用 PGlite / Supabase 的消费者也被迫加载整份 SQLite 图查询实现
// （打包体积 + 无谓的模块求值）。需要它请从子路径导入（GRAPH-010）。
export * from './utils.js';
