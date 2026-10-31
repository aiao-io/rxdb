import {
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig
} from '@angular/core';

/**
 * 应用配置：不提供全局 RxDB——看板实例由启动选择（US-537）决定何时、
 * 以哪个库名创建，选择前不连接数据库、不建表、不装载种子。
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()]
};
