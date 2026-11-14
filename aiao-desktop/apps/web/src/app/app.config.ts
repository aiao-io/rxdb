import { provideRxDB } from '@aiao/rxdb-angular';
import { PlatformLocation } from '@angular/common';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';

import { createDesktopDatabase } from './data/desktop-database';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    /* 库实例在启动时建好（尚未连接）；连接与初始数据由桌面页的 DesktopData 负责，开机画面期间完成。 */
    provideRxDB(() => createDesktopDatabase(inject(PlatformLocation).getBaseHrefFromDOM()))
  ]
};
