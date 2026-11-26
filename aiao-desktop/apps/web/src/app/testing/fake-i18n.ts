import type { I18n } from '@aiao/rxdb-i18n';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

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
    t: vi.fn((key: string) => key),
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
