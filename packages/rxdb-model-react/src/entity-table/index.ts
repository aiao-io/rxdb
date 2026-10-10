/**
 * Entity Table —— VTable 表格宿主与查询表格组件。
 *
 * @module entity-table
 */
export { ENTITY_TABLE_CONFIG, EntityTableConfigProvider } from './config.js';
export { EntityTable, type EntityTableProps } from './entity-table.js';
export { QueryTable, type QueryTableProps } from './query-table.js';

// 核心包透传（对齐 Angular / Vue 侧 entity-table index 的 `export * from '@aiao/rxdb-model'`）；
// 表格命令面 `EntityTableHandle` / `QueryTableHandle` 是核心包里三端共用的那一份契约，也经这里导出
export * from '@aiao/rxdb-model';
