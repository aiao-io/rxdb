import { cloneEntityClasses, getEntityMetadata, RxDB, WorktreeTableSet } from '@aiao/rxdb';
import { get_table_name_by_metadata } from '@aiao/rxdb-adapter-sqlite-core';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ADAPTER_NAME } from '../electron-adapter.interface.js';
import type { RxDBAdapterElectron } from '../RxDBAdapterElectron.js';
import {
  createElectronWorktreeAdapter,
  electronAdapterFactory,
  stopElectronTestHost
} from './electron-adapter-factory.js';

const opened: RxDB[] = [];
afterEach(async () => {
  for (const database of opened.splice(0)) {
    await database.workingTree.checkouts.mountMain();
    for (const row of await database.workingTree.checkouts.list()) {
      if (row.mode === 'writable') await database.workingTree.checkouts.release(row.id);
    }
    await database.disconnectAll();
  }
});
afterAll(() => stopElectronTestHost());

const create = async (mount = true) => {
  const adapter = await electronAdapterFactory.createAdapter<RxDBAdapterElectron>({
    entities: [Todo],
    plugins: [rxDBPluginWorkingTree]
  });
  const database = adapter.rxdb;
  opened.push(database);
  await database.workingTree.enable();
  await database.versionManager.createBranch('feature');
  const row = await database.workingTree.checkouts.add('feature');
  if (row.tableSetSuffix === null) throw new Error('可写检出位缺少表集后缀');
  const tableSet = WorktreeTableSet.of(row.tableSetSuffix, [Todo]);
  const table = get_table_name_by_metadata(getEntityMetadata(Todo), tableSet);
  if (mount) await database.workingTree.checkouts.mount(row.id);
  return { adapter, database, row, table };
};

describe('检出位写入隔离', () => {
  it('同库另一实例新建的影子表在当前实例的 raw 门禁内', async () => {
    const { adapter, database } = await create(false);
    const other = new RxDB({
      ...database.config,
      dbName: database.config.dbName.slice(0, database.config.dbName.lastIndexOf('@')),
      entities: cloneEntityClasses([Todo])
    });
    other.adapter(adapter.name, createElectronWorktreeAdapter);
    other.use(rxDBPluginHistory);
    other.use(rxDBPluginWorkingTree);
    expect(other.config.dbName).toBe(database.config.dbName);
    const otherAdapter = await other.connect(ADAPTER_NAME);
    opened.push(other);
    expect(otherAdapter.databaseName).toBe(adapter.databaseName);
    await other.workingTree.enable();
    await other.versionManager.createBranch('other');
    const record = await other.workingTree.checkouts.add('other');
    if (record.tableSetSuffix === null) throw new Error('可写检出位缺少表集后缀');
    const set = WorktreeTableSet.of(record.tableSetSuffix, [Todo]);
    const table = get_table_name_by_metadata(getEntityMetadata(Todo), set);

    await expect(adapter.rawQuery!(`DROP TABLE "${table}"`)).rejects.toMatchObject({
      code: 'commit_capability_mismatch'
    });
    await expect(adapter.rawQuery!(`DELETE FROM "${table}"`)).rejects.toMatchObject({
      code: 'commit_capability_mismatch'
    });
    const physical = await adapter.rawQuery!('SELECT name FROM sqlite_master WHERE name = ?', [table]);
    expect(physical.rows).toHaveLength(1);
  });

  it.each(['unmounted', 'mounted', 'main', 'reconnected'] as const)(
    '%s：raw 写与 DDL 都受影子表门禁约束',
    async state => {
      const { adapter: initial, database, row, table } = await create(state !== 'unmounted');
      if (state === 'main') await database.workingTree.checkouts.mountMain();
      if (state === 'reconnected') {
        await database.workingTree.checkouts.release(row.id);
        await database.disconnectAll();
        await database.connect(initial.name);
      }
      const adapter = await database.getAdapter(ADAPTER_NAME);
      const sql = `INSERT INTO "${table}" (id, title, completed, createdAt, updatedAt) VALUES (?, 'raw-write', 0, datetime('now'), datetime('now'))`;
      await expect(adapter.rawQuery!(sql, [crypto.randomUUID()])).rejects.toMatchObject({
        code: 'commit_capability_mismatch'
      });
      await expect(adapter.rawQuery!(`DROP TABLE "${table}"`)).rejects.toMatchObject({
        code: 'commit_capability_mismatch'
      });
      const physical = await adapter.rawQuery!('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', [
        'table',
        table
      ]);
      expect(physical.rows).toHaveLength(1);
      expect((await database.workingTree.checkouts.list()).find(item => item.id === row.id)?.state).toBe('ready');
    }
  );

  it.each(['mount-first', 'remove-first'] as const)('%s：同实例换挂与删除按调用顺序完成', async order => {
    const { database, row } = await create(false);
    const checkouts = database.workingTree.checkouts;
    const outcomes = await Promise.allSettled(
      order === 'mount-first' ?
        [checkouts.mount(row.id), checkouts.remove(row.id)]
      : [checkouts.remove(row.id), checkouts.mount(row.id)]
    );
    expect(outcomes.map(item => item.status)).toEqual(
      order === 'mount-first' ? ['fulfilled', 'fulfilled'] : ['fulfilled', 'rejected']
    );
    expect(database.worktreeTableSet.isMain).toBe(true);
    expect(await checkouts.list()).toEqual([]);
    const locks = await navigator.locks.query();
    expect(locks.held?.some(item => item.name === `rxdb-worktree:${database.config.dbName}:${row.id}`)).toBe(false);
  });
});
