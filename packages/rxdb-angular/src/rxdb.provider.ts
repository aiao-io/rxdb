import { RxDB } from '@aiao/rxdb';
import { DestroyRef, inject, makeEnvironmentProviders } from '@angular/core';

/**
 * 配置 Angular 注入器使用的 RxDB 实例。
 *
 * @param useFactory 返回 RxDB 实例的工厂函数
 * @returns Angular 环境 providers
 */
export const provideRxDB = (useFactory: () => RxDB) =>
  makeEnvironmentProviders([
    {
      provide: RxDB,
      useFactory: () => {
        const rxdb = useFactory();
        inject(DestroyRef).onDestroy(() => {
          void rxdb.disconnectAll().catch(error => console.error('RxDB shutdown failed', error));
        });
        return rxdb;
      }
    }
  ]);
