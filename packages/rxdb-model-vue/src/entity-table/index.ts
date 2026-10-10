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

// 核心包透传；表格命令面 `EntityTableHandle` / `QueryTableHandle` 是核心包里三端共用的那一份契约，
// 组件 `defineExpose` 的形状由 public-api spec 的编译期守卫钉住满足它
export * from '@aiao/rxdb-model';
