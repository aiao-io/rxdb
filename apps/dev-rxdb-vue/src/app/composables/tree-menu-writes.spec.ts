/**
 * 树菜单三个 composable 的写入契约（US-031 阶段 A，`contracts/demo-write-paths.md`）。
 *
 * @remarks
 * 与 Angular / React 两端同口径断言：新建、批量写入里没有 `sortOrder`；批量是一次 `saveMany`；
 * 删除并提升子节点是一次 `mutations`，子节点取自库而不是页面已加载的列表；
 * 折叠节点（子节点未加载）删除时仍弹对话框；写入失败时设置页内错误状态，且不留未处理拒绝、不走 toast。
 *
 * 实体换成不依赖 RxDB 初始化的替身（真实实体构造需要全局 RxDB）；
 * 替身只记录「被赋了哪些字段」，所以 `'sortOrder' in menu` 能抓到任何对排序键的赋值。
 */
import type { RxDB } from '@aiao/rxdb';
import { SortableMenuLarge } from '@aiao/rxdb-test/entities';
import { of, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp, ref, toRaw } from 'vue';
import { useToast } from './useToast';
import { useTreeMenuLazyStore } from './useTreeMenuLazyStore';
import { useTreeMenuStore } from './useTreeMenuStore';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore';

type FakeMenu = {
  id: string;
  title: string;
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
  findAll: vi.fn(),
  getEntityMutations: vi.fn()
}));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  getEntityMutations: registry.getEntityMutations
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
    SortableMenuSimple: class SortableMenuSimple extends FakeEntity {},
    SortableMenuLarge: class SortableMenuLarge extends FakeEntity {}
  };
});

/** store 新建出来的实例 */
const created = (): FakeMenu[] => registry.created as FakeMenu[];

/** 夹具：模拟库里已有的节点，不计入 store 新建的实例 */
const FakeCtor: unknown = SortableMenuLarge;
const fixture = (data: Partial<FakeMenu> = {}): FakeMenu => {
  const menu = new (FakeCtor as new (data: Record<string, unknown>) => FakeMenu)(data);
  registry.created.pop();
  return menu;
};

const makeRxdb = () => ({
  entityManager: {
    saveMany: vi.fn<(entities: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    mutations: vi.fn<(options: unknown) => Promise<void>>().mockResolvedValue(undefined),
    removeMany: vi.fn<(entities: unknown[]) => Promise<void>>().mockResolvedValue(undefined)
  }
});

type FakeRxdb = ReturnType<typeof makeRxdb>;

const asRxdb = (rxdb: FakeRxdb): RxDB => rxdb as unknown as RxDB;

/** 各 composable 对外一致的最小操作面，用例只通过它驱动。 */
interface Harness {
  rxdb: FakeRxdb;
  writeError(): string | null;
  clearWriteError(): void;
  menuToDelete(): unknown;
  childrenCountInDialog(): number;
  addRoot(title: string): Promise<unknown>;
  addChild(parent: FakeMenu, title: string): Promise<unknown>;
  commitEdit(menu: FakeMenu): Promise<unknown>;
  addManyMenus(count: number): Promise<unknown>;
  /** 叶子节点的删除入口：virtual / lazy 直接删，simple 走对话框确认 */
  deleteLeaf(menu: FakeMenu): Promise<unknown>;
  deleteMenu(menu: FakeMenu): Promise<unknown>;
  executeCascadeDelete(): Promise<unknown>;
  executePromoteChildrenDelete(): Promise<unknown>;
  /** 让「从库里按父节点取直接子节点」返回这批子节点 */
  setDbChildren(children: FakeMenu[]): void;
  /** 让「从库里取全表」返回这批节点（级联删除读全表的页用） */
  setDbAll(all: FakeMenu[]): void;
  /** 库里被读过的次数：同级查询、全表读取都算 */
  dbReads(): number;
}

type HarnessFactory = (memory?: FakeMenu[]) => Harness;

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
  const store = useTreeMenuStore(ref(memory as never[]), asRxdb(rxdb));
  return {
    rxdb,
    writeError: () => store.writeError.value,
    clearWriteError: store.clearWriteError,
    menuToDelete: () => store.menuToDelete.value,
    childrenCountInDialog: () => store.deleteImpact.value.childrenCount,
    addRoot: title => store.addRoot(title),
    addChild: (parent, title) => store.addChild(parent as never, title),
    commitEdit: menu => store.commitEdit(menu as never),
    addManyMenus: count => store.addManyMenus(count),
    deleteLeaf: async menu => {
      await store.deleteMenu(menu as never);
      await store.executeCascadeDelete();
    },
    deleteMenu: menu => store.deleteMenu(menu as never),
    executeCascadeDelete: store.executeCascadeDelete,
    executePromoteChildrenDelete: store.executePromoteChildrenDelete,
    setDbChildren: children => registry.findAll.mockReturnValue(of(children)),
    setDbAll: () => undefined,
    dbReads: () => registry.findAll.mock.calls.length
  };
};

const virtualHarness: HarnessFactory = (memory = []) => {
  const rxdb = makeRxdb();
  const store = useTreeMenuVirtualStore(ref(memory as never[]), asRxdb(rxdb));
  return {
    rxdb,
    writeError: () => store.writeError.value,
    clearWriteError: store.clearWriteError,
    menuToDelete: () => store.menuToDelete.value,
    childrenCountInDialog: () => store.deleteImpact.value.childrenCount,
    addRoot: title => store.addRoot(title),
    addChild: (parent, title) => store.addChild(parent as never, title),
    commitEdit: menu => store.commitEdit(menu as never),
    addManyMenus: count => store.addManyMenus(count),
    deleteLeaf: menu => store.deleteMenu(menu as never),
    deleteMenu: menu => store.deleteMenu(menu as never),
    executeCascadeDelete: store.executeCascadeDelete,
    executePromoteChildrenDelete: store.executePromoteChildrenDelete,
    setDbChildren: children => registry.findAll.mockReturnValue(of(children)),
    setDbAll: () => undefined,
    dbReads: () => registry.findAll.mock.calls.length
  };
};

const lazyHarness: HarnessFactory = () => {
  const rxdb = makeRxdb();
  const observeChildMenus = vi.fn<(parentId: string) => Observable<never[]>>(() => of([]));
  const observeAllMenus = vi.fn(() => of([] as never[]));
  const dataSource = { observeAllMenus, observeChildMenus, observeRootMenus: () => of([] as never[]) };
  const store = inApp(() => useTreeMenuLazyStore(asRxdb(rxdb), dataSource));
  return {
    rxdb,
    writeError: () => store.writeError.value,
    clearWriteError: store.clearWriteError,
    menuToDelete: () => store.menuToDelete.value,
    childrenCountInDialog: () => store.deleteImpact.value?.childrenCount ?? 0,
    addRoot: title => store.addRoot(title),
    addChild: (parent, title) => store.addChild(parent as never, title),
    commitEdit: menu => store.commitEdit(menu as never),
    addManyMenus: count => store.addManyMenus(count),
    deleteLeaf: menu => store.deleteMenu(menu as never),
    deleteMenu: menu => store.deleteMenu(menu as never),
    executeCascadeDelete: store.executeCascadeDelete,
    executePromoteChildrenDelete: store.executePromoteChildrenDelete,
    setDbChildren: children => observeChildMenus.mockReturnValue(of(children as never[])),
    setDbAll: all => observeAllMenus.mockReturnValue(of(all as never[])),
    dbReads: () => observeChildMenus.mock.calls.length + observeAllMenus.mock.calls.length
  };
};

const harnesses: Array<[string, HarnessFactory]> = [
  ['useTreeMenuStore（simple）', simpleHarness],
  ['useTreeMenuVirtualStore（virtual）', virtualHarness],
  ['useTreeMenuLazyStore（lazy）', lazyHarness]
];

describe.each(harnesses)('%s 的写入契约', (_name, makeHarness) => {
  beforeEach(() => {
    registry.created.length = 0;
    registry.saveError = null;
    registry.findAll.mockReset();
    registry.findAll.mockReturnValue(of([]));
    registry.getEntityMutations.mockReset();
    registry.getEntityMutations.mockImplementation((options: unknown) => ({ mutationsOf: options }));
    useToast().toasts.value.forEach(toast => useToast().dismiss(toast.id));
  });

  afterEach(() => {
    mountedApps.splice(0).forEach(app => app.unmount());
  });

  describe('新建', () => {
    it('根节点：一次保存，实例不带 sortOrder，不发同级查询', async () => {
      const h = makeHarness();
      const readsBefore = h.dbReads();

      await h.addRoot('Root');

      const [menu] = created();
      expect(created()).toHaveLength(1);
      expect(menu.save).toHaveBeenCalledTimes(1);
      expect(menu.title).toBe('Root');
      expect(menu.parentId).toBeNull();
      expect('sortOrder' in menu).toBe(false);
      expect(h.dbReads()).toBe(readsBefore);
    });

    it('子节点：一次保存，parentId 指向父节点，实例不带 sortOrder，不发同级查询', async () => {
      const parent = fixture({ id: 'parent-1' });
      const h = makeHarness([parent]);
      const readsBefore = h.dbReads();

      await h.addChild(parent, 'Child');

      const [menu] = created();
      expect(created()).toHaveLength(1);
      expect(menu.save).toHaveBeenCalledTimes(1);
      expect(menu.parentId).toBe('parent-1');
      expect('sortOrder' in menu).toBe(false);
      expect(h.dbReads()).toBe(readsBefore);
    });

    it('失败：写入「新建失败：…」且不抛出；下一次成功的写入清掉提示', async () => {
      const h = makeHarness();
      registry.saveError = new Error('boom');

      await h.addRoot('Root');

      expect(h.writeError()).toBe('新建失败：boom');

      registry.saveError = null;
      await h.addRoot('Another');

      expect(h.writeError()).toBeNull();
    });

    it('子节点失败同样写入「新建失败：…」', async () => {
      const parent = fixture({ id: 'parent-1' });
      const h = makeHarness([parent]);
      registry.saveError = new Error('boom');

      await h.addChild(parent, 'Child');

      expect(h.writeError()).toBe('新建失败：boom');
    });

    it('clearWriteError 清掉提示', async () => {
      const h = makeHarness();
      registry.saveError = new Error('boom');
      await h.addRoot('Root');

      h.clearWriteError();

      expect(h.writeError()).toBeNull();
    });
  });

  describe('重命名', () => {
    it('保存成功：不报错', async () => {
      const menu = fixture({ id: 'm1', title: 'Renamed' });
      const h = makeHarness([menu]);

      await h.commitEdit(menu);

      expect(menu.save).toHaveBeenCalledTimes(1);
      expect(h.writeError()).toBeNull();
      expect(menu.reset).not.toHaveBeenCalled();
    });

    it('保存失败：写入「重命名失败：…」，实例回退到库里的状态，不抛出', async () => {
      const menu = fixture({ id: 'm1', title: 'Renamed' });
      menu.save.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([menu]);

      await h.commitEdit(menu);

      expect(h.writeError()).toBe('重命名失败：boom');
      expect(menu.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe('批量添加', () => {
    it('整批一次 saveMany，节点不带 sortOrder，不读全表取根', async () => {
      const h = makeHarness();
      const readsBefore = h.dbReads();

      await h.addManyMenus(100);

      expect(h.rxdb.entityManager.saveMany).toHaveBeenCalledTimes(1);
      const [batch] = h.rxdb.entityManager.saveMany.mock.calls[0] as [FakeMenu[]];
      expect(batch).toHaveLength(100);
      for (const menu of batch) {
        expect('sortOrder' in menu).toBe(false);
        expect(menu.save).not.toHaveBeenCalled();
      }
      expect(h.dbReads()).toBe(readsBefore);
      expect(h.writeError()).toBeNull();
    });

    it('失败：写入「批量添加失败：…」且不抛出', async () => {
      const h = makeHarness();
      h.rxdb.entityManager.saveMany.mockRejectedValueOnce(new Error('boom'));

      await h.addManyMenus(100);

      expect(h.writeError()).toBe('批量添加失败：boom');
    });
  });

  describe('删除', () => {
    it('叶子节点删除失败：写入「删除失败：…」，不走 toast，不抛出', async () => {
      const leaf = fixture({ id: 'leaf', parentId: null });
      leaf.remove.mockRejectedValueOnce(new Error('boom'));
      const h = makeHarness([leaf]);

      await h.deleteLeaf(leaf);

      expect(h.writeError()).toBe('删除失败：boom');
      expect(useToast().toasts.value).toHaveLength(0);
    });

    it('是否弹对话框以库里的直接子节点为准：折叠、子节点未加载的节点也弹，且不直接 remove', async () => {
      const parent = fixture({ id: 'p', parentId: null, hasChildren: false });
      const h = makeHarness([parent]);
      h.setDbChildren([fixture({ id: 'c1', parentId: 'p' }), fixture({ id: 'c2', parentId: 'p' })]);

      await h.deleteMenu(parent);

      expect(parent.remove).not.toHaveBeenCalled();
      expect(toRaw(h.menuToDelete())).toBe(parent);
      expect(h.childrenCountInDialog()).toBe(2);
    });

    it('级联删除失败：写入「级联删除失败：…」，对话框关闭，不抛出', async () => {
      const parent = fixture({ id: 'p', parentId: null });
      const child = fixture({ id: 'c1', parentId: 'p' });
      child.remove.mockRejectedValueOnce(new Error('boom'));
      // lazy 页的级联删除走 removeMany，其余走逐个 remove；两条路径都让它失败
      const h = makeHarness([parent, child]);
      h.setDbChildren([child]);
      h.setDbAll([parent, child]);
      h.rxdb.entityManager.removeMany.mockRejectedValueOnce(new Error('boom'));
      await h.deleteMenu(parent);

      await h.executeCascadeDelete();

      expect(h.writeError()).toBe('级联删除失败：boom');
      expect(h.menuToDelete()).toBeNull();
    });
  });

  describe('删除并提升子节点', () => {
    it('子节点取自库：只改 parentId，与删除同一次 mutations 提交，不逐条保存', async () => {
      const grandparentId = 'g';
      const parent = fixture({ id: 'p', parentId: grandparentId });
      const c1 = fixture({ id: 'c1', parentId: 'p' });
      const c2 = fixture({ id: 'c2', parentId: 'p' });
      // 页面已加载的列表里一个子节点都没有（折叠、未加载）：子节点只能来自库
      const h = makeHarness([parent]);
      h.setDbChildren([c1, c2]);
      await h.deleteMenu(parent);

      await h.executePromoteChildrenDelete();

      expect(registry.getEntityMutations).toHaveBeenCalledTimes(1);
      expect(registry.getEntityMutations).toHaveBeenCalledWith({
        needSaveEntities: [c1, c2],
        needRemoveEntities: [parent]
      });
      // 传给引擎的必须是原始实体，不是 menuToDelete 这个 ref 里的响应式代理（代理身份对不上实体状态表）
      const [options] = registry.getEntityMutations.mock.calls[0] as [{ needRemoveEntities: unknown[] }];
      expect(options.needRemoveEntities[0]).toBe(parent);
      expect(h.rxdb.entityManager.mutations).toHaveBeenCalledTimes(1);
      expect(h.rxdb.entityManager.mutations).toHaveBeenCalledWith(registry.getEntityMutations.mock.results[0].value);
      expect(c1.parentId).toBe(grandparentId);
      expect(c2.parentId).toBe(grandparentId);
      expect('sortOrder' in c1).toBe(false);
      expect('sortOrder' in c2).toBe(false);
      for (const entity of [c1, c2, parent]) {
        expect(entity.save).not.toHaveBeenCalled();
        expect(entity.remove).not.toHaveBeenCalled();
      }
      expect(h.menuToDelete()).toBeNull();
      expect(h.writeError()).toBeNull();
    });

    it('被删节点是根节点：子节点的 parentId 变为 null', async () => {
      const parent = fixture({ id: 'p', parentId: null });
      const child = fixture({ id: 'c1', parentId: 'p' });
      const h = makeHarness([parent]);
      h.setDbChildren([child]);
      await h.deleteMenu(parent);

      await h.executePromoteChildrenDelete();

      expect(child.parentId).toBeNull();
    });

    it('失败：写入「删除并提升子节点失败：…」，对话框关闭，不抛出', async () => {
      const parent = fixture({ id: 'p', parentId: null });
      const h = makeHarness([parent]);
      h.setDbChildren([fixture({ id: 'c1', parentId: 'p' })]);
      await h.deleteMenu(parent);
      h.rxdb.entityManager.mutations.mockRejectedValueOnce(new Error('boom'));

      await h.executePromoteChildrenDelete();

      expect(h.writeError()).toBe('删除并提升子节点失败：boom');
      expect(h.menuToDelete()).toBeNull();
    });
  });
});
