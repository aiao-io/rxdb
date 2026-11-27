import { RxDB } from '@aiao/rxdb';
import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AdminConfigDatabaseHost } from './admin-rxdb';
import { adminShell } from './admin-shell';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    // 配置库按登录账号与工作区打开；列表与 CDK 弹窗都从根注入器取同一个实例。
    { provide: RxDB, useFactory: () => inject(AdminConfigDatabaseHost).require() },
    provideI18n(adminShell.i18n),
    provideAdminShell(adminShell)
  ]
};
