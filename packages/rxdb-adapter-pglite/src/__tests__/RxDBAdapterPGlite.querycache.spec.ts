import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('QueryCache 方法', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('getMetadataByIds', () => {
    it('空数组返回空 Map', async () => {
      const result = await firstValueFrom(adapter.getMetadataByIds('Todo', []));
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('能获取已存在实体的 updatedAt', async () => {
      const todo = new Todo();
      todo.title = 'Test';
      await todo.save();

      const result = await firstValueFrom(adapter.getMetadataByIds('Todo', [todo.id]));
      expect(result.size).toBe(1);
      expect(result.has(todo.id)).toBe(true);
      // updatedAt 应该是一个时间戳字符串或 Date
      const updatedAt = result.get(todo.id);
      expect(updatedAt).toBeDefined();
    });

    it('不存在的 ID 不会返回', async () => {
      const todo = new Todo();
      todo.title = 'Test';
      await todo.save();

      const nonExistentId = crypto.randomUUID();
      const result = await firstValueFrom(adapter.getMetadataByIds('Todo', [todo.id, nonExistentId]));
      expect(result.size).toBe(1);
      expect(result.has(todo.id)).toBe(true);
      expect(result.has(nonExistentId)).toBe(false);
    });

    it('能批量获取多个实体的 updatedAt', async () => {
      const todo1 = new Todo();
      todo1.title = 'Test 1';
      await todo1.save();

      const todo2 = new Todo();
      todo2.title = 'Test 2';
      await todo2.save();

      const result = await firstValueFrom(adapter.getMetadataByIds('Todo', [todo1.id, todo2.id]));
      expect(result.size).toBe(2);
      expect(result.has(todo1.id)).toBe(true);
      expect(result.has(todo2.id)).toBe(true);
    });
  });

  describe('upsertMany', () => {
    it('空数组不会出错', async () => {
      await expect(firstValueFrom(adapter.upsertMany('Todo', []))).resolves.toBeUndefined();
    });

    it('能插入新数据', async () => {
      const todoId = crypto.randomUUID();
      const now = new Date().toISOString();
      await firstValueFrom(
        adapter.upsertMany('Todo', [
          {
            id: todoId,
            title: 'Upserted Todo',
            completed: false,
            createdAt: now,
            updatedAt: now
          }
        ])
      );

      const result = await adapter.internalQuery<Todo>(`SELECT * FROM "public"."todos" WHERE id = $1`, [todoId]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].title).toBe('Upserted Todo');
    });

    it('能更新已存在的数据', async () => {
      const todo = new Todo();
      todo.title = 'Original';
      await todo.save();

      const now = new Date().toISOString();
      await firstValueFrom(
        adapter.upsertMany('Todo', [
          {
            id: todo.id,
            title: 'Updated via upsert',
            completed: true,
            createdAt: now,
            updatedAt: now
          }
        ])
      );

      const result = await adapter.internalQuery<Todo>(`SELECT * FROM "public"."todos" WHERE id = $1`, [todo.id]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].title).toBe('Updated via upsert');
      expect(result.rows[0].completed).toBe(true);
    });

    it('能批量 upsert 多条数据', async () => {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      const now = new Date().toISOString();

      await firstValueFrom(
        adapter.upsertMany('Todo', [
          { id: id1, title: 'Batch 1', completed: false, createdAt: now, updatedAt: now },
          { id: id2, title: 'Batch 2', completed: true, createdAt: now, updatedAt: now }
        ])
      );

      const result = await adapter.internalQuery<Todo>(`SELECT * FROM "public"."todos" WHERE id = ANY($1)`, [
        [id1, id2]
      ]);
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('deleteByIds', () => {
    it('空数组不会出错', async () => {
      await expect(firstValueFrom(adapter.deleteByIds('Todo', []))).resolves.toBeUndefined();
    });

    it('能删除存在的实体', async () => {
      const todo = new Todo();
      todo.title = 'To Delete';
      await todo.save();

      await firstValueFrom(adapter.deleteByIds('Todo', [todo.id]));

      const result = await adapter.internalQuery<Todo>(`SELECT * FROM "public"."todos" WHERE id = $1`, [todo.id]);
      expect(result.rows).toHaveLength(0);
    });

    it('删除不存在的 ID 不会出错', async () => {
      const nonExistentId = crypto.randomUUID();
      await expect(firstValueFrom(adapter.deleteByIds('Todo', [nonExistentId]))).resolves.toBeUndefined();
    });

    it('能批量删除多条数据', async () => {
      const todo1 = new Todo();
      todo1.title = 'Delete 1';
      await todo1.save();

      const todo2 = new Todo();
      todo2.title = 'Delete 2';
      await todo2.save();

      await firstValueFrom(adapter.deleteByIds('Todo', [todo1.id, todo2.id]));

      const result = await adapter.internalQuery<Todo>(`SELECT * FROM "public"."todos" WHERE id = ANY($1)`, [
        [todo1.id, todo2.id]
      ]);
      expect(result.rows).toHaveLength(0);
    });
  });
});
