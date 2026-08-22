/**
 * US-020 AC#21 —— QueryCache 的读出口接**真实 sqlite 适配器**。
 *
 * 为什么非要一条集成用例：核心包里的 QueryCache 用例都拿 stub 行仓储当本地出口，
 * 而 AC#21 断言的「进 identity cache、同一 id 重复查询拿到同一实例」恰恰是**真实**
 * `SqliteRepository` 的性质 —— 对着 stub 断言等于在断言 stub 自己。这里把本地换成
 * 真 sqlite-wasm，远端换成一个内存替身（只有 QueryCache 用得到的 duck 有真实内容），
 * 于是「QueryCache 的 find 原样交出本地 `IRepository` 的实例」成为可证伪的。
 *
 * 替身只在**远端**这一侧：本地建表、读写、类型编解码、identity cache、实体状态机全是真的。
 * 实体配 `syncStaleTime: 0` 关掉 D13 的同步记忆 —— 每次 `find` 都完整跑一遍同步，
 * 本用例断言的正是那条完整链路，而记忆本身已在核心包按 AC#23 单测过。
 */
import type { IRxDBAdapter, QueryCacheEntityMetadata, RemoteChange, RuleGroup } from '@aiao/rxdb';
import { Entity, EntityBase, getEntityStatus, PropertyType, RxDB, RxDBAdapterRemoteBase, SyncType } from '@aiao/rxdb';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { firstValueFrom, Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

@Entity({
  name: 'CachedArticle',
  tableName: 'cached_articles',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'status', type: PropertyType.string }
  ],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite-wasm', syncStaleTime: 0 },
    remote: { adapter: 'memory-remote' }
  }
})
class CachedArticle extends EntityBase {
  title!: string;
  status!: string;
}

/**
 * 远端行的形状。
 *
 * @remarks
 * `updatedAt` 是 ISO 串而不是 `Date`：QueryCache 的新鲜度比较按 ISO 字典序做，
 * 这也是真实远端（Supabase / HTTP JSON）交出来的形状。
 */
interface ArticleRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const ALL: RuleGroup<CachedArticle> = { combinator: 'and', rules: [] };

const article = (id: string, title: string, updatedAt: string): ArticleRow => ({
  id,
  title,
  status: 'published',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt
});

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

/** 把写入口收到的实体实例压回远端的行形状（日期转 ISO，丢掉代理与状态槽位） */
const toRow = (data: Record<string, unknown>, fallback?: ArticleRow): ArticleRow => ({
  id: iso(data['id']),
  title: data['title'] === undefined ? (fallback?.title ?? '') : String(data['title']),
  status: data['status'] === undefined ? (fallback?.status ?? '') : String(data['status']),
  createdAt: data['createdAt'] === undefined ? (fallback?.createdAt ?? '') : iso(data['createdAt']),
  updatedAt: iso(data['updatedAt'] ?? new Date())
});

/**
 * 远端替身：只有 QueryCache 用得到的 duck 有真实内容。
 *
 * @remarks
 * 版本化同步那三个抽象成员（`pullChanges` / `getChangeCount` / `mergeChanges`）在本用例里
 * 不该被调用 —— 库级 `SyncType.None` 加实体级 QueryCache，两条路都不走 changelog。
 * 因此它们 reject 而不是返回空值：真被调到了就是接线出了问题，不能让它静默通过。
 */
class MemoryRemoteAdapter extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  readonly name = 'memory-remote';
  readonly rows = new Map<string, ArticleRow>();
  fetchMetadataCalls = 0;

  constructor(rxdb: RxDB, seed: ArticleRow[]) {
    super(rxdb);
    for (const row of seed) {
      this.rows.set(row.id, row);
    }
  }

  connect(): Promise<IRxDBAdapter> {
    return Promise.resolve(this);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve('memory-remote');
  }

  getRepository(): never {
    throw new Error('memory-remote: QueryCache 不经远端仓储读写');
  }

  saveMany(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 不参与批量写'));
  }

  removeMany(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 不参与批量写'));
  }

  mutations(): Promise<never> {
    return Promise.reject(new Error('memory-remote: QueryCache 不走 mutations'));
  }

  isTableExisted(): Promise<boolean> {
    return Promise.resolve(true);
  }

  pullChanges(): Promise<RemoteChange[]> {
    return Promise.reject(new Error('memory-remote: 本用例不做版本化同步'));
  }

  getChangeCount(): Promise<{ count: number; latestChangeId: number }> {
    return Promise.reject(new Error('memory-remote: 本用例不做版本化同步'));
  }

  mergeChanges(): Promise<number> {
    return Promise.reject(new Error('memory-remote: 本用例不做版本化同步'));
  }

  fetchMetadata(): Observable<QueryCacheEntityMetadata[]> {
    this.fetchMetadataCalls += 1;
    return of([...this.rows.values()].map(({ id, updatedAt }) => ({ id, updatedAt })));
  }

  findByIds<T>(_entityName: string, ids: string[]): Observable<T[]> {
    const found = ids.map(id => this.rows.get(id)).filter((row): row is ArticleRow => row !== undefined);
    return of(found as T[]);
  }

  create<T>(_entityName: string, data: T): Observable<T> {
    const row = toRow(data as Record<string, unknown>);
    this.rows.set(row.id, row);
    return of(row as T);
  }

  update<T>(_entityName: string, id: string, patch: Partial<T>): Observable<T> {
    const current = this.rows.get(id);
    if (!current) {
      throw new Error(`memory-remote: 未知 id ${id}`);
    }
    const next = toRow({ ...(patch as Record<string, unknown>), id, updatedAt: new Date() }, current);
    this.rows.set(id, next);
    return of(next as T);
  }

  delete(_entityName: string, ids: string | string[]): Observable<void> {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      this.rows.delete(id);
    }
    return of(undefined);
  }
}

const createDatabase = async (seed: ArticleRow[]) => {
  const rxdb = new RxDB({
    dbName: `qc-identity-${Math.random().toString(36).slice(2, 10)}`,
    context: { userId: 'userId' },
    entities: [CachedArticle],
    // 库级不同步：QueryCache 由实体级元数据声明，这里只负责把两侧适配器名解析成流
    sync: {
      type: SyncType.None,
      local: { adapter: 'sqlite-wasm' },
      remote: { adapter: 'memory-remote' }
    }
  });

  let remote!: MemoryRemoteAdapter;
  rxdb.adapter(
    'sqlite-wasm',
    db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl })
  );
  rxdb.adapter('memory-remote', db => {
    remote = new MemoryRemoteAdapter(db, seed);
    return remote;
  });

  await rxdb.connect('sqlite-wasm');
  await rxdb.connect('memory-remote');

  const repository = rxdb.entityManager.getRepository(CachedArticle);
  const find = async () => firstValueFrom(repository.find({ where: ALL }));
  const byId = (rows: CachedArticle[], id: string) => rows.find(row => row.id === id);

  return { rxdb, remote, repository, find, byId };
};

describe('US-020 AC#21：QueryCache 读出口接真实 sqlite 适配器', () => {
  let ctx: Awaited<ReturnType<typeof createDatabase>>;

  beforeEach(async () => {
    ctx = await createDatabase([
      article('a1', 'first', '2026-08-05T00:00:00.000Z'),
      article('a2', 'second', '2026-08-06T00:00:00.000Z')
    ]);
  });

  afterEach(async () => {
    await ctx.rxdb.disconnectAll();
  });

  it('AC#21 find 交出的是带状态机的实体实例，而不是裸行', async () => {
    const rows = await ctx.find();

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toBeInstanceOf(CachedArticle);
      expect(getEntityStatus(row)).toBeDefined();
      expect(row.createdAt).toBeInstanceOf(Date);
    }
    expect(ctx.byId(rows, 'a1')?.title).toBe('first');
  });

  it('AC#21 同一 id 重复查询拿到同一实例（identity cache）', async () => {
    const first = await ctx.find();
    const second = await ctx.find();

    // 两次 find 之间同步真的又跑了一遍（syncStaleTime: 0），实例仍然同一个
    expect(ctx.remote.fetchMetadataCalls).toBeGreaterThanOrEqual(2);
    expect(ctx.byId(second, 'a1')).toBe(ctx.byId(first, 'a1'));
    expect(ctx.byId(second, 'a2')).toBe(ctx.byId(first, 'a2'));
  });

  it('AC#21 远端变新后重新查询拿到新值（stale 判定跨真实类型编解码仍成立）', async () => {
    const first = await ctx.find();
    expect(ctx.byId(first, 'a1')?.title).toBe('first');

    ctx.remote.rows.set('a1', article('a1', 'first-updated', '2026-08-09T00:00:00.000Z'));
    const second = await ctx.find();

    expect(ctx.byId(second, 'a1')?.title).toBe('first-updated');
  });

  it('AC#21 远端不再返回的行会从本地投影里清掉', async () => {
    await ctx.find();
    ctx.remote.rows.delete('a2');

    const rows = await ctx.find();

    expect(rows.map(row => row.id)).toEqual(['a1']);
  });

  it('AC#21 实例上的 save() 走 remote-then-local，本地缓存随之更新', async () => {
    const rows = await ctx.find();
    const target = ctx.byId(rows, 'a1');
    expect(target).toBeDefined();

    target!.title = 'renamed';
    await target!.save();

    expect(ctx.remote.rows.get('a1')?.title).toBe('renamed');
    const reread = await ctx.find();
    expect(ctx.byId(reread, 'a1')?.title).toBe('renamed');
  });

  it('AC#21 实例上的 remove() 同时清远端与本地行缓存', async () => {
    const rows = await ctx.find();
    const target = ctx.byId(rows, 'a1');
    expect(target).toBeDefined();

    await target!.remove();

    expect(ctx.remote.rows.has('a1')).toBe(false);
    const reread = await ctx.find();
    expect(reread.map(row => row.id)).not.toContain('a1');
  });
});
