import { Entity, EntityBase, PropertyType, RxDB, SyncType, type RuleGroup, type SyncOptions } from '@aiao/rxdb';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpConfigError, HttpHandlerContractError, HttpUnsupportedOperationError } from './errors.js';
import type { HttpAdapterOptions } from './http.interface.js';
import { createRestHandlers, type RestHandlersOptions } from './rest.js';
import { RxDBAdapterHttp } from './RxDBAdapterHttp.js';

/**
 * US-212 阶段 B AC#27：REST resource URL 模板。
 *
 * 两条主线：
 * 1. **等价性**——模板产出的 handler 装进真适配器后，翻页、分块、写入口与发射契约
 *    与阶段 A 手写 handler 表现一致。只断言「模板渲染出的字符串对」不够：工厂的价值在于
 *    产出物能原样喂进阶段 A 那套循环，而那要跑一遍才知道。
 * 2. **fail-fast**——退化模板在**构造期**就抛，且抛的时候一个请求都没发出去。
 *    错 URL 的危险形态（少 `:id`、少 `:entity`）在网线上是 2xx，靠观察响应发现不了。
 */

const BASE_URL = 'https://api.example.com/v1';

const ALL: RuleGroup<unknown> = { combinator: 'and', rules: [] };

const LOCAL_ONLY = { type: SyncType.None, local: { adapter: 'sqlite' } } satisfies SyncOptions;

@Entity({ name: 'RestRecipe', properties: [{ name: 'title', type: PropertyType.string }] })
class RestRecipe extends EntityBase {
  declare title: string;
}

const createAdapter = (
  restOptions: RestHandlersOptions = {},
  adapterOptions: Partial<HttpAdapterOptions> = {}
): RxDBAdapterHttp =>
  new RxDBAdapterHttp(new RxDB({ dbName: 'rxdb-adapter-http-rest-spec', entities: [], sync: LOCAL_ONLY }), {
    baseUrl: BASE_URL,
    handlers: createRestHandlers(restOptions),
    ...adapterOptions
  });

/** 依次返回排好队的响应，并留下调用记录用于断言 URL / method / body */
const queueResponses = (items: Response[]): ReturnType<typeof vi.fn> => {
  const queue = [...items];
  const mock = vi.fn(() => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('请求次数超出用例预期');
    }
    return Promise.resolve(next);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

const empty = (status: number): Response => new Response(undefined, { status });

const meta = (id: string): { id: string; updatedAt: string } => ({ id, updatedAt: '2026-08-23T10:00:00.000Z' });

/** 取第 n 次 fetch 调用的 URL / method / 已解码 body */
const callOf = (mock: ReturnType<typeof vi.fn>, index = 0): { url: string; method: string; body: unknown } => {
  const [url, init] = mock.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: init.method as string,
    body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('默认模板的 URL、方法与请求体（AC#27）', () => {
  it('fetchMetadata 打 :entity/metadata，body 带 JSON RuleGroup 与翻页参数', async () => {
    const fetchMock = queueResponses([json([meta('a')])]);

    await firstValueFrom(createAdapter().fetchMetadata('Recipe', ALL));

    expect(callOf(fetchMock)).toEqual({
      url: 'https://api.example.com/v1/Recipe/metadata',
      method: 'POST',
      // 不发 SQL：where 原样是 RuleGroup。首页无游标，`cursor: undefined` 被 stringify 丢掉
      body: { where: ALL, offset: 0, limit: 1000 }
    });
  });

  it('findByIds 打 :entity/by-ids，body 是本块 id', async () => {
    const fetchMock = queueResponses([json([{ id: 'a' }])]);

    await firstValueFrom(createAdapter().findByIds('Recipe', ['a', 'b']));

    expect(callOf(fetchMock)).toEqual({
      url: 'https://api.example.com/v1/Recipe/by-ids',
      method: 'POST',
      body: { ids: ['a', 'b'] }
    });
  });

  it('create 打集合资源，update 打单项资源，delete 走 POST :entity/delete', async () => {
    const adapter = createAdapter();
    const fetchMock = queueResponses([json({ id: 'a' }), json({ id: 'a' }), empty(204)]);

    await firstValueFrom(adapter.create!('Recipe', { title: 'x' }));
    await firstValueFrom(adapter.update!('Recipe', 'a', { title: 'y' }));
    await firstValueFrom(adapter.delete!('Recipe', ['a', 'b']));

    expect(callOf(fetchMock, 0)).toEqual({
      url: 'https://api.example.com/v1/Recipe',
      method: 'POST',
      body: { title: 'x' }
    });
    expect(callOf(fetchMock, 1)).toEqual({
      url: 'https://api.example.com/v1/Recipe/a',
      method: 'PATCH',
      body: { title: 'y' }
    });
    // 批量删除的 id 必须进 body，而 DELETE 的 body 会被代理丢弃——丢了就成了「删整个集合」
    expect(callOf(fetchMock, 2)).toEqual({
      url: 'https://api.example.com/v1/Recipe/delete',
      method: 'POST',
      body: { ids: ['a', 'b'] }
    });
  });

  it('单个 id 的 delete 归一成数组后再进 body', async () => {
    const fetchMock = queueResponses([empty(204)]);

    await firstValueFrom(createAdapter().delete!('Recipe', 'a'));

    expect(callOf(fetchMock).body).toEqual({ ids: ['a'] });
  });

  it('resources 映射替换路径片段，未映射的实体用实体名', async () => {
    const adapter = createAdapter({ resources: { Recipe: 'kitchen/recipes' } });
    const fetchMock = queueResponses([json([]), json([])]);

    await firstValueFrom(adapter.fetchMetadata('Recipe', ALL));
    await firstValueFrom(adapter.fetchMetadata('Note', ALL));

    // 映射值是配置里的开发者常量，允许多段路径，不做 encodeURIComponent
    expect(callOf(fetchMock, 0).url).toBe('https://api.example.com/v1/kitchen/recipes/metadata');
    expect(callOf(fetchMock, 1).url).toBe('https://api.example.com/v1/Note/metadata');
  });

  it('id 来自数据，转义后再进 URL', async () => {
    const fetchMock = queueResponses([json({ id: 'a/b' })]);

    await firstValueFrom(createAdapter().update!('Recipe', 'a/b', { title: 'y' }));

    // 不转义就会打到 /Recipe/a 下的另一个子资源上
    expect(callOf(fetchMock).url).toBe('https://api.example.com/v1/Recipe/a%2Fb');
  });

  it('模板可逐操作覆盖路径与方法', async () => {
    const adapter = createAdapter({ templates: { update: { path: ':entity/items/:id', method: 'PUT' } } });
    const fetchMock = queueResponses([json({ id: 'a' })]);

    await firstValueFrom(adapter.update!('Recipe', 'a', { title: 'y' }));

    expect(callOf(fetchMock)).toEqual({
      url: 'https://api.example.com/v1/Recipe/items/a',
      method: 'PUT',
      body: { title: 'y' }
    });
  });
});

describe('等价于阶段 A 的 QueryCache ducks（AC#27）', () => {
  it('翻页跑满并恰好发射一次（AC#5 / #23）', async () => {
    const adapter = createAdapter({}, { pageSize: 2 });
    const fetchMock = queueResponses([json([meta('a'), meta('b')]), json([meta('c')])]);

    const emissions = await lastValueFrom(adapter.fetchMetadata('Recipe', ALL).pipe(toArray()));

    expect(emissions).toHaveLength(1);
    expect(emissions[0].map(row => row.id)).toEqual(['a', 'b', 'c']);
    // offset 由适配器推进，模板只负责把它放进 body
    expect(callOf(fetchMock, 1).body).toEqual({ where: ALL, offset: 2, limit: 2 });
  });

  it('游标形态照常工作：模板把 cursor 透传进 body（AC#6）', async () => {
    const adapter = createAdapter();
    const fetchMock = queueResponses([json({ rows: [meta('a')], nextCursor: 'c1' }), json({ rows: [meta('b')] })]);

    const rows = await firstValueFrom(adapter.fetchMetadata('Recipe', ALL));

    expect(rows.map(row => row.id)).toEqual(['a', 'b']);
    expect(callOf(fetchMock, 1).body).toEqual({ where: ALL, offset: 0, limit: 1000, cursor: 'c1' });
  });

  it('分块合并后恰好发射一次（AC#8 / #33）', async () => {
    const adapter = createAdapter({}, { idChunkSize: 2 });
    const fetchMock = queueResponses([json([{ id: 'a' }, { id: 'b' }]), json([{ id: 'c' }])]);

    const emissions = await lastValueFrom(adapter.findByIds<{ id: string }>('Recipe', ['a', 'b', 'c']).pipe(toArray()));

    expect(emissions).toHaveLength(1);
    expect(emissions[0].map(row => row.id)).toEqual(['a', 'b', 'c']);
    expect(callOf(fetchMock, 1).body).toEqual({ ids: ['c'] });
  });

  it('updatedAt 仍由适配器规范化，模板不碰它（AC#14）', async () => {
    queueResponses([json([{ id: 'a', updatedAt: '2026-08-23T18:00:00+08:00' }])]);

    const rows = await firstValueFrom(createAdapter().fetchMetadata('Recipe', ALL));

    expect(rows).toEqual([{ id: 'a', updatedAt: '2026-08-23T10:00:00.000Z' }]);
  });
});

describe('可关闭与默认不产出的 handler（AC#27）', () => {
  it('templates.create = null 时写 duck 缺席，走 AC#4 的 fail-fast', () => {
    const adapter = createAdapter({ templates: { create: null } });

    expect(adapter.create).toBeUndefined();
    expect(adapter.update).toBeDefined();
    expect(adapter.delete).toBeDefined();
  });

  it('三个写 handler 全关时只剩读路径（只读后端）', () => {
    const adapter = createAdapter({ templates: { create: null, update: null, delete: null } });

    expect(adapter.create).toBeUndefined();
    expect(adapter.update).toBeUndefined();
    expect(adapter.delete).toBeUndefined();
    // 读路径不受影响：两个必选 handler 仍在
    expect(
      createRestHandlers({ templates: { create: null, update: null, delete: null } }).onFetchMetadata
    ).toBeDefined();
  });

  it('version 与 isTableExisted 默认不产出，version() 抛 unsupported', async () => {
    const handlers = createRestHandlers();

    expect(handlers.onVersion).toBeUndefined();
    expect(handlers.onIsTableExisted).toBeUndefined();
    await expect(createAdapter().version()).rejects.toBeInstanceOf(HttpUnsupportedOperationError);
  });

  it('配上 version 模板后返回远端版本，两种响应形态都收', async () => {
    const adapter = createAdapter({ templates: { version: { path: 'meta/version' } } });
    const fetchMock = queueResponses([json({ version: '3.45.0' }), json('3.45.0')]);

    await expect(adapter.version()).resolves.toBe('3.45.0');
    await expect(adapter.version()).resolves.toBe('3.45.0');
    expect(callOf(fetchMock, 0)).toEqual({
      url: 'https://api.example.com/v1/meta/version',
      method: 'GET',
      body: undefined
    });
  });

  it('version 响应形态不合契约时抛 HttpHandlerContractError，不猜一个版本号', async () => {
    const adapter = createAdapter({ templates: { version: { path: 'meta/version' } } });
    queueResponses([json({ build: 7 })]);

    await expect(adapter.version()).rejects.toBeInstanceOf(HttpHandlerContractError);
  });

  it('配上 isTableExisted 模板后按状态码分流', async () => {
    const adapter = createAdapter({
      resources: { RestRecipe: 'recipes' },
      templates: { isTableExisted: { path: ':entity' } }
    });
    const fetchMock = queueResponses([empty(200), empty(404)]);

    await expect(adapter.isTableExisted(RestRecipe)).resolves.toBe(true);
    await expect(adapter.isTableExisted(RestRecipe)).resolves.toBe(false);
    expect(callOf(fetchMock, 0)).toEqual({
      url: 'https://api.example.com/v1/recipes',
      method: 'HEAD',
      body: undefined
    });
  });
});

describe('模板 fail-fast：构造期就抛，不发错 URL（AC#27）', () => {
  const rejects = (options: RestHandlersOptions, match: RegExp): void => {
    const fetchMock = queueResponses([]);
    expect(() => createRestHandlers(options)).toThrow(HttpConfigError);
    expect(() => createRestHandlers(options)).toThrow(match);
    // 校验发生在构造期：退化模板一个字节都没上网线
    expect(fetchMock).not.toHaveBeenCalled();
  };

  it('update 模板缺 :id → 抛，否则 PATCH 会打到整个集合上', () => {
    rejects({ templates: { update: { path: ':entity' } } }, /missing ":id"/);
  });

  it('模板缺 :entity → 抛，否则所有实体共用一个 URL', () => {
    rejects({ templates: { fetchMetadata: { path: 'metadata' } } }, /missing ":entity"/);
  });

  it('在没有 id 的操作里写 :id → 抛，否则字面量 :id 会渲染进 URL', () => {
    rejects({ templates: { fetchMetadata: { path: ':entity/:id/metadata' } } }, /unexpected ":id"/);
  });

  it('version 模板里写 :entity → 抛（服务端版本与实体无关）', () => {
    rejects({ templates: { version: { path: ':entity/version' } } }, /unexpected ":entity"/);
  });

  it('未知占位符 → 抛，不静默留在 URL 里', () => {
    rejects({ templates: { create: { path: ':entity/:tenant' } } }, /unexpected ":tenant"/);
  });

  it('空路径 / 含空白或 ? # 的路径 → 抛', () => {
    rejects({ templates: { create: { path: '   ' } } }, /non-empty string/);
    rejects({ templates: { create: { path: ':entity?full=1' } } }, /must not contain whitespace/);
    rejects({ templates: { create: { path: ':entity#top' } } }, /must not contain whitespace/);
  });

  it('非法 method → 抛', () => {
    rejects({ templates: { create: { path: ':entity', method: 'FETCH' as never } } }, /templates\.create\.method/);
  });

  it('关掉必选 handler → 抛（少了它整条读路径都不成立）', () => {
    rejects({ templates: { fetchMetadata: null } }, /cannot be disabled/);
    rejects({ templates: { findByIds: null } }, /cannot be disabled/);
  });

  it('resources 的值不是合法路径片段 → 抛', () => {
    rejects({ resources: { Recipe: '' } }, /resources\.Recipe/);
    rejects({ resources: { Recipe: 'rec ipes' } }, /resources\.Recipe/);
    rejects({ resources: { Recipe: 'recipes?all=1' } }, /resources\.Recipe/);
  });

  it('错误里带字段名与实际值', () => {
    try {
      createRestHandlers({ templates: { update: { path: ':entity' } } });
      expect.unreachable('应当抛 HttpConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpConfigError);
      expect((error as HttpConfigError).field).toBe('templates.update.path');
      expect((error as HttpConfigError).value).toBe(':entity');
      expect((error as HttpConfigError).code).toBe('CONFIG_ERROR');
    }
  });

  it('绝对 URL 里的端口号不被当成占位符', () => {
    const handlers = createRestHandlers({ templates: { create: { path: 'https://api.example.com:8080/:entity' } } });

    expect(handlers.onCreate!.request({ entityName: 'Recipe', data: {} })).toEqual({
      url: 'https://api.example.com:8080/Recipe',
      method: 'POST',
      body: {}
    });
  });
});

describe('请求期的取值校验（同样不发错 URL）（AC#27）', () => {
  it('未映射的实体名含 /，提示补 resources 映射而不是拼出别的资源', () => {
    const fetchMock = queueResponses([]);
    const handlers = createRestHandlers();

    expect(() => handlers.onFetchMetadata.request({ entityName: 'a/b', where: ALL, offset: 0, limit: 10 })).toThrow(
      /resources\.a\/b/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空 id 不渲染成集合 URL', () => {
    const handlers = createRestHandlers();

    expect(() => handlers.onUpdate!.request({ entityName: 'Recipe', id: '', data: {} })).toThrow(HttpConfigError);
  });

  it('写回执不是对象时抛 HttpHandlerContractError，不把 null 当成行写进缓存', async () => {
    const adapter = createAdapter();
    queueResponses([json(null), json('ok')]);

    await expect(firstValueFrom(adapter.create!('Recipe', { title: 'x' }))).rejects.toBeInstanceOf(
      HttpHandlerContractError
    );
    await expect(firstValueFrom(adapter.update!('Recipe', 'a', { title: 'x' }))).rejects.toBeInstanceOf(
      HttpHandlerContractError
    );
  });
});
