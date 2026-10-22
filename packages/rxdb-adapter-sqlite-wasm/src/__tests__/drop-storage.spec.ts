/**
 * @fileoverview sqlite-wasm 的 `dropStorage()`（US-313 阶段 C）：只读检出位回收快照库时删真实存储。
 *
 * @remarks
 * 判据是浏览器里那个 IndexedDB 库真的没了：断开时客户端关掉 VFS，否则 `deleteDatabase` 会一直卡在 `blocked`。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const createDatabase = async (vfs: 'idb' | 'memory', name?: string) => {
  const database = new RxDB({
    dbName: name ?? `drop-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  let adapter: RxDBAdapterSqlite | undefined;
  database.adapter(
    'sqlite-wasm',
    async db =>
      (adapter = new RxDBAdapterSqlite(db, {
        vfs,
        batchTimeout: 1,
        wasmUrl: vfs === 'idb' ? sqliteWasmAsyncUrl : sqliteWasmUrl
      }))
  );
  opened.push(database);
  await database.connect('sqlite-wasm');
  return { database, adapter: adapter! };
};

const idbNames = async (): Promise<string[]> => (await indexedDB.databases()).map(info => info.name ?? '');

describe('RxDBAdapterSqlite.dropStorage（sqlite-wasm）', () => {
  it('OPFS：中文和空格库名按 VFS 的 URL 路径删除真实文件', async () => {
    const database = new RxDB({
      dbName: `中文 opfs-${crypto.randomUUID().slice(0, 8)}`,
      entities: [],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    const adapter = new RxDBAdapterSqlite(database, { vfs: 'opfs' });
    const file = new URL(`${database.config.dbName}.sqlite`, 'file://').pathname.slice(1);
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(file, { create: true });
    await root.getFileHandle(`${file}-journal`, { create: true });

    await adapter.dropStorage();

    await expect(root.getFileHandle(file)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(root.getFileHandle(`${file}-journal`)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('IDB：中文和空格仍使用原库名，不做 OPFS 的 URL 转义', async () => {
    const { database, adapter } = await createDatabase('idb', `中文 idb-${crypto.randomUUID().slice(0, 8)}`);
    const name = `${database.config.dbName}.sqlite.db`;
    expect(await idbNames()).toContain(name);

    await database.disconnectAll();
    await adapter.dropStorage();

    expect(await idbNames()).not.toContain(name);
  });

  it('idb：断开之后删掉 IndexedDB 库', async () => {
    const { database, adapter } = await createDatabase('idb');
    const name = `${database.config.dbName}.sqlite.db`;
    expect(await idbNames()).toContain(name);

    await database.disconnectAll();
    await adapter.dropStorage();

    expect(await idbNames()).not.toContain(name);
  });

  it('还连着：拒绝，库原样留着', async () => {
    const { database, adapter } = await createDatabase('idb');

    await expect(adapter.dropStorage()).rejects.toThrow(/还连着/);
    expect(await idbNames()).toContain(`${database.config.dbName}.sqlite.db`);
  });

  it('内存：断开即无，什么都不做；库已删过再删也什么都不做', async () => {
    const memory = await createDatabase('memory');
    await memory.database.disconnectAll();
    await expect(memory.adapter.dropStorage()).resolves.toBeUndefined();

    const idb = await createDatabase('idb');
    await idb.database.disconnectAll();
    await idb.adapter.dropStorage();
    await expect(idb.adapter.dropStorage()).resolves.toBeUndefined();
  });

  // 建快照库之前问一次：建得出却删不掉的快照库，关闭时回收不了
  it('canDropStorage：fs-handle 的根目录由调用方给，删不掉；其余 VFS 都删得掉', async () => {
    const instance = new RxDB({
      dbName: 'can-drop-storage',
      entities: [],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    for (const vfs of ['memory', 'idb', 'idb-memory', 'opfs'] as const) {
      expect(new RxDBAdapterSqlite(instance, { vfs }).canDropStorage(), vfs).toBe(true);
    }

    const handle = new RxDBAdapterSqlite(instance, { vfs: 'fs-handle' });
    expect(handle.canDropStorage()).toBe(false);
    await expect(handle.dropStorage()).rejects.toThrow(/不支持删除存储/);
  });
});
