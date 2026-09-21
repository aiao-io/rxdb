/**
 * @fileoverview Tree 插件常量
 */

/**
 * 树查询任务类型集合
 *
 * @remarks
 * 三个 merge 函数用它做首道过滤：`TreeRepository` 把自己注册到 `QueryManager` 时是
 * 按 task 类型逐个登记的，但同一个 Repository 上也跑着 `findAll` / `count` 这类通用查询，
 * 它们必须原样落回核心的默认 merge。没有这一句，树的增量逻辑会去接管非树任务。
 */
export const TREE_QUERY_TYPES: ReadonlySet<string> = new Set([
  'findDescendants',
  'findAncestors',
  'countDescendants',
  'countAncestors'
]);
