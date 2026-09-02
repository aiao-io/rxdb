import { inject, provideEnvironmentInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import {
  AppComponent,
  createDevToolsV2FileChannel,
  DEVTOOLS_FILE_CHANNEL,
  DEVTOOLS_HOST_ACCESS,
  DEVTOOLS_PANEL_VERSION,
  DEVTOOLS_TRANSPORT,
  DevToolsEndpointService,
  routes
} from '@modules/rxdb-devtools-panel';
import { configureLogger } from '@modules/rxdb-devtools-panel/wire';
// 面板版本取自 Tauri 应用**自己的**版本源。不走 `@tauri-apps/api` 的 `getVersion()`：
// 那要多一条 `core:app:default` 能力，而发布隔离规范把本窗口的能力集钉死在
// `['core:event:default']`；何况版本是构建期常量，没有理由换成一次运行期 IPC。
// 与 `apps/rxdb-devtools-extension` 从 `package.json` 取版本同构——本 app 没有 package.json，
// 它的版本单一来源就是这份 tauri.conf.json。
// 具名导入而不是默认导入：默认导入会把**整份**配置内联进面板 bundle（构建命令、devUrl、
// frontendDist、identifier、完整 CSP 串），只为读一个版本号。具名导入能被摇成裸字符串，
// 也顺带保证日后往这份文件加 updater pubkey / 私有端点时不会无声进到 webview 里。
import { version } from '../../src-tauri/tauri.conf.json';
import { TauriHostAccessService } from './tauri-host-access.service';
import { TauriTransportService } from './tauri-transport.service';

configureLogger(import.meta.env.DEV);

/**
 * Tauri 是面板的**宿主**：这四条 provider 是它与平台中立面板之间的全部接触面。
 * 与 Chrome 扩展的 `devtools/main.ts` 同构——换的只有 transport 与 host access 两条。
 */
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    // v2 端点必须在 bootstrap 时就起来（Chrome 扩展同款理由：ACK 所有权归面板）。
    provideEnvironmentInitializer(() => void inject(DevToolsEndpointService)),
    { provide: DEVTOOLS_TRANSPORT, useExisting: TauriTransportService },
    { provide: DEVTOOLS_HOST_ACCESS, useExisting: TauriHostAccessService },
    {
      provide: DEVTOOLS_FILE_CHANNEL,
      useFactory: () => {
        const endpoints = inject(DevToolsEndpointService);
        return createDevToolsV2FileChannel(() => endpoints.resolve());
      }
    },
    { provide: DEVTOOLS_PANEL_VERSION, useValue: version }
  ]
}).catch(err => console.error('[RxDB DevTools] Bootstrap error:', err));
