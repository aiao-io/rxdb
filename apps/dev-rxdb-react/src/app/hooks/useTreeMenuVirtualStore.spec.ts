import type { RxDB } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore';

const mocks = vi.hoisted(() => ({
  getEntityMutations: vi.fn((options: unknown) => ({ mutationsOf: options }))
}));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: mocks.getEntityMutations
}));

/** 与 `useTreeMenuStore.spec.ts` 同构的实体替身，说明见该文件。 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class SortableMenuLargeDouble {
    static created: SortableMenuLargeDouble[] = [];
    id: string;
    parentId: string | null = null;
    constructor(data: Record<string, unknown> = {}) {
      seq += 1;
      this.id = `new${seq}`;
      Object.assign(this, data);
      SortableMenuLargeDouble.created.push(this);
    }
    save(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { SortableMenuLarge: SortableMenuLargeDouble };
});

interface QueryOptions {
  where?: { rules?: { field: string; value: unknown }[] };
  orderBy?: unknown;
  limit?: number;
}

let dbRows: SortableMenuLarge[] = [];
const queries: QueryOptions[] = [];

const rowsFor = (options: QueryOptions): SortableMenuLarge[] => {
  queries.push(options);
  const rule = options.where?.rules?.find(r => r.field === 'parentId');
  const matched = dbRows.filter(row => (row.parentId ?? null) === (rule?.value ?? null));
  return options.limit === undefined ? matched : matched.slice(0, options.limit);
};

const mutations = vi.fn((): Promise<void> => Promise.resolve());
const rxdb = { entityManager: { mutations } } as unknown as RxDB;

const createdMenus = (): Record<string, unknown>[] =>
  (SortableMenuLarge as unknown as { created: Record<string, unknown>[] }).created;

const makeMenu = (id: string, parentId: string | null, removed: string[] = []): SortableMenuLarge =>
  ({
    id,
    parentId,
    title: id,
    sortOrder: 'a0',
    remove: vi.fn(async () => {
      removed.push(id);
    }),
    save: vi.fn()
  }) as unknown as SortableMenuLarge;

describe('useTreeMenuVirtualStore', () => {
  beforeEach(() => {
    dbRows = [];
    queries.length = 0;
    createdMenus().length = 0;
    mutations.mockReset().mockResolvedValue(undefined);
    mocks.getEntityMutations.mockClear();
    const statics = SortableMenuLarge as unknown as Record<string, unknown>;
    statics.find = vi.fn((options: QueryOptions) => of(rowsFor(options)));
    statics.findAll = vi.fn((options: QueryOptions) => of(rowsFor(options)));
  });

  afterEach(() => {
    const statics = SortableMenuLarge as unknown as Record<string, unknown>;
    delete statics.find;
    delete statics.findAll;
    vi.restoreAllMocks();
  });

  it('建树顺序 = 查询顺序', () => {
    // 传入（查询）顺序即显示顺序：store 不得再按排序键比较
    const second = { ...makeMenu('second', null), sortOrder: 'a9' } as SortableMenuLarge;
    const first = { ...makeMenu('first', null), sortOrder: 'a1' } as SortableMenuLarge;
    const child2 = { ...makeMenu('child2', 'second'), sortOrder: 'a8' } as SortableMenuLarge;
    const child1 = { ...makeMenu('child1', 'second'), sortOrder: 'a2' } as SortableMenuLarge;
    const { result } = renderHook(() => useTreeMenuVirtualStore([second, first, child2, child1], rxdb));

    act(() => result.current.expandAll());

    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['second', 'child2', 'child1', 'first']);
  });

  it('查询不传 orderBy', async () => {
    const root = makeMenu('root', null);
    dbRows = [makeMenu('child', 'root')];
    const { result } = renderHook(() => useTreeMenuVirtualStore([root], rxdb));

    // 打开删除对话框读一次直接子节点，提升子节点再读一次整组：两种查询都不带显式排序
    await act(async () => {
      await result.current.deleteMenu(root);
    });
    await act(async () => {
      await result.current.executePromoteChildrenDelete();
    });

    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.map(query => query.orderBy)).toEqual(queries.map(() => undefined));
  });

  it('级联删除按子孙到父节点的顺序执行', async () => {
    const removed: string[] = [];
    const root = makeMenu('root', null, removed);
    const child = makeMenu('child', 'root', removed);
    const grandchild = makeMenu('grandchild', 'child', removed);
    dbRows = [child, grandchild];
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child, grandchild], rxdb));

    await act(async () => {
      await result.current.deleteMenu(root);
    });
    await act(async () => {
      await result.current.executeCascadeDelete();
    });

    expect(removed).toEqual(['grandchild', 'child', 'root']);
  });

  it('无匹配搜索返回空树', () => {
    const root = makeMenu('root', null);
    root.title = '根菜单';
    const child = makeMenu('child', 'root');
    child.title = '子菜单';
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child], rxdb));

    act(() => {
      result.current.setSearchKeyword('不存在');
    });

    expect(result.current.treeNodes).toEqual([]);
  });

  it('展开全部和折叠全部只改变父节点展开状态', () => {
    const root = makeMenu('root', null);
    const child = makeMenu('child', 'root');
    const leaf = makeMenu('leaf', 'child');
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child, leaf], rxdb));

    act(() => result.current.expandAll());
    expect(result.current.expandedIds).toEqual(new Set(['root', 'child']));
    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['root', 'child', 'leaf']);

    act(() => result.current.collapseAll());
    expect(result.current.expandedIds).toEqual(new Set());
    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['root']);
  });

  it('叶节点删除失败时暴露错误', async () => {
    const leaf = makeMenu('leaf', null);
    leaf.remove = vi.fn(async () => {
      throw new Error('删除失败');
    });
    const { result } = renderHook(() => useTreeMenuVirtualStore([leaf], rxdb));

    await act(async () => {
      await result.current.deleteMenu(leaf);
    });

    expect(result.current.writeError).toBe('删除失败：删除失败');
  });

  it('是否弹删除对话框取自库里的直接子节点，而不是页面已加载的节点', async () => {
    const parent = makeMenu('p', null);
    dbRows = [makeMenu('c1', 'p')];
    const { result } = renderHook(() => useTreeMenuVirtualStore([parent], rxdb));

    await act(async () => {
      await result.current.deleteMenu(parent);
    });

    expect(result.current.menuToDelete).toBe(parent);
    expect(parent.remove).not.toHaveBeenCalled();
    expect(queries[0].where?.rules).toEqual([expect.objectContaining({ field: 'parentId', value: 'p' })]);
  });

  describe('executePromoteChildrenDelete（删除并提升子节点）', () => {
    it('子节点取自库，只改 parentId，一次 mutations 提交，不逐条 save / remove', async () => {
      const parent = makeMenu('p', 'g');
      const c1 = makeMenu('c1', 'p');
      const c2 = makeMenu('c2', 'p');
      dbRows = [c1, c2];
      const { result } = renderHook(() => useTreeMenuVirtualStore([parent], rxdb));
      await act(async () => {
        await result.current.deleteMenu(parent);
      });

      await act(async () => {
        await result.current.executePromoteChildrenDelete();
      });

      expect(mocks.getEntityMutations).toHaveBeenCalledExactlyOnceWith({
        needSaveEntities: [c1, c2],
        needRemoveEntities: [parent]
      });
      expect(mutations).toHaveBeenCalledOnce();
      expect([c1.parentId, c2.parentId]).toEqual(['g', 'g']);
      expect(c1.save).not.toHaveBeenCalled();
      expect(parent.remove).not.toHaveBeenCalled();
      expect(result.current.menuToDelete).toBeNull();
    });

    it('提交失败：写入「删除并提升子节点失败」，对话框关闭，不抛出', async () => {
      const parent = makeMenu('p', null);
      dbRows = [makeMenu('c1', 'p')];
      mutations.mockRejectedValueOnce(new Error('事务回滚'));
      const { result } = renderHook(() => useTreeMenuVirtualStore([parent], rxdb));
      await act(async () => {
        await result.current.deleteMenu(parent);
      });

      await act(async () => {
        await result.current.executePromoteChildrenDelete();
      });

      expect(result.current.writeError).toBe('删除并提升子节点失败：事务回滚');
      expect(result.current.menuToDelete).toBeNull();
    });
  });

  it('级联删除失败：写入「级联删除失败」，对话框关闭，不抛出', async () => {
    const root = makeMenu('root', null);
    root.remove = vi.fn(() => Promise.reject(new Error('被外键拦下')));
    const child = makeMenu('child', 'root');
    dbRows = [child];
    const { result } = renderHook(() => useTreeMenuVirtualStore([root, child], rxdb));
    await act(async () => {
      await result.current.deleteMenu(root);
    });

    await act(async () => {
      await result.current.executeCascadeDelete();
    });

    expect(result.current.writeError).toBe('级联删除失败：被外键拦下');
    expect(result.current.menuToDelete).toBeNull();
  });

  describe('新建', () => {
    it('addRoot / addChild 只赋业务字段与 parentId，不带 sortOrder，不读同级', async () => {
      const parent = makeMenu('p', null);
      const { result } = renderHook(() => useTreeMenuVirtualStore([parent, makeMenu('c1', 'p')], rxdb));

      await act(async () => {
        await result.current.addRoot('新根');
      });
      await act(async () => {
        await result.current.addChild(parent, '新子菜单');
      });

      const [root, child] = createdMenus();
      expect(root['parentId']).toBeNull();
      expect(child['parentId']).toBe('p');
      expect(Object.keys(root)).not.toContain('sortOrder');
      expect(Object.keys(child)).not.toContain('sortOrder');
      expect(queries).toEqual([]);
      expect(result.current.expandedIds.has('p')).toBe(true);
    });

    it('保存失败：写入「新建失败」且不抛出，父节点不被展开', async () => {
      const parent = makeMenu('p', null);
      vi.spyOn(SortableMenuLarge.prototype, 'save').mockRejectedValue(new Error('唯一索引冲突'));
      const { result } = renderHook(() => useTreeMenuVirtualStore([parent], rxdb));

      await act(async () => {
        await result.current.addChild(parent, '重名');
      });

      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.expandedIds.has('p')).toBe(false);
    });
  });

  it('重命名失败：runWrite 把失败写入「重命名失败」', async () => {
    const { result } = renderHook(() => useTreeMenuVirtualStore([], rxdb));

    await act(async () => {
      await result.current.runWrite('重命名', () => Promise.reject(new Error('同级重名')));
    });

    expect(result.current.writeError).toBe('重命名失败：同级重名');
    act(() => result.current.clearWriteError());
    expect(result.current.writeError).toBeNull();
  });
});
