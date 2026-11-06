import { createBootstrapScript, createMemoryStorage } from '@aiao/rxdb-admin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  SEARCH_PAGE_SIZE_KEY,
  WORKBENCH_STORAGE_PREFIX,
  bindWorkbenchNavigator,
  createWorkbenchShell,
  readLegacyPreferences,
  workbenchShell
} from './workbench-shell';

describe('workbench-shell', () => {
  it('导入非法语言标签时清洗偏好后同步运行时，不产生拒绝', () => {
    const shell = createWorkbenchShell(undefined, { host: {} });
    try {
      shell.preferences.setPath('app.locale', 'en');
      expect(shell.preferences.importJson('{"app":{"locale":"en_US"}}')).toEqual({ ok: true });
      expect(shell.preferences.value.app.locale).toBe('');
      expect(shell.i18n.locale).toBe('zh-Hans');
      expect(shell.i18n.t('start.title')).toBe('开始使用工作台');
    } finally {
      shell.destroy();
    }
  });

  it('普通偏好更新规范化合法语言，并清洗非法语言', () => {
    const shell = createWorkbenchShell(undefined, { host: {} });
    try {
      shell.preferences.update({ app: { locale: 'EN-us' } });
      expect(shell.preferences.value.app.locale).toBe('en-US');
      expect(shell.i18n.locale).toBe('en-US');
      expect(shell.i18n.t('start.title')).toBe('Get started with your workbench');
      shell.preferences.setPath('app.locale', 'en-US-US');
      expect(shell.preferences.value.app.locale).toBe('');
      expect(shell.i18n.locale).toBe('zh-Hans');
    } finally {
      shell.destroy();
    }
  });

  it.each([
    ['EN-us', 'en-US', 'en-US'],
    ['en_US', '', 'zh-Hans'],
    ['en-US-US', '', 'zh-Hans']
  ])('已持久化语言 %s 在恢复运行时前统一清洗', (locale, preference, runtimeLocale) => {
    const local = createMemoryStorage({
      [`${WORKBENCH_STORAGE_PREFIX}.preferences`]: JSON.stringify({ version: 1, values: { app: { locale } } })
    });
    const shell = createWorkbenchShell(undefined, { storage: { local }, host: {} });
    try {
      expect(shell.preferences.value.app.locale).toBe(preference);
      expect(shell.i18n.locale).toBe(runtimeLocale);
    } finally {
      shell.destroy();
    }
  });

  it('清除语言选择或重置偏好后恢复应用默认语言', () => {
    const shell = createWorkbenchShell(undefined, { host: {} });
    try {
      shell.preferences.setPath('app.locale', 'en');
      expect(shell.i18n.locale).toBe('en');
      shell.preferences.setPath('app.locale', '');
      expect(shell.i18n.locale).toBe('zh-Hans');
      shell.preferences.setPath('app.locale', 'en');
      shell.preferences.reset();
      expect(shell.i18n.locale).toBe('zh-Hans');
    } finally {
      shell.destroy();
    }
  });

  it('应用、模型和外壳共用语言，品牌与扩展偏好即时翻译', async () => {
    const shell = createWorkbenchShell(undefined, { host: {} });
    try {
      expect(shell.i18n.t('start.title')).toBe('开始使用工作台');
      await shell.i18n.setLocale('en');
      expect(shell.i18n.t('start.title')).toBe('Get started with your workbench');
      expect(shell.brandTitle).toBe('Workbench');
      expect(shell.i18n.t('common.save', undefined, 'rxdb-model')).toBe('Save');
      expect(shell.t('widget.language')).toBe('Switch language');
      const section = shell.drawer.value.find(tab => tab.id === 'extension')?.sections[0];
      expect(section?.title).toBe('Full-text search');
      expect(section?.rows[0]).toMatchObject({
        label: 'Results per page',
        hint: 'Number of results loaded at a time. Changes apply immediately.'
      });
    } finally {
      shell.destroy();
    }
  });

  it('语言选择由外壳偏好恢复，不需要连接业务数据库', () => {
    const local = createMemoryStorage({
      [`${WORKBENCH_STORAGE_PREFIX}.preferences`]: JSON.stringify({ version: 1, values: { app: { locale: 'en' } } })
    });
    const shell = createWorkbenchShell(undefined, { storage: { local }, host: {} });
    try {
      expect(shell.i18n.locale).toBe('en');
      expect(shell.i18n.t('start.title')).toBe('Get started with your workbench');
    } finally {
      shell.destroy();
    }
  });

  it('Vite 转换后的首屏脚本与外壳使用同一个存储键', async () => {
    const appRoot = resolve(import.meta.dirname, '../../..');
    const server = await createServer({
      configFile: resolve(appRoot, 'vite.config.mts'),
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] }
    });
    try {
      const template = readFileSync(resolve(appRoot, 'index.html'), 'utf8');
      const html = await server.transformIndexHtml('/index.html', template);
      expect(html).toContain(createBootstrapScript({ storageKey: `${WORKBENCH_STORAGE_PREFIX}.preferences` }));
      expect(html).not.toContain('%APP_');
    } finally {
      await server.close();
    }
  });

  it('旧键迁移：theme 与侧栏固定状态', () => {
    expect(readLegacyPreferences(createMemoryStorage())).toBeNull();
    expect(readLegacyPreferences(createMemoryStorage({ theme: 'dark', 'workbench-sidebar-pinned': '0' }))).toEqual({
      theme: { name: 'dark' },
      sidebar: { collapsed: true }
    });
    expect(readLegacyPreferences(createMemoryStorage({ theme: 'auto', 'workbench-sidebar-pinned': '1' }))).toBeNull();
    expect(readLegacyPreferences(createMemoryStorage({ theme: 'light' }))).toEqual({ theme: { name: 'light' } });
  });

  it('外壳带搜索条数扩展，默认 20；手风琴默认关闭以保持两组始终展开', () => {
    expect(workbenchShell.preferences.value.extension[SEARCH_PAGE_SIZE_KEY]).toBe(20);
    expect(workbenchShell.preferences.value.navigation.accordion).toBe(false);
  });

  it('跳转延迟绑定到路由器', () => {
    const urls: string[] = [];
    bindWorkbenchNavigator(url => void urls.push(url));
    workbenchShell.navigate('/search');
    expect(urls).toEqual(['/search']);
  });
});
