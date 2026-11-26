import { provideRxDB } from '@aiao/rxdb-angular';
import { I18N, provideI18n, useI18n } from '@aiao/rxdb-i18n-angular';
import { APP_BASE_HREF, PlatformLocation, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { HISTORY_SIDEBAR_PRESENTATION, type HistorySidebarPresentation } from '@modules/angular';
import { describeHistory, historyTimeOptions } from '@modules/demo-i18n/history';
import { provideLoadingBarInterceptor } from '@ngx-loading-bar/http-client';
import { provideLoadingBarRouter } from '@ngx-loading-bar/router';
import { appRoutes } from './app.routes';
import { dbConnectionError } from './rxdb/db-connection';
import { createDemoI18n, resolveDemoInitialLocale } from './rxdb/i18n';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

/**
 * Angular LOCALE_ID：嵌入文档站时跟随宿主语言，与 rxdb-i18n 的启动语言保持一致；
 * 独立运行时保留原有设备解析（含 zh 的语言回退 zh，其余回退 en-US）。
 * 同步且防御式读取，可安全地在 LOCALE_ID 注入期调用。
 */
export const resolveLocale = (): string => {
  const { hostLocale } = resolveDemoInitialLocale();
  if (hostLocale) return hostLocale;
  const local = Intl.DateTimeFormat().resolvedOptions().locale;
  return local.includes('zh') ? 'zh' : 'en-US';
};

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (platformLocation: PlatformLocation) => platformLocation.getBaseHrefFromDOM(),
      deps: [PlatformLocation]
    },
    {
      provide: LOCALE_ID,
      useFactory: resolveLocale
    },
    provideAppInitializer(async () => {
      const [zhHans, en] = await Promise.all([
        import('@angular/common/locales/zh-Hans'),
        import('@angular/common/locales/en')
      ]);
      // LOCALE_ID 可能是 'zh-Hans' / 'en'（嵌入宿主）或 'zh' / 'en-US'（独立设备回退）：
      // zh-Hans 数据注册到 'zh-Hans' 与 'zh'，en 数据注册到 'en'，'en-US' 使用 Angular 内置默认数据。
      registerLocaleData(zhHans.default, 'zh-Hans');
      registerLocaleData(zhHans.default, 'zh');
      registerLocaleData(en.default, 'en');
    }),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      }),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: () => {
          // console.log('View transition from', from, 'to', to);
        }
      })
    ),
    provideRxDB(setup_rxdb),
    provideI18n(() => createDemoI18n(setup_rxdb())),
    {
      provide: HISTORY_SIDEBAR_PRESENTATION,
      useFactory: (): HistorySidebarPresentation => {
        const { t, formatDate } = useI18n();
        return {
          label: t,
          formatTime: date => formatDate(date, historyTimeOptions),
          description: item => describeHistory(item, t)
        };
      }
    },
    provideAppInitializer(() =>
      inject(I18N)
        .init()
        .catch(error => {
          if (dbConnectionError() === null) throw error;
        })
    ),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
