/**
 * @fileoverview UPDATE 回填行陈旧时不回退已合入的外部写（SQLite 侧接线）。
 *
 * 判定在 `EntityStatus.prepareUpdate().apply`；这里验证适配器把解码后的 RETURNING 行交给它：
 * UPDATE 已提交、回填尚未合入时，另一个来源的更晚写入先合进了缓存，回填不得把它连同 updatedAt 盖回旧值。
 */
import { type EntityUpdateData, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { SqliteRepository } from '../../repository/SqliteRepository.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { Todo } from '../fixtures/Todo.js';

const TODO_ID = '00000000-0000-4000-8000-000000000001';
const CREATED_AT = '2026-01-01T00:00:00.000Z';
const SAVED_AT = '2026-01-02T00:00:00.000Z';
const EXTERNAL_AT = '2026-01-03T00:00:00.000Z';

class WriteBackTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-stale-write-back-test';

  constructor(
    rxdb: RxDB,
    private readonly onWrite: (sql: string) => SqliteSuccessResult
  ) {
    super(rxdb);
  }

  override async writeQuery(sql: string): Promise<SqliteSuccessResult> {
    return this.onWrite(sql);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('WriteBackTestAdapter.createClient must not be called');
  }
}

describe('SqliteRepository.update 回填行陈旧', () => {
  it('写入提交后先合入的更晚外部写不被 RETURNING 旧行回退，本次写入的字段照常推进基线', async () => {
    const rxdb = new RxDB({
      dbName: 'sqlite-core-stale-write-back',
      entities: [Todo],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    rxdb.entityManager.init();
    const entity = rxdb.entityManager.createEntityRef(
      Todo,
      {
        id: TODO_ID,
        title: 'before',
        completed: false,
        createdAt: new Date(CREATED_AT),
        updatedAt: new Date(CREATED_AT)
      } as EntityUpdateData<typeof Todo>,
      { local: true, modified: false }
    );
    const adapter = new WriteBackTestAdapter(rxdb, sql => {
      // RETURNING 捕获的是提交那一刻的整行；回填之前，另一个来源改了 completed 并先合进缓存
      getEntityStatus(entity).applyExternal({ completed: true, updatedAt: new Date(EXTERNAL_AT) });
      return {
        sql,
        rowsAffected: 1,
        elapsed: 0,
        results: [
          {
            columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'],
            rows: [[1, TODO_ID, 'next', 0, CREATED_AT, SAVED_AT]]
          }
        ]
      };
    });
    // 测试子类多了替身成员，与基类的 repository_map 泛型不互相兼容（本包同类替身的通病），按 never 传入
    const repository = new SqliteRepository(adapter as never, Todo);
    entity.title = 'next';

    await repository.update(entity, getEntityStatus(entity).patch);

    const status = getEntityStatus(entity);
    expect(entity.completed).toBe(true);
    expect(status.origin.completed).toBe(true);
    expect(entity.updatedAt.toISOString()).toBe(EXTERNAL_AT);
    expect(entity.title).toBe('next');
    expect(status.origin.title).toBe('next');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });
});
