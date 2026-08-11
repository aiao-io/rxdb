import { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import localeZh from '@angular/common/locales/zh-Hans';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
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
import setup_rxdb from './setup_rxdb_wa-sqlite';

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
    provideRxDB(setup_rxdb),
    // ELEC-11：`provideRxDB` 只是个 `useFactory`，**惰性**的 —— 没有组件注入 `RxDB`
    // 就永远不会实例化。首页只读连接状态信号、并不注入 RxDB，于是实测下来
    // 状态卡永久停在「连接中…」：没有 worker、没有 wasm 请求、没有任何报错，
    // 一个纯粹的假象。这里在 bootstrap 阶段强制实例化，让状态卡反映真实连接。
    provideAppInitializer(() => {
      inject(RxDB);
    }),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter()
  ]
};
