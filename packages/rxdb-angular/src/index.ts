/**
 * @packageDocumentation
 * Angular integration for Aiao RxDB.
 * Provides Signals, dependency injection, and Angular change-detection integration.
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
