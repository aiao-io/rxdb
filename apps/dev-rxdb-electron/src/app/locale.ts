/**
 * 把浏览器上报的 locale 归一到本应用注册过的两种 `LOCALE_ID` 之一。
 *
 * 只注册了 `zh-Hans` 与内建的 `en-US`，传入未注册的 locale 会让
 * Angular 的日期/数字管道在运行时抛错，因此这里只做二选一而不透传原值。
 *
 * @param locale `Intl.DateTimeFormat().resolvedOptions().locale` 之类的原始标识
 * @returns 中文环境返回 `'zh'`，其余一律 `'en-US'`
 */
export function resolveLocaleId(locale: string): 'zh' | 'en-US' {
  return locale.includes('zh') ? 'zh' : 'en-US';
}
