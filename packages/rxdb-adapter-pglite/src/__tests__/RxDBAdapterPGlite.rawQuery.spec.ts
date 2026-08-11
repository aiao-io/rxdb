import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite - rawQuery', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: `rawquery-test-${Date.now()}`,
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    db.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('rows 应该以数组形式返回，并包含 columns', async () => {
    const todoRepo = adapter.getRepository(Todo);
    const firstTodo = new Todo();
    firstTodo.title = 'raw-a';
    firstTodo.completed = false;
    const secondTodo = new Todo();
    secondTodo.title = 'raw-b';
    secondTodo.completed = true;
    await todoRepo.create(firstTodo);
    await todoRepo.create(secondTodo);

    const res = await adapter.rawQuery('SELECT "title", "completed" FROM "public"."todos" ORDER BY "title"');

    expect(res.columns).toEqual(['title', 'completed']);
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.rows[0])).toBe(true);
    expect(res.rows[0][0]).toBe('raw-a');
  });

  it('DML 应该返回 rowsAffected', async () => {
    const todoRepo = adapter.getRepository(Todo);
    const todo = new Todo();
    todo.title = 'raw-update';
    todo.completed = false;
    await todoRepo.create(todo);
    const id = todo.id;

    const res = await adapter.rawQuery('UPDATE "public"."todos" SET "completed" = $1 WHERE "id" = $2', [true, id]);

    expect(res.rowsAffected).toBe(1);
  });

  it('空结果集应当返回 rows: [] 且不抛错', async () => {
    const res = await adapter.rawQuery('SELECT "id" FROM "public"."todos" WHERE "id" = $1', [
      '00000000-0000-0000-0000-000000000000'
    ]);
    expect(res.rows).toEqual([]);
    expect(res.columns).toEqual(['id']);
  });
});
