import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../workspace-store.js';

type FakeDb = {
  close: ReturnType<typeof vi.fn>;
  onclose: (() => void) | null;
  onversionchange: (() => void) | null;
  /** 建模真实 `IDBDatabase.objectStoreNames`：缺了它就表达不出「库在、store 不在」（RWS-008）。 */
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: ReturnType<typeof vi.fn>;
  version: number;
  transaction: ReturnType<typeof vi.fn>;
};

type FakeOpenRequest = {
  error: Error | null;
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result: FakeDb;
};

function createFakeDb(storeNames: string[] = ['workspace']): FakeDb {
  const names = new Set(storeNames);
  const db: FakeDb = {
    close: vi.fn(),
    onclose: null,
    onversionchange: null,
    version: 1,
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => names.add(name)),
    transaction: vi.fn(() => ({ objectStore: vi.fn((name: string) => `object-store:${name}`) }))
  };
  return db;
}

function stubIndexedDB(dbs: FakeDb[]) {
  const opened: FakeDb[] = [];
  const open = vi.fn((): FakeOpenRequest => {
    const db = dbs[opened.length] ?? dbs[dbs.length - 1];
    opened.push(db);
    const request: FakeOpenRequest = {
      error: null,
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      result: db
    };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { open, opened };
}

/**
 * 更贴近真实 IndexedDB 的替身：建模 `version`、`objectStoreNames` 与
 * 「store 不存在时 `transaction()` 抛 NotFoundError」。
 *
 * @remarks
 * RWS-008：上面那个 fake 的 `transaction().objectStore()` 无条件成功，
 * 因此「同名库已存在、但没有 workspace store」这条路径在测试里根本表达不出来。
 * 本替身跨多次 open 共享同一份库状态，才能覆盖「打开 → 发现缺 store → 升版补建」。
 */
type RealisticIndexedDBState = { version: number; storeNames: Set<string> };

function stubRealisticIndexedDB(
  initial: { version: number; storeNames: string[] },
  options: { blocked?: boolean; succeedAfterBlocked?: boolean } = {}
) {
  const state: RealisticIndexedDBState = { version: initial.version, storeNames: new Set(initial.storeNames) };
  const openVersions: Array<number | undefined> = [];

  const makeDb = () => ({
    get version() {
      return state.version;
    },
    objectStoreNames: { contains: (name: string) => state.storeNames.has(name) },
    createObjectStore: (name: string) => state.storeNames.add(name),
    close: vi.fn(),
    onclose: null as (() => void) | null,
    onversionchange: null as (() => void) | null,
    transaction: (name: string) => {
      if (!state.storeNames.has(name)) {
        throw new DOMException(`object store ${name} not found`, 'NotFoundError');
      }
      return { objectStore: (storeName: string) => `object-store:${storeName}` };
    }
  });
  const connections: ReturnType<typeof makeDb>[] = [];

  const open = vi.fn((_dbName: string, version?: number) => {
    openVersions.push(version);
    const db = makeDb();
    connections.push(db);
    const request = {
      error: null as Error | null,
      onerror: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      onblocked: null as (() => void) | null,
      onupgradeneeded: null as (() => void) | null,
      result: db
    };

    // 真实语义：库不存在时，不带 version 的 open 也会建库到 v1 并触发 upgrade
    const creating = version === undefined && state.version === 0;
    const upgrading = version !== undefined && version > state.version;

    queueMicrotask(() => {
      if (upgrading && options.blocked === true) {
        request.onblocked?.();
        if (options.succeedAfterBlocked === true) {
          queueMicrotask(() => {
            state.version = version;
            request.onupgradeneeded?.();
            request.onsuccess?.();
          });
        }
        return;
      }
      if (creating) state.version = 1;
      if (upgrading) state.version = version;
      if (creating || upgrading) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  });

  vi.stubGlobal('indexedDB', { open });
  return { connections, open, openVersions, state };
}

describe('createWorkspaceStore', () => {
  let db: FakeDb;
  let indexedDb: ReturnType<typeof stubIndexedDB>;

  beforeEach(() => {
    db = createFakeDb();
    indexedDb = stubIndexedDB([db]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens lazily and reuses one connection', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    expect(indexedDb.open).not.toHaveBeenCalled();

    const first = await store('readonly', objectStore => objectStore);
    const second = await store('readwrite', objectStore => objectStore);

    expect(indexedDb.open).toHaveBeenCalledTimes(1);
    expect(first).toBe('object-store:workspace');
    expect(second).toBe('object-store:workspace');
  });

  it('closes the connection on close()', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);

    store.close();

    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('rejects further use after close() instead of silently reopening', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);
    store.close();

    await expect(store('readonly', objectStore => objectStore)).rejects.toThrow('已关闭');
    expect(indexedDb.open).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on repeated close()', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);

    store.close();
    store.close();

    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('closes an in-flight connection opened after close()', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    const pending = store('readonly', objectStore => objectStore);
    store.close();

    await expect(pending).rejects.toThrow('已关闭');
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('yields to an external deleteDatabase via versionchange', async () => {
    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);

    expect(db.onversionchange).toBeTypeOf('function');
    db.onversionchange?.();

    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('reopens after versionchange so a live page keeps working', async () => {
    const second = createFakeDb();
    vi.unstubAllGlobals();
    indexedDb = stubIndexedDB([db, second]);

    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);
    db.onversionchange?.();

    await store('readwrite', objectStore => objectStore);

    expect(indexedDb.open).toHaveBeenCalledTimes(2);
    expect(second.onversionchange).toBeTypeOf('function');
  });

  it('reopens after the browser force-closes the connection', async () => {
    const second = createFakeDb();
    vi.unstubAllGlobals();
    indexedDb = stubIndexedDB([db, second]);

    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);
    db.onclose?.();

    await store('readonly', objectStore => objectStore);

    expect(indexedDb.open).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed open', async () => {
    const failing = vi.fn((): FakeOpenRequest => {
      const request: FakeOpenRequest = {
        error: new Error('open failed'),
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: db
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    });
    vi.stubGlobal('indexedDB', { open: failing });

    const store = createWorkspaceStore('test_9@0_1', 'workspace');

    await expect(store('readonly', objectStore => objectStore)).rejects.toThrow('open failed');
    await expect(store('readonly', objectStore => objectStore)).rejects.toThrow('open failed');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('creates the object store on upgrade', async () => {
    // 起始没有任何 store；createObjectStore 会真的把名字加进集合，
    // 因此 upgrade 之后 objectStoreNames.contains 必须转为 true（否则会无限升版重开）
    const fresh = createFakeDb([]);
    const upgrading = vi.fn((): FakeOpenRequest => {
      const request: FakeOpenRequest = {
        error: null,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: fresh
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    });
    vi.stubGlobal('indexedDB', { open: upgrading });

    const store = createWorkspaceStore('test_9@0_1', 'workspace');
    await store('readonly', objectStore => objectStore);

    expect(fresh.createObjectStore).toHaveBeenCalledWith('workspace');
    expect(fresh.objectStoreNames.contains('workspace')).toBe(true);
  });

  // RWS-008：`indexedDB.open(dbName)` 不带 version，因此同名库若已被应用 / 旧版本 / 外部
  // 建过但**没有** workspace store，`onupgradeneeded` 根本不会触发，
  // 后面的 `db.transaction(storeName)` 直接抛 NotFoundError —— 插件永久用不了。
  it('upgrades an existing database that lacks the workspace store', async () => {
    vi.unstubAllGlobals();
    const idb = stubRealisticIndexedDB({ version: 3, storeNames: ['app-data'] });

    const store = createWorkspaceStore('app_db', 'workspace');

    await expect(store('readonly', objectStore => objectStore)).resolves.toBe('object-store:workspace');
    expect(idb.state.storeNames.has('workspace')).toBe(true);
    // 先按当前版本打开，发现缺 store 再显式升一版补建
    expect(idb.openVersions).toEqual([undefined, 4]);
    expect(idb.state.version).toBe(4);
  });

  it('does not bump the version when the store already exists', async () => {
    vi.unstubAllGlobals();
    const idb = stubRealisticIndexedDB({ version: 3, storeNames: ['workspace'] });

    const store = createWorkspaceStore('app_db', 'workspace');
    await expect(store('readonly', objectStore => objectStore)).resolves.toBe('object-store:workspace');

    expect(idb.openVersions).toEqual([undefined]);
    expect(idb.state.version).toBe(3);
  });

  it('creates the store on a brand new database without an extra upgrade', async () => {
    vi.unstubAllGlobals();
    const idb = stubRealisticIndexedDB({ version: 0, storeNames: [] });

    const store = createWorkspaceStore('app_db', 'workspace');
    await expect(store('readonly', objectStore => objectStore)).resolves.toBe('object-store:workspace');

    expect(idb.openVersions).toEqual([undefined]);
    expect(idb.state.version).toBe(1);
  });

  // 另一个 tab 占用旧版本连接时升级会 blocked。必须显式失败，
  // 否则 `getDb()` 的 Promise 永不 settle，所有 flush() 一起挂死。
  it('rejects instead of hanging when the upgrade is blocked by another connection', async () => {
    vi.unstubAllGlobals();
    stubRealisticIndexedDB({ version: 3, storeNames: ['app-data'] }, { blocked: true });

    const store = createWorkspaceStore('app_db', 'workspace');

    await expect(store('readonly', objectStore => objectStore)).rejects.toThrow('升级被其他连接阻塞');
  });

  it('closes a connection that succeeds after the blocked request has already rejected', async () => {
    vi.unstubAllGlobals();
    const idb = stubRealisticIndexedDB(
      { version: 3, storeNames: ['app-data'] },
      { blocked: true, succeedAfterBlocked: true }
    );
    const store = createWorkspaceStore('app_db', 'workspace');

    await expect(store('readonly', objectStore => objectStore)).rejects.toThrow('升级被其他连接阻塞');
    await Promise.resolve();

    expect(idb.connections[1]?.close).toHaveBeenCalledOnce();
  });
});
