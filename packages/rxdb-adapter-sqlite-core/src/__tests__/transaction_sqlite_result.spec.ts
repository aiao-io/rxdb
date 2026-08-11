import {
  encodeRxDBChangeEntityId,
  encodeRxDBChangePatch,
  Entity,
  EntityBase,
  type EntityUpdateData,
  getEntityMetadata,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../sqlite-core.interface.js';
import {
  remove_entity_ids_from_cache,
  transaction_sqlite_result,
  update_entity_from_sqlite_result
} from '../transaction_sqlite_result.js';
import { Todo } from './fixtures/Todo.js';

class ResultTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-result-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('ResultTestAdapter.createClient must not be called');
  }
}

@Entity({
  name: 'ResultTypedRecord',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'amount', type: PropertyType.bigint },
    { name: 'payload', type: PropertyType.binary },
    { name: 'secretAmount', type: PropertyType.bigint, encrypted: true },
    { name: 'secretPayload', type: PropertyType.binary, encrypted: true },
    { name: 'data', type: PropertyType.json }
  ]
})
class ResultTypedRecord extends EntityBase<bigint> {
  declare id: bigint;
  amount!: bigint;
  payload!: Uint8Array;
  secretAmount!: bigint;
  secretPayload!: Uint8Array;
  data!: Record<string, unknown>;
}

const createRxdb = (dbName: string): RxDB => {
  const rxdb = new RxDB({
    dbName,
    entities: [Todo, MenuLarge, ResultTypedRecord],
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const ISO_CREATED = '2026-01-01T00:00:00.000Z';
const ISO_UPDATED = '2026-01-02T00:00:00.000Z';

const todoResult = (rows: (string | number)[][], withRowId = true): SqliteSuccessResult => ({
  sql: 'SELECT',
  rowsAffected: 0,
  elapsed: 0,
  results: [
    {
      columns:
        withRowId ?
          ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt']
        : ['id', 'title', 'completed', 'createdAt', 'updatedAt'],
      rows
    }
  ]
});

const createTodoRef = (rxdb: RxDB, id: string, title: string) =>
  rxdb.entityManager.createEntityRef(
    Todo,
    {
      id,
      title,
      completed: false,
      createdAt: new Date(ISO_CREATED),
      updatedAt: new Date(ISO_UPDATED)
    } as EntityUpdateData<typeof Todo>,
    { local: true, modified: false }
  );

describe('transaction_sqlite_result', () => {
  it('未缓存实体时创建新实体并写入 rowid 缓存', async () => {
    const rxdb = createRxdb('sqlite-core-result-create');
    const adapter = new ResultTestAdapter(rxdb);

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([
        [1, 'todo-1', 'first', 0, ISO_CREATED, ISO_UPDATED],
        [2, 'todo-2', 'second', 1, ISO_CREATED, ISO_UPDATED]
      ])
    );

    expect(entities).toHaveLength(2);
    expect(entities[0].title).toBe('first');
    expect(entities[1].completed).toBe(true);
    expect(getEntityStatus(entities[0])).toMatchObject({ local: true, modified: false });
    expect(adapter.getEntityByRowId(1n, Todo)).toBe(entities[0]);
    expect(adapter.getRowIdByEntity(entities[1])).toBe(2n);
    expect(rxdb.entityManager.getEntityRef(Todo, 'todo-1')).toBe(entities[0]);
  });

  it('结果集缺少 id 列时跳过整个结果集', async () => {
    const rxdb = createRxdb('sqlite-core-result-no-id');
    const adapter = new ResultTestAdapter(rxdb);

    const entities = await transaction_sqlite_result(adapter, Todo, {
      sql: 'SELECT',
      rowsAffected: 0,
      elapsed: 0,
      results: [{ columns: ['title'], rows: [['orphan']] }]
    });

    expect(entities).toEqual([]);
  });

  it('skipCreate 时未缓存的行被跳过', async () => {
    const rxdb = createRxdb('sqlite-core-result-skip-create');
    const adapter = new ResultTestAdapter(rxdb);

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[1, 'todo-miss', 'ghost', 0, ISO_CREATED, ISO_UPDATED]]),
      false,
      true
    );

    expect(entities).toEqual([]);
    expect(rxdb.entityManager.getEntityRef(Todo, 'todo-miss')).toBeUndefined();
  });

  it('缓存命中且非强制更新时保留原有属性', async () => {
    const rxdb = createRxdb('sqlite-core-result-cached');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = createTodoRef(rxdb, 'todo-cached', 'origin-title');

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[7, 'todo-cached', 'db-title', 0, ISO_CREATED, ISO_UPDATED]])
    );

    expect(entities[0]).toBe(cached);
    expect(cached.title).toBe('origin-title');
    expect(adapter.getEntityByRowId(7n, Todo)).toBe(cached);
  });

  it('缓存命中时清除 removed 标志（结果行存在即代表数据库中未被删除）', async () => {
    const rxdb = createRxdb('sqlite-core-result-revive');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = createTodoRef(rxdb, 'todo-revived', 'origin-title');
    getEntityStatus(cached).removed = true;

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[9, 'todo-revived', 'db-title', 0, ISO_CREATED, ISO_UPDATED]])
    );

    expect(entities[0]).toBe(cached);
    expect(getEntityStatus(cached).removed).toBe(false);
  });

  it('forcedUpdate 时覆盖实体属性并刷新 origin', async () => {
    const rxdb = createRxdb('sqlite-core-result-forced');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = createTodoRef(rxdb, 'todo-forced', 'origin-title');

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[8, 'todo-forced', 'db-title', 1, ISO_CREATED, ISO_UPDATED]]),
      true
    );

    expect(entities[0]).toBe(cached);
    expect(cached.title).toBe('db-title');
    expect(cached.completed).toBe(true);
    const status = getEntityStatus(cached);
    expect(status.modified).toBe(false);
    expect((status.origin as { title?: string }).title).toBe('db-title');
  });

  it('forcedUpdate 时 binary origin 与实体引用隔离', async () => {
    const rxdb = createRxdb('sqlite-core-result-binary-origin');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = rxdb.entityManager.createEntityRef(
      ResultTypedRecord,
      { id: 1n, amount: 5n, payload: new Uint8Array([1, 2]) } as EntityUpdateData<typeof ResultTypedRecord>,
      { local: true, modified: false }
    );

    await transaction_sqlite_result(
      adapter,
      ResultTypedRecord,
      {
        sql: 'SELECT',
        rowsAffected: 0,
        elapsed: 0,
        results: [{ columns: ['id', 'amount', 'payload'], rows: [[1n, 5n, new Uint8Array([5, 6])]] }]
      },
      true
    );

    const status = getEntityStatus(cached);
    expect(status.origin.payload).toEqual(new Uint8Array([5, 6]));
    expect(status.origin.payload).not.toBe(cached.payload);

    cached.payload[0] = 7;

    expect(status.origin.payload).toEqual(new Uint8Array([5, 6]));
  });

  it('计算属性 hasChildren 在非强制更新时也会刷新', async () => {
    const rxdb = createRxdb('sqlite-core-result-computed');
    const adapter = new ResultTestAdapter(rxdb);
    const menu = rxdb.entityManager.createEntityRef(
      MenuLarge,
      {
        id: 'menu-1',
        title: 'origin-menu',
        createdAt: new Date(ISO_CREATED),
        updatedAt: new Date(ISO_UPDATED)
      } as EntityUpdateData<typeof MenuLarge>,
      { local: true, modified: false }
    );

    const entities = await transaction_sqlite_result(adapter, MenuLarge, {
      sql: 'SELECT',
      rowsAffected: 0,
      elapsed: 0,
      results: [
        {
          columns: ['__rowid', 'id', 'title', 'sort_order', 'parentId', 'createdAt', 'updatedAt', 'hasChildren'],
          rows: [[3, 'menu-1', 'db-menu', null, null, ISO_CREATED, ISO_UPDATED, 1]]
        }
      ]
    });

    expect(entities[0]).toBe(menu);
    expect(menu.hasChildren).toBe(true);
    expect(menu.title).toBe('origin-menu');
  });

  it('结果没有 __rowid 列时不写 rowid 缓存', async () => {
    const rxdb = createRxdb('sqlite-core-result-no-rowid');
    const adapter = new ResultTestAdapter(rxdb);

    const entities = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([['todo-plain', 'plain', 0, ISO_CREATED, ISO_UPDATED]], false)
    );

    expect(entities).toHaveLength(1);
    expect(adapter.getRowIdByEntity(entities[0])).toBeUndefined();
  });

  it('update_entity_from_sqlite_result 只强制更新已缓存实体', async () => {
    const rxdb = createRxdb('sqlite-core-result-update-only');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = createTodoRef(rxdb, 'todo-known', 'before');

    await update_entity_from_sqlite_result(
      adapter,
      Todo,
      todoResult([
        [11, 'todo-known', 'after', 0, ISO_CREATED, ISO_UPDATED],
        [12, 'todo-unknown', 'ghost', 0, ISO_CREATED, ISO_UPDATED]
      ])
    );

    expect(cached.title).toBe('after');
    expect(rxdb.entityManager.getEntityRef(Todo, 'todo-unknown')).toBeUndefined();
  });

  it('remove_entity_ids_from_cache 标记已缓存实体为 removed 并跳过未知 id', () => {
    const rxdb = createRxdb('sqlite-core-result-remove-cache');
    const adapter = new ResultTestAdapter(rxdb);
    const cached = createTodoRef(rxdb, 'todo-remove', 'to-remove');

    remove_entity_ids_from_cache(adapter, Todo, ['todo-remove', 'todo-not-exist']);

    const status = getEntityStatus(cached);
    expect(status.removed).toBe(true);
    expect(status.local).toBe(false);
    expect(status.modified).toBe(false);
  });

  // SQLC-033：#row_id_map 是强引用 Map，删除只标 removed 不回收映射，
  // 长生命周期增删场景内存单调增长；且 SQLite 会复用 rowid，
  // 陈旧映射会让新行按 rowid 查到那个已删除的旧实体
  it('remove_entity_ids_from_cache 回收 rowid 双向映射', async () => {
    const rxdb = createRxdb('sqlite-core-result-remove-rowid');
    const adapter = new ResultTestAdapter(rxdb);
    const [cached] = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[42, 'todo-evict', 'to-evict', 0, ISO_CREATED, ISO_UPDATED]])
    );
    expect(adapter.getEntityByRowId(42n, Todo)).toBe(cached);

    remove_entity_ids_from_cache(adapter, Todo, ['todo-evict']);

    expect(adapter.getEntityByRowId(42n, Todo)).toBeUndefined();
    expect(adapter.getRowIdByEntity(cached)).toBeUndefined();
  });

  it('回收后按同一 rowid 重新水合能重建映射（undo 恢复 INSERT 的路径）', async () => {
    const rxdb = createRxdb('sqlite-core-result-remove-rowid-restore');
    const adapter = new ResultTestAdapter(rxdb);
    const [cached] = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[7, 'todo-restore', 'v1', 0, ISO_CREATED, ISO_UPDATED]])
    );
    remove_entity_ids_from_cache(adapter, Todo, ['todo-restore']);

    const [restored] = await transaction_sqlite_result(
      adapter,
      Todo,
      todoResult([[7, 'todo-restore', 'v2', 0, ISO_CREATED, ISO_UPDATED]]),
      true
    );

    // 同一个 entityManager 引用，rowid 映射由 cacheRowIdEntity 重建
    expect(restored).toBe(cached);
    expect(adapter.getEntityByRowId(7n, Todo)).toBe(cached);
    expect(adapter.getRowIdByEntity(cached)).toBe(7n);
    expect(getEntityStatus(cached).removed).toBe(false);
  });

  it('RxDBChange 在进入缓存前恢复 typed entityId 与 bigint/binary patch', async () => {
    const rxdb = createRxdb('sqlite-core-result-change-codec');
    const adapter = new ResultTestAdapter(rxdb);
    const entityId = 9_007_199_254_740_993n;
    const source = new Uint8Array([9, 1, 2, 8]);
    const lookalike = {
      $rxdbChangeValue: { codecVersion: 1, schemaVersion: 1, type: 'bigint', value: '7' }
    };
    const secretAmount = '{"v":1,"ciphertext":"amount"}';
    const secretPayload = '{"v":1,"ciphertext":"payload"}';
    const encodedPatch = encodeRxDBChangePatch(getEntityMetadata(ResultTypedRecord), {
      amount: entityId,
      payload: source.subarray(1, 3),
      secretAmount,
      secretPayload,
      data: lookalike
    });
    source[1] = 7;

    const [change] = await transaction_sqlite_result(adapter, RxDBChange, {
      sql: 'SELECT',
      rowsAffected: 0,
      elapsed: 0,
      results: [
        {
          columns: [
            '__rowid',
            'id',
            'type',
            'namespace',
            'entity',
            'entityId',
            'inversePatch',
            'patch',
            'createdAt',
            'updatedAt'
          ],
          rows: [
            [
              1,
              1,
              'INSERT',
              'public',
              'ResultTypedRecord',
              encodeRxDBChangeEntityId(entityId),
              null,
              JSON.stringify(encodedPatch),
              ISO_CREATED,
              ISO_UPDATED
            ]
          ]
        }
      ]
    });

    expect(change.entityId).toBe(entityId);
    expect(change.patch?.['amount']).toBe(entityId);
    expect(change.patch?.['payload']).toEqual(new Uint8Array([1, 2]));
    expect(change.patch?.['secretAmount']).toBe(secretAmount);
    expect(change.patch?.['secretPayload']).toBe(secretPayload);
    expect(change.patch?.['data']).toEqual(lookalike);
  });
});
