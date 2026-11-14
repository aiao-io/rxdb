import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { adminShell } from './admin-shell';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideI18n(adminShell.i18n),
    provideAdminShell(adminShell)
  ]
};
