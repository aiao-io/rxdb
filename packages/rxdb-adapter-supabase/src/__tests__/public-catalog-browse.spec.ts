/**
 * 规则之外的公开数据：在线浏览走只读浏览实体，不进同步子集（US-036 AC#1～#5）
 *
 * 连真实 Supabase。同步实体 CatalogItem 按分区同步、只取同步规则选中的分类；浏览实体 PublicCatalogItem
 * 映射公开视图 catalog_items_public，走 QueryCache 以调用者身份直读，anon 不登录、不用匿名账号。
 * 每轮用带 runId 的分类与租户，远端行经 service_role 直写准备与清理，不碰其他用例与演示数据。
 */
import { PermissionDeniedError, RxDB, SyncType, type RuleGroup } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem, PublicCatalogItem } from '@aiao/rxdb-test/entities';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase, type SupabaseAdapterOptions } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const USER_A = '00000000-0000-4000-8000-0000000036a1';

interface SeedRow {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  visibility: 'public' | 'tenant';
  tenantId: string;
}

interface RecordedRequest {
  method: string;
  url: string;
}

interface OpenOptions {
  /** 同步规则选中的分类；函数形式，改写规则时下一轮同步重新求值 */
  followed?: () => readonly string[];
  rlsCheck?: SupabaseAdapterOptions['rlsCheck'];
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('规则之外的公开数据在线浏览（US-036）', () => {
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const tenant = `us036-${runId}`;
  const categoryOf = (name: string) => `us036-${runId}-${name}`;
  const service = getSupabaseServiceRoleClient();
  const databases: RxDB[] = [];
  const seeded: SeedRow[] = [];

  function row(name: string, category: string, visibility: SeedRow['visibility'] = 'public'): SeedRow {
    return {
      id: crypto.randomUUID(),
      name: `${category}/${name}`,
      category,
      price: 100,
      cost: 60,
      visibility,
      tenantId: tenant
    };
  }

  async function seed(rows: SeedRow[]): Promise<SeedRow[]> {
    const { error } = await service.from('catalog_items').insert(rows);
    expect(error).toBeNull();
    seeded.push(...rows);
    return rows;
  }

  /** 不登录的访客：只有 anon key，没有会话；`requests` 记下经它发出的每个请求 */
  function anonClient(requests?: RecordedRequest[]): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          requests?.push({ method: init?.method ?? 'GET', url: String(input) });
          return fetch(input, init);
        }
      }
    });
  }

  function categoryRule(categories: readonly string[]): RuleGroup {
    return { combinator: 'and', rules: [{ field: 'category', operator: 'in', value: [...categories] }] };
  }

  async function open(client: SupabaseClient, options: OpenOptions = {}) {
    const followed = options.followed ?? (() => []);
    const rxdb = new RxDB({
      dbName: `us036-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities: [CatalogItem, PublicCatalogItem],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } },
      syncOverrides: [
        {
          entity: CatalogItem,
          sync: {
            type: SyncType.Filter,
            local: { adapter: 'wa-sqlite' },
            remote: { adapter: 'supabase', filter: () => categoryRule(followed()) }
          }
        },
        {
          entity: PublicCatalogItem,
          sync: {
            type: SyncType.QueryCache,
            local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
            remote: { adapter: 'supabase' }
          }
        }
      ]
    });
    databases.push(rxdb);
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    rxdb.use(rxDBPluginQueryCache);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client, rlsCheck: options.rlsCheck }));
    const local = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    await rxdb.connect('supabase');
    return { rxdb, local };
  }

  /** 经浏览实体按分类分页查（QueryCache：先对账远端，再从本地读这一页） */
  function browse(rxdb: RxDB, category: string, limit: number, offset: number): Promise<PublicCatalogItem[]> {
    return firstValueFrom(
      rxdb.entityManager.getRepository(PublicCatalogItem).find({
        where: { combinator: 'and', rules: [{ field: 'category', operator: '=', value: category }] },
        orderBy: [{ field: 'name', sort: 'asc' }],
        limit,
        offset
      })
    );
  }

  /** 本地浏览缓存里某个分类的行（直读本地表，不经 QueryCache 对账） */
  async function cachedNames(local: RxDBAdapterWaSqlite, category: string): Promise<string[]> {
    const rows = await local.getRepository(PublicCatalogItem).find({
      where: { combinator: 'and', rules: [{ field: 'category', operator: '=', value: category }] }
    });
    return rows.map(item => item.name).sort();
  }

  /** 本地同步实体的全部行 id（直读本地表） */
  async function syncedIds(local: RxDBAdapterWaSqlite): Promise<string[]> {
    const rows = await local.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
    return rows.map(item => item.id).sort();
  }

  /** 对照基准：以同一身份直接查业务表，按规则选中的分类筛（RLS 裁决能读哪些区） */
  async function baselineIds(client: SupabaseClient, categories: readonly string[]): Promise<string[]> {
    const { data, error } = await client
      .from('catalog_items')
      .select('id')
      .in('category', [...categories]);
    expect(error).toBeNull();
    return (data ?? []).map(item => item.id as string).sort();
  }

  beforeAll(async () => {
    const { error } = await service.from('catalog_items').select('id').limit(1);
    expect(error, 'catalog_items 夹具缺失：先用 nx run rxdb-adapter-supabase:test-env 初始化测试栈').toBeNull();
  });

  afterAll(async () => {
    await Promise.all(databases.map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
    if (seeded.length === 0) return;
    const { error } = await service
      .from('catalog_items')
      .delete()
      .in(
        'id',
        seeded.map(item => item.id)
      );
    expect(error).toBeNull();
  });

  it('AC#1 anon 与登录用户按分类分页浏览：只有公开行，分页与排序正确，看不到成本列', async () => {
    const category = categoryOf('paged');
    const visible = await seed([row('c', category), row('a', category), row('b', category)]);
    await seed([row('private', category, 'tenant')]);
    const expected = visible.map(item => item.name).sort();

    for (const client of [anonClient(), createAuthenticatedTestClient(USER_A)]) {
      const { rxdb } = await open(client);
      const firstPage = await browse(rxdb, category, 2, 0);
      const secondPage = await browse(rxdb, category, 2, 2);
      expect([...firstPage, ...secondPage].map(item => item.name)).toEqual(expected);
      expect(firstPage.map(item => item.name)).toEqual(expected.slice(0, 2));
    }

    // 公开视图本身就没有成本列：直接按列名查会被 PostgREST 拒绝
    const { error } = await anonClient().from('catalog_items_public').select('cost').limit(1);
    expect(error?.message).toMatch(/cost/);
  });

  it('AC#2 浏览缓存过的行变成私有或被删除：再查同一分类时都从本地缓存里消失', async () => {
    const category = categoryOf('revoked');
    const [kept, hidden, deleted] = await seed([row('1', category), row('2', category), row('3', category)]);
    const { rxdb, local } = await open(anonClient());

    expect((await browse(rxdb, category, 10, 0)).map(item => item.name)).toEqual(
      [kept, hidden, deleted].map(item => item.name)
    );
    expect(await cachedNames(local, category)).toHaveLength(3);

    const update = await service.from('catalog_items').update({ visibility: 'tenant' }).eq('id', hidden.id);
    expect(update.error).toBeNull();
    const removal = await service.from('catalog_items').delete().eq('id', deleted.id);
    expect(removal.error).toBeNull();

    expect((await browse(rxdb, category, 10, 0)).map(item => item.name)).toEqual([kept.name]);
    expect(await cachedNames(local, category)).toEqual([kept.name]);
  });

  it('AC#3 浏览实体只读：创建、修改、删除在本地入口被拒，不发远端写请求', async () => {
    const category = categoryOf('readonly');
    const [existing] = await seed([row('1', category)]);
    const requests: RecordedRequest[] = [];
    const { rxdb } = await open(anonClient(requests));
    const repository = rxdb.entityManager.getRepository(PublicCatalogItem);
    const [cached] = await browse(rxdb, category, 10, 0);
    requests.length = 0;

    const draft = rxdb.entityManager.instantiate(PublicCatalogItem);
    draft.name = 'forged';
    draft.category = category;
    draft.tenantId = tenant;
    await expect(repository.create(draft)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(repository.update(cached, { name: 'renamed' })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(repository.remove(cached)).rejects.toBeInstanceOf(PermissionDeniedError);

    expect(requests.filter(request => request.method !== 'GET' && request.method !== 'HEAD')).toEqual([]);
    const { data } = await service.from('catalog_items').select('name').eq('category', category);
    expect(data).toEqual([{ name: existing.name }]);
  });

  it('AC#4 浏览实体映射到视图：自检用默认模式与 throw 模式都连接成功，不把视图报成缺表或未开 RLS', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await open(anonClient());
      await open(anonClient(), { rlsCheck: { failureMode: 'throw' } });
      const rlsWarnings = warn.mock.calls.map(args => String(args[0])).filter(message => message.includes('RLS'));
      expect(rlsWarnings).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('AC#5 改写同步规则重新对账：同步实体等于对照基准，浏览缓存不被同步清理，浏览也不改变同步子集', async () => {
    const synced = categoryOf('synced');
    const browsed = categoryOf('browsed');
    await seed([row('1', synced), row('2', synced), row('1', browsed), row('2', browsed)]);
    await seed([row('private', browsed, 'tenant')]);
    const client = anonClient();
    let followed: readonly string[] = [synced];
    const { rxdb, local } = await open(client, { followed: () => followed });

    await rxdb.syncManager.pull();
    expect(await syncedIds(local)).toEqual(await baselineIds(client, [synced]));

    const browsedNames = (await browse(rxdb, browsed, 10, 0)).map(item => item.name);
    expect(browsedNames).toEqual([`${browsed}/1`, `${browsed}/2`]);
    // 浏览不改变同步子集
    expect(await syncedIds(local)).toEqual(await baselineIds(client, [synced]));

    followed = [browsed];
    await rxdb.syncManager.pull();
    expect(await syncedIds(local)).toEqual(await baselineIds(client, [browsed]));
    // 同步的清理只动同步实体的表，浏览缓存原样还在
    expect(await cachedNames(local, browsed)).toEqual(browsedNames);

    await browse(rxdb, synced, 10, 0);
    expect(await syncedIds(local)).toEqual(await baselineIds(client, [browsed]));
  });
});
