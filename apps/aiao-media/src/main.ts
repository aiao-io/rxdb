import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { LocalImageMvp } from './app/local-image-mvp';

bootstrapApplication(LocalImageMvp, appConfig).catch(err => console.error(err));
