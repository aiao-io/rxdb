import { provideEnvironmentInitializer, inject } from '@angular/core';
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
import { TauriHostAccessService } from './tauri-host-access.service';
import { TauriTransportService } from './tauri-transport.service';

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
    // TODO(US-905)：面板版本应从 Tauri 应用的版本来源取，而不是硬编码。
    { provide: DEVTOOLS_PANEL_VERSION, useValue: '0.0.25' }
  ]
}).catch(err => console.error('[RxDB DevTools] Bootstrap error:', err));
