import type { BootstrapScriptOptions } from '@aiao/rxdb-admin';
import type { Plugin } from 'vite';
import { appConfig, type AppConfig } from './src/app/app-config.ts';
const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** 在构建前写入配置与偏好恢复脚本。 */
export function renderAppHtml(
  html: string,
  createBootstrapScript: (options: BootstrapScriptOptions) => string,
  config: AppConfig = appConfig
): string {
  return html
    .replaceAll('%APP_TITLE%', () => escapeHtml(config.title))
    .replaceAll('%APP_DESCRIPTION%', () => escapeHtml(config.description))
    .replaceAll('%APP_BOOTSTRAP%', () =>
      createBootstrapScript({ storageKey: `${config.storagePrefix}.preferences` }).replace(/<\/script/gi, '<\\/script')
    );
}
/** 测试与开发工具共用相同的 HTML 转换。 */
export function appHtmlPlugin(
  createBootstrapScript: (options: BootstrapScriptOptions) => string,
  config: AppConfig = appConfig
): Plugin {
  return {
    name: 'admin-app-html',
    transformIndexHtml: { order: 'pre', handler: html => renderAppHtml(html, createBootstrapScript, config) }
  };
}
