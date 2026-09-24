/**
 * 活游标分页的 **CREATE 增量合并** 语义 —— 三端 `live cursor boundary` 用例组共用。
 *
 * @remarks
 * RXT-007 立的那个「三端参数化游标契约」的第一块：把核心的语义放在一处，让三端各自真实执行。
 *
 * Angular `RAN-001` / React `RRE-005` / Vue `RVU-004` 三组用例原先各自手写一份
 * 「数据集一变就按各自游标重切一遍」的夹具，那等价于**每次变更都回 SQL 重查**。
 * 核心只在一部分路径上这么做：
 *
 * - `merge_update` / `merge_remove` 的 `findByCursor` 分支一律回 SQL（排序键变化会挪动窗口，
 *   JS 侧算不准），所以**删除 / 重排**继续用各端原有的「重切」夹具建模，那是忠实的；
 * - `merge_create` 走的是 **JS 增量合并**：新行并进页内，只裁新行、绝不裁掉本页原有的行，
 *   于是**页可以涨过 `limit` 而页尾不动**。这条由本文件的
 *   {@link mergeCreatedIntoCursorPage} 建模。
 *
 * 两条都真实存在 —— CREATE 命中关系 where、或事件比实体缓存陈旧时，`merge_create` 同样
 * 回 SQL（`query_need_refresh_create`），那时页重裁到 `limit`、页尾随之移动。
 * 三端的重锚判断必须对**两条**都正确，所以两条都要有消费者。
 *
 * 建模对象是 `packages/rxdb/src/query/merge_create.ts` 的 `clip_to_window`，
 * 其行为由核心用例 `merge_create.spec.ts`（「应该在增量场景下结果集大小超过 limit」）与
 * `review-query.regression.spec.ts` 的 `Q6` 钉住；公开契约写在 `FindByCursorOptions.limit` 上。
 *
 * 放本包而不是三端各抄一份：这里装的是**语义**不是数据，抄件跑偏不会在 diff 里显形 ——
 * 而「三端对同一场景断言相反」正是这个缺陷当初能在两端潜伏的原因。
 */

/** 游标分页建模所需的最小行结构：`orderBy: [{ sort, asc }, { id, asc }]`。 */
export interface CursorRowLike {
  readonly id: string;
  readonly sort: number;
}

/** 复刻 `WHERE (sort, id) > (cursor.sort, cursor.id)`：游标行本身被删掉也照样可比。 */
const isAfterCursor = (candidate: CursorRowLike, cursor: CursorRowLike): boolean =>
  candidate.sort === cursor.sort ? candidate.id > cursor.id : candidate.sort > cursor.sort;

/** `orderBy: [{ sort, asc }, { id, asc }]` 的比较器。 */
const byCursorOrder = (a: CursorRowLike, b: CursorRowLike): number =>
  a.sort === b.sort ? a.id.localeCompare(b.id) : a.sort - b.sort;

/**
 * 把新建的行按核心 `merge_create` 的 JS 增量语义并进**已经加载出来的一页**。
 *
 * @typeParam R - 行类型，至少有 `id` 与 `sort`
 * @param page - 这一页当前的内容（已按游标序）
 * @param created - 本次 CREATE 的行；不落在本页游标之后的会被丢弃
 * @param cursor - 开这一页时固化的 `after` 游标；首页传 `undefined`
 * @param limit - 开这一页时传的 `limit`
 * @returns 合并后的这一页
 *
 * @remarks
 * 关键是**窗口边界是「原有行里最后那一条」，不是条数**：新行插进页中间时，
 * 页会涨到 `limit` 以上，好让页尾——也就是下一页游标锚的那条——原地不动。
 * 按条数裁会把原有的尾行挤出去，下一页的锚点当场失效，边界那条记录就此消失。
 *
 * 只建模向后（`after`）分页，三端的无限滚动都只往后翻。
 *
 * @example
 * ```ts
 * // 首页 [a,b]（limit 2），头插 x：页涨到 3，页尾仍是 b，下一页不必重锚
 * mergeCreatedIntoCursorPage([a, b], [x], undefined, 2); // → [x, a, b]
 * ```
 */
export const mergeCreatedIntoCursorPage = <R extends CursorRowLike>(
  page: readonly R[],
  created: readonly R[],
  cursor: CursorRowLike | undefined,
  limit: number
): R[] => {
  const admitted = created.filter(row => !cursor || isAfterCursor(row, cursor));
  if (admitted.length === 0) return [...page];

  const byId = new Map<string, R>(page.map(row => [row.id, row]));
  admitted.forEach(row => byId.set(row.id, row));
  const sorted = [...byId.values()].sort(byCursorOrder);

  // 原有行里最后那一条的位置 —— 窗口至少要留到这里，它就是下一页的游标锚。
  const oldIds = new Set(page.map(row => row.id));
  let lastOld = -1;
  sorted.forEach((row, index) => {
    if (oldIds.has(row.id)) lastOld = index;
  });

  return sorted.slice(0, Math.max(limit, lastOld + 1));
};
