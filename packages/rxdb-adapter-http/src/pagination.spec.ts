import type { QueryCacheEntityMetadata, RuleGroup } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpHandlerContractError, HttpPaginationError } from './errors.js';
import type { FetchMetadataContext, FetchMetadataHandler, FetchMetadataResult } from './http.interface.js';
import { fetchAllMetadataPages } from './pagination.js';
import { HttpTransport } from './transport.js';

/**
 * US-212 AC#5 / #6 / #7：翻页必须**翻完**，翻不安全时**抛错而不是返回半份**。
 *
 * 被截掉的 metadata id 会被上层当成「远端已删除」变成假孤儿，叠加 US-020 阶段 B 的真
 * `deleteByIds` 就会把还活着的远端行从本地抹掉。返回部分结果 = 把静默截断搬进客户端。
 */
describe('fetchAllMetadataPages', () => {
  const WHERE: RuleGroup<unknown> = { combinator: 'and', rules: [] };
  let fetchMock: ReturnType<typeof vi.fn>;

  /** 依次返回排好队的响应体；队列空了说明多翻了页，直接让用例失败 */
  const queueBodies = (bodies: unknown[]): void => {
    const queue = [...bodies];
    fetchMock = vi.fn(() => {
      const body = queue.shift();
      if (body === undefined) {
        throw new Error('翻页次数超出用例预期');
      }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
  };

  /** 记录每页拿到的 ctx，用来断言 offset / pageToken 的推进 */
  const contexts: FetchMetadataContext[] = [];

  const handler: FetchMetadataHandler = {
    request: ctx => {
      contexts.push(ctx);
      return { url: 'items', method: 'GET' };
    },
    parse: body => body as FetchMetadataResult
  };

  const meta = (id: string): QueryCacheEntityMetadata => ({ id, updatedAt: '2026-08-23T10:00:00.000Z' });

  const run = (config: { pageSize?: number; maxEmptyPages?: number; maxPages?: number } = {}) =>
    fetchAllMetadataPages(
      {
        transport: new HttpTransport({
          baseUrl: 'https://api.example.com',
          requestTimeoutMs: 30000,
          disconnectSignal: new AbortController().signal
        }),
        handler,
        config: { pageSize: 2, maxEmptyPages: 3, maxPages: 1000, ...config }
      },
      { entityName: 'Recipe', where: WHERE }
    );

  beforeEach(() => (contexts.length = 0));
  afterEach(() => vi.unstubAllGlobals());

  describe('数组形态：短页即末页（AC#5）', () => {
    it('翻到 rows.length < limit 为止并合并全量', async () => {
      queueBodies([[meta('a'), meta('b')], [meta('c'), meta('d')], [meta('e')]]);
      const result = await run();
      expect(result.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('offset 按实际拿到的行数推进', async () => {
      queueBodies([[meta('a'), meta('b')], [meta('c')]]);
      await run();
      expect(contexts.map(c => c.offset)).toEqual([0, 2]);
      expect(contexts.every(c => c.limit === 2)).toBe(true);
    });

    it('末页恰好为空（总数整除 pageSize）也能正常终止', async () => {
      queueBodies([[meta('a'), meta('b')], []]);
      await expect(run()).resolves.toHaveLength(2);
    });

    it('单页就结束时只发一次请求', async () => {
      queueBodies([[meta('a')]]);
      await run();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('where 与 entityName 原样透传给 handler', async () => {
      queueBodies([[]]);
      await run();
      expect(contexts[0].where).toBe(WHERE);
      expect(contexts[0].entityName).toBe('Recipe');
    });

    it('逐页 canonicalize，不把不规范的串透传给 core', async () => {
      queueBodies([[{ id: 'a', updatedAt: '2026-08-23T18:00:00+08:00' }]]);
      await expect(run()).resolves.toEqual([{ id: 'a', updatedAt: '2026-08-23T10:00:00.000Z' }]);
    });
  });

  describe('token 形态：nextPageToken 为 undefined 即末页（AC#6）', () => {
    it('按 nextPageToken 翻页并把 pageToken 传回 handler', async () => {
      queueBodies([
        { rows: [meta('a')], nextPageToken: 'c1' },
        { rows: [meta('b')], nextPageToken: 'c2' },
        { rows: [meta('c')] }
      ]);
      const result = await run();
      expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
      expect(contexts.map(c => c.pageToken)).toEqual([undefined, 'c1', 'c2']);
    });

    it('空 rows 但仍带 nextPageToken 时继续翻', async () => {
      // 与「连续空页触顶」不矛盾：前者说第 1…N−1 次，后者说第 N 次
      queueBodies([
        { rows: [], nextPageToken: 'c1' },
        { rows: [meta('a')], nextPageToken: 'c2' },
        { rows: [meta('b')] }
      ]);
      await expect(run()).resolves.toHaveLength(2);
    });

    it('非空页把连续空页计数清零', async () => {
      queueBodies([
        { rows: [], nextPageToken: 'c1' },
        { rows: [], nextPageToken: 'c2' },
        { rows: [meta('a')], nextPageToken: 'c3' },
        { rows: [], nextPageToken: 'c4' },
        { rows: [], nextPageToken: 'c5' },
        { rows: [meta('b')] }
      ]);
      await expect(run({ maxEmptyPages: 3 })).resolves.toHaveLength(2);
    });

    it('token 形态下的短页不算末页', async () => {
      // offset 形态的终止判据不得渗进 token 形态，否则第一页就停
      queueBodies([{ rows: [meta('a')], nextPageToken: 'c1' }, { rows: [meta('b')] }]);
      await expect(run({ pageSize: 10 })).resolves.toHaveLength(2);
    });
  });

  describe('fail-fast 四条各自可区分（AC#7）', () => {
    /** 四条都必须 reject 而不是 resolve 出已拿到的部分 */
    const expectFailure = async (
      reason: string,
      bodies: unknown[],
      config?: Parameters<typeof run>[0]
    ): Promise<void> => {
      queueBodies(bodies);
      const error = await run(config).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpPaginationError);
      expect((error as HttpPaginationError).reason).toBe(reason);
    };

    it('中途由数组换成 token 对象', async () => {
      await expectFailure('shape_switch', [[meta('a'), meta('b')], { rows: [meta('c')] }]);
    });

    it('中途由 token 对象换成数组', async () => {
      await expectFailure('shape_switch', [{ rows: [meta('a')], nextPageToken: 'c1' }, [meta('b')]]);
    });

    it('nextPageToken 与上一页相同 —— 不进死循环', async () => {
      await expectFailure('page_token_not_advancing', [
        { rows: [meta('a')], nextPageToken: 'same' },
        { rows: [meta('b')], nextPageToken: 'same' }
      ]);
    });

    it('连续空页超过 maxEmptyPages —— 第 N+1 个才抛', async () => {
      // maxEmptyPages: 3 的字面语义是「容忍 3 个连续空页」，所以第 4 个才是故障
      await expectFailure(
        'empty_page_limit',
        [
          { rows: [], nextPageToken: 'c1' },
          { rows: [], nextPageToken: 'c2' },
          { rows: [], nextPageToken: 'c3' },
          { rows: [], nextPageToken: 'c4' }
        ],
        { maxEmptyPages: 3 }
      );
    });

    it('恰好 maxEmptyPages 个连续空页不抛', async () => {
      // 与上一条成对：判据是「超过」不是「达到」，边界值本身合法
      queueBodies([
        { rows: [], nextPageToken: 'c1' },
        { rows: [], nextPageToken: 'c2' },
        { rows: [], nextPageToken: 'c3' },
        { rows: [meta('a')] }
      ]);
      await expect(run({ maxEmptyPages: 3 })).resolves.toHaveLength(1);
    });

    it('maxEmptyPages: 0 时第一个空页就抛', async () => {
      await expectFailure('empty_page_limit', [{ rows: [], nextPageToken: 'c1' }], { maxEmptyPages: 0 });
    });

    it('maxEmptyPages: 1 容忍一个空页 —— 与 0 可区分', async () => {
      // ZERO_ALLOWED 为 maxEmptyPages 开的 0 这个口子，只有在 1 有不同语义时才不是冗余的
      queueBodies([{ rows: [], nextPageToken: 'c1' }, { rows: [meta('a')] }]);
      await expect(run({ maxEmptyPages: 1 })).resolves.toHaveLength(1);
    });

    it('总页数超过 maxPages', async () => {
      await expectFailure(
        'max_pages',
        [
          { rows: [meta('a')], nextPageToken: 'c1' },
          { rows: [meta('b')], nextPageToken: 'c2' },
          { rows: [meta('c')], nextPageToken: 'c3' }
        ],
        { maxPages: 2 }
      );
    });

    it('触顶时不返回已拿到的部分结果', async () => {
      queueBodies([
        { rows: [meta('a')], nextPageToken: 'c1' },
        { rows: [meta('b')], nextPageToken: 'c2' },
        { rows: [meta('c')], nextPageToken: 'c3' }
      ]);
      // 只 reject 不 resolve：拿到半份 metadata 比拿不到更危险
      await expect(run({ maxPages: 2 })).rejects.toBeInstanceOf(HttpPaginationError);
    });

    it.each([
      ['字符串', '"nope"'],
      ['null', 'null'],
      ['rows 不是数组', '{"rows":"nope"}']
    ])('handler.parse 返回 %s 时抛 HttpHandlerContractError', async (_label, body) => {
      // 放过去的话 rows 会是 undefined，以「这一页没有行」的面目终止翻页 —— 又一次静默截断
      queueBodies([JSON.parse(body) as unknown]);
      await expect(run()).rejects.toBeInstanceOf(HttpHandlerContractError);
    });

    it('遗留的 nextCursor 键 —— 抛错而不是当成末页', async () => {
      // `nextCursor` 是改名前的键。默默读 `nextPageToken` 会得到 undefined，于是首页
      // 即判末页：整表只剩第一页，其余 id 被上层当成远端已删除。这是本包最怕的静默截断，
      // 而它的触发条件仅仅是「handler 没跟着改名」——必须当场炸，且错误里要点出新名字
      queueBodies([{ rows: [meta('a')], nextCursor: 'c1' }]);
      const error = await run().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpHandlerContractError);
      expect((error as Error).message).toContain('nextPageToken');
    });

    it('两个键都在时以 nextPageToken 为准，不算遗留', async () => {
      // 远端 body 原样透传时可能自带一个同名字段，只要 handler 已经给出 nextPageToken
      // 就说明它认得新契约，没有静默截断的风险
      queueBodies([{ rows: [meta('a')], nextPageToken: 'c1', nextCursor: 'stale' }, { rows: [meta('b')] }]);
      await expect(run()).resolves.toHaveLength(2);
    });

    it('maxPages 恰好等于实际页数时正常完成', async () => {
      queueBodies([{ rows: [meta('a')], nextPageToken: 'c1' }, { rows: [meta('b')] }]);
      await expect(run({ maxPages: 2 })).resolves.toHaveLength(2);
    });
  });
});
