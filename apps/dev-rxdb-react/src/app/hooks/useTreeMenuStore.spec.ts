import type { RxDB } from '@aiao/rxdb';
import { SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTreeMenuStore } from './useTreeMenuStore';

const mocks = vi.hoisted(() => ({
  getEntityMutations: vi.fn((options: unknown) => ({ mutationsOf: options }))
}));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: mocks.getEntityMutations
}));

/**
 * 真实实体的构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **发了哪些查询、写了什么**，不是实体装配，所以换成同形状的替身。
 * 替身不声明 `sortOrder` 字段：页面若赋了它，`Object.keys` 里就会出现。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class SortableMenuSimpleDouble {
    /** 本文件里 store 新建过的实例，按创建顺序。 */
    static created: SortableMenuSimpleDouble[] = [];
    id: string;
    parentId: string | null = null;
    constructor(data: Record<string, unknown> = {}) {
      seq += 1;
      this.id = `new${seq}`;
      Object.assign(this, data);
      SortableMenuSimpleDouble.created.push(this);
    }
    save(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { SortableMenuSimple: SortableMenuSimpleDouble };
});

interface QueryOptions {
  where?: { rules?: { field: string; value: unknown }[] };
  orderBy?: unknown;
  limit?: number;
}

/** 库里的行 —— `menus` 入参是页面已加载的节点，二者故意不同，用来证明决策取自库。 */
let dbRows: SortableMenuSimple[] = [];
const queries: QueryOptions[] = [];

const rowsFor = (options: QueryOptions): SortableMenuSimple[] => {
  queries.push(options);
  const rule = options.where?.rules?.find(r => r.field === 'parentId');
  const matched = dbRows.filter(row => (row.parentId ?? null) === (rule?.value ?? null));
  return options.limit === undefined ? matched : matched.slice(0, options.limit);
};

const mutations = vi.fn((): Promise<void> => Promise.resolve());
const rxdb = { entityManager: { mutations } } as unknown as RxDB;

/**
 * 构造一个"够用"的 SortableMenuSimple 替身。
 * 写只经过 `save()` / `remove()` / `entityManager.mutations`，不需要真实实体（真实实体要连数据库）。
 */
const makeMenu = (
  id: string,
  parentId: string | null,
  sortOrder: string,
  remove: () => Promise<void> = () => Promise.resolve()
): SortableMenuSimple =>
  ({
    id,
    parentId,
    title: `菜单 ${id}`,
    sortOrder,
    remove: vi.fn(remove),
    save: vi.fn(() => Promise.resolve())
  }) as unknown as SortableMenuSimple;

const createdMenus = (): Record<string, unknown>[] =>
  (SortableMenuSimple as unknown as { created: Record<string, unknown>[] }).created;

describe('useTreeMenuStore', () => {
  beforeEach(() => {
    dbRows = [];
    queries.length = 0;
    createdMenus().length = 0;
    mutations.mockReset().mockResolvedValue(undefined);
    mocks.getEntityMutations.mockClear();
    const statics = SortableMenuSimple as unknown as Record<string, unknown>;
    statics.find = vi.fn((options: QueryOptions) => of(rowsFor(options)));
    statics.findAll = vi.fn((options: QueryOptions) => of(rowsFor(options)));
  });

  afterEach(() => {
    const statics = SortableMenuSimple as unknown as Record<string, unknown>;
    delete statics.find;
    delete statics.findAll;
    vi.restoreAllMocks();
  });

  it('建树顺序 = 查询顺序', () => {
    // 键的字典序与传入（查询）顺序相反：store 若自己再比较排序键，顺序就会翻回去
    const second = makeMenu('second', null, 'a9');
    const first = makeMenu('first', null, 'a1');
    const child2 = makeMenu('child2', 'second', 'a8');
    const child1 = makeMenu('child1', 'second', 'a2');
    const { result } = renderHook(() => useTreeMenuStore([second, first, child2, child1], rxdb));

    act(() => result.current.expandAll());

    expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['second', 'child2', 'child1', 'first']);
  });

  it('查询不传 orderBy', async () => {
    const root = makeMenu('root', null, 'a0');
    dbRows = [makeMenu('child', 'root', 'a0')];
    const { result } = renderHook(() => useTreeMenuStore([root], rxdb));

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
    const makeTrackedMenu = (id: string, parentId: string | null): SortableMenuSimple =>
      makeMenu(id, parentId, 'a0', async () => {
        removed.push(id);
      });
    const root = makeTrackedMenu('root', null);
    const child = makeTrackedMenu('child', 'root');
    const grandchild = makeTrackedMenu('grandchild', 'child');
    dbRows = [child, grandchild];
    const { result } = renderHook(() => useTreeMenuStore([root, child, grandchild], rxdb));

    await act(async () => {
      await result.current.deleteMenu(root);
    });
    await act(async () => {
      await result.current.executeCascadeDelete();
    });

    expect(removed).toEqual(['grandchild', 'child', 'root']);
    expect(result.current.menuToDelete).toBeNull();
  });

  describe('deleteMenu', () => {
    it('库里没有子节点：直接删除，不弹对话框', async () => {
      const leaf = makeMenu('leaf', null, 'a0');
      const { result } = renderHook(() => useTreeMenuStore([leaf], rxdb));

      await act(async () => {
        await result.current.deleteMenu(leaf);
      });

      expect(leaf.remove).toHaveBeenCalledOnce();
      expect(result.current.menuToDelete).toBeNull();
    });

    it('是否弹对话框取自库里的直接子节点，而不是页面已加载的节点', async () => {
      const parent = makeMenu('p', null, 'a0');
      // 页面入参里没有子节点（比如还没加载到），库里有
      dbRows = [makeMenu('c1', 'p', 'a0')];
      const { result } = renderHook(() => useTreeMenuStore([parent], rxdb));

      await act(async () => {
        await result.current.deleteMenu(parent);
      });

      expect(result.current.menuToDelete).toBe(parent);
      expect(parent.remove).not.toHaveBeenCalled();
      expect(queries[0].where?.rules).toEqual([expect.objectContaining({ field: 'parentId', value: 'p' })]);
    });

    it('删除失败时调用方能观察到错误，而不是被吞成悬空 Promise', async () => {
      const remove = vi.fn(() => Promise.reject(new Error('远端拒绝删除')));
      const leaf = makeMenu('leaf', null, 'a0', remove);
      const { result } = renderHook(() => useTreeMenuStore([leaf], rxdb));

      await act(async () => {
        await result.current.deleteMenu(leaf);
      });

      expect(remove).toHaveBeenCalledTimes(1);
      expect(result.current.writeError).toBe('删除失败：远端拒绝删除');
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
      const { result } = renderHook(() => useTreeMenuStore([leaf], rxdb));

      let settled = false;
      let pending: Promise<void> = Promise.resolve();
      await act(async () => {
        pending = result.current.deleteMenu(leaf).then(() => {
          settled = true;
        });
        await Promise.resolve();
      });
      expect(settled).toBe(false);

      await act(async () => {
        settle?.();
        await pending;
      });
      expect(settled).toBe(true);
      expect(result.current.writeError).toBeNull();
    });
  });

  describe('executePromoteChildrenDelete（删除并提升子节点）', () => {
    it('子节点取自库，只改 parentId，一次 mutations 提交，不逐条 save / remove', async () => {
      const grand = makeMenu('g', null, 'a0');
      const parent = makeMenu('p', 'g', 'a0');
      const c1 = makeMenu('c1', 'p', 'a0');
      const c2 = makeMenu('c2', 'p', 'a1');
      // 页面入参里只有 parent（子节点未加载），库里有 c1、c2
      dbRows = [c1, c2];
      const { result } = renderHook(() => useTreeMenuStore([grand, parent], rxdb));
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
      expect([c1.sortOrder, c2.sortOrder]).toEqual(['a0', 'a1']);
      expect(c1.save).not.toHaveBeenCalled();
      expect(parent.remove).not.toHaveBeenCalled();
      expect(result.current.menuToDelete).toBeNull();
      expect(result.current.writeError).toBeNull();
    });

    it('提交失败：写入「删除并提升子节点失败」，对话框关闭，不抛出', async () => {
      const parent = makeMenu('p', null, 'a0');
      dbRows = [makeMenu('c1', 'p', 'a0')];
      mutations.mockRejectedValueOnce(new Error('事务回滚'));
      const { result } = renderHook(() => useTreeMenuStore([parent], rxdb));
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
    const root = makeMenu('root', null, 'a0', () => Promise.reject(new Error('被外键拦下')));
    const child = makeMenu('child', 'root', 'a0');
    dbRows = [child];
    const { result } = renderHook(() => useTreeMenuStore([root, child], rxdb));
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
    it('addRoot 只赋业务字段，不带 sortOrder，不读同级', async () => {
      const existing = makeMenu('a', null, 'a0');
      const { result } = renderHook(() => useTreeMenuStore([existing], rxdb));

      await act(async () => {
        await result.current.addRoot('新根');
      });

      const created = createdMenus().at(-1) as Record<string, unknown>;
      expect(created['title']).toBe('新根');
      expect(created['parentId']).toBeNull();
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(queries).toEqual([]);
    });

    it('addChild 带 parentId、不带 sortOrder，不读同级', async () => {
      const parent = makeMenu('p', null, 'a0');
      const sibling = makeMenu('c1', 'p', 'a5');
      const { result } = renderHook(() => useTreeMenuStore([parent, sibling], rxdb));

      await act(async () => {
        await result.current.addChild(parent, '新子菜单');
      });

      const created = createdMenus().at(-1) as Record<string, unknown>;
      expect(created['parentId']).toBe('p');
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(queries).toEqual([]);
      expect(result.current.expandedIds.has('p')).toBe(true);
    });

    it('addRoot / addChild 保存失败：写入「新建失败」且不抛出，页面状态不被推进', async () => {
      const parent = makeMenu('p', null, 'a0');
      vi.spyOn(SortableMenuSimple.prototype, 'save').mockRejectedValue(new Error('唯一索引冲突'));
      const { result } = renderHook(() => useTreeMenuStore([parent], rxdb));

      await act(async () => {
        await result.current.addRoot('重名');
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');

      act(() => result.current.clearWriteError());
      await act(async () => {
        await result.current.addChild(parent, '重名');
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.expandedIds.has('p')).toBe(false);
    });
  });

  it('重命名失败：runWrite 把失败写入「重命名失败」，返回未成功', async () => {
    const { result } = renderHook(() => useTreeMenuStore([], rxdb));

    let outcome: Awaited<ReturnType<typeof result.current.runWrite<boolean>>> | undefined;
    await act(async () => {
      outcome = await result.current.runWrite('重命名', () => Promise.reject(new Error('同级重名')));
    });

    expect(outcome).toEqual({ ok: false });
    expect(result.current.writeError).toBe('重命名失败：同级重名');
    act(() => result.current.clearWriteError());
    expect(result.current.writeError).toBeNull();
  });

  describe('expandedIds 与异步数据', () => {
    it('menus 异步到达后应补齐父节点展开状态', () => {
      const parent = makeMenu('p', null, 'a0');
      const child = makeMenu('c', 'p', 'a0');

      const { result, rerender } = renderHook(({ menus }) => useTreeMenuStore(menus, rxdb), {
        initialProps: { menus: [] as SortableMenuSimple[] }
      });
      expect(result.current.treeNodes).toHaveLength(0);

      rerender({ menus: [parent, child] });

      expect(result.current.treeNodes.map(node => node.menu.id)).toEqual(['p', 'c']);
    });

    it('用户手动折叠后，后续数据更新不得把它重新展开', () => {
      const parent = makeMenu('p', null, 'a0');
      const child = makeMenu('c', 'p', 'a0');
      const later = makeMenu('later', null, 'a1');

      const { result, rerender } = renderHook(({ menus }) => useTreeMenuStore(menus, rxdb), {
        initialProps: { menus: [] as SortableMenuSimple[] }
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
