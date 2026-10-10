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

// 核心包透传；表格命令面 `EntityTableHandle` / `QueryTableHandle` 是核心包里三端共用的那一份契约，
// 两个组件 `implements` 它（Angular 的命令面就是组件实例本身）
export * from '@aiao/rxdb-model';
