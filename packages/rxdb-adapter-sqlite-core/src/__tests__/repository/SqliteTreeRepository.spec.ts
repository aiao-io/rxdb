import { getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { SqliteTreeRepository } from '../../repository/SqliteTreeRepository.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';

interface RecordedQuery {
  sql: string;
  params?: SQLiteCompatibleType[];
}

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

class TreeRepositoryTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-tree-repository-test';
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
    throw new Error('TreeRepositoryTestAdapter.createClient must not be called');
  }
}

const createRxdb = (dbName: string): RxDB => {
  const rxdb = new RxDB({
    dbName,
    entities: [MenuLarge],
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const ISO = '2026-01-01T00:00:00.000Z';

const menuRowsResult = (sql: string, rows: (string | number | null)[][]): SqliteSuccessResult => ({
  sql,
  rowsAffected: 0,
  elapsed: 0,
  results: [
    {
      columns: ['__rowid', 'id', 'title', 'sort_order', 'parentId', 'createdAt', 'updatedAt', 'hasChildren'],
      rows
    }
  ]
});

const countResult = (sql: string, count: number): SqliteSuccessResult => ({
  sql,
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns: ['count'], rows: [[count]] }]
});

describe('SqliteTreeRepository', () => {
  it('findDescendants 生成递归查询并返回实体', async () => {
    const rxdb = createRxdb('sqlite-core-tree-descendants');
    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql =>
      menuRowsResult(sql, [
        [1, 'menu-root', 'root', null, null, ISO, ISO, 1],
        [2, 'menu-child', 'child', null, 'menu-root', ISO, ISO, 0]
      ])
    );
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    const entities = await repository.findDescendants({ entityId: 'menu-root' });

    expect(adapter.queryCalls[0].sql).toContain('WITH RECURSIVE');
    expect(adapter.queryCalls[0].params).toEqual(['menu-root']);
    expect(entities.map(entity => entity.id)).toEqual(['menu-root', 'menu-child']);
    expect(entities[0].hasChildren).toBe(true);
    expect(entities[1].hasChildren).toBe(false);
  });

  it('findDescendants 强制回填数据库行并重置 origin（P0-004 掩盖层，勿改）', async () => {
    const rxdb = createRxdb('sqlite-core-tree-descendants-forced');
    const localRoot = rxdb.entityManager.createEntityRef(MenuLarge, {
      id: 'menu-root',
      title: 'stale-title',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO)
    });
    localRoot.hasChildren = false;

    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql =>
      menuRowsResult(sql, [[1, 'menu-root', 'db-title', null, null, ISO, ISO, 1]])
    );
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    const entities = await repository.findDescendants({ entityId: 'menu-root' });

    expect(entities).toHaveLength(1);
    expect(entities[0]).toBe(localRoot);
    // forcedUpdate：数据库行覆盖内存值，并把 origin 重置为数据库状态
    expect(entities[0].title).toBe('db-title');
    expect(entities[0].hasChildren).toBe(true);
    expect(getEntityStatus(entities[0]).origin.title).toBe('db-title');
  });

  it('countDescendants 返回首行首列数量', async () => {
    const rxdb = createRxdb('sqlite-core-tree-count-descendants');
    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql => countResult(sql, 3));
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    await expect(repository.countDescendants({ entityId: 'menu-root' })).resolves.toBe(3);
    expect(adapter.queryCalls[0].sql).toContain('count(*)-1');
  });

  it('findAncestors 查询祖先链并返回实体', async () => {
    const rxdb = createRxdb('sqlite-core-tree-ancestors');
    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql =>
      menuRowsResult(sql, [
        [2, 'menu-child', 'child', null, 'menu-root', ISO, ISO, 0],
        [1, 'menu-root', 'root', null, null, ISO, ISO, 1]
      ])
    );
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    const entities = await repository.findAncestors({ entityId: 'menu-child' });

    expect(adapter.queryCalls[0].sql).toContain('WITH RECURSIVE');
    expect(adapter.queryCalls[0].params).toEqual(['menu-child']);
    expect(entities.map(entity => entity.id)).toEqual(['menu-child', 'menu-root']);
  });

  it('findAncestors 强制回填数据库行并重置 origin（P0-004 掩盖层，勿改）', async () => {
    const rxdb = createRxdb('sqlite-core-tree-ancestors-forced');
    const localChild = rxdb.entityManager.createEntityRef(MenuLarge, {
      id: 'menu-child',
      title: 'stale-child-title',
      parentId: 'stale-parent',
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO)
    });
    localChild.hasChildren = true;

    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql =>
      menuRowsResult(sql, [[2, 'menu-child', 'db-child', null, 'menu-root', ISO, ISO, 0]])
    );
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    const entities = await repository.findAncestors({ entityId: 'menu-child' });

    expect(entities).toHaveLength(1);
    expect(entities[0]).toBe(localChild);
    // 关键：parentId 必须回到数据库值，否则订阅在父级二次变更时不再发射
    expect(entities[0].parentId).toBe('menu-root');
    expect(entities[0].title).toBe('db-child');
    expect(entities[0].hasChildren).toBe(false);
    expect(getEntityStatus(entities[0]).origin.parentId).toBe('menu-root');
  });

  it('countAncestors 返回首行首列数量', async () => {
    const rxdb = createRxdb('sqlite-core-tree-count-ancestors');
    const adapter = new TreeRepositoryTestAdapter(rxdb, async sql => countResult(sql, 1));
    const repository = new SqliteTreeRepository(adapter, MenuLarge);

    await expect(repository.countAncestors({ entityId: 'menu-child' })).resolves.toBe(1);
    expect(adapter.queryCalls[0].sql).toContain('count(*)-1');
  });
});
