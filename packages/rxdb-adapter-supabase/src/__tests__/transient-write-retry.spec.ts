import { isNetworkError, NetworkOfflineError, type RxDB, type SwitchVersionActions } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import { RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS } from '../supabase.helpers.js';

type MockWriteResponse<T> = {
  data: T;
  error: { message: string } | null;
  /** HTTP 状态码；`0` = 传输失败。省略即沿用旧用例「不关心状态码」的写法 */
  status?: number;
};

const TRANSIENT_ERROR = { message: 'An invalid response was received from the upstream server' };

/** 构造一个只暴露 rpc 的适配器替身，rpc 按 responses 顺序逐次返回 */
function createRpcAdapter(responses: Array<MockWriteResponse<unknown>>) {
  const rpc = vi.fn();
  for (const response of responses) {
    rpc.mockResolvedValueOnce(response);
  }
  const client = { rpc } as unknown as SupabaseClient;
  const rxdb = {
    context: { userId: 'u1', clientId: 'c1' },
    schemaManager: { getEntityMetadata: () => undefined },
    // 适配器每次往返都往这儿报结局；本套件只判重试次数与错误分类，用桩避免真 monitor 的退避定时器漏进下个用例
    reachability: { report: () => undefined }
  } as unknown as RxDB;
  return { adapter: new RxDBAdapterSupabase(rxdb, { client }), rpc };
}

const emptyActions = (): SwitchVersionActions => ({
  inserts: new Map(),
  updates: new Map(),
  deletes: new Map([['public:Todo:t1', { patch: null, inversePatch: { id: 't1' } }]])
});

function createMockTodo(title: string) {
  return {
    id: `todo-${title}`,
    title,
    completed: false,
    constructor: Todo
  } as unknown as Todo;
}

function createMockAdapter(responses: Array<MockWriteResponse<unknown>>) {
  const select = vi.fn();

  for (const response of responses) {
    select.mockResolvedValueOnce(response);
  }

  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  const schema = vi.fn(() => ({ from }));
  const client = { from, schema } as unknown as SupabaseClient;
  const rxdb = {
    context: { userId: 'test-user' },
    reachability: { report: () => undefined }
  } as unknown as RxDB;

  return {
    adapter: new RxDBAdapterSupabase(rxdb, { client }),
    select,
    upsert,
    from,
    schema
  };
}

function createDeleteAdapter(response: MockWriteResponse<unknown>) {
  const select = vi.fn(async () => response);
  const inIds = vi.fn(() => ({ select }));
  const remove = vi.fn(() => ({ in: inIds }));
  const from = vi.fn(() => ({ delete: remove }));
  const schema = vi.fn(() => ({ from }));
  const client = { from, schema } as unknown as SupabaseClient;
  const rxdb = {
    context: {},
    config: { entities: [] },
    reachability: { report: () => undefined }
  } as unknown as RxDB;
  return { adapter: new RxDBAdapterSupabase(rxdb, { client }), select };
}

describe('Supabase transient write retry', () => {
  it('version returns the remote PostgreSQL version', async () => {
    const { adapter, rpc } = createRpcAdapter([{ data: 'PostgreSQL 17.4 on x86_64', error: null }]);

    await expect(adapter.version()).resolves.toBe('PostgreSQL 17.4 on x86_64');
    expect(rpc).toHaveBeenCalledWith('rxdb_server_version');
  });

  it.each([null, undefined, '', 17, {}])('version rejects an invalid RPC response: %s', async data => {
    const { adapter } = createRpcAdapter([{ data, error: null }]);

    await expect(adapter.version()).rejects.toBeInstanceOf(SupabaseDataError);
  });

  it('saveMany retries transient upstream errors', async () => {
    const todo = createMockTodo('retry-save-many');

    const { adapter, select } = createMockAdapter([
      {
        data: [],
        error: { message: 'An invalid response was received from the upstream server' }
      },
      {
        data: [{ ...todo }],
        error: null
      }
    ]);

    const result = await adapter.saveMany([todo]);

    expect(select).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(todo.id);
    expect(result[0].title).toBe(todo.title);
  });

  it('saveMany does not retry non transient data errors', async () => {
    const todo = createMockTodo('non-retryable-save-many');

    const { adapter, select } = createMockAdapter([
      {
        data: [],
        error: { message: 'duplicate key value violates unique constraint' }
      }
    ]);

    await expect(adapter.saveMany([todo])).rejects.toThrow(
      'Failed to upsert: duplicate key value violates unique constraint'
    );
    expect(select).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, {}, { id: 'not-an-array' }])(
    'saveMany rejects an invalid successful response: %s',
    async data => {
      const todo = createMockTodo('invalid-save-many');
      const { adapter } = createMockAdapter([{ data, error: null }]);

      await expect(adapter.saveMany([todo])).rejects.toEqual(
        expect.objectContaining({ name: 'SupabaseDataError', code: 'DATA_ERROR' })
      );
    }
  );

  it('saveMany validates the successful response after a transient retry', async () => {
    const todo = createMockTodo('invalid-after-retry');
    const { adapter, select } = createMockAdapter([
      { data: null, error: TRANSIENT_ERROR },
      { data: null, error: null }
    ]);

    await expect(adapter.saveMany([todo])).rejects.toBeInstanceOf(SupabaseDataError);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('mergeChanges retries transient upstream errors', async () => {
    const { adapter, rpc } = createRpcAdapter([
      { data: null, error: TRANSIENT_ERROR },
      { data: { max_change_id: 5, change_id_mapping: [] }, error: null }
    ]);

    const result = await adapter.mergeChanges(emptyActions());

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ maxChangeId: 5 });
  });

  it('mergeChanges does not retry non-transient errors', async () => {
    const { adapter, rpc } = createRpcAdapter([{ data: null, error: { message: 'permission denied' } }]);

    await expect(adapter.mergeChanges(emptyActions())).rejects.toThrow('Failed to merge changes: permission denied');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { max_change_id: 5 }, { change_id_mapping: [] }])(
    'mergeChanges rejects an invalid successful response: %s',
    async data => {
      const { adapter } = createRpcAdapter([{ data, error: null }]);

      await expect(adapter.mergeChanges(emptyActions())).rejects.toBeInstanceOf(SupabaseDataError);
    }
  );

  it('mutations retries transient upstream errors', async () => {
    const { adapter, rpc } = createRpcAdapter([
      { data: null, error: TRANSIENT_ERROR },
      { data: { upserted: [] }, error: null }
    ]);
    const remove = new Map([[Todo, new Set([{ id: 't1' } as unknown as Todo])]]);

    const result = await adapter.mutations({ create: new Map(), update: new Map(), remove });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it.each([null, {}, { upserted: null }])('mutations rejects an invalid successful response: %s', async data => {
    const { adapter } = createRpcAdapter([{ data, error: null }]);
    const remove = new Map([[Todo, new Set([{ id: 't1' } as unknown as Todo])]]);

    await expect(adapter.mutations({ create: new Map(), update: new Map(), remove })).rejects.toBeInstanceOf(
      SupabaseDataError
    );
  });

  it.each([null, {}, { synced: 1 }, { synced: -1, skipped: [] }, { synced: 1, skipped: [1] }])(
    'pushBranches rejects an invalid successful response: %s',
    async data => {
      const { adapter } = createRpcAdapter([{ data, error: null }]);

      await expect(adapter.pushBranches([{ id: 'feature' }])).rejects.toBeInstanceOf(SupabaseDataError);
    }
  );

  it('removeMany rejects a partial delete response', async () => {
    const first = createMockTodo('delete-first');
    const second = createMockTodo('delete-second');
    const { adapter } = createDeleteAdapter({ data: [{ id: first.id }], error: null });

    await expect(adapter.removeMany([first, second])).rejects.toThrow(second.id);
  });
});

/**
 * RV-001 在**写路径**上的样子。
 *
 * @remarks
 * `querycache-error-contract.spec.ts` 冻结的是读路径（`fetchMetadata` / `findByIds`），
 * 那里状态码直接就在手边。写路径不一样：它先重试若干次，**重试耗尽之后**才拿最后一次
 * 的 `status` 去分类。这一段此前一条用例都没有，于是三件事都是敞开的——
 * 传输失败被包成 `SupabaseDataError`（`offlineFallback` 认不出，可降级的场景硬失败）、
 * 业务拒绝被包成 `NetworkOfflineError`（403 被静默换成陈旧缓存）、
 * 以及分类读错了轮次的 `status`。
 */
describe('Supabase 写路径的错误分类（RV-001）', () => {
  const TRANSPORT_FAILURE = { message: 'TypeError: Failed to fetch' };
  const BUSINESS_FAILURE = { message: 'permission denied for table "Todo"' };

  it('传输失败（status 0）重试耗尽后抛 NetworkOfflineError，且错误不带数字 status', async () => {
    // 传输失败本身就在可重试名单里，所以「耗尽」是三次全打完，不是一次就抛
    const offline = { data: null, error: TRANSPORT_FAILURE, status: 0 };
    const { adapter, select } = createMockAdapter([offline, offline, offline]);
    const error = await adapter.saveMany([createMockTodo('transport')]).catch((e: unknown) => e);

    expect(select).toHaveBeenCalledTimes(RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS);
    expect(error).toBeInstanceOf(NetworkOfflineError);
    expect(isNetworkError(error)).toBe(true);
    // 带上数字 status 会命中 isNetworkError 第 2 条判据「拿到状态码说明连接是通的」，
    // 把刚判成网络错误的结论原地抵消
    expect((error as { status?: unknown }).status).toBeUndefined();
  });

  it('业务拒绝（403）仍是 SupabaseDataError，isNetworkError 判 false', async () => {
    const { adapter } = createMockAdapter([{ data: null, error: BUSINESS_FAILURE, status: 403 }]);
    const error = await adapter.saveMany([createMockTodo('forbidden')]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SupabaseDataError);
    // 判成网络错误的话，offlineFallback 会把一次「你没权限」静默换成一份陈旧缓存
    expect(isNetworkError(error)).toBe(false);
  });

  it('先传输失败后被业务拒绝：按**最后一次**响应分类，不是第一次', async () => {
    const { adapter, select } = createMockAdapter([
      { data: null, error: TRANSIENT_ERROR, status: 0 },
      { data: null, error: BUSINESS_FAILURE, status: 403 }
    ]);
    const error = await adapter.saveMany([createMockTodo('blip-then-403')]).catch((e: unknown) => e);

    expect(select).toHaveBeenCalledTimes(2);
    // 一次网络抖动之后远端明确拒绝——报成「离线」等于让调用方一直重试一个永远不会成功的写
    expect(error).toBeInstanceOf(SupabaseDataError);
    expect(isNetworkError(error)).toBe(false);
  });

  it('反向同理：先 5xx 后掉线，最终判成 NetworkOfflineError', async () => {
    const { adapter, select } = createMockAdapter([
      { data: null, error: TRANSIENT_ERROR, status: 502 },
      { data: null, error: TRANSIENT_ERROR, status: 0 },
      { data: null, error: TRANSIENT_ERROR, status: 0 }
    ]);
    const error = await adapter.saveMany([createMockTodo('502-then-offline')]).catch((e: unknown) => e);

    expect(select).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkOfflineError);
    expect(isNetworkError(error)).toBe(true);
  });

  it('缺 status 的响应按业务错误处理，不猜成离线', async () => {
    // 未来若有 handler 忘了透传 status，宁可硬失败也不要静默降级到缓存
    const { adapter } = createMockAdapter([{ data: null, error: BUSINESS_FAILURE }]);
    const error = await adapter.saveMany([createMockTodo('no-status')]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SupabaseDataError);
    expect(isNetworkError(error)).toBe(false);
  });
});
