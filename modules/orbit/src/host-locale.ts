/**
 * 文档站宿主与演示子应用之间的语言协议。
 *
 * 只做启动期读取：网站切换语言走整页导航，宿主与子应用会一起重新启动，
 * 不需要像主题那样的实时事件通道。
 */

/** 宿主下发的 UI 语言，与 rxdb-i18n 的 `UiLocale` 同集合。 */
export type HostLocale = 'en' | 'zh-Hans';

/**
 * 把宿主传来的任意载荷收成受支持的语言。
 *
 * @param value - `props.locale` 或其它未知值
 * @returns 无法识别时返回 `undefined`，由调用方回退设备语言
 */
export function parseHostLocale(value: unknown): HostLocale | undefined {
  if (value === 'en' || value === 'zh-Hans') return value;
  return undefined;
}
