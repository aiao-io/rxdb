/**
 * rxdb-plugin-working-tree-angular - Angular 集成层
 *
 * 提供 `useWorkingTree()`，把 `@aiao/rxdb-plugin-working-tree` 的 `WorkingTreeManager`
 * 适配成 Angular signal 消费接口。命名与 React / Vue 绑定层一致（tri-framework-api.md §3）。
 *
 * @packageDocumentation
 */

// **只转出入口本身**，不把插件包的类型与错误类在这里再导一遍。
// 与 `rxdb-plugin-search-*` 的 SRCHR-006 有意不同：那边转出 `SearchExecutionError`
// 是因为 `SearchState` 的 `error` 就是那一个类；这里 `WorkingTreeErrorState.error`
// 的静态类型是 `Error`，真正要 `instanceof` 的类有十来个，全转等于在一个纯适配包上
// 复制插件包的公开面。调用方本来就得装 `@aiao/rxdb-plugin-working-tree`（peer），
// 类型与错误类一律从它直接 import —— 这也正是本次搬迁前的既有写法。
export { useWorkingTree } from './use-working-tree.js';
export type { WorkingTreeResource } from './use-working-tree.js';
