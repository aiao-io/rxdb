'use client';

/**
 * rxdb-plugin-search-react - React 集成层
 *
 * 提供 `useSearch()` hook，将 `@aiao/rxdb-plugin-search` 的 `SearchHandle` 适配为 React 状态消费接口。
 *
 * @packageDocumentation
 */

// `SearchExecutionError` 是 core 的**运行时 class**，必须作为值再导出：
// 混在 `export type` 里会让它在真实 ESM 中不存在，消费者拿到 `error` 后
// 无法 `instanceof`，只能额外从 core import（SRCHR-006，三端同款）。
export { SearchExecutionError } from '@aiao/rxdb-plugin-search';
export type { SearchHandle, SearchOptions, SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
export { useSearch } from './use-search.js';
export type { SearchSourceLike, UseSearchReturn } from './use-search.js';
