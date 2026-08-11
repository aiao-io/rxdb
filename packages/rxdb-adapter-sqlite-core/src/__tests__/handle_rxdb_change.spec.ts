import {
  Entity,
  EntityBase,
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  type EntityType,
  type EntityUpdateData,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import type { Keyring } from '@aiao/rxdb-adapter-encrypted';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle_rxdb_change } from '../handle_rxdb_change.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';
import type {
  SqliteChangeErrorEvent,
  SqliteChangeEvent,
  SQLiteCompatibleType,
  SqliteSuccessResult
} from '../sqlite-core.interface.js';
import { type EncryptionContext, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import { Todo } from './fixtures/Todo.js';

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

class ChangeTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-change-test';

  constructor(
    rxdb: RxDB,
    private readonly queryHandler: QueryHandler = async () => {
      throw new Error('query should not be called');
    }
  ) {
    super(rxdb);
  }

  override query(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    return this.queryHandler(sql, params);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('ChangeTestAdapter.createClient must not be called');
  }
}

const createRxdb = (dbName: string, entities: EntityType[] = [Todo]): RxDB => {
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const ISO = '2026-01-01T00:00:00.000Z';

const changeEvent = (tableName: string, type: SQLiteChangeType, rowIds: bigint[]): SqliteChangeEvent => ({
  type,
  dbName: 'test-db',
  tableName,
  rowIds,
  recordAt: new Date(ISO)
});

const createTodoRef = (rxdb: RxDB, id: string, title: string, withCreatedAt = true) =>
  rxdb.entityManager.createEntityRef(
    Todo,
    {
      id,
      title,
      completed: false,
      ...(withCreatedAt ? { createdAt: new Date(ISO) } : {}),
      updatedAt: new Date(ISO)
    } as EntityUpdateData<typeof Todo>,
    { local: true, modified: false }
  );

interface RxDBChangeSeed {
  id: number;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  entity?: string;
  patch?: Record<string, unknown> | null;
  inversePatch?: Record<string, unknown> | null;
}

const createChangeRef = (rxdb: RxDB, seed: RxDBChangeSeed) =>
  rxdb.entityManager.createEntityRef(
    RxDBChange,
    {
      id: seed.id,
      type: seed.type,
      namespace: 'public',
      entity: seed.entity ?? 'Todo',
      entityId: `todo-${seed.id}`,
      patch: seed.patch ?? null,
      inversePatch: seed.inversePatch ?? null,
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO)
    } as unknown as EntityUpdateData<typeof RxDBChange>,
    { local: true, modified: false }
  );

describe('handle_rxdb_change', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未知表的变更事件直接忽略', async () => {
    const rxdb = createRxdb('sqlite-core-change-unknown-table');
    const adapter = new ChangeTestAdapter(rxdb);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');
    const repositorySpy = vi.spyOn(adapter, 'getRepository');

    handle_rxdb_change(adapter, changeEvent('nope$unknown_table', SQLiteChangeType.SQLITE_INSERT, [1n]));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(repositorySpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('业务表 INSERT 事件派发 EntityLocalCreatedEvent', async () => {
    const rxdb = createRxdb('sqlite-core-change-insert');
    const adapter = new ChangeTestAdapter(rxdb);
    const entity = createTodoRef(rxdb, 'todo-1', 'created');
    adapter.cacheRowIdEntity(1n, entity);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [1n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect(event).toBeInstanceOf(EntityLocalCreatedEvent);
    expect(event.entities[0]).toMatchObject({
      namespace: 'public',
      entity: 'Todo',
      type: 'INSERT',
      id: 'todo-1',
      inversePatch: null
    });
    expect((event.entities[0].patch as { title?: string }).title).toBe('created');
  });

  it('业务表 UPDATE 事件强制回库并用新值刷新缓存后派发', async () => {
    const rxdb = createRxdb('sqlite-core-change-update');
    const queryHandler = vi.fn(async (sql: string): Promise<SqliteSuccessResult> => ({
      sql,
      rowsAffected: 0,
      elapsed: 0,
      results: [
        {
          columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'],
          rows: [[2, 'todo-2', 'fresh', 1, ISO, '2026-01-01T00:00:01.000Z']]
        }
      ]
    }));
    const adapter = new ChangeTestAdapter(rxdb, queryHandler);
    const entity = createTodoRef(rxdb, 'todo-2', 'stale');
    adapter.cacheRowIdEntity(2n, entity);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_UPDATE, [2n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalUpdatedEvent;
    expect(event).toBeInstanceOf(EntityLocalUpdatedEvent);
    expect(event.entities[0]).toMatchObject({ type: 'UPDATE', id: 'todo-2', inversePatch: {} });
    expect(event.entities[0].patch as { title?: string; completed?: boolean }).toMatchObject({
      title: 'fresh',
      completed: true
    });
    expect(queryHandler).toHaveBeenCalledTimes(1);
    expect(entity.title).toBe('fresh');
    expect(entity.completed).toBe(true);
  });

  it('业务表 UPDATE 事件保留未保存字段且只派发数据库快照', async () => {
    const rxdb = createRxdb('sqlite-core-change-update-dirty');
    const queryHandler = vi.fn(async (sql: string): Promise<SqliteSuccessResult> => ({
      sql,
      rowsAffected: 0,
      elapsed: 0,
      results: [
        {
          columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'],
          rows: [[2, 'todo-2', 'db-title', 1, ISO, '2026-01-01T00:00:01.000Z']]
        }
      ]
    }));
    const adapter = new ChangeTestAdapter(rxdb, queryHandler);
    const entity = createTodoRef(rxdb, 'todo-2', 'persisted');
    adapter.cacheRowIdEntity(2n, entity);
    entity.title = 'draft';
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_UPDATE, [2n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalUpdatedEvent;
    expect(event.entities[0].patch).toMatchObject({ title: 'db-title', completed: true });
    expect(entity.title).toBe('draft');
    expect(entity.completed).toBe(true);
    expect(getEntityStatus(entity).modified).toBe(true);
  });

  it('业务表 DELETE 事件派发 EntityLocalRemovedEvent，缺失 createdAt 时回退当前时间', async () => {
    const rxdb = createRxdb('sqlite-core-change-delete');
    const adapter = new ChangeTestAdapter(rxdb);
    const entity = createTodoRef(rxdb, 'todo-3', 'removed', false);
    adapter.cacheRowIdEntity(3n, entity);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_DELETE, [3n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalRemovedEvent;
    expect(event).toBeInstanceOf(EntityLocalRemovedEvent);
    expect(event.entities[0]).toMatchObject({ type: 'DELETE', id: 'todo-3', patch: null });
    expect((event.entities[0].inversePatch as { title?: string }).title).toBe('removed');
    expect(event.entities[0].recordAt).toBeInstanceOf(Date);
  });

  it('rxdb_change 表 INSERT 按变更类型分组派发事件并追加元事件', async () => {
    const rxdb = createRxdb('sqlite-core-change-log-insert');
    const adapter = new ChangeTestAdapter(rxdb);
    const insertChange = createChangeRef(rxdb, {
      id: 1,
      type: 'INSERT',
      patch: { title: 'a', completed: true },
      inversePatch: null
    });
    const updateChange = createChangeRef(rxdb, {
      id: 2,
      type: 'UPDATE',
      patch: { completed: true },
      inversePatch: { completed: false }
    });
    const deleteChange = createChangeRef(rxdb, {
      id: 3,
      type: 'DELETE',
      patch: null,
      inversePatch: { title: 'b', completed: false }
    });
    adapter.cacheRowIdEntity(1n, insertChange);
    adapter.cacheRowIdEntity(2n, updateChange);
    adapter.cacheRowIdEntity(3n, deleteChange);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_INSERT, [1n, 2n, 3n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(4));
    const [created, updated, removed, meta] = dispatchSpy.mock.calls.map(call => call[0]);
    expect(created).toBeInstanceOf(EntityLocalCreatedEvent);
    expect((created as EntityLocalCreatedEvent).entities[0]).toMatchObject({
      namespace: 'public',
      entity: 'Todo',
      id: 'todo-1'
    });
    // Repository hydration 已在事件派发前恢复 JS boolean
    expect(((created as EntityLocalCreatedEvent).entities[0].patch as { completed?: boolean }).completed).toBe(true);
    expect(updated).toBeInstanceOf(EntityLocalUpdatedEvent);
    expect((updated as EntityLocalUpdatedEvent).entities[0].inversePatch).toMatchObject({ completed: false });
    expect(removed).toBeInstanceOf(EntityLocalRemovedEvent);
    expect(meta).toBeInstanceOf(EntityLocalCreatedEvent);
    expect((meta as EntityLocalCreatedEvent).entities).toHaveLength(3);
    expect((meta as EntityLocalCreatedEvent).entities[0]).toMatchObject({ namespace: 'rxdb', entity: 'RxDBChange' });
  });

  it('rxdb_change 表变更实体元数据缺失时告警并保留原值', async () => {
    const rxdb = createRxdb('sqlite-core-change-log-missing-meta');
    const adapter = new ChangeTestAdapter(rxdb);
    const change = createChangeRef(rxdb, {
      id: 4,
      type: 'INSERT',
      entity: 'NotRegistered',
      patch: { completed: 1 },
      inversePatch: null
    });
    adapter.cacheRowIdEntity(4n, change);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_INSERT, [4n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(2));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Entity metadata not found'));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect((event.entities[0].patch as { completed?: number }).completed).toBe(1);
  });

  it('rxdb_change 表 UPDATE 事件派发跨 Tab 同步更新事件', async () => {
    const rxdb = createRxdb('sqlite-core-change-log-update');
    const queryHandler = vi.fn(async (sql: string): Promise<SqliteSuccessResult> => ({
      sql,
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
            'updatedAt',
            'revertChangeId'
          ],
          rows: [
            [
              5,
              5,
              'INSERT',
              'public',
              'Todo',
              'todo-5',
              null,
              JSON.stringify({ title: 'x' }),
              ISO,
              '2026-01-01T00:00:01.000Z',
              42
            ]
          ]
        }
      ]
    }));
    const adapter = new ChangeTestAdapter(rxdb, queryHandler);
    const change = createChangeRef(rxdb, { id: 5, type: 'INSERT', patch: { title: 'x' }, inversePatch: null });
    adapter.cacheRowIdEntity(5n, change);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_UPDATE, [5n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalUpdatedEvent;
    expect(event).toBeInstanceOf(EntityLocalUpdatedEvent);
    expect(event.entities[0]).toMatchObject({ namespace: 'rxdb', entity: 'RxDBChange', id: 5 });
    expect(event.entities[0].patch).toMatchObject({ revertChangeId: 42 });
    expect(change.revertChangeId).toBe(42);
    expect(queryHandler).toHaveBeenCalledTimes(1);
  });

  it('rxdb_change 表 DELETE 事件不派发任何事件', async () => {
    const rxdb = createRxdb('sqlite-core-change-log-delete');
    const adapter = new ChangeTestAdapter(rxdb);
    const change = createChangeRef(rxdb, { id: 6, type: 'DELETE', patch: null, inversePatch: { title: 'y' } });
    adapter.cacheRowIdEntity(6n, change);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_DELETE, [6n]));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('查询失败时通过 console.error 报告且不抛出', async () => {
    const rxdb = createRxdb('sqlite-core-change-query-error');
    const adapter = new ChangeTestAdapter(rxdb, async () => {
      throw new Error('query boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [404n]));

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to query'), expect.any(Error))
    );
  });

  it('断开期间取消的查询不记录错误', async () => {
    const rxdb = createRxdb('sqlite-core-change-disconnect');
    let rejectQuery!: (reason: unknown) => void;
    const query = new Promise<SqliteSuccessResult>((_, reject) => {
      rejectQuery = reject;
    });
    const adapter = new ChangeTestAdapter(rxdb, () => query);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [405n]));
    await adapter.disconnect();
    rejectQuery(new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('断开期间仍报告非生命周期查询错误', async () => {
    const rxdb = createRxdb('sqlite-core-change-disconnect-query-error');
    let rejectQuery!: (reason: unknown) => void;
    const query = new Promise<SqliteSuccessResult>((_, reject) => {
      rejectQuery = reject;
    });
    const adapter = new ChangeTestAdapter(rxdb, () => query);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [406n]));
    await adapter.disconnect();
    rejectQuery(new Error('query boom after disconnect'));

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to query'), expect.any(Error))
    );
  });

  it('事件处理阶段异常时通过 console.error 报告且不抛出', async () => {
    const rxdb = createRxdb('sqlite-core-change-process-error');
    const adapter = new ChangeTestAdapter(rxdb);
    const entity = createTodoRef(rxdb, 'todo-9', 'boom');
    adapter.cacheRowIdEntity(9n, entity);
    vi.spyOn(rxdb, 'dispatchEvent').mockImplementation(() => {
      throw new Error('dispatch boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [9n]));

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing'), expect.any(Error))
    );
  });
});

// SQLC-011：加密列在库里是 TEXT 信封，触发器写进 change 行的 patch 也是信封。
// 派发前不解 envelope，密文就直接进了 QueryManager/UI。
@Entity({
  name: 'SecretTodo',
  namespace: 'public',
  tableName: 'secret_todos',
  properties: [
    { name: 'id', type: PropertyType.uuid, primary: true },
    { name: 'title', type: PropertyType.string },
    { name: 'secretFlag', type: PropertyType.boolean, encrypted: true },
    { name: 'secretNote', type: PropertyType.string, encrypted: true }
  ]
})
class SecretTodo extends EntityBase {
  title!: string;
  secretFlag!: boolean;
  secretNote!: string;
}

/** 信封串 → 明文字节的固定映射，避免测试依赖真实 AES-GCM */
const ENVELOPES: Record<string, Uint8Array> = {
  '2|AGCM256|flag-true': new Uint8Array([1]),
  '2|AGCM256|flag-false': new Uint8Array([0]),
  '2|AGCM256|note': new TextEncoder().encode('top-secret')
};

const createFakeKeyring = (): { keyring: Keyring; calls: string[] } => {
  const calls: string[] = [];
  const keyring = {
    decrypt: async ({ envelope }: { envelope: string }): Promise<Uint8Array> => {
      calls.push(envelope);
      const plain = ENVELOPES[envelope];
      if (!plain) throw new Error(`unexpected envelope: ${envelope}`);
      return plain;
    }
  } as unknown as Keyring;
  return { keyring, calls };
};

class EncryptedChangeTestAdapter extends ChangeTestAdapter {
  #keyring: Keyring | null;

  override get encryptionContext(): EncryptionContext {
    return { keyring: this.#keyring, namespace: 'sqlite-core-change-encrypted' };
  }

  constructor(rxdb: RxDB, keyring: Keyring | null) {
    super(rxdb);
    this.#keyring = keyring;
  }
}

const secretChangeRef = (rxdb: RxDB, seed: RxDBChangeSeed) => createChangeRef(rxdb, { ...seed, entity: 'SecretTodo' });

describe('SQLC-011 加密列的变更事件必须解回明文', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patch / inversePatch 里的信封在派发前解密', async () => {
    const rxdb = createRxdb('sqlite-core-change-encrypted', [Todo, SecretTodo]);
    const { keyring, calls } = createFakeKeyring();
    const adapter = new EncryptedChangeTestAdapter(rxdb, keyring);
    const change = secretChangeRef(rxdb, {
      id: 20,
      type: 'UPDATE',
      patch: { title: 'plain', secretFlag: '2|AGCM256|flag-true', secretNote: '2|AGCM256|note' },
      inversePatch: { secretFlag: '2|AGCM256|flag-false' }
    });
    adapter.cacheRowIdEntity(20n, change);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_INSERT, [20n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(2));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalUpdatedEvent;
    expect(event).toBeInstanceOf(EntityLocalUpdatedEvent);
    expect(event.entities[0].patch).toEqual({ title: 'plain', secretFlag: true, secretNote: 'top-secret' });
    expect(event.entities[0].inversePatch).toEqual({ secretFlag: false });
    expect(calls).toHaveLength(3);
    // 解密结果不得回写到变更行本身：change 表自己的事件仍要携带原始信封
    expect((change.patch as { secretNote?: unknown }).secretNote).toBe('2|AGCM256|note');
  });

  it('未解锁（无 keyring）时原样派发，不阻断变更流', async () => {
    const rxdb = createRxdb('sqlite-core-change-encrypted-locked', [Todo, SecretTodo]);
    const adapter = new EncryptedChangeTestAdapter(rxdb, null);
    const change = secretChangeRef(rxdb, {
      id: 21,
      type: 'INSERT',
      patch: { title: 'plain', secretNote: '2|AGCM256|note' }
    });
    adapter.cacheRowIdEntity(21n, change);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_INSERT, [21n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(2));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect(event.entities[0].patch).toEqual({ title: 'plain', secretNote: '2|AGCM256|note' });
  });

  it('SQLC-011 修复前写下的加密 boolean 历史行（数字 0/1）原样透传', async () => {
    const rxdb = createRxdb('sqlite-core-change-encrypted-legacy', [Todo, SecretTodo]);
    const { keyring, calls } = createFakeKeyring();
    const adapter = new EncryptedChangeTestAdapter(rxdb, keyring);
    const change = secretChangeRef(rxdb, { id: 22, type: 'INSERT', patch: { secretFlag: 0 } });
    adapter.cacheRowIdEntity(22n, change);
    const dispatchSpy = vi.spyOn(rxdb, 'dispatchEvent');

    handle_rxdb_change(adapter, changeEvent('rxdb$rxdb_change', SQLiteChangeType.SQLITE_INSERT, [22n]));

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(2));
    const event = dispatchSpy.mock.calls[0][0] as EntityLocalCreatedEvent;
    expect(event.entities[0].patch).toEqual({ secretFlag: 0 });
    expect(calls).toHaveLength(0);
  });
});

// SQLC-012：变更处理是脱离调用栈的异步路径，失败只写 console.error 时
// 调用方没有任何可订阅的信号，本地缓存静默漏掉一条变更。
describe('SQLC-012 变更处理失败必须有公开错误通道', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回读失败派发 phase=query 的 change-error，并由监听器接管默认降级', async () => {
    const rxdb = createRxdb('sqlite-core-change-error-query');
    const adapter = new ChangeTestAdapter(rxdb, async () => {
      throw new Error('query boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: SqliteChangeErrorEvent[] = [];
    adapter.addChangeErrorListener(event => events.push(event));

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [501n]));

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ phase: 'query', tableName: 'public$todos', rowIds: [501n] });
    expect(events[0].error).toBeInstanceOf(Error);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('处理阶段失败派发 phase=process 的 change-error', async () => {
    const rxdb = createRxdb('sqlite-core-change-error-process');
    const adapter = new ChangeTestAdapter(rxdb);
    adapter.cacheRowIdEntity(502n, createTodoRef(rxdb, 'todo-502', 'boom'));
    vi.spyOn(rxdb, 'dispatchEvent').mockImplementation(() => {
      throw new Error('dispatch boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: SqliteChangeErrorEvent[] = [];
    adapter.addChangeErrorListener(event => events.push(event));

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [502n]));

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ phase: 'process', tableName: 'public$todos', rowIds: [502n] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('断开期间取消的查询不派发 change-error', async () => {
    const rxdb = createRxdb('sqlite-core-change-error-disconnect');
    let rejectQuery!: (reason: unknown) => void;
    const query = new Promise<SqliteSuccessResult>((_, reject) => {
      rejectQuery = reject;
    });
    const adapter = new ChangeTestAdapter(rxdb, () => query);
    const events: SqliteChangeErrorEvent[] = [];
    adapter.addChangeErrorListener(event => events.push(event));

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [503n]));
    await adapter.disconnect();
    rejectQuery(new RxDBAdapterSqliteError('Adapter is disconnected', { code: 'adapter_disconnected' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(events).toHaveLength(0);
  });

  it('监听器抛出不影响其余监听器，且被单独报告', async () => {
    const rxdb = createRxdb('sqlite-core-change-error-listener-throw');
    const adapter = new ChangeTestAdapter(rxdb, async () => {
      throw new Error('query boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    adapter.addChangeErrorListener(() => {
      throw new Error('listener boom');
    });
    adapter.addChangeErrorListener(() => seen.push('second'));

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [504n]));

    await vi.waitFor(() => expect(seen).toEqual(['second']));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('change-error listener threw'), expect.any(Error));
  });

  it('移除监听器后回落到 console.error', async () => {
    const rxdb = createRxdb('sqlite-core-change-error-removed');
    const adapter = new ChangeTestAdapter(rxdb, async () => {
      throw new Error('query boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listener = vi.fn();
    adapter.addChangeErrorListener(listener);
    adapter.removeChangeErrorListener(listener);

    handle_rxdb_change(adapter, changeEvent('public$todos', SQLiteChangeType.SQLITE_INSERT, [505n]));

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to query'), expect.any(Error))
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
