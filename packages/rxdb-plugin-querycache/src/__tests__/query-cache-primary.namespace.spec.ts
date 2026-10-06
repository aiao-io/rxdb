import { Entity, EntityBase, SyncStateHub } from '@aiao/rxdb';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createQueryCachePrimary } from '../query-cache-primary.js';
import { QueryCacheSyncMemo } from '../query-cache-sync-memo.js';
import { noPendingWrites } from './fixtures/pending-writes.js';
import { detachedReachability } from './fixtures/reachability.js';

@Entity({ name: 'ScopedRecipe', namespace: 'shop' })
class ScopedRecipe extends EntityBase {}

const setup = () => {
  const row = { id: 'recipe-1', updatedAt: '2026-10-05T00:00:00.000Z' };
  const localAdapter = {
    getRepository: vi.fn(() => ({ find: vi.fn(async () => []), count: vi.fn(async () => 0) })),
    getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
    upsertMany: vi.fn(() => of(undefined)),
    deleteByIds: vi.fn(() => of(undefined))
  };
  const remoteAdapter = {
    fetchMetadata: vi.fn(() => of([row])),
    findByIds: vi.fn(() => of([row]))
  };
  const reachability = detachedReachability();
  const primary = createQueryCachePrimary(
    'ScopedRecipe',
    ScopedRecipe,
    localAdapter as never,
    remoteAdapter as never,
    false,
    new QueryCacheSyncMemo(0),
    reachability,
    new SyncStateHub({ online$: reachability.online$ }),
    noPendingWrites
  );
  return { primary, localAdapter, remoteAdapter, row };
};

describe('QueryCache 非 public 实体作用域', () => {
  it('元数据计数向远端传递完整的命名空间标识', async () => {
    const { primary, remoteAdapter } = setup();
    const where = { combinator: 'and' as const, rules: [] };

    expect(await primary.count({ where } as never)).toBe(1);
    expect(remoteAdapter.fetchMetadata).toHaveBeenCalledWith('shop:ScopedRecipe', where);
  });

  it('同步的远端读取和本地回填使用相同的限定实体名', async () => {
    const { primary, localAdapter, remoteAdapter, row } = setup();

    await primary.find({ where: { combinator: 'and', rules: [] } } as never);

    expect(remoteAdapter.fetchMetadata).toHaveBeenCalledWith('shop:ScopedRecipe', expect.any(Object));
    expect(remoteAdapter.findByIds).toHaveBeenCalledWith('shop:ScopedRecipe', ['recipe-1']);
    expect(localAdapter.upsertMany).toHaveBeenCalledWith('shop:ScopedRecipe', [row]);
  });
});
