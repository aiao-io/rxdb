import { type EntityUpdateData, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { SqliteRepository } from '../../repository/SqliteRepository.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from '../../sqlite-core.utils.js';
import { Todo } from '../fixtures/Todo.js';

interface RecordedQuery {
  sql: string;
  params?: SQLiteCompatibleType[];
}

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

class RepositoryTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-repository-test';
  readonly queryCalls: RecordedQuery[] = [];

  constructor(
    rxdb: RxDB,
    private readonly queryHandler: QueryHandler
  ) {
    super(rxdb);
  }

  override query(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    this.queryCalls.push({ sql, params });
    return this.queryHandler(sql, params);
  }

  override writeQuery(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    this.queryCalls.push({ sql, params });
    return this.queryHandler(sql, params);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('RepositoryTestAdapter.createClient must not be called');
  }
}

const createRxdb = (dbName: string): RxDB => {
  const rxdb = new RxDB({
    dbName,
    entities: [Todo],
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const ISO = '2026-01-01T00:00:00.000Z';

const todoRowsResult = (sql: string, rows: (string | number)[][]): SqliteSuccessResult => ({
  sql,
  rowsAffected: rows.length,
  elapsed: 0,
  results: [{ columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'], rows }]
});

const emptyResult = (sql: string): SqliteSuccessResult => ({ sql, rowsAffected: 0, elapsed: 0, results: [] });

const createTodoRef = (rxdb: RxDB, id: string, title: string, local: boolean) =>
  rxdb.entityManager.createEntityRef(
    Todo,
    { id, title, completed: false, createdAt: new Date(ISO), updatedAt: new Date(ISO) } as EntityUpdateData<
      typeof Todo
    >,
    { local, modified: false }
  );

describe('SqliteRepository', () => {
  it('get 命中时返回实体并使用 LIMIT 1 查询', async () => {
    const rxdb = createRxdb('sqlite-core-repo-get');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[1, 'todo-1', 'hello', 0, ISO, ISO]])
    );
    const repository = new SqliteRepository(adapter, Todo);

    const entity = await repository.get('todo-1');

    expect(entity.id).toBe('todo-1');
    expect(entity.title).toBe('hello');
    expect(adapter.queryCalls).toHaveLength(1);
    expect(adapter.queryCalls[0].sql).toContain('LIMIT 1');
  });

  it('get 未命中时抛出 Entity not found', async () => {
    const rxdb = createRxdb('sqlite-core-repo-get-miss');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => todoRowsResult(sql, []));
    const repository = new SqliteRepository(adapter, Todo);

    await expect(repository.get('todo-miss')).rejects.toThrow(RxDBAdapterSqliteError);
    await expect(repository.get('todo-miss')).rejects.toThrow('Entity (todo-miss) not found');
  });

  it('find 返回实体数组并写入查询缓存', async () => {
    const rxdb = createRxdb('sqlite-core-repo-find');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [
        [1, 'todo-1', 'one', 0, ISO, ISO],
        [2, 'todo-2', 'two', 1, ISO, ISO]
      ])
    );
    const repository = new SqliteRepository(adapter, Todo);

    const entities = await repository.find({ where: { combinator: 'and', rules: [] } });

    expect(entities.map(entity => entity.id)).toEqual(['todo-1', 'todo-2']);
    expect(adapter.getEntityByRowId(2n, Todo)).toBe(entities[1]);
  });

  it('count 返回首行首列的数量', async () => {
    const rxdb = createRxdb('sqlite-core-repo-count');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => ({
      sql,
      rowsAffected: 0,
      elapsed: 0,
      results: [{ columns: ['count'], rows: [[5]] }]
    }));
    const repository = new SqliteRepository(adapter, Todo);

    await expect(repository.count({ where: { combinator: 'and', rules: [] } })).resolves.toBe(5);
    expect(adapter.queryCalls[0].sql).toContain('SELECT COUNT');
  });

  it('create 生成 INSERT 语句并强制刷新缓存', async () => {
    const rxdb = createRxdb('sqlite-core-repo-create');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[9, 'todo-create', 'created-in-db', 0, ISO, ISO]])
    );
    const repository = new SqliteRepository(adapter, Todo);
    const entity = createTodoRef(rxdb, 'todo-create', 'local-title', false);

    const created = await repository.create(entity);

    expect(created).toBe(entity);
    expect(adapter.queryCalls[0].sql).toMatch(/^INSERT INTO "public\$todos"/);
    expect(adapter.queryCalls[0].sql).toContain('RETURNING rowid as __rowid');
    expect(adapter.queryCalls[0].params).toContain('todo-create');
    expect(entity.title).toBe('created-in-db');
    expect(adapter.getEntityByRowId(9n, Todo)).toBe(entity);
  });

  it('update 生成 UPDATE 语句且 updatedAt 单调递增', async () => {
    const rxdb = createRxdb('sqlite-core-repo-update');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[3, 'todo-update', 'next', 0, ISO, '2026-01-03T00:00:00.000Z']])
    );
    const repository = new SqliteRepository(adapter, Todo);
    const entity = createTodoRef(rxdb, 'todo-update', 'before', true);

    const updated = await repository.update(entity, { title: 'next' } as Partial<InstanceType<typeof Todo>>);

    expect(updated).toBe(entity);
    const [call] = adapter.queryCalls;
    expect(call.sql).toMatch(/^UPDATE "public\$todos" SET/);
    expect(call.params).toContain('next');
    expect(call.params).toContain('todo-update');
    const updatedAtParam = call.params?.find(
      param => typeof param === 'string' && param.endsWith('Z') && param !== 'next'
    );
    expect(new Date(String(updatedAtParam)).getTime()).toBeGreaterThan(new Date(ISO).getTime());
  });

  it('remove 本地实体时执行 DELETE 并同步状态', async () => {
    const rxdb = createRxdb('sqlite-core-repo-remove');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => emptyResult(sql));
    const repository = new SqliteRepository(adapter, Todo);
    const entity = createTodoRef(rxdb, 'todo-remove', 'removing', true);

    const removed = await repository.remove(entity);

    expect(removed).toBe(entity);
    expect(adapter.queryCalls[0].sql).toMatch(/^DELETE FROM "public\$todos"/);
    expect(adapter.queryCalls[0].params).toEqual(['todo-remove']);
    const status = getEntityStatus(entity);
    expect(status.removed).toBe(true);
    expect(status.modified).toBe(false);
    expect((status.origin as { title?: string }).title).toBe('removing');
  });

  it('remove 非本地实体时抛错且不执行 SQL', async () => {
    const rxdb = createRxdb('sqlite-core-repo-remove-miss');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => emptyResult(sql));
    const repository = new SqliteRepository(adapter, Todo);
    const entity = createTodoRef(rxdb, 'todo-not-local', 'ghost', false);

    await expect(repository.remove(entity)).rejects.toThrow('not saved local');
    expect(adapter.queryCalls).toHaveLength(0);
  });
});
