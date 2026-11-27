import { describe, expect, it } from 'vitest';
import { ADMIN_MENU, adminShell, tabFromUrl } from './admin-shell';

describe('Aiao Media 管理后台外壳', () => {
  it('菜单直接展示功能页并保持路由一致', () => {
    expect(ADMIN_MENU.map(item => item.route)).toEqual([
      '/users',
      '/templates',
      '/policies',
      '/platforms',
      '/tasks',
      '/audit'
    ]);
  });

  it.each([
    ['/users', 'users'],
    ['/tasks?page=2', 'tasks'],
    ['/unknown', 'users']
  ] as const)('从地址 %s 解析页签', (url, expected) => {
    expect(tabFromUrl(url)).toBe(expected);
  });
});

it('宿主运行时同时包含外壳和模型文案目录', () => {
  expect(adminShell.i18n.t('common.save', undefined, 'rxdb-model')).toBe('保存');
  expect(adminShell.i18n.t('detail.basic', undefined, 'rxdb-model')).toBe('基本信息');
  expect(adminShell.i18n.t('text.a91e87b292', undefined, 'rxdb-model')).not.toBe('text.a91e87b292');
});
