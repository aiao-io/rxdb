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
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { appRoutes } from './app.routes';
import { watchDevToolsHandshake, type DevToolsProbeResult } from './devtools-probe';
import { RxDBConnectionState } from './rxdb-connection-state';
import { startLocalDatabase } from './rxdb-initializer';
import { DesktopLaunchService } from './services/desktop-launch.service';
import {
  readDevToolsProbeEnabled,
  readProbeBaseUrl,
  recycleDevToolsWindow,
  reportSelfCheck
} from './services/selfcheck-reporter';
import { isTauriRuntime } from './services/tauri-environment';
import { localDatabase, resolveLocalBackend } from './setup_rxdb';
import { probeStorage } from './storage-probe';
import { probeWebview, readWebviewGlobals, type WebviewFetchSurface, type WebviewProbeResult } from './webview-probe';

/** 按浏览器/系统语言挑 locale id。 */
const resolveLocaleId = (): string => (Intl.DateTimeFormat().resolvedOptions().locale.includes('zh') ? 'zh' : 'en-US');

/**
 * 组合 webview 能力探针：先问 Rust 侧要地址，再按地址决定跑不跑（US-505 AC#6）。
 *
 * @param storage - 已连接的文件存储
 * @returns 探针结果；正常启动（Rust 侧给的是 `None`）时为 `null`
 *
 * @remarks
 * DOM 事实在这里一次读齐再交给 `probeWebview`，那边因此不必碰 DOM，单测里也就不必去
 * 断言 happy-dom 自己的答案。
 */
const probeWebviewCapabilities = async (storage: WebviewFetchSurface): Promise<WebviewProbeResult | null> =>
  probeWebview({ globals: readWebviewGlobals(), storage, baseUrl: await readProbeBaseUrl(globalThis) });

/**
 * DevTools 帧观察者：**模块求值时就开始收帧**（US-905 阶段 1 AC#2）。
 *
 * @remarks
 * 订阅时机是承重的。调试窗口由 Rust 在 `setup()` 里与主窗口一起建，它的面板什么时候完成
 * 协商与主窗口建库多快无关——**实测**把订阅放在启动链末尾时，握手早已结束，而 Tauri 的事件
 * 不重放，报告里于是是一个空的 `panelFrameTypes`，与「调试窗口根本没建起来」同形。
 * 所以订阅在这里（最早处），等待放在启动链末尾的 `probeDevToolsWindow`。
 *
 * 事件订阅面在这里注入，`devtools-probe.ts` 因此不直接依赖 `@tauri-apps/api/event`，
 * 单测不必起一个真实 Tauri 运行时——与下面 webview 探针「DOM 事实一次读齐」同一手法。
 *
 * 非 Tauri 运行时（`nx serve` 的浏览器预览）不订阅：那里没有 `listen` 可调，也没有调试窗口。
 */
const devToolsWatcher =
  isTauriRuntime(globalThis) ?
    watchDevToolsHandshake({
      // 与两条 transport 同一个理由：全局 `listen` 的 target 是 `Any`，会无视定向过滤收到
      // **所有**帧（含主窗口自己发出的）。探针要观察的是「投递到 main 的帧」，
      // 所以必须绑到本窗口——否则它会把主窗口自己的出站帧也算成「调试窗口发来的」。
      listen: (event, handler) =>
        getCurrentWebviewWindow().listen<string>(event, message => handler({ payload: message.payload }))
    })
  : null;

/**
 * 等 DevTools 握手结果：先问 Rust 侧开没开，再决定要不要等（US-905 阶段 1 AC#2）。
 *
 * @returns 探针结果；没开这条探针（正常启动与 release 产物）时为 `null`
 *
 * @remarks
 * 开关在 Rust 侧，理由见 `selfcheck.rs` 的 `DEVTOOLS_PROBE_ENV`：release 产物里没有调试窗口，
 * 默认开启只会让每次 smoke 白等一个预算。
 */
const probeDevToolsWindow = async (): Promise<DevToolsProbeResult | null> => {
  if (devToolsWatcher === null) return null;
  if (!(await readDevToolsProbeEnabled(globalThis))) return null;

  // 第一轮：调试窗口起来之后的首次协商。
  const first = await devToolsWatcher.waitForHandshake();
  // AC#4：同 label 关掉再建一次，等第二轮。第一轮都没握上就不必回收了——
  // 那时回收只会把「本来就没握上」变成一次与它无关的命令失败。
  if (first > 0) {
    await recycleDevToolsWindow(globalThis);
    await devToolsWatcher.waitForHandshake();
  }
  return devToolsWatcher.settle();
};

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
    provideAppInitializer(() =>
      startLocalDatabase({
        openDatabase: localDatabase,
        state: inject(RxDBConnectionState),
        launches: inject(DesktopLaunchService),
        probe: probeStorage,
        probeWebview: probeWebviewCapabilities,
        probeDevTools: probeDevToolsWindow,
        adapterName: resolveLocalBackend(globalThis).adapter,
        report: outcome => reportSelfCheck(outcome, globalThis)
      })
    ),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideLoadingBarInterceptor(),
    provideLoadingBarRouter()
  ]
};
