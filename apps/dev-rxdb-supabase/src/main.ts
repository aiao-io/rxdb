import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { prepareSupabaseSession } from './app/setup_rxdb_wa-sqlite';
import { showStartupError, startApp } from './app/startup';

const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_KEY?.trim()
);

// 配置了 Supabase 才是远端模式：启动前先读会话；本地模式直接启动，不读会话
void startApp({
  prepareSession: hasSupabaseConfig ? prepareSupabaseSession : undefined,
  bootstrap: () => bootstrapApplication(App, appConfig),
  report: showStartupError
});
