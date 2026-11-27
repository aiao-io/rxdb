/**
 * @fileoverview 外键成环的推送：`mergeChanges` 怎么把延迟外键交给 `rxdb_mutations`（US-038 AC#11）
 *
 * @remarks
 * 全程 mock `client.rpc`，不连远端。服务端的三遍执行由 SQL 回归 `deferred-cycle` 覆盖，真栈由 `fk-cycle-sync.spec.ts` 覆盖。
 */
import { compactChanges, type IRxDBChange, type RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseConfigError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

const ENTITIES = [
  { namespace: 'shop', name: 'User', tableName: 'user' },
  { namespace: 'shop', name: 'IdCard', tableName: 'id_card' }
];

function createAdapter() {
  const rpc = vi.fn();
  const rxdb = {
    context: { userId: 'test-user', clientId: 'local-client' },
    schemaManager: {
      getEntityMetadata: vi.fn((name: string, namespace: string) =>
        ENTITIES.find(item => item.name === name && item.namespace === namespace)
      ),
      getEntityMetadataByTableName: vi.fn((tableName: string, namespace: string) =>
        ENTITIES.find(item => item.tableName === tableName && item.namespace === namespace)
      )
    },
    reachability: { report: vi.fn() }
  } as unknown as RxDB;
  const adapter = new RxDBAdapterSupabase(rxdb, { client: { rpc } as never });
  return { adapter, rpc };
}

const userChange: IRxDBChange = {
  id: 1,
  namespace: 'shop',
  entity: 'User',
  entityId: 'u-1',
  type: 'INSERT',
  branchId: 'main',
  patch: { id: 'u-1', name: 'u', idCardId: 'c-1' },
  inversePatch: null,
  clientId: 'local-client',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};
const cardChange: IRxDBChange = {
  ...userChange,
  id: 2,
  entity: 'IdCard',
  entityId: 'c-1',
  patch: { id: 'c-1', code: 'x', ownerId: 'u-1' }
};
const deferred = { deferredForeignKeys: [{ namespace: 'shop', entity: 'User', property: 'idCardId' }] };
const applied = {
  data: {
    max_change_id: 2,
    change_id_mapping: [
      { localId: 1, remoteId: 101 },
      { localId: 2, remoteId: 102 }
    ],
    entity_results: []
  },
  error: null,
  status: 200
};

describe('RxDBAdapterSupabase 的延迟外键（US-038）', () => {
  it('声明支持延迟外键', () => {
    expect(createAdapter().adapter.supportsDeferredForeignKeys).toBe(true);
  });

  it('main 分支带延迟外键时，把它们换成表与列交给 p_deferred_columns', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValueOnce(applied);

    await adapter.mergeChanges(compactChanges([userChange, cardChange]), 'main', [userChange, cardChange], deferred);

    expect(rpc).toHaveBeenCalledWith(
      'rxdb_mutations',
      expect.objectContaining({ p_deferred_columns: [{ schema: 'shop', table: 'user', column: 'idCardId' }] })
    );
  });

  it('没有延迟外键、或推的不是 main 分支时不带 p_deferred_columns：旧服务端照常可用', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValue(applied);

    await adapter.mergeChanges(compactChanges([userChange, cardChange]), 'main', [userChange, cardChange], {});
    await adapter.mergeChanges(compactChanges([userChange, cardChange]), 'main', [userChange, cardChange]);
    const feature = [
      { ...userChange, branchId: 'feature' },
      { ...cardChange, branchId: 'feature' }
    ];
    await adapter.mergeChanges(compactChanges(feature), 'feature', feature, deferred);

    for (const [, params] of rpc.mock.calls) expect(params).not.toHaveProperty('p_deferred_columns');
  });

  it('AC#11：服务端没升级（PGRST202，找不到带 p_deferred_columns 的 rxdb_mutations）时报 SupabaseConfigError，指向迁移文档', async () => {
    const { adapter, rpc } = createAdapter();
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.rxdb_mutations(p_changes, p_deferred_columns, ...) in the schema cache'
      },
      status: 404
    });

    const pushing = adapter.mergeChanges(
      compactChanges([userChange, cardChange]),
      'main',
      [userChange, cardChange],
      deferred
    );

    await expect(pushing).rejects.toBeInstanceOf(SupabaseConfigError);
    await expect(pushing).rejects.toThrow('supabase-fk-cycle-push');
    expect(rpc).toHaveBeenCalledOnce();
  });
});
