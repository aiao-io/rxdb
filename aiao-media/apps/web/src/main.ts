import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { prepareInstallation } from './app/installation';
import { LocalImageMvp } from './app/local-image-mvp';

prepareInstallation()
  .then(async ready => {
    if (ready) await bootstrapApplication(LocalImageMvp, appConfig);
  })
  .catch(err => console.error(err));
