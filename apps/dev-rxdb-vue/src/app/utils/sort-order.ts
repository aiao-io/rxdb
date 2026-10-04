interface SortOrderNode {
  sortOrder?: string | null;
}

/**
 * 按 `sortOrder` 的码点字典序比较，与数据库（SQLite `BINARY`）及 Angular 端的排序一致。
 *
 * fractional-indexing 的键大小写敏感（`a0V < a0l`），`localeCompare` 会把它们排反，
 * 往同一空隙连续插入两次后界面顺序就与库里不符。缺键视为空串、排在最前。
 */
export const compareSortOrder = (a: SortOrderNode, b: SortOrderNode): number => {
  const left = a.sortOrder ?? '';
  const right = b.sortOrder ?? '';
  return (
    left < right ? -1
    : left > right ? 1
    : 0
  );
};
