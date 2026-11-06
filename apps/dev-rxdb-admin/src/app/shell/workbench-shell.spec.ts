import { createBootstrapScript, createMemoryStorage } from '@aiao/rxdb-admin';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEARCH_PAGE_SIZE_KEY,
  WORKBENCH_STORAGE_PREFIX,
  bindWorkbenchNavigator,
  readLegacyPreferences,
  workbenchShell
} from './workbench-shell';

describe('workbench-shell', () => {
  it('index.html 内联的首屏脚本与外壳生成的一致（防止存储键 / 逻辑漂移）', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../../../index.html'), 'utf8');
    expect(html).toContain(createBootstrapScript({ storageKey: `${WORKBENCH_STORAGE_PREFIX}.preferences` }));
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
