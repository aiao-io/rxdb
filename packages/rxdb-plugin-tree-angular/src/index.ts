/**
 * rxdb-plugin-tree-angular - Angular 集成层
 *
 * 提供 `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`
 * 四个函数，把 `@aiao/rxdb-plugin-tree` 注册的树查询接到 Angular signal。
 * 命名与 React / Vue 绑定层一致。
 *
 * @remarks
 * 这四个函数依赖插件注册的 `TreeRepository`，应用必须先 `rxdb.use(rxDBPluginTree)`。
 *
 * @packageDocumentation
 */

export { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from './use-tree.js';
