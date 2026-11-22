/**
 * @packageDocumentation
 * Vue 3 integration for Aiao RxDB.
 * Provides dependency injection and the Vue Composition API interface.
 *
 * @module @aiao/rxdb-vue
 */

/** Reactive entity, graph, and query composables. */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks';

/** Vue provider and integration components. */
export * from './rxdb-vue';

/** Cursor-based infinite scrolling. */
export * from './useInfiniteScroll';

/** Async action state shared with the Angular and React bindings. */
export * from './use-action';

/** Namespace-scoped localStorage state shared with the Angular and React bindings. */
export * from './use-persisted-state';

/** Bridges in-place entity patches to Vue reactivity. */
export * from './use-entity-change';

/** Local-first synchronization state shared with the Angular and React bindings. */
export * from './use-sync-state';
