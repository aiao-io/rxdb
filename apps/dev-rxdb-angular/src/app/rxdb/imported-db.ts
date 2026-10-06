// 导入库的覆盖键（US-909 阶段 B，AC#7）：启动、外壳提示条、导入页共用。备份读写在 `failure-archive-import.ts`，
// 这里不引用它们，免得进初始包。契约见 `git show 2e820521:specs/004-us-909-failure-data-archive/data-model.md` §6。

/**
 * 覆盖键：有值时 dev 应用打开这个库（而不是默认库 / e2e 隔离库），并强制 IDB + SharedWorker——导入经主线程 IDB
 * 连接写入，只有同一 VFS 读得到。
 */
export const IMPORTED_DB_NAME_STORAGE_KEY = 'rxdb-demo-imported-db-name';

/**
 * 当前打开的导入库名；没有导入库时为 `null`。
 *
 * @param storage - `window.localStorage`
 * @returns 覆盖键的值
 */
export function getImportedDbName(storage: Storage): string | null {
  return storage.getItem(IMPORTED_DB_NAME_STORAGE_KEY);
}

/**
 * 打开导入的库：写覆盖键后整页重载（主实例的库名在启动时定下，换库只能重载）。
 *
 * @param dbName - 原库名
 */
export function openImportedDb(dbName: string): void {
  window.localStorage.setItem(IMPORTED_DB_NAME_STORAGE_KEY, dbName);
  window.location.reload();
}

/** 回到默认库：删覆盖键后整页重载。 */
export function leaveImportedDb(): void {
  window.localStorage.removeItem(IMPORTED_DB_NAME_STORAGE_KEY);
  window.location.reload();
}
