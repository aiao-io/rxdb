import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { destroyDesktopI18n, warmDesktopZhCatalog } from './app/i18n/desktop-i18n';

/* 先取回 zh 目录 chunk（独立异步块，不进 initial 预算），bootstrap 后运行时创建时立即注册，
   zh 设备首屏即中文（ADESK-US-132 AC6/AC10）。 */
await warmDesktopZhCatalog();

bootstrapApplication(App, appConfig)
  .then(appRef => {
    appRef.onDestroy(() => destroyDesktopI18n());
  })
  .catch(err => console.error(err));
