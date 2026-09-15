/**
 * @packageDocumentation
 * RxDB Angular 集成包 - Angular 框架的 RxDB 响应式数据库支持
 * 提供 Angular 特有的响应式状态管理和变更检测集成
 */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks';
export * from './InfiniteScrollingList';
export { RxDBEntityChangeDirective } from './rxdb-change-detector.directive';
export { provideRxDB, useRxDB, useRxDBOptional, type RxDBSource } from './rxdb.provider';
export * from './use-action';
export * from './use-infinite-scroll';
export * from './use-persisted-state';
export * from './use-state';
export * from './use-sync-state';
