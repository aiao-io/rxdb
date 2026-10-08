/**
 * 文件管理器两个 composable 的写入契约（US-031 阶段 A，`contracts/demo-write-paths.md`）。
 *
 * @remarks
 * `useFileManagerStore` 服务 simple 与 virtual 两页（实体 `SortableFileNode`），
 * `useFileManagerLazyStore` 服务 lazy 页（实体 `SortableFileLarge`）。文件管理器没有删除并提升子节点。
 *
 * 断言：新建（含根级文件夹 / 文件交替新建）与批量添加不带 `sortOrder`、不发同级查询、不取根节点作锚点；
 * 批量是一次 `saveMany`；新建、重命名、批量添加、删除、级联删除失败时设置页内错误状态，
 * 不调用 `window.alert`，也不留未处理拒绝。
 *
 * 实体换成不依赖 RxDB 初始化的替身（真实实体构造需要全局 RxDB）。
 */
import type { RxDB } from '@aiao/rxdb';
import { SortableFileLarge } from '@aiao/rxdb-test/entities';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp, ref } from 'vue';
import { useFileManagerLazyStore } from './useFileManagerLazyStore';
import { useFileManagerStore } from './useFileManagerStore';
import { useToast } from './useToast';

type FakeFile = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  hasChildren: boolean;
  save: Mock<() => Promise<unknown>>;
  remove: Mock<() => Promise<unknown>>;
  reset: Mock<() => void>;
} & Record<string, unknown>;

const registry = vi.hoisted(() => ({
  /** 被 store 新建出来的实例（夹具不记录在内） */
  created: [] as unknown[],
  /** 非空时，之后新建的实例保存会抛出它 */
  saveError: null as Error | null,
  findAll: vi.fn()
}));

vi.mock('@aiao/rxdb-test/entities', () => {
  class FakeEntity {
    static findAll = registry.findAll;
    readonly id = crypto.randomUUID();
    parentId: string | null = null;
    hasChildren = false;
    readonly save = vi.fn(async () => {
      if (registry.saveError) throw registry.saveError;
      return this;
    });
    readonly remove = vi.fn(async () => this);
    readonly reset = vi.fn();
    readonly parent$ = {
      set: (parent: { id: string } | null) => {
        this.parentId = parent?.id ?? null;
      }
    };

    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      registry.created.push(this);
    }
  }
  return {
    SortableFileNode: class SortableFileNode extends FakeEntity {},
    SortableFileLarge: class SortableFileLarge extends FakeEntity {}
  };
});

/** store 新建出来的实例 */
const created = (): FakeFile[] => registry.created as FakeFile[];

/** 夹具：模拟库里已有的节点，不计入 store 新建的实例 */
const FakeCtor: unknown = SortableFileLarge;
const fixture = (data: Partial<FakeFile> & Pick<FakeFile, 'name' | 'type'>): FakeFile => {
  const file = new (FakeCtor as new (data: Record<string, unknown>) => FakeFile)(data);
  registry.created.pop();
  return file;
};

const makeRxdb = () => ({
  entityManager: {
    save: vi.fn<(entity: unknown) => Promise<void>>(async () => {
      if (registry.saveError) throw registry.saveError;
    }),
    saveMany: vi.fn<(entities: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    removeMany: vi.fn<(entities: unknown[]) => Promise<void>>().mockResolvedValue(undefined)
  }
});

type FakeRxdb = ReturnType<typeof makeRxdb>;

const asRxdb = (rxdb: FakeRxdb): RxDB => rxdb as unknown as RxDB;

/** 两个 composable 对外一致的最小操作面，用例只通过它驱动。 */
interface Harness {
  rxdb: FakeRxdb;
  writeError(): string | null;
  clearWriteError(): void;
  addRoot(name: string, type: 'file' | 'folder', extension?: string): Promise<unknown>;
  addChild(parent: FakeFile, name: string, type: 'file' | 'folder'): Promise<unknown>;
  commitEdit(file: FakeFile): Promise<unknown>;
  addManyFiles(count: number): Promise<unknown>;
  deleteFile(file: FakeFile): Promise<unknown>;
  /** 对话框确认删除：先 showDeleteDialog 再 executeCascadeDelete */
  confirmDelete(file: FakeFile): Promise<unknown>;
  /** 让「库里的全表」返回这批节点（lazy 页的级联删除读全表） */
  setDbAll(all: FakeFile[]): void;
  /** 被保存过的实例，按保存顺序 */
  savedEntities(): FakeFile[];
  /** 库里被读过的次数：同级查询、全表读取、根订阅都算 */
  dbReads(): number;
}

type HarnessFactory = (memory?: FakeFile[]) => Harness;

const mountedApps: Array<{ unmount(): void }> = [];

const inApp = <T>(setup: () => T): T => {
  let result: T | undefined;
  const app = createApp({
    setup() {
      result = setup();
      return () => null;
    }
  });
  app.mount(document.createElement('div'));
  mountedApps.push(app);
  if (result === undefined) throw new Error('store creation failed');
  return result;
};

const simpleHarness: HarnessFactory = (memory = []) => {
  const rxdb = makeRxdb();
  const store = useFileManagerStore(ref(memory as never[]), asRxdb(rxdb));
  return {
    rxdb,
    writeError: () => store.writeError.value,
    clearWriteError: store.clearWriteError,
    addRoot: (name, type, extension) => store.addRoot(name, type, extension),
    addChild: (parent, name, type) => store.addChild(parent as never, name, type),
    commitEdit: file => store.commitEdit(file as never),
    addManyFiles: count => store.addManyFiles(count),
    deleteFile: file => store.deleteFile(file as never),
    confirmDelete: async file => {
      store.showDeleteDialog(file as never);
      await store.executeCascadeDelete();
    },
    setDbAll: () => undefined,
    savedEntities: () => created().filter(file => file.save.mock.calls.length > 0),
    dbReads: () => registry.findAll.mock.calls.length
  };
};

const lazyHarness: HarnessFactory = () => {
  const rxdb = makeRxdb();
  const store = inApp(() => useFileManagerLazyStore(asRxdb(rxdb)));
  return {
    rxdb,
    writeError: () => store.writeError.value,
    clearWriteError: store.clearWriteError,
    addRoot: (name, type, extension) => store.addRoot(name, type, extension),
    addChild: (parent, name, type) => store.addChild(parent as never, name, type),
    commitEdit: file => store.commitEdit(file as never),
    addManyFiles: count => store.addManyFiles(count),
    deleteFile: file => store.deleteFile(file as never),
    confirmDelete: async file => {
      store.showDeleteDialog(file as never);
      await store.executeCascadeDelete();
    },
    setDbAll: all => registry.findAll.mockReturnValue(of(all)),
    savedEntities: () => rxdb.entityManager.save.mock.calls.map(([entity]) => entity as FakeFile),
    dbReads: () => registry.findAll.mock.calls.length
  };
};

const harnesses: Array<[string, HarnessFactory]> = [
  ['useFileManagerStore（simple / virtual）', simpleHarness],
  ['useFileManagerLazyStore（lazy）', lazyHarness]
];

describe.each(harnesses)('%s 的写入契约', (_name, makeHarness) => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    registry.created.length = 0;
    registry.saveError = null;
    registry.findAll.mockReset();
    registry.findAll.mockReturnValue(of([]));
    useToast().toasts.value.forEach(toast => useToast().dismiss(toast.id));
  });

  afterEach(() => {
    mountedApps.splice(0).forEach(app => app.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('新建', () => {
    it('根级依次新建文件夹 A、文件 X、文件夹 B：三次保存，都不带 sortOrder，不发同级查询', async () => {
      const h = makeHarness();
      const readsBefore = h.dbReads();

      await h.addRoot('A', 'folder');
      await h.addRoot('X', 'file', 'txt');
      await h.addRoot('B', 'folder');

      const saved = h.savedEntities();
      expect(saved.map(file => file.name)).toEqual(['A', 'X', 'B']);
      expect(saved.map(file => file.type)).toEqual(['folder', 'file', 'folder']);
      for (const file of saved) {
        expect(file.parentId).toBeNull();
        expect('sortOrder' in file).toBe(false);
      }
      expect(h.dbReads()).toBe(readsBefore);
    });

    it('子节点：一次保存，parentId 指向父文件夹，不带 sortOrder，不发同级查询', async () => {
      const parent = fixture({ id: 'folder-1', name: 'Docs', type: 'folder' });
      const h = makeHarness([parent]);
      const readsBefore = h.dbReads();

      await h.addChild(parent, 'notes', 'file');

      const [file] = h.savedEntities();
      expect(h.savedEntities()).toHaveLength(1);
      expect(file.parentId).toBe('folder-1');
      expect('sortOrder' in file).toBe(false);
      expect(h.dbReads()).toBe(readsBefore);
    });

    it('失败：写入「新建失败：…」且不抛出；下一次成功的写入清掉提示', async () => {
      const h = makeHarness();
      registry.saveError = new Error('boom');

      await h.addRoot('A', 'folder');

      expect(h.writeError()).toBe('新建失败：boom');

      registry.saveError = null;
      await h.addRoot('B', 'folder');

      expect(h.writeError()).toBeNull();
    });

    it('子节点失败同样写入「新建失败：…」', async () => {
      const parent = fixture({ id: 'folder-1', name: 'Docs', type: 'folder' });
      const h = makeHarness([parent]);
      registry.saveError = new Error('boom');

      await h.addChild(parent, 'notes', 'file');

      expect(h.writeError()).toBe('新建失败：boom');
    });

    it('clearWriteError 清掉提示', async () => {
      const h = makeHarness();
      registry.saveError = new Error('boom');
      await h.addRoot('A', 'folder');

      h.clearWriteError();

      expect(h.writeError()).toBeNull();
    });
  });

  describe('重命名', () => {
    it('保存失败：写入「重命名失败：…」，实例回退到库里的状态，不抛出', async () => {
      const file = fixture({ id: 'f1', name: 'Renamed', type: 'file' });
      file.save.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([file]);

      await h.commitEdit(file);

      expect(h.writeError()).toBe('重命名失败：boom');
      expect(file.reset).toHaveBeenCalledTimes(1);
    });

    it('保存成功：不报错', async () => {
      const file = fixture({ id: 'f1', name: 'Renamed', type: 'file' });
      const h = makeHarness([file]);

      await h.commitEdit(file);

      expect(file.save).toHaveBeenCalledTimes(1);
      expect(h.writeError()).toBeNull();
    });
  });

  describe('批量添加', () => {
    it('整批一次 saveMany，节点不带 sortOrder，不读根节点作锚点', async () => {
      const root = fixture({ id: 'existing-root', name: 'Existing', type: 'folder' });
      const h = makeHarness([root]);
      const readsBefore = h.dbReads();

      await h.addManyFiles(100);

      expect(h.rxdb.entityManager.saveMany).toHaveBeenCalledTimes(1);
      const [batch] = h.rxdb.entityManager.saveMany.mock.calls[0] as [FakeFile[]];
      expect(batch).toHaveLength(100);
      for (const file of batch) {
        expect('sortOrder' in file).toBe(false);
        expect(file.save).not.toHaveBeenCalled();
      }
      // lazy 页批量添加后会重订阅根查询，这是刷新视图的读取；除此之外不再读库（不取全表、不取同级）
      expect(h.dbReads() - readsBefore).toBeLessThanOrEqual(1);
      expect(h.writeError()).toBeNull();
    });

    it('失败：写入「批量添加失败：…」且不抛出', async () => {
      const h = makeHarness();
      h.rxdb.entityManager.saveMany.mockRejectedValueOnce(new Error('boom'));

      await h.addManyFiles(100);

      expect(h.writeError()).toBe('批量添加失败：boom');
    });
  });

  describe('删除', () => {
    it('删除失败：写入「删除失败：…」，不调用 window.alert，不走 toast，不抛出', async () => {
      const alert = vi.fn();
      vi.stubGlobal('alert', alert);
      const file = fixture({ id: 'f1', name: 'a.txt', type: 'file' });
      file.remove.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([file]);

      await h.deleteFile(file);

      expect(h.writeError()).toBe('删除失败：boom');
      expect(alert).not.toHaveBeenCalled();
      expect(useToast().toasts.value).toHaveLength(0);
    });

    it('对话框确认删除普通文件失败：写入「删除失败：…」', async () => {
      const file = fixture({ id: 'f1', name: 'a.txt', type: 'file' });
      file.remove.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([file]);
      // lazy 页的确认删除走 removeMany，simple 页走逐个 remove；两条路径都让它失败
      h.setDbAll([file]);
      h.rxdb.entityManager.removeMany.mockRejectedValueOnce(new Error('boom'));

      await h.confirmDelete(file);

      expect(h.writeError()).toBe('删除失败：boom');
    });

    it('级联删除文件夹失败：写入「级联删除失败：…」，不调用 window.alert，不抛出', async () => {
      const alert = vi.fn();
      vi.stubGlobal('alert', alert);
      const folder = fixture({ id: 'folder-1', name: 'Docs', type: 'folder' });
      const child = fixture({ id: 'f1', name: 'a.txt', type: 'file', parentId: 'folder-1' });
      // simple 页逐个 remove，lazy 页走 removeMany；两条路径都让它失败
      child.remove.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([folder, child]);
      h.setDbAll([folder, child]);
      h.rxdb.entityManager.removeMany.mockRejectedValueOnce(new Error('boom'));

      await h.confirmDelete(folder);

      expect(h.writeError()).toBe('级联删除失败：boom');
      expect(alert).not.toHaveBeenCalled();
    });
  });
});
