import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { provideRxDB } from '@aiao/rxdb-angular';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { adminShell } from './admin-shell';
import { appRoutes } from './app.routes';
import { createAdminConfigDatabase } from './admin-rxdb';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideRxDB(() => createAdminConfigDatabase('00000000-0000-4000-8000-000000000000')),
    provideI18n(adminShell.i18n),
    provideAdminShell(adminShell)
  ]
};
