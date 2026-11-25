import { provideRxDB } from '@aiao/rxdb-angular';
import { PlatformLocation } from '@angular/common';
import { ApplicationConfig, inject, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';

import { provideServiceWorker } from '@angular/service-worker';

import { createDesktopDatabase } from './data/desktop-database';
import { tolerantStorage } from './data/desktop-erase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    /* 库实例在启动时建好（尚未连接）；连接与初始数据由桌面页的 DesktopData 负责，开机画面期间完成。
       活动指针经容错存储读取：localStorage 不可用（隐私模式等）时按默认位置继续，不因此拒绝打开桌面。 */
    provideRxDB(() =>
      createDesktopDatabase(inject(PlatformLocation).getBaseHrefFromDOM(), {
        selectionStorage: tolerantStorage(() => localStorage)
      })
    )
  ]
};
