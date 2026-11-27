import { provideRxDB } from '@aiao/rxdb-angular';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { PlatformLocation } from '@angular/common';
import { ApplicationConfig, inject, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';

import { provideServiceWorker } from '@angular/service-worker';

import { getDesktopDatabase } from './data/desktop-database';
import { tolerantStorage } from './data/desktop-erase';
import { getDesktopI18n } from './i18n/desktop-i18n';

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
      getDesktopDatabase(inject(PlatformLocation).getBaseHrefFromDOM(), {
        selectionStorage: tolerantStorage(() => localStorage)
      })
    ),
    /* i18n 与库共用同一实例；init() 由桌面页排在 DesktopData.ready 之后执行（见 desktop-page.ts）。 */
    provideI18n(() =>
      getDesktopI18n(
        getDesktopDatabase(inject(PlatformLocation).getBaseHrefFromDOM(), {
          selectionStorage: tolerantStorage(() => localStorage)
        })
      )
    )
  ]
};
