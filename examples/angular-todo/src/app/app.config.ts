import { provideRxDB } from '@aiao/rxdb-angular';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import setup_rxdb from './setup_rxdb';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: (platformLocation: PlatformLocation) => platformLocation.getBaseHrefFromDOM(),
      deps: [PlatformLocation],
    },
    provideRxDB(setup_rxdb),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
  ],
};
