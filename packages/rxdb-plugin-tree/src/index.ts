/**
 * @packageDocumentation
 * RxDB Tree 插件
 * 树形结构插件，提供邻接表模型的实体基类、装饰器、仓储与增量查询合并
 *
 * 主要功能：
 * - 树形实体基类与装饰器（`TreeAdjacencyListEntityBase` / `@TreeEntity`）
 * - 四个树查询（`findDescendants` / `countDescendants` / `findAncestors` / `countAncestors`）
 * - 树查询的真增量 merge（不像图查询一律回 SQL 刷新）
 *
 * @module rxdb-plugin-tree
 */

export * from './constants.js';
export * from './entity/tree-entity-base.js';
export * from './entity/tree-entity.decorator.js';
export * from './entity/tree-entity.interface.js';
export * from './entity/tree-metadata.interface.js';
export * from './plugin.js';
export * from './query/tree-query.interface.js';
export * from './repository/tree-level.utils.js';
export * from './repository/tree-repository.interface.js';
export * from './repository/TreeRepository.js';
