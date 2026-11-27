import { kindOf, titleFor } from './safari-url';

/** 地址栏建议里的一行。 */
export interface AddressSuggestion {
  readonly url: string;
  /** 建议行显示的标题（与标签标题一致）。 */
  readonly label: string;
}

/** 收藏夹给建议提供的候选来源。 */
export interface SuggestSource {
  readonly url: string;
  readonly name?: string;
}

/**
 * 地址栏建议：查询为空时给出最近访问的地址；有查询时从历史（在前）与收藏夹里
 * 找地址或收藏名包含查询的候选，按此顺序去重，最多 `limit` 条。空地址与起始页不参与。
 * `t` 提供时建议标题随语言显示，缺省保持英文。
 */
export function suggestAddresses(
  query: string,
  history: readonly string[],
  favourites: readonly SuggestSource[],
  limit = 6,
  t?: (key: string) => string
): readonly AddressSuggestion[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  const push = (url: string): void => {
    if (!url || kindOf(url) === 'start' || seen.has(url) || out.length >= limit) return;
    seen.add(url);
    out.push({ url, label: titleFor(url, t) });
  };
  if (!q) {
    for (const url of history) push(url);
    return out;
  }
  const matches = (url: string, name?: string): boolean =>
    url.toLowerCase().includes(q) || (name !== undefined && name.toLowerCase().includes(q));
  for (const url of history) {
    if (matches(url)) push(url);
  }
  for (const fav of favourites) {
    if (matches(fav.url, fav.name)) push(fav.url);
  }
  return out;
}
