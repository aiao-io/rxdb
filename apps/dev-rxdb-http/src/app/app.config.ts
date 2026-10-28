import { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { I18N, provideI18n } from '@aiao/rxdb-i18n-angular';
import { DOCUMENT } from '@angular/common';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { createHttpI18n, resolveI18nEnabled } from './remote-i18n';
import setup_rxdb from './setup_rxdb_http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRxDB(setup_rxdb),
    provideI18n(() => createHttpI18n(inject(RxDB))),
    provideAppInitializer(async () => {
      const rxdb = inject(RxDB);
      const document = inject(DOCUMENT);
      const i18n = resolveI18nEnabled(location.search) ? inject(I18N) : undefined;
      // 两个适配器都在这里连完，且必须**早于**第一次查询。
      //
      // 「让 QueryCache 首次查询时按需连上」行不通：那条路走的是 `rxdb.remoteAdapter$` →
      // `getAdapter('http')`，它只实例化、不 `connect()`。于是首屏会出现两条线并行——
      // 查询已经拿着构造期那一代 transport 发出了 `fetchMetadata`，而这边的 `connect()`
      // 按「重连隐含断开」的口径把那一代的 `AbortController` abort 掉，
      // 请求当场变成 `HttpDisconnectedError`，首屏空表。
      //
      // `connect()` 本身不发任何请求（HTTP 适配器不做可达性探测），
      // 所以提前连它不会往流量面板里塞多余的一行。
      const [local] = await Promise.all([rxdb.connect('wa-sqlite'), rxdb.connect('http')]);
      document.documentElement.dataset['rxdbLocalAdapter'] = local.name;
      await i18n?.init();
      if (i18n) document.documentElement.lang = i18n.locale;
    })
  ]
};
