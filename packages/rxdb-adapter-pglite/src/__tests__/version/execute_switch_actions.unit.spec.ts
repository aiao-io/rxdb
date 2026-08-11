import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const {
  removeAllTriggersSqlMock,
  generateSwitchBranchSqlMock,
  getEntityObjectFromResultMock,
  removeEntityIdsFromCacheMock,
  transactionPgliteResultMock
} = vi.hoisted(() => ({
  removeAllTriggersSqlMock: vi.fn(),
  generateSwitchBranchSqlMock: vi.fn(),
  getEntityObjectFromResultMock: vi.fn(),
  removeEntityIdsFromCacheMock: vi.fn(),
  transactionPgliteResultMock: vi.fn()
}));

vi.mock('../../table/remove_trigger_sql.js', () => ({
  default: (...args: unknown[]) => removeAllTriggersSqlMock(...args)
}));
vi.mock('../../version/switch_branch.js', () => ({
  generateSwitchBranchSql: (...args: unknown[]) => generateSwitchBranchSqlMock(...args)
}));
vi.mock('../../pglite.utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../pglite.utils.js')>();
  return {
    ...actual,
    getEntityObjectFromResult: (...args: unknown[]) => getEntityObjectFromResultMock(...args)
  };
});
vi.mock('../../transaction_pglite_result.js', () => ({
  remove_entity_ids_from_cache: (...args: unknown[]) => removeEntityIdsFromCacheMock(...args),
  transaction_pglite_result: (...args: unknown[]) => transactionPgliteResultMock(...args)
}));

import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityMetadata,
  RxDB,
  SyncType,
  type IRxDBAdapter,
  type RxDBEntityId
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { dispatch_switch_events, execute_switch_actions } from '../../version/execute_switch_actions.js';
import type { SwitchVersionSqlResult } from '../../version/switch-result.interface.js';

const metadata = getEntityMetadata(Todo);

const baseAction = (overrides: Record<string, unknown> = {}) => ({
  metadata,
  ids: new Set<string | number>(['t1']),
  changes: new Map([
    [
      't1',
      {
        patch: { id: 't1', title: 'x' },
        inversePatch: { id: 't1', title: 'old' }
      }
    ]
  ]),
  sql: 'SELECT 1',
  params: [] as unknown[],
  successResults: { rows: [{ id: 't1' }], affectedRows: 1, fields: [] },
  ...overrides
});

describe('execute_switch_actions unit edges', () => {
  // `getEntityType(metadata)` 读的 ENTITY_TYPE 反向引用是 `EntityManager.init()` 写上去的，
  // 装饰器阶段没有（装饰器返回的是子类，那时还不知道最终注册进来的是哪一个）。
  // 这个 spec 原本从不 init，metadata 上就没有反向引用 —— 旧实现把它当 `undefined` 一路带下去，
  // 现在 `getEntityType` fail-fast，缺的这一步就显形了。补一次最小 init（不连适配器）。
  beforeAll(() => {
    const rxdb = new RxDB({
      dbName: 'execute-switch-actions-unit',
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    // 桩必须带 `getRepository`：init 之后的订阅链会去取仓库，缺了会冒出 unhandled error。
    rxdb.adapter(
      'pglite',
      () =>
        ({
          getRepository: () => ({
            find: async () => [],
            count: async () => 0,
            create: async () => undefined,
            update: async () => undefined,
            remove: async () => undefined
          })
        }) as unknown as IRxDBAdapter
    );
    rxdb.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const makeAdapter = () => {
    const dispatchEvent = vi.fn();
    const adapter = {
      transaction: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      // execute_switch_actions 改走 runInTransaction（已在事务中就复用当前事务）。
      // C2 起回调收到 executor，而 execute_switch_actions 用的是 `executor.adapter`
      // （事务作用域门面）—— 不能再用闭包里的 adapter，否则翻转后会排在自己身后挂死。
      // 替身把它指回本 mock adapter，因此下面对 adapter.query 的断言语义不变。
      runInTransaction: vi.fn(async (fn: (executor: { adapter: unknown }) => Promise<void>) => {
        await fn({ adapter });
      }),
      // rows 显式声明元素类型：默认从 [] 推出 never[]，用例里的 mockResolvedValueOnce 就塞不进行数据
      query: vi.fn(async (): Promise<{ rows: Record<string, unknown>[]; affectedRows: number; fields: unknown[] }> => ({
        rows: [],
        affectedRows: 0,
        fields: []
      })),
      rxdb: {
        versionManager: {
          getCurrentBranch: vi.fn(async () => ({ id: 'main' }))
        },
        dispatchEvent
      },
      encryptionContext: undefined
    };
    return adapter;
  };

  it('disableTriggers removes then reinstalls branch triggers', async () => {
    removeAllTriggersSqlMock.mockReturnValue('DROP TRIGGER...');
    generateSwitchBranchSqlMock.mockReturnValue('CREATE TRIGGER...');

    const adapter = makeAdapter();
    const switchAction: SwitchVersionSqlResult = { deletes: [], inserts: [], updates: [] };

    await execute_switch_actions(adapter as never, switchAction, undefined, true);

    expect(adapter.runInTransaction).toHaveBeenCalledTimes(1);
    expect(removeAllTriggersSqlMock).toHaveBeenCalledWith(adapter);
    expect(adapter.query).toHaveBeenCalledWith('DROP TRIGGER...');
    expect(adapter.rxdb.versionManager.getCurrentBranch).toHaveBeenCalled();
    expect(generateSwitchBranchSqlMock).toHaveBeenCalledWith(adapter, 'main');
    expect(adapter.query).toHaveBeenCalledWith('CREATE TRIGGER...');
  });

  it('disableTriggers skips remove when SQL is empty', async () => {
    removeAllTriggersSqlMock.mockReturnValue('');
    generateSwitchBranchSqlMock.mockReturnValue('CREATE TRIGGER...');

    const adapter = makeAdapter();
    await execute_switch_actions(adapter as never, { deletes: [], inserts: [], updates: [] }, undefined, true);

    expect(adapter.query).toHaveBeenCalledTimes(1);
    expect(adapter.query).toHaveBeenCalledWith('CREATE TRIGGER...');
  });

  it('executes delete/insert/update SQL inside transaction', async () => {
    const adapter = makeAdapter();
    adapter.query
      .mockResolvedValueOnce({ rows: [{ id: 't1' }], affectedRows: 1, fields: [] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }], affectedRows: 1, fields: [] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }], affectedRows: 1, fields: [] });
    getEntityObjectFromResultMock.mockResolvedValue({ id: 't1', title: 'from-db' });
    transactionPgliteResultMock
      .mockResolvedValueOnce([{ id: 't1', createdAt: new Date('2020-01-01') }])
      .mockResolvedValueOnce([{ id: 't1', updatedAt: new Date('2020-01-02') }]);

    const switchAction = {
      deletes: [baseAction({ sql: 'DELETE FROM t', params: ['t1'] })],
      inserts: [baseAction({ sql: 'INSERT INTO t' })],
      updates: [baseAction({ sql: 'UPDATE t' })]
    };

    await execute_switch_actions(adapter as never, switchAction as never);

    // 走 runInTransaction：调用方已开事务时复用当前事务，否则它内部再开
    expect(adapter.runInTransaction).toHaveBeenCalled();
    expect(adapter.query).toHaveBeenCalledWith('DELETE FROM t', ['t1']);
    expect(adapter.query).toHaveBeenCalledWith('INSERT INTO t');
    expect(adapter.query).toHaveBeenCalledWith('UPDATE t');
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalRemovedEvent));
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalCreatedEvent));
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalUpdatedEvent));
  });

  it('dispatch delete events throw when change map misses id', async () => {
    getEntityObjectFromResultMock.mockResolvedValue({ id: 't1', title: 'from-db' });
    const adapter = makeAdapter();
    const action = baseAction({
      changes: new Map()
    });
    await expect(
      dispatch_switch_events(adapter as never, {
        deletes: [action as never],
        inserts: [],
        updates: []
      })
    ).rejects.toThrow(/Missing switch change/);
  });

  it('dispatch delete events throw when inverse patch is missing', async () => {
    getEntityObjectFromResultMock.mockResolvedValue({ title: 'no-id' });
    const adapter = makeAdapter();
    const action = baseAction({
      changes: new Map([['t1', { patch: { id: 't1' }, inversePatch: null }]]),
      successResults: { rows: [{ id: 't1' }], affectedRows: 1, fields: [] }
    });
    await expect(
      dispatch_switch_events(adapter as never, {
        deletes: [action as never],
        inserts: [],
        updates: []
      })
    ).rejects.toThrow(/Missing DELETE inverse patch/);
  });

  it('dispatch insert/update events and throw when results not executed', async () => {
    const adapter = makeAdapter();
    transactionPgliteResultMock
      .mockResolvedValueOnce([{ id: 't1', createdAt: new Date('2020-01-01') }])
      .mockResolvedValueOnce([{ id: 't1', updatedAt: new Date('2020-01-02') }]);

    const insert = baseAction({
      changes: new Map([['t1', { patch: { id: 't1', title: 'n' }, inversePatch: null }]])
    });
    const update = baseAction();
    await dispatch_switch_events(adapter as never, {
      deletes: [],
      inserts: [insert as never],
      updates: [update as never]
    });

    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalCreatedEvent));
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalUpdatedEvent));

    await expect(
      dispatch_switch_events(adapter as never, {
        deletes: [baseAction({ successResults: undefined }) as never],
        inserts: [],
        updates: []
      })
    ).rejects.toThrow(/has not been executed/);
  });

  it('dispatch delete uses returned inverse when change inversePatch is null', async () => {
    getEntityObjectFromResultMock.mockResolvedValue({ id: 't1', title: 'from-db' });
    const adapter = makeAdapter();
    const action = baseAction({
      changes: new Map([['t1', { patch: { id: 't1' }, inversePatch: null }]])
    });

    await dispatch_switch_events(adapter as never, {
      deletes: [action as never],
      inserts: [],
      updates: []
    });

    expect(removeEntityIdsFromCacheMock).toHaveBeenCalled();
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalRemovedEvent));
  });

  it('keeps number and bigint returned rows distinct when building DELETE inverse patches', async () => {
    getEntityObjectFromResultMock.mockImplementation(async (_metadata: unknown, row: Record<string, unknown>) => row);
    const adapter = makeAdapter();
    const action = baseAction({
      ids: new Set([1, 1n]),
      changes: new Map<RxDBEntityId, { patch: null; inversePatch: null }>([
        [1, { patch: null, inversePatch: null }],
        [1n, { patch: null, inversePatch: null }]
      ]),
      successResults: {
        rows: [
          { id: 1, title: 'number' },
          { id: 1n, title: 'bigint' }
        ],
        affectedRows: 2,
        fields: []
      }
    });

    await dispatch_switch_events(adapter as never, {
      deletes: [action as never],
      inserts: [],
      updates: []
    });

    const event = adapter.rxdb.dispatchEvent.mock.calls[0]?.[0] as EntityLocalRemovedEvent;
    expect(event.entities.map(entity => [entity.id, entity.inversePatch?.['title']])).toEqual([
      [1, 'number'],
      [1n, 'bigint']
    ]);
  });

  it('insert/update recordAt falls back when timestamps missing; affectedRows falls back', async () => {
    const adapter = makeAdapter();
    transactionPgliteResultMock
      .mockResolvedValueOnce([{ id: 't1' }]) // 没有 createdAt
      .mockResolvedValueOnce([{ id: 't1' }]); // 没有 updatedAt/createdAt

    const insert = baseAction({
      changes: new Map([['t1', { patch: { id: 't1', title: 'n' }, inversePatch: null }]]),
      successResults: { rows: [{ id: 't1' }], fields: [] } // 没有 affectedRows
    });
    const update = baseAction({
      changes: new Map([
        [
          't1',
          {
            patch: { id: 't1', title: 'u' },
            inversePatch: { id: 't1', title: 'old' }
          }
        ]
      ]),
      successResults: { rows: [{ id: 't1' }], fields: [] }
    });

    await dispatch_switch_events(adapter as never, {
      deletes: [],
      inserts: [insert as never],
      updates: [update as never]
    });

    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalCreatedEvent));
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalledWith(expect.any(EntityLocalUpdatedEvent));

    const created = adapter.rxdb.dispatchEvent.mock.calls.find(
      ([event]) => event instanceof EntityLocalCreatedEvent
    )?.[0] as EntityLocalCreatedEvent;
    const updated = adapter.rxdb.dispatchEvent.mock.calls.find(
      ([event]) => event instanceof EntityLocalUpdatedEvent
    )?.[0] as EntityLocalUpdatedEvent;
    expect(created.entities[0]?.recordAt).toBeInstanceOf(Date);
    expect(updated.entities[0]?.recordAt).toBeInstanceOf(Date);
  });

  it('requirePatch throws for missing INSERT/UPDATE patches', async () => {
    const adapter = makeAdapter();
    transactionPgliteResultMock
      .mockResolvedValueOnce([{ id: 't1', createdAt: new Date() }])
      .mockResolvedValueOnce([{ id: 't1', updatedAt: new Date() }]);

    await expect(
      dispatch_switch_events(adapter as never, {
        deletes: [],
        inserts: [
          baseAction({
            changes: new Map([['t1', { patch: null, inversePatch: null }]])
          }) as never
        ],
        updates: []
      })
    ).rejects.toThrow(/Missing INSERT patch/);

    await expect(
      dispatch_switch_events(adapter as never, {
        deletes: [],
        inserts: [],
        updates: [
          baseAction({
            changes: new Map([['t1', { patch: { id: 't1' }, inversePatch: null }]])
          }) as never
        ]
      })
    ).rejects.toThrow(/Missing UPDATE inverse patch/);
  });
});
