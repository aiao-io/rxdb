import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, PlatformLocation, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
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
import { provideLoadingBarInterceptor } from '@ngx-loading-bar/http-client';
import { provideLoadingBarRouter } from '@ngx-loading-bar/router';
import { appRoutes } from './app.routes';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

const resolveLocale = (): 'zh' | 'en-US' => {
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
      if (resolveLocale() === 'zh') {
        const locale = await import('@angular/common/locales/zh-Hans');
        registerLocaleData(locale.default, 'zh');
      }
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
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
