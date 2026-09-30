/**
 * rxdb-plugin-tree-vue - Vue 集成层
 *
 * 提供 `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`
 * 四个 composable，把 `@aiao/rxdb-plugin-tree` 注册的树查询接到 Vue 响应式系统。
 *
 * @remarks
 * 这四个 composable 依赖插件注册的 `TreeRepository`，应用必须先 `rxdb.use(rxDBPluginTree)`。
 *
 * @packageDocumentation
 */

export { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from './use-tree.js';
