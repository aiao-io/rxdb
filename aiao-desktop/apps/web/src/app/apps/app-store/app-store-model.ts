/** 按条目文字（名称、摘要、来源拼起来）过滤目录条目；查询为空时保留原列表。 */
export const filterCatalog = <T>(items: readonly T[], text: (item: T) => string, query: string): readonly T[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  return items.filter(item => text(item).toLocaleLowerCase().includes(normalized));
};
