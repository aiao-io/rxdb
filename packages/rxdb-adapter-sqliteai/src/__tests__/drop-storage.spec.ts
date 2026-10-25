/**
 * @fileoverview sqliteai 的 `dropStorage()`（US-313 阶段 C）：只读检出位回收快照库时删真实存储。
 *
 * @remarks
 * OPFS 库在专用 Worker 里打开；判据是断开之后主线程在 OPFS 根目录里再也找不到那个库文件。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterSqliteai } from '../RxDBAdapterSqliteai.js';

const opened: RxDB[] = [];
const workers: Worker[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
  for (const worker of workers.splice(0)) worker.terminate();
});

const createDatabase = async (opfs: boolean) => {
  const database = new RxDB({
    dbName: `drop-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
  });
  let adapter: RxDBAdapterSqliteai | undefined;
  database.adapter('sqliteai', async db => {
    if (!opfs) return (adapter = new RxDBAdapterSqliteai(db, {}));
    const worker = new Worker(new URL('./sqliteai-test.worker', import.meta.url), { type: 'module' });
    workers.push(worker);
    return (adapter = new RxDBAdapterSqliteai(db, {
      opfs: true,
      opfsFallback: 'throw',
      worker: true,
      workerInstance: worker
    }));
  });
  opened.push(database);
  await database.connect('sqliteai');
  return { database, adapter: adapter! };
};

const opfsHas = async (name: string): Promise<boolean> => {
  const root = await navigator.storage.getDirectory();
  return root.getFileHandle(name).then(
    () => true,
    () => false
  );
};

describe('RxDBAdapterSqliteai.dropStorage', () => {
  it('OPFS：断开之后删掉库文件', async () => {
    const { database, adapter } = await createDatabase(true);
    const file = `${database.config.dbName}.sqlite3`;
    expect(await opfsHas(file)).toBe(true);

    await database.disconnectAll();
    await adapter.dropStorage();

    expect(await opfsHas(file)).toBe(false);
  });

  it('还连着：拒绝；内存库断开即无，什么都不做', async () => {
    const persistent = await createDatabase(true);
    await expect(persistent.adapter.dropStorage()).rejects.toThrow(/还连着/);

    const memory = await createDatabase(false);
    await memory.database.disconnectAll();
    await expect(memory.adapter.dropStorage()).resolves.toBeUndefined();
  });

  // 建快照库之前问一次：内存与 OPFS 都删得掉
  it('canDropStorage：开不开 OPFS 都删得掉', () => {
    const instance = new RxDB({
      dbName: 'can-drop-storage',
      entities: [],
      sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
    });
    expect(new RxDBAdapterSqliteai(instance, {}).canDropStorage()).toBe(true);
    expect(new RxDBAdapterSqliteai(instance, { opfs: true }).canDropStorage()).toBe(true);
  });
});
