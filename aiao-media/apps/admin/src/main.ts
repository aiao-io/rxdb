import { bootstrapApplication } from '@angular/platform-browser';
import { adminShell } from './app/admin-shell';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig)
  .then(application => application.onDestroy(() => adminShell.destroy()))
  .catch(err => console.error(err));
