/** 字体册列表里用于筛选和展示的字体族摘要。 */
export interface FontFamilySummary {
  readonly name: string;
  readonly stack: string;
  readonly styles: string;
}

/** 按字体族名称筛选本地字体目录。 */
export function filterFontFamilies(
  families: readonly FontFamilySummary[],
  query: string
): readonly FontFamilySummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return families;
  return families.filter(family => family.name.toLocaleLowerCase().includes(normalized));
}
