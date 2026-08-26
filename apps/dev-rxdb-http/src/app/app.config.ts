import { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { DOCUMENT } from '@angular/common';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import setup_rxdb from './setup_rxdb_http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRxDB(setup_rxdb),
    provideAppInitializer(async () => {
      const rxdb = inject(RxDB);
      const document = inject(DOCUMENT);
      // 只连本地：远端 `http` 适配器由 QueryCache 在第一次查询时按需连上。
      // 这里提前连它没有意义，反而会让「打开页面就先打一次后端」混进流量面板的第一页。
      const adapter = await rxdb.connect('wa-sqlite');
      document.documentElement.dataset['rxdbLocalAdapter'] = adapter.name;
    })
  ]
};
