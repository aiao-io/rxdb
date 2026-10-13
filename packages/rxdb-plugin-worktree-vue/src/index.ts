/**
 * rxdb-plugin-worktree-vue - Vue 集成层
 *
 * 提供 `useWorktree()` composable，把 `@aiao/rxdb-plugin-worktree` 的 `WorktreeManager`
 * 适配成 Vue `ComputedRef` 消费接口。命名与 Angular / React 绑定层一致（tri-framework-api.md §3）。
 *
 * @packageDocumentation
 */

// **只转出入口本身**，不把插件包的类型与错误类在这里再导一遍。
// 与 `rxdb-plugin-search-*` 的 SRCHR-006 有意不同：那边转出 `SearchExecutionError`
// 是因为 `SearchState` 的 `error` 就是那一个类；这里 `WorktreeErrorState.error`
// 的静态类型是 `Error`，真正要 `instanceof` 的类有十来个，全转等于在一个纯适配包上
// 复制插件包的公开面。调用方本来就得装 `@aiao/rxdb-plugin-worktree`（peer），
// 类型与错误类一律从它直接 import —— 这也正是本次搬迁前的既有写法。
export { useWorktree } from './use-worktree.js';
export type { WorktreeResource } from './use-worktree.js';
