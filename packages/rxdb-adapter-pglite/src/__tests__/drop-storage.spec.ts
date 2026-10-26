/**
 * @fileoverview PGlite 的 `dropStorage()`（US-313 阶段 C）：只读检出位回收快照库时删真实存储。
 *
 * @remarks
 * 判据是浏览器里那个 IndexedDB 库真的没了：断开时客户端亲手关掉 IdbFs 泄漏的那条连接，否则
 * `deleteDatabase` 会一直卡在 `blocked`。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const createDatabase = async (store: 'idb' | 'memory') => {
  const database = new RxDB({
    dbName: `drop-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  let adapter: RxDBAdapterPGlite | undefined;
  database.adapter('pglite', async db => (adapter = new RxDBAdapterPGlite(db, { store })));
  opened.push(database);
  await database.connect('pglite');
  return { database, adapter: adapter! };
};

const idbNames = async (): Promise<string[]> => (await indexedDB.databases()).map(info => info.name ?? '');

describe('RxDBAdapterPGlite.dropStorage', () => {
  it('idb：断开之后删掉 IndexedDB 库', async () => {
    const { database, adapter } = await createDatabase('idb');
    const name = `/pglite/${database.config.dbName}`;
    expect(await idbNames()).toContain(name);

    await database.disconnectAll();
    await adapter.dropStorage();

    expect(await idbNames()).not.toContain(name);
  });

  it('还连着：拒绝，库原样留着', async () => {
    const { database, adapter } = await createDatabase('idb');

    await expect(adapter.dropStorage()).rejects.toThrow(/还连着/);
    expect(await idbNames()).toContain(`/pglite/${database.config.dbName}`);
  });

  it('内存：断开即无，什么都不做；库不存在时也什么都不做', async () => {
    const memory = await createDatabase('memory');
    await memory.database.disconnectAll();
    await expect(memory.adapter.dropStorage()).resolves.toBeUndefined();

    const idb = await createDatabase('idb');
    await idb.database.disconnectAll();
    await idb.adapter.dropStorage();
    await expect(idb.adapter.dropStorage()).resolves.toBeUndefined();
  });

  // 建快照库之前问一次：建得出却删不掉的快照库，关闭时回收不了
  it('canDropStorage：内存与 idb 删得掉；别的数据目录删不掉，dropStorage 也拒', async () => {
    const instance = new RxDB({
      dbName: 'can-drop-storage',
      entities: [],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    expect(new RxDBAdapterPGlite(instance, { store: 'memory' }).canDropStorage()).toBe(true);
    expect(new RxDBAdapterPGlite(instance, { store: 'idb' }).canDropStorage()).toBe(true);

    const elsewhere = new RxDBAdapterPGlite(instance, { dataDir: 'opfs-ahp://can-drop-storage' });
    expect(elsewhere.canDropStorage()).toBe(false);
    await expect(elsewhere.dropStorage()).rejects.toThrow(/不支持删除存储/);
  });
});
