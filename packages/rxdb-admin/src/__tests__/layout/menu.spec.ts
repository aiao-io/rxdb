import { describe, expect, it } from 'vitest';
import {
  activeGroupIds,
  buildBreadcrumb,
  findActiveRoot,
  findMenuPath,
  flattenMenu,
  groupIds,
  groupsToOpen,
  landingRoute,
  menuTitleOf,
  toggleGroup,
  type MenuNode
} from '../../layout/menu.js';

const menu: MenuNode<string>[] = [
  {
    id: 'entities',
    label: '实体',
    icon: 'boxes',
    children: [
      { id: 'asset', label: '资产', route: '/entities/assets/Asset', icon: 'box' },
      { id: 'category', label: '资产分类', route: '/entities/assets/AssetCategory' }
    ]
  },
  {
    id: 'data',
    label: '数据',
    children: [
      { id: 'search', label: '搜索', route: '/search' },
      { id: 'backup', label: '备份 / 恢复', route: '/backup' }
    ]
  },
  { id: 'home', label: '首页', route: '/' }
];

describe('findMenuPath', () => {
  it.each([false, true])('同层菜单按路由精度匹配，不受声明顺序影响：%s', reverse => {
    const nodes = [
      { id: 'specific', label: '设置', route: '/users/settings' },
      { id: 'general', label: '用户', route: '/users' }
    ];
    if (reverse) nodes.reverse();
    expect(findMenuPath(nodes, '/users/settings?tab=profile').map(node => node.id)).toEqual(['specific']);
    expect(findMenuPath(nodes, '/users/settings/profile').map(node => node.id)).toEqual(['specific']);
  });

  it('精确路由优先于位于更深菜单分组内的通用路由', () => {
    const nodes = [
      { id: 'specific', label: '设置', route: '/users/settings' },
      { id: 'group', label: '分组', children: [{ id: 'general', label: '用户', route: '/users' }] }
    ];
    expect(findMenuPath(nodes, '/users/settings').map(node => node.id)).toEqual(['specific']);
  });

  it('精确匹配返回从根到叶的路径', () => {
    expect(findMenuPath(menu, '/entities/assets/Asset').map(node => node.id)).toEqual(['entities', 'asset']);
  });

  it('忽略查询串与哈希，前缀匹配子路由', () => {
    expect(findMenuPath(menu, '/entities/assets/Asset?page=2#x').map(node => node.id)).toEqual(['entities', 'asset']);
    expect(findMenuPath(menu, '/entities/assets/Asset/123').map(node => node.id)).toEqual(['entities', 'asset']);
  });

  it('不是路径边界的前缀不算匹配', () => {
    expect(findMenuPath(menu, '/entities/assets/AssetEvent')).toEqual([]);
  });

  it('根路径只精确匹配，不吞掉其他地址', () => {
    expect(findMenuPath(menu, '/').map(node => node.id)).toEqual(['home']);
    expect(findMenuPath(menu, '/unknown')).toEqual([]);
  });

  it('没有匹配返回空数组', () => {
    expect(findMenuPath([], '/x')).toEqual([]);
    expect(findMenuPath(menu, '/nowhere')).toEqual([]);
  });

  it('多个候选时取更深更具体的路由', () => {
    const nested: MenuNode[] = [
      { id: 'a', label: 'A', route: '/a' },
      { id: 'g', label: 'G', children: [{ id: 'ab', label: 'AB', route: '/a/b' }] }
    ];
    expect(findMenuPath(nested, '/a/b/c').map(node => node.id)).toEqual(['g', 'ab']);
    expect(findMenuPath(nested, '/a/x').map(node => node.id)).toEqual(['a']);
  });
});

describe('flattenMenu / menuTitleOf / findActiveRoot / landingRoute', () => {
  it('flattenMenu 先序列出带路由的节点', () => {
    expect(flattenMenu(menu).map(node => node.id)).toEqual(['asset', 'category', 'search', 'backup', 'home']);
  });

  it('menuTitleOf 取叶子标题', () => {
    expect(menuTitleOf(menu, '/search')).toBe('搜索');
    expect(menuTitleOf(menu, '/nowhere')).toBeUndefined();
  });

  it('findActiveRoot 取一级节点', () => {
    expect(findActiveRoot(menu, '/backup')?.id).toBe('data');
    expect(findActiveRoot(menu, '/nowhere')).toBeUndefined();
  });

  it('landingRoute：自身路由，否则第一个后代路由', () => {
    expect(landingRoute(menu[0])).toBe('/entities/assets/Asset');
    expect(landingRoute(menu[2])).toBe('/');
    expect(landingRoute({ id: 'empty', label: '空', children: [{ id: 'x', label: 'x' }] })).toBeUndefined();
    expect(
      landingRoute({
        id: 'deep',
        label: 'D',
        children: [{ id: 'g', label: 'G', children: [{ id: 'l', label: 'L', route: '/l' }] }]
      })
    ).toBe('/l');
  });
});

describe('buildBreadcrumb', () => {
  it('分组节点没有地址（不可点击），叶子带地址与图标', () => {
    expect(buildBreadcrumb(menu, '/entities/assets/Asset')).toEqual([
      { id: 'entities', label: '实体', icon: 'boxes' },
      { id: 'asset', label: '资产', icon: 'box', route: '/entities/assets/Asset' }
    ]);
  });

  it('可前置首页项', () => {
    const home = { id: 'home', label: '首页', route: '/' };
    expect(buildBreadcrumb(menu, '/search', home).map(item => item.id)).toEqual(['home', 'data', 'search']);
  });

  it('没有匹配返回空数组（不显示首页）', () => {
    expect(buildBreadcrumb(menu, '/nowhere', { id: 'home', label: '首页' })).toEqual([]);
  });
});

describe('activeGroupIds / toggleGroup', () => {
  it('activeGroupIds 返回路径上的分组', () => {
    expect(activeGroupIds(menu, '/backup')).toEqual(['data']);
    expect(activeGroupIds(menu, '/')).toEqual([]);
    expect(activeGroupIds(menu, '/nowhere')).toEqual([]);
  });

  it('展开 / 收起', () => {
    const opened = toggleGroup(new Set(), 'a', ['a', 'b'], false);
    expect([...opened]).toEqual(['a']);
    expect([...toggleGroup(opened, 'a', ['a', 'b'], false)]).toEqual([]);
  });

  it('手风琴：同级只保留一个展开，不影响其他层级', () => {
    const next = toggleGroup(new Set(['a', 'x']), 'b', ['a', 'b'], true);
    expect([...next].sort()).toEqual(['b', 'x']);
  });

  it('非手风琴：同级可同时展开', () => {
    expect([...toggleGroup(new Set(['a']), 'b', ['a', 'b'], false)].sort()).toEqual(['a', 'b']);
  });
});

describe('groupIds / groupsToOpen', () => {
  const tree: MenuNode<string>[] = [
    {
      id: 'entities',
      label: '实体',
      expanded: true,
      children: [
        { id: 'asset', label: '资产', route: '/entities/assets/Asset' },
        {
          id: 'nested',
          label: '嵌套',
          children: [{ id: 'deep', label: '深层', route: '/deep' }]
        }
      ]
    },
    { id: 'data', label: '数据', children: [{ id: 'search', label: '搜索', route: '/search' }] },
    { id: 'home', label: '首页', route: '/' }
  ];

  it('groupIds 返回全部分组（有子项的节点），含嵌套，不含叶子', () => {
    expect(groupIds(tree)).toEqual(['entities', 'nested', 'data']);
    expect(groupIds([])).toEqual([]);
  });

  it('首次（没见过任何分组）：声明了 expanded 的分组加上当前地址所在的分组', () => {
    expect(groupsToOpen(tree, '/search').sort()).toEqual(['data', 'entities']);
    expect(groupsToOpen(tree, '/deep').sort()).toEqual(['entities', 'nested']);
    expect(groupsToOpen(tree, '/')).toEqual(['entities']);
  });

  it('菜单变化后：只带上此前没见过的 expanded 分组，用户收起过的老分组不会被重新展开', () => {
    const known = new Set(groupIds(tree));
    expect(groupsToOpen(tree, '/', known)).toEqual([]);
    const later: MenuNode<string>[] = [
      ...tree,
      { id: 'late', label: '后到', expanded: true, children: [{ id: 'l1', label: '后到子项', route: '/late' }] },
      { id: 'quiet', label: '安静', children: [{ id: 'q1', label: '安静子项', route: '/quiet' }] }
    ];
    expect(groupsToOpen(later, '/', known)).toEqual(['late']);
  });

  it('菜单变化后：此前没见过的分组若在当前地址路径上也展开（菜单晚于地址到达）；见过的不重复展开', () => {
    const known = new Set(groupIds(tree));
    expect(groupsToOpen(tree, '/search', known)).toEqual([]);
    const later: MenuNode<string>[] = [
      ...tree,
      { id: 'late', label: '后到', children: [{ id: 'l1', label: '后到子项', route: '/late' }] }
    ];
    expect(groupsToOpen(later, '/late', known)).toEqual(['late']);
  });

  it('既 expanded 又在当前地址路径上的分组只出现一次', () => {
    const merged: MenuNode<string>[] = [
      { id: 'g', label: 'G', expanded: true, children: [{ id: 'c', label: 'C', route: '/c' }] }
    ];
    expect(groupsToOpen(merged, '/c')).toEqual(['g']);
  });
});
