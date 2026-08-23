/**
 * @fileoverview RV-001 / RV-002：QueryCache ducks 的错误分类与发射契约
 *
 * 这两条契约此前只存在于 core 的实现细节里，验收用的是 core 自己写的 mock：
 * AC#16 拿裸 `TypeError` 判绿，`contracts/remote-adapter.spec.ts` 通篇 `vi.fn`。
 * 于是「supabase 断网 → 命中缓存」这条真实路径一次都没被走过。
 *
 * 本套件的判据全部落在**适配器真正抛出/发射的那个对象**上，不接受替身：
 * - RV-001：传输失败必须能被 {@link isNetworkError} 判 `true`，业务错误必须判 `false`
 * - RV-002：`fetchMetadata` 必须恰好发射一次并 `complete`（`forkJoin` 承重）
 *
 * postgrest-js 在 fetch 失败时**不 reject**，而是 catch 掉 `TypeError` 后返回
 * `{ error, status: 0, data: null }`（见 PostgrestBuilder 的 `res.catch`）。
 * 因此 `status === 0` 是传输失败唯一可靠且机器可读的判别位 —— 下面的替身按这个形状造。
 */

import {
  Entity,
  EntityBase,
  isNetworkError,
  NetworkOfflineError,
  QueryCacheRepository,
  getEntityMetadata,
  type EntityType,
  type QueryCacheLocalAdapter,
  type QueryCacheLocalReader,
  type QueryCacheRemoteAdapter,
  type RuleGroup,
  type RxDB
} from '@aiao/rxdb';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

@Entity({ name: 'Cached', namespace: 'public', tableName: 'cached', properties: [] })
class Cached extends EntityBase {}

const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

/** postgrest 传输失败的响应形状：有 error、`status` 为 0、无 HTTP 状态码 */
const TRANSPORT_FAILURE = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
  status: 0,
  statusText: ''
};

/** postgrest 业务错误的响应形状：有真实 HTTP 状态码 */
const BUSINESS_FAILURE = {
  data: null,
  error: { message: 'permission denied for table cached', details: '', hint: '', code: '42501' },
  status: 403,
  statusText: 'Forbidden'
};

function createRxdb(entities: EntityType[]): RxDB {
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

/** 永远解析到同一个响应的链式 query builder 替身 */
function alwaysResolves(response: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === '@@observable') return undefined;
        if (prop === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(response).then(resolve, reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

function createAdapter(response: unknown): RxDBAdapterSupabase {
  const from = vi.fn(() => alwaysResolves(response));
  const client = { from, schema: vi.fn(() => ({ from })) };
  return new RxDBAdapterSupabase(createRxdb([Cached]), { client: client as never });
}

/** 捕获 Observable 抛出的那个对象本身（不是它的 message） */
async function captureThrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the observable to error, but it completed');
}

describe('RV-001 — supabase 抛出的错误必须能被 isNetworkError 正确分类', () => {
  it('fetchMetadata 传输失败 → 抛出的对象 isNetworkError 为 true', async () => {
    const adapter = createAdapter(TRANSPORT_FAILURE);

    const thrown = await captureThrown(() => firstValueFrom(adapter.fetchMetadata('Cached', ALL)));

    // 判据落在适配器抛出的那个对象上，不是我们造的 TypeError
    expect(isNetworkError(thrown)).toBe(true);
  });

  it('findByIds 传输失败 → 抛出的对象 isNetworkError 为 true', async () => {
    const adapter = createAdapter(TRANSPORT_FAILURE);

    const thrown = await captureThrown(() => firstValueFrom(adapter.findByIds('Cached', ['a'])));

    expect(isNetworkError(thrown)).toBe(true);
  });

  it('传输失败的错误不得携带数字 status —— 携带会命中 isNetworkError 第 2 条判据而恒判否', async () => {
    const adapter = createAdapter(TRANSPORT_FAILURE);

    const thrown = await captureThrown(() => firstValueFrom(adapter.fetchMetadata('Cached', ALL)));

    expect(typeof (thrown as Record<string, unknown>)['status']).not.toBe('number');
  });

  it('保留原始 message，便于定位', async () => {
    const adapter = createAdapter(TRANSPORT_FAILURE);

    const thrown = await captureThrown(() => firstValueFrom(adapter.fetchMetadata('Cached', ALL)));

    expect((thrown as Error).message).toContain('Failed to fetch metadata');
    expect((thrown as Error).message).toContain('TypeError: Failed to fetch');
  });

  it('业务错误仍是 SupabaseDataError，且 isNetworkError 为 false', async () => {
    const adapter = createAdapter(BUSINESS_FAILURE);

    const thrown = await captureThrown(() => firstValueFrom(adapter.fetchMetadata('Cached', ALL)));

    expect(thrown).toBeInstanceOf(SupabaseDataError);
    // 把 403 静默换成陈旧缓存，比让离线查询失败更糟
    expect(isNetworkError(thrown)).toBe(false);
  });
});

describe('RV-002 — fetchMetadata 的发射契约（forkJoin 承重）', () => {
  it('恰好发射一次并 complete', async () => {
    const adapter = createAdapter({ data: [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }], error: null, status: 200 });

    let emissions = 0;
    let completed = false;
    await new Promise<void>((resolve, reject) => {
      adapter.fetchMetadata('Cached', ALL).subscribe({
        next: () => {
          emissions += 1;
        },
        error: reject,
        complete: () => {
          completed = true;
          resolve();
        }
      });
    });

    // 断言必须是计数：「最后一次内容对」在每页一发的实现下同样成立，那正是要拦的实现
    expect(emissions).toBe(1);
    expect(completed).toBe(true);
  });
});

describe('RV-001 端到端 —— supabase 断网时 offlineFallback 真的命中缓存', () => {
  const cachedRow = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };

  const buildRepository = (adapter: RxDBAdapterSupabase, cached: Array<typeof cachedRow>) => {
    const localAdapter: QueryCacheLocalAdapter = {
      getMetadataByIds: () => of(new Map(cached.map(row => [row.id, row.updatedAt]))),
      upsertMany: () => of(undefined),
      deleteByIds: () => of(undefined)
    };
    const localReader: QueryCacheLocalReader<typeof cachedRow> = {
      find: () => Promise.resolve(cached)
    };

    return new QueryCacheRepository(
      'Cached',
      adapter as unknown as QueryCacheRemoteAdapter,
      localAdapter,
      localReader as never
    );
  };

  it('断网 + 有缓存 → 返回缓存（这条路径此前从未被走过）', async () => {
    const repository = buildRepository(createAdapter(TRANSPORT_FAILURE), [cachedRow]);

    const rows = await firstValueFrom(repository.find({ where: ALL as never, offlineFallback: true }));

    expect(rows.map(row => (row as unknown as typeof cachedRow).id)).toEqual(['a']);
  });

  it('断网 + 无缓存 → NetworkOfflineError，且不重复包裹', async () => {
    const repository = buildRepository(createAdapter(TRANSPORT_FAILURE), []);

    const thrown = await captureThrown(() =>
      firstValueFrom(repository.find({ where: ALL as never, offlineFallback: true }))
    );

    expect(thrown).toBeInstanceOf(NetworkOfflineError);
    expect((thrown as Error).message).not.toContain('NetworkOfflineError: NetworkOfflineError');
  });

  it('业务错误 + 有缓存 → 原样上抛，不冒充离线', async () => {
    const repository = buildRepository(createAdapter(BUSINESS_FAILURE), [cachedRow]);

    const thrown = await captureThrown(() =>
      firstValueFrom(repository.find({ where: ALL as never, offlineFallback: true }))
    );

    expect(thrown).toBeInstanceOf(SupabaseDataError);
  });
});
