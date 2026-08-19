import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, isPlatformBrowser, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import localeZh from '@angular/common/locales/zh-Hans';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withInMemoryScrolling,
  withViewTransitions
} from '@angular/router';
import { provideLoadingBarInterceptor } from '@ngx-loading-bar/http-client';
import { provideLoadingBarRouter } from '@ngx-loading-bar/router';
import { appRoutes } from './app.routes';
import { resolveLocaleId } from './locale';
import { LocalDatabaseService } from './services/local-database.service';
import { localDatabase } from './setup_rxdb';

registerLocaleData(localeZh, 'zh');

/**
 * 渲染进程的根注入器配置。
 *
 * 与浏览器版 demo 的差异集中在两处：`APP_BASE_HREF` 从 DOM 的 `<base>` 读取
 * （`file:` 下没有可推断的服务端前缀），以及不含任何 SSR/hydration provider。
 */
export const appConfig: ApplicationConfig = {
  providers: [
    {
      // ELEC-10：必须是空串，且**不能**用 `getBaseHrefFromDOM()`。
      //
      // 在 `file:` 下 origin 是 `file://`，`<base href="./">` 会被解析成绝对文件系统路径
      // （`/Users/.../browser/`）。HashLocationStrategy 把 baseHref 拼进 hash，于是导航目标
      // 变成 `file:///…/browser/#/Users/…/browser/home` —— hash 前的路径还从 `index.html`
      // 退化成了目录，Chromium 判定跨文档、replaceState 抛 SecurityError，首次导航中断。
      //
      // 空串下 `prepareExternalUrl('/home')` 得到 `#/home`，相对当前文档解析，同文档、放行。
      // 资源仍由 HTML 的 `<base href="./">` 定位，与本 token 无关。
      provide: APP_BASE_HREF,
      useValue: ''
    },
    {
      provide: LOCALE_ID,
      useFactory: () => resolveLocaleId(Intl.DateTimeFormat().resolvedOptions().locale)
    },
    // ELEC-19：这里原先有 `provideClientHydration()`。本项目没有 server target、
    // 没有 prerender 配置，产物纯 CSR 且由 Electron 以 `file:` 加载 —— 不存在可 hydrate 的
    // 服务端标记，该 provider 只是让人误以为有 SSR。真要做 SSR 时应连 server target 一并加回。
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      // ELEC-10：必须是 hash 路由。产物由 `file:` 加载，默认的 PathLocationStrategy
      // 会调用 `history.replaceState(..., 'file:///.../home')`，Chromium 对 opaque origin
      // 直接抛 SecurityError，首次导航中断 —— `<router-outlet>` 在、但内容区永远空白。
      // 实测于 dist 产物：`app-home-page` 节点数为 0。
      withHashLocation(),
      withComponentInputBinding(),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled'
      }),
      withViewTransitions({
        skipInitialTransition: true
      })
    ),
    // ELEC-11：这里原先跟着一个手写的 app initializer 去强行注入一次 RxDB。
    // 当时 `provideRxDB` 只是个惰性 `useFactory`，而首页只读连接状态信号、并不注入
    // RxDB，工厂于是永不执行，状态卡永久停在「连接中…」：没有 worker、没有 wasm 请求、
    // 也没有任何报错，一个纯粹的假象。现在 `provideRxDB` 自带 initializer（先建 holder
    // 触发工厂，再等 source 就绪），bootstrap 阶段必然实例化，这里不必再补一刀。
    //
    // US-207 E11：候选的 `create` 走动态 `import()`，所以这个工厂是**异步**的。
    // 浏览器运行时那道闸必须留在**这里**——`inject()` 一旦跨过 `await` 就离开注入上下文，
    // 在 NG0203 面前，把它写进 `setup_rxdb_*.ts` 只会换来一句与存储毫无关系的报错。
    provideRxDB(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) throw new Error('dev-rxdb-electron requires a browser runtime');
      return localDatabase();
    }),
    // US-207 E8：连接、启动计数与状态发布都在这个服务里，由 initializer 拉起而不是
    // 等首页注入（惰性单例没人注入就永远不构造，与 ELEC-11 同一个坑）。
    // 它内部 await 的是 `localDatabase()` 记住的同一个 Promise，因此与上面那个
    // initializer 并发跑也不会读到「尚未就绪」。
    provideAppInitializer(() => inject(LocalDatabaseService).start()),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter()
  ]
};
