/**
 * @aiao/rxdb-model-vue 实体表格模块（对齐 Angular 侧 `entity-table/index.ts`）。
 *
 * VTable 基础设施请从 `@aiao/rxdb-model` 导入。
 */

// Vue 配置
export { ENTITY_TABLE_CONFIG } from './config';

// Vue 组件
export { default as EntityTable } from './EntityTable.vue';
export { default as QueryTable } from './QueryTable.vue';

export * from '@aiao/rxdb-model';
