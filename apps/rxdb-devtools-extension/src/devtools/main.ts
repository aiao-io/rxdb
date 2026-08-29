import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import {
  AppComponent,
  DEVTOOLS_FILE_CHANNEL,
  DEVTOOLS_HOST_ACCESS,
  DEVTOOLS_PANEL_VERSION,
  DEVTOOLS_TRANSPORT,
  routes
} from '@modules/rxdb-devtools-panel';
// P2-13：与 `manifest.config.ts` 取同一个来源，避免关于页与 manifest 的版本分叉
import pkg from '../../package.json';
import { InspectedPageAccessService } from './services/inspected-page-access.service';
import { OpfsChannelService } from './services/opfs-channel.service';
import { PortService } from './services/port.service';

/**
 * Chrome 扩展是面板的**宿主**：这四条 provider 是它与平台中立面板之间的全部接触面。
 * 换成 Electron / Tauri 时，换的也只是这四条。
 */
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    { provide: DEVTOOLS_TRANSPORT, useExisting: PortService },
    { provide: DEVTOOLS_HOST_ACCESS, useExisting: InspectedPageAccessService },
    { provide: DEVTOOLS_FILE_CHANNEL, useExisting: OpfsChannelService },
    { provide: DEVTOOLS_PANEL_VERSION, useValue: pkg.version }
  ]
}).catch(err => console.error('[RxDB DevTools] Bootstrap error:', err));
