import type { RxDB, UUID } from '@aiao/rxdb';
import { FileLarge } from '@aiao/rxdb-test/entities';
import { act, renderHook } from '@testing-library/react';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileManagerLazyStore } from './useFileManagerLazyStore';

/**
 * 真实的 `FileLarge` 构造函数走装饰器代理，没初始化 RxDB 就抛 `need init rxdb`。
 * 本文件测的是 store **发了哪些查询、写了什么**，不是实体装配，所以换成同形状的替身。
 */
vi.mock('@aiao/rxdb-test/entities', () => {
  let seq = 0;
  class FileLargeDouble {
    id: string;
    parentId: string | null = null;
    name?: string;
    type?: 'file' | 'folder';
    sortOrder?: string | null;
    extension?: string | null;
    size?: number;
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
  return { FileLarge: FileLargeDouble };
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

const makeFile = (id: string, parentId: string | null, sortOrder: string, type: 'file' | 'folder'): FileLarge =>
  ({
    id: toUuid(id),
    parentId: parentId === null ? null : toUuid(parentId),
    name: `节点 ${id}`,
    type,
    sortOrder,
    hasChildren: false,
    save: () => Promise.resolve(),
    remove: () => Promise.resolve()
  }) as unknown as FileLarge;

/** 与 `useTreeMenuLazyStore.spec.ts` 同构的内存假仓储，说明见该文件。 */
class FakeFileTable {
  rows: FileLarge[] = [];
  readonly calls: QueryCall[] = [];

  install(): void {
    const statics = FileLarge as unknown as Record<string, unknown>;
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
    const statics = FileLarge as unknown as Record<string, unknown>;
    delete statics.findAll;
    delete statics.find;
    delete statics.findDescendants;
  }

  fullTableScans(): QueryCall[] {
    return this.calls.filter(call => call.method === 'findAll' && (call.options.where?.rules?.length ?? 0) === 0);
  }

  entityManager(): RxDB {
    return {
      entityManager: {
        save: vi.fn(async (entity: FileLarge) => {
          this.rows.push(entity);
        }),
        saveMany: vi.fn(async (entities: FileLarge[]) => {
          this.rows.push(...entities);
        }),
        removeMany: vi.fn(async (entities: FileLarge[]) => {
          const ids = new Set(entities.map(entity => entity.id));
          this.rows = this.rows.filter(row => !ids.has(row.id));
        })
      }
    } as unknown as RxDB;
  }

  private descendantsOf(id: UUID): FileLarge[] {
    const out: FileLarge[] = [];
    const walk = (parentId: UUID): void => {
      for (const row of this.rows.filter(r => r.parentId === parentId)) {
        out.push(row);
        walk(row.id);
      }
    };
    walk(id);
    return out;
  }

  private rowsFor(options: QueryOptions): FileLarge[] {
    const rule = options.where?.rules?.find(r => r.field === 'parentId');
    const matched =
      rule === undefined ? [...this.rows] : this.rows.filter(row => (row.parentId ?? null) === (rule.value ?? null));
    const sorted = matched.sort((a, b) => (a.sortOrder ?? '').localeCompare(b.sortOrder ?? ''));
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
      act(() => {
        result.current.showDeleteDialog(folder);
      });
      await act(async () => {
        await result.current.executeCascadeDelete();
      });

      expect(table.rows.map(row => row.name)).toEqual(['节点 other']);
      expect(table.fullTableScans()).toEqual([]);
    });

    it('addChild 只查同级，排在同级末尾之后', async () => {
      const folder = makeFile('p', null, 'a0', 'folder');
      table.rows = [
        folder,
        makeFile('c1', 'p', 'a0', 'file'),
        makeFile('c2', 'p', 'a5', 'file'),
        makeFile('other', null, 'a1', 'file')
      ];

      const { result } = renderHook(() => useFileManagerLazyStore(rxdb));
      await act(async () => {
        await result.current.addChild(folder, '新文件', 'file', 'txt');
      });

      const created = table.rows.find(row => row.name?.startsWith('新文件'));
      expect((created?.sortOrder ?? '') > 'a5').toBe(true);
      expect(table.fullTableScans()).toEqual([]);
    });
  });
});
