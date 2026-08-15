import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDB } from './clear-db';

type DeleteRequest = {
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
};

type DeleteDatabaseBehavior = {
  mode: 'success' | 'error' | 'blocked';
  error?: DOMException;
};

const OWNED_IDB = 'benchmark-db-run-1-throughput-wa-sqlite';
const OWNED_OPFS = 'rxdb-benchmarks';
const SIMILAR_NAMES = ['docs-benchmark-demo', 'my-benchmark-data', 'search-benchmark-demo'] as const;

function createAsyncDirectory(names: string[], failOn?: string) {
  const remaining = new Set(names);
  const removed: string[] = [];

  return {
    removed,
    remaining,
    async *[Symbol.asyncIterator](): AsyncGenerator<[string, FileSystemHandle]> {
      for (const name of names) {
        yield [name, {} as FileSystemHandle];
      }
    },
    async removeEntry(name: string): Promise<void> {
      if (failOn === name) {
        throw new Error(`删除 ${name} 失败`);
      }
      remaining.delete(name);
      removed.push(name);
    }
  };
}

function installBrowserStorage(options: {
  opfsNames?: string[];
  failOpfsName?: string;
  idbNames?: string[];
  deleteDatabase?: (name: string) => DeleteDatabaseBehavior;
}) {
  const root = createAsyncDirectory(options.opfsNames ?? [], options.failOpfsName);
  const deletedIdb: string[] = [];
  const deleteDatabase =
    options.deleteDatabase ??
    ((): DeleteDatabaseBehavior => ({
      mode: 'success'
    }));

  const locks = {
    request: vi.fn(async (_name: string, _opts: unknown, callback: (lock: object | null) => Promise<void>) => {
      await callback({ name: 'rxdb-benchmarks-storage-cleanup' });
    })
  };

  vi.stubGlobal('navigator', {
    locks,
    storage: {
      getDirectory: async () => root
    }
  });

  vi.stubGlobal('indexedDB', {
    databases: async () => (options.idbNames ?? []).map(name => ({ name })),
    deleteDatabase(name: string): DeleteRequest {
      const behavior = deleteDatabase(name);
      const request: DeleteRequest = {
        error: behavior.error ?? null,
        onsuccess: null,
        onerror: null,
        onblocked: null
      };

      queueMicrotask(() => {
        if (behavior.mode === 'blocked') {
          request.onblocked?.();
          return;
        }
        if (behavior.mode === 'error') {
          request.onerror?.();
          return;
        }
        deletedIdb.push(name);
        request.onsuccess?.();
      });

      return request;
    }
  });

  return { root, deletedIdb, locks };
}

describe('clearDB', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('只删除严格前缀的自有存储，保留相似名称', async () => {
    const { root, deletedIdb } = installBrowserStorage({
      opfsNames: [OWNED_OPFS, OWNED_IDB, ...SIMILAR_NAMES],
      idbNames: [OWNED_IDB, ...SIMILAR_NAMES]
    });

    await clearDB();

    expect(root.removed.sort()).toEqual([OWNED_IDB, OWNED_OPFS].sort());
    expect(deletedIdb).toEqual([OWNED_IDB]);
    expect(root.remaining.has('docs-benchmark-demo')).toBe(true);
    expect(root.remaining.has('my-benchmark-data')).toBe(true);
    expect(root.remaining.has('search-benchmark-demo')).toBe(true);
    expect(log).toHaveBeenCalledWith('Benchmark 存储清理完成 ✅');
  });

  it('IndexedDB onblocked 超时后 reject，不当成成功', async () => {
    vi.useFakeTimers();
    installBrowserStorage({
      idbNames: [OWNED_IDB],
      deleteDatabase: () => ({ mode: 'blocked' })
    });

    const pending = clearDB();
    const expectation = expect(pending).rejects.toThrow(`删除 ${OWNED_IDB} 被阻塞`);
    await vi.runAllTimersAsync();
    await expectation;

    expect(log).not.toHaveBeenCalledWith('Benchmark 存储清理完成 ✅');
    expect(warn).not.toHaveBeenCalledWith(`删除 ${OWNED_IDB} 被阻塞`);
  });

  it('任一 IndexedDB 删除失败时 reject，且不打印成功日志', async () => {
    installBrowserStorage({
      idbNames: [OWNED_IDB],
      deleteDatabase: () => ({
        mode: 'error',
        error: new DOMException('quota', 'UnknownError')
      })
    });

    await expect(clearDB()).rejects.toThrow();
    expect(log).not.toHaveBeenCalledWith('Benchmark 存储清理完成 ✅');
  });

  it('任一 OPFS 删除失败时 reject，且不打印成功日志', async () => {
    installBrowserStorage({
      opfsNames: [OWNED_OPFS],
      failOpfsName: OWNED_OPFS
    });

    await expect(clearDB()).rejects.toThrow(`删除 ${OWNED_OPFS} 失败`);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('删除'), expect.anything());
    expect(log).not.toHaveBeenCalledWith('Benchmark 存储清理完成 ✅');
  });
});
