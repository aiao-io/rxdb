const REMOVE_MAX_ATTEMPTS = 5;
const REMOVE_BACKOFF_MS = 25;

/**
 * 只清理 benchmark 自己创建的存储，避免误删同源下其它应用（如文档站、demo）的数据。
 *
 * benchmark 的 storageName 形如 `benchmark-db-run-*-<adapter>`，PGlite 的 OPFS 目录为
 * `rxdb-benchmarks/...`，均包含 `benchmark` 子串；据此做白名单过滤。
 */
const BENCHMARK_STORAGE_PATTERN = /benchmark/i;

function isBenchmarkOwned(name: string): boolean {
  return BENCHMARK_STORAGE_PATTERN.test(name);
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
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn(`删除 ${name} 被阻塞`);
      resolve();
    };
  });
}

/**
 * 清理 benchmark 在 OPFS（文件系统）和 IndexedDB 中创建的数据。
 *
 * 仅删除名称匹配 {@link BENCHMARK_STORAGE_PATTERN} 的顶层 OPFS 条目与 IndexedDB
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

      // 先收集根目录条目，避免边遍历边删除导致迭代器异常
      const topLevelNames: string[] = [];
      for await (const [name] of root as unknown as AsyncEntries) {
        if (isBenchmarkOwned(name)) {
          topLevelNames.push(name);
        }
      }

      for (const name of topLevelNames) {
        try {
          await removeEntryWithRetry(root, name);
        } catch (error) {
          console.error(`删除 ${name} 失败:`, error);
        }
      }

      // indexedDB.databases() 在部分浏览器不可用；无法枚举时跳过（不臆测库名以免误删）
      if (indexedDB.databases) {
        const dbList = await indexedDB.databases();
        const benchmarkDbs = dbList.filter((db): db is { name: string } => !!db.name && isBenchmarkOwned(db.name));
        await Promise.allSettled(benchmarkDbs.map(({ name }) => deleteIndexedDBDatabase(name)));
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
