/**
 * @packageDocumentation
 * Aiao RxDB 的 Angular 绑定。
 * 提供 Signals、依赖注入和变更检测集成。
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
