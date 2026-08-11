import type { RxDB, SwitchVersionActions } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

type MockWriteResponse<T> = {
  data: T;
  error: { message: string } | null;
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
    schemaManager: { getEntityMetadata: () => undefined }
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
  const rxdb = { context: { userId: 'test-user' } } as RxDB;

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
  const rxdb = { context: {}, config: { entities: [] } } as unknown as RxDB;
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
