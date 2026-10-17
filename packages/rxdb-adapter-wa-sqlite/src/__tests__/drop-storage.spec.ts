/**
 * @fileoverview wa-sqlite 的 `dropStorage()`（US-313 阶段 C）：只读检出位回收快照库时删真实存储。
 *
 * @remarks
 * `IDBBatchAtomicVFS` 把所有库放在同一个 IndexedDB 库里：判据是这个库的记录没了，**旁边那个库的记录还在**。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const createDatabase = async (vfs: 'IDBBatchAtomicVFS' | 'MemoryAsyncVFS') => {
  const database = new RxDB({
    dbName: `drop-${Math.random().toString(36).slice(2, 10)}`,
    entities: [],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  let adapter: RxDBAdapterWaSqlite | undefined;
  database.adapter(
    'wa-sqlite',
    async db =>
      (adapter = new RxDBAdapterWaSqlite(db, {
        vfs,
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      }))
  );
  opened.push(database);
  await database.connect('wa-sqlite');
  return { database, adapter: adapter! };
};

/** VFS 共用库里 metadata 的全部路径。 */
const storedPaths = (): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('IDBBatchAtomicVFS');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const keys = db.transaction('metadata').objectStore('metadata').getAllKeys();
      keys.onsuccess = () => {
        db.close();
        resolve(keys.result.map(String));
      };
      keys.onerror = () => reject(keys.error);
    };
  });

describe('RxDBAdapterWaSqlite.dropStorage', () => {
  it('IDBBatchAtomicVFS：只删这个库的记录，同一个 VFS 里别的库不受影响', async () => {
    const victim = await createDatabase('IDBBatchAtomicVFS');
    const bystander = await createDatabase('IDBBatchAtomicVFS');
    const victimPath = `/${victim.database.config.dbName}.sqlite`;
    const bystanderPath = `/${bystander.database.config.dbName}.sqlite`;
    expect(await storedPaths()).toEqual(expect.arrayContaining([victimPath, bystanderPath]));

    await victim.database.disconnectAll();
    await victim.adapter.dropStorage();

    const paths = await storedPaths();
    expect(paths).not.toContain(victimPath);
    expect(paths).toContain(bystanderPath);
  });

  it('还连着：拒绝；内存 VFS 断开即无，什么都不做', async () => {
    const idb = await createDatabase('IDBBatchAtomicVFS');
    await expect(idb.adapter.dropStorage()).rejects.toThrow(/还连着/);

    const memory = await createDatabase('MemoryAsyncVFS');
    await memory.database.disconnectAll();
    await expect(memory.adapter.dropStorage()).resolves.toBeUndefined();
  });

  // 建快照库之前问一次：建得出却删不掉的快照库，关闭时回收不了
  it('canDropStorage：AccessHandlePoolVFS 删不掉；内存、IDB 与 OPFS 的 VFS 都删得掉', async () => {
    const instance = new RxDB({
      dbName: 'can-drop-storage',
      entities: [],
      sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
    });
    const droppable = [
      'MemoryVFS',
      'MemoryAsyncVFS',
      'IDBBatchAtomicVFS',
      'IDBMirrorVFS',
      'OPFSAdaptiveVFS',
      'OPFSAnyContextVFS',
      'OPFSCoopSyncVFS',
      'OPFSWriteAheadVFS'
    ] as const;
    for (const vfs of droppable) {
      expect(new RxDBAdapterWaSqlite(instance, { vfs }).canDropStorage(), vfs).toBe(true);
    }

    const pool = new RxDBAdapterWaSqlite(instance, { vfs: 'AccessHandlePoolVFS' });
    expect(pool.canDropStorage()).toBe(false);
    await expect(pool.dropStorage()).rejects.toThrow(/不支持删除存储/);
  });
});
