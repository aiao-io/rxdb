/**
 * rxdb-plugin-search-angular - Angular 集成层
 *
 * 提供 `useSearch()`，将 `@aiao/rxdb-plugin-search` 的 `SearchHandle` 适配为 Angular signal
 * 消费接口。命名与 React / Vue 绑定层一致。
 *
 * @packageDocumentation
 */

// `SearchExecutionError` 是 core 的**运行时 class**，必须作为值再导出：
// 混在 `export type` 里会让它在真实 ESM 中不存在，消费者拿到 `error` 后
// 无法 `instanceof`，只能额外从 core import（SRCHR-006，三端同款）。
export { SearchExecutionError } from '@aiao/rxdb-plugin-search';
export type { SearchHandle, SearchOptions, SearchResult, SearchState } from '@aiao/rxdb-plugin-search';
export { useSearch } from './inject-search.js';
export type { SearchSourceLike, UseSearchReturn } from './inject-search.js';
