import { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, PlatformLocation, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideLoadingBarInterceptor } from '@ngx-loading-bar/http-client';
import { provideLoadingBarRouter } from '@ngx-loading-bar/router';
import { appRoutes } from './app.routes';
import { RxDBConnectionState } from './rxdb-connection-state';
import { connectRxDB } from './rxdb-initializer';
import { selectLocalBackend } from './setup_rxdb';

/** 按浏览器/系统语言挑 locale id。 */
const resolveLocaleId = (): string => (Intl.DateTimeFormat().resolvedOptions().locale.includes('zh') ? 'zh' : 'en-US');

/** 非默认 locale 需要先加载数据；返回的 Promise 由 initializer 等待。 */
const registerLocaleIfNeeded = async (localeId: string): Promise<void> => {
  if (localeId !== 'zh') return;
  const locale = await import('@angular/common/locales/zh-Hans');
  registerLocaleData(locale.default, 'zh');
};

/**
 * 应用级 providers。
 *
 * @remarks
 * 两个 `provideAppInitializer` 都**不允许 reject** —— initializer 一旦失败，
 * Angular 会中止 bootstrap，窗口全白且页面内没有任何诊断出口（TAURI-01）。
 */
export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (platformLocation: PlatformLocation) => platformLocation.getBaseHrefFromDOM(),
      deps: [PlatformLocation]
    },
    {
      provide: LOCALE_ID,
      useFactory: () => resolveLocaleId()
    },
    // TAURI-05：locale 数据的注册必须自己占一个 initializer。
    // 原实现在 `LOCALE_ID` 工厂里写 `import(...).then(registerLocaleData)` 却不等待它，
    // 工厂同步返回 `'zh'` —— 从那一刻起 Angular 就认为 zh 可用，
    // 而 `registerLocaleData` 可能还没跑完。首屏的日期/数字管道会用未注册的 locale，
    // 表现为偶发的格式回退或 `NG0701`，且**跟机器快慢有关**，本地几乎复现不出来。
    provideAppInitializer(() => registerLocaleIfNeeded(resolveLocaleId())),
    provideClientHydration(),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      }),
      // 空回调会覆盖 Angular 的默认实现 —— 看着像"这里有定制"，实际是把默认行为换成什么都不做。
      withViewTransitions({ skipInitialTransition: true })
    ),
    // US-210：Tauri 窗口里数据落在宿主持有的 SQLite 文件，浏览器预览里落在 wa-sqlite。
    // 判定放在 provider 工厂里（惰性），因为 `__TAURI_INTERNALS__` 由 Tauri 的初始化脚本注入，
    // 模块求值期读它等于赌两段脚本的先后顺序。
    provideRxDB(() => selectLocalBackend(globalThis).create()),
    provideAppInitializer(() =>
      connectRxDB(inject(RxDB), inject(RxDBConnectionState), selectLocalBackend(globalThis).adapter)
    ),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter()
  ]
};
