/**
 * @fileoverview Electron 的 `dropStorage()`（US-313 阶段 C）：只读检出位回收快照库时删 host 上的库文件。
 *
 * @remarks
 * 适配器连测试宿主；判据是断开之后宿主工作区里再也找不到这个库的文件，日志旁文件一并消失。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { ADAPTER_NAME } from '../electron-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../pglite/RxDBAdapterElectronPGlite.js';
import type { RxDBAdapterElectron } from '../RxDBAdapterElectron.js';
import {
  createElectronWorktreeAdapter,
  electronDatabaseFilesOf,
  stopElectronTestHost
} from './electron-adapter-factory.js';

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

afterAll(() => stopElectronTestHost());

const instanceOf = (dbName: string): RxDB =>
  new RxDB({ dbName, entities: [], sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None } });

const createDatabase = async () => {
  const dbName = `drop-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const database = instanceOf(dbName);
  let adapter: RxDBAdapterElectron | undefined;
  database.adapter(ADAPTER_NAME, async db => (adapter = createElectronWorktreeAdapter(db)));
  opened.push(database);
  await database.connect(ADAPTER_NAME);
  return { database, adapter: adapter!, dbName };
};

describe('RxDBAdapterElectron.dropStorage', () => {
  it('断开之后删掉库文件与日志旁文件', async () => {
    const { database, adapter } = await createDatabase();
    expect(electronDatabaseFilesOf(adapter)).toContain(adapter.databaseName);

    await database.disconnectAll();
    await adapter.dropStorage();

    expect(electronDatabaseFilesOf(adapter)).toEqual([]);
  });

  it('还连着：拒绝，一个文件都不动', async () => {
    const { adapter } = await createDatabase();

    await expect(adapter.dropStorage()).rejects.toThrow(/还连着/);
    expect(electronDatabaseFilesOf(adapter)).toContain(adapter.databaseName);
  });

  // 同一个库文件被另一个实例开着：本实例的守卫看不见它，要靠宿主按库名拦
  it('别的实例还开着同一个库：宿主报 database_busy，文件原样留着', async () => {
    const { adapter, dbName } = await createDatabase();
    // 传原始库名：`config.dbName` 已带核心补上的后缀，再拿去建实例会叠成另一个文件名
    const sibling = createElectronWorktreeAdapter(instanceOf(dbName));
    expect(sibling.databaseName).toBe(adapter.databaseName);

    await expect(sibling.dropStorage()).rejects.toMatchObject({ code: 'database_busy' });
    expect(electronDatabaseFilesOf(adapter)).toContain(adapter.databaseName);
  });

  it('库文件本就不存在：什么都不做', async () => {
    const never = createElectronWorktreeAdapter(instanceOf(`never-opened-${Date.now()}`));

    await expect(never.dropStorage()).resolves.toBeUndefined();
    expect(electronDatabaseFilesOf(never)).toEqual([]);
  });

  // 建快照库之前问一次：SQLite 库文件由宿主删；PGlite 的数据目录也在宿主上，但还没有对应的删除请求
  it('canDropStorage：SQLite 删得掉；Electron PGlite 删不掉，dropStorage 也拒', async () => {
    const instance = instanceOf(`can-drop-storage-${Date.now()}`);
    expect(createElectronWorktreeAdapter(instance).canDropStorage()).toBe(true);

    const pglite = new RxDBAdapterElectronPGlite(instance);
    expect(pglite.canDropStorage()).toBe(false);
    await expect(pglite.dropStorage()).rejects.toMatchObject({ code: 'unsupported_operation' });
  });
});
