import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDatabase } from './clear-database';

type DevToolsWindow = Window & {
  __AIAO_RXDB_DEVTOOLS__?: {
    disconnectRxdb: () => Promise<{ error: string | null; success: boolean }>;
  };
};

const IDB_DELETE_REGISTRY_KEY = '__AIAO_RXDB_DEVTOOLS_IDB_DELETES__';

type DeleteRequestStub = {
  error: DOMException | null;
  onblocked: (() => void) | null;
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
};

function createDeleteRequest(): DeleteRequestStub {
  return { error: null, onblocked: null, onerror: null, onsuccess: null };
}

function connectRxdbHelper(): void {
  (window as DevToolsWindow).__AIAO_RXDB_DEVTOOLS__ = {
    disconnectRxdb: vi.fn().mockResolvedValue({ error: null, success: true })
  };
}

function stubEmptyOpfs(): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: vi.fn().mockResolvedValue({ entries: () => [] }) }
  });
}

describe('clearDatabase', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as DevToolsWindow).__AIAO_RXDB_DEVTOOLS__;
    delete (globalThis as Record<string, unknown>)[IDB_DELETE_REGISTRY_KEY];
  });

  it('skips unnamed IndexedDB databases', async () => {
    const devtoolsWindow = window as DevToolsWindow;
    devtoolsWindow.__AIAO_RXDB_DEVTOOLS__ = {
      disconnectRxdb: vi.fn().mockResolvedValue({ error: null, success: true })
    };

    const root = {
      entries: () => [] as [string, FileSystemHandle][],
      removeEntry: vi.fn()
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn().mockResolvedValue(root) }
    });

    const deletedNames: string[] = [];
    const indexedDb = {
      databases: vi.fn().mockResolvedValue([{ name: undefined }, { name: '' }, { name: 'rxdb' }]),
      deleteDatabase: vi.fn((name: string) => {
        deletedNames.push(name);
        const request = {
          error: null,
          onblocked: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onsuccess: null as (() => void) | null
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      })
    };
    vi.stubGlobal('indexedDB', indexedDb);
    // 不 spy Storage.prototype.clear：happy-dom 的 localStorage 是 bind-on-first-access
    // 的 Proxy，spy 安装前任何对 clear 的属性访问都会让 spy 永久失效（顺序敏感、CI 偶发）。
    // 改为行为断言：预置数据，验证 clearDatabase 确实清空了 localStorage。
    localStorage.setItem('aiao-devtools', 'cached');

    const result = await clearDatabase();

    expect(deletedNames).toEqual(['rxdb']);
    expect(result.indexedDB).toEqual({ error: null, success: true });
    expect(result.localStorage).toEqual({ error: null, success: true });
    expect(localStorage.getItem('aiao-devtools')).toBeNull();
  });

  // blocked 只代表「还有连接没关，我在排队等」，deleteDatabase 之后照常 fire success。
  // 把它当终态失败，就会在数据其实已经删掉的情况下报错。
  it('treats a blocked IndexedDB deletion as waiting, not as a failure', async () => {
    connectRxdbHelper();
    stubEmptyOpfs();
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'blocked-db' }]),
      deleteDatabase: vi.fn(() => {
        const request = createDeleteRequest();
        queueMicrotask(() => {
          request.onblocked?.();
          request.onsuccess?.();
        });
        return request;
      })
    });

    const result = await clearDatabase();

    expect(result.indexedDB).toEqual({ error: null, success: true });
  });

  it('reports a permanently blocked database without hiding the others', async () => {
    vi.useFakeTimers();
    connectRxdbHelper();
    stubEmptyOpfs();
    const deletedNames: string[] = [];
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'stuck-db' }, { name: 'ok-db' }]),
      deleteDatabase: vi.fn((name: string) => {
        deletedNames.push(name);
        const request = createDeleteRequest();
        queueMicrotask(() => (name === 'stuck-db' ? request.onblocked?.() : request.onsuccess?.()));
        return request;
      })
    });

    const resultPromise = clearDatabase();
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await resultPromise;

    // Promise.all 会让卡住的那个把其它库的成败一起吞掉，所以必须逐库汇总
    expect(deletedNames).toEqual(['stuck-db', 'ok-db']);
    expect(result.indexedDB.success).toBe(false);
    expect(result.indexedDB.error).toContain('被占用');
    expect(result.indexedDB.error).toContain('stuck-db');
    expect(result.indexedDB.error).not.toContain('ok-db');
  });

  // IDBOpenDBRequest 无法取消：放弃等待不会把它从 origin 的 connection queue 上摘掉。
  // 对同名库再发一条，它会排在前一条之后 —— 前一条不结束，连 blocked 都不会再 fire，
  // 第二次点击于是彻底静默，面板只能等到 15s 超时。
  it('reuses the pending deletion instead of queueing a duplicate on the next run', async () => {
    vi.useFakeTimers();
    connectRxdbHelper();
    stubEmptyOpfs();
    const deleteDatabase = vi.fn(() => {
      const request = createDeleteRequest();
      queueMicrotask(() => request.onblocked?.());
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([{ name: 'stuck-db' }]),
      deleteDatabase
    });

    const firstPromise = clearDatabase();
    await vi.advanceTimersByTimeAsync(9_000);
    const first = await firstPromise;

    const secondPromise = clearDatabase();
    await vi.advanceTimersByTimeAsync(9_000);
    const second = await secondPromise;

    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    expect(first.indexedDB.error).toContain('stuck-db');
    expect(second.indexedDB.error).toContain('stuck-db');
  });

  // 页内脚本卡住 = 面板只能看到无信息量的「等待页面脚本执行结果超时」。
  // 自带 deadline 才能把「卡在哪一步」传回去。
  it('returns partial results instead of hanging when a step never settles', async () => {
    vi.useFakeTimers();
    connectRxdbHelper();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(() => new Promise(() => undefined)) }
    });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });

    const resultPromise = clearDatabase();
    await vi.advanceTimersByTimeAsync(12_000);
    const result = await resultPromise;

    expect(result.rxdb.success).toBe(true);
    expect(result.opfs.success).toBe(false);
    expect(result.opfs.error).toContain('清理超时');
    expect(result.indexedDB.success).toBe(false);
    expect(result.indexedDB.error).toContain('清理超时');
  });

  it('retries transient OPFS lock errors', async () => {
    vi.useFakeTimers();
    (window as DevToolsWindow).__AIAO_RXDB_DEVTOOLS__ = {
      disconnectRxdb: vi.fn().mockResolvedValue({ error: null, success: true })
    };
    const locked = new DOMException('locked', 'NoModificationAllowedError');
    const removeEntry = vi.fn().mockRejectedValueOnce(locked).mockResolvedValue(undefined);
    const root = {
      entries: () => [['database.sqlite', {} as FileSystemHandle]],
      removeEntry
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn().mockResolvedValue(root) }
    });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });

    const resultPromise = clearDatabase();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(removeEntry).toHaveBeenCalledTimes(2);
    expect(result.opfs).toEqual({ error: null, success: true });
  });

  it('ignores only temporary OPFS proxy locks and reports hard failures', async () => {
    vi.useFakeTimers();
    (window as DevToolsWindow).__AIAO_RXDB_DEVTOOLS__ = {
      disconnectRxdb: vi.fn().mockResolvedValue({ error: null, success: true })
    };
    const removeEntry = vi.fn().mockRejectedValue(new DOMException('locked', 'NoModificationAllowedError'));
    const root = {
      entries: () => [
        ['.ahp-temporary', {} as FileSystemHandle],
        ['database.sqlite', {} as FileSystemHandle]
      ],
      removeEntry
    };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn().mockResolvedValue(root) }
    });
    vi.stubGlobal('indexedDB', { databases: vi.fn().mockResolvedValue([]) });

    const resultPromise = clearDatabase();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(removeEntry).toHaveBeenCalledTimes(10);
    expect(result.opfs.success).toBe(false);
    expect(result.opfs.error).toContain('database.sqlite: NoModificationAllowedError: locked');
    expect(result.opfs.error).not.toContain('.ahp-temporary');
  });
});
