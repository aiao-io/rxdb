/**
 * 恢复与正常连接之间的跨上下文互斥：Web Locks 管「此刻谁在用」，IndexedDB 标记管「上次恢复没做完」。
 *
 * @remarks
 * 两者缺一不可。锁随持有者所在的标签页 / Worker 一起消失，能挡住并发却挡不住「恢复做到一半
 * 页面被关掉」之后的下一次连接；标记是持久的，但单靠它无法判断写标记的那一方是否还活着。
 */

/** 恢复标记所在的 IndexedDB 库名。 */
export const PGLITE_RESTORE_MARKER_DATABASE = 'rxdb-pglite-restore';
const MARKER_STORE = 'markers';

/** 已获得的 Web Lock；`release()` 幂等。 */
export interface HeldLock {
  release(): void;
}

/**
 * 保护同一份 PGlite 持久化存储的锁名。
 *
 * @param storageKey - 规范化后的 `dataDir`（如 `idb://notes@0_1`）
 * @returns 锁名
 */
export const pgliteStorageLockName = (storageKey: string): string => `rxdb-pglite-storage:${storageKey}`;

/** 当前环境是否提供 Web Locks。 */
export const hasWebLocks = (): boolean => typeof navigator !== 'undefined' && navigator.locks !== undefined;

/**
 * 立即尝试获取锁，拿不到就返回 `null`，不排队。
 *
 * @remarks
 * Web Locks 的锁在回调返回的 promise settle 时释放，所以这里交出去一个不会自己结束的 promise，
 * 由 `release()` 手动 resolve。
 *
 * @param name - 锁名
 * @param mode - `exclusive` 给恢复，`shared` 给正常连接
 * @returns 持有的锁，或 `null`
 */
export const tryAcquireLock = (name: string, mode: LockMode): Promise<HeldLock | null> =>
  new Promise<HeldLock | null>((resolve, reject) => {
    navigator.locks
      .request(name, { mode, ifAvailable: true }, lock => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        return new Promise<void>(release => {
          let released = false;
          resolve({
            release: () => {
              if (released) return;
              released = true;
              release();
            }
          });
        });
      })
      .catch(reject);
  });

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * 打开一个**已存在**的 IndexedDB 库；库不存在时返回 `null` 且不留下空库。
 *
 * @remarks
 * 不带版本号打开一个不存在的库会先触发 `upgradeneeded`，在那里 abort 升级事务，库就不会被创建。
 */
const openExisting = (name: string): Promise<IDBDatabase | null> =>
  new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(name);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      if (absent) resolve(null);
      else reject(request.error);
    };
  });

const openMarkers = (): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PGLITE_RESTORE_MARKER_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MARKER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const inMarkerStore = async <T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  try {
    const transaction = db.transaction(MARKER_STORE, mode);
    const result = await requestResult(run(transaction.objectStore(MARKER_STORE)));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
};

/**
 * 写入「恢复进行中」标记。必须在往目标写第一个字节之前完成。
 *
 * @param storageKey - 目标的规范化 `dataDir`
 */
export const writeRestoreMarker = async (storageKey: string): Promise<void> => {
  await inMarkerStore(await openMarkers(), 'readwrite', store => store.put(Date.now(), storageKey));
};

/**
 * 删除恢复标记。
 *
 * @param storageKey - 目标的规范化 `dataDir`
 */
export const deleteRestoreMarker = async (storageKey: string): Promise<void> => {
  const db = await openExisting(PGLITE_RESTORE_MARKER_DATABASE);
  if (!db) return;
  if (!db.objectStoreNames.contains(MARKER_STORE)) {
    db.close();
    return;
  }
  await inMarkerStore(db, 'readwrite', store => store.delete(storageKey));
};

/**
 * 目标上是否留有未完成的恢复。
 *
 * @remarks
 * 只读探测，标记库不存在时不会顺手建出来——正常连接每次都要走这一步。
 *
 * @param storageKey - 目标的规范化 `dataDir`
 * @returns 有标记为 `true`
 */
export const hasRestoreMarker = async (storageKey: string): Promise<boolean> => {
  const db = await openExisting(PGLITE_RESTORE_MARKER_DATABASE);
  if (!db) return false;
  if (!db.objectStoreNames.contains(MARKER_STORE)) {
    db.close();
    return false;
  }
  const count = await inMarkerStore(db, 'readonly', store => store.count(storageKey));
  return count > 0;
};

/**
 * 探测 IdbFs 存储是否为空。
 *
 * @param databaseName - IdbFs 的 IndexedDB 库名
 * @returns 库不存在或没有任何文件记录时为 `true`
 */
export const isIdbStorageEmpty = async (databaseName: string): Promise<boolean> => {
  const db = await openExisting(databaseName);
  if (!db) return true;
  if (!db.objectStoreNames.contains('FILE_DATA')) {
    db.close();
    return true;
  }
  const count = await inMarkerStoreNamed(db, 'FILE_DATA');
  return count === 0;
};

const inMarkerStoreNamed = async (db: IDBDatabase, storeName: string): Promise<number> => {
  try {
    return await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).count());
  } finally {
    db.close();
  }
};

/**
 * `blocked` 之后再等多久才认定库确实被别处占着。
 *
 * @remarks
 * 已调用 `close()` 的连接要等手上的事务跑完才算真正关闭，在这之前 `deleteDatabase` 照样先报
 * `blocked`，随后自行完成。负载高时这段收尾可达数百毫秒；立即判失败会把自己刚放掉的连接误报成占用。
 */
const IDB_DELETE_BLOCKED_GRACE_MS = 3000;

/**
 * 删除一个 IndexedDB 库，被其他连接挡住超过宽限期时报错而不是无限等待。
 *
 * @param name - 库名
 */
export const deleteIdbDatabase = (name: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      timer = setTimeout(
        () => reject(new Error(`IndexedDB database "${name}" is still open elsewhere`)),
        IDB_DELETE_BLOCKED_GRACE_MS
      );
    };
  });
