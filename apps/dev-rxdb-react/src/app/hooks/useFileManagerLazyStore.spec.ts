import type { RxDB, UUID } from '@aiao/rxdb';
import { SortableFileLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SortMode } from '../utils/file-sorters';
import { useFileManagerLazyStore } from './useFileManagerLazyStore';

/**
 * 真实的 `SortableFileLarge` 构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **发了哪些查询、写了什么**，不是实体装配，所以换成同形状的替身。
 * 替身不声明 `sortOrder` 字段：store 若赋了它，`Object.keys` 里就会出现。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class SortableFileLargeDouble {
    id: string;
    parentId: string | null = null;
    hasChildren = false;
    constructor(data: Record<string, unknown> = {}) {
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
  return { SortableFileLarge: SortableFileLargeDouble };
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
const byEngineDefaultOrder = (a: SortableFileLarge, b: SortableFileLarge): number => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

const makeFile = (id: string, parentId: string | null, sortOrder: string, type: 'file' | 'folder'): SortableFileLarge =>
  ({
    id: toUuid(id),
    parentId: parentId === null ? null : toUuid(parentId),
    name: `节点 ${id}`,
    type,
    sortOrder,
    hasChildren: false,
    save: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve())
  }) as unknown as SortableFileLarge;

/** 与 `useTreeMenuLazyStore.spec.ts` 同构的内存假仓储，说明见该文件。 */
class FakeFileTable {
  private rxdb: RxDB | null = null;
  rows: SortableFileLarge[] = [];
  readonly calls: QueryCall[] = [];
  /** `'engine'` 模拟引擎默认排序；`'insertion'` 按 `rows` 的写入顺序原样返回（见 `useTreeMenuLazyStore.spec.ts`）。 */
  queryOrder: 'engine' | 'insertion' = 'engine';
  /** `entityManager()` 返回的假实体管理器里的写方法，断言「发了哪些写」用。 */
  get writes() {
    return (this.rxdb as unknown as { entityManager: Record<string, ReturnType<typeof vi.fn>> }).entityManager;
  }

  install(): void {
    const statics = SortableFileLarge as unknown as Record<string, unknown>;
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
    const statics = SortableFileLarge as unknown as Record<string, unknown>;
    delete statics.findAll;
    delete statics.find;
    delete statics.findDescendants;
  }

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
        save: vi.fn(async (entity: SortableFileLarge) => {
          this.rows.push(entity);
        }),
        saveMany: vi.fn(async (entities: SortableFileLarge[]) => {
          this.rows.push(...entities);
        }),
        removeMany: vi.fn(async (entities: SortableFileLarge[]) => {
          const ids = new Set(entities.map(entity => entity.id));
          this.rows = this.rows.filter(row => !ids.has(row.id));
        })
      }
    } as unknown as RxDB;
  }

  private descendantsOf(id: UUID): SortableFileLarge[] {
    const out: SortableFileLarge[] = [];
    const walk = (parentId: UUID): void => {
      for (const row of this.rows.filter(r => r.parentId === parentId)) {
        out.push(row);
        walk(row.id);
      }
    };
    walk(id);
    return out;
  }

  private rowsFor(options: QueryOptions): SortableFileLarge[] {
    const rule = options.where?.rules?.find(r => r.field === 'parentId');
    const matched =
      rule === undefined ? [...this.rows] : this.rows.filter(row => (row.parentId ?? null) === (rule.value ?? null));
    const sorted = this.queryOrder === 'engine' ? matched.sort(byEngineDefaultOrder) : matched;
    const ordered = options.orderBy?.[0]?.sort === 'desc' ? sorted.reverse() : sorted;
    return options.limit === undefined ? ordered : ordered.slice(0, options.limit);
  }
}

describe('useFileManagerLazyStore', () => {
  let table: FakeFileTable;
  let rxdb: RxDB;

  beforeEach(() => {
    table = new FakeFileTable();
    table.install();
    rxdb = table.entityManager();
  });

  afterEach(() => {
    table.uninstall();
  });

  /** APP-dev-rxdb-react P0-1，与 `useTreeMenuLazyStore` 同一条：见该文件的说明。 */
  describe('不得依赖全表数组（P0-1）', () => {
    it('页面取所在文件夹名不必持有全表 —— store 暴露已加载节点', () => {
      table.rows = [makeFile('a', null, 'a0', 'folder'), makeFile('b', null, 'a1', 'file')];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      expect(result.current.getNode(toUuid('a'))?.name).toBe('节点 a');
      expect(result.current.getNode(toUuid('missing'))).toBeUndefined();
    });

    it('deleteAllFiles() 不接受数组也要能删空整表', async () => {
      table.rows = [
        makeFile('a', null, 'a0', 'folder'),
        makeFile('b', null, 'a1', 'file'),
        makeFile('c', 'a', 'a0', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.deleteAllFiles();
      });

      expect(table.rows).toEqual([]);
      expect(table.fullTableScans()).toEqual([]);
    });

    it('级联删除只查目标子树，不扫全表', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      (folder as { hasChildren?: boolean }).hasChildren = true;
      table.rows = [
        folder,
        makeFile('c1', 'p', 'a0', 'folder'),
        makeFile('g1', 'c1', 'a0', 'file'),
        makeFile('other', null, 'a1', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });
      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(table.rows.map(row => row.name)).toEqual(['节点 other']);
      expect(table.fullTableScans()).toEqual([]);
    });

    it('addChild（父节点已展开）不查同级、不写 sortOrder：只赋业务字段与 parentId', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [
        folder,
        makeFile('c1', 'p', 'a0', 'file'),
        makeFile('c2', 'p', 'a5', 'file'),
        makeFile('other', null, 'a1', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.toggleExpand(folder.id);
      });
      table.calls.length = 0;
      await act(async () => {
        expect(await result.current.addChild(folder, '新文件', 'file', 'txt')).toBe(true);
      });

      const created = table.rows.find(row => row.name?.startsWith('新文件')) as unknown as Record<string, unknown>;
      expect(created['parentId']).toBe(folder.id);
      expect(Object.keys(created)).not.toContain('sortOrder');
      expect(table.calls).toEqual([]);
    });

    it('addChild（文件夹折叠、子节点未加载）不读尾键；只订阅该文件夹的子节点，展开后新旧子节点都在', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [folder, makeFile('c1', 'p', 'a0', 'file'), makeFile('c2', 'p', 'a5', 'file')];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      table.calls.length = 0;
      await act(async () => {
        expect(await result.current.addChild(folder, '新文件夹', 'folder')).toBe(true);
      });

      expect(table.calls.filter(call => call.method === 'find')).toEqual([]);
      expect(table.calls.map(call => call.options.orderBy?.[0]?.sort)).not.toContain('desc');
      expect(result.current.expandedIds.has(folder.id)).toBe(true);
      expect(result.current.treeNodes.map(node => node.file.name).sort()).toEqual(
        ['节点 c1', '节点 c2', '节点 p', '新文件夹'].sort()
      );
    });
  });

  describe('显示顺序取自查询默认排序（US-031 阶段 B）', () => {
    it('查询不传 orderBy', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [folder, makeFile('c1', 'p', 'a0', 'file')];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.toggleExpand(folder.id);
      });
      act(() => result.current.expandAll());

      // 根订阅、展开子节点订阅、展开全部：三种查询一个都不带显式排序
      expect(table.calls.length).toBeGreaterThanOrEqual(3);
      expect(table.calls.map(call => call.options.orderBy)).toEqual(table.calls.map(() => undefined));
    });

    it('建树顺序 = 查询顺序', async () => {
      // 手动模式：文件排在文件夹前、键的字典序与查询顺序相反，页面都不得再改
      const folder = makeFile('p', null, 'a0', 'folder');
      table.queryOrder = 'insertion';
      table.rows = [
        makeFile('f2', null, 'a9', 'file'),
        folder,
        makeFile('c2', 'p', 'a9', 'file'),
        makeFile('c1', 'p', 'a1', 'folder'),
        makeFile('f1', null, 'a1', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.toggleExpand(folder.id);
      });

      expect(result.current.sortMode).toBe(SortMode.Manual);
      expect(result.current.treeNodes.map(node => node.file.name)).toEqual([
        '节点 f2',
        '节点 p',
        '节点 c2',
        '节点 c1',
        '节点 f1'
      ]);
    });

    it('展开全部：各组顺序同样是查询顺序', async () => {
      table.queryOrder = 'insertion';
      table.rows = [
        makeFile('f2', null, 'a9', 'file'),
        makeFile('p', null, 'a0', 'folder'),
        makeFile('c2', 'p', 'a9', 'file'),
        makeFile('c1', 'p', 'a1', 'folder')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      act(() => result.current.expandAll());

      expect(result.current.treeNodes.map(node => node.file.name)).toEqual(['节点 f2', '节点 p', '节点 c2', '节点 c1']);
    });

    it('非手动模式仍按比较器排；getGroupIds 始终是手动顺序', async () => {
      table.queryOrder = 'insertion';
      table.rows = [makeFile('b', null, 'a0', 'file'), makeFile('a', null, 'a1', 'file')];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      act(() => result.current.changeSortMode(SortMode.NameAsc));

      expect(result.current.treeNodes.map(node => node.file.name)).toEqual(['节点 a', '节点 b']);
      expect(result.current.getGroupIds(null)).toEqual([toUuid('b'), toUuid('a')]);
    });

    it('空白名称的行不展示，但仍在 getGroupIds 的完整组里（根组与子组）', async () => {
      const folder = makeFile('p', null, 'a1', 'folder');
      const hiddenRoot = Object.assign(makeFile('h', null, 'a2', 'file'), { name: '   ' });
      const hiddenChild = Object.assign(makeFile('hc', 'p', 'a1', 'file'), { name: '   ' });
      table.rows = [
        makeFile('a', null, 'a0', 'file'),
        folder,
        hiddenRoot,
        makeFile('b', null, 'a3', 'file'),
        makeFile('c1', 'p', 'a0', 'file'),
        hiddenChild,
        makeFile('c2', 'p', 'a2', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.toggleExpand(folder.id);
      });

      expect(result.current.treeNodes.map(node => node.file.name)).toEqual([
        '节点 a',
        '节点 p',
        '节点 c1',
        '节点 c2',
        '节点 b'
      ]);
      expect(result.current.getGroupIds(null)).toEqual([toUuid('a'), toUuid('p'), toUuid('h'), toUuid('b')]);
      expect(result.current.getGroupIds(folder.id)).toEqual([toUuid('c1'), toUuid('hc'), toUuid('c2')]);
    });

    it('展开全部：空白名称的行同样留在完整组里', async () => {
      table.rows = [
        makeFile('a', null, 'a0', 'file'),
        Object.assign(makeFile('h', null, 'a1', 'file'), { name: '' }),
        makeFile('b', null, 'a2', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      act(() => result.current.expandAll());

      expect(result.current.treeNodes.map(node => node.file.name)).toEqual(['节点 a', '节点 b']);
      expect(result.current.getGroupIds(null)).toEqual([toUuid('a'), toUuid('h'), toUuid('b')]);
    });
  });

  describe('新建与批量添加不写 sortOrder（US-031）', () => {
    it('根级依次新建文件夹 A、文件 X、文件夹 B：三次保存都只带业务字段，不读根节点，不带 sortOrder', async () => {
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      table.calls.length = 0;

      await act(async () => {
        await result.current.addRoot('A', 'folder');
      });
      await act(async () => {
        await result.current.addRoot('X', 'file', '.txt');
      });
      await act(async () => {
        await result.current.addRoot('B', 'folder');
      });

      const saved = table.writes['save'].mock.calls.map(([entity]) => entity as Record<string, unknown>);
      expect(saved.map(file => [file['name'], file['type']])).toEqual([
        ['A', 'folder'],
        ['X', 'file'],
        ['B', 'folder']
      ]);
      for (const file of saved) expect(Object.keys(file)).not.toContain('sortOrder');
      expect(table.calls).toEqual([]);
    });

    it('addManyFiles：整批一次 saveMany，批内节点不带 sortOrder，不以已加载的根节点作锚点', async () => {
      table.rows = [makeFile('r1', null, 'a0', 'file'), makeFile('r2', null, 'a1', 'folder')];
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.addManyFiles(100);
      });

      expect(table.writes['saveMany']).toHaveBeenCalledOnce();
      expect(table.writes['save']).not.toHaveBeenCalled();
      const batch = table.writes['saveMany'].mock.calls[0][0] as Record<string, unknown>[];
      expect(batch).toHaveLength(100);
      for (const file of batch) expect(Object.keys(file)).not.toContain('sortOrder');
      expect(table.calls.filter(call => call.method === 'find')).toEqual([]);
    });

    it('addManyFiles 失败：写入「批量添加失败」，不抛出，根订阅恢复，下一次操作可用', async () => {
      table.writes['saveMany'].mockRejectedValueOnce(new Error('唯一索引冲突'));
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      table.calls.length = 0;

      await act(async () => {
        await result.current.addManyFiles(10);
      });

      expect(result.current.writeError).toBe('批量添加失败：唯一索引冲突');
      // 失败后重新订阅根节点，页面状态即库里已提交的状态
      expect(table.calls.some(call => call.method === 'findAll')).toBe(true);
    });

    it('addRoot / addChild 保存失败：写入「新建失败」且不抛出，本地状态不被推进', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.writes['save'].mockRejectedValue(new Error('唯一索引冲突'));
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        expect(await result.current.addRoot('重名', 'folder')).toBe(false);
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.treeNodes).toEqual([]);

      act(() => result.current.clearWriteError());
      await act(async () => {
        expect(await result.current.addChild(folder, '重名', 'folder')).toBe(false);
      });
      expect(result.current.writeError).toBe('新建失败：唯一索引冲突');
      expect(result.current.expandedIds.has(folder.id)).toBe(false);
    });
  });

  describe('删除失败进入 writeError（T042）', () => {
    it('executeCascadeDelete 失败：写入「级联删除失败」，关闭对话框让页内提示可见，不抛出', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [folder, makeFile('c1', 'p', 'a0', 'file')];
      table.writes['removeMany'].mockRejectedValueOnce(new Error('被外键拦下'));
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });

      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(result.current.writeError).toBe('级联删除失败：被外键拦下');
      expect(result.current.fileToDelete).toBeNull();
    });

    it('重命名失败：runWrite 把失败写入「重命名失败」', async () => {
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.runWrite('重命名', () => Promise.reject(new Error('同级重名')));
      });

      expect(result.current.writeError).toBe('重命名失败：同级重名');
    });
  });

  describe('删除对话框的影响数取自库', () => {
    const seedCollapsedTree = () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [
        folder,
        makeFile('c1', 'p', 'a0', 'folder'),
        makeFile('c2', 'p', 'a1', 'file'),
        makeFile('g1', 'c1', 'a0', 'file'),
        makeFile('other', null, 'a1', 'file')
      ];
      return folder;
    };

    it('折叠文件夹（子节点未加载）：直接子项数与后代数取自库，级联警告不再是 0', async () => {
      const folder = seedCollapsedTree();
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });

      expect(result.current.fileToDelete).toBe(folder);
      expect(result.current.deleteImpact).toEqual({ childrenCount: 2, descendantsCount: 3 });
      expect(table.calls.every(call => call.options.orderBy === undefined)).toBe(true);
    });

    it('库里没有子节点：影响数为 0', async () => {
      const leaf = makeFile('l', null, 'a0', 'file');
      table.rows = [leaf];
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.showDeleteDialog(leaf);
      });

      expect(result.current.deleteImpact).toEqual({ childrenCount: 0, descendantsCount: 0 });
    });

    it('取消删除：影响数复位', async () => {
      const folder = seedCollapsedTree();
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });

      act(() => result.current.cancelDelete());

      expect(result.current.fileToDelete).toBeNull();
      expect(result.current.deleteImpact).toEqual({ childrenCount: 0, descendantsCount: 0 });
    });

    it('级联删除把对话框时取到的整棵子树经 removeMany 一次提交（子孙先于父）', async () => {
      const folder = seedCollapsedTree();
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });

      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(table.writes['removeMany']).toHaveBeenCalledOnce();
      const removed = table.writes['removeMany'].mock.calls[0][0] as SortableFileLarge[];
      expect(removed.map(file => file.id)).toEqual([toUuid('g1'), toUuid('c1'), toUuid('c2'), toUuid('p')]);
      expect(result.current.fileToDelete).toBeNull();
    });

    it('读库失败：写入「删除失败」，不弹对话框、不抛出', async () => {
      const folder = seedCollapsedTree();
      (SortableFileLarge as unknown as Record<string, unknown>)['findAll'] = vi.fn(() =>
        throwError(() => new Error('库不可读'))
      );
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.showDeleteDialog(folder);
      });

      expect(result.current.writeError).toBe('删除失败：库不可读');
      expect(result.current.fileToDelete).toBeNull();
    });
  });

  describe('展开与新建的并发', () => {
    it('addChild 保存往返期间用户展开了别的文件夹：该展开不被陈旧闭包覆盖', async () => {
      const [p, q] = [makeFile('p', null, 'a0', 'folder'), makeFile('q', null, 'a1', 'folder')];
      table.rows = [p, q, makeFile('qc', 'q', 'a0', 'file')];
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      let releaseSave: () => void = () => undefined;
      table.writes['save'].mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            releaseSave = resolve;
          })
      );

      let adding: Promise<boolean> = Promise.resolve(false);
      act(() => {
        adding = result.current.addChild(p, '新建', 'file');
      });
      await act(async () => {
        await result.current.toggleExpand(q.id);
      });
      await act(async () => {
        releaseSave();
        await adding;
      });

      expect(result.current.expandedIds.has(q.id)).toBe(true);
      expect(result.current.expandedIds.has(p.id)).toBe(true);
    });

    it('addChild 保存期间父节点已被展开：不重复订阅其子节点', async () => {
      const p = makeFile('p', null, 'a0', 'folder');
      table.rows = [p, makeFile('c1', 'p', 'a0', 'file')];
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      let releaseSave: () => void = () => undefined;
      table.writes['save'].mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            releaseSave = resolve;
          })
      );

      let adding: Promise<boolean> = Promise.resolve(false);
      act(() => {
        adding = result.current.addChild(p, '新建', 'file');
      });
      await act(async () => {
        await result.current.toggleExpand(p.id);
      });
      table.calls.length = 0;
      await act(async () => {
        releaseSave();
        await adding;
      });

      const childSubscriptions = table.calls.filter(
        call => call.method === 'findAll' && call.options.where?.rules?.[0]?.value === p.id
      );
      expect(childSubscriptions).toEqual([]);
    });
  });

  describe('删除全部走 runWrite', () => {
    it('deleteAllFiles 失败：写入「删除全部失败」，不抛出', async () => {
      table.rows = [makeFile('a', null, 'a0', 'file')];
      table.writes['removeMany'].mockRejectedValueOnce(new Error('被外键拦下'));
      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));

      await act(async () => {
        await result.current.deleteAllFiles();
      });

      expect(result.current.writeError).toBe('删除全部失败：被外键拦下');
    });
  });
});
