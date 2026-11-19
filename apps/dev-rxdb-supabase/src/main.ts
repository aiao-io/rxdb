import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { prepareSupabaseSession } from './app/setup_rxdb_wa-sqlite';

/**
 * 启动失败时给用户一句话，而不是一个空白页。
 *
 * 本地库按会话身份命名，没有会话就不知道该打开哪个库，所以应用起不来：
 * 第一次打开需要联网创建匿名会话，Supabase 项目也要开启匿名登录。
 */
function showStartupError(error: unknown): void {
  console.error(error);
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = `无法建立 Supabase 会话：${error instanceof Error ? error.message : String(error)}。第一次打开需要联网，且 Supabase 项目要开启匿名登录。`;
  document.body.replaceChildren(notice);
}

prepareSupabaseSession()
  .then(() => bootstrapApplication(App, appConfig))
  .catch(showStartupError);
