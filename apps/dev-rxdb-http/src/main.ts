import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { installTrafficRecorder } from './app/traffic-recorder';

// 在 bootstrap **之前**装：适配器是在 `provideAppInitializer` 里连上的，
// 那时候第一批协议请求就已经发出去了。晚一步装，流量面板的第一页永远是空的。
installTrafficRecorder(globalThis);

bootstrapApplication(App, appConfig).catch(err => console.error(err));
