import { provideAdminShell } from '@aiao/rxdb-admin-angular';
import { provideRxDB } from '@aiao/rxdb-angular';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { App } from './app/app';
import { routes } from './app/app.routes';
import { bindWorkbenchDescription } from './app/i18n/workbench-i18n';
import setupRxdb from './app/rxdb/setup_rxdb';
import { workbenchShell } from './app/shell/workbench-shell';

const stopDescription = bindWorkbenchDescription(workbenchShell.i18n, document);
void bootstrapApplication(App, {
  providers: [
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideRxDB(setupRxdb()),
    provideI18n(workbenchShell.i18n),
    provideAdminShell(workbenchShell)
  ]
})
  .then(app => {
    app.onDestroy(() => {
      stopDescription();
      workbenchShell.destroy();
    });
  })
  .catch(error => console.error(error));
