/**
 * Entity Table —— VTable 表格宿主与查询表格组件。
 *
 * @module entity-table
 */
export { ENTITY_TABLE_CONFIG, EntityTableConfigProvider } from './config.js';
export { EntityTable, type EntityTableHandle, type EntityTableProps } from './entity-table.js';
export { QueryTable, type QueryTableHandle, type QueryTableProps } from './query-table.js';

// 核心包透传（对齐 Angular / Vue 侧 entity-table index 的 `export * from '@aiao/rxdb-model'`）
export * from '@aiao/rxdb-model';
