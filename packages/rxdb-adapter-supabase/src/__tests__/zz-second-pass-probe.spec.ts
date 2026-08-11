/* eslint-disable */
import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_IN_CHUNK_SIZE } from '../pagination.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import { SupabaseRepository } from '../SupabaseRepository.js';
import { SupabaseTreeRepository } from '../SupabaseTreeRepository.js';

class FakeTreeEntity {
  id = '';
  title = '';
  parentId: string | null = null;
}

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
    dispatchEvent: vi.fn()
  } as unknown as RxDB;
}

function createAdapter(clientOverrides: Record<string, unknown> = {}, entities: EntityType[] = []) {
  return new RxDBAdapterSupabase(createRxdb(entities), {
    client: clientOverrides as never,
    rlsCheck: false
  });
}

interface QueryResponse {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
}

function resolvedRecordingQuery(response: QueryResponse | ((calls: Call[]) => QueryResponse)) {
  const calls: Call[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === 'symbol' || prop === '@@observable') return undefined;
        if (prop === 'then') {
          return (resolve: (v: QueryResponse) => unknown, reject: (r: unknown) => unknown) =>
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

type Call = { method: string; args: unknown[] };

function buildTreeRepository(adapter: RxDBAdapterSupabase, overrides: Record<string, unknown> = {}) {
  const repository = Object.create(SupabaseTreeRepository.prototype) as SupabaseTreeRepository<typeof FakeTreeEntity>;
  Object.assign(repository, {
    adapter,
    EntityType: FakeTreeEntity,
    metadata: { name: 'MenuLarge', tableName: 'menu_large', propertyMap: new Map(), features: {}, ...overrides }
  });
  return repository;
}

describe('second pass probes', () => {
  it('PROBE A（已修）: connect() 在重连释放期间排队，不创建孤儿 channel', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const handlers: Array<(status: string, err?: { message?: string }) => void> = [];
    const channels: Array<Record<string, unknown>> = [];
    const onHandlers: Array<(payload: unknown) => void> = [];

    const channelFactory = vi.fn(() => {
      const channel: Record<string, unknown> = {
        on: vi.fn((_evt: string, _cfg: unknown, cb: (p: unknown) => void) => {
          onHandlers.push(cb);
          return channel;
        }),
        subscribe: vi.fn((h: (status: string, err?: { message?: string }) => void) => {
          handlers.push(h);
          return channel;
        })
      };
      channels.push(channel);
      return channel;
    });

    // removeChannel 挂起，模拟真实的 leave-push 等待服务端 ack
    let releaseRemove!: () => void;
    const removePending = new Promise<void>(resolve => {
      releaseRemove = resolve;
    });
    const removeChannel = vi.fn(async (_channel: unknown) => {
      await removePending;
      return undefined;
    });

    const adapter = createAdapter({ channel: channelFactory, removeChannel }, [Todo]);

    await adapter.connect();
    expect(channelFactory).toHaveBeenCalledTimes(1);

    // 网络抖动 -> 触发重连定时器
    handlers[0]('CHANNEL_ERROR', { message: 'socket closed' });
    await vi.advanceTimersByTimeAsync(500);
    // 此刻 #reconnectRealtimeChannel 卡在 await removeChannel

    // 应用层再次 connect（例如 visibilitychange / 手动重连）必须排在当前重连之后。
    const concurrentConnect = adapter.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(channelFactory).toHaveBeenCalledTimes(1);

    // removeChannel 完成后只创建一条替代 channel。
    releaseRemove();
    await concurrentConnect;
    await vi.advanceTimersByTimeAsync(0);
    expect(channelFactory).toHaveBeenCalledTimes(2);

    await adapter.disconnect();
    const removed = removeChannel.mock.calls.map(c => c[0]);
    expect(removed).toContain(channels[0]);
    expect(removed).toContain(channels[1]);
    expect(onHandlers).toHaveLength(2);
    vi.useRealTimers();
  });

  /**
   * 原 PROBE B 是为**证明缺陷存在**写的：断言 `findAncestors` 只发两条裸 `select`、
   * 被 PostgREST `db-max-rows` 截断后静默返回空祖先链。缺陷已修，探针随之改写为
   * 锁定修复后行为 —— 不再有裸整表查询，每一级都按 id 精确取，天然免疫截断。
   *
   * 完整祖先链的端到端断言见 `review-regressions.spec.ts`
   * 「findAncestors 在表被 PostgREST 截断时仍返回完整祖先链」。
   */
  it('PROBE B（已修）: findAncestors 逐级按 id 精确查询，不再依赖整表返回', async () => {
    const page = Array.from({ length: 1000 }, (_v, i) => ({ id: `filler-${i}`, parentId: null, title: 't' }));
    const query = resolvedRecordingQuery({ data: page, error: null });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema }, [Todo]);
    const repository = buildTreeRepository(adapter);

    await repository.findAncestors({ entityId: 'deep-node' } as never);

    // 关键：存在按 id 的精确过滤，而不是「一条裸 select 拉全表」
    const idFilters = query.calls.filter(c => c.method === 'eq' && (c.args as unknown[])[0] === 'id');
    expect(idFilters.length).toBeGreaterThan(0);
    expect(query.calls.map(c => c.method)).not.toEqual(['select', 'select']);
  });

  /**
   * 原 PROBE C 断言的是缺陷本身：单次 `in()` 携带全部 1200 个 id、全程无 `range`。
   * 缺陷已修（SUPA-004），探针改为锁定修复后的请求形状。
   *
   * 「一行都不能少」的端到端断言在真实 PostgREST 上做，见
   * `pagination-truncation.spec.ts`；这里只保证请求形状不退化回去。
   */
  it('PROBE C（已修）: findDescendants 逐层分块并翻页', async () => {
    const level1 = Array.from({ length: 1200 }, (_v, i) => ({ id: `n-${i}`, parentId: 'root', title: 't' }));
    let call = 0;
    const query = resolvedRecordingQuery(() => {
      call += 1;
      if (call === 1) return { data: [{ id: 'root', parentId: null, title: 'r' }], error: null };
      if (call === 2) return { data: level1, error: null };
      return { data: [], error: null };
    });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema }, [Todo]);
    const repository = buildTreeRepository(adapter);

    await repository.findDescendants({ entityId: 'root', level: 3 } as never);

    const inCalls = query.calls.filter(c => c.method === 'in');
    // 没有任何一次 in() 超过分块上限 —— 否则查询串会撑爆网关
    const chunkSizes = inCalls.map(c => (c.args[1] as string[]).length);
    expect(chunkSizes.length).toBeGreaterThan(0);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(SUPABASE_IN_CHUNK_SIZE);
    // 1200 个二级节点必须被切成多块，而不是一次问完
    expect(chunkSizes.filter(size => size === SUPABASE_IN_CHUNK_SIZE).length).toBe(1200 / SUPABASE_IN_CHUNK_SIZE);
    // 每一层都翻页，且带稳定排序（缺 order 时 PostgREST 的跨页行序无定义）
    expect(query.calls.some(c => c.method === 'range')).toBe(true);
    expect(query.calls.some(c => c.method === 'order' && c.args[0] === 'id')).toBe(true);
  });

  /**
   * 原 PROBE D 断言 `fetchMetadata` 无 `range`、`findByIds` 把 5000 个 id 塞进一个 `in()`。
   * 两者均已修（SUPA-005），改为锁定修复后的请求形状。
   */
  it('PROBE D（已修）: fetchMetadata 翻页、findByIds 分块', async () => {
    const rows = Array.from({ length: 10 }, (_v, i) => ({ id: `e-${i}`, updatedAt: '2026-01-01' }));
    const query = resolvedRecordingQuery({ data: rows, error: null });
    const from = vi.fn(() => query.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema }, [Todo]);

    await firstValueFrom(adapter.fetchMetadata('Todo', { combinator: 'and', rules: [] } as never));
    expect(query.calls.some(c => c.method === 'range')).toBe(true);
    expect(query.calls.some(c => c.method === 'order' && c.args[0] === 'id')).toBe(true);

    const idCount = 5000;
    const ids = Array.from({ length: idCount }, (_v, i) => `e-${i}`);
    await firstValueFrom(adapter.findByIds('Todo', ids));
    const inCalls = query.calls.filter(c => c.method === 'in');
    expect(inCalls.length).toBe(idCount / SUPABASE_IN_CHUNK_SIZE);
    expect(Math.max(...inCalls.map(c => (c.args[1] as string[]).length))).toBeLessThanOrEqual(SUPABASE_IN_CHUNK_SIZE);
  });

  it('PROBE E（已修）: SyncType.Filter 从持久快照拉取已删除实体的变更', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { id: 42, namespace: 'public', entity: 'Todo', entityId: 'gone', type: 'DELETE', createdAt: '2026-01-01' }
      ],
      error: null
    }));
    const adapter = createAdapter({ rpc }, [Todo]);
    const filter = {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    } as const;

    const changes = await adapter.pullChanges(0, 100, ['Todo'], filter as never);

    expect(rpc).toHaveBeenCalledWith('rxdb_pull_changes', {
      p_since_id: 0,
      p_limit: 100,
      p_namespace: 'public',
      p_entity: 'Todo',
      p_branch_id: null,
      p_filter: filter
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.type).toBe('DELETE');
  });

  it('PROBE F: count() 与 find() 对嵌套关系路径复用同一份 select 规划', async () => {
    const findQuery = resolvedRecordingQuery({ data: [], error: null });
    const countQuery = resolvedRecordingQuery({ data: [], count: 0, error: null });
    const from = vi.fn().mockReturnValueOnce(findQuery.proxy).mockReturnValueOnce(countQuery.proxy);
    const schema = vi.fn(() => ({ from }));
    const adapter = createAdapter({ from, schema }, [Todo]);
    const repository = new SupabaseRepository(adapter, Todo as never);
    (repository as never as { metadata: Record<string, unknown> }).metadata = {
      name: 'Order',
      tableName: 'orders',
      namespace: '',
      propertyMap: new Map(),
      relationMap: new Map([['items', { kind: '1:m', mappedEntity: 'OrderItem', mappedNamespace: '' }]])
    };
    const orderItemMetadata = {
      name: 'OrderItem',
      tableName: 'order_item',
      propertyMap: new Map(),
      relationMap: new Map([['product', { kind: 'm:1', mappedEntity: 'Product', mappedNamespace: '' }]])
    };
    const productMetadata = {
      name: 'Product',
      tableName: 'product',
      propertyMap: new Map(),
      relationMap: new Map()
    };
    adapter.rxdb.schemaManager.getEntityMetadata = vi.fn((name: string) =>
      name === 'OrderItem' ? orderItemMetadata : productMetadata
    ) as never;

    const where = { combinator: 'and', rules: [{ field: 'items.product.name', operator: '=', value: 'x' }] };
    await repository.find({ where } as never).catch(() => undefined);
    await repository.count({ where } as never).catch(() => undefined);

    const findSelect = findQuery.calls.find(c => c.method === 'select')?.args[0] as string;
    const countSelect = countQuery.calls.find(c => c.method === 'select')?.args[0] as string;
    expect(findSelect).toBeTypeOf('string');
    expect(countSelect).toBe(findSelect);
    expect(countSelect.match(/items:/g)).toHaveLength(1);
  });

  it('PROBE G（已修）: 大规模 filter 同步始终只发一次有界 RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: Array.from({ length: 1000 }, (_v, i) => ({
        id: i + 1,
        namespace: 'public',
        entity: 'Todo',
        entityId: 'x',
        type: 'UPDATE',
        createdAt: '2026-01-01'
      })),
      error: null
    }));
    const adapter = createAdapter({ rpc }, [Todo]);

    const changes = await adapter.pullChanges(0, 1000, ['Todo'], {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    } as never);

    expect(rpc).toHaveBeenCalledOnce();
    expect(changes).toHaveLength(1000);
  });

  it('PROBE H: transform_row_to_entity 保留实体原型并把 __proto__ 当作自有数据列', async () => {
    const { transform_row_to_entity } = await import('../transform.js');
    class Row {
      id = '';
      hello() {
        return 'ok';
      }
    }
    const row = JSON.parse('{"id":"1","__proto__":{"polluted":true}}');
    const entity = transform_row_to_entity(Row as never, { propertyMap: new Map() } as never, row);
    expect(Object.getPrototypeOf(entity)).toBe(Row.prototype);
    expect(entity.hello()).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(entity, '__proto__')).toBe(true);
    expect((entity as unknown as Record<string, unknown>)['__proto__']).toEqual({ polluted: true });
  });
});
