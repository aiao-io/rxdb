import { createBootstrapScript, createMemoryStorage } from '@aiao/rxdb-admin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { appHtmlPlugin } from '../../app-html-plugin';
import { appConfig, type AppConfig } from './app-config';
import { createWorkbenchDatabase } from './rxdb/setup_rxdb';
import { createWorkbenchShell } from './shell/workbench-shell';

const customConfig: AppConfig = {
  title: '设备 <管理> & "运维"',
  description: '独立应用的 "说明" & <配置>',
  brandTitle: '设备管理',
  dbName: 'equipment-admin',
  storagePrefix: 'equipment.admin',
  visibleNamespaces: ['equipment']
};

describe('应用配置接线', () => {
  it('创建数据库时使用应用配置，默认实例仍沿用已有数据名称', async () => {
    const webdriver = vi.spyOn(window.navigator, 'webdriver', 'get').mockReturnValue(false);
    const defaults = createWorkbenchDatabase(appConfig);
    const custom = createWorkbenchDatabase(customConfig);
    try {
      expect(defaults.config.dbName).toContain('admin-workbench');
      expect(custom.config.dbName).toContain(customConfig.dbName);
      expect(custom.config.dbName).not.toBe(defaults.config.dbName);
    } finally {
      await Promise.all([defaults.destroy(), custom.destroy()]);
      webdriver.mockRestore();
    }
  });

  it('品牌与偏好存储使用应用配置，同源应用互不覆盖', () => {
    const local = createMemoryStorage();
    const storage = { local, session: createMemoryStorage() };
    const defaults = createWorkbenchShell(appConfig, { storage, host: {} });
    const custom = createWorkbenchShell(customConfig, { storage, host: {} });
    expect(custom.brandTitle).toBe('设备管理');
    custom.theme.set('dark');
    expect(defaults.preferences.value.theme.name).toBe('system');
    custom.destroy();
    defaults.destroy();
    expect(local.getItem('equipment.admin.preferences')).toContain('"dark"');
    expect(local.getItem('aiao.workbench.vue.preferences')).toBeNull();
  });

  it('Vite 转换真实 HTML：标题、说明与首屏偏好键来自同一配置且正确转义', async () => {
    const server = await createServer({
      configFile: false,
      root: resolve(import.meta.dirname, '../..'),
      plugins: [appHtmlPlugin(createBootstrapScript, customConfig)],
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] }
    });
    try {
      const template = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
      const html = await server.transformIndexHtml('/index.html', template);
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      expect(parsed.title).toBe(customConfig.title);
      expect(parsed.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(customConfig.description);
      expect(html).not.toContain('%APP_');
      const bootstrap = parsed.querySelector('script[data-app-bootstrap]')?.textContent;
      expect(bootstrap).toContain('equipment.admin.preferences');
      expect(bootstrap).not.toContain('aiao.workbench.vue.preferences');
      const root = document.implementation.createHTMLDocument().documentElement;
      const local = createMemoryStorage({
        'equipment.admin.preferences': JSON.stringify({ version: 1, values: { theme: { name: 'dark' } } }),
        'aiao.workbench.vue.preferences': JSON.stringify({ version: 1, values: { theme: { name: 'light' } } })
      });
      runInNewContext(bootstrap ?? '', {
        document: { documentElement: root },
        localStorage: local,
        matchMedia: () => ({ matches: false })
      });
      expect(root.getAttribute('data-theme')).toBe('dark');
    } finally {
      await server.close();
    }
  });
});
