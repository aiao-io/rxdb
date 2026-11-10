import { describe, expect, it } from 'vitest';
import { ADMIN_MENU, tabFromUrl } from './admin-shell';

describe('Aiao Media 管理后台外壳', () => {
  it('菜单与业务管理页签保持同一组路由', () => {
    expect(ADMIN_MENU[0]?.children?.map(item => item.route)).toEqual([
      '/users',
      '/templates',
      '/policies',
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
