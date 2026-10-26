/**
 * @fileoverview wa-sqlite 的 IndexedDB 系 VFS 删一个库（`dropStorage()`，只读检出位回收快照库，US-313）。
 *
 * @remarks
 * `IDBBatchAtomicVFS` / `IDBMirrorVFS` 把**所有**库放在同一个以 VFS 命名的 IndexedDB 库里，按文件路径分记录，
 * 所以不能 `deleteDatabase`——那会把别的库一起删掉。这里照上游 `jDelete` 的键范围按路径删记录。
 */

import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';

/** 一个 VFS 的库里，一个路径在各个 store 里占的键范围。 */
type PathRanges = (path: string) => readonly { readonly store: string; readonly key: IDBValidKey | IDBKeyRange }[];

const PATH_RANGES: Readonly<Record<'IDBBatchAtomicVFS' | 'IDBMirrorVFS', PathRanges>> = {
  // blocks 的键是 [path, offset, version]，metadata 的键是 path（IDBBatchAtomicVFS.js 的 jDelete）
  IDBBatchAtomicVFS: path => [
    { store: 'blocks', key: IDBKeyRange.bound([path, -Infinity], [path, Infinity]) },
    { store: 'metadata', key: path }
  ],
  // blocks 的键是 [path, offset]，tx 的键是 [path, txId]（IDBMirrorVFS.js 的 #deleteFile 只清 blocks，tx 也要清）
  IDBMirrorVFS: path => [
    { store: 'blocks', key: IDBKeyRange.bound([path, 0], [path, Infinity]) },
    { store: 'tx', key: IDBKeyRange.bound([path, -Infinity], [path, Infinity]) }
  ]
};

/** 打开一个已存在的 IndexedDB 库；不存在时交回 `null`，也不留下空库。 */
const openExisting = (name: string): Promise<IDBDatabase | null> =>
  new Promise((resolve, reject) => {
    let created = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => (created ? resolve(null) : reject(request.error));
  });

/**
 * 从 VFS 的共用库里删掉一组文件路径的全部记录；库不存在时什么都不做。
 *
 * @param vfs - VFS 名，即共用 IndexedDB 库的库名
 * @param paths - 文件路径（以 `/` 开头，与 VFS 规范化后的一致）
 * @throws {@link RxDBAdapterSqliteError} 删除事务失败
 */
export const deleteIdbVfsFiles = async (
  vfs: 'IDBBatchAtomicVFS' | 'IDBMirrorVFS',
  paths: readonly string[]
): Promise<void> => {
  const db = await openExisting(vfs);
  if (!db) return;
  try {
    const deletes = paths.flatMap(PATH_RANGES[vfs]).filter(({ store }) => db.objectStoreNames.contains(store));
    if (deletes.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...new Set(deletes.map(({ store }) => store))], 'readwrite');
      for (const { store, key } of deletes) tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new RxDBAdapterSqliteError(`IndexedDB VFS ${vfs} 删除记录失败`, { cause: tx.error }));
      tx.onabort = () => reject(new RxDBAdapterSqliteError(`IndexedDB VFS ${vfs} 删除被中止`, { cause: tx.error }));
    });
  } finally {
    db.close();
  }
};
