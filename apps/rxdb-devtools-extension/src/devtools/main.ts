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
// P2-13：与 `manifest.config.ts` 取同一个来源，避免关于页与 manifest 的版本分叉
import pkg from '../../package.json';
import { InspectedPageAccessService } from './services/inspected-page-access.service';
import { PortService } from './services/port.service';

configureLogger(import.meta.env.DEV);

/**
 * Chrome 扩展是面板的**宿主**：这四条 provider 是它与平台中立面板之间的全部接触面。
 * 换成 Electron / Tauri 时，换的也只是这四条。
 */
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    // v2 端点必须在 bootstrap 时就起来，不能等 OPFS 页第一次注入文件信道时才懒加载：
    // `HANDSHAKE_ACK` 的所有权归面板（background 已不再代发），而页面的 connector 在收到
    // ACK 之前会一直缓冲事件。晚起一秒，v1 的事件流就晚一秒——症状是「打开面板要先点一下
    // 文件页才有数据」，且完全不像协议问题。
    provideEnvironmentInitializer(() => void inject(DevToolsEndpointService)),
    { provide: DEVTOOLS_TRANSPORT, useExisting: PortService },
    { provide: DEVTOOLS_HOST_ACCESS, useExisting: InspectedPageAccessService },
    {
      // 取端点的**函数**，不是端点实例：端点随重连整体更换（见 DevToolsEndpointService）。
      provide: DEVTOOLS_FILE_CHANNEL,
      useFactory: () => {
        const endpoints = inject(DevToolsEndpointService);
        return createDevToolsV2FileChannel(() => endpoints.resolve());
      }
    },
    { provide: DEVTOOLS_PANEL_VERSION, useValue: pkg.version }
  ]
}).catch(err => console.error('[RxDB DevTools] Bootstrap error:', err));
