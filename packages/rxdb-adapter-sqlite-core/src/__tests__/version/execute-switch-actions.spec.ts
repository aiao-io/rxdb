import {
  getEntityMetadata,
  getEntityStatus,
  PropertyType,
  RxDB,
  SyncType,
  transitionMetadata,
  type EntityUpdateData,
  type RxDBChange
} from '@aiao/rxdb';
import type { Keyring } from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase, SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { dispatch_switch_events, execute_switch_actions } from '../../version/execute_switch_actions.js';
import type { SwitchVersionSqlResult } from '../../version/switch-result.utils.js';
import { Todo } from '../fixtures/Todo.js';

const successResult = (
  sql: string,
  rowsAffected = 0,
  results: SqliteSuccessResult['results'] = []
): SqliteSuccessResult => ({ sql, rowsAffected, elapsed: 1, results });

const emptySwitchAction = (): SwitchVersionSqlResult => ({ deletes: [], inserts: [], updates: [] });

type LocalChange = Omit<RxDBChange, 'id'>;

const createLocalChange = (overrides: Partial<LocalChange> = {}): LocalChange =>
  ({
    type: 'INSERT',
    namespace: 'secure',
    entity: 'SecretEntity',
    branchId: 'main',
    entityId: 'secret-1',
    patch: { secret: 'top-secret', plain: 'visible' },
    inversePatch: { secret: 'old-secret' },
    ...overrides
  }) as unknown as LocalChange;

const rxdb = new RxDB({
  dbName: 'sqlite-core-switch-execution',
  entities: [Todo],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
rxdb.entityManager.init();

describe('execute_switch_actions', () => {
  it('只执行结构化 statements，并合并多条 SELECT 结果', async () => {
    const metadata = getEntityMetadata(Todo);
    const calls: Array<{ sql: string; params?: SQLiteCompatibleType[] }> = [];
    const client = {
      execute: async (sql: string, params?: SQLiteCompatibleType[]) => {
        calls.push({ sql, params });
        if (sql === 'SELECT first') {
          return successResult(sql, 1, [{ columns: ['marker'], rows: [['first']] }]);
        }
        if (sql === 'SELECT second') {
          return successResult(sql, 2, [{ columns: ['marker'], rows: [['second']] }]);
        }
        return successResult(sql, 1);
      }
    } as unknown as SqliteClientLike;

    const adapter = {
      transaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      runInTransaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      encryptionContext: { keyring: null, namespace: 'execute-review' },
      rxdb: {
        entityManager: rxdb.entityManager,
        dispatchEvent: () => undefined
      }
    } as unknown as RxDBAdapterSqliteBase;

    const itemBase = {
      metadata,
      ids: new Set<string>(),
      changes: new Map(),
      statements: [
        { sql: 'WRITE one ?', params: ['one'] },
        { sql: 'WRITE two ?', params: ['two'] }
      ]
    };
    const updateItem = {
      ...itemBase,
      selectStatements: [
        { sql: 'SELECT first', params: ['first-param'] },
        { sql: 'SELECT second', params: ['second-param'] }
      ]
    };
    const switchAction = {
      deletes: [{ ...itemBase }],
      inserts: [],
      updates: [updateItem]
    } as unknown as SwitchVersionSqlResult;

    await execute_switch_actions(adapter, switchAction);

    expect(calls).toEqual([
      { sql: 'WRITE one ?', params: ['one'] },
      { sql: 'WRITE two ?', params: ['two'] },
      { sql: 'WRITE one ?', params: ['one'] },
      { sql: 'WRITE two ?', params: ['two'] },
      { sql: 'SELECT first', params: ['first-param'] },
      { sql: 'SELECT second', params: ['second-param'] }
    ]);
    expect(updateItem.successResults).toEqual({
      sql: 'SELECT first\nSELECT second',
      rowsAffected: 3,
      elapsed: 2,
      results: [
        { columns: ['marker'], rows: [['first']] },
        { columns: ['marker'], rows: [['second']] }
      ]
    });
  });

  it('UPDATE 事件使用 changes 中的精准 patch，而不是整行实体', async () => {
    const metadata = getEntityMetadata(Todo);
    const dispatched: unknown[] = [];
    const adapter = {
      encryptionContext: { keyring: null, namespace: 'event-review' },
      cacheRowIdEntity: () => undefined,
      rxdb: {
        entityManager: rxdb.entityManager,
        dispatchEvent: (event: unknown) => dispatched.push(event)
      }
    } as unknown as RxDBAdapterSqliteBase;

    const id = 'todo-event';
    const switchAction = {
      deletes: [],
      inserts: [],
      updates: [
        {
          metadata,
          ids: new Set([id]),
          statements: [],
          sql: '',
          changes: new Map([
            [
              id,
              {
                patch: { title: 'new title' },
                inversePatch: { title: 'old title' }
              }
            ]
          ]),
          successResults: successResult('SELECT todo', 0, [
            {
              columns: ['id', 'title', 'completed'],
              rows: [[id, 'new title', 0]]
            }
          ])
        }
      ]
    } as unknown as SwitchVersionSqlResult;

    await dispatch_switch_events(adapter, switchAction);

    expect(dispatched).toHaveLength(1);
    const event = dispatched[0] as { entities: Array<{ patch: Record<string, unknown> }> };
    expect(event.entities[0]?.patch).toEqual({ title: 'new title' });
    expect(event.entities[0]?.patch).not.toHaveProperty('id');
    expect(event.entities[0]?.patch).not.toHaveProperty('completed');
    expect(event.entities[0]?.patch).not.toHaveProperty('createdAt');
    expect(event.entities[0]?.patch).not.toHaveProperty('updatedAt');
  });

  // SQLC-019：撤销删除 / 分支切换复活一行时，恢复 INSERT 命中的是缓存里那个
  // 仍标着 removed=true、字段停在删除前快照的旧引用。数据库已经是权威，
  // 必须像 UPDATE 路径一样 forcedUpdate 全量 hydrate（含 origin），否则 UI 继续显示旧数据。
  it('恢复 INSERT 全量刷新缓存实体的字段与 origin', async () => {
    const metadata = getEntityMetadata(Todo);
    const adapter = {
      encryptionContext: { keyring: null, namespace: 'restore-insert-review' },
      cacheRowIdEntity: () => undefined,
      rxdb: {
        entityManager: rxdb.entityManager,
        dispatchEvent: () => undefined
      }
    } as unknown as RxDBAdapterSqliteBase;

    const id = 'todo-restore-insert';
    // 删除前的缓存快照：标题是旧值，状态已被 remove_entity_ids_from_cache 打成 removed
    const cached = rxdb.entityManager.createEntityRef(
      Todo,
      {
        id,
        title: 'stale-title',
        completed: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z')
      } as EntityUpdateData<typeof Todo>,
      { local: true, modified: false }
    );
    const status = getEntityStatus(cached);
    status.removed = true;
    status.local = false;

    const switchAction = {
      deletes: [],
      inserts: [
        {
          metadata,
          ids: new Set([id]),
          statements: [],
          sql: '',
          changes: new Map([[id, { patch: { title: 'restored-title' }, inversePatch: null }]]),
          successResults: successResult('SELECT restore', 0, [
            {
              columns: ['id', 'title', 'completed', 'createdAt', 'updatedAt'],
              rows: [[id, 'restored-title', 1, '2026-01-01T00:00:00.000Z', '2026-01-03T00:00:00.000Z']]
            }
          ])
        }
      ],
      updates: []
    } as unknown as SwitchVersionSqlResult;

    await dispatch_switch_events(adapter, switchAction);

    expect(cached.title).toBe('restored-title');
    expect(cached.completed).toBe(true);
    // origin 必须跟着走，否则下一次 patch 计算会把「恢复」当成本地未保存修改重新写库
    expect((status.origin as { title?: string; completed?: boolean }).title).toBe('restored-title');
    expect((status.origin as { title?: string; completed?: boolean }).completed).toBe(true);
    expect(status.removed).toBe(false);
    expect(status.local).toBe(true);
    expect(status.modified).toBe(false);
  });

  it('bigint id 的删除、创建和更新事件使用 typed change key', async () => {
    const metadata = getEntityMetadata(Todo);
    const dispatched: unknown[] = [];
    const adapter = {
      encryptionContext: { keyring: null, namespace: 'typed-event-review' },
      cacheRowIdEntity: () => undefined,
      rxdb: {
        entityManager: rxdb.entityManager,
        dispatchEvent: (event: unknown) => dispatched.push(event)
      }
    } as unknown as RxDBAdapterSqliteBase;
    const id = 9_007_199_254_740_993n;
    const switchAction = {
      deletes: [
        {
          metadata,
          ids: new Set([id]),
          statements: [],
          sql: '',
          changes: new Map([[id, { patch: null, inversePatch: { title: 'deleted' } }]])
        }
      ],
      inserts: [
        {
          metadata,
          ids: new Set([id]),
          statements: [],
          sql: '',
          changes: new Map([[id, { patch: { title: 'inserted' }, inversePatch: null }]]),
          successResults: successResult('SELECT insert', 0, [
            { columns: ['id', 'title', 'completed'], rows: [[id, 'stored insert', 0]] }
          ])
        }
      ],
      updates: [
        {
          metadata,
          ids: new Set([id]),
          statements: [],
          sql: '',
          changes: new Map([[id, { patch: { title: 'updated' }, inversePatch: { title: 'inserted' } }]]),
          successResults: successResult('SELECT update', 0, [
            { columns: ['id', 'title', 'completed'], rows: [[id, 'stored update', 1]] }
          ])
        }
      ]
    } as unknown as SwitchVersionSqlResult;

    await dispatch_switch_events(adapter, switchAction);

    expect(dispatched).toHaveLength(3);
    expect((dispatched[0] as { entities: Array<{ inversePatch: object }> }).entities[0]?.inversePatch).toEqual({
      title: 'deleted'
    });
    expect((dispatched[1] as { entities: Array<{ patch: object }> }).entities[0]?.patch).toEqual({
      title: 'inserted'
    });
    expect((dispatched[2] as { entities: Array<{ patch: object }> }).entities[0]?.patch).toEqual({
      title: 'updated'
    });
  });

  it('禁用触发器但读不到当前分支时应抛出，不提交无触发器的库', async () => {
    const calls: string[] = [];
    const client = {
      execute: async (sql: string) => {
        calls.push(sql);
        // 无当前分支：SELECT 返回空行
        return successResult(sql, 0, [{ columns: ['id'], rows: [] }]);
      }
    } as unknown as SqliteClientLike;
    const internalQuery = vi.fn(async () => successResult('internal'));
    const adapter = {
      transaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      runInTransaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      internalQuery,
      encryptionContext: { keyring: null, namespace: 'empty-review' },
      rxdb: {
        config: { entities: [] },
        dispatchEvent: () => undefined
      }
    } as unknown as RxDBAdapterSqliteBase;

    await expect(execute_switch_actions(adapter, emptySwitchAction(), true)).rejects.toThrow(
      /currentBranch is undefined/
    );

    // 仅探测当前分支（activated + main 回退），随后失败回滚而不是静默提交
    expect(calls).toHaveLength(2);
    expect(calls.every(sql => sql.startsWith('SELECT '))).toBe(true);
    expect(internalQuery).not.toHaveBeenCalled();
  });

  it('禁用触发器时写入加密 localChanges，并在受保护事务中重建当前分支触发器', async () => {
    const encryptedMetadata = transitionMetadata({
      name: 'SecretEntity',
      namespace: 'secure',
      tableName: 'secret_entity',
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'plain', type: PropertyType.string },
        {
          name: 'secret',
          columnName: 'secret_ciphertext',
          type: PropertyType.string,
          encrypted: true
        }
      ]
    });
    const plainMetadata = transitionMetadata({
      name: 'PlainEntity',
      namespace: 'secure',
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'plain', type: PropertyType.string }
      ]
    });
    const encrypt = vi.fn(async () => '1|AGCM256|encrypted');
    const keyring = { encrypt } as unknown as Keyring;
    const calls: string[] = [];
    const client = {
      execute: async (sql: string) => {
        calls.push(sql);
        // 分支探测：activated 命中 feature
        if (sql.startsWith('SELECT ') && sql.includes('activated')) {
          return successResult(sql, 1, [{ columns: ['id'], rows: [['feature']] }]);
        }
        return successResult(sql);
      }
    } as unknown as SqliteClientLike;
    const adapter = {
      transaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      runInTransaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
      encryptionContext: { keyring, namespace: 'secure' },
      rxdb: {
        config: { entities: [Todo] },
        schemaManager: {
          getEntityMetadata: (entity: string) => {
            if (entity === 'SecretEntity') return encryptedMetadata;
            if (entity === 'PlainEntity') return plainMetadata;
            return undefined;
          }
        },
        dispatchEvent: () => undefined
      }
    } as unknown as RxDBAdapterSqliteBase;
    const localChanges = [
      createLocalChange({ transactionId: 'tx-1', remoteId: 'remote-1' }),
      createLocalChange({ entityId: 'secret-2', patch: null, inversePatch: null }),
      createLocalChange({
        entity: 'PlainEntity',
        entityId: 'plain-1',
        patch: { plain: 'plain' },
        inversePatch: null
      }),
      createLocalChange({
        entity: 'MissingEntity',
        entityId: 'missing-1',
        patch: { plain: 'missing' },
        inversePatch: null
      })
    ];

    await execute_switch_actions(adapter, emptySwitchAction(), true, localChanges);

    const localChangesSql = calls.find(sql => sql.startsWith('INSERT INTO "rxdb$rxdb_change"'));
    expect(localChangesSql).toBeDefined();
    expect(localChangesSql).toContain('1|AGCM256|encrypted');
    expect(localChangesSql).toContain('visible');
    expect(localChangesSql).not.toContain('top-secret');
    expect(localChangesSql).not.toContain('old-secret');
    expect(localChangesSql).toContain('NULL');
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(calls.some(sql => sql.includes("id = 'feature'"))).toBe(true);
  });

  it('派发删除、创建和更新事件时覆盖缺失 change 与缺失 SELECT 结果', async () => {
    const metadata = getEntityMetadata(Todo);
    const dispatched: unknown[] = [];
    const adapter = {
      encryptionContext: { keyring: null, namespace: 'event-fallback-review' },
      cacheRowIdEntity: () => undefined,
      rxdb: {
        entityManager: rxdb.entityManager,
        dispatchEvent: (event: unknown) => dispatched.push(event)
      }
    } as unknown as RxDBAdapterSqliteBase;
    const switchAction = {
      deletes: [
        {
          metadata,
          ids: new Set(['delete-with-change', 'delete-without-change']),
          statements: [],
          sql: '',
          changes: new Map([['delete-with-change', { patch: null, inversePatch: { title: 'restored title' } }]])
        }
      ],
      inserts: [
        { metadata, ids: new Set(), statements: [], sql: '', changes: new Map() },
        {
          metadata,
          ids: new Set(['insert-with-change', 'insert-without-change']),
          statements: [],
          sql: '',
          changes: new Map([['insert-with-change', { patch: { title: 'precise title' }, inversePatch: null }]]),
          successResults: successResult('SELECT inserts', 0, [
            {
              columns: ['id', 'title', 'completed'],
              rows: [
                ['insert-with-change', 'stored title', 0],
                ['insert-without-change', 'fallback title', 1]
              ]
            }
          ])
        }
      ],
      updates: [
        { metadata, ids: new Set(), statements: [], sql: '', changes: new Map() },
        {
          metadata,
          ids: new Set(['update-without-change']),
          statements: [],
          sql: '',
          changes: new Map(),
          successResults: successResult('SELECT update', 0, [
            {
              columns: ['id', 'title', 'completed'],
              rows: [['update-without-change', 'fallback update', 1]]
            }
          ])
        }
      ]
    } as unknown as SwitchVersionSqlResult;

    await dispatch_switch_events(adapter, switchAction);

    expect(dispatched).toHaveLength(3);
    const deleteEvent = dispatched[0] as {
      entities: Array<{ inversePatch: Record<string, unknown> }>;
    };
    expect(deleteEvent.entities.map(entity => entity.inversePatch)).toEqual([{ title: 'restored title' }, {}]);
    const insertEvent = dispatched[1] as {
      entities: Array<{ patch: Record<string, unknown> }>;
    };
    expect(insertEvent.entities[0]?.patch).toEqual({ title: 'precise title' });
    expect(insertEvent.entities[1]?.patch).toMatchObject({
      id: 'insert-without-change',
      title: 'fallback title',
      completed: true
    });
    const updateEvent = dispatched[2] as {
      entities: Array<{ patch: Record<string, unknown>; inversePatch: Record<string, unknown> }>;
    };
    expect(updateEvent.entities[0]?.patch).toMatchObject({
      id: 'update-without-change',
      title: 'fallback update',
      completed: true
    });
    expect(updateEvent.entities[0]?.inversePatch).toEqual({});
  });
});
