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

type PersistentIdbVfs = 'IDBBatchAtomicVFS' | 'IDBMirrorVFS';

const createDatabase = async (vfs: PersistentIdbVfs | 'MemoryAsyncVFS', name?: string) => {
  const database = new RxDB({
    dbName: name ?? `drop-${Math.random().toString(36).slice(2, 10)}`,
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
const storedPaths = (vfs: PersistentIdbVfs = 'IDBBatchAtomicVFS'): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(vfs);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const store = vfs === 'IDBBatchAtomicVFS' ? 'metadata' : 'blocks';
      const keys = db.transaction(store).objectStore(store).getAllKeys();
      keys.onsuccess = () => {
        db.close();
        resolve(keys.result.map(key => String(Array.isArray(key) ? key[0] : key)));
      };
      keys.onerror = () => reject(keys.error);
    };
  });

describe('RxDBAdapterWaSqlite.dropStorage', () => {
  it.each(['IDBBatchAtomicVFS', 'IDBMirrorVFS'] as const)(
    '%s 中文和空格库名：按 URL 路径删除，旁边的库不受影响',
    async vfs => {
      const victim = await createDatabase(vfs, `中文 review-${crypto.randomUUID().slice(0, 8)}`);
      const bystander = await createDatabase(vfs);
      const victimPath = new URL(`${victim.database.config.dbName}.sqlite`, 'file://').pathname;
      const bystanderPath = `/${bystander.database.config.dbName}.sqlite`;
      expect(await storedPaths(vfs)).toEqual(expect.arrayContaining([victimPath, bystanderPath]));

      await victim.database.disconnectAll();
      await victim.adapter.dropStorage();

      expect(await storedPaths(vfs)).not.toContain(victimPath);
      expect(await storedPaths(vfs)).toContain(bystanderPath);
    }
  );

  it('OPFS 删除使用相同的 URL 路径，中文与空格按百分号编码', async () => {
    const database = new RxDB({
      dbName: `中文 opfs-${crypto.randomUUID().slice(0, 8)}`,
      entities: [],
      sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
    });
    const adapter = new RxDBAdapterWaSqlite(database, { vfs: 'OPFSCoopSyncVFS' });
    const file = new URL(`${database.config.dbName}.sqlite`, 'file://').pathname.slice(1);
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(file, { create: true });
    await root.getFileHandle(`${file}-journal`, { create: true });

    await adapter.dropStorage();

    await expect(root.getFileHandle(file)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(root.getFileHandle(`${file}-journal`)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

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
