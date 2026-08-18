import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/**
 * TAURI-01：桌面端的 bootstrap 失败不能只写 console。
 *
 * Tauri 窗口默认不带开发者工具，`console.error` 等于把错误丢进虚空 ——
 * 用户拿到的是一个**没有任何信息的空白窗口**，连"是不是卡住了"都判断不了。
 * 数据库连接失败已经改成应用内状态（见 `rxdb-initializer.ts`），
 * 这里兜住的是其余任何让 bootstrap 起不来的原因。
 */
bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  const root = document.querySelector('app-root') ?? document.body;
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'padding:1.5rem;font:14px/1.6 system-ui;color:#b91c1c;white-space:pre-wrap';
  panel.textContent = `应用启动失败\n\n${message}`;
  root.replaceChildren(panel);
});
