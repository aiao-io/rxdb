import type { AdminShellOptions, MenuNode, PasswordHasher } from '@aiao/rxdb-admin';
import { createTestShell, type FakeWindowOptions, type TestShell } from '@aiao/rxdb-admin/testing';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AdminShellProvider } from '../context.js';
import { AdminLayout, type AdminLayoutProps } from '../layout/admin-layout.js';

export const fakeHasher: PasswordHasher = { hash: async (password, salt) => `${salt}:${password}` };

export const menu: MenuNode<ReactNode>[] = [
  {
    id: 'entities',
    label: '实体',
    expanded: true,
    children: [
      { id: 'asset', label: '资产', route: '/entities/assets/Asset', testId: 'nav-asset' },
      { id: 'category', label: '资产分类', route: '/entities/assets/AssetCategory', testId: 'nav-category' }
    ]
  },
  {
    id: 'data',
    label: '数据',
    expanded: true,
    children: [{ id: 'search', label: '搜索', route: '/search', testId: 'nav-search' }]
  }
];

export interface Mounted extends TestShell<ReactNode> {
  readonly view: RenderResult;
  rerender(props: Partial<AdminLayoutProps>): void;
}

export function mount(
  options: Partial<AdminShellOptions<ReactNode>> = {},
  props: Partial<AdminLayoutProps> = {},
  windowOptions: FakeWindowOptions = {}
): Mounted {
  const test = createTestShell<ReactNode>(
    { brand: { title: '工作台' }, lockHasher: fakeHasher, ...options },
    windowOptions
  );
  const tree = (extra: Partial<AdminLayoutProps>): ReactNode => (
    <AdminShellProvider shell={test.shell}>
      <AdminLayout menu={menu} url='/entities/assets/Asset' {...props} {...extra}>
        <p data-testid='page'>页面内容</p>
      </AdminLayout>
    </AdminShellProvider>
  );
  const view = render(tree({}));
  return { ...test, view, rerender: extra => view.rerender(tree(extra)) };
}
