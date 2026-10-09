/**
 * @aiao/rxdb-model-angular
 *
 * RxDB 模型 Angular 组件库。
 * VTable 基础设施请从 `@aiao/rxdb-model` 导入。
 */

// Angular 配置
export { ENTITY_TABLE_CONFIG } from './config';

// Angular 组件
export { EntityTableComponent } from './entity-table/entity-table.component';
export { QueryTableComponent } from './query-table/query-table.component';

// 表格命令面类型（对齐 React 侧 `EntityTableHandle` / `QueryTableHandle`；
// Angular 的命令面就是组件实例本身，别名提供三端一致的命名）
export type { EntityTableComponent as EntityTableHandle } from './entity-table/entity-table.component';
export type { QueryTableComponent as QueryTableHandle } from './query-table/query-table.component';

export * from '@aiao/rxdb-model';
