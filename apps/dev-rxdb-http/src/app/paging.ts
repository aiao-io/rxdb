/**
 * 分页的算术。
 *
 * @remarks
 * 与 `filter-rules.ts` 同一个用意：纯函数、不碰 Angular、不碰网络，边界条件可以脱离浏览器验。
 *
 * 这里只有「页码与页长怎么换算」这一件事。**页码本身不是这里的状态**——
 * 组件持有的是「用户请求的页码」这个原始 signal，真正生效的页码是把它喂给
 * {@link clampPage} 得到的 computed。两段式的好处是越界能自愈：筛选收窄、删行、
 * 切页长、清空数据，都会让页数变小，而请求页码不用被谁记得去改。
 */

/**
 * 本地一次能读出的行数上限，同时也是页长选项里「全部」的取值。
 *
 * @remarks
 * 刻意**高于**种子的 250 行。取值正好等于种子行数时，列表排序是 `updatedAt asc`，
 * 而新建行的 `updatedAt` 是服务端当前时刻——必然排在最末，也就必然被这条 `limit` 切掉：
 * 新建成功、后端也确实多了一行、页面上却什么都没变。
 *
 * `limit` 只下推本地读，不改同步范围（同步的粒度是整个 `where`），所以放宽它
 * 不会多发一个请求，只是别让「显示上限」正好卡在「数据量」上。
 *
 * 「全部」直接复用这个数值而不是另设一个哨兵（`-1` / `Infinity` / `null`）：
 * 哨兵得在下推 `limit` 之前翻译一次，而翻译点就是将来漏判的地方。
 */
export const ALL_ROWS_LIMIT = 1000;

/** 页长选项的一项。 */
export interface PageSizeOption {
  readonly label: string;
  readonly value: number;
}

/** 页长候选。最后一项是「全部」，取值即 {@link ALL_ROWS_LIMIT}。 */
export const PAGE_SIZE_OPTIONS: readonly PageSizeOption[] = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '全部', value: ALL_ROWS_LIMIT }
];

/** 默认页长。250 行种子正好 5 页——够多到翻页有意义，又不至于翻到手酸。 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * 总行数与页长算出页数。
 *
 * @remarks
 * 空集合返回 `1` 而不是 `0`：页码是拿来显示的（`第 1 / 1 页`），
 * 而「第 1 / 0 页」既不成立也没法夹紧。
 */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize));

/**
 * 把用户请求的页码夹进当前合法区间。
 *
 * @param requested - 用户请求的页码，**0 起**。允许越界，这正是它存在的理由。
 * @returns 落在 `[0, pageCount - 1]` 内的页码。
 */
export const clampPage = (requested: number, total: number, pageSize: number): number =>
  Math.min(Math.max(0, requested), pageCount(total, pageSize) - 1);
