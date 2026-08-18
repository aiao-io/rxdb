import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, isPlatformBrowser, PlatformLocation, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  PLATFORM_ID,
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
import { startLocalDatabase } from './rxdb-initializer';
import { DesktopLaunchService } from './services/desktop-launch.service';
import { reportSelfCheck } from './services/selfcheck-reporter';
import { localDatabase, resolveLocalBackend } from './setup_rxdb';

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
 *
 * 它们之间也**没有先后顺序**：Angular 并发执行全部 initializer。有依赖关系的步骤必须
 * 写在同一个里，见下面数据库那一条。
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
    //
    // US-207 E11：候选的 `create` 走动态 `import()`，所以这个工厂是**异步**的。
    // 浏览器运行时那道闸必须留在**这里**——`inject()` 一旦跨过 `await` 就离开注入上下文，
    // 在 NG0203 面前，把它写进 `setup_rxdb_*.ts` 只会换来一句与存储毫无关系的报错。
    provideRxDB(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) throw new Error('dev-rxdb-tauri requires a browser runtime');
      return localDatabase();
    }),
    // 「建库 → 连接 → 记一次启动 → 上报结论」必须串在**同一个** initializer 里：
    // 多个 initializer 是并发跑的，拆开就等于赌「连接先于写入完成」，
    // 而那是一条只在慢机器上偶发的竞态。理由详见 `startLocalDatabase` 的 TSDoc。
    //
    // 所有 `inject()` 都在这一行同步取到：initializer 工厂返回 Promise 之后就离开了注入
    // 上下文，第一个 `await` 之后再 inject 会抛 NG0203。`RxDB` 本身**不再注入** ——
    // 上面那个 provider 的 source 现在是异步的，两个 initializer 并发跑时
    // `inject(RxDB)` 会撞上「尚未就绪」。这里改为 await `localDatabase()` 记住的
    // 同一个 Promise，两条链因此汇到一处，不必猜谁先谁后。
    provideAppInitializer(() => {
      // ⚠️ 临时诊断代码（不提交）：25s 后把面包屑当作失败原因报上去，抢在 Rust 看门狗之前。
      const started = startLocalDatabase({
        openDatabase: localDatabase,
        state: inject(RxDBConnectionState),
        launches: inject(DesktopLaunchService),
        adapterName: resolveLocalBackend(globalThis).adapter,
        report: outcome => reportSelfCheck(outcome, globalThis)
      });
      const guard = new Promise<void>(resolve => {
        setTimeout(() => {
          const probe = ((globalThis as Record<string, unknown>)['__probe'] ?? []) as string[];
          void reportSelfCheck({ status: 'failed', message: `PROBE ${probe.join(' ')}` }, globalThis).then(resolve);
        }, 25_000);
      });
      return Promise.race([started, guard]);
    }),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter()
  ]
};
