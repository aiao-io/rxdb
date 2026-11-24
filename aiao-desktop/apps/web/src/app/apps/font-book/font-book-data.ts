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

/** 侧栏的集合：全部、收藏、最近使用。 */
export const FONT_COLLECTIONS = [
  { id: 'all', name: 'All Fonts' },
  { id: 'favourites', name: 'Favourites' },
  { id: 'recent', name: 'Recently Used' }
] as const;

export type FontCollection = (typeof FONT_COLLECTIONS)[number]['id'];

/** 按集合筛选：收藏按名单，最近使用按记录次序排。 */
export const filterByCollection = (
  fonts: readonly FontFamilySummary[],
  kind: FontCollection,
  favourites: readonly string[],
  recent: readonly string[]
): readonly FontFamilySummary[] => {
  if (kind === 'all') return fonts;
  if (kind === 'favourites') {
    const loved = new Set(favourites);
    return fonts.filter(font => loved.has(font.name));
  }
  const order = new Map(recent.map((name, index) => [name, index]));
  return fonts
    .filter(font => order.has(font.name))
    .sort((left, right) => (order.get(left.name) ?? 0) - (order.get(right.name) ?? 0));
};

/** 名单里加上或去掉一个字体名（收藏与停用共用）。 */
export const toggleName = (names: readonly string[], name: string): readonly string[] =>
  names.includes(name) ? names.filter(item => item !== name) : [...names, name];

/** 最近使用最多记几条。 */
export const MAX_RECENT_FONTS = 8;

/** 最近使用：移到最前，去重，超过上限丢最旧的。 */
export const recordRecentFont = (recent: readonly string[], name: string): readonly string[] =>
  [name, ...recent.filter(item => item !== name)].slice(0, MAX_RECENT_FONTS);

/** 滑杆比例（0..1）映射成示例字号倍率（0.6..1.8）。 */
export const previewScale = (fraction: number): number => 0.6 + Math.min(1, Math.max(0, fraction)) * 1.2;

/** 示例字号按倍率缩放并取整。 */
export const scaleSizes = (sizes: readonly number[], factor: number): readonly number[] =>
  sizes.map(size => Math.round(size * factor));

/** 偏好里存着的名单要逐项校验。 */
export const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
