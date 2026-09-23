/**
 * @fileoverview Tree 插件常量
 */

/**
 * 树查询任务类型的**单一来源**。
 *
 * @remarks
 * 这四个名字要被三处消费：`*Query` 接口的 `type` 字段（类型侧）、
 * {@link TREE_QUERY_TYPES}（三个 merge 的首道过滤）、`TreeRepository._STATIC_METHODS`
 * （挂到实体上的静态方法名）。它们此前各写一份，加第五种树查询时漏掉其中一处
 * **不会报错**，只会让新任务静默落回核心默认 merge、或者压根不挂到实体上。
 *
 * 现在后两者从这里派生，接口侧用 `Extract<TreeQueryType, …>` 与它绑定，
 * 双向一致性由 `__tests__/contracts/tree-query-type-parity.spec.ts` 在编译期钉死。
 */
export const TREE_QUERY_TYPE_LIST = ['findDescendants', 'findAncestors', 'countDescendants', 'countAncestors'] as const;

/**
 * 树查询任务类型的联合，由 {@link TREE_QUERY_TYPE_LIST} 派生。
 */
export type TreeQueryType = (typeof TREE_QUERY_TYPE_LIST)[number];

/**
 * 树查询任务类型集合
 *
 * @remarks
 * 三个 merge 函数用它做首道过滤：`TreeRepository` 把自己注册到 `QueryManager` 时是
 * 按 task 类型逐个登记的，但同一个 Repository 上也跑着 `findAll` / `count` 这类通用查询，
 * 它们必须原样落回核心的默认 merge。没有这一句，树的增量逻辑会去接管非树任务。
 *
 * 元素类型声明成 `string` 而不是 {@link TreeQueryType}：调用方传进来的是
 * `QueryTask.type`（`string`），收窄成联合反而让 `has()` 在调用点编译失败。
 */
export const TREE_QUERY_TYPES: ReadonlySet<string> = new Set<string>(TREE_QUERY_TYPE_LIST);
