import type { SearchOptions } from '../types.js';

/**
 * @packageDocumentation
 * `SearchOptions` 的结构相等判断 —— 三框架绑定层共用的**重建判据**。
 *
 * @remarks
 * 三个绑定层（React / Angular / Vue）都要回答同一个问题：
 * 调用方每次渲染都新建一个 options 字面量，什么时候才算「选项真的变了、
 * 需要销毁旧 `SearchHandle` 重建一个」。引用相等在这里毫无用处。
 *
 * 这份判据必须**三端逐字同一份**：若各写各的，
 * 「三框架 API 对称」就只剩函数签名对称，而重建时机会各不相同 ——
 * 那是比不对称更难查的一种不对称。
 */

function collectionsEqual(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

type ComparedKeys = 'debounce' | 'pageSize' | 'snippetLength' | 'collections';
type IntentionallyIgnoredKeys = 'initialQuery';
type UnhandledKeys = Exclude<keyof SearchOptions, ComparedKeys | IntentionallyIgnoredKeys>;

function assertSearchOptionsExhaustive<T extends never>(): T | undefined {
  /* 中文：新增 SearchOptions 字段时，必须明确加入比较或忽略集合。 */
  return undefined;
}

assertSearchOptionsExhaustive<UnhandledKeys>();

/**
 * 判断两份 {@link SearchOptions} 在**重建 `SearchHandle` 的意义上**是否等价。
 *
 * @remarks
 * `collections` 按**顺序敏感**的逐项比较：它决定 FTS 聚合范围与结果排序输入，
 * 顺序不同即视为不同范围，不做集合语义的归一化。
 *
 * **`initialQuery` 被刻意排除在判断之外。**
 * 绑定层的契约是「重建时保留用户当前 query」，`initialQuery` 只在首次创建时作为种子，
 * 之后每次重建都以当前 query 覆盖它 —— 它对重建结果没有任何影响。
 * 若让它参与判断，调用方为播种新 handle 而传 `initialQuery: query` 时
 * 会**每次击键都触发一次重建**，防抖与分页全部失效。
 * 见 SRCHR-001 / SRCHV-004 / SRA-008。
 *
 * @param left - 上一次生效的选项；`undefined` 表示未传
 * @param right - 本次传入的选项；`undefined` 表示未传
 * @returns 两者等价（无需重建）时为 `true`
 * @public
 */
export function searchOptionsEqual(left: SearchOptions | undefined, right: SearchOptions | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return (
    left.debounce === right.debounce &&
    left.pageSize === right.pageSize &&
    left.snippetLength === right.snippetLength &&
    collectionsEqual(left.collections, right.collections)
  );
}
