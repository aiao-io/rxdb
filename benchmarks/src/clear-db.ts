const REMOVE_MAX_ATTEMPTS = 5;
const REMOVE_BACKOFF_MS = 25;
const DELETE_BLOCKED_TIMEOUT_MS = 50;
const BENCHMARK_IDB_PREFIX = 'benchmark-db-run-';
const BENCHMARK_OPFS_ROOT = 'rxdb-benchmarks';

/**
 * 只清理 benchmark 自己创建的存储，避免误删同源下其它应用（如文档站、demo）的数据。
 *
 * IndexedDB / OPFS 顶层条目必须是 `benchmark-db-run-...`，PGlite OPFS 根目录必须是
 * `rxdb-benchmarks`。名称里碰巧含有 `benchmark` 的同源数据一律保留。
 */
function isBenchmarkOwned(name: string): boolean {
  return name === BENCHMARK_OPFS_ROOT || name.startsWith(BENCHMARK_IDB_PREFIX);
}

type AsyncEntries = AsyncIterable<[string, FileSystemHandle]>;

async function removeEntryWithRetry(
  directoryHandle: FileSystemDirectoryHandle,
  name: string,
  recursive = true
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < REMOVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      await directoryHandle.removeEntry(name, { recursive });
      return;
    } catch (error) {
      lastError = error;
      const isLocked = error instanceof DOMException && error.name === 'NoModificationAllowedError';
      if (!isLocked || attempt === REMOVE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, REMOVE_BACKOFF_MS * (attempt + 1)));
    }
  }

  throw lastError;
}

function deleteIndexedDBDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    const failBlocked = () => {
      reject(new Error(`删除 ${name} 被阻塞`));
    };
    const timer = setTimeout(failBlocked, DELETE_BLOCKED_TIMEOUT_MS);
    const settle = (next: () => void) => {
      clearTimeout(timer);
      next();
    };

    request.onsuccess = () => settle(resolve);
    request.onerror = () => settle(() => reject(request.error));
    request.onblocked = () => settle(failBlocked);
  });
}

/**
 * 清理 benchmark 在 OPFS（文件系统）和 IndexedDB 中创建的数据。
 *
 * 仅删除名称匹配 {@link isBenchmarkOwned} 的顶层 OPFS 条目与 IndexedDB
 * 数据库，**不会**触碰同源下其它应用的存储。
 */
export async function clearDB(): Promise<void> {
  await navigator.locks.request('rxdb-benchmarks-storage-cleanup', { ifAvailable: true }, async lock => {
    if (!lock) {
      console.warn('清理已跳过：另一个实例持有锁');
      return;
    }

    try {
      const root = await navigator.storage.getDirectory();
      const topLevelNames: string[] = [];
      for await (const [name] of root as unknown as AsyncEntries) {
        if (isBenchmarkOwned(name)) {
          topLevelNames.push(name);
        }
      }

      for (const name of topLevelNames) {
        await removeEntryWithRetry(root, name);
      }

      if (indexedDB.databases) {
        const dbList = await indexedDB.databases();
        const benchmarkDbs = dbList.filter((db): db is { name: string } => !!db.name && isBenchmarkOwned(db.name));
        await Promise.all(benchmarkDbs.map(({ name }) => deleteIndexedDBDatabase(name)));
      } else {
        console.warn('indexedDB.databases() 不可用，跳过 IndexedDB 清理');
      }

      console.log('Benchmark 存储清理完成 ✅');
    } catch (error) {
      console.error('数据库清理出错:', error);
      throw error;
    }
  });
}
