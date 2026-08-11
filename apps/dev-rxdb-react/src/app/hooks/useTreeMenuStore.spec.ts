import type { MenuSimple } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTreeMenuStore } from './useTreeMenuStore';

/**
 * 构造一个"够用"的 MenuSimple 替身。
 *
 * store 只读 `id` / `parentId` / `title` / `sortOrder`，写只经过 `save()` / `remove()`，
 * 因此不需要真实实体（真实实体要连数据库）。断言的是 store 自身的行为契约。
 */
const makeMenu = (
  id: string,
  parentId: string | null,
  sortOrder: string,
  remove: () => Promise<void> = () => Promise.resolve()
): MenuSimple =>
  ({
    id,
    parentId,
    title: `菜单 ${id}`,
    sortOrder,
    remove,
    save: () => Promise.resolve()
  }) as unknown as MenuSimple;

describe('useTreeMenuStore', () => {
  it('级联删除按子孙到父节点的顺序执行', async () => {
    const removed: string[] = [];
    const makeTrackedMenu = (id: string, parentId: string | null): MenuSimple =>
      makeMenu(id, parentId, 'a0', async () => {
        removed.push(id);
      });
    const root = makeTrackedMenu('root', null);
    const child = makeTrackedMenu('child', 'root');
    const grandchild = makeTrackedMenu('grandchild', 'child');
    const { result } = renderHook(() => useTreeMenuStore([root, child, grandchild]));

    await act(async () => {
      await result.current.deleteMenu(root);
    });
    await act(async () => {
      await result.current.executeCascadeDelete();
    });

    expect(removed).toEqual(['grandchild', 'child', 'root']);
  });

  describe('deleteMenu（叶子节点路径）', () => {
    it('删除失败时调用方能观察到错误，而不是被吞成悬空 Promise', async () => {
      const remove = vi.fn(() => Promise.reject(new Error('远端拒绝删除')));
      const leaf = makeMenu('leaf', null, 'a0', remove);
      const { result } = renderHook(() => useTreeMenuStore([leaf]));

      await act(async () => {
        await result.current.deleteMenu(leaf);
      });

      expect(remove).toHaveBeenCalledTimes(1);
      expect(result.current.deleteError).toBe('远端拒绝删除');
    });

    it('返回的 Promise 必须等 remove() 落地后才 resolve', async () => {
      let settle: (() => void) | undefined;
      const remove = vi.fn(
        () =>
          new Promise<void>(resolve => {
            settle = resolve;
          })
      );
      const leaf = makeMenu('leaf', null, 'a0', remove);
      const { result } = renderHook(() => useTreeMenuStore([leaf]));

      let settled = false;
      const pending = result.current.deleteMenu(leaf).then(() => {
        settled = true;
      });

      await Promise.resolve();
      expect(settled).toBe(false);

      await act(async () => {
        settle?.();
        await pending;
      });
      expect(settled).toBe(true);
      expect(result.current.deleteError).toBeNull();
    });
  });

  describe('expandedIds 与异步数据', () => {
    it('menus 异步到达后应补齐父节点展开状态', () => {
      const parent = makeMenu('p', null, 'a0');
      const child = makeMenu('c', 'p', 'a0');

      const { result, rerender } = renderHook(({ menus }) => useTreeMenuStore(menus), {
        initialProps: { menus: [] as MenuSimple[] }
      });
      expect(result.current.treeNodes).toHaveLength(0);

      rerender({ menus: [parent, child] });

      expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['p', 'c']);
    });

    it('用户手动折叠后，后续数据更新不得把它重新展开', () => {
      const parent = makeMenu('p', null, 'a0');
      const child = makeMenu('c', 'p', 'a0');
      const later = makeMenu('later', null, 'a1');

      const { result, rerender } = renderHook(({ menus }) => useTreeMenuStore(menus), {
        initialProps: { menus: [] as MenuSimple[] }
      });
      rerender({ menus: [parent, child] });

      act(() => {
        result.current.toggleExpand('p');
      });
      expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['p']);

      rerender({ menus: [parent, child, later] });

      expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['p', 'later']);
    });
  });
});
