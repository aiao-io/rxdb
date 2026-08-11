import { type EntityUpdateData, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { SqliteRepositoryBase } from '../../repository/SqliteRepositoryBase.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { Todo } from '../fixtures/Todo.js';

interface RecordedQuery {
  sql: string;
  params?: SQLiteCompatibleType[];
}

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

class RepositoryTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-repository-base-test';
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
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'], rows }]
});

const createTodoRef = (rxdb: RxDB, id: string, title: string) =>
  rxdb.entityManager.createEntityRef(
    Todo,
    { id, title, completed: false, createdAt: new Date(ISO), updatedAt: new Date(ISO) } as EntityUpdateData<
      typeof Todo
    >,
    { local: true, modified: false }
  );

describe('SqliteRepositoryBase', () => {
  it('findByRowIds 全部缓存命中时不回库', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-cache-hit');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => todoRowsResult(sql, []));
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const first = createTodoRef(rxdb, 'todo-1', 'first');
    const second = createTodoRef(rxdb, 'todo-2', 'second');
    adapter.cacheRowIdEntity(1n, first);
    adapter.cacheRowIdEntity(2n, second);

    const entities = await repository.findByRowIds([1n, 2n]);

    expect(entities).toEqual([first, second]);
    expect(adapter.queryCalls).toHaveLength(0);
  });

  it('findByRowIds 强制刷新时回查 UPDATE 行并原位刷新 identity cache', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-force-refresh');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[1, 'todo-1', 'fresh', 1, ISO, '2026-01-01T00:00:01.000Z']])
    );
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const cached = createTodoRef(rxdb, 'todo-1', 'stale');
    adapter.cacheRowIdEntity(1n, cached);

    const entities = await repository.findByRowIds([1n], true);

    expect(adapter.queryCalls).toHaveLength(1);
    expect(entities).toEqual([cached]);
    expect(entities[0]).toBe(cached);
    expect(cached.title).toBe('fresh');
    expect(cached.completed).toBe(true);
  });

  it('findByRowIds 强制刷新时保留未保存字段并同步其他数据库字段', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-force-refresh-dirty');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[1, 'todo-1', 'db-title', 1, ISO, '2026-01-01T00:00:01.000Z']])
    );
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const cached = createTodoRef(rxdb, 'todo-1', 'persisted');
    adapter.cacheRowIdEntity(1n, cached);
    cached.title = 'draft';

    const entities = await repository.findByRowIds([1n], true);

    expect(entities).toEqual([cached]);
    expect(cached.title).toBe('draft');
    expect(cached.completed).toBe(true);
    const status = getEntityStatus(cached);
    expect(status.origin.title).toBe('db-title');
    expect(status.patch).toMatchObject({ title: 'draft' });
    expect(status.modified).toBe(true);
  });

  it('findByRowIds 强制刷新查询不到行时不返回陈旧缓存', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-force-refresh-missing');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => todoRowsResult(sql, []));
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const cached = createTodoRef(rxdb, 'todo-1', 'stale');
    adapter.cacheRowIdEntity(1n, cached);

    const entities = await repository.findByRowIds([1n], true);

    expect(entities).toEqual([]);
    expect(adapter.getEntityByRowId(1n, Todo)).toBe(cached);
  });

  it('findByRowIds 只回查缺失行并按入参顺序返回', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-partial');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[2, 'todo-2', 'second', 0, ISO, ISO]])
    );
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const first = createTodoRef(rxdb, 'todo-1', 'first');
    adapter.cacheRowIdEntity(1n, first);

    const entities = await repository.findByRowIds([2n, 1n, 99n]);

    expect(adapter.queryCalls).toHaveLength(1);
    expect(adapter.queryCalls[0].params).toEqual([2n, 99n]);
    expect(entities.map(entity => entity.id)).toEqual(['todo-2', 'todo-1']);
  });

  it('findByRowIds 对已标记 removed 的缓存实体回库重查', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-removed');
    const adapter = new RepositoryTestAdapter(rxdb, async sql =>
      todoRowsResult(sql, [[1, 'todo-1', 'reborn', 0, ISO, ISO]])
    );
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const cached = createTodoRef(rxdb, 'todo-1', 'first');
    adapter.cacheRowIdEntity(1n, cached);
    getEntityStatus(cached).removed = true;

    const entities = await repository.findByRowIds([1n]);

    expect(adapter.queryCalls).toHaveLength(1);
    expect(entities).toEqual([cached]);
    expect(getEntityStatus(cached).removed).toBe(false);
  });

  it('findByRowIds 超出绑定上限时分片回库', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-chunk');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => todoRowsResult(sql, []));
    const repository = new SqliteRepositoryBase(adapter, Todo);
    const rowIds = Array.from({ length: 1000 }, (_, index) => BigInt(index + 1));

    const entities = await repository.findByRowIds(rowIds);

    expect(entities).toEqual([]);
    expect(adapter.queryCalls).toHaveLength(2);
    expect(adapter.queryCalls[0].params).toHaveLength(999);
    expect(adapter.queryCalls[1].params).toHaveLength(1);
  });

  it('addQueryCache 委托 transaction_sqlite_result 转换结果', async () => {
    const rxdb = createRxdb('sqlite-core-repo-base-add-cache');
    const adapter = new RepositoryTestAdapter(rxdb, async sql => todoRowsResult(sql, []));
    const repository = new SqliteRepositoryBase(adapter, Todo);

    const entities = await repository.addQueryCache(todoRowsResult('SELECT', [[5, 'todo-5', 'five', 1, ISO, ISO]]));

    expect(entities).toHaveLength(1);
    expect(entities[0].title).toBe('five');
    expect(adapter.getEntityByRowId(5n, Todo)).toBe(entities[0]);
  });
});
