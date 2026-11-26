/**
 * @packageDocumentation
 * Aiao RxDB 的 React 绑定。
 * 提供数据库 Provider 和响应式 React Hooks。
 *
 * @module @aiao/rxdb-react
 */

/** 实体、图和查询的响应式 Hooks。 */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks.js';

/** 查询 Hooks 的公共选项。 */
export type { UseOptions } from './query-options.js';

/** React 数据库注入与集成组件。 */
export * from './rxdb-react.js';

/** 基于游标的无限滚动。 */
export * from './useInfiniteScroll.js';

/** 跟踪异步操作的执行状态。 */
export * from './use-action.js';

/** 按命名空间持久化 localStorage 状态。 */
export * from './use-persisted-state.js';

/** 实体原地更新后触发 React 渲染。 */
export * from './use-entity-change.js';

/** 应用本地读写和后台同步的状态。 */
export * from './use-sync-state.js';
