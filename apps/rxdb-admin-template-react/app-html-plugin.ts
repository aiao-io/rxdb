import { createBootstrapScript } from '@aiao/rxdb-admin';
import type { Plugin } from 'vite';
import { appConfig, type AppConfig } from './src/app/app-config.ts';

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** 将应用配置写入 HTML，并在入口脚本执行前恢复该应用的主题。 */
export function appHtmlPlugin(config: AppConfig = appConfig): Plugin {
  return {
    name: 'admin-app-html',
    transformIndexHtml: {
      order: 'pre',
      handler: html =>
        html
          .replaceAll('%APP_TITLE%', () => escapeHtml(config.title))
          .replaceAll('%APP_DESCRIPTION%', () => escapeHtml(config.description))
          .replaceAll('%APP_BOOTSTRAP%', () =>
            createBootstrapScript({ storageKey: `${config.storagePrefix}.preferences` }).replace(
              /<\/script/gi,
              '<\\/script'
            )
          )
    }
  };
}
