import {
  ENTITY_LOCAL_UPDATE_EVENT,
  RxDB,
  SyncType,
  uuid,
  type RuleGroup,
  type RxDBEntityLocalUpdatedEventData,
  type TransactionExecutor
} from '@aiao/rxdb';
import { ConformanceNote } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const opened: RxDB[] = [];
const cleanups: Array<() => void> = [];
const POLL = { timeout: 5_000 };
const where: RuleGroup<ConformanceNote> = {
  combinator: 'and',
  rules: [
    { field: 'title', operator: '=', value: 'ready' },
    { field: 'body', operator: '=', value: 'shared' }
  ]
};

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const openConnection = async (dbName: string): Promise<RxDB> => {
  const database = new RxDB({
    dbName,
    context: { userId: 'cross-tab-query' },
    entities: [ConformanceNote],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  database.adapter(
    'wa-sqlite',
    async db =>
      new RxDBAdapterWaSqlite(db, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      })
  );
  opened.push(database);
  await database.connect('wa-sqlite');
  return database;
};

const openPair = async (): Promise<{ a: RxDB; b: RxDB; id: ConformanceNote['id'] }> => {
  const dbName = `lq-${uuid()}`;
  const a = await openConnection(dbName);
  const id = uuid();
  const adapter = await a.getAdapter('wa-sqlite');
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const note = a.entityManager.createEntityRef(ConformanceNote, { id, title: 'draft', body: 'shared' });
    await executor.getRepository(ConformanceNote).create(note);
  });
  const b = await openConnection(dbName);
  expect(b.entityManager.hasEntityRef(ConformanceNote, id)).toBe(false);
  return { a, b, id };
};

const renameNote = async (database: RxDB, id: ConformanceNote['id'], title: string): Promise<void> => {
  const adapter = await database.getAdapter('wa-sqlite');
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const repository = executor.getRepository(ConformanceNote);
    const [note] = await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
    });
    await repository.update(note, { title });
  });
};

const receivedUpdates = (database: RxDB, id: ConformanceNote['id']): RxDBEntityLocalUpdatedEventData[] => {
  const received: RxDBEntityLocalUpdatedEventData[] = [];
  const listener = (event: { entities: RxDBEntityLocalUpdatedEventData[] }): void => {
    for (const entity of event.entities) {
      if (entity.id === id && entity.origin === 'cross-tab') received.push(structuredClone(entity));
    }
  };
  database.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
  cleanups.push(() => database.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener));
  return received;
};

const expectIncrementalUpdate = (event: RxDBEntityLocalUpdatedEventData, title: string): void => {
  expect(event.patch).toMatchObject({ title });
  expect(event.patch).not.toHaveProperty('body');
  expect(event.inversePatch).not.toHaveProperty('body');
};

describe('真实双连接的跨 Tab 增量 UPDATE 与未缓存实体的活查询', () => {
  it.each([false, true])('接收端只有 count，复合筛选跨界后自动重数（先收到未匹配更新：%s）', async primeCache => {
    const { a, b, id } = await openPair();
    const counts: number[] = [];
    const subscription = b.entityManager
      .getRepository(ConformanceNote)
      .count({ where })
      .subscribe(count => {
        counts.push(count);
      });
    cleanups.push(() => subscription.unsubscribe());
    await expect.poll(() => counts.at(-1), POLL).toBe(0);
    expect(b.entityManager.hasEntityRef(ConformanceNote, id)).toBe(false);
    const updates = receivedUpdates(b, id);

    if (primeCache) {
      await renameNote(a, id, 'queued');
      await expect.poll(() => updates.length, POLL).toBe(1);
      expectIncrementalUpdate(updates[0], 'queued');
    }
    await renameNote(a, id, 'ready');
    await expect.poll(() => updates.length, POLL).toBe(primeCache ? 2 : 1);
    expectIncrementalUpdate(updates.at(-1)!, 'ready');
    await expect.poll(() => counts.at(-1), POLL).toBe(1);
  });

  it.each(['findAll', 'find', 'findByCursor'] as const)(
    '接收端 %s 结果为空，另一个连接的增量 UPDATE 让实体首次满足复合筛选',
    async queryType => {
      const { a, b, id } = await openPair();
      const repository = b.entityManager.getRepository(ConformanceNote);
      const options = { where, orderBy: [{ field: 'id', sort: 'asc' as const }], limit: 10 };
      const results: string[][] = [];
      const subscription = repository[queryType](options).subscribe(notes => {
        results.push(notes.map(note => note.id));
      });
      cleanups.push(() => subscription.unsubscribe());
      await expect.poll(() => results.at(-1), POLL).toEqual([]);
      expect(b.entityManager.hasEntityRef(ConformanceNote, id)).toBe(false);
      const updates = receivedUpdates(b, id);

      await renameNote(a, id, 'ready');
      await expect.poll(() => updates.length, POLL).toBe(1);
      expectIncrementalUpdate(updates[0], 'ready');
      await expect.poll(() => results.at(-1), POLL).toEqual([id]);
    }
  );

  it('findAll 单字段筛选已知新匹配时，新增结果仍包含未改的完整字段', async () => {
    const { a, b, id } = await openPair();
    const results: Array<Array<{ id: string; title: string; body: string | null }>> = [];
    const subscription = b.entityManager
      .getRepository(ConformanceNote)
      .findAll({ where: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'ready' }] } })
      .subscribe(notes => {
        results.push(notes.map(note => ({ id: note.id, title: note.title, body: note.body })));
      });
    cleanups.push(() => subscription.unsubscribe());
    await expect.poll(() => results.at(-1), POLL).toEqual([]);
    expect(b.entityManager.hasEntityRef(ConformanceNote, id)).toBe(false);
    const updates = receivedUpdates(b, id);

    await renameNote(a, id, 'ready');
    await expect.poll(() => updates.length, POLL).toBe(1);
    expectIncrementalUpdate(updates[0], 'ready');
    await expect.poll(() => results.at(-1), POLL).toEqual([{ id, title: 'ready', body: 'shared' }]);
  });

  it('findAll 使用空筛选时，已缓存完整实体的跨 Tab 更新继续走增量合并', async () => {
    const { a, b, id } = await openPair();
    const results: Array<Array<{ id: string; title: string; body: string | null }>> = [];
    const subscription = b.entityManager
      .getRepository(ConformanceNote)
      .findAll({ where: { combinator: 'and', rules: [] } })
      .subscribe(notes => {
        results.push(notes.map(note => ({ id: note.id, title: note.title, body: note.body })));
      });
    cleanups.push(() => subscription.unsubscribe());
    await expect.poll(() => results.at(-1), POLL).toEqual([{ id, title: 'draft', body: 'shared' }]);
    const adapter = await b.getAdapter('wa-sqlite');
    const queries = vi.spyOn(adapter, 'transaction');
    cleanups.push(() => queries.mockRestore());
    const updates = receivedUpdates(b, id);

    await renameNote(a, id, 'ready');
    await expect.poll(() => updates.length, POLL).toBe(1);
    expectIncrementalUpdate(updates[0], 'ready');
    await expect.poll(() => results.at(-1), POLL).toEqual([{ id, title: 'ready', body: 'shared' }]);
    expect(queries).not.toHaveBeenCalled();
  });
});
