/** locale 回退链的唯一数据契约，供 UI 与数据翻译共用。 */
export interface LocalePreferences {
  /** 显式请求语言。 */
  locale?: string;
  /** 当前设备上用户显式选择的语言。 */
  devicePreferredLocale?: string | null;
  /** 宿主语言。 */
  deviceLocale: string;
  /** 应用默认语言。 */
  defaultLocale: string;
}

/** 将非空 BCP 47 标签规范化；非法标签抛出 RangeError。 */
export const canonicalizeLocale = (locale: string): string => {
  if (!locale.trim()) throw new RangeError('locale must be a non-empty BCP 47 tag');
  return Intl.getCanonicalLocales(locale)[0];
};

const parents = (locale: string): string[] => {
  const canonical = canonicalizeLocale(locale);
  const base = new Intl.Locale(canonical).baseName;
  const result = [canonical];
  if (base !== canonical) result.push(base);
  const parts = base.split('-');
  while (parts.length > 1) {
    parts.pop();
    result.push(parts.join('-'));
  }
  return result;
};

/** 每个节点先精确匹配再查父语言，最后按首次出现顺序去重。 */
export const buildLocaleChain = (preferences: LocalePreferences): string[] => [
  ...new Set(
    [preferences.locale, preferences.devicePreferredLocale, preferences.deviceLocale, preferences.defaultLocale]
      .filter((locale): locale is string => locale != null)
      .flatMap(parents)
  )
];
