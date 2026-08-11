import type { FileNode } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortMode } from '../utils/file-sorters';
import { useFileManagerStore } from './useFileManagerStore';

const makeFile = (
  id: string,
  parentId: string | null,
  type: 'file' | 'folder',
  sortOrder: string,
  removed: string[]
): FileNode =>
  ({
    id,
    parentId,
    name: id,
    type,
    sortOrder,
    extension: type === 'file' ? '.txt' : null,
    remove: vi.fn(async () => {
      removed.push(id);
    }),
    save: vi.fn()
  }) as unknown as FileNode;

describe('useFileManagerStore', () => {
  it('自由排序保持文件夹优先', () => {
    const removed: string[] = [];
    const file = makeFile('file', null, 'file', 'a0', removed);
    const folder = makeFile('folder', null, 'folder', 'z0', removed);

    const { result } = renderHook(() => useFileManagerStore([file, folder]));

    expect(result.current.treeNodes.map(node => node.file.id)).toEqual(['folder', 'file']);
  });

  it('级联删除按子孙到父节点的顺序执行', async () => {
    const removed: string[] = [];
    const root = makeFile('root', null, 'folder', 'a0', removed);
    const child = makeFile('child', 'root', 'folder', 'a0', removed);
    const grandchild = makeFile('grandchild', 'child', 'file', 'a0', removed);
    const { result } = renderHook(() => useFileManagerStore([root, child, grandchild]));

    await act(async () => {
      await result.current.deleteFile(root);
    });

    expect(removed).toEqual(['grandchild', 'child', 'root']);
  });

  it('无匹配搜索返回空树，不退化为全量列表', () => {
    const removed: string[] = [];
    const root = makeFile('root', null, 'folder', 'a0', removed);
    const child = makeFile('child', 'root', 'file', 'a0', removed);
    const { result } = renderHook(() => useFileManagerStore([root, child]));

    act(() => result.current.setSearchKeyword('不存在的文件'));

    expect(result.current.matchedFileIds).toEqual(new Set());
    expect(result.current.treeNodes).toEqual([]);
  });

  it('排序模式变化会驱动树节点顺序并持久化选择', () => {
    const removed: string[] = [];
    const first = makeFile('zeta', null, 'file', 'a0', removed);
    const second = makeFile('alpha', null, 'file', 'a1', removed);
    const { result } = renderHook(() => useFileManagerStore([first, second]));

    act(() => result.current.changeSortMode(SortMode.NameAsc));

    expect(result.current.sortMode).toBe(SortMode.NameAsc);
    expect(result.current.treeNodes.map(node => node.file.name)).toEqual(['alpha', 'zeta']);
  });

  it('展开全部后折叠全部只保留对应的 folder id', async () => {
    const removed: string[] = [];
    const root = makeFile('root', null, 'folder', 'a0', removed);
    const child = makeFile('child', 'root', 'folder', 'a0', removed);
    const leaf = makeFile('leaf', 'child', 'file', 'a0', removed);
    const { result } = renderHook(() => useFileManagerStore([root, child, leaf]));

    await act(async () => {
      result.current.expandAll();
    });
    expect(result.current.expandedIds).toEqual(new Set(['root', 'child']));
    expect(result.current.treeNodes.map(node => node.file.id)).toEqual(['root', 'child', 'leaf']);

    await act(async () => {
      result.current.collapseAll();
    });
    expect(result.current.expandedIds).toEqual(new Set());
    expect(result.current.treeNodes.map(node => node.file.id)).toEqual(['root']);
  });
});
