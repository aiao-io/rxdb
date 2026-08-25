import {
  Entity,
  EntityBase,
  getEntityMetadata,
  isNetworkError,
  NetworkOfflineError,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityType,
  type RuleGroup,
  type SyncOptions
} from '@aiao/rxdb';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HttpChangelogUnsupportedError,
  HttpConfigError,
  HttpDisconnectedError,
  HttpResponseError,
  HttpUnsupportedOperationError,
  HttpUnsupportedWireTypeError
} from './errors.js';
import type { HttpAdapterOptions, HttpHandlers } from './http.interface.js';
import { ADAPTER_NAME, RxDBAdapterHttp } from './RxDBAdapterHttp.js';

/**
 * US-212 AC#1 / #4 / #10 / #11 / #15 / #19 / #23～26 / #31～34：适配器类本体。
 *
 * 这套用例的共同主题是**「没有」也要被冻结**：`rawQuery` 没有、`upsertMany` 没有、
 * `pullChangesBatch` 没有、未配 handler 时 `create` 没有。这些缺席各自扛着一条跨故事
 * 契约（bypass 门禁 / 结构隔离 / 特性探测），补上任何一个都会在别处静默失效，
 * 而「补上了」本身不会让任何现有用例变红——所以只能在这里正面断言。
 */

const HTTP_REMOTE = {
  type: SyncType.QueryCache,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'http' }
} satisfies SyncOptions;

const LOCAL_ONLY = { type: SyncType.None, local: { adapter: 'sqlite' } } satisfies SyncOptions;

const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

@Entity({ name: 'HttpRecipe', properties: [{ name: 'title', type: PropertyType.string }] })
class HttpRecipe extends EntityBase {
  declare title: string;
}

@Entity({ name: 'HttpBigIntRecord', properties: [{ name: 'amount', type: PropertyType.bigint }] })
class HttpBigIntRecord extends EntityBase {
  declare amount: bigint;
}

@Entity({ name: 'HttpBinaryRecord', properties: [{ name: 'payload', type: PropertyType.binary }] })
class HttpBinaryRecord extends EntityBase {
  declare payload: Uint8Array;
}

/**
 * 主键是 bigint 的实体，以及一个引用它的**自身字段全合法**的实体。
 *
 * @remarks
 * `HttpComment` 自己只有一个 string 字段，`propertyMap` 扫过去干干净净；但 `authorId`
 * 这一列照样要过 HTTP 线，且它的类型是 `HttpBigIntAuthor.id` 的 bigint。外键列不在
 * `propertyMap` 里（那张表来自 `@Entity` 的 `properties`，`authorId` 是从 `relations`
 * 派生的），所以只看 `propertyMap` 的扫描会原样放行——放行的后果正是 AC#15 要拦的那个：
 * `JSON.stringify(7n)` 抛 `TypeError`，而它与 fetch 传输失败同型，最后被当成离线。
 */
@Entity({ name: 'HttpBigIntAuthor', properties: [{ name: 'id', type: PropertyType.bigint }] })
class HttpBigIntAuthor extends EntityBase {
  declare name: string;
}

@Entity({
  name: 'HttpComment',
  properties: [{ name: 'text', type: PropertyType.string }],
  relations: [
    { name: 'author', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'HttpBigIntAuthor', mappedProperty: 'comments' }
  ]
})
class HttpComment extends EntityBase {
  declare text: string;
}

/** 最小可用 handlers：只配必选的两个，用来验证「没配的那些确实不存在」 */
const minimalHandlers: HttpHandlers = {
  onFetchMetadata: {
    request: ctx => ({
      url: 'metadata',
      method: 'POST',
      body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit }
    }),
    parse: body => body as never
  },
  onFindByIds: {
    request: ctx => ({ url: 'rows', method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  }
};

/** 三个可选写 handler，用来验证「配了的那些确实出现且能用」 */
const writeHandlers: Pick<HttpHandlers, 'onCreate' | 'onUpdate' | 'onDelete'> = {
  onCreate: { request: ctx => ({ url: 'rows', method: 'POST', body: ctx.data }), parse: body => body },
  onUpdate: { request: ctx => ({ url: `rows/${ctx.id}`, method: 'PATCH', body: ctx.data }), parse: body => body },
  onDelete: { request: ctx => ({ url: 'rows', method: 'DELETE', body: { ids: ctx.ids } }) }
};

const createRxdb = (entities: EntityType[] = [], sync: SyncOptions = LOCAL_ONLY): RxDB =>
  new RxDB({ dbName: 'rxdb-adapter-http-spec', entities, sync });

const createAdapter = (
  options: Partial<HttpAdapterOptions> = {},
  entities: EntityType[] = [],
  sync: SyncOptions = LOCAL_ONLY
): RxDBAdapterHttp =>
  new RxDBAdapterHttp(createRxdb(entities, sync), {
    baseUrl: 'https://api.example.com',
    handlers: minimalHandlers,
    ...options
  });

/** 依次返回排好队的响应；`Error` 表示这次 fetch 直接 reject */
const queueResponses = (items: (Response | Error)[]): ReturnType<typeof vi.fn> => {
  const queue = [...items];
  const mock = vi.fn(() => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('请求次数超出用例预期');
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

const meta = (id: string): { id: string; updatedAt: string } => ({ id, updatedAt: '2026-08-23T10:00:00.000Z' });

afterEach(() => vi.unstubAllGlobals());

describe('RxDBAdapterHttp 注册与身份（AC#1）', () => {
  it('ADAPTER_NAME 与实例 name 都是 http', () => {
    expect(ADAPTER_NAME).toBe('http');
    expect(createAdapter().name).toBe('http');
  });

  it('注册后可由 rxdb.getAdapter 解析为同一实例', async () => {
    const rxdb = createRxdb([], HTTP_REMOTE);
    const adapter = new RxDBAdapterHttp(rxdb, { baseUrl: 'https://api.example.com', handlers: minimalHandlers });
    rxdb.adapter('http', () => adapter);
    await expect(rxdb.getAdapter('http')).resolves.toBe(adapter);
  });

  it('未注册工厂时 getAdapter fail-fast，不静默降级', async () => {
    // core 已有的「Adapter not found」语义：本包只需确认没有在 declare module 之外
    // 塞进任何自动注册的旁路
    await expect(createRxdb([], HTTP_REMOTE).getAdapter('http')).rejects.toThrow(/not found/i);
  });
});

describe('构造期配置校验（AC#31）', () => {
  it.each([
    ['pageSize', 0],
    ['idChunkSize', 1.5],
    ['maxPages', Number.NaN],
    ['requestTimeoutMs', Number.POSITIVE_INFINITY],
    ['maxEmptyPages', -1]
  ])('%s = %p 在构造期即抛 HttpConfigError', (field, value) => {
    expect(() => createAdapter({ [field]: value })).toThrow(HttpConfigError);
  });

  it('错误信息带字段名与实际值', () => {
    // 构造期报错没有调用栈上下文，不带这两样等于让接入方猜
    expect(() => createAdapter({ pageSize: 0 })).toThrow(/pageSize.*0/);
  });

  it.each([
    ['baseUrl 为空串', { baseUrl: '' }],
    ['baseUrl 只有空白', { baseUrl: '   ' }]
  ])('%s 时抛 HttpConfigError', (_label, options) => {
    expect(() => createAdapter(options)).toThrow(HttpConfigError);
  });

  it('缺 onFetchMetadata 或 onFindByIds 时构造期即抛', () => {
    // 这两个是 RemoteBase 的 abstract 对应物，缺了整个 QueryCache 读路径都不成立，
    // 拖到首次查询才报等于让一个「连得上」的库带着注定失败的实体跑到运行期
    expect(() => createAdapter({ handlers: { onFindByIds: minimalHandlers.onFindByIds } as HttpHandlers })).toThrow(
      HttpConfigError
    );
    expect(() =>
      createAdapter({ handlers: { onFetchMetadata: minimalHandlers.onFetchMetadata } as HttpHandlers })
    ).toThrow(HttpConfigError);
  });
});

describe('connect（AC#15、AC#24）', () => {
  it('返回适配器自身且不发任何探测请求', async () => {
    const fetchMock = queueResponses([]);
    const adapter = createAdapter({}, [HttpRecipe], HTTP_REMOTE);
    await expect(adapter.connect()).resolves.toBe(adapter);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [HttpBigIntRecord, 'amount', PropertyType.bigint],
    [HttpBinaryRecord, 'payload', PropertyType.binary]
  ])('扫到 %#（bigint / binary）即抛 HttpUnsupportedWireTypeError', async (EntityType, property, propertyType) => {
    const adapter = createAdapter({}, [EntityType], HTTP_REMOTE);
    await expect(adapter.connect()).rejects.toMatchObject({
      name: 'HttpUnsupportedWireTypeError',
      entity: getEntityMetadata(EntityType).name,
      property,
      propertyType
    });
  });

  it('扫描发生在 connect 而非首次查询', async () => {
    const adapter = createAdapter({}, [HttpBigIntRecord], HTTP_REMOTE);
    await expect(adapter.connect()).rejects.toBeInstanceOf(HttpUnsupportedWireTypeError);
  });

  it('不走 http remote 槽位的实体不参与扫描', async () => {
    // bigint 只有在**要过 HTTP 线**时才是问题；本地实体带 bigint 与本包无关
    const adapter = createAdapter({}, [HttpBigIntRecord], LOCAL_ONLY);
    await expect(adapter.connect()).resolves.toBe(adapter);
  });

  it('自身字段全合法、但外键指向 bigint 主键的实体同样被拦', async () => {
    // 只扫 propertyMap 会放行 HttpComment —— 它自己只有一个 string。而 `authorId`
    // 一样要过这条线，类型是目标实体 id 的 bigint。放行的代价不是「多传一列」，
    // 是首次写入时 JSON.stringify 抛 TypeError，再被当成离线降级到陈旧缓存
    const adapter = createAdapter({}, [HttpComment, HttpBigIntAuthor], HTTP_REMOTE);
    await expect(adapter.connect()).rejects.toMatchObject({
      name: 'HttpUnsupportedWireTypeError',
      entity: 'HttpComment',
      property: 'authorId',
      propertyType: PropertyType.bigint
    });
  });

  it('外键指向的实体不在配置清单里时不误报', async () => {
    // 查不到目标实体就查不到它 id 的类型，此时唯一诚实的答案是「不知道」。
    // 猜一个 bigint 会把一大批正常配置拦在 connect 上，且错误信息指向一个查不到的实体
    const adapter = createAdapter({}, [HttpComment], HTTP_REMOTE);
    await expect(adapter.connect()).resolves.toBe(adapter);
  });

  it('重复 connect 会先掐断上一代的进行中请求', async () => {
    // 只替换 #disconnected 字段的话，旧 controller 从此没有任何引用能 abort 它：
    // 之后的 disconnect() 只取消得了新一代，旧请求要一直挂到自己超时
    const abortError = (): DOMException => new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (init.signal?.aborted) {
              reject(abortError());
              return;
            }
            init.signal?.addEventListener('abort', () => reject(abortError()));
          })
      )
    );
    const adapter = createAdapter();
    await adapter.connect();
    const pending = firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL)).catch((e: unknown) => e);
    await adapter.connect();
    expect(await pending).toBeInstanceOf(HttpDisconnectedError);
  });
});

describe('disconnect（AC#24、AC#34）', () => {
  it('取消进行中的翻页并走 error 通道', async () => {
    // 关键是 **error 而不是 complete**：complete 一个没发射过的 Observable 会让 core 的
    // forkJoin 静默产出「远端零条」，整表判成孤儿，比抛错危险得多
    // 这个桩必须先查 signal.aborted 再挂监听：真实 fetch 拿到**已经 abort** 的 signal 会
    // 立即 reject，而只挂监听的桩等不到一个早已发生过的事件，请求永远悬着——
    // disconnect() 恰好落在 transport 里 `await buildHeaders` 让出的那个窗口内
    const abortError = (): DOMException => new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (init.signal?.aborted) {
              reject(abortError());
              return;
            }
            init.signal?.addEventListener('abort', () => reject(abortError()));
          })
      )
    );
    const adapter = createAdapter();
    const pending = firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    await adapter.disconnect();
    await expect(pending).rejects.toBeInstanceOf(HttpDisconnectedError);
  });

  it('断开后再调 duck 抛错，不静默返回空', async () => {
    const adapter = createAdapter();
    await adapter.disconnect();
    await expect(firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL))).rejects.toBeInstanceOf(
      HttpDisconnectedError
    );
    await expect(firstValueFrom(adapter.findByIds('HttpRecipe', ['a']))).rejects.toBeInstanceOf(HttpDisconnectedError);
  });

  it('断开后 findByIds 传空 id 列表同样抛错', async () => {
    // 空列表本来会走「不发请求直接返回 []」的近路，正好绕过 transport 的断开检查——
    // 于是「断开」在这一条路径上退化成「远端没有这些行」
    const adapter = createAdapter();
    await adapter.disconnect();
    await expect(firstValueFrom(adapter.findByIds('HttpRecipe', []))).rejects.toBeInstanceOf(HttpDisconnectedError);
  });

  it('主动断开的错误与超时可区分：isNetworkError 判 false，不得降级到缓存', async () => {
    const adapter = createAdapter();
    await adapter.disconnect();
    const error = await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL)).catch((e: unknown) => e);
    expect(isNetworkError(error)).toBe(false);
  });

  it('重复 disconnect 幂等', async () => {
    const adapter = createAdapter();
    await adapter.disconnect();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

/**
 * AC#28 在**适配器**这一层的样子。
 *
 * @remarks
 * `transport.spec.ts` 已经把条件请求的机制测透了，但那里的 transport 是手工 `new` 出来的。
 * 从 `conditionalRequests: true` 到 transport 真的拿到 `conditional` 配置，中间还隔着
 * `#createTransport()` 里的那个三元——它此前一条用例都没走到，把开关接错线
 * （常关、或反过来常开）不会让任何现有用例变红。
 */
describe('conditionalRequests 开关接线（AC#28）', () => {
  const ETAG = '"v1"';

  /** 首次 200 带 ETag；此后**只在对方真的带了 if-none-match 时**回 304 */
  const stubEtagThen304 = (rows: unknown[]): ReturnType<typeof vi.fn> => {
    let served = false;
    const mock = vi.fn((_url: string, init: RequestInit) => {
      const conditional = (init.headers as Record<string, string>)['if-none-match'] === ETAG;
      if (served && conditional) {
        return Promise.resolve(new Response(null, { status: 304 }));
      }
      served = true;
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200, headers: { etag: ETAG } }));
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  };

  const ifNoneMatch = (mock: ReturnType<typeof vi.fn>, call: number): string | undefined =>
    ((mock.mock.calls[call][1] as RequestInit).headers as Record<string, string>)['if-none-match'];

  it('开启后第二次 fetchMetadata 带 if-none-match，且 304 还原成上次结果', async () => {
    const mock = stubEtagThen304([meta('a'), meta('b')]);
    const adapter = createAdapter({ conditionalRequests: true });
    const first = await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    const second = await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    expect(ifNoneMatch(mock, 0)).toBeUndefined();
    expect(ifNoneMatch(mock, 1)).toBe(ETAG);
    // 把 304 读成空集会让整表判成孤儿——AC#28 最危险的失败模式，且不报任何错
    expect(second.map(m => m.id)).toEqual(first.map(m => m.id));
    expect(second).not.toBe(first);
  });

  it('findByIds 同样参与条件缓存', async () => {
    const mock = stubEtagThen304([{ id: 'a' }]);
    const adapter = createAdapter({ conditionalRequests: true });
    await firstValueFrom(adapter.findByIds('HttpRecipe', ['a']));
    await expect(firstValueFrom(adapter.findByIds('HttpRecipe', ['a']))).resolves.toEqual([{ id: 'a' }]);
    expect(ifNoneMatch(mock, 1)).toBe(ETAG);
  });

  it('默认不开启：同一查询发两遍也不带条件头，行为与阶段 A 逐字相同', async () => {
    const mock = stubEtagThen304([meta('a')]);
    const adapter = createAdapter();
    await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    expect(ifNoneMatch(mock, 1)).toBeUndefined();
  });

  it('缓存不跨断开复用：reconnect 后第一个请求不带 if-none-match', async () => {
    const mock = stubEtagThen304([meta('a')]);
    const adapter = createAdapter({ conditionalRequests: true });
    await firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL));
    await adapter.disconnect();
    await adapter.connect();
    await expect(firstValueFrom(adapter.fetchMetadata('HttpRecipe', ALL))).resolves.toHaveLength(1);
    // 带着断开前的 ETag 去问，等于让重连后的第一批查询读到上一段连接的世界
    expect(ifNoneMatch(mock, 1)).toBeUndefined();
  });
});

describe('version（AC#24）', () => {
  it('未配 onVersion 时抛 unsupported，不回落到包版本号', async () => {
    // 回落等于拿适配器版本冒充后端版本，与 sqlite / pglite / supabase 三家口径全部不一致
    const error = await createAdapter()
      .version()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpUnsupportedOperationError);
    expect((error as Error).message).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it('配了 onVersion 时返回远端版本串', async () => {
    queueResponses([json({ version: 'my-api/2.1.0' })]);
    const adapter = createAdapter({
      handlers: {
        ...minimalHandlers,
        onVersion: {
          request: () => ({ url: 'version', method: 'GET' }),
          parse: body => (body as { version: string }).version
        }
      }
    });
    await expect(adapter.version()).resolves.toBe('my-api/2.1.0');
  });

  it('已断开且未配 onVersion 时报断开，而不是报缺 handler', async () => {
    // 两个都成立时该说哪个：配置问题下次连上仍在，生命周期问题是当下这一次调用的实情。
    // 反过来（先判 handler）还会让 version() 里的 #assertConnected 在缺 handler 的路径上
    // 永远走不到——「断开后所有 duck 一律抛 HttpDisconnectedError」在这条路径上失守
    const adapter = createAdapter();
    await adapter.disconnect();
    await expect(adapter.version()).rejects.toBeInstanceOf(HttpDisconnectedError);
  });
});

describe('isTableExisted（AC#24）', () => {
  const probeAdapter = (): RxDBAdapterHttp =>
    createAdapter({
      handlers: {
        ...minimalHandlers,
        onIsTableExisted: { request: ctx => ({ url: `tables/${ctx.entityName}`, method: 'HEAD' }) }
      }
    });

  it('2xx → true', async () => {
    queueResponses([new Response(null, { status: 200 })]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).resolves.toBe(true);
  });

  it('404 → false', async () => {
    queueResponses([new Response(null, { status: 404 })]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).resolves.toBe(false);
  });

  it('其余状态码 → 抛错，不返回 false', async () => {
    // 「不知道」和「不存在」必须区分：500 退化成 false 会让调用方以为远端确实没这张表
    queueResponses([new Response(null, { status: 500 })]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).rejects.toBeInstanceOf(HttpResponseError);
  });

  it('传输失败 → 抛 NetworkOfflineError，不返回 false', async () => {
    queueResponses([new TypeError('fetch failed')]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).rejects.toBeInstanceOf(NetworkOfflineError);
  });

  it('未配 onIsTableExisted 时复用 onFetchMetadata 的 limit: 1 探测', async () => {
    const fetchMock = queueResponses([json([])]);
    await expect(createAdapter().isTableExisted(HttpRecipe)).resolves.toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ limit: 1 });
  });

  it('不得恒 true 蒙混', async () => {
    queueResponses([new Response(null, { status: 404 })]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).resolves.toBe(false);
  });

  it.each([
    ['2xx', 200],
    ['404', 404]
  ])('%s 分支也把响应体读完 —— 未消费的 body 会占住 undici 连接', async (_label, status) => {
    // 这两支都只看状态码就 return，body 从不解析；Node 下未消费的流会把 socket
    // 挂到 GC 才归还，探测频繁时表现为连接池耗尽，而不是任何一处报错
    const response = new Response(JSON.stringify({ ignored: true }), { status });
    queueResponses([response]);
    await probeAdapter().isTableExisted(HttpRecipe);
    expect(response.bodyUsed).toBe(true);
  });

  it('清理响应体失败不影响已由状态码得出的判定', async () => {
    // 表存不存在这个答案 200 就已经给出了，为一次连接清理动作把它推翻是本末倒置
    const response = new Response('{}', { status: 200 });
    Object.defineProperty(response, 'body', {
      value: { cancel: () => Promise.reject(new Error('socket gone')) }
    });
    queueResponses([response]);
    await expect(probeAdapter().isTableExisted(HttpRecipe)).resolves.toBe(true);
  });
});

describe('v1 无实现的必选成员（AC#32）', () => {
  it.each(['getRepository', 'saveMany', 'removeMany', 'mutations'])(
    '%s 抛 HttpUnsupportedOperationError',
    async name => {
      const adapter = createAdapter() as unknown as Record<string, (...args: unknown[]) => unknown>;
      // 同步 throw 与 rejected promise 都算通过，但**不得**返回空数组 / undefined / 假成功
      const result = await Promise.resolve()
        .then(() => adapter[name](HttpRecipe))
        .catch((e: unknown) => e);
      expect(result).toBeInstanceOf(HttpUnsupportedOperationError);
    }
  );
});

describe('changelog 与分支成员（AC#10、#11、#26）', () => {
  it.each([
    ['pullChanges', [0]],
    ['getChangeCount', [0]],
    ['mergeChanges', [new Map()]]
  ])('%s 抛 HttpChangelogUnsupportedError，不返回空数组 / 0', async (name, args) => {
    const adapter = createAdapter() as unknown as Record<string, (...args: unknown[]) => unknown>;
    const result = await Promise.resolve()
      .then(() => adapter[name](...args))
      .catch((e: unknown) => e);
    expect(result).toBeInstanceOf(HttpChangelogUnsupportedError);
  });

  it.each(['pullChangesBatch', 'pushBranches', 'branchExists', 'pullBranches'])('%s 不实现（留给特性探测）', name => {
    // 调用点做特性探测后回落到同样 throw 的 pullChanges；实现一个返回 [] 的版本
    // 会让 Full-sync 以为远端没变更——这正是 AC#11 / #26 要防的
    expect(createAdapter()[name as keyof RxDBAdapterHttp]).toBeUndefined();
  });
});

describe('写入口按 handler 存在与否特性探测（AC#4）', () => {
  it('未配 onCreate / onUpdate / onDelete 时三个 duck 不存在', () => {
    // QueryCacheRepository 用 `if (!this.remoteAdapter.create)` 探测。定义成永远存在
    // 但内部 throw 的方法会让探测判 true，错误从「不支持 create」变成运行期意外
    const adapter = createAdapter();
    expect(adapter.create).toBeUndefined();
    expect(adapter.update).toBeUndefined();
    expect(adapter.delete).toBeUndefined();
  });

  it('配了 handler 的 duck 才出现，且方法名不带 on 前缀', () => {
    const adapter = createAdapter({
      handlers: {
        ...minimalHandlers,
        onCreate: { request: ctx => ({ url: 'rows', method: 'POST', body: ctx.data }), parse: body => body },
        onUpdate: { request: ctx => ({ url: `rows/${ctx.id}`, method: 'PATCH', body: ctx.data }), parse: body => body },
        onDelete: { request: ctx => ({ url: 'rows', method: 'DELETE', body: { ids: ctx.ids } }) }
      }
    });
    expect(typeof adapter.create).toBe('function');
    expect(typeof adapter.update).toBe('function');
    expect(typeof adapter.delete).toBe('function');
  });

  it('delete 把 core 的 string | string[] 归一成数组交给 handler', async () => {
    const seen: string[][] = [];
    queueResponses([new Response(null, { status: 204 })]);
    const adapter = createAdapter({
      handlers: {
        ...minimalHandlers,
        onDelete: {
          request: ctx => {
            seen.push(ctx.ids);
            return { url: 'rows', method: 'DELETE', body: { ids: ctx.ids } };
          }
        }
      }
    });
    const remove = adapter.delete;
    if (!remove) throw new Error('配了 onDelete 却没有 delete duck');
    await firstValueFrom(remove.call(adapter, 'HttpRecipe', 'only-one'));
    expect(seen).toEqual([['only-one']]);
  });

  it('create 把远端回执交给 handler.parse，不原样返回入参', async () => {
    // core 拿这个返回值当「服务端最终形态」用（id / 时间戳都由远端决定）。
    // 回显入参会让本地看到一条永远不存在于远端的行
    queueResponses([json({ id: 'server-id', title: 'from-server' })]);
    const adapter = createAdapter({ handlers: { ...minimalHandlers, ...writeHandlers } });
    const create = adapter.create;
    if (!create) throw new Error('配了 onCreate 却没有 create duck');
    await expect(firstValueFrom(create.call(adapter, 'HttpRecipe', { title: 'local' }))).resolves.toEqual({
      id: 'server-id',
      title: 'from-server'
    });
  });

  it('update 同理，并把 id 交给 handler 拼路径', async () => {
    const seen: string[] = [];
    queueResponses([json({ id: 'a', title: 'patched' })]);
    const adapter = createAdapter({
      handlers: {
        ...minimalHandlers,
        onUpdate: {
          request: ctx => {
            seen.push(ctx.id);
            return { url: `rows/${ctx.id}`, method: 'PATCH', body: ctx.data };
          },
          parse: body => body
        }
      }
    });
    const update = adapter.update;
    if (!update) throw new Error('配了 onUpdate 却没有 update duck');
    await expect(firstValueFrom(update.call(adapter, 'HttpRecipe', 'a', { title: 'patched' }))).resolves.toEqual({
      id: 'a',
      title: 'patched'
    });
    expect(seen).toEqual(['a']);
  });

  it.each(['create', 'update', 'delete'] as const)('断开后 %s 抛错，不静默成功', async duck => {
    // 写操作静默「成功」比读静默返回空更糟：调用方会以为远端已落库
    const adapter = createAdapter({ handlers: { ...minimalHandlers, ...writeHandlers } });
    await adapter.disconnect();
    const call = {
      create: () => adapter.create?.('HttpRecipe', {}),
      update: () => adapter.update?.('HttpRecipe', 'a', {}),
      delete: () => adapter.delete?.('HttpRecipe', 'a')
    }[duck];
    const observable = call();
    if (!observable) throw new Error(`配了 handler 却没有 ${duck} duck`);
    await expect(firstValueFrom(observable)).rejects.toBeInstanceOf(HttpDisconnectedError);
  });
});

describe('发射契约（AC#23、AC#33）', () => {
  it('fetchMetadata 跨 N 页只发射一次并 complete', async () => {
    queueResponses([json([meta('a'), meta('b')]), json([meta('c'), meta('d')]), json([meta('e')])]);
    const adapter = createAdapter({ pageSize: 2 });
    // 断发射计数 === 1，不是「最后一次的内容对」——每页一发也能让后者过
    const emissions = await lastValueFrom(adapter.fetchMetadata('HttpRecipe', ALL).pipe(toArray()));
    expect(emissions).toHaveLength(1);
    expect(emissions[0].map(m => m.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('findByIds 跨 N 块只发射一次并 complete', async () => {
    queueResponses([json([{ id: 'a' }, { id: 'b' }]), json([{ id: 'c' }])]);
    const adapter = createAdapter({ idChunkSize: 2 });
    const emissions = await lastValueFrom(adapter.findByIds('HttpRecipe', ['a', 'b', 'c']).pipe(toArray()));
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('订阅前不发请求（cold）', () => {
    const fetchMock = queueResponses([json([])]);
    createAdapter().fetchMetadata('HttpRecipe', ALL);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('结构隔离（AC#19、AC#25）', () => {
  /** 本地写方法与 SQL 直写入口：本包一个都不该有 */
  const FORBIDDEN = ['upsertMany', 'deleteByIds', 'getMetadataByIds', 'rawQuery'];

  it.each([...FORBIDDEN, 'transaction'])('实例上没有 %s', name => {
    expect((createAdapter() as unknown as Record<string, unknown>)[name]).toBeUndefined();
  });

  it('本包源码（剔除注释后）不出现这些标识符', () => {
    // rawQuery 一旦实现，本包就落进 adapter-contract §4.6 的 bypass 门禁，
    // roadmap 约束 11 用「结构隔离」换掉 epic-006 排期前置的整套论证随之作废。
    // 实例断言拦不住「写了但没挂在原型上」，所以再加一道源码扫描。
    // 剔除注释是刻意的：这条约束管的是**代码**，不是不许在文档里提起这些名字。
    const dir = import.meta.dirname;
    const offenders = readdirSync(dir)
      .filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map(file => ({ file, code: stripComments(readFileSync(join(dir, file), 'utf8')) }))
      .filter(({ code }) => FORBIDDEN.some(name => code.includes(name)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('构造函数不持有任何本地存储句柄', () => {
    const values = Object.values(createAdapter() as unknown as Record<string, unknown>);
    const holdsLocalWriter = values.some(
      value => typeof value === 'object' && value !== null && FORBIDDEN.some(name => name in value)
    );
    expect(holdsLocalWriter).toBe(false);
  });
});

/**
 * 粗暴但足够的注释剔除：块注释 + 行注释。
 *
 * 会误伤字符串里的 `//`（如 URL），但本检查只关心被禁标识符是否幸存，
 * 截断一截 URL 不影响结论。
 */
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
