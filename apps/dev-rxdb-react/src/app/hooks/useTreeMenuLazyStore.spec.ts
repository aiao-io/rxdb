import type { RxDB, UUID } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBatchMenus } from '../utils/menu-utils';
import { menuLargeTreeSource, type TreeMenuLazySource, useTreeMenuLazyStore } from './useTreeMenuLazyStore';

vi.mock('../utils/menu-utils', () => ({
  generateBatchMenus: vi.fn(() => [])
}));

const mocks = vi.hoisted(() => ({
  getEntityMutations: vi.fn((options: unknown) => ({ mutationsOf: options }))
}));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: mocks.getEntityMutations,
  // 替身没有实体状态：失败时退回 parentId 后按剩余差异重算 modified，这里给一份空差异
  getEntityStatus: () => ({ patch: {}, modified: false })
}));

/**
 * 真实的 `SortableMenuLarge` 构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **发了哪些查询、写了什么**，不是实体装配，所以换成同形状的替身。
 * 替身不声明 `sortOrder` 字段：store 若赋了它，`Object.keys` 里就会出现。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class SortableMenuLargeDouble {
    id: string;
    parentId: string | null = null;
    hasChildren = false;
    constructor(data: { title?: string } = {}) {
      seq += 1;
      this.id = `new${seq}-0000-0000-0000-000000000000`;
      Object.assign(this, data);
    }
    save(): Promise<void> {
      return Promise.resolve();
    }
    remove(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { SortableMenuLarge: SortableMenuLargeDouble };
});

interface QueryOptions {
  where?: { combinator?: string; rules?: { field: string; operator: string; value: unknown }[] };
  orderBy?: { field: string; sort: string }[];
  limit?: number;
  entityId?: unknown;
  level?: number;
}

interface QueryCall {
  method: 'find' | 'findAll' | 'findDescendants';
  options: QueryOptions;
}

const toUuid = (id: string): UUID => `${id}-0000-0000-0000-000000000000`;

/** 引擎在查询不传 `orderBy` 时补的默认排序：同组按 `sortOrder`、再按 `id`。 */
const byEngineDefaultOrder = (a: SortableMenuLarge, b: SortableMenuLarge): number => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

/**
 * 一个"够用"的 SortableMenuLarge 替身：store 只读 id/parentId/title/sortOrder/hasChildren，
 * 写只经过 entityManager 与 save()/remove()。真实实体要连数据库，这里不需要。
 */
const makeMenu = (id: string, parentId: string | null, sortOrder: string): SortableMenuLarge =>
  ({
    id: toUuid(id),
    parentId: parentId === null ? null : toUuid(parentId),
    title: `菜单 ${id}`,
    sortOrder,
    hasChildren: false,
    save: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve())
  }) as unknown as SortableMenuLarge;

/**
 * 极小的内存假仓储。它让断言落在**行为**上（删干净了没、拿到的同级对不对），
 * 而不是落在"调了哪个方法"上 —— 后者换个等价实现就会假红。
 *
 * 唯一被当作调用形状来断言的，是 P0-1 本身：**不许出现无过滤的 `findAll`**。
 * `findAll` 没有 limit（见 `FindAllOptions`），配空 `rules` 就是整表；
 * `find` 天然带 limit，因此有界。
 */
class FakeMenuTable {
  private rxdb: RxDB | null = null;
  rows: SortableMenuLarge[] = [];
  readonly calls: QueryCall[] = [];
  /**
   * 查询返回行的顺序：`'engine'` 模拟引擎默认排序；`'insertion'` 按 `rows` 的写入顺序原样返回，
   * 用来断言 store 建树时不再自己比较排序键（顺序 = 查询顺序）。
   */
  queryOrder: 'engine' | 'insertion' = 'engine';
  /** `entityManager()` 返回的假实体管理器里的写方法，断言「发了哪些写」用。 */
  get writes() {
    return (this.rxdb as unknown as { entityManager: Record<string, ReturnType<typeof vi.fn>> }).entityManager;
  }

  install(): void {
    const statics = SortableMenuLarge as unknown as Record<string, unknown>;
    statics.findAll = vi.fn((options: QueryOptions) => {
      this.calls.push({ method: 'findAll', options });
      return of(this.rowsFor(options));
    });
    statics.find = vi.fn((options: QueryOptions) => {
      this.calls.push({ method: 'find', options });
      return of(this.rowsFor(options));
    });
    statics.findDescendants = vi.fn((options: QueryOptions) => {
      this.calls.push({ method: 'findDescendants', options });
      return of(this.descendantsOf(options.entityId as UUID));
    });
  }

  uninstall(): void {
    const statics = SortableMenuLarge as unknown as Record<string, unknown>;
    delete statics.findAll;
    delete statics.find;
    delete statics.findDescendants;
  }

  /** 无过滤的 `findAll` —— P0-1 要消灭的就是它。 */
  fullTableScans(): QueryCall[] {
    return this.calls.filter(call => call.method === 'findAll' && (call.options.where?.rules?.length ?? 0) === 0);
  }

  entityManager(): RxDB {
    this.rxdb = this.buildEntityManager();
    return this.rxdb;
  }

  private buildEntityManager(): RxDB {
    return {
      entityManager: {
        save: vi.fn(async (entity: SortableMenuLarge) => {
          this.rows.push(entity);
        }),
        saveMany: vi.fn(async (entities: SortableMenuLarge[]) => {
          this.rows.push(...entities);
        }),
        removeMany: vi.fn(async (entities: SortableMenuLarge[]) => {
          const ids = new Set(entities.map(entity => entity.id));
          this.rows = this.rows.filter(row => !ids.has(row.id));
        }),
        mutations: vi.fn((): Promise<void> => Promise.resolve())
      }
    } as unknown as RxDB;
  }

  private descendantsOf(id: UUID): SortableMenuLarge[] {
    const out: SortableMenuLarge[] = [];
    const walk = (parentId: UUID): void => {
      for (const row of this.rows.filter(r => r.parentId === parentId)) {
        out.push(row);
        walk(row.id);
      }
    };
    walk(id);
    return out;
  }

  private rowsFor(options: QueryOptions): SortableMenuLarge[] {
    const rule = options.where?.rules?.find(r => r.field === 'parentId');
    const matched =
      rule === undefined ? [...this.rows] : this.rows.filter(row => (row.parentId ?? null) === (rule.value ?? null));
    const sorted = this.queryOrder === 'engine' ? matched.sort(byEngineDefaultOrder) : matched;
    const ordered = options.orderBy?.[0]?.sort === 'desc' ? sorted.reverse() : sorted;
    return options.limit === undefined ? ordered : ordered.slice(0, options.limit);
  }
}

describe('useTreeMenuLazyStore', () => {
  let table: FakeMenuTable;
  let rxdb: RxDB;

  beforeEach(() => {
    table = new FakeMenuTable();
    table.install();
    rxdb = table.entityManager();
    vi.mocked(generateBatchMenus).mockReset().mockReturnValue([]);
    mocks.getEntityMutations.mockClear();
  });

  afterEach(() => {
    table.uninstall();
  });

  it('查询源变化时取消旧根订阅并订阅新源', () => {
    const firstUnsubscribe = vi.fn();
    const firstSource: TreeMenuLazySource = {
      ...menuLargeTreeSource,
      findRoots: vi.fn(
        () =>
          new Observable<SortableMenuLarge[]>(subscriber => {
            subscriber.next([]);
            return firstUnsubscribe;
          })
      )
    };
    const secondSource: TreeMenuLazySource = {
      ...menuLargeTreeSource,
      findRoots: vi.fn(() => of([]))
    };

    const { rerender } = renderHook(({ source }) => useTreeMenuLazyStore(rxdb, source), {
      initialProps: { source: firstSource }
    });
    rerender({ source: secondSource });

    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(secondSource.findRoots).toHaveBeenCalledOnce();
  });

  /** US-031 阶段 B：手动顺序只有一个来源——查询的默认排序。 */
  describe('显示顺序取自查询默认排序', () => {
    it('查询不传 orderBy', async () => {
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [parent, makeMenu('c1', 'p', 'a0')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.toggleExpand(parent.id);
      });
      act(() => result.current.expandAll());
      await act(async () => {
        await result.current.deleteMenu(parent);
      });

      // 根订阅、展开子节点订阅、展开全部、按父节点读子节点：四种查询一个都不带显式排序
      expect(table.calls.length).toBeGreaterThanOrEqual(4);
      expect(table.calls.map(call => call.options.orderBy)).toEqual(table.calls.map(() => undefined));
    });

    it('建树顺序 = 查询顺序', async () => {
      // 键的字典序与查询给出的顺序相反：store 若自己再比较排序键，顺序就会翻回去
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.queryOrder = 'insertion';
      table.rows = [
        makeMenu('r2', null, 'a5'),
        parent,
        makeMenu('c2', 'p', 'a9'),
        makeMenu('c1', 'p', 'a1'),
        makeMenu('r1', null, 'a1')
      ];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.toggleExpand(parent.id);
      });

      expect(result.current.treeNodes.map(node => node.menu.title)).toEqual([
        '菜单 r2',
        '菜单 p',
        '菜单 c2',
        '菜单 c1',
        '菜单 r1'
      ]);
    });

    it('getGroupIds：根组与已展开的组各是整组 id 序列，未加载的组直接报错', async () => {
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [parent, makeMenu('r', null, 'a1'), makeMenu('c1', 'p', 'a0'), makeMenu('c2', 'p', 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      expect(() => result.current.getGroupIds(parent.id)).toThrow('尚未加载');
      await act(async () => {
        await result.current.toggleExpand(parent.id);
      });

      expect(result.current.getGroupIds(null)).toEqual([parent.id, toUuid('r')]);
      expect(result.current.getGroupIds(parent.id)).toEqual([toUuid('c1'), toUuid('c2')]);
    });
  });

  /**
   * APP-dev-rxdb-react P0-1：页面此前靠 `useFindAll(SortableMenuLarge, { rules: [] })` 拿一份全表数组，
   * 再把它喂给六个下游。懒加载页面的存在意义正是"不加载整棵树"，这份订阅把它整个抵消了。
   * 下面每条锁一个下游：它要的那份数据必须由 store 自己有界地取到。
   */
  describe('不得依赖全表数组（P0-1）', () => {
    it('页面取父节点标题不必持有全表 —— store 暴露已加载节点', () => {
      table.rows = [makeMenu('a', null, 'a0'), makeMenu('b', null, 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));

      expect(result.current.getNode(toUuid('a'))?.title).toBe('菜单 a');
      expect(result.current.getNode(toUuid('missing'))).toBeUndefined();
    });

    it('deleteAllMenus() 不接受数组也要能删空整表', async () => {
      table.rows = [makeMenu('a', null, 'a0'), makeMenu('b', null, 'a1'), makeMenu('c', 'a', 'a0')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteAllMenus();
      });

      expect(table.rows).toEqual([]);
      expect(table.fullTableScans()).toEqual([]);
    });

    it('addManyMenus(count) 不接受数组也不读根节点：一次 saveMany，生成器不收已有根节点', async () => {
      table.rows = [makeMenu('a', null, 'a0'), makeMenu('b', null, 'a2'), makeMenu('c', 'a', 'a0')];
      const batch = [makeMenu('n1', null, ''), makeMenu('n2', 'n1', '')];
      vi.mocked(generateBatchMenus).mockReturnValue(batch);

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      table.calls.length = 0;
      await act(async () => {
        await result.current.addManyMenus(5);
      });

      expect(vi.mocked(generateBatchMenus)).toHaveBeenCalledExactlyOnceWith(5, SortableMenuLarge);
      expect(table.writes['saveMany']).toHaveBeenCalledExactlyOnceWith(batch);
      expect(table.writes['save']).not.toHaveBeenCalled();
      expect(table.calls).toEqual([]);
    });

    it('addManyMenus 失败：写入「批量添加失败」且不抛出', async () => {
      vi.mocked(generateBatchMenus).mockReturnValue([makeMenu('n1', null, '')]);
      table.writes['saveMany'].mockRejectedValueOnce(new Error('唯一索引冲突'));

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.addManyMenus(1);
      });

      expect(result.current.writeError).toBe('批量添加失败：唯一索引冲突');
    });

    it('级联删除只查目标子树，不扫全表', async () => {
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [parent, makeMenu('c1', 'p', 'a0'), makeMenu('g1', 'c1', 'a0'), makeMenu('other', null, 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(parent);
      });
      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(table.rows.map(row => row.title)).toEqual(['菜单 other']);
      expect(table.fullTableScans()).toEqual([]);
    });

    it('addChild（父节点已展开）不查同级、不写 sortOrder：只赋业务字段与 parentId', async () => {
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [parent, makeMenu('c1', 'p', 'a0'), makeMenu('c2', 'p', 'a5'), makeMenu('other', null, 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.toggleExpand(parent.id);
      });
      table.calls.length = 0;
      await act(async () => {
        expect(await result.current.addChild(parent, '新子菜单')).toBe(true);
      });

      const created = table.rows.find(row => row.title === '新子菜单') as unknown as Record<string, unknown>;
      expect(created['parentId']).toBe(parent.id);
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(table.calls).toEqual([]);
    });

    it('addChild（父节点折叠、子节点未加载）不读尾键；只订阅该父节点的子节点，展开后新旧子节点都在', async () => {
      const parent = makeMenu('p', null, 'a0');
      (parent as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [parent, makeMenu('c1', 'p', 'a0'), makeMenu('c2', 'p', 'a5')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      table.calls.length = 0;
      await act(async () => {
        expect(await result.current.addChild(parent, '新子菜单')).toBe(true);
      });

      const created = table.rows.find(row => row.title === '新子菜单') as unknown as Record<string, unknown>;
      expect(Object.keys(created)).not.toContain('sortOrder');
      // 没有取同级尾键的 `find`（limit + desc），只有展开该父节点的子节点订阅
      expect(table.calls.filter(call => call.method === 'find')).toEqual([]);
      expect(table.calls.map(call => call.options.orderBy?.[0]?.sort)).not.toContain('desc');
      expect(result.current.expandedIds.has(parent.id)).toBe(true);
      expect(result.current.treeNodes.map(node => node.menu.title).sort()).toEqual(
        ['菜单 c1', '菜单 c2', '菜单 p', '新子菜单'].sort()
      );
    });

    it('addRoot 不查同级、不写 sortOrder', async () => {
      table.rows = [makeMenu('a', null, 'a0')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      table.calls.length = 0;
      await act(async () => {
        expect(await result.current.addRoot('新根')).toBe(true);
      });

      const created = table.rows.find(row => row.title === '新根') as unknown as Record<string, unknown>;
      expect(created['parentId']).toBeNull();
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(table.calls).toEqual([]);
    });
  });

  describe('写入失败进入 writeError', () => {
    it('addRoot / addChild 保存失败：写入「新建失败」且不抛出，本地状态不被推进', async () => {
      const parent = makeMenu('p', null, 'a0');
      table.writes['save'].mockRejectedValue(new Error('唯一索引冲突'));

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        expect(await result.current.addRoot('重名')).toBe(false);
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.treeNodes).toEqual([]);

      act(() => result.current.clearWriteError());
      await act(async () => {
        expect(await result.current.addChild(parent, '重名')).toBe(false);
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.expandedIds.has(parent.id)).toBe(false);
    });

    it('重命名失败：runWrite 把失败写入「重命名失败」', async () => {
      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));

      await act(async () => {
        await result.current.runWrite('重命名', () => Promise.reject(new Error('同级重名')));
      });

      expect(result.current.writeError).toBe('重命名失败：同级重名');
    });

    it('级联删除失败：写入「级联删除失败」，对话框关闭', async () => {
      const parent = makeMenu('p', null, 'a0');
      table.rows = [parent, makeMenu('c1', 'p', 'a0')];
      table.writes['removeMany'].mockRejectedValueOnce(new Error('被外键拦下'));

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(parent);
      });
      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(result.current.writeError).toBe('级联删除失败：被外键拦下');
      expect(result.current.menuToDelete).toBeNull();
    });
  });

  describe('删除：对话框与提升取自库（US-031）', () => {
    it('折叠节点（页面未加载子节点、hasChildren 为假）删除时仍弹对话框，影响数取自库', async () => {
      const collapsed = makeMenu('p', null, 'a0');
      table.rows = [collapsed, makeMenu('c1', 'p', 'a0'), makeMenu('c2', 'p', 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(collapsed);
      });

      expect(result.current.menuToDelete).toBe(collapsed);
      expect(result.current.deleteImpact?.childrenCount).toBe(2);
      expect(collapsed.remove).not.toHaveBeenCalled();
    });

    it('库里没有子节点：直接删除，不弹对话框', async () => {
      const leaf = makeMenu('leaf', null, 'a0');
      table.rows = [leaf];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(leaf);
      });

      expect(leaf.remove).toHaveBeenCalledOnce();
      expect(result.current.menuToDelete).toBeNull();
    });

    it('叶子删除失败：写入「删除失败」', async () => {
      const leaf = makeMenu('leaf', null, 'a0');
      leaf.remove = vi.fn(() => Promise.reject(new Error('远端拒绝删除')));
      table.rows = [leaf];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(leaf);
      });

      expect(result.current.writeError).toBe('删除失败：远端拒绝删除');
    });

    it('删除并提升：子节点按 parentId 取自库，只改 parentId，一次 mutations，不逐条 save / remove', async () => {
      const grand = makeMenu('g', null, 'a0');
      const parent = makeMenu('p', 'g', 'a0');
      const c1 = makeMenu('c1', 'p', 'a0');
      const c2 = makeMenu('c2', 'p', 'a1');
      table.rows = [grand, parent, c1, c2];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
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
      expect(table.writes['mutations']).toHaveBeenCalledOnce();
      expect([c1.parentId, c2.parentId]).toEqual([grand.id, grand.id]);
      expect([c1.sortOrder, c2.sortOrder]).toEqual(['a0', 'a1']);
      expect(c1.save).not.toHaveBeenCalled();
      expect(parent.remove).not.toHaveBeenCalled();
      expect(result.current.menuToDelete).toBeNull();
      expect(result.current.writeError).toBeNull();
    });

    it('删除并提升失败：写入「删除并提升子节点失败」，对话框关闭', async () => {
      const parent = makeMenu('p', null, 'a0');
      const child = makeMenu('c1', 'p', 'a0');
      table.rows = [parent, child];
      table.writes['mutations'].mockRejectedValueOnce(new Error('事务回滚'));

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.deleteMenu(parent);
      });
      await act(async () => {
        await result.current.executePromoteChildrenDelete();
      });

      expect(result.current.writeError).toBe('删除并提升子节点失败：事务回滚');
      expect(result.current.menuToDelete).toBeNull();
      // 共享实例上不留失败的移动
      expect(child.parentId).toBe(parent.id);
    });
  });

  describe('展开与新建的并发（M6）', () => {
    const holdNextSave = () => {
      const gate = { release: () => undefined as void };
      table.writes['save'].mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            gate.release = resolve;
          })
      );
      return gate;
    };

    it('addChild 保存往返期间用户展开了别的节点：该展开不被陈旧闭包覆盖', async () => {
      const [p, q] = [makeMenu('p', null, 'a0'), makeMenu('q', null, 'a1')];
      (q as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [p, q, makeMenu('qc', 'q', 'a0')];
      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      const gate = holdNextSave();

      let adding: Promise<boolean> = Promise.resolve(false);
      act(() => {
        adding = result.current.addChild(p, '新建');
      });
      await act(async () => {
        await result.current.toggleExpand(q.id);
      });
      await act(async () => {
        gate.release();
        await adding;
      });

      expect(result.current.expandedIds.has(q.id)).toBe(true);
      expect(result.current.expandedIds.has(p.id)).toBe(true);
    });

    it('addChild 保存期间父节点已被展开：不重复订阅其子节点', async () => {
      const p = makeMenu('p', null, 'a0');
      (p as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [p, makeMenu('c1', 'p', 'a0')];
      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      const gate = holdNextSave();

      let adding: Promise<boolean> = Promise.resolve(false);
      act(() => {
        adding = result.current.addChild(p, '新建');
      });
      await act(async () => {
        await result.current.toggleExpand(p.id);
      });
      table.calls.length = 0;
      await act(async () => {
        gate.release();
        await adding;
      });

      const childSubscriptions = table.calls.filter(
        call => call.method === 'findAll' && call.options.where?.rules?.[0]?.value === p.id
      );
      expect(childSubscriptions).toEqual([]);
    });
  });

  describe('删除全部走 runWrite（M7）', () => {
    it('deleteAllMenus 失败：写入「删除全部失败」，不抛出', async () => {
      table.rows = [makeMenu('a', null, 'a0')];
      table.writes['removeMany'].mockRejectedValueOnce(new Error('被外键拦下'));
      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));

      await act(async () => {
        await result.current.deleteAllMenus();
      });

      expect(result.current.writeError).toBe('删除全部失败：被外键拦下');
    });
  });
});
