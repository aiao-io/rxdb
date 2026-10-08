import { SortableFileNode } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SortMode } from '../utils/file-sorters';
import { useFileManagerStore } from './useFileManagerStore';

/**
 * 真实实体的构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **写了什么**，不是实体装配，所以换成同形状的替身。
 * 替身不声明 `sortOrder` 字段：store 若赋了它，`Object.keys` 里就会出现。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class SortableFileNodeDouble {
    /** 本文件里 store 新建过的实例，按创建顺序。 */
    static created: SortableFileNodeDouble[] = [];
    id: string;
    parentId: string | null = null;
    constructor(data: Record<string, unknown> = {}) {
      seq += 1;
      this.id = `new${seq}`;
      Object.assign(this, data);
      SortableFileNodeDouble.created.push(this);
    }
    save(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { SortableFileNode: SortableFileNodeDouble };
});

const createdFiles = (): Record<string, unknown>[] =>
  (SortableFileNode as unknown as { created: Record<string, unknown>[] }).created;

const makeFile = (
  id: string,
  parentId: string | null,
  type: 'file' | 'folder',
  sortOrder: string,
  removed: string[]
): SortableFileNode =>
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
  }) as unknown as SortableFileNode;

describe('useFileManagerStore', () => {
  beforeEach(() => {
    createdFiles().length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('建树顺序 = 查询顺序', () => {
    // 手动模式：文件在前、键的字典序与传入顺序相反，store 都不得再改（不再文件夹优先）
    const removed: string[] = [];
    const file = makeFile('file', null, 'file', 'z0', removed);
    const folder = makeFile('folder', null, 'folder', 'a0', removed);
    const child2 = makeFile('child2', 'folder', 'file', 'a9', removed);
    const child1 = makeFile('child1', 'folder', 'folder', 'a1', removed);

    const { result } = renderHook(() => useFileManagerStore([file, folder, child2, child1]));
    act(() => result.current.expandAll());

    expect(result.current.sortMode).toBe(SortMode.Manual);
    expect(result.current.treeNodes.map(node => node.file.id)).toEqual(['file', 'folder', 'child2', 'child1']);
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

  describe('新建', () => {
    it('根级依次新建文件夹、文件、文件夹：保存的实例都只带业务字段，不带 sortOrder', async () => {
      const removed: string[] = [];
      const existing = makeFile('既有', null, 'folder', 'a0', removed);
      const { result } = renderHook(() => useFileManagerStore([existing]));

      await act(async () => {
        await result.current.addRoot('A', 'folder');
      });
      await act(async () => {
        await result.current.addRoot('X', 'file', '.txt');
      });
      await act(async () => {
        await result.current.addRoot('B', 'folder');
      });

      const created = createdFiles();
      expect(created.map(file => [file['name'], file['type'], file['parentId']])).toEqual([
        ['A', 'folder', null],
        ['X', 'file', null],
        ['B', 'folder', null]
      ]);
      for (const file of created) expect(Object.keys(file)).not.toContain('sortOrder');
    });

    it('addChild 带 parentId、不带 sortOrder，并展开父文件夹', async () => {
      const removed: string[] = [];
      const parent = makeFile('p', null, 'folder', 'a0', removed);
      const sibling = makeFile('c1', 'p', 'file', 'a5', removed);
      const { result } = renderHook(() => useFileManagerStore([parent, sibling]));

      await act(async () => {
        await result.current.addChild(parent, '新文件', 'file', '.md');
      });

      const [created] = createdFiles();
      expect(created['parentId']).toBe('p');
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(result.current.expandedIds.has('p')).toBe(true);
    });

    it('保存失败：写入「新建失败」且不抛出，父文件夹不被展开', async () => {
      const removed: string[] = [];
      const parent = makeFile('p', null, 'folder', 'a0', removed);
      vi.spyOn(SortableFileNode.prototype, 'save').mockRejectedValue(new Error('唯一索引冲突'));
      const { result } = renderHook(() => useFileManagerStore([parent]));

      await act(async () => {
        await result.current.addRoot('重名', 'folder');
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');

      act(() => result.current.clearWriteError());
      await act(async () => {
        await result.current.addChild(parent, '重名', 'folder');
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.expandedIds.has('p')).toBe(false);
    });
  });

  describe('删除失败（T042）', () => {
    it('deleteFile 失败：写入「删除失败」，不抛出、不调用 window.alert', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      const removed: string[] = [];
      const file = makeFile('f', null, 'file', 'a0', removed);
      file.remove = vi.fn(() => Promise.reject(new Error('远端拒绝删除')));
      const { result } = renderHook(() => useFileManagerStore([file]));

      await act(async () => {
        await result.current.deleteFile(file);
      });

      expect(result.current.writeError).toBe('删除失败：远端拒绝删除');
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('executeCascadeDelete 失败：写入「级联删除失败」，对话框保持打开，不抛出', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      const removed: string[] = [];
      const root = makeFile('root', null, 'folder', 'a0', removed);
      root.remove = vi.fn(() => Promise.reject(new Error('被外键拦下')));
      const child = makeFile('child', 'root', 'file', 'a0', removed);
      const { result } = renderHook(() => useFileManagerStore([root, child]));
      act(() => result.current.showDeleteDialog(root));

      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(result.current.writeError).toBe('级联删除失败：被外键拦下');
      expect(result.current.fileToDelete).toBe(root);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('executeCascadeDelete 成功：关闭对话框，没有错误', async () => {
      const removed: string[] = [];
      const root = makeFile('root', null, 'folder', 'a0', removed);
      const child = makeFile('child', 'root', 'file', 'a0', removed);
      const { result } = renderHook(() => useFileManagerStore([root, child]));
      act(() => result.current.showDeleteDialog(root));

      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(removed).toEqual(['child', 'root']);
      expect(result.current.fileToDelete).toBeNull();
      expect(result.current.writeError).toBeNull();
    });
  });

  it('重命名失败：runWrite 把失败写入「重命名失败」', async () => {
    const { result } = renderHook(() => useFileManagerStore([]));

    await act(async () => {
      await result.current.runWrite('重命名', () => Promise.reject(new Error('同级重名')));
    });

    expect(result.current.writeError).toBe('重命名失败：同级重名');
    act(() => result.current.clearWriteError());
    expect(result.current.writeError).toBeNull();
  });
});
