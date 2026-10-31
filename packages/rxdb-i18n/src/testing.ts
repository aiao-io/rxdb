import { I18n } from './i18n.js';

/** 当前 JavaScript 运行时的 ICU 冒烟结果。 */
export interface I18nRuntimeSmokeResult {
  /** 参数插值。 */
  readonly interpolation: string;
  /** 单数分支。 */
  readonly singular: string;
  /** 复数分支。 */
  readonly plural: string;
  /** select 指定分支。 */
  readonly selected: string;
  /** select 默认分支。 */
  readonly otherSelection: string;
  /** 带地区语言回退到父语言。 */
  readonly parentFallback: string;
  /** 目录缺失时回退默认语言。 */
  readonly defaultFallback: string;
}

const assertMessage = (name: string, actual: string, expected: string): string => {
  if (actual !== expected)
    throw new Error(
      `ICU runtime smoke failed (${name}): expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  return actual;
};

/**
 * 在调用方实际运行时验证 ICU 插值、复数、选择与语言回退。
 * @returns 可写入运行时诊断报告的实际输出。
 * @throws ICU 或 Intl 能力不满足预期时抛错，调用方应沿现有失败通道报告。
 */
export async function assertI18nRuntimeSmoke(): Promise<I18nRuntimeSmokeResult> {
  const i18n = new I18n({
    locale: 'en',
    deviceLocale: 'en-US',
    defaultLocale: 'zh-Hans',
    namespace: 'runtime-smoke',
    catalogs: [
      {
        locale: 'en',
        namespace: 'runtime-smoke',
        messages: {
          greeting: 'Hello {name}',
          count: '{count, plural, one {# item} other {# items}}',
          role: '{role, select, admin {Administrator} other {Guest}}'
        }
      },
      { locale: 'fr', namespace: 'runtime-smoke', messages: { parent: 'Bonjour {name}' } },
      { locale: 'zh-Hans', namespace: 'runtime-smoke', messages: { default: '默认文案' } }
    ]
  });
  try {
    const interpolation = assertMessage('interpolation', i18n.t('greeting', { name: 'Ada' }), 'Hello Ada');
    const singular = assertMessage('singular', i18n.t('count', { count: 1 }), '1 item');
    const plural = assertMessage('plural', i18n.t('count', { count: 2 }), '2 items');
    const selected = assertMessage('select', i18n.t('role', { role: 'admin' }), 'Administrator');
    const otherSelection = assertMessage('select.other', i18n.t('role', { role: 'reader' }), 'Guest');
    await i18n.setLocale('fr-CA');
    const parentFallback = assertMessage('parent fallback', i18n.t('parent', { name: 'Ada' }), 'Bonjour Ada');
    const defaultFallback = assertMessage('default fallback', i18n.t('default'), '默认文案');
    return { interpolation, singular, plural, selected, otherSelection, parentFallback, defaultFallback };
  } finally {
    i18n.destroy();
  }
}
