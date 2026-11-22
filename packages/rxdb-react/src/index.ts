/**
 * @packageDocumentation
 * React integration for Aiao RxDB.
 * Provides the database provider and reactive React Hooks interface.
 *
 * @module @aiao/rxdb-react
 */

/** Reactive entity, graph, and query hooks. */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks.js';

/** Public options shared by query hooks. */
export type { UseOptions } from './query-options.js';

/** React provider and integration components. */
export * from './rxdb-react.js';

/** Cursor-based infinite scrolling. */
export * from './useInfiniteScroll.js';

/** Async action state shared with the Angular and Vue bindings. */
export * from './use-action.js';

/** Namespace-scoped localStorage state shared with the Angular and Vue bindings. */
export * from './use-persisted-state.js';

/** Bridges in-place entity patches to React rendering. */
export * from './use-entity-change.js';

/** Local-first synchronization state shared with the Angular and Vue bindings. */
export * from './use-sync-state.js';
