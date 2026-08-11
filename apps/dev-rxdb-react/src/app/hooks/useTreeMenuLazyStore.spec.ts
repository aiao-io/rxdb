import type { RxDB, UUID } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBatchMenus } from '../utils/menu-utils';
import { menuLargeTreeSource, type TreeMenuLazySource, useTreeMenuLazyStore } from './useTreeMenuLazyStore';

vi.mock('../utils/menu-utils', () => ({
  generateBatchMenus: vi.fn(() => [])
}));

/**
 * 真实的 `MenuLarge` 构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **发了哪些查询、写了什么**，不是实体装配，所以换成同形状的替身。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class MenuLargeDouble {
    id: string;
    parentId: string | null = null;
    title?: string;
    sortOrder?: string | null;
    hasChildren = false;
    constructor(data: { title?: string; sortOrder?: string | null } = {}) {
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
  return { MenuLarge: MenuLargeDouble };
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

/**
 * 一个"够用"的 MenuLarge 替身：store 只读 id/parentId/title/sortOrder/hasChildren，
 * 写只经过 entityManager 与 save()/remove()。真实实体要连数据库，这里不需要。
 */
const makeMenu = (id: string, parentId: string | null, sortOrder: string): MenuLarge =>
  ({
    id: toUuid(id),
    parentId: parentId === null ? null : toUuid(parentId),
    title: `菜单 ${id}`,
    sortOrder,
    hasChildren: false,
    save: () => Promise.resolve(),
    remove: () => Promise.resolve()
  }) as unknown as MenuLarge;

/**
 * 极小的内存假仓储。它让断言落在**行为**上（删干净了没、拿到的同级对不对），
 * 而不是落在"调了哪个方法"上 —— 后者换个等价实现就会假红。
 *
 * 唯一被当作调用形状来断言的，是 P0-1 本身：**不许出现无过滤的 `findAll`**。
 * `findAll` 没有 limit（见 `FindAllOptions`），配空 `rules` 就是整表；
 * `find` 天然带 limit，因此有界。
 */
class FakeMenuTable {
  rows: MenuLarge[] = [];
  readonly calls: QueryCall[] = [];

  install(): void {
    const statics = MenuLarge as unknown as Record<string, unknown>;
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
    const statics = MenuLarge as unknown as Record<string, unknown>;
    delete statics.findAll;
    delete statics.find;
    delete statics.findDescendants;
  }

  /** 无过滤的 `findAll` —— P0-1 要消灭的就是它。 */
  fullTableScans(): QueryCall[] {
    return this.calls.filter(call => call.method === 'findAll' && (call.options.where?.rules?.length ?? 0) === 0);
  }

  entityManager(): RxDB {
    return {
      entityManager: {
        save: vi.fn(async (entity: MenuLarge) => {
          this.rows.push(entity);
        }),
        saveMany: vi.fn(async (entities: MenuLarge[]) => {
          this.rows.push(...entities);
        }),
        removeMany: vi.fn(async (entities: MenuLarge[]) => {
          const ids = new Set(entities.map(entity => entity.id));
          this.rows = this.rows.filter(row => !ids.has(row.id));
        })
      }
    } as unknown as RxDB;
  }

  private descendantsOf(id: UUID): MenuLarge[] {
    const out: MenuLarge[] = [];
    const walk = (parentId: UUID): void => {
      for (const row of this.rows.filter(r => r.parentId === parentId)) {
        out.push(row);
        walk(row.id);
      }
    };
    walk(id);
    return out;
  }

  private rowsFor(options: QueryOptions): MenuLarge[] {
    const rule = options.where?.rules?.find(r => r.field === 'parentId');
    const matched =
      rule === undefined ? [...this.rows] : this.rows.filter(row => (row.parentId ?? null) === (rule.value ?? null));
    const sorted = matched.sort((a, b) => (a.sortOrder ?? '').localeCompare(b.sortOrder ?? ''));
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
    vi.mocked(generateBatchMenus).mockClear();
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
          new Observable<MenuLarge[]>(subscriber => {
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

  /**
   * APP-dev-rxdb-react P0-1：页面此前靠 `useFindAll(MenuLarge, { rules: [] })` 拿一份全表数组，
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

    it('addManyMenus(count) 不接受数组，只按序取最后一个根节点', async () => {
      table.rows = [makeMenu('a', null, 'a0'), makeMenu('b', null, 'a2'), makeMenu('c', 'a', 'a0')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.addManyMenus(5);
      });

      const [count, , existingRoots] = vi.mocked(generateBatchMenus).mock.calls[0];
      expect(count).toBe(5);
      expect((existingRoots as MenuLarge[]).at(-1)?.sortOrder).toBe('a2');
      expect(table.fullTableScans()).toEqual([]);
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

    it('addChild 只查同级，排在同级末尾之后', async () => {
      const parent = makeMenu('p', null, 'a0');
      table.rows = [parent, makeMenu('c1', 'p', 'a0'), makeMenu('c2', 'p', 'a5'), makeMenu('other', null, 'a1')];

      const { result } = renderHook(() => useTreeMenuLazyStore(rxdb, menuLargeTreeSource));
      await act(async () => {
        await result.current.addChild(parent, '新子菜单');
      });

      const created = table.rows.find(row => row.title === '新子菜单');
      expect((created?.sortOrder ?? '') > 'a5').toBe(true);
      expect(table.fullTableScans()).toEqual([]);
    });
  });
});
