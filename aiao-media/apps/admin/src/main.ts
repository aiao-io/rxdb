import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { adminShell } from './app/admin-shell';

bootstrapApplication(App, appConfig)
  .then(application => application.onDestroy(() => adminShell.destroy()))
  .catch(err => console.error(err));
