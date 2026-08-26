/**
 * @packageDocumentation
 * US-213：HTTP 适配器的 **wire 级**端到端集成测试。
 *
 * @remarks
 * 与 `src/__tests__/` 下那批用例的区别只有一条，但它决定了能测出什么：
 * **这里不打桩**。`src/__tests__/` 全用 `vi.stubGlobal('fetch')`，能证明"代码按我想的走"，
 * 证不了"代码按协议走"——请求头长什么样、body 的键有没有多一个、socket 真断了会抛什么、
 * abort 到底停没停，全在桩的盲区里。
 *
 * 本文件让适配器经**真实全局 `fetch`（undici）**打到 {@link startReferenceServer} 起的
 * `node:http` 服务器上，端口由内核分配。断言的是实收请求与实发响应，不是调用记录。
 *
 * 因此本目录**零 `vi.stubGlobal` / 零 `MockAgent` / 零 `mockFetch`**（AC#17 的门禁项）。
 */

import {
  Entity,
  EntityBase,
  isNetworkError,
  NetworkOfflineError,
  PropertyType,
  RxDB,
  SyncType,
  type IRxDBAdapter,
  type RuleGroup
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpDisconnectedError,
  HttpPaginationError,
  HttpResponseError,
  HttpUnsupportedOperationError
} from '../src/errors.js';
import type { HttpAdapterOptions } from '../src/http.interface.js';
import { createRestHandlers } from '../src/rest.js';
import { RxDBAdapterHttp } from '../src/RxDBAdapterHttp.js';
import { createLocalAdapter, type LocalRow } from './local-adapter.fixture.js';
import { INTRUDER_ID, SERVER_VERSION, startReferenceServer, type ReferenceServer, type Row } from './reference-server.js';

/** 实体名，也是 handler 拿到的 `ctx.entityName` */
const ENTITY = 'WireRecipe';

/** 实体名映射后的资源路径片段；参考后端按它做存储键 */
const RESOURCE = 'recipes';

/** 全量匹配的空 RuleGroup */
const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

/**
 * 模块加载时捕获的原生 `fetch`。
 *
 * @remarks
 * AC#1 拿它做同一性断言：只要本目录里有任何一处 `vi.stubGlobal('fetch', …)`，
 * 这个引用就不再等于运行期的 `globalThis.fetch`，整组用例立刻变红。
 */
const NATIVE_FETCH = globalThis.fetch;

@Entity({
  name: ENTITY,
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'status', type: PropertyType.string },
    { name: 'rating', type: PropertyType.number }
  ]
})
class WireRecipe extends EntityBase {
  declare title: string;
  declare status: string;
  declare rating: number;
}

@Entity({ name: 'WireGhost', properties: [{ name: 'label', type: PropertyType.string }] })
class WireGhost extends EntityBase {
  declare label: string;
}

/** AC#8 专用实体名 */
const CHUNK_ENTITY = 'WireChunkRecipe';

/** AC#8 走 core 全栈，QueryCache 必须挂在实体上（库级会连系统树实体一起罩进去） */
@Entity({
  name: CHUNK_ENTITY,
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
})
class WireChunkRecipe extends EntityBase {
  declare title: string;
}

/** 固定的一组样本行，AC#3 的期望值按它手算 */
const SAMPLE: Row[] = [
  { id: 'r1', title: 'Tomato Soup', status: 'published', rating: 5, updatedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'r2', title: 'Tomato Pasta', status: 'draft', rating: 3, updatedAt: '2026-08-02T00:00:00.000Z' },
  { id: 'r3', title: 'Onion Rings', status: 'published', rating: 4, updatedAt: '2026-08-03T00:00:00.000Z' },
  { id: 'r4', title: 'tomato bread', status: 'archived', rating: 1, updatedAt: '2026-08-04T00:00:00.000Z' },
  { id: 'r5', title: 'Egg Fried Rice', status: 'published', rating: null, updatedAt: '2026-08-05T00:00:00.000Z' }
];

/** 生成 `count` 条可预测的行，id 形如 `p01`；用于翻页用例 */
const manyRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(2, '0')}`,
    title: `page row ${index + 1}`,
    status: 'published',
    updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString()
  }));

const rule = (field: string, operator: string, value?: unknown): RuleGroup<unknown> =>
  ({ combinator: 'and', rules: [{ field, operator, value }] }) as unknown as RuleGroup<unknown>;

/**
 * 组一台适配器并连上。
 *
 * @remarks
 * `version` / `isTableExisted` 在 `REST_OPERATIONS` 里**没有默认路径**，不显式给
 * `templates` 就整个不产出 handler。这不是样板，是这两条 AC 的前提。
 */
const connectAdapter = async (server: ReferenceServer, options: Partial<HttpAdapterOptions> = {}): Promise<RxDBAdapterHttp> => {
  const rxdb = new RxDB({ dbName: 'rxdb-http-wire', entities: [], sync: { type: SyncType.None, local: { adapter: 'sqlite' } } });
  const adapter = new RxDBAdapterHttp(rxdb, {
    baseUrl: server.baseUrl,
    handlers: createRestHandlers({
      resources: { [ENTITY]: RESOURCE, WireGhost: 'ghosts' },
      templates: { version: { path: 'meta/version' }, isTableExisted: { path: ':entity' } }
    }),
    ...options
  });
  await adapter.connect();
  return adapter;
};

const idsOf = (rows: { id: string }[]): string[] => rows.map(row => row.id);

/** 取第 n 次实收请求的 JSON body */
const bodyOf = (server: ReferenceServer, index: number): Record<string, unknown> =>
  JSON.parse(server.received[index].rawBody ?? 'null') as Record<string, unknown>;

const metadataRequests = (server: ReferenceServer): typeof server.received =>
  server.received.filter(request => request.path.endsWith('/metadata'));

/**
 * 等到第 `count` 个请求真的落到后端为止。
 *
 * @remarks
 * 不是 sleep：循环让出事件循环直到条件成立，条件成立即返回。真等不到时靠 vitest 的
 * `testTimeout` 收场，报出来的也是"请求根本没发出"这个真问题。
 */
const waitForRequest = async (server: ReferenceServer, count = 1): Promise<void> => {
  while (server.received.length < count) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
};

/** 断言一次 rejects，并把错误取出来继续查字段 */
const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  const outcome = await promise.then(
    () => undefined,
    (error: unknown) => error
  );
  expect(outcome).toBeInstanceOf(Error);
  return outcome;
};

describe('AC#1 真实 fetch 与真实端口', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('全局 fetch 未被替换，请求真的落到了参考后端', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // 桩测里这两条恒真也恒假——只有真发过请求，received 才会有东西
    expect(globalThis.fetch).toBe(NATIVE_FETCH);
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
    expect(server.received).toHaveLength(1);
    expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('stop() 之后不留活连接', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));
    expect(server.sockets.size).toBeGreaterThan(0);

    await adapter.disconnect();
    await server.stop();

    // 只查 sockets：process.getActiveResourcesInfo() 会把 vitest worker 自己的句柄
    // 一起算进来，那个数字与被测代码无关
    expect(server.sockets.size).toBe(0);
  });
});

describe('AC#2 请求形状：JSON RuleGroup，不是 SQL', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('POST recipes/metadata，content-type 为 application/json', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    const request = server.received[0];
    expect(request.method).toBe('POST');
    expect(request.path).toBe(`/${RESOURCE}/metadata`);
    expect(request.headers['content-type']).toBe('application/json');
  });

  it('body 是 { where, offset, limit }，首页不含 pageToken 键', async () => {
    const adapter = await connectAdapter(server, { pageSize: 50 });
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    const body = bodyOf(server, 0);
    expect(body).toEqual({ where: ALL, offset: 0, limit: 50 });
    // `'pageToken' in body` 而不是 `body.pageToken === undefined`：后者对
    // `{ pageToken: undefined }` 也成立，而那个键真的发出去时后端会拿它当合法 token 解析
    expect('pageToken' in body).toBe(false);
  });

  it('where 是 JSON RuleGroup，线上没有任何 SQL 片段', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.fetchMetadata(ENTITY, rule('status', '=', 'published')));

    const body = bodyOf(server, 0);
    expect(body['where']).toEqual({ combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'published' }] });
    expect(server.received[0].rawBody).not.toMatch(/\bselect\b|\bfrom\b|--/i);
  });
});

describe('AC#3 RuleGroup 在后端求值', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it.each([
    ['=', rule('status', '=', 'published'), ['r1', 'r3', 'r5']],
    ['in', rule('status', 'in', ['draft', 'archived']), ['r2', 'r4']],
    ['between', rule('rating', 'between', [3, 5]), ['r1', 'r2', 'r3']],
    // 参考后端的 contains 大小写敏感（见 reference-server.ts 的说明），
    // 所以 'tomato bread' 不在结果里——期望值与后端立场同源
    ['contains', rule('title', 'contains', 'Tomato'), ['r1', 'r2']],
    ['null', rule('rating', 'null'), ['r5']]
  ])('%s 的结果与本地手算逐 id 相等', async (_operator, where, expected) => {
    const adapter = await connectAdapter(server);
    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, where));
    expect(idsOf(rows)).toEqual(expected);
  });

  it('and / or 嵌套组合同样在后端求值', async () => {
    const adapter = await connectAdapter(server);
    const where = {
      combinator: 'or',
      rules: [
        { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'published' }, { field: 'rating', operator: 'between', value: [4, 5] }] },
        { field: 'status', operator: '=', value: 'archived' }
      ]
    } as unknown as RuleGroup<unknown>;

    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, where));
    expect(idsOf(rows)).toEqual(['r1', 'r3', 'r4']);
  });

  it('后端不认识的操作符返回 501，客户端抛 HttpResponseError 而不是静默全匹配', async () => {
    const adapter = await connectAdapter(server);
    // 漏实现一个操作符若被静默当成 true，症状是"这个查询多回了几行"，
    // 而多回的行会被 QueryCache 原样写进本地缓存——比报错难查得多
    await expect(firstValueFrom(adapter.fetchMetadata(ENTITY, rule('title', 'startsWith', 'Tom')))).rejects.toThrow(
      HttpResponseError
    );
  });
});

describe('AC#4 offset 形态翻页', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer({ paging: 'offset' });
  });

  afterEach(() => server.stop());

  it('翻满页直到短页，结果是完整有序全集', async () => {
    server.seed(RESOURCE, manyRows(7));
    const adapter = await connectAdapter(server, { pageSize: 3 });
    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    expect(idsOf(rows)).toEqual(['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07']);
    expect(metadataRequests(server)).toHaveLength(3);
  });

  it('每一页都把 offset 编进 body，且逐页推进', async () => {
    server.seed(RESOURCE, manyRows(7));
    const adapter = await connectAdapter(server, { pageSize: 3 });
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // offset 没编进请求时远端每页都回第一页，客户端一直翻到 maxPages 才报错，
    // 而那个错误指向页数上限，不指向漏掉的参数
    expect(metadataRequests(server).map(request => JSON.parse(request.rawBody ?? 'null')['offset'])).toEqual([0, 3, 6]);
  });

  it('总数整除 pageSize 时会多发一次空页请求才收工', async () => {
    server.seed(RESOURCE, manyRows(6));
    const adapter = await connectAdapter(server, { pageSize: 3 });
    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // 短页是唯一的终止判据，满页之后必须再问一次——少问这一次就是静默截断
    expect(rows).toHaveLength(6);
    expect(metadataRequests(server)).toHaveLength(3);
  });
});

describe('AC#5 offset 形态的协议边界：后端提前短页 = 静默少取', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer({ paging: 'offset' });
    server.seed(RESOURCE, manyRows(7));
  });

  afterEach(() => server.stop());

  it('后端在第 1 页就返回短页时，客户端把它当末页并少取 5 条且不报错', async () => {
    server.faults.truncateAt = 1;
    const adapter = await connectAdapter(server, { pageSize: 3 });
    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // 这**不是**客户端 bug：offset 形态下"少于 limit 即末页"是唯一的终止判据，
    // 客户端没有任何信息能把"后端限流提前返回"与"真的到底了"分开。
    // 因此协议把这条写成了服务端义务——做不到的后端 MUST 改用 token 形态。
    // 这个用例存在的意义就是把这条边界钉死：它现在的行为是设计，不是缺陷
    expect(idsOf(rows)).toEqual(['p01', 'p02']);
    expect(metadataRequests(server)).toHaveLength(1);
    // 后端确实还有 5 条没给出去
    expect(server.read(RESOURCE, 'p07')).toBeDefined();
  });
});

describe('AC#6 token 形态基于同一数据快照翻页', () => {
  let server: ReferenceServer;

  /** 打乱的插入顺序：后端的自然顺序既不是 id 序也不是时间序，快照断言才有意义 */
  const SHUFFLED = ['p03', 'p01', 'p05', 'p02', 'p04'];

  beforeEach(async () => {
    server = await startReferenceServer({ paging: 'token' });
    const byId = new Map(manyRows(5).map(row => [row.id, row]));
    server.seed(
      RESOURCE,
      SHUFFLED.map(id => byId.get(id)!)
    );
  });

  afterEach(() => server.stop());

  it('翻页途中后端改了数据，结果仍是首页那一刻的快照', async () => {
    server.faults.mutateAfterPage = 1;
    const adapter = await connectAdapter(server, { pageSize: 2 });
    const rows = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // 先证明后端真的动过——否则这个用例什么都没测到
    expect(server.read(RESOURCE, INTRUDER_ID)).toBeDefined();
    // 再证明那次改动没有渗进本次翻页
    expect(idsOf(rows)).toEqual(SHUFFLED);
    expect(idsOf(rows)).not.toContain(INTRUDER_ID);
  });

  it('nextPageToken 逐页透传回后端，末页无 token 即终止', async () => {
    const adapter = await connectAdapter(server, { pageSize: 2 });
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    const tokens = metadataRequests(server).map(request => JSON.parse(request.rawBody ?? 'null')['pageToken']);
    expect(tokens[0]).toBeUndefined();
    expect(tokens.slice(1)).toEqual(['snap1:2', 'snap1:4']);
  });
});

describe('AC#7 翻页退化 fail-fast', () => {
  let server: ReferenceServer;

  afterEach(() => server.stop());

  it('中途换返回形态 → shape_switch', async () => {
    server = await startReferenceServer({ paging: 'offset' });
    server.seed(RESOURCE, manyRows(7));
    server.faults.shapeSwitchAt = 2;
    const adapter = await connectAdapter(server, { pageSize: 3 });

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(HttpPaginationError);
    expect((error as HttpPaginationError).reason).toBe('shape_switch');
  });

  it('nextPageToken 不推进 → page_token_not_advancing', async () => {
    server = await startReferenceServer({ paging: 'token' });
    server.seed(RESOURCE, manyRows(7));
    server.faults.tokenStuck = true;
    const adapter = await connectAdapter(server, { pageSize: 3 });

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(HttpPaginationError);
    expect((error as HttpPaginationError).reason).toBe('page_token_not_advancing');
  });

  it('连续空页触顶 → empty_page_limit', async () => {
    server = await startReferenceServer({ paging: 'token' });
    server.seed(RESOURCE, manyRows(7));
    // token 照常推进、rows 恒空：光靠"token 变了没"这条判据永远发现不了
    server.faults.emptyPages = true;
    const adapter = await connectAdapter(server, { pageSize: 3, maxEmptyPages: 1 });

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(HttpPaginationError);
    expect((error as HttpPaginationError).reason).toBe('empty_page_limit');
  });

  it('总页数触顶 → max_pages，且是抛错不是截断', async () => {
    server = await startReferenceServer({ paging: 'offset' });
    server.seed(RESOURCE, manyRows(10));
    const adapter = await connectAdapter(server, { pageSize: 2, maxPages: 3 });

    // 触顶时静默返回已取的 6 条才是最危险的形态：调用方拿到一个看起来正常的结果集，
    // QueryCache 随即把没取到的 4 条判成"远端已删除"
    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(HttpPaginationError);
    expect((error as HttpPaginationError).reason).toBe('max_pages');
    expect(metadataRequests(server)).toHaveLength(3);
  });
});

describe('AC#9 写路径发出真请求并采用服务端回执', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('create 走 POST recipes，id / updatedAt 取服务端返回的形状', async () => {
    const adapter = await connectAdapter(server);
    // 回执的形状由服务端决定，入参的形状说明不了它——所以这里刻意不让 create 的
    // 泛型从入参推断出一个"回执必然长这样"的类型
    const created = (await firstValueFrom(
      adapter.create!(ENTITY, { id: 'client-guess', title: 'New Dish', status: 'draft' })
    )) as unknown as Row;

    expect(server.received[0].method).toBe('POST');
    expect(server.received[0].path).toBe(`/${RESOURCE}`);
    // 回执不是回显：参考后端自己发 id 与 updatedAt，客户端必须采用它们
    expect(created).toMatchObject({ id: 'srv-1', title: 'New Dish' });
    expect(created.id).not.toBe('client-guess');
    expect(created.updatedAt).toMatch(/Z$/);
    expect(server.read(RESOURCE, 'srv-1')).toBeDefined();
  });

  it('update 走 PATCH recipes/:id，updatedAt 由服务端刷新', async () => {
    const adapter = await connectAdapter(server);
    const before = server.read(RESOURCE, 'r1')!;
    const updated = (await firstValueFrom(adapter.update!(ENTITY, 'r1', { title: 'Renamed' }))) as unknown as Row;

    expect(server.received[0].method).toBe('PATCH');
    expect(server.received[0].path).toBe(`/${RESOURCE}/r1`);
    expect(updated).toMatchObject({ id: 'r1', title: 'Renamed' });
    expect(updated.updatedAt).not.toBe(before.updatedAt);
  });

  it('delete 走 POST recipes/delete，id 放在 body 而不是 URL', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.delete!(ENTITY, ['r1', 'r2']));

    // DELETE 的请求体会被代理和网关丢掉，那会让"删这 2 行"以"删整个集合"的面目到达后端
    expect(server.received[0].method).toBe('POST');
    expect(server.received[0].path).toBe(`/${RESOURCE}/delete`);
    expect(bodyOf(server, 0)).toEqual({ ids: ['r1', 'r2'] });
    expect(server.read(RESOURCE, 'r1')).toBeUndefined();
    expect(server.read(RESOURCE, 'r3')).toBeDefined();
  });
});

describe('AC#10 version() 只报后端版本', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('配了 onVersion 时返回后端自报的版本号', async () => {
    const adapter = await connectAdapter(server);
    await expect(adapter.version()).resolves.toBe(SERVER_VERSION);
    expect(server.received[0]).toMatchObject({ method: 'GET', path: '/meta/version' });
  });

  it('未配 onVersion 时抛 unsupported，不回落到本包版本号', async () => {
    const rxdb = new RxDB({ dbName: 'rxdb-http-wire', entities: [], sync: { type: SyncType.None, local: { adapter: 'sqlite' } } });
    const adapter = new RxDBAdapterHttp(rxdb, { baseUrl: server.baseUrl, handlers: createRestHandlers() });
    await adapter.connect();

    await expect(adapter.version()).rejects.toThrow(HttpUnsupportedOperationError);
    // 回落到包版本会让调用方以为拿到了后端版本——一个说得通但完全错误的答案
    expect(server.received).toHaveLength(0);
  });
});

describe('AC#11 isTableExisted 按真实状态码作答', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('2xx → true，且真的发了 HEAD', async () => {
    const adapter = await connectAdapter(server);
    await expect(adapter.isTableExisted(WireRecipe)).resolves.toBe(true);
    expect(server.received[0]).toMatchObject({ method: 'HEAD', path: `/${RESOURCE}` });
  });

  it('404 → false', async () => {
    const adapter = await connectAdapter(server);
    await expect(adapter.isTableExisted(WireGhost)).resolves.toBe(false);
  });

  it('500 → 抛错，不把"不知道"说成"不存在"', async () => {
    const adapter = await connectAdapter(server);
    server.faults.forceStatus = 500;
    await expect(adapter.isTableExisted(WireRecipe)).rejects.toThrow(HttpResponseError);
  });
});

describe('AC#12 auth hook 注入的 header 真的上了线', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('auth header 与 content-type 共存', async () => {
    const adapter = await connectAdapter(server, {
      auth: () => ({ authorization: 'Bearer wire-token', 'X-Tenant': 'acme' })
    });
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    const headers = server.received[0].headers;
    expect(headers['authorization']).toBe('Bearer wire-token');
    // header 名大小写不敏感，但实收侧一律小写——写成 'X-Tenant' 的断言会假绿
    expect(headers['x-tenant']).toBe('acme');
    expect(headers['content-type']).toBe('application/json');
  });

  it('auth hook 抛错时请求根本不发出', async () => {
    const adapter = await connectAdapter(server, {
      auth: () => {
        throw new Error('token refresh failed');
      }
    });

    await expect(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL))).rejects.toThrow(/token refresh failed/);
    expect(server.received).toHaveLength(0);
  });
});

describe('AC#13 HTTP 错误状态码 → HttpResponseError', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it.each([401, 409, 500])('%i 带数字 status，且不算网络错误', async status => {
    server.faults.forceStatus = status;
    const adapter = await connectAdapter(server);

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(HttpResponseError);
    expect((error as HttpResponseError).status).toBe(status);
    expect(typeof (error as HttpResponseError).status).toBe('number');
    // 判成网络错误会让 core 的离线分支接手，把一个"凭证过期"当成"网断了"重试到天荒地老
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('AC#14 传输失败 → NetworkOfflineError', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('后端收下请求后直接销毁 socket', async () => {
    server.faults.destroySocket = true;
    const adapter = await connectAdapter(server);

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    // 裸 TypeError（undici 的 `fetch failed`）漏到调用方，core 就分不出这是不是离线
    expect(error).toBeInstanceOf(NetworkOfflineError);
    expect(isNetworkError(error)).toBe(true);
  });

  it('连到一个没人监听的端口', async () => {
    // 不用"刚关掉的端口"：内核会复用端口号，偶尔连上别的进程，症状是随机 flaky
    const rxdb = new RxDB({ dbName: 'rxdb-http-wire', entities: [], sync: { type: SyncType.None, local: { adapter: 'sqlite' } } });
    const adapter = new RxDBAdapterHttp(rxdb, { baseUrl: 'http://127.0.0.1:1', handlers: createRestHandlers() });
    await adapter.connect();

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(NetworkOfflineError);
    expect(isNetworkError(error)).toBe(true);
  });
});

describe('AC#15 超时与主动断开必须可区分', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
    // 后端收下请求就不吭声，客户端侧的两条中止路径由此可控触发，无需 sleep
    server.faults.hang = true;
  });

  afterEach(() => server.stop());

  it('请求超时 → NetworkOfflineError，算网络错误', async () => {
    const adapter = await connectAdapter(server, { requestTimeoutMs: 50 });

    const error = await rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    expect(error).toBeInstanceOf(NetworkOfflineError);
    expect(isNetworkError(error)).toBe(true);
  });

  it('disconnect() 中断 → HttpDisconnectedError，不算网络错误', async () => {
    const adapter = await connectAdapter(server, { requestTimeoutMs: 5000 });
    const pending = rejection(firstValueFrom(adapter.fetchMetadata(ENTITY, ALL)));
    await waitForRequest(server);
    await adapter.disconnect();

    const error = await pending;
    // 两者都是"请求没拿到响应"，但一个该重试、一个是调用方自己叫停的。
    // 混成一类会让 disconnect() 之后的第一次重连触发一轮离线补偿
    expect(error).toBeInstanceOf(HttpDisconnectedError);
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('AC#16 条件请求：ETag / If-None-Match / 304', () => {
  let server: ReferenceServer;

  beforeEach(async () => {
    server = await startReferenceServer();
    server.seed(RESOURCE, SAMPLE);
  });

  afterEach(() => server.stop());

  it('第二次同样的查询命中 304，并还原上一份 200 的结果', async () => {
    const adapter = await connectAdapter(server, { conditionalRequests: true });
    const first = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));
    const second = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    expect(server.received[0].headers['if-none-match']).toBeUndefined();
    expect(server.received[1].headers['if-none-match']).toMatch(/^"[0-9a-f]{40}"$/);
    // 304 是"你手上那份还有效"，绝不是"零行"——读成零行会让整表判成孤儿
    expect(second).toEqual(first);
    expect(second).toHaveLength(SAMPLE.length);
  });

  it('后端内容变了就换 ETag，客户端拿到新数据', async () => {
    const adapter = await connectAdapter(server, { conditionalRequests: true });
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    server.mutate(RESOURCE, { id: 'r6', title: 'Late Arrival', status: 'published', updatedAt: '2026-08-09T00:00:00.000Z' });
    const after = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    expect(idsOf(after)).toContain('r6');
    expect(after).toHaveLength(SAMPLE.length + 1);
  });

  it('未开启条件请求时不发 If-None-Match', async () => {
    const adapter = await connectAdapter(server);
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));
    await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    // 默认关闭是刻意的：只有远端真的认 If-None-Match 才有收益，而这一点适配器探测不到
    expect(server.received.every(request => request.headers['if-none-match'] === undefined)).toBe(true);
  });

  it('后端不发 ETag 时整条退化为普通请求，结果依旧正确', async () => {
    server.faults.dropEtag = true;
    const adapter = await connectAdapter(server, { conditionalRequests: true });
    const first = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));
    const second = await firstValueFrom(adapter.fetchMetadata(ENTITY, ALL));

    expect(second).toEqual(first);
    expect(server.received[1].headers['if-none-match']).toBeUndefined();
  });
});

describe('AC#8 走 core 全栈：findByIds 按 idChunkSize 分块发真请求', () => {
  let server: ReferenceServer;
  let databaseSequence = 0;
  const databases = new Set<RxDB>();

  /** core 的 id 是 UUID 形状的模板字面量类型，短串进不了 `createEntityRef` */
  const uuidAt = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

  const chunkRows = (count: number): Row[] =>
    Array.from({ length: count }, (_, index) => ({
      id: uuidAt(index),
      title: `chunk row ${index}`,
      updatedAt: new Date(Date.UTC(2026, 1, 1, 0, 0, index)).toISOString()
    }));

  /**
   * 组一个真的 `RxDB`：本地槽位是内存替身，远端槽位是本包，网线那头是参考后端。
   *
   * @remarks
   * QueryCache 挂在实体上而不是库上——库级 QueryCache 会把 core 的系统树实体
   * `RxDBBranch` 一起罩进去，`init()` 当场拒绝。
   */
  const createDatabase = (): { rxdb: RxDB; local: ReturnType<typeof createLocalAdapter> } => {
    databaseSequence += 1;
    const local = createLocalAdapter();
    const rxdb = new RxDB({
      dbName: `rxdb-http-wire-fullstack-${databaseSequence}`,
      entities: [WireChunkRecipe],
      sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
    });
    const http = new RxDBAdapterHttp(rxdb, {
      baseUrl: server.baseUrl,
      handlers: createRestHandlers({ resources: { [CHUNK_ENTITY]: RESOURCE } }),
      idChunkSize: 100
    });
    rxdb.adapter('sqlite', () => local.adapter as unknown as IRxDBAdapter);
    rxdb.adapter('http', () => http);
    rxdb.init();
    local.attach(
      data => rxdb.entityManager.createEntityRef(WireChunkRecipe, data as never, { local: true }) as unknown as LocalRow
    );
    databases.add(rxdb);
    return { rxdb, local };
  };

  const runQuery = (rxdb: RxDB): Promise<unknown> =>
    firstValueFrom(
      rxdb.entityManager.getRepository(WireChunkRecipe).find({ where: { combinator: 'and', rules: [] } })
    );

  const byIdsRequests = (): typeof server.received => server.received.filter(request => request.path.endsWith('/by-ids'));

  beforeEach(async () => {
    server = await startReferenceServer();
  });

  afterEach(async () => {
    const pending = [...databases];
    databases.clear();
    await Promise.all(pending.map(database => database.disconnectAll()));
    await server.stop();
  });

  it('250 个 id / idChunkSize 100 → 3 个真请求，块与块之间不重不漏', async () => {
    server.seed(RESOURCE, chunkRows(250));
    const { rxdb, local } = createDatabase();
    await runQuery(rxdb);

    const chunks = byIdsRequests().map(request => JSON.parse(request.rawBody ?? 'null')['ids'] as string[]);
    // 3 个**独立的 HTTP 请求**，不是一个请求里塞了 250 个 id——后者会撞上服务端与
    // 网关的 URL / body 长度限制，而那类失败通常表现为 4xx 而不是"id 太多"
    expect(chunks.map(ids => ids.length)).toEqual([100, 100, 50]);
    expect(new Set(chunks.flat()).size).toBe(250);
    expect(local.store.size).toBe(250);
  });

  it('某块返回的行数少于请求 id 数是合法结果，不重试也不补空对象', async () => {
    server.seed(RESOURCE, chunkRows(120));
    // 远端在 fetchMetadata 与 findByIds 之间删了两行：真实竞态，不是后端违约
    server.faults.vanishAfterMetadata = [uuidAt(0), uuidAt(1)];
    const { rxdb, local } = createDatabase();
    await runQuery(rxdb);

    expect(byIdsRequests()).toHaveLength(2);
    // 补空对象会在本地留下两条远端从不存在的行；重试则会把一次正常的删除读成故障
    expect(local.store.size).toBe(118);
    expect(local.store.has(uuidAt(0))).toBe(false);
  });
});
