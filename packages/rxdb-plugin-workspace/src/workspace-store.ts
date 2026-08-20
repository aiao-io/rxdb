/**
 * @fileoverview workspace 插件的 IndexedDB 连接持有者
 *
 * 替代 `idb-keyval` 的 `createStore()`。行为与它一致（惰性打开、单连接复用、
 * 被浏览器强制关闭后可重开），只多两件事：**持有 `IDBDatabase` 句柄**，
 * 以及**响应 `versionchange`**。
 *
 * 为什么必须自己写：`idb-keyval@6` 的 `createStore` 把 `IDBDatabase` 闭包在内部，
 * 既拿不到也关不掉，而且只挂 `onupgradeneeded` / `onclose`，**没有 `onversionchange`**。
 * 结果是这条连接在页面存活期间永不释放 —— 任何 `indexedDB.deleteDatabase(dbName)`
 * 都会 fire `blocked` 并无限期挂在 origin 的 connection queue 上。
 * DevTools 扩展「清理所有数据」的误报与二次点击死寂就是这么来的。
 *
 * @module rxdb-plugin-workspace/workspace-store
 */

import type { UseStore } from 'idb-keyval';

/**
 * 可显式释放的 {@link UseStore}。
 *
 * 调用签名与 `idb-keyval` 的 `UseStore` 完全一致，因此可以直接传给
 * `entries()` / `setMany()` / `delMany()` 等 helper。
 */
export type WorkspaceStore = UseStore & {
  /**
   * 关闭底层 IndexedDB 连接，并永久禁止重开。
   *
   * @remarks
   * 幂等。关闭后再使用该 store 会 reject —— 这里**不做静默重开**：
   * 重开会重新占住数据库，让调用方以为自己释放了、实际没有。
   */
  close(): void;
};

function closedError(dbName: string): Error {
  return new Error(`workspace store "${dbName}" 已关闭`);
}

/**
 * 创建 workspace 插件专用的 IndexedDB store。
 *
 * @param dbName - IndexedDB 数据库名（`<rxdb.config.dbName>`）
 * @param storeName - object store 名
 * @returns 带 `close()` 的 {@link WorkspaceStore}
 */
export function createWorkspaceStore(dbName: string, storeName: string): WorkspaceStore {
  let dbPromise: Promise<IDBDatabase> | undefined;
  let openDb: IDBDatabase | undefined;
  let closed = false;

  const forget = (db: IDBDatabase): void => {
    if (openDb !== db) return;
    openDb = undefined;
    dbPromise = undefined;
  };

  const attach = (db: IDBDatabase): IDBDatabase => {
    if (closed) {
      db.close();
      throw closedError(dbName);
    }

    openDb = db;
    // 外部 deleteDatabase / upgrade 会先发 versionchange。不让路 = 对方永远 blocked。
    db.onversionchange = () => {
      db.close();
      forget(db);
    };
    // Safari 有时会自行掐断连接，句柄作废后必须允许重开。
    db.onclose = () => forget(db);
    return db;
  };

  const open = (version?: number): Promise<IDBDatabase> => {
    const request = version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);
    request.onupgradeneeded = () => {
      // 建库与补建都走这里；已存在时不能重复创建，否则 ConstraintError
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    return new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error);
      };
      // 其他 tab 占用旧版本连接时升级会 blocked。必须显式失败：
      // 不处理的话这个 Promise 永不 settle，getDb() 的所有等待者（含每一次 flush）一起挂死。
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `workspace store "${dbName}" 升级被其他连接阻塞：请关闭同源的其他标签页后重试（缺少 object store "${storeName}"）`
          )
        );
      };
    });
  };

  /**
   * 打开数据库，并保证 `storeName` 一定存在。
   *
   * @remarks
   * RWS-008：早先只调 `indexedDB.open(dbName)`（不带 version）。同名库若已由应用、
   * 旧版本或外部升级创建过、但**没有**本插件的 object store，`onupgradeneeded` 根本不会触发，
   * 随后的 `db.transaction(storeName)` 直接抛 `NotFoundError` —— 插件永久不可用。
   * versionchange 后若外部删掉了该 store，重开也是同样结果。
   *
   * 因此打开后必须显式核对 `objectStoreNames`，缺失就升一版补建。
   * 不改用「插件独占的数据库名」是因为那会让**现有草稿全部失联**（库名是数据的物理地址）。
   */
  const openWithStore = async (): Promise<IDBDatabase> => {
    const db = await open();
    if (db.objectStoreNames.contains(storeName)) return db;

    const nextVersion = db.version + 1;
    // 必须先关掉自己这条连接，否则升级会被自己 blocked
    db.close();
    return open(nextVersion);
  };

  const getDb = (): Promise<IDBDatabase> => {
    if (closed) return Promise.reject(closedError(dbName));
    dbPromise ??= openWithStore()
      .then(attach)
      .catch((error: unknown) => {
        dbPromise = undefined;
        throw error;
      });
    return dbPromise;
  };

  return Object.assign(
    <T>(txMode: IDBTransactionMode, callback: (objectStore: IDBObjectStore) => T | PromiseLike<T>): Promise<T> =>
      getDb().then(db => callback(db.transaction(storeName, txMode).objectStore(storeName))),
    {
      close: (): void => {
        closed = true;
        openDb?.close();
        openDb = undefined;
        dbPromise = undefined;
      }
    }
  );
}
