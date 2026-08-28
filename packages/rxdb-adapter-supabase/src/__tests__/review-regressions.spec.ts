import {
  Entity,
  EntityBase,
  PropertyType,
  getEntityMetadata,
  getRxDBEntityIdentityKey,
  type EntityMetadata,
  type EntityPropertyMetadata,
  type EntityType,
  type RuleGroup,
  type RxDB,
  type RxDBMutationsMap
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { Order, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseConfigError, SupabaseDataError } from '../errors.js';
import { handleSupabaseChange } from '../handle_supabase_change.js';
import { apply_rule_group } from '../rule_group_builder.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import type { SupabaseAdapterOptions } from '../supabase.interface.js';
import { SupabaseRepository } from '../SupabaseRepository.js';
import { SupabaseTreeRepository } from '../SupabaseTreeRepository.js';

class FakeTreeEntity {
  id = '';
  title = '';
  parentId: string | null = null;
  createdAt = new Date();
  updatedAt = new Date();
}

@Entity({
  name: 'ScopedRecord',
  namespace: 'shop',
  tableName: 'scoped_records',
  properties: []
})
class ShopScopedRecord extends EntityBase {}

@Entity({
  name: 'ScopedRecord',
  namespace: 'tenant',
  tableName: 'tenant_scoped_records',
  properties: []
})
class TenantScopedRecord extends EntityBase {}

const property = (name: string, type: PropertyType): EntityPropertyMetadata =>
  ({ name, columnName: name, type }) as EntityPropertyMetadata;

function createRxdb(entities: EntityType[] = []): RxDB {
  const metadata = entities.map(entity => getEntityMetadata(entity));
  return {
    context: { userId: 'test-user', clientId: 'local-client' },
    config: { entities },
    schemaManager: {
      getEntityMetadata: vi.fn((name: string, namespace: string) =>
        metadata.find(item => item.name === name && (!namespace || item.namespace === namespace))
      )
    },
    dispatchEvent: vi.fn(),
    // 适配器每次往返都往这儿报结局；本套件不判可达性，用桩避免真 monitor 的退避定时器漏进下个用例
    reachability: { report: () => undefined }
  } as unknown as RxDB;
}

function createAdapter(
  clientOverrides: Record<string, unknown> = {},
  options: Partial<SupabaseAdapterOptions> = {},
  entities: EntityType[] = []
) {
  const client = clientOverrides;
  const rxdb = createRxdb(entities);

  return new RxDBAdapterSupabase(rxdb, { client: client as never, ...options });
}

function createRepositoryClientMocks() {
  const createResponse = { id: 'todo-create', createdBy: 'test-user', updatedBy: 'test-user' };
  const updateResponse = { id: 'todo-update', updatedBy: 'test-user' };

  const insertSingle = vi.fn(async () => ({ data: createResponse, error: null }));
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const updateSingle = vi.fn(async () => ({ data: updateResponse, error: null }));
  const updateSelect = vi.fn(() => ({ single: updateSingle }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const from = vi.fn(() => ({ insert, update }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { from, schema },
    insert,
    update
  };
}

/** 记录所有链式方法调用的 query builder 替身，方法均返回自身以支持链式调用 */
function recordingQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      }
    }
  );
  return { proxy, calls };
}

interface QueryResponse {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
}

function resolvedRecordingQuery(
  response: QueryResponse | ((calls: Array<{ method: string; args: unknown[] }>) => QueryResponse)
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === '@@observable') return undefined;
        if (prop === 'then') {
          return (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(typeof response === 'function' ? response(calls) : response).then(resolve, reject);
        }

        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      }
    }
  );
  return { proxy, calls };
}

/**
 * 模拟 PostgREST 的分页链尾：`.order(...).range(...)` 之后才 await。
 *
 * 树遍历的每一层都要翻页（SUPA-004），手写替身若停在 `.in()` 就 await，
 * 会把「不分页」这个缺陷当成契约锁住。
 */
function pagedResponse<T>(result: T): { order: () => { range: () => Promise<T> } } {
  return { order: () => ({ range: async () => result }) };
}

function buildTreeRepository(adapter: RxDBAdapterSupabase, metadataOverrides: Record<string, unknown> = {}) {
  const repository = Object.create(SupabaseTreeRepository.prototype) as SupabaseTreeRepository<typeof FakeTreeEntity>;
  Object.assign(repository, {
    adapter,
    // 真构造函数走的是 `super(adapter.rxdb, …)`；这里绕开了构造函数，得自己补上同一份引用
    rxdb: adapter.rxdb,
    EntityType: FakeTreeEntity,
    metadata: {
      name: 'MenuLarge',
      tableName: 'menu_large',
      propertyMap: new Map(),
      features: {},
      ...metadataOverrides
    }
  });
  return repository;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('supabase review regressions', () => {
  it('requires a non-empty URL and key when no client is supplied', () => {
    const rxdb = createRxdb();

    expect(() => new RxDBAdapterSupabase(rxdb, {})).toThrow(SupabaseConfigError);
    expect(() => new RxDBAdapterSupabase(rxdb, { supabaseUrl: '  ', supabaseKey: 'test-key' })).toThrow(
      SupabaseConfigError
    );
    expect(
      () => new RxDBAdapterSupabase(rxdb, { supabaseUrl: 'https://example.supabase.co', supabaseKey: '  ' })
    ).toThrow(SupabaseConfigError);
  });

  it('checks RLS for the change and branch system tables by default', async () => {
    const subscribe = vi.fn(() => undefined);
    const channel = vi.fn(() => ({ on: vi.fn(() => ({ subscribe })) }));
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const adapter = createAdapter({ rpc, channel }, {}, [Todo]);

    await adapter.connect();

    expect(rpc).toHaveBeenCalledWith('rxdb_check_rls', {
      p_tables: expect.arrayContaining([
        { schema: 'public', table: 'rxdb_change' },
        { schema: 'public', table: 'rxdb_branch' },
        { schema: 'public', table: 'todos' }
      ])
    });
  });

  it('scopes pull and count queries by both logical namespace and entity', async () => {
    const pullQuery = resolvedRecordingQuery({ data: [], error: null });
    const countQuery = resolvedRecordingQuery({ data: [{ id: 9 }], count: 1, error: null });
    const from = vi.fn().mockReturnValueOnce(pullQuery.proxy).mockReturnValueOnce(countQuery.proxy);
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord]);

    await adapter.pullChanges(0, 10, ['ScopedRecord']);
    await adapter.getChangeCount(0, ['ScopedRecord']);

    for (const calls of [pullQuery.calls, countQuery.calls]) {
      expect(calls).toContainEqual({ method: 'eq', args: ['namespace', 'shop'] });
      expect(calls).toContainEqual({ method: 'eq', args: ['entity', 'ScopedRecord'] });
    }
  });

  /**
   * `filter` 只在恰好一个实体 scope 时才被应用，其余情况静默忽略 ——
   * 对以 filter 做数据隔离（多租户按 `ownerId` 过滤）的场景就是越权数据下发。
   * 按「无 fallback 兜底」铁律，无法应用时必须 fail-fast 而不是降级为全量拉取。
   */
  it('pullChanges 在多 scope 下带 filter 时必须抛错，而不是静默返回未过滤结果', async () => {
    const from = vi.fn();
    const adapter = createAdapter({ from }, {}, [Todo, ShopScopedRecord]);
    const filter = {
      combinator: 'and',
      rules: [{ field: 'ownerId', operator: '=', value: 'u1' }]
    } as RuleGroup<Record<string, unknown>> as RuleGroup<unknown>;

    await expect(adapter.pullChanges(0, 10, ['Todo', 'ScopedRecord'], filter)).rejects.toThrow(
      /exactly one repository scope/i
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('pullChanges 在无 repositoryFilter 下带 filter 时同样抛错', async () => {
    const from = vi.fn();
    const adapter = createAdapter({ from }, {}, [Todo]);
    const filter = {
      combinator: 'and',
      rules: [{ field: 'ownerId', operator: '=', value: 'u1' }]
    } as RuleGroup<Record<string, unknown>> as RuleGroup<unknown>;

    await expect(adapter.pullChanges(0, 10, undefined, filter)).rejects.toThrow(/exactly one repository scope/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('pullChanges rejects relation filters that cannot be evaluated from an entity snapshot', async () => {
    const rpc = vi.fn();
    const adapter = createAdapter({ rpc }, {}, [Todo]);

    await expect(
      adapter.pullChanges(0, 10, ['Todo'], {
        combinator: 'and',
        rules: [{ field: 'owner.name', operator: '=', value: 'alice' }]
      } as never)
    ).rejects.toThrow('only supports direct entity fields');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pullChanges returns early for a non-positive limit', async () => {
    const from = vi.fn();
    const adapter = createAdapter({ from }, {}, [Todo]);

    await expect(adapter.pullChanges(0, 0, ['Todo'])).resolves.toEqual([]);
    await expect(adapter.pullChanges(0, -1, ['Todo'])).resolves.toEqual([]);

    expect(from).not.toHaveBeenCalled();
  });

  it('pullChanges combines scopes, applies branch filtering, sorts, and trims results', async () => {
    const query = resolvedRecordingQuery({
      data: [
        {
          id: 3,
          createdAt: '2026-07-10T03:00:00.000Z',
          updatedAt: null
        },
        {
          id: 1,
          createdAt: '2026-07-10T01:00:00.000Z',
          updatedAt: '2026-07-10T02:00:00.000Z'
        },
        {
          id: 2,
          createdAt: '2026-07-10T02:00:00.000Z'
        }
      ],
      error: null
    });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord, Todo]);

    const result = await adapter.pullChanges(0, 2, ['shop:ScopedRecord', 'Todo'], undefined, 'feature');

    expect(query.calls).toContainEqual({
      method: 'or',
      args: ['and(namespace.eq.shop,entity.eq.ScopedRecord),and(namespace.eq.public,entity.eq.Todo)']
    });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['branchId', 'feature'] });
    expect(result.map(change => change.id)).toEqual([1, 2]);
    expect(result[0].createdAt).toEqual(new Date('2026-07-10T01:00:00.000Z'));
    expect(result[0].updatedAt).toEqual(new Date('2026-07-10T02:00:00.000Z'));
    expect(result[1].updatedAt).toBeNull();
  });

  it('pullChanges handles null data and reports query errors', async () => {
    const emptyQuery = resolvedRecordingQuery({ data: null, error: null });
    const errorQuery = resolvedRecordingQuery({ data: null, error: { message: 'read denied' } });
    const from = vi.fn().mockReturnValueOnce(emptyQuery.proxy).mockReturnValueOnce(errorQuery.proxy);
    const adapter = createAdapter({ from }, {}, [Todo]);

    await expect(adapter.pullChanges(0, 10, ['Todo'])).resolves.toEqual([]);
    await expect(adapter.pullChanges(0, 10, ['Todo'])).rejects.toThrow(
      new SupabaseDataError('Failed to pull changes: read denied')
    );
  });

  it('pullChanges sends filters to the snapshot RPC even when no row currently matches', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const adapter = createAdapter({ rpc }, {}, [ShopScopedRecord]);
    const filter = {
      combinator: 'and',
      rules: [{ field: 'status', operator: '=', value: 'active' }]
    } as const;

    await expect(adapter.pullChanges(0, 10, ['ScopedRecord'], filter)).resolves.toEqual([]);

    expect(rpc).toHaveBeenCalledWith('rxdb_pull_changes', {
      p_since_id: 0,
      p_limit: 10,
      p_namespace: 'shop',
      p_entity: 'ScopedRecord',
      p_branch_id: null,
      p_filter: filter
    });
  });

  it('getChangeCount combines scopes and preserves the cursor for null aggregates', async () => {
    const query = resolvedRecordingQuery({ data: null, count: null, error: null });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord, Todo]);

    const result = await adapter.getChangeCount(17, ['shop:ScopedRecord', 'Todo'], 'feature');

    expect(query.calls).toContainEqual({
      method: 'or',
      args: ['and(namespace.eq.shop,entity.eq.ScopedRecord),and(namespace.eq.public,entity.eq.Todo)']
    });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['branchId', 'feature'] });
    expect(result).toEqual({ count: 0, latestChangeId: 17 });
  });

  it('getChangeCount preserves the cursor when count data has no latest row', async () => {
    const query = resolvedRecordingQuery({ data: [], count: 2, error: null });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [Todo]);

    await expect(adapter.getChangeCount(23, ['Todo'])).resolves.toEqual({ count: 2, latestChangeId: 23 });
  });

  it('getChangeCount reports query errors', async () => {
    const query = resolvedRecordingQuery({ data: null, error: { message: 'count denied' } });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [Todo]);

    await expect(adapter.getChangeCount(0, ['Todo'])).rejects.toThrow(
      new SupabaseDataError('Failed to get change count: count denied')
    );
  });

  it('skips empty push, batch pull, and id lookup operations', async () => {
    const from = vi.fn();
    const schema = vi.fn();
    const rpc = vi.fn();
    const adapter = createAdapter({ from, schema, rpc }, {}, [Todo]);

    await expect(
      adapter.mergeChanges({ inserts: new Map(), updates: new Map(), deletes: new Map() })
    ).resolves.toBeUndefined();
    await expect(adapter.pullChangesBatch([], 10)).resolves.toEqual([]);
    await expect(firstValueFrom(adapter.findByIds('Todo', []))).resolves.toEqual([]);

    expect(from).not.toHaveBeenCalled();
    expect(schema).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('mergeChanges decodes typed action keys before sending entity IDs to Supabase', async () => {
    const rpc = vi.fn(async () => ({ data: { max_change_id: 3, change_id_mapping: [] }, error: null }));
    const adapter = createAdapter({ rpc }, {}, [Todo]);
    const insertId = '11111111-1111-4111-8111-111111111111';
    const updateId = '22222222-2222-4222-8222-222222222222';
    const deleteId = '33333333-3333-4333-8333-333333333333';
    const key = (id: string) => `public:Todo:${getRxDBEntityIdentityKey(id)}`;

    await adapter.mergeChanges({
      inserts: new Map([[key(insertId), { patch: { title: 'inserted' }, inversePatch: null }]]),
      updates: new Map([[key(updateId), { patch: { title: 'updated' }, inversePatch: null }]]),
      deletes: new Map([[key(deleteId), { patch: null, inversePatch: { title: 'deleted' } }]])
    });

    expect(rpc).toHaveBeenCalledWith(
      'rxdb_mutations',
      expect.objectContaining({
        p_changes: expect.arrayContaining([
          expect.objectContaining({ entityId: insertId, type: 'INSERT' }),
          expect.objectContaining({ entityId: updateId, type: 'UPDATE' }),
          expect.objectContaining({ entityId: deleteId, type: 'DELETE' })
        ]),
        p_upserts: [
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({ id: insertId }),
              expect.objectContaining({ id: updateId })
            ])
          })
        ],
        p_deletes: [expect.objectContaining({ ids: [deleteId] })]
      })
    );
  });

  it('query-cache operations handle null data without inventing rows', async () => {
    const metadataQuery = resolvedRecordingQuery({ data: null, error: null });
    const entitiesQuery = resolvedRecordingQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(metadataQuery.proxy).mockReturnValueOnce(entitiesQuery.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ schema }, {}, [ShopScopedRecord]);

    await expect(
      firstValueFrom(adapter.fetchMetadata('shop:ScopedRecord', { combinator: 'and', rules: [] }))
    ).resolves.toEqual([]);
    await expect(firstValueFrom(adapter.findByIds('shop:ScopedRecord', ['missing']))).resolves.toEqual([]);
  });

  it('query-cache operations report Supabase query errors', async () => {
    const metadataQuery = resolvedRecordingQuery({ data: null, error: { message: 'metadata denied' } });
    const entitiesQuery = resolvedRecordingQuery({ data: null, error: { message: 'entities denied' } });
    const from = vi.fn().mockReturnValueOnce(metadataQuery.proxy).mockReturnValueOnce(entitiesQuery.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ schema }, {}, [ShopScopedRecord]);

    await expect(
      firstValueFrom(adapter.fetchMetadata('shop:ScopedRecord', { combinator: 'and', rules: [] }))
    ).rejects.toThrow(new SupabaseDataError('Failed to fetch metadata: metadata denied'));
    await expect(firstValueFrom(adapter.findByIds('shop:ScopedRecord', ['one']))).rejects.toThrow(
      new SupabaseDataError('Failed to find by ids: entities denied')
    );
  });

  it('rejects an explicit namespace and entity pair that is not configured', async () => {
    const from = vi.fn();
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord]);

    await expect(adapter.getChangeCount(0, ['tenant:ScopedRecord'])).rejects.toThrow(
      'Entity "tenant:ScopedRecord" is not configured'
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('includes namespace in every batch pull condition', async () => {
    const query = resolvedRecordingQuery({ data: [], error: null });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord, Todo]);

    await adapter.pullChangesBatch(
      [
        { namespace: 'shop', entity: 'ScopedRecord', sinceId: 7 },
        { namespace: 'public', entity: 'Todo', sinceId: 11 }
      ],
      50
    );

    expect(query.calls).toContainEqual({
      method: 'or',
      args: ['and(namespace.eq.shop,entity.eq.ScopedRecord,id.gt.7),and(namespace.eq.public,entity.eq.Todo,id.gt.11)']
    });
  });

  it('uses an explicit namespace for the single-request batch fast path', async () => {
    const query = resolvedRecordingQuery({ data: [], error: null });
    const from = vi.fn(() => query.proxy);
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord, TenantScopedRecord]);

    await adapter.pullChangesBatch([{ namespace: 'shop', entity: 'ScopedRecord', sinceId: 7 }], 50);

    expect(query.calls).toContainEqual({ method: 'eq', args: ['namespace', 'shop'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['entity', 'ScopedRecord'] });
  });

  it('fails fast when an entity name is ambiguous across namespaces', async () => {
    const from = vi.fn();
    const adapter = createAdapter({ from }, {}, [ShopScopedRecord, TenantScopedRecord]);

    await expect(adapter.getChangeCount(0, ['ScopedRecord'])).rejects.toThrow(
      'Entity "ScopedRecord" is configured in multiple namespaces'
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('uses configured schema and table for query-cache operations', async () => {
    const metadataQuery = resolvedRecordingQuery({
      data: [{ id: 'one', updatedAt: '2026-07-11T00:00:00.000Z' }],
      error: null
    });
    const entitiesQuery = resolvedRecordingQuery({ data: [{ id: 'one' }], error: null });
    const from = vi.fn().mockReturnValueOnce(metadataQuery.proxy).mockReturnValueOnce(entitiesQuery.proxy);
    const schema = vi.fn(() => ({ from }));
    const rootFrom = vi.fn();
    const adapter = createAdapter({ schema, from: rootFrom }, {}, [ShopScopedRecord]);

    await firstValueFrom(
      adapter.fetchMetadata('ScopedRecord', {
        combinator: 'and',
        rules: []
      })
    );
    await firstValueFrom(adapter.findByIds('ScopedRecord', ['one']));

    expect(schema).toHaveBeenCalledTimes(2);
    expect(schema).toHaveBeenNthCalledWith(1, 'shop');
    expect(schema).toHaveBeenNthCalledWith(2, 'shop');
    expect(from).toHaveBeenNthCalledWith(1, 'scoped_records');
    expect(from).toHaveBeenNthCalledWith(2, 'scoped_records');
    expect(rootFrom).not.toHaveBeenCalled();
  });

  it('ignores realtime events outside the configured entity scope', () => {
    const adapter = createAdapter({}, {}, [ShopScopedRecord]);
    const adapterRxdb = (adapter as unknown as { rxdb: RxDB }).rxdb;
    const dispatchEvent = vi.mocked(adapterRxdb.dispatchEvent);
    const payload = {
      table: 'rxdb_change',
      eventType: 'INSERT',
      new: {
        namespace: 'tenant',
        entity: 'ScopedRecord',
        entityId: 'foreign-id',
        type: 'INSERT',
        branchId: 'main',
        patch: { title: 'foreign' },
        clientId: 'other-client'
      }
    };

    handleSupabaseChange(adapter, payload as never);

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not call MenuLarge-specific RPCs for a generic tree repository', async () => {
    const query = resolvedRecordingQuery({ data: [], error: null });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const rpc = vi.fn();
    const adapter = createAdapter({ rpc, schema });
    const repository = buildTreeRepository(adapter, {
      name: 'CategoryTree',
      namespace: 'shop',
      tableName: 'category_tree'
    });

    await repository.findDescendants({ entityId: 'root', level: 2 });
    await repository.findAncestors({ entityId: 'leaf', level: 2 });

    expect(rpc).not.toHaveBeenCalled();
    expect(schema).toHaveBeenCalledWith('shop');
    expect(from).toHaveBeenCalledWith('category_tree');
  });

  it('keeps filtered change requests and response memory bounded by the requested limit', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      namespace: 'shop',
      entity: 'ScopedRecord',
      entityId: `id-${index}`,
      type: 'UPDATE',
      createdAt: '2026-01-01'
    }));
    const rpc = vi.fn(async () => ({ data: rows, error: null }));
    const adapter = createAdapter({ rpc }, {}, [ShopScopedRecord]);

    const changes = await adapter.pullChanges(0, 50, ['ScopedRecord'], {
      combinator: 'and',
      rules: [{ field: 'status', operator: '=', value: 'active' }]
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(changes).toHaveLength(50);
  });

  it('uses !inner for a one-level relation filter', async () => {
    const query = resolvedRecordingQuery({ data: [], error: null });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ schema, from }, {}, [User, Order]);
    const repository = new SupabaseRepository(adapter, User);

    await repository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'orders.amount', operator: '>', value: 100 }]
      }
    });

    const selectCall = query.calls.find(call => call.method === 'select');
    expect(selectCall?.args[0]).toContain('orders:order!inner(*)');
  });

  it('mutations returns early for empty operations', async () => {
    const rpc = vi.fn();
    const adapter = createAdapter({ rpc });

    const result = await adapter.mutations({
      create: new Map(),
      update: new Map(),
      remove: new Map()
    } as unknown as RxDBMutationsMap<typeof FakeTreeEntity>);

    expect(result).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('getChangeCount uses a single query for count and latest id', async () => {
    const builder = {
      gt: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn()
    };
    builder.gt.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.limit.mockResolvedValue({ data: [{ id: 42 }], count: 3, error: null });

    const select = vi.fn(() => builder);
    const from = vi.fn(() => ({ select }));
    const adapter = createAdapter({ from }, {}, [Todo]);

    const result = await adapter.getChangeCount(10, ['Todo'], 'main');

    expect(result).toEqual({ count: 3, latestChangeId: 42 });
    expect(from).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('between rejects arrays that do not contain exactly two values', () => {
    const invalidBetweenValue = [1] as unknown as [number, number];
    const filter: RuleGroup<{ score: number }> = {
      combinator: 'and',
      rules: [{ field: 'score', operator: 'between', value: invalidBetweenValue }]
    };

    expect(() => apply_rule_group({} as never, filter)).toThrow('between operator requires a two-item array');
  });

  it('connect warns when RLS is disabled for configured tables', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi.fn(async () => ({
      data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: false, rlsForced: false }],
      error: null
    }));

    const adapter = createAdapter(
      { rpc, channel },
      {
        rlsCheck: {
          tables: [{ table: 'todo' }]
        }
      }
    );

    await adapter.connect();

    expect(rpc).toHaveBeenCalledWith('rxdb_check_rls', {
      p_tables: [{ schema: 'public', table: 'todo' }]
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('RLS is disabled for tables: public.todo'));
    expect(channel).toHaveBeenCalledWith('rxdb-changes');
    warn.mockRestore();
  });

  it('connect rejects disabled RLS in strict mode without starting realtime', async () => {
    const channel = vi.fn();
    const rpc = vi.fn(async () => ({
      data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: false, rlsForced: false }],
      error: null
    }));
    const adapter = createAdapter(
      { rpc, channel },
      {
        rlsCheck: {
          failureMode: 'throw',
          tables: [{ table: 'todo' }]
        }
      }
    );

    await expect(adapter.connect()).rejects.toThrow('RLS is disabled for tables: public.todo');
    await expect(adapter.connect()).rejects.toThrow('RLS is disabled for tables: public.todo');

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(channel).not.toHaveBeenCalled();
  });

  it('connect retries a transient RLS check failure in warn mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: true, rlsForced: false }],
        error: null
      });
    const removeChannel = vi.fn(async () => undefined);
    const adapter = createAdapter({ rpc, channel, removeChannel }, { rlsCheck: { tables: [{ table: 'todo' }] } });

    await adapter.connect();
    await adapter.disconnect();
    await adapter.connect();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'));
  });

  it('connect accepts enabled RLS without requiring FORCE when writes use invoker rights', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi.fn(async () => ({
      data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: true, rlsForced: false }],
      error: null
    }));
    const adapter = createAdapter({ rpc, channel }, { rlsCheck: { tables: [{ table: 'todo' }] } });

    await adapter.connect();

    expect(warn).not.toHaveBeenCalled();
    expect(channel).toHaveBeenCalledWith('rxdb-changes');
    warn.mockRestore();
  });

  it('connect accepts RLS-enabled-but-not-forced in strict mode', async () => {
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi.fn(async () => ({
      data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: true, rlsForced: false }],
      error: null
    }));
    const adapter = createAdapter(
      { rpc, channel },
      { rlsCheck: { failureMode: 'throw', tables: [{ table: 'todo' }] } }
    );

    await expect(adapter.connect()).resolves.toBe(adapter);
    expect(channel).toHaveBeenCalledWith('rxdb-changes');
  });

  it('connect accepts enabled RLS when the RPC also reports rlsForced', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi.fn(async () => ({
      data: [{ schema: 'public', table: 'todo', exists: true, rlsEnabled: true, rlsForced: true }],
      error: null
    }));
    const adapter = createAdapter({ rpc, channel }, { rlsCheck: { tables: [{ table: 'todo' }] } });

    await adapter.connect();

    expect(warn).not.toHaveBeenCalled();
    expect(channel).toHaveBeenCalledWith('rxdb-changes');
    warn.mockRestore();
  });

  it('connect rejects a missing RLS RPC in strict mode without starting realtime', async () => {
    const channel = vi.fn();
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'function public.rxdb_check_rls(jsonb) does not exist' }
    }));
    const adapter = createAdapter(
      { rpc, channel },
      {
        rlsCheck: {
          failureMode: 'throw',
          tables: [{ table: 'todo' }]
        }
      }
    );

    await expect(adapter.connect()).rejects.toThrow(
      'RLS self-check skipped because RPC "rxdb_check_rls" is not installed'
    );

    expect(channel).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'reports a requested table as missing',
      data: [{ schema: 'public', table: 'todo', exists: false, rlsEnabled: false, rlsForced: false }]
    },
    {
      name: 'omits a requested table from the response',
      data: []
    }
  ])('connect rejects when the RLS RPC $name', async ({ data }) => {
    const channel = vi.fn();
    const rpc = vi.fn(async () => ({ data, error: null }));
    const adapter = createAdapter(
      { rpc, channel },
      {
        rlsCheck: {
          failureMode: 'throw',
          tables: [{ table: 'todo' }]
        }
      }
    );

    await expect(adapter.connect()).rejects.toThrow('RLS is disabled for tables: public.todo');

    expect(channel).not.toHaveBeenCalled();
  });

  it('connect skips RLS verification when explicitly disabled', async () => {
    const subscribe = vi.fn(() => undefined);
    const on = vi.fn(() => ({ subscribe }));
    const channel = vi.fn(() => ({ on }));
    const rpc = vi.fn();

    const adapter = createAdapter(
      { rpc, channel },
      {
        rlsCheck: false
      }
    );

    await adapter.connect();

    expect(rpc).not.toHaveBeenCalled();
    expect(channel).toHaveBeenCalledWith('rxdb-changes');
  });

  it('reconnects realtime subscription with exponential backoff', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers: Array<(status: string, err?: { message?: string }) => void> = [];
    const channels: Array<Record<string, unknown>> = [];
    const channelFactory = vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn((handler: (status: string, err?: { message?: string }) => void) => {
          handlers.push(handler);
          return channel;
        })
      };
      channels.push(channel);
      return channel;
    });
    const removeChannel = vi.fn(async () => undefined);

    const adapter = createAdapter(
      { channel: channelFactory, removeChannel },
      {
        rlsCheck: false
      }
    );

    await adapter.connect();
    handlers[0]('CHANNEL_ERROR', { message: 'socket closed' });
    await vi.advanceTimersByTimeAsync(499);

    expect(channelFactory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(channelFactory).toHaveBeenCalledTimes(2);

    handlers[1]('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(999);

    expect(channelFactory).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);

    expect(removeChannel).toHaveBeenCalledWith(channels[1]);
    expect(channelFactory).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith('Supabase Realtime subscription failed:', { message: 'socket closed' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Retrying in 500ms'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Retrying in 1000ms'));
  });

  it('continues realtime recovery when removing the failed channel rejects', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handlers: Array<(status: string, err?: { message?: string }) => void> = [];
    const channelFactory = vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn((handler: (status: string, err?: { message?: string }) => void) => {
          handlers.push(handler);
          return channel;
        })
      };
      return channel;
    });
    const removeChannel = vi.fn().mockRejectedValueOnce(new Error('leave failed'));
    const adapter = createAdapter(
      { channel: channelFactory, removeChannel },
      {
        rlsCheck: false
      }
    );

    await adapter.connect();
    handlers[0]('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(500);

    expect(channelFactory).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to remove realtime channel: leave failed'));
  });

  it('refreshes pullable count from persistent repository watermarks after subscribing', async () => {
    const refreshPullableCount = vi.fn(async () => undefined);
    const handlers: Array<(status: string) => void> = [];
    const channelFactory = vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn((handler: (status: string) => void) => {
          handlers.push(handler);
          return channel;
        })
      };
      return channel;
    });
    const adapter = createAdapter(
      { channel: channelFactory },
      {
        rlsCheck: false
      }
    );
    Object.assign(adapter.rxdb, { versionManager: { refreshPullableCount } });

    await adapter.connect();
    handlers[0]('SUBSCRIBED');
    await vi.waitFor(() => expect(refreshPullableCount).toHaveBeenCalledOnce());
  });

  it('does not let a pending pullable count refresh block disconnect', async () => {
    const refreshPullableCount = vi.fn(() => new Promise<void>(() => undefined));
    const removeChannel = vi.fn(async () => undefined);
    const handlers: Array<(status: string) => void> = [];
    const channelFactory = vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn((handler: (status: string) => void) => {
          handlers.push(handler);
          return channel;
        })
      };
      return channel;
    });
    const adapter = createAdapter(
      { channel: channelFactory, removeChannel },
      {
        rlsCheck: false
      }
    );
    Object.assign(adapter.rxdb, { versionManager: { refreshPullableCount } });

    await adapter.connect();
    handlers[0]('SUBSCRIBED');
    await vi.waitFor(() => expect(refreshPullableCount).toHaveBeenCalledOnce());

    await expect(adapter.disconnect()).resolves.toBeUndefined();
    expect(removeChannel).toHaveBeenCalledOnce();
  });

  it('disconnect cancels pending realtime reconnect', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handlers: Array<(status: string, err?: { message?: string }) => void> = [];
    const channels: Array<Record<string, unknown>> = [];
    const channelFactory = vi.fn(() => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn((handler: (status: string, err?: { message?: string }) => void) => {
          handlers.push(handler);
          return channel;
        })
      };
      channels.push(channel);
      return channel;
    });
    const removeChannel = vi.fn(async () => undefined);

    const adapter = createAdapter(
      { channel: channelFactory, removeChannel },
      {
        rlsCheck: false
      }
    );

    await adapter.connect();
    handlers[0]('CLOSED');
    await adapter.disconnect();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Retrying in 500ms'));
  });

  it('repository create and update inject audit fields symmetrically', async () => {
    const { client, insert, update } = createRepositoryClientMocks();
    const adapter = createAdapter(client as Record<string, unknown>);
    const now = new Date();

    // create/update 的返回值要经 transform_row_to_entity 实例化，而 Todo 的构造函数需要 RxDB
    // 上下文；FakeTreeEntity 无此依赖，本用例只关心写入侧的审计字段注入。
    const repository = Object.create(SupabaseRepository.prototype) as SupabaseRepository<typeof FakeTreeEntity>;
    Object.assign(repository, {
      adapter,
      rxdb: adapter.rxdb,
      EntityType: FakeTreeEntity,
      metadata: {
        name: 'FakeTreeEntity',
        propertyMap: new Map([
          ['id', { ...property('id', PropertyType.string), readonly: true }],
          ['title', property('title', PropertyType.string)],
          ['createdAt', { ...property('createdAt', PropertyType.date), readonly: true }],
          ['updatedAt', { ...property('updatedAt', PropertyType.date), readonly: true }],
          ['createdBy', { ...property('createdBy', PropertyType.string), readonly: true }],
          ['updatedBy', { ...property('updatedBy', PropertyType.string), readonly: true }]
        ]),
        foreignKeyNames: [],
        foreignKeyColumnNames: [],
        foreignKeyRelationMap: new Map()
      }
    });

    const entity = {
      id: 'node-audit-fields',
      title: 'audit-fields',
      parentId: null,
      createdAt: now,
      updatedAt: now
    } as unknown as FakeTreeEntity;

    await repository.create(entity);
    await repository.update(entity, {
      id: 'replacement-id',
      title: 'updated',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-02T00:00:00.000Z')
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 'test-user',
        updatedBy: 'test-user'
      })
    );
    expect(update).toHaveBeenCalledWith({
      title: 'updated',
      updatedBy: 'test-user'
    });
  });

  // find() 把行经 transform_row_to_entity 还原成实体实例；create/update 直接把 PostgREST
  // 原始 JSON 强转返回——日期是字符串、对象不是实体类实例，与 find 及 sqlite/pglite 全不一致。
  it('repository create and update return transformed entity instances', async () => {
    const createdAt = '2026-04-11T00:00:00.000Z';
    const insertSingle = vi.fn(async () => ({
      data: { id: 'node-create', title: 'created', parentId: null, createdAt, updatedAt: createdAt },
      error: null
    }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) }));

    const updateSingle = vi.fn(async () => ({
      data: { id: 'node-update', title: 'updated', parentId: null, createdAt, updatedAt: createdAt },
      error: null
    }));
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })) }));

    const from = vi.fn(() => ({ insert, update }));
    const adapter = createAdapter({ from, schema: vi.fn(() => ({ from })) });
    // FakeTreeEntity 的构造函数不依赖 RxDB 上下文，可以真的被 transform_row_to_entity new 出来
    const repository = Object.create(SupabaseRepository.prototype) as SupabaseRepository<typeof FakeTreeEntity>;
    Object.assign(repository, {
      adapter,
      rxdb: adapter.rxdb,
      EntityType: FakeTreeEntity,
      metadata: {
        name: 'FakeTreeEntity',
        propertyMap: new Map([
          ['id', property('id', PropertyType.string)],
          ['title', property('title', PropertyType.string)],
          ['parentId', property('parentId', PropertyType.string)],
          ['createdAt', property('createdAt', PropertyType.date)],
          ['updatedAt', property('updatedAt', PropertyType.date)]
        ])
      }
    });
    const entity = { id: 'node-transform', title: 'x', parentId: null } as unknown as FakeTreeEntity;

    const created = await repository.create(entity);
    expect(created).toBeInstanceOf(FakeTreeEntity);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);

    const updated = await repository.update(entity, { title: 'updated' });
    expect(updated).toBeInstanceOf(FakeTreeEntity);
    expect(updated.createdAt).toBeInstanceOf(Date);
    expect(updated.updatedAt).toBeInstanceOf(Date);
  });

  it('repository remove rejects when no row is deleted', async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned' }
    }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const remove = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: remove }));
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema });
    const repository = new SupabaseRepository(adapter, Todo);

    await expect(repository.remove({ id: 'missing' } as unknown as Todo)).rejects.toThrow('Failed to remove entity');
  });

  it('tree fallback loads descendants level by level and preserves entity transforms', async () => {
    const rootCreatedAt = new Date('2026-04-11T00:00:00.000Z').toISOString();
    const childCreatedAt = new Date('2026-04-11T01:00:00.000Z').toISOString();

    const rootNode = {
      id: 'root',
      title: 'Root',
      parentId: null,
      createdAt: rootCreatedAt,
      updatedAt: rootCreatedAt
    };
    const childNode = {
      id: 'child',
      title: 'Child',
      parentId: 'root',
      createdAt: childCreatedAt,
      updatedAt: childCreatedAt
    };

    const select = vi.fn(() => ({
      eq: vi.fn((_field: string, id: string) => ({
        limit: vi.fn(async () => ({ data: id === 'root' ? [rootNode] : [], error: null }))
      })),
      is: vi.fn(() => pagedResponse({ data: [rootNode], error: null })),
      in: vi.fn((_field: string, parentIds: string[]) =>
        pagedResponse({ data: parentIds.includes('root') ? [childNode] : [], error: null })
      )
    }));
    const from = vi.fn(() => ({ select }));
    const schema = vi.fn(() => ({ from }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'Could not find function public.get_descendants' }
    }));
    const adapter = createAdapter({ rpc, schema, from });
    const repository = Object.create(SupabaseTreeRepository.prototype) as SupabaseTreeRepository<
      typeof FakeTreeEntity
    > & {
      adapter: RxDBAdapterSupabase;
      EntityType: typeof FakeTreeEntity;
    };

    const repositoryInternals = {
      adapter,
      // 真构造函数走的是 `super(adapter.rxdb, …)`；这里绕开了构造函数，得自己补上同一份引用
      rxdb: adapter.rxdb,
      EntityType: FakeTreeEntity,
      metadata: {
        name: 'MenuLarge',
        propertyMap: new Map([
          ['id', property('id', PropertyType.string)],
          ['title', property('title', PropertyType.string)],
          ['parentId', property('parentId', PropertyType.string)],
          ['createdAt', property('createdAt', PropertyType.date)],
          ['updatedAt', property('updatedAt', PropertyType.date)]
        ]),
        features: {
          tree: { hasChildren: true }
        }
      }
    } satisfies {
      adapter: RxDBAdapterSupabase;
      EntityType: typeof FakeTreeEntity;
      metadata: Pick<EntityMetadata, 'name' | 'propertyMap' | 'features'>;
    };
    Object.assign(repository, repositoryInternals);

    const result = await repository.findDescendants({ entityId: 'root', level: 1 });

    expect(result.map(entity => entity.id)).toEqual(['root', 'child']);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect((result[0] as unknown as Record<string, unknown>)['hasChildren']).toBe(true);
    expect((result[1] as unknown as Record<string, unknown>)['hasChildren']).toBe(false);
  });

  it('tree fallback queries metadata.tableName, not the entity name', async () => {
    const fromTables: string[] = [];
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
      is: vi.fn(() => pagedResponse({ data: [], error: null })),
      in: vi.fn(() => pagedResponse({ data: [], error: null }))
    }));
    const from = vi.fn((table: string) => {
      fromTables.push(table);
      return { select };
    });
    const schema = vi.fn(() => ({ from }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'Could not find function public.get_descendants' }
    }));
    const adapter = createAdapter({ rpc, schema });
    const repository = buildTreeRepository(adapter);

    await repository.findDescendants({ entityId: 'root', level: 1 });

    expect(fromTables).toContain('menu_large');
    expect(fromTables).not.toContain('MenuLarge');
  });

  it('ancestor fallback queries metadata.tableName, not the entity name', async () => {
    const fromTables: string[] = [];
    // findAncestors 改为自底向上逐级查询后，链式调用是 select().eq().limit()；
    // hasChildren 判定则是 select().in().order().range()
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
      in: vi.fn(() => pagedResponse({ data: [], error: null }))
    }));
    const from = vi.fn((table: string) => {
      fromTables.push(table);
      return { select };
    });
    const schema = vi.fn(() => ({ from }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'Could not find function public.get_ancestors' }
    }));
    const adapter = createAdapter({ rpc, schema });
    const repository = buildTreeRepository(adapter);

    await repository.findAncestors({ entityId: 'leaf', level: 5 });

    expect(fromTables).toContain('menu_large');
    expect(fromTables).not.toContain('MenuLarge');
  });

  /**
   * 原实现用一条无 where、无 range 的 `select('*')` 把整张表拉到客户端再内存回溯。
   * PostgREST 默认 `max-rows`（通常 1000）会**静默截断**：目标节点或其祖先落在截断之外时，
   * `while` 在 `nodeMap.get(currentId)` 未命中处提前 `break`，返回**不完整的祖先链且不报错**。
   */
  it('findAncestors 在表被 PostgREST 截断时仍返回完整祖先链', async () => {
    // 真实树：leaf → mid → root；但「整表查询」只会返回 1000 条噪音行（不含这三个）
    const tree: Record<string, { id: string; parentId: string | null }> = {
      leaf: { id: 'leaf', parentId: 'mid' },
      mid: { id: 'mid', parentId: 'root' },
      root: { id: 'root', parentId: null }
    };
    const truncated = Array.from({ length: 1000 }, (_, i) => ({ id: `noise-${i}`, parentId: null }));

    const from = vi.fn(() => {
      const calls: Array<{ method: string; args: unknown[] }> = [];
      const proxy: Record<string, unknown> = {};
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return proxy;
        };
      for (const m of ['select', 'eq', 'in', 'order', 'range', 'limit']) proxy[m] = record(m);
      // 按 id 精确查 → 命中真实节点；无 id 条件 → 模拟被截断的整表结果
      proxy['then'] = (resolve: (v: unknown) => unknown) => {
        const idCall = calls.find(c => c.method === 'eq' && c.args[0] === 'id');
        if (idCall) {
          const node = tree[String(idCall.args[1])];
          return Promise.resolve(resolve({ data: node ? [node] : [], error: null }));
        }
        const parentIn = calls.find(c => c.method === 'in' && c.args[0] === 'parentId');
        if (parentIn) return Promise.resolve(resolve({ data: [], error: null }));
        return Promise.resolve(resolve({ data: truncated, error: null }));
      };
      return proxy;
    });
    const schema = vi.fn(() => ({ from }));
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'Could not find function public.get_ancestors' } }));
    const adapter = createAdapter({ rpc, schema });
    const repository = buildTreeRepository(adapter);

    const ancestors = await repository.findAncestors({ entityId: 'leaf', level: 100 });

    expect(ancestors.map(a => (a as unknown as { id: string }).id)).toEqual(['leaf', 'mid', 'root']);
  });

  it('countDescendants never returns a negative value for a missing node', async () => {
    const query = resolvedRecordingQuery({ data: [], error: null });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ schema });
    const repository = buildTreeRepository(adapter);

    const count = await repository.countDescendants({ entityId: 'missing', level: 100 });

    expect(count).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 101])(
    'tree repositories reject an invalid level before querying: %s',
    async level => {
      const schema = vi.fn();
      const adapter = createAdapter({ schema });
      const repository = buildTreeRepository(adapter);

      await expect(repository.findDescendants({ entityId: 'root', level })).rejects.toThrow();
      await expect(repository.findAncestors({ entityId: 'root', level })).rejects.toThrow();
      expect(schema).not.toHaveBeenCalled();
    }
  );

  it('tree repositories default to the current node only', async () => {
    const nodes = new Map([
      ['root', { id: 'root', parentId: 'parent' }],
      ['parent', { id: 'parent', parentId: null }]
    ]);
    const loadChildren = vi.fn(() => pagedResponse({ data: [], error: null }));
    const select = vi.fn(() => ({
      eq: vi.fn((_field: string, id: string) => ({
        limit: vi.fn(async () => ({ data: nodes.has(id) ? [nodes.get(id)] : [], error: null }))
      })),
      in: loadChildren
    }));
    const from = vi.fn(() => ({ select }));
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ schema });
    const repository = buildTreeRepository(adapter);

    const descendants = await repository.findDescendants({ entityId: 'root' });
    const ancestors = await repository.findAncestors({ entityId: 'root' });

    expect(descendants.map(entity => entity.id)).toEqual(['root']);
    expect(ancestors.map(entity => entity.id)).toEqual(['root']);
    expect(loadChildren).not.toHaveBeenCalled();
  });

  it('find appends a stable id order even when no orderBy is provided', async () => {
    const orderArgs: Array<[string, { ascending: boolean }]> = [];
    const builder: Record<string, unknown> = {};
    builder['select'] = vi.fn(() => builder);
    builder['order'] = vi.fn((field: string, opts: { ascending: boolean }) => {
      orderArgs.push([field, opts]);
      return builder;
    });
    builder['range'] = vi.fn(async () => ({ data: [], error: null }));
    const from = vi.fn(() => builder);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema });
    const repository = new SupabaseRepository(adapter, Todo);

    await repository.find({} as Parameters<typeof repository.find>[0]);

    expect(orderArgs).toContainEqual(['id', { ascending: true }]);
  });
});

describe('rule_group_builder value escaping', () => {
  it('quotes OR scalar values that contain reserved characters', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'name', operator: '=', value: 'Hebdon,John' },
          { field: 'age', operator: '>', value: 18 }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('name.eq."Hebdon,John",age.gt.18');
  });

  it('quotes OR in() list items that contain commas', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'tag', operator: 'in', value: ['a,b', 'c'] },
          { field: 'age', operator: '>', value: 1 }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('tag.in.("a,b",c),age.gt.1');
  });

  it('escapes embedded double quotes and backslashes', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'note', operator: '=', value: 'say "hi"\\done' },
          { field: 'age', operator: '>', value: 1 }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('note.eq."say \\"hi\\"\\\\done",age.gt.1');
  });

  it('escapes reserved characters in notIn list values', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'and',
        rules: [{ field: 'tag', operator: 'notIn', value: ['a,b', 'c'] }]
      } as RuleGroup
    );

    const notCall = calls.find(call => call.method === 'not');
    expect(notCall?.args).toEqual(['tag', 'in', '("a,b",c)']);
  });

  it('quotes reserved characters in notBetween bounds', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'and',
        rules: [{ field: 'name', operator: 'notBetween', value: ['a,1', 'b,2'] }]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('name.lt."a,1",name.gt."b,2"');
  });

  it('leaves plain values unquoted (no behaviour change)', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'status', operator: '=', value: 'active' },
          { field: 'score', operator: '>=', value: 10 }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('status.eq.active,score.gte.10');
  });

  it('quotes the whole ilike pattern (wildcards included) when OR value has reserved chars', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'name', operator: 'contains', value: 'Hebdon,John' },
          { field: 'age', operator: '>', value: 18 }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    // 引号包裹整个 *值* （含通配符），否则 PostgREST 会在值内逗号处误拆条件
    expect(orCall?.args[0]).toBe('name.ilike."*Hebdon,John*",age.gt.18');
  });

  it('keeps ilike wildcards outside quotes for plain values', () => {
    const { proxy, calls } = recordingQuery();
    apply_rule_group(
      proxy as never,
      {
        combinator: 'or',
        rules: [
          { field: 'name', operator: 'startsWith', value: 'Jo' },
          { field: 'city', operator: 'endsWith', value: 'ton' }
        ]
      } as RuleGroup
    );

    const orCall = calls.find(call => call.method === 'or');
    expect(orCall?.args[0]).toBe('name.ilike.Jo*,city.ilike.*ton');
  });
});
