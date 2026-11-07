import { provideRxDB } from '@aiao/rxdb-angular';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { setupRxDB } from './rxdb-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideRxDB(setupRxDB),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
