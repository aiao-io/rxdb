import {
  Entity,
  EntityBase,
  PropertyType,
  RxDB,
  RxDBMixedVersionedCacheTransactionError,
  SyncType,
  type EntityUpdateData,
  type IRxDBAdapter,
  type IRxDBPlugin,
  type QueryCacheEntityMetadata,
  type RuleGroup,
  type SyncOptions
} from '@aiao/rxdb';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpUnsupportedOperationError } from './errors.js';
import type { HttpHandlers } from './http.interface.js';
import { RxDBAdapterHttp } from './RxDBAdapterHttp.js';

/**
 * US-212 AC#2 / #3 / #17 / #18 / #22（含 AC#20 的 inject 契约那一句）：把**真的**
 * `RxDBAdapterHttp` 挂进**真的** `RxDB`，与一个独立注册的本地适配器配对。
 *
 * 与 [RxDBAdapterHttp.spec.ts](./RxDBAdapterHttp.spec.ts) 的分工：那份在类边界上证
 * 「本包没有实现 `upsertMany` / `rawQuery`」，这份证**接线之后依然是那样跑的**——
 * 一个类干净、生产路径却把两个槽位接反了的库，前者一条用例都不会红。所以这里的断言
 * 主体全部是「谁被调用了」与「网线上出去的是什么」，而不是某个纯函数的返回值。
 */

const BASE_URL = 'https://api.example.com';

/** 本包只服务这一种配置：远端权威 + 独立注册的本地行缓存 */
const HTTP_QUERY_CACHE = {
  type: SyncType.QueryCache,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'http' }
} satisfies SyncOptions;

/**
 * 库级默认走 Full，QueryCache 只写在实体上。
 *
 * @remarks
 * 库级配 QueryCache 会连 core 的系统实体 `RxDBBranch` 一起罩进去，而它是树实体——
 * `init()` 当场以 `unsupportedTreeQueryCache` 拒绝。槽位名保持不变，`adapter:remote`
 * 仍然解析到本包（AC#17 要的就是这个）。
 */
const DATABASE_SYNC = {
  type: SyncType.Full,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'http' }
} satisfies SyncOptions;

const ALL: RuleGroup<HttpIntegrationRecipe> = { combinator: 'and', rules: [] };

const PUBLISHED: RuleGroup<HttpIntegrationRecipe> = {
  combinator: 'and',
  rules: [{ field: 'status', operator: '=', value: 'published' }]
};

/** 远端写回执统一盖这个时间戳：断言「落本地的是回执不是入参」时要认得出来 */
const SERVER_STAMP = '2026-08-23T12:00:00.000Z';

/**
 * core 的 `id` 是 UUID 形状的模板字面量类型，`'r1'` 这种短串进不了 `createEntityRef`。
 * 每个 id 用单一字符重复，断言失败时一眼认得出是哪一行。
 */
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R9 = '99999999-9999-4999-8999-999999999999';
const N1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

@Entity({
  name: 'HttpIntegrationRecipe',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'status', type: PropertyType.string }
  ],
  sync: HTTP_QUERY_CACHE
})
class HttpIntegrationRecipe extends EntityBase {
  declare title: string;
  declare status: string;
}

/** AC#22 的对照组：同一个库里的 Full 实体，remote 槽位不是本包 */
@Entity({
  name: 'HttpIntegrationNote',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
})
class HttpIntegrationNote extends EntityBase {
  declare title: string;
}

interface Row {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

const row = (id: string, updatedAt = '2026-08-01T00:00:00.000Z', status = 'published'): Row => ({
  id,
  title: `recipe-${id}`,
  status,
  updatedAt
});

// ============================================
// 假的 REST 服务端
// ============================================

/** 一次出网请求的原始形态。`rawBody` 保持**未解析**：AC#2 要断言线上没有 SQL */
interface Captured {
  url: string;
  method: string;
  rawBody: string | undefined;
}

/**
 * 只认本包 handler 产出的那四条路由的最小假服务端。
 *
 * @remarks
 * 桩装在 `globalThis.fetch` 上而不是替换 handler：AC#2 / AC#3 要证的是**适配器发出去的
 * 东西**长什么样，在 handler 层拦截等于拿被测对象的输入冒充它的输出。
 *
 * 未命中的路由**抛错**而不是回空对象——回空会让「请求打错地方」表现为「远端没有数据」，
 * 正是本包整套 fail-fast 在防的那种静默。
 */
const createFakeServer = (rows: Row[] = []) => {
  const store = new Map(rows.map(item => [item.id, item]));
  const calls: Captured[] = [];

  const route = (captured: Captured): unknown => {
    const body = captured.rawBody === undefined ? undefined : (JSON.parse(captured.rawBody) as Record<string, never>);
    if (captured.url.endsWith('/metadata')) {
      return [...store.values()].map(({ id, updatedAt }): QueryCacheEntityMetadata => ({ id, updatedAt }));
    }
    if (captured.url.endsWith('/rows')) {
      return (body!.ids as string[]).filter(id => store.has(id)).map(id => store.get(id));
    }
    if (captured.method === 'DELETE') {
      for (const id of body!.ids as string[]) {
        store.delete(id);
      }
      return null;
    }
    // 写回执由服务端定型：id 之外的字段照收，时间戳一律服务端说了算
    const id =
      captured.method === 'PATCH' ? captured.url.slice(captured.url.lastIndexOf('/') + 1) : (body!.id as string);
    const saved = { ...store.get(id), ...body, id, updatedAt: SERVER_STAMP } as Row;
    store.set(id, saved);
    return saved;
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const captured: Captured = {
        url: String(url),
        method: String(init.method),
        rawBody: init.body === undefined ? undefined : String(init.body)
      };
      calls.push(captured);
      return Promise.resolve(new Response(JSON.stringify(route(captured)), { status: 200 }));
    })
  );

  return { calls, store };
};

/** 四条路由的协议映射，与假服务端严格配对 */
const handlers: HttpHandlers = {
  onFetchMetadata: {
    request: ctx => ({
      url: `${ctx.entityName}/metadata`,
      method: 'POST',
      body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit }
    }),
    parse: body => body as QueryCacheEntityMetadata[]
  },
  onFindByIds: {
    request: ctx => ({ url: `${ctx.entityName}/rows`, method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  },
  onCreate: { request: ctx => ({ url: ctx.entityName, method: 'POST', body: ctx.data }), parse: body => body },
  onUpdate: {
    request: ctx => ({ url: `${ctx.entityName}/${ctx.id}`, method: 'PATCH', body: ctx.data }),
    parse: body => body
  },
  onDelete: { request: ctx => ({ url: ctx.entityName, method: 'DELETE', body: { ids: ctx.ids } }) }
};

// ============================================
// 独立注册的本地适配器
// ============================================

/**
 * 站在真实 sqlite 位置的本地适配器替身，**独立注册**、与 HTTP 适配器互不相识。
 *
 * @remarks
 * `find` 不求值 `where`（`isEntityMatchWhere` 不在 core 的公开 API 上，本包不该为测试
 * 去够它）。这不削弱本文件要证的东西：where 下推是 core 自己的账，已由
 * `packages/rxdb` 的 QueryCache 套件覆盖；这里要证的是**行缓存落在了这一侧**。
 */
const createLocalAdapter = (initial: Row[] = []) => {
  const store = new Map(initial.map(item => [item.id, item]));
  let toEntity: (data: Row) => Row = data => data;

  const repository = {
    find: vi.fn(() => Promise.resolve([...store.values()].map(toEntity))),
    count: vi.fn(() => Promise.resolve(store.size)),
    create: vi.fn((entity: Row) => Promise.resolve(entity)),
    update: vi.fn((entity: Row) => Promise.resolve(entity)),
    remove: vi.fn((entity: Row) => Promise.resolve(entity))
  };

  const adapter = {
    name: 'sqlite',
    connect: vi.fn(() => Promise.resolve(adapter)),
    disconnect: vi.fn(() => Promise.resolve()),
    isTableExisted: vi.fn(() => Promise.resolve(false)),
    createTables: vi.fn(() => Promise.resolve()),
    mutations: vi.fn(() => Promise.resolve([])),
    getRepository: () => repository,
    getMetadataByIds: vi.fn((_entityName: string, ids: string[]) =>
      of(new Map(ids.filter(id => store.has(id)).map(id => [id, store.get(id)!.updatedAt])))
    ),
    upsertMany: vi.fn((_entityName: string, data: Row[]) => {
      for (const item of data) {
        store.set(item.id, item);
      }
      return of(undefined);
    }),
    deleteByIds: vi.fn((_entityName: string, ids: string[]) => {
      for (const id of ids) {
        store.delete(id);
      }
      return of(undefined);
    })
  };

  return { adapter, repository, store, attach: (materialize: (data: Row) => Row) => void (toEntity = materialize) };
};

/** Full 实体那一侧的远端替身：本文件只用它证明「HTTP 没有把这条路抢走」 */
const createFullRemoteAdapter = () => ({
  name: 'supabase',
  connect: vi.fn(function (this: unknown) {
    return Promise.resolve(this);
  }),
  disconnect: vi.fn(() => Promise.resolve()),
  isTableExisted: vi.fn(() => Promise.resolve(true)),
  mutations: vi.fn(() => Promise.resolve([])),
  getRepository: () => ({ find: vi.fn(() => Promise.resolve([])), count: vi.fn(() => Promise.resolve(0)) })
});

const databases = new Set<RxDB>();
let databaseSequence = 0;

const createDatabase = (localRows: Row[] = []) => {
  databaseSequence += 1;
  const local = createLocalAdapter(localRows);
  const supabase = createFullRemoteAdapter();
  const rxdb = new RxDB({
    dbName: `rxdb-adapter-http-integration-${databaseSequence}`,
    entities: [HttpIntegrationRecipe, HttpIntegrationNote],
    sync: DATABASE_SYNC
  });
  const http = new RxDBAdapterHttp(rxdb, { baseUrl: BASE_URL, handlers });
  rxdb.adapter('sqlite', () => local.adapter as unknown as IRxDBAdapter);
  rxdb.adapter('supabase', () => supabase as unknown as IRxDBAdapter);
  rxdb.adapter('http', () => http);
  rxdb.init();
  // 适配器口径的 `updatedAt` 是 ISO 串，实体口径是 `Date`，两端在这里对接
  local.attach(
    data =>
      rxdb.entityManager.createEntityRef(
        HttpIntegrationRecipe,
        data as unknown as EntityUpdateData<typeof HttpIntegrationRecipe>,
        { local: true }
      ) as unknown as Row
  );
  databases.add(rxdb);
  return { rxdb, local, supabase, http };
};

/** 新建的实体要先脏才会进批量集合 */
const dirty = <T extends { title: string }>(entity: T): T => {
  entity.title = `${entity.title}!`;
  return entity;
};

afterEach(async () => {
  const pending = [...databases];
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
  vi.unstubAllGlobals();
});

describe('AC#2 QueryCache 读路径：JSON RuleGroup 出网，行缓存落独立 sqlite', () => {
  it('适配器发出的请求体是 JSON 化的 RuleGroup，一个 SQL 片段都没有', async () => {
    const server = createFakeServer([row(R1), row(R2)]);
    const ctx = createDatabase();

    await firstValueFrom(ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).find({ where: PUBLISHED }));

    const metadataCall = server.calls.find(call => call.url.endsWith('/metadata'))!;
    expect(metadataCall.url).toBe(`${BASE_URL}/HttpIntegrationRecipe/metadata`);
    expect(JSON.parse(metadataCall.rawBody!)).toMatchObject({ where: PUBLISHED });
    // 断言主体是**线上的字节**：handler 把 where 换成 SQL 串也能过 toMatchObject
    expect(metadataCall.rawBody).not.toMatch(/\bselect\b|\bfrom\b|\bwhere\s+\w+\s*=/i);
  });

  it('远端拉回的行经 core 落进独立 sqlite，本包这一侧没有 upsertMany 可调', async () => {
    const server = createFakeServer([row(R1), row(R2)]);
    const ctx = createDatabase();

    await firstValueFrom(ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).find({ where: PUBLISHED }));

    expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1);
    expect(ctx.local.adapter.upsertMany.mock.calls[0][0]).toBe('HttpIntegrationRecipe');
    expect([...ctx.local.store.keys()].sort()).toEqual([R1, R2]);
    // 落地的是远端权威源的行，不是本包自己攒的
    expect(server.calls.some(call => call.url.endsWith('/rows'))).toBe(true);
    expect('upsertMany' in ctx.http).toBe(false);
  });

  it('本地已新鲜的行不回源：metadata 出网，findByIds 不出网', async () => {
    createFakeServer([row(R1)]);
    const ctx = createDatabase([row(R1)]);

    const server = createFakeServer([row(R1)]);
    await firstValueFrom(ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).find({ where: PUBLISHED }));

    expect(server.calls.some(call => call.url.endsWith('/metadata'))).toBe(true);
    expect(server.calls.some(call => call.url.endsWith('/rows'))).toBe(false);
  });
});

describe('AC#3 写路径：remote-then-local，本包不持有任何本地存储', () => {
  it('create 先出网、再由 core 把**远端回执**写进独立 sqlite', async () => {
    const server = createFakeServer();
    const ctx = createDatabase();
    const recipe = ctx.rxdb.entityManager.createEntityRef(HttpIntegrationRecipe, {
      id: R9,
      title: 'r9',
      status: 'published'
    });

    await ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).create(recipe);

    expect(server.calls.map(call => `${call.method} ${call.url}`)).toEqual([`POST ${BASE_URL}/HttpIntegrationRecipe`]);
    // 落本地的 updatedAt 是服务端盖的那个，不是入参回显
    expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1);
    expect(ctx.local.store.get(R9)?.updatedAt).toBe(SERVER_STAMP);
  });

  it('update 走 PATCH，回执同样先出网后落本地', async () => {
    const server = createFakeServer([row(R1)]);
    const ctx = createDatabase([row(R1)]);
    const recipe = ctx.rxdb.entityManager.createEntityRef(
      HttpIntegrationRecipe,
      { id: R1, title: `recipe-${R1}`, status: 'published' },
      { local: true }
    );

    await ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).update(recipe, { title: 'renamed' });

    expect(server.calls.map(call => `${call.method} ${call.url}`)).toEqual([
      `PATCH ${BASE_URL}/HttpIntegrationRecipe/${R1}`
    ]);
    expect(ctx.local.store.get(R1)?.updatedAt).toBe(SERVER_STAMP);
  });

  it('remove 先删远端再删本地缓存行，顺序不可颠倒', async () => {
    const server = createFakeServer([row(R1)]);
    const ctx = createDatabase([row(R1)]);
    const recipe = ctx.rxdb.entityManager.createEntityRef(
      HttpIntegrationRecipe,
      { id: R1, title: `recipe-${R1}`, status: 'published' },
      { local: true }
    );

    await ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).remove(recipe);

    expect(server.calls.map(call => call.method)).toEqual(['DELETE']);
    expect(server.store.has(R1)).toBe(false);
    expect(ctx.local.adapter.deleteByIds).toHaveBeenCalledWith('HttpIntegrationRecipe', [R1]);
    expect(ctx.local.store.has(R1)).toBe(false);
  });

  it('三个写入口全程不碰 OPFS / IndexedDB：本地存储只有独立注册的那一个', async () => {
    const open = vi.fn();
    const getDirectory = vi.fn();
    vi.stubGlobal('indexedDB', { open, deleteDatabase: vi.fn() });
    vi.stubGlobal('navigator', { storage: { getDirectory } });
    createFakeServer([row(R1)]);
    const ctx = createDatabase([row(R1)]);
    const repository = ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe);
    const recipe = ctx.rxdb.entityManager.createEntityRef(
      HttpIntegrationRecipe,
      { id: R1, title: `recipe-${R1}`, status: 'published' },
      { local: true }
    );

    await ctx.rxdb.connect('http');
    await repository.update(recipe, { title: 'renamed' });
    await repository.remove(recipe);

    expect(open).not.toHaveBeenCalled();
    expect(getDirectory).not.toHaveBeenCalled();
  });
});

describe('AC#17 / AC#20 inject 契约：插件绑到独立注册的 sqlite', () => {
  /** 记录安装顺序与安装时看到的 local 实例的探针 */
  const probe = (
    name: Uncapitalize<string>,
    inject: IRxDBPlugin['inject'],
    install: () => void
  ): (() => IRxDBPlugin) => {
    const plugin: IRxDBPlugin = { name, inject, lifecycle: 'scoped', install };
    return () => plugin;
  };

  it('adapter:local 解析到独立注册的 sqlite 实例，不是 HTTP 适配器', async () => {
    createFakeServer();
    const ctx = createDatabase();
    const seen: IRxDBAdapter[] = [];
    ctx.rxdb.use(probe('localProbe', ['adapter:local'], () => void seen.push(ctx.rxdb.localAdapterSync)));

    await ctx.rxdb.connect('sqlite');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(ctx.local.adapter as unknown as IRxDBAdapter);
    expect(seen[0]).not.toBe(ctx.http);
  });

  it('两个槽位各归各位：只连 sqlite 时 adapter:remote 的插件不装，连上 http 才装', async () => {
    createFakeServer();
    const ctx = createDatabase();
    const installs: string[] = [];
    ctx.rxdb.use(probe('localProbe', ['adapter:local'], () => void installs.push('local')));
    ctx.rxdb.use(probe('remoteProbe', ['adapter:remote'], () => void installs.push('remote')));

    await ctx.rxdb.connect('sqlite');
    expect(installs).toEqual(['local']);

    await ctx.rxdb.connect('http');
    expect(installs).toEqual(['local', 'remote']);
  });

  it('插件不另开一份库：连 sqlite 时 HTTP 适配器一次都没被连上，也没出网', async () => {
    const server = createFakeServer();
    const ctx = createDatabase();
    const connectSpy = vi.spyOn(ctx.http, 'connect');
    ctx.rxdb.use(probe('localProbe', ['adapter:local'], () => void ctx.rxdb.localAdapterSync));

    await ctx.rxdb.connect('sqlite');

    expect(ctx.local.adapter.connect).toHaveBeenCalledTimes(1);
    expect(connectSpy).not.toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
  });
});

describe('AC#18 混批闸门：本包不提供任何绕过入口', () => {
  const buildMixedBatch = (ctx: ReturnType<typeof createDatabase>) => [
    dirty(ctx.rxdb.entityManager.createEntityRef(HttpIntegrationRecipe, { id: R1, title: 'r1', status: 'published' })),
    dirty(ctx.rxdb.entityManager.createEntityRef(HttpIntegrationNote, { id: N1, title: 'n1' }))
  ];

  it('HTTP-QueryCache 实体与 Full 实体同批时拒绝，错误码是 mixed_versioned_cache_transaction', async () => {
    createFakeServer();
    const ctx = createDatabase();

    const error = await ctx.rxdb.entityManager.saveMany(buildMixedBatch(ctx)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RxDBMixedVersionedCacheTransactionError);
    expect((error as RxDBMixedVersionedCacheTransactionError).code).toBe('mixed_versioned_cache_transaction');
    expect((error as RxDBMixedVersionedCacheTransactionError).cacheEntities).toEqual(['HttpIntegrationRecipe']);
    expect((error as RxDBMixedVersionedCacheTransactionError).versionedEntities).toEqual(['HttpIntegrationNote']);
  });

  it('闸门拦下时一个字节都没出网，也没写本地缓存', async () => {
    const server = createFakeServer();
    const ctx = createDatabase();

    await ctx.rxdb.entityManager.saveMany(buildMixedBatch(ctx)).catch(() => undefined);

    expect(server.calls).toHaveLength(0);
    expect(ctx.local.adapter.upsertMany).not.toHaveBeenCalled();
    expect(ctx.local.adapter.mutations).not.toHaveBeenCalled();
  });

  it('本包不替 core 写第二条批量路径：adapter.mutations 抛 unsupported', () => {
    createFakeServer();
    const ctx = createDatabase();

    expect(() => ctx.http.mutations()).toThrow(HttpUnsupportedOperationError);
  });
});

describe('AC#22 对照组：同库里的 Full 实体路径原样不动', () => {
  it('Full 实体的批量写照旧走本地适配器的 mutations，HTTP 一个请求都没发', async () => {
    const server = createFakeServer();
    const ctx = createDatabase();
    const note = dirty(ctx.rxdb.entityManager.createEntityRef(HttpIntegrationNote, { id: N1, title: 'n1' }));

    await ctx.rxdb.entityManager.saveMany([note]);

    expect(ctx.local.adapter.mutations).toHaveBeenCalledTimes(1);
    expect(server.calls).toHaveLength(0);
  });

  it('QueryCache 实体的批量写不走 mutations，两条路径在同一个库里各走各的', async () => {
    const server = createFakeServer();
    const ctx = createDatabase();
    const recipe = dirty(
      ctx.rxdb.entityManager.createEntityRef(HttpIntegrationRecipe, { id: R1, title: 'r1', status: 'published' })
    );

    await ctx.rxdb.entityManager.saveMany([recipe]);

    expect(ctx.local.adapter.mutations).not.toHaveBeenCalled();
    expect(server.calls.map(call => call.method)).toEqual(['POST']);
    expect(ctx.local.adapter.upsertMany).toHaveBeenCalledTimes(1);
  });

  it('查询本包实体不影响 Full 实体的读：两者的适配器互不越界', async () => {
    createFakeServer([row(R1)]);
    const ctx = createDatabase();

    await firstValueFrom(ctx.rxdb.entityManager.getRepository(HttpIntegrationRecipe).find({ where: ALL }));

    expect(ctx.supabase.mutations).not.toHaveBeenCalled();
    expect(() => ctx.http.getRepository()).toThrow(HttpUnsupportedOperationError);
  });
});
