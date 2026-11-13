import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { bootstrapWithOrbit } from './app/orbit-embedding';

/* 被 Aiao Desktop 嵌入时先握手再启动（US-410）；直接访问时立即启动。 */
bootstrapWithOrbit(providers =>
  bootstrapApplication(AppComponent, { ...appConfig, providers: [...appConfig.providers, ...providers] })
).catch(error => console.error(error));
