import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { destroyDesktopI18n } from './app/i18n/desktop-i18n';

bootstrapApplication(App, appConfig)
  .then(appRef => {
    appRef.onDestroy(() => destroyDesktopI18n());
  })
  .catch(err => console.error(err));
