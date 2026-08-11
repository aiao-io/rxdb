import { type EntityUpdateData, getEntityStatus, RxDB, type RxDBMutationsMap, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { rxdb_adapter_mutations } from '../rxdb_adapter_mutations.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { Todo } from './fixtures/Todo.js';

class MutationTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-mutation-test';

  constructor(
    rxdb: RxDB,
    private readonly queryHandler: (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>
  ) {
    super(rxdb);
  }

  override query(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    return this.queryHandler(sql, params);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('MutationTestAdapter.createClient must not be called');
  }
}

const createTodoData = (id: string, title: string, updatedAt: Date): EntityUpdateData<typeof Todo> =>
  ({
    id,
    title,
    completed: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt
  }) as EntityUpdateData<typeof Todo>;

describe('rxdb_adapter_mutations', () => {
  it('空 patch 实体不写 UPDATE，但仍参与批量回查和状态同步', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-no-op-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const originalUpdatedAt = new Date('2026-01-02T00:00:00.000Z');
    const noOp = rxdb.entityManager.createEntityRef(Todo, createTodoData('todo-no-op', 'same', originalUpdatedAt), {
      local: true,
      modified: false
    });
    const changed = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-changed', 'before', originalUpdatedAt),
      { local: true, modified: false }
    );

    noOp.title = 'temporary';
    noOp.title = 'same';
    changed.title = 'after';

    expect(getEntityStatus(noOp).modified).toBe(true);
    expect(getEntityStatus(noOp).patch).toEqual({});
    expect(getEntityStatus(changed).patch).toEqual({ title: 'after' });

    const queryCalls: Array<{ sql: string; params?: SQLiteCompatibleType[] }> = [];
    const query = async (sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> => {
      queryCalls.push({ sql, params });
      if (!sql.startsWith('SELECT ')) {
        return { sql, rowsAffected: 1, elapsed: 0, results: [] };
      }

      return {
        sql,
        rowsAffected: 0,
        elapsed: 0,
        results: [
          {
            columns: ['id', 'title', 'completed', 'createdAt', 'updatedAt'],
            rows: [
              [noOp.id, 'same', 0, '2026-01-01T00:00:00.000Z', originalUpdatedAt.toISOString()],
              [changed.id, 'after', 0, '2026-01-01T00:00:00.000Z', '2026-01-03T00:00:00.000Z']
            ]
          }
        ]
      };
    };

    const adapter = new MutationTestAdapter(rxdb, query);

    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map(),
      update: new Map([[Todo, new Set([noOp, changed])]]),
      remove: new Map()
    };

    const result = await rxdb_adapter_mutations(adapter, mutations);
    const updateCalls = queryCalls.filter(call => call.sql.startsWith('UPDATE '));
    const selectCalls = queryCalls.filter(call => call.sql.startsWith('SELECT '));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.params).toContain(changed.id);
    expect(updateCalls[0]?.params).not.toContain(noOp.id);
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]?.params).toEqual([noOp.id, changed.id]);
    expect(result).toEqual([noOp, changed]);
    expect(noOp.updatedAt).toEqual(originalUpdatedAt);
    expect(getEntityStatus(noOp).modified).toBe(false);
    expect(getEntityStatus(changed).modified).toBe(false);
  });

  it('创建实体走批量 INSERT 并回查同步，回查陌生行时新建实体', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-create-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const created = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-create', 'local-title', new Date('2026-01-02T00:00:00.000Z'))
    );

    const queryCalls: Array<{ sql: string; params?: SQLiteCompatibleType[] }> = [];
    const query = async (sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> => {
      queryCalls.push({ sql, params });
      if (!sql.startsWith('SELECT ')) {
        return { sql, rowsAffected: 1, elapsed: 0, results: [] };
      }
      return {
        sql,
        rowsAffected: 0,
        elapsed: 0,
        results: [
          {
            columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'],
            rows: [
              [1, 'todo-create', 'saved-in-db', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'],
              [2, 'todo-ghost', 'ghost-row', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']
            ]
          }
        ]
      };
    };

    const adapter = new MutationTestAdapter(rxdb, query);
    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map([[Todo, new Set([created])]]),
      update: new Map(),
      remove: new Map()
    };

    const result = await rxdb_adapter_mutations(adapter, mutations);

    expect(result).toEqual([created]);
    const insertCalls = queryCalls.filter(call => call.sql.startsWith('INSERT INTO "public$todos"'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].params).toContain('todo-create');
    const selectCalls = queryCalls.filter(call => call.sql.startsWith('SELECT '));
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].params).toEqual(['todo-create']);

    expect(created.title).toBe('saved-in-db');
    expect(getEntityStatus(created)).toMatchObject({ local: true, modified: false });
    expect(adapter.getEntityByRowId(1n, Todo)).toBe(created);

    // 回查结果中未知 id 的行会通过 entityManager 新建实体并缓存 rowid
    const ghost = rxdb.entityManager.getEntityRef(Todo, 'todo-ghost');
    expect(ghost).toBeDefined();
    expect(ghost?.title).toBe('ghost-row');
    expect(getEntityStatus(ghost!)).toMatchObject({ local: true, modified: false });
    expect(adapter.getEntityByRowId(2n, Todo)).toBe(ghost);
  });

  it('实体不在 entityManager 缓存时回查后重新加入缓存', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-recache-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const created = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-recache', 'local-title', new Date('2026-01-02T00:00:00.000Z'))
    );
    rxdb.entityManager.removeEntityCache(created);
    expect(rxdb.entityManager.getEntityRef(Todo, 'todo-recache')).toBeUndefined();

    const query = async (sql: string): Promise<SqliteSuccessResult> => {
      if (!sql.startsWith('SELECT ')) {
        return { sql, rowsAffected: 1, elapsed: 0, results: [] };
      }
      return {
        sql,
        rowsAffected: 0,
        elapsed: 0,
        results: [
          {
            columns: ['id', 'title', 'completed', 'createdAt', 'updatedAt'],
            rows: [['todo-recache', 'db-title', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']]
          }
        ]
      };
    };

    const adapter = new MutationTestAdapter(rxdb, query);
    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map([[Todo, new Set([created])]]),
      update: new Map(),
      remove: new Map()
    };

    const result = await rxdb_adapter_mutations(adapter, mutations);

    expect(result).toEqual([created]);
    expect(rxdb.entityManager.getEntityRef(Todo, 'todo-recache')).toBe(created);
    expect(created.title).toBe('db-title');
  });

  it('缺少 id 列的回查结果集被跳过，不影响其他结果集', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-no-id-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const created = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-mixed', 'local-title', new Date('2026-01-02T00:00:00.000Z'))
    );

    const query = async (sql: string): Promise<SqliteSuccessResult> => {
      if (!sql.startsWith('SELECT ')) {
        return { sql, rowsAffected: 1, elapsed: 0, results: [] };
      }
      return {
        sql,
        rowsAffected: 0,
        elapsed: 0,
        results: [
          { columns: ['title'], rows: [['orphan-without-id']] },
          {
            columns: ['id', 'title', 'completed', 'createdAt', 'updatedAt'],
            rows: [['todo-mixed', 'db-title', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']]
          }
        ]
      };
    };

    const adapter = new MutationTestAdapter(rxdb, query);
    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map([[Todo, new Set([created])]]),
      update: new Map(),
      remove: new Map()
    };

    await expect(rxdb_adapter_mutations(adapter, mutations)).resolves.toEqual([created]);
    expect(created.title).toBe('db-title');
  });

  it('删除实体生成批量 DELETE 并同步 removed 状态', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-delete-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const first = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-del-1', 'first', new Date('2026-01-02T00:00:00.000Z')),
      { local: true, modified: false }
    );
    const second = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-del-2', 'second', new Date('2026-01-02T00:00:00.000Z')),
      { local: true, modified: false }
    );

    const queryCalls: Array<{ sql: string; params?: SQLiteCompatibleType[] }> = [];
    const query = async (sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> => {
      queryCalls.push({ sql, params });
      return { sql, rowsAffected: 2, elapsed: 0, results: [] };
    };

    const adapter = new MutationTestAdapter(rxdb, query);
    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map(),
      update: new Map(),
      remove: new Map([[Todo, new Set([first, second])]])
    };

    const result = await rxdb_adapter_mutations(adapter, mutations);

    expect(result).toEqual([first, second]);
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].sql).toMatch(/^DELETE FROM "public\$todos"/);
    expect(queryCalls[0].sql).toContain(`'todo-del-1'`);
    expect(queryCalls[0].sql).toContain(`'todo-del-2'`);

    for (const entity of [first, second]) {
      const status = getEntityStatus(entity);
      expect(status.removed).toBe(true);
      expect(status.local).toBe(false);
      expect(status.modified).toBe(false);
    }
    expect((getEntityStatus(first).origin as { title?: string }).title).toBe('first');
  });

  // SQLC-033：删除路径同样要回收 rowid 强引用，否则 #row_id_map 永远抓着已删实体
  it('删除实体回收 rowid 双向映射', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-delete-rowid-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const entity = rxdb.entityManager.createEntityRef(
      Todo,
      createTodoData('todo-del-rowid', 'first', new Date('2026-01-02T00:00:00.000Z')),
      { local: true, modified: false }
    );

    const query = async (sql: string): Promise<SqliteSuccessResult> => ({
      sql,
      rowsAffected: 1,
      elapsed: 0,
      results: []
    });

    const adapter = new MutationTestAdapter(rxdb, query);
    adapter.cacheRowIdEntity(88n, entity);

    await rxdb_adapter_mutations(adapter, {
      create: new Map(),
      update: new Map(),
      remove: new Map([[Todo, new Set([entity])]])
    } satisfies RxDBMutationsMap<typeof Todo>);

    expect(adapter.getEntityByRowId(88n, Todo)).toBeUndefined();
    expect(adapter.getRowIdByEntity(entity)).toBeUndefined();
  });

  it('空删除集合不产生 DELETE 语句', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-empty-delete-mutations',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();

    const queryCalls: string[] = [];
    const query = async (sql: string): Promise<SqliteSuccessResult> => {
      queryCalls.push(sql);
      return { sql, rowsAffected: 0, elapsed: 0, results: [] };
    };

    const adapter = new MutationTestAdapter(rxdb, query);
    const mutations: RxDBMutationsMap<typeof Todo> = {
      create: new Map(),
      update: new Map(),
      remove: new Map([[Todo, new Set<InstanceType<typeof Todo>>()]])
    };

    await expect(rxdb_adapter_mutations(adapter, mutations)).resolves.toEqual([]);
    expect(queryCalls).toHaveLength(0);
  });
});
