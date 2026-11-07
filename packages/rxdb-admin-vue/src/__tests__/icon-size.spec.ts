import type { MenuNode } from '@aiao/rxdb-admin';
import { Boxes, Database, Package, Search } from '@lucide/vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import { act, screen, within } from './queries.js';
import { cleanup, mount } from './test-utils.js';

afterEach(cleanup);

/** 菜单图标是 `@lucide/vue` 组件，默认 24px：外壳渲染节点图标时统一传 `size=16`（与 Angular 版一致）。 */
const menu: MenuNode<Component>[] = [
  {
    id: 'entities',
    label: '实体',
    icon: Boxes,
    expanded: true,
    children: [
      { id: 'asset', label: '资产', icon: Package, route: '/entities/assets/Asset', testId: 'nav-asset' },
      {
        id: 'category',
        label: '资产分类',
        icon: Package,
        route: '/entities/assets/AssetCategory',
        testId: 'nav-category'
      }
    ]
  },
  {
    id: 'data',
    label: '数据',
    icon: Database,
    expanded: true,
    children: [{ id: 'search', label: '搜索', icon: Search, route: '/search', testId: 'nav-search' }]
  }
];

const sizeOf = (svg: Element | null | undefined): [string | null | undefined, string | null | undefined] => [
  svg?.getAttribute('width'),
  svg?.getAttribute('height')
];

describe('外壳渲染的节点图标', () => {
  it('侧栏：叶子与分组的图标都是 16px', () => {
    mount({}, { menu });
    expect(sizeOf(screen.getByTestId('nav-asset').querySelector('svg'))).toEqual(['16', '16']);
    const group = within(screen.getByTestId('admin-menu')).getByText('实体').closest('summary') as HTMLElement;
    expect(sizeOf(group.querySelector('svg'))).toEqual(['16', '16']);
  });

  it('图标轨：压平后的叶子图标是 16px', () => {
    mount({ defaults: { sidebar: { collapsed: true } } }, { menu });
    expect(sizeOf(screen.getByTestId('nav-asset').querySelector('svg'))).toEqual(['16', '16']);
    expect(sizeOf(screen.getByTestId('nav-search').querySelector('svg'))).toEqual(['16', '16']);
  });

  it('顶部水平菜单：链接与分组触发器的节点图标是 16px', () => {
    mount({ defaults: { app: { layout: 'header-nav' } } }, { menu });
    expect(sizeOf(screen.getByTestId('nav-asset').querySelector('svg'))).toEqual(['16', '16']);
    const trigger = within(screen.getByTestId('admin-header-menu')).getByRole('button', { name: /实体/ });
    expect(sizeOf(trigger.querySelector('svg'))).toEqual(['16', '16']);
  });

  it('面包屑：开启显示图标后，每一级的图标都是 16px', () => {
    mount({ defaults: { breadcrumb: { showIcon: true } } }, { menu });
    const icons = [...screen.getByTestId('admin-breadcrumb').querySelectorAll('svg')];
    expect(icons).toHaveLength(2);
    expect(icons.map(sizeOf)).toEqual([
      ['16', '16'],
      ['16', '16']
    ]);
  });

  it('面包屑：带地址的中间层渲染成链接，图标同样是 16px', () => {
    const linked: MenuNode<Component>[] = [
      {
        id: 'assets',
        label: '资产管理',
        icon: Boxes,
        route: '/entities/assets',
        children: [{ id: 'asset', label: '资产', icon: Package, route: '/entities/assets/Asset' }]
      }
    ];
    mount({ defaults: { breadcrumb: { showIcon: true } } }, { menu: linked });
    const crumbs = screen.getByTestId('admin-breadcrumb');
    expect(sizeOf(crumbs.querySelector('a svg'))).toEqual(['16', '16']);
    expect(sizeOf(crumbs.querySelector('span.admin-breadcrumb-item svg'))).toEqual(['16', '16']);
  });

  it('页签：标题前的菜单图标是 16px', () => {
    mount({}, { menu });
    const title = screen.getAllByTestId('admin-tab')[0].querySelector('.admin-tab-title') as HTMLElement;
    expect(sizeOf(title.querySelector('svg'))).toEqual(['16', '16']);
  });

  it('命令面板：菜单条目的图标是 16px', async () => {
    const { shell } = mount({}, { menu });
    await act(() => shell.palette.open());
    const option = screen.getAllByTestId('admin-palette-option')[0];
    expect(sizeOf(option.querySelector('svg'))).toEqual(['16', '16']);
  });
});
