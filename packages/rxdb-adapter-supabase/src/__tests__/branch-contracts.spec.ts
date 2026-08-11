import type { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

interface QueryResponse {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
}

function createRxdb(): RxDB {
  return {
    context: { clientId: 'branch-contract-client' },
    config: { entities: [] },
    schemaManager: { getEntityMetadata: vi.fn() },
    dispatchEvent: vi.fn()
  } as unknown as RxDB;
}

function createAdapter(client: Record<string, unknown>): RxDBAdapterSupabase {
  return new RxDBAdapterSupabase(createRxdb(), { client: client as never, rlsCheck: false });
}

function resolvedQuery(response: QueryResponse) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(response).then(resolve, reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

describe('Supabase branch contracts', () => {
  it('pushBranches skips RPC for an empty list', async () => {
    const rpc = vi.fn();
    const adapter = createAdapter({ rpc });

    await expect(adapter.pushBranches([])).resolves.toEqual({ synced: 0, skipped: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pushBranches returns a validated server result and propagates errors', async () => {
    const successRpc = vi.fn(async () => ({ data: { synced: 2, skipped: ['stale'] }, error: null }));
    const successAdapter = createAdapter({ rpc: successRpc });
    await expect(successAdapter.pushBranches([{ id: 'a' }, { id: 'b' }])).resolves.toEqual({
      synced: 2,
      skipped: ['stale']
    });

    const failureAdapter = createAdapter({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'branch write denied' } }))
    });
    await expect(failureAdapter.pushBranches([{ id: 'a' }])).rejects.toEqual(
      new SupabaseDataError('Failed to sync branches: branch write denied')
    );
  });

  it.each([
    { count: 1, expected: true },
    { count: 0, expected: false },
    { count: null, expected: false }
  ])('branchExists maps count $count to $expected', async ({ count, expected }) => {
    const from = vi.fn(() => resolvedQuery({ data: null, count, error: null }));
    const adapter = createAdapter({ from });

    await expect(adapter.branchExists('feature')).resolves.toBe(expected);
    expect(from).toHaveBeenCalledWith('rxdb_branch');
  });

  it('branchExists propagates query errors', async () => {
    const from = vi.fn(() => resolvedQuery({ data: null, error: { message: 'branch read denied' } }));
    const adapter = createAdapter({ from });

    await expect(adapter.branchExists('feature')).rejects.toEqual(
      new SupabaseDataError('Failed to check branch existence: branch read denied')
    );
  });

  it('pullBranches handles an empty result and maps branch rows', async () => {
    const emptyAdapter = createAdapter({ from: vi.fn(() => resolvedQuery({ data: [], error: null })) });
    await expect(emptyAdapter.pullBranches()).resolves.toEqual([]);

    const row = {
      id: 'feature',
      fromChangeId: 7,
      parentId: 'main',
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T01:00:00.000Z'
    };
    const adapter = createAdapter({ from: vi.fn(() => resolvedQuery({ data: [row], error: null })) });
    await expect(adapter.pullBranches()).resolves.toEqual([row]);
  });

  it('pullBranches propagates paginated query errors', async () => {
    const from = vi.fn(() => resolvedQuery({ data: null, error: { message: 'page denied' } }));
    const adapter = createAdapter({ from });

    await expect(adapter.pullBranches()).rejects.toEqual(new SupabaseDataError('Failed to pull branches: page denied'));
  });
});
