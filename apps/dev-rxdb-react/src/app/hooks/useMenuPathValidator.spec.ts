import { describe, expect, it } from 'vitest';
import { MenuPathNode, useMenuPathValidator } from './useMenuPathValidator';

describe('useMenuPathValidator', () => {
  it('应该检测到菜单名冲突', () => {
    const { checkConflict } = useMenuPathValidator();

    const allNodes: MenuPathNode[] = [
      { id: '1', title: 'Settings', parentId: null },
      { id: '2', title: 'Profile', parentId: null }
    ];

    const conflict = checkConflict('Settings', null, allNodes);
    expect(conflict).not.toBeNull();
    expect(conflict?.attemptedName).toBe('Settings');
  });

  it('应该在不同父节点下允许同名', () => {
    const { checkConflict } = useMenuPathValidator();

    const allNodes: MenuPathNode[] = [
      { id: '1', title: 'Settings', parentId: null },
      { id: '2', title: 'Account', parentId: '1' },
      { id: '3', title: 'Settings', parentId: '2' }
    ];

    const conflict = checkConflict('Settings', null, allNodes);
    expect(conflict).not.toBeNull();

    const conflict2 = checkConflict('Settings', '1', allNodes);
    expect(conflict2).toBeNull();
  });

  it('应该忽略当前节点（重命名场景）', () => {
    const { checkConflict } = useMenuPathValidator();

    const allNodes: MenuPathNode[] = [{ id: '1', title: 'Settings', parentId: null }];

    const conflict = checkConflict('Settings', null, allNodes, '1');
    expect(conflict).toBeNull();
  });

  it('应该执行 case-insensitive 检测', () => {
    const { checkConflict } = useMenuPathValidator();

    const allNodes: MenuPathNode[] = [{ id: '1', title: 'Settings', parentId: null }];

    const conflict = checkConflict('settings', null, allNodes);
    expect(conflict).not.toBeNull();
  });

  it('应该构建正确的菜单路径', () => {
    const { buildPath } = useMenuPathValidator();

    const allNodes: MenuPathNode[] = [
      { id: '1', title: 'Settings', parentId: null },
      { id: '2', title: 'Account', parentId: '1' },
      { id: '3', title: 'Profile', parentId: '2' }
    ];

    const path = buildPath(allNodes[2], allNodes);
    expect(path).toBe('/Settings/Account/Profile');
  });
});
