import type { MenuLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore';

const makeMenu = (id: string, parentId: string | null, removed: string[]): MenuLarge =>
  ({
    id,
    parentId,
    title: id,
    sortOrder: 'a0',
    remove: vi.fn(async () => {
      removed.push(id);
    }),
    save: vi.fn()
  }) as unknown as MenuLarge;

describe('useTreeMenuVirtualStore', () => {
  it('级联删除按子孙到父节点的顺序执行', async () => {
    const removed: string[] = [];
    const root = makeMenu('root', null, removed);
    const child = makeMenu('child', 'root', removed);
    const grandchild = makeMenu('grandchild', 'child', removed);
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child, grandchild]));

    await act(async () => {
      await result.current.deleteMenu(root);
    });
    await act(async () => {
      await result.current.executeCascadeDelete();
    });

    expect(removed).toEqual(['grandchild', 'child', 'root']);
  });

  it('无匹配搜索返回空树', () => {
    const removed: string[] = [];
    const root = makeMenu('root', null, removed);
    root.title = '根菜单';
    const child = makeMenu('child', 'root', removed);
    child.title = '子菜单';
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child]));

    act(() => {
      result.current.setSearchKeyword('不存在');
    });

    expect(result.current.treeNodes).toEqual([]);
  });

  it('展开全部和折叠全部只改变父节点展开状态', () => {
    const removed: string[] = [];
    const root = makeMenu('root', null, removed);
    const child = makeMenu('child', 'root', removed);
    const leaf = makeMenu('leaf', 'child', removed);
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child, leaf]));

    act(() => result.current.expandAll());
    expect(result.current.expandedIds).toEqual(new Set(['root', 'child']));
    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['root', 'child', 'leaf']);

    act(() => result.current.collapseAll());
    expect(result.current.expandedIds).toEqual(new Set());
    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['root']);
  });

  it('叶节点删除失败时暴露错误', async () => {
    const removed: string[] = [];
    const leaf = makeMenu('leaf', null, removed);
    leaf.remove = vi.fn(async () => {
      throw new Error('删除失败');
    });
    const { result } = renderHook(() => useTreeMenuVirtualStore([leaf]));

    await act(async () => {
      await result.current.deleteMenu(leaf);
    });

    expect(result.current.deleteError).toBe('删除失败');
  });
});
