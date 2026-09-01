/**
 * RxDB 数据库清理函数
 * 在被检查页面的上下文中执行
 *
 * 注意：此函数会被序列化后在目标页面执行，不能引用外部变量或类型
 */
export async function clearDatabase() {
  const REMOVE_MAX_ATTEMPTS = 5;
  const REMOVE_BACKOFF_MS = 25;
  // 单库删除的等待上限。`blocked` 不是失败，只是「还有连接没关」，得给对方让路的时间。
  const IDB_DELETE_TIMEOUT_MS = 8000;
  // 整体上限，必须小于面板侧 executeInInspectedWindow 的 15s —— 否则任何一步卡住，
  // 面板只能看到无信息量的「等待页面脚本执行结果超时」，看不出卡在哪。
  const CLEAR_DEADLINE_MS = 12_000;
  const IDB_DELETE_REGISTRY_KEY = '__AIAO_RXDB_DEVTOOLS_IDB_DELETES__';

  const isNoModificationAllowed = (error: unknown): boolean => {
    if (error instanceof DOMException) {
      return error.name === 'NoModificationAllowedError';
    }

    const message = error instanceof Error ? error.message : String(error);
    return message.includes('NoModificationAllowedError') || message.includes('modifications are not allowed');
  };

  const isIgnorableOpfsLockError = (entryPath: string, error: unknown): boolean => {
    if (!isNoModificationAllowed(error)) {
      return false;
    }

    // sqlite OPFS proxy may keep temporary .ahp-* handles briefly; treat as non-critical.
    return entryPath.startsWith('.ahp-');
  };

  const removeEntryWithRetry = async (
    directoryHandle: FileSystemDirectoryHandle,
    name: string,
    recursive = true
  ): Promise<void> => {
    let lastError: unknown;

    for (let attempt = 0; attempt < REMOVE_MAX_ATTEMPTS; attempt += 1) {
      try {
        await directoryHandle.removeEntry(name, { recursive });
        return;
      } catch (error) {
        lastError = error;

        if (!isNoModificationAllowed(error) || attempt === REMOVE_MAX_ATTEMPTS - 1) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, REMOVE_BACKOFF_MS * (attempt + 1)));
      }
    }

    throw lastError;
  };

  const removeEntryOrCollect = async (
    directoryHandle: FileSystemDirectoryHandle,
    name: string,
    collected: Array<{ path: string; message: string; ignorable: boolean }>
  ): Promise<void> => {
    try {
      await removeEntryWithRetry(directoryHandle, name);
    } catch (error) {
      collected.push({
        path: name,
        message: error instanceof Error ? error.message : String(error),
        ignorable: isIgnorableOpfsLockError(name, error)
      });
    }
  };

  // deleteDatabase 返回的 IDBOpenDBRequest 无法取消：放弃等待并不会把它从 origin 的
  // connection queue 上摘掉。若此时对同名库再发一条，它会排在前一条之后，前一条不结束
  // 就连 `blocked` 都不会 fire —— 第二次点击于是彻底静默。所以同名请求必须跨次复用。
  const idbDeleteRegistry = ((): Map<string, Promise<void>> => {
    const scope = globalThis as unknown as Record<string, Map<string, Promise<void>> | undefined>;
    const existing = scope[IDB_DELETE_REGISTRY_KEY];
    if (existing) return existing;

    const created = new Map<string, Promise<void>>();
    scope[IDB_DELETE_REGISTRY_KEY] = created;
    return created;
  })();

  const deleteDatabaseOnce = (name: string): Promise<void> => {
    const pending = idbDeleteRegistry.get(name);
    if (pending) return pending;

    const request = indexedDB.deleteDatabase(name);
    const settled = new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error(`IndexedDB 删除失败: ${name}`));
      // 故意不接 onblocked：它不是终态，请求仍在队列里等其它连接关闭，之后会照常 fire success。
    });

    idbDeleteRegistry.set(name, settled);
    const forget = () => {
      if (idbDeleteRegistry.get(name) === settled) idbDeleteRegistry.delete(name);
    };
    // 只在请求真正 settle 时摘除；超时放弃不摘 —— 那时请求还活着，摘了下次就会重复下发。
    void settled.then(forget, forget);
    return settled;
  };

  const deleteDatabaseWithDeadline = async (name: string): Promise<void> => {
    let timeoutId = 0;
    const expired = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error(`IndexedDB 删除被占用（仍有连接未关闭）: ${name}`)),
        IDB_DELETE_TIMEOUT_MS
      );
    });

    try {
      await Promise.race([deleteDatabaseOnce(name), expired]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const results = {
    rxdb: { success: false, error: null as string | null },
    opfs: { success: false, error: null as string | null },
    indexedDB: { success: false, error: null as string | null },
    localStorage: { success: false, error: null as string | null }
  };

  const disconnectRxdb = async (): Promise<{ success: boolean; error: string | null }> => {
    const globalHelper = (
      window as unknown as {
        __AIAO_RXDB_DEVTOOLS__?: {
          disconnectRxdb: (timeoutMs?: number) => Promise<{ success: boolean; error: string | null }>;
        };
      }
    ).__AIAO_RXDB_DEVTOOLS__;

    if (globalHelper?.disconnectRxdb) {
      return globalHelper.disconnectRxdb(3000);
    }

    const requestId = `clear-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise(resolve => {
      let timeoutId = 0;

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;

        const data = event.data as {
          source?: string;
          direction?: string;
          type?: string;
          payload?: { requestId?: string; success?: boolean; error?: string | null };
        };

        if (data.source !== '@aiao/rxdb-devtools') return;
        if (data.direction !== 'page-to-devtools' || data.type !== 'DISCONNECT_RXDB_RESULT') return;
        if (data.payload?.requestId !== requestId) return;

        cleanup();
        resolve({
          success: data.payload.success !== false,
          error: data.payload.error ?? null
        });
      };

      timeoutId = window.setTimeout(() => {
        cleanup();
        resolve({ success: false, error: '等待 RxDB 断开超时' });
      }, 3000);

      window.addEventListener('message', onMessage);
      window.postMessage(
        {
          source: '@aiao/rxdb-devtools',
          direction: 'devtools-to-page',
          type: 'DISCONNECT_RXDB',
          payload: { requestId },
          timestamp: Date.now(),
          sequence: Date.now()
        },
        '*'
      );
    });
  };

  // 1. 断开 RxDB 连接
  const clearRxdb = async (): Promise<void> => {
    try {
      const disconnectResult = await disconnectRxdb();
      if (!disconnectResult.success) {
        throw new Error(disconnectResult.error || '断开 RxDB 失败');
      }

      // 等待底层 SQLite 句柄释放，避免 wal/journal 仍被占用
      await new Promise(resolve => setTimeout(resolve, 100));
      results.rxdb.success = true;
    } catch (e) {
      results.rxdb.error = (e as Error).message;
    }
  };

  // 2. 清理 OPFS
  const clearOpfs = async (): Promise<void> => {
    try {
      const root = await navigator.storage.getDirectory();
      const opfsErrors: Array<{ path: string; message: string; ignorable: boolean }> = [];

      // 先收集顶层条目，避免遍历期间删除导致迭代状态不稳定。
      const topLevelNames: string[] = [];
      for await (const [name] of root.entries()) {
        topLevelNames.push(name);
      }

      for (const name of topLevelNames) {
        await removeEntryOrCollect(root, name, opfsErrors);
      }

      const hardErrors = opfsErrors.filter(item => !item.ignorable);
      if (hardErrors.length === 0) {
        results.opfs.success = true;
      } else {
        results.opfs.error = hardErrors.map(item => `${item.path}: ${item.message}`).join('; ');
      }
    } catch (e) {
      results.opfs.error = (e as Error).message;
    }
  };

  // 3. 清理 IndexedDB
  const clearIndexedDB = async (): Promise<void> => {
    try {
      const databases = indexedDB.databases ? await indexedDB.databases() : [];
      const databaseNames = databases
        .map(database => database.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);

      // allSettled 而非 all：一个被占用的库不该把其它库的成败一起吞掉。
      const outcomes = await Promise.allSettled(databaseNames.map(name => deleteDatabaseWithDeadline(name)));
      const failures: string[] = [];
      for (const outcome of outcomes) {
        if (outcome.status !== 'rejected') continue;
        const reason: unknown = outcome.reason;
        failures.push(reason instanceof Error ? reason.message : String(reason));
      }

      if (failures.length === 0) {
        results.indexedDB.success = true;
      } else {
        results.indexedDB.error = failures.join('; ');
      }
    } catch (e) {
      results.indexedDB.error = (e as Error).message;
    }
  };

  // 4. 清理 localStorage
  const clearLocalStorage = (): void => {
    try {
      localStorage.clear();
      results.localStorage.success = true;
    } catch (e) {
      results.localStorage.error = (e as Error).message;
    }
  };

  const runAll = async (): Promise<void> => {
    await clearRxdb();
    await clearOpfs();
    await clearIndexedDB();
    clearLocalStorage();
  };

  // 页内任何一步卡住，面板只会看到无信息量的「等待页面脚本执行结果超时」。
  // 自带 deadline，才能把「卡在哪一步」原样传回去。
  let deadlineId = 0;
  const deadline = new Promise<void>(resolve => {
    deadlineId = window.setTimeout(resolve, CLEAR_DEADLINE_MS);
  });

  try {
    await Promise.race([runAll(), deadline]);
  } finally {
    window.clearTimeout(deadlineId);
  }

  for (const step of Object.values(results)) {
    if (step.success || step.error !== null) continue;
    step.error = `清理超时（${CLEAR_DEADLINE_MS}ms 内未完成）`;
  }

  // 注意：不在页内直接 reload。页面导航会在结果消息回传（window.postMessage → bridge →
  // background → panel）完成前拆掉执行上下文，导致面板误判超时。刷新时机改由面板在收到结果后控制。
  return results;
}

/** {@link clearDatabase} 的执行结果 */
export type ClearDatabaseResult = Awaited<ReturnType<typeof clearDatabase>>;
