import { provideRxDB } from '@aiao/rxdb-angular';
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { getRxdb } from './todo';

export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRxDB(getRxdb)]
};
