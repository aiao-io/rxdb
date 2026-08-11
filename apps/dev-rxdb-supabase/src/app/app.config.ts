import { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { DOCUMENT, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import localeZhHans from '@angular/common/locales/zh-Hans';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { appRoutes } from './app.routes';
import setup_rxdb from './setup_rxdb_wa-sqlite';

registerLocaleData(localeZhHans, 'zh');

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: LOCALE_ID,
      useFactory: () => {
        const local = Intl.DateTimeFormat().resolvedOptions().locale;
        if (local.includes('zh')) return 'zh';
        return 'en-US';
      }
    },
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      }),
      // P2-5：原先还传了一个函数体只剩一行注释掉的 console.log 的 `onViewTransitionCreated`。
      // 空回调会覆盖 Angular 的默认实现，看着像"这里有定制"，实际是把默认行为换成了什么都不做。
      withViewTransitions({ skipInitialTransition: true })
    ),
    provideRxDB(setup_rxdb),
    provideAppInitializer(async () => {
      const rxdb = inject(RxDB);
      const document = inject(DOCUMENT);
      const adapter = await rxdb.connect('wa-sqlite');
      document.documentElement.dataset['rxdbLocalAdapter'] = adapter.name;
    }),
    provideHttpClient(withFetch(), withInterceptorsFromDi())
  ]
};
