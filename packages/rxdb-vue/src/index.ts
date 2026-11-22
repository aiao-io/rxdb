/**
 * @packageDocumentation
 * Aiao RxDB 的 Vue 3 绑定。
 * 提供依赖注入和响应式 Vue 组合式函数。
 *
 * @module @aiao/rxdb-vue
 */

/** 实体、图和查询的响应式组合式函数。 */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks';

/** Vue 数据库注入与集成组件。 */
export * from './rxdb-vue';

/** 基于游标的无限滚动。 */
export * from './useInfiniteScroll';

/** 跟踪异步操作的执行状态。 */
export * from './use-action';

/** 按命名空间持久化 localStorage 状态。 */
export * from './use-persisted-state';

/** 实体原地更新后触发 Vue 响应式更新。 */
export * from './use-entity-change';

/** 应用本地读写和后台同步的状态。 */
export * from './use-sync-state';
