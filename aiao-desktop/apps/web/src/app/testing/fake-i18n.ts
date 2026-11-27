import { I18n } from '@aiao/rxdb-i18n';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { DESKTOP_MESSAGES_EN } from '../i18n/messages-en';

/** 随包英文目录的静态运行时：假 I18n 的 `t` 委托它，英文断言按原文逐字成立（ADESK-US-132 en 逐字基线）。 */
const enCatalog = new I18n({
  defaultLocale: 'en',
  namespace: 'desktop',
  catalogs: [{ locale: 'en', namespace: 'desktop', messages: DESKTOP_MESSAGES_EN }]
});

/** 纯函数 spec 的英文目录翻译入口（FinderTranslate 等 `t` 参数直接传它）。 */
export const desktopTestTranslate = (key: string, params?: Record<string, unknown>): string => enCatalog.t(key, params);

/** 单测的假 I18n 运行时：响应式源齐全、翻译与格式化方法都是 spy（对齐 rxdb-i18n-angular 包自己的测试桩写法）。 */
export function createFakeI18n(locale = 'en'): I18n {
  const locale$ = new BehaviorSubject(locale);
  const fake = {
    locale$,
    availableLocales$: new BehaviorSubject(['en', 'zh', 'zh-Hans']),
    changes$: new BehaviorSubject(0),
    errors$: new BehaviorSubject<Error | null>(null),
    get locale(): string {
      return locale$.value;
    },
    get availableLocales(): string[] {
      return [...this.availableLocales$.value];
    },
    t: vi.fn((key: string, params: Record<string, unknown>) => enCatalog.t(key, params)),
    resolve: vi.fn(() => ({ value: undefined })),
    setLocale: vi.fn((next: string) => {
      locale$.next(next);
      return Promise.resolve();
    }),
    formatNumber: vi.fn((value: number) => String(value)),
    formatDate: vi.fn((value: Date) => String(value)),
    formatRelativeTime: vi.fn((value: number) => String(value)),
    init: vi.fn(() => Promise.resolve()),
    registerCatalog: vi.fn(),
    setMessages: vi.fn(() => Promise.resolve()),
    setRemoteMessages: vi.fn(() => Promise.resolve()),
    removeMessages: vi.fn(() => Promise.resolve()),
    removeRemoteMessages: vi.fn(() => Promise.resolve()),
    inspect: vi.fn(() => Promise.resolve({ locale, availableLocales: [], messages: [], missingMessages: [] })),
    flushDiagnostics: vi.fn(() => Promise.resolve()),
    clearMissingMessages: vi.fn(() => Promise.resolve()),
    destroy: vi.fn()
  };
  return fake as unknown as I18n;
}
