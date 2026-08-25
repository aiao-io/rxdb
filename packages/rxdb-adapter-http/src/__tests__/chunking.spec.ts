import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findByIdsInChunks } from './chunking.js';
import { HttpHandlerContractError, HttpResponseError } from './errors.js';
import type { FindByIdsContext, FindByIdsHandler } from './http.interface.js';
import { HttpTransport } from './transport.js';

/**
 * US-212 AC#8 / #9：id 列表分块请求后合并。
 *
 * 关键是区分两件长得很像的事：**某块失败**（必须整体 reject）与**某块返回少行**
 * （合法，远端确实删了）。把失败块当成空块继续合并，会让该块的 id 在下一轮被判成
 * 远端已删——一次网关 5xx 就能删掉本地一批还活着的行。
 */
describe('findByIdsInChunks', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const contexts: FindByIdsContext[] = [];

  const handler: FindByIdsHandler = {
    request: ctx => {
      contexts.push(ctx);
      return { url: 'items', method: 'POST', body: { ids: ctx.ids } };
    },
    parse: body => body as unknown[]
  };

  /** 按块序返回响应；`'boom'` 表示这一块以 500 失败 */
  const queueChunks = (chunks: (unknown[] | 'boom')[]): void => {
    const queue = [...chunks];
    fetchMock = vi.fn(() => {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('请求次数超出用例预期');
      }
      if (next === 'boom') {
        return Promise.resolve(new Response('server exploded', { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify(next), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
  };

  const row = (id: string): { id: string } => ({ id });

  const run = (ids: string[], idChunkSize = 2) =>
    findByIdsInChunks(
      {
        transport: new HttpTransport({
          baseUrl: 'https://api.example.com',
          requestTimeoutMs: 30000,
          disconnectSignal: new AbortController().signal
        }),
        handler,
        config: { idChunkSize }
      },
      { entityName: 'Recipe', ids }
    );

  beforeEach(() => (contexts.length = 0));
  afterEach(() => vi.unstubAllGlobals());

  it('id 数超过 idChunkSize 时分块并按块序合并（AC#8）', async () => {
    queueChunks([[row('a'), row('b')], [row('c'), row('d')], [row('e')]]);
    const result = await run(['a', 'b', 'c', 'd', 'e']);
    expect(result).toEqual([row('a'), row('b'), row('c'), row('d'), row('e')]);
    expect(contexts.map(c => c.ids)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('每块长度不超过 idChunkSize', async () => {
    queueChunks([[], [], []]);
    await run(['a', 'b', 'c', 'd', 'e']);
    expect(contexts.every(c => c.ids.length <= 2)).toBe(true);
  });

  it('id 数不足一块时只发一次请求', async () => {
    queueChunks([[row('a')]]);
    await run(['a'], 100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('空 id 列表不发请求，直接返回空数组', async () => {
    queueChunks([]);
    await expect(run([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('失败与少行是两件事（AC#9）', () => {
    it('任一块失败则整体 reject，不把它当成空块', async () => {
      queueChunks([[row('a'), row('b')], 'boom', [row('e')]]);
      await expect(run(['a', 'b', 'c', 'd', 'e'])).rejects.toBeInstanceOf(HttpResponseError);
    });

    it('失败块之后不再继续发请求', async () => {
      // 串行 + 首错即停：和 supabase 的 #findByIdsInChunks 同款语义
      queueChunks([[row('a'), row('b')], 'boom', [row('e')]]);
      await run(['a', 'b', 'c', 'd', 'e']).catch(() => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('某块返回少于该块 id 数的行是合法结果，不重试不补空对象', async () => {
      queueChunks([[row('a')], [row('c'), row('d')]]);
      const result = await run(['a', 'b', 'c', 'd']);
      expect(result).toEqual([row('a'), row('c'), row('d')]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('某块返回空数组同样合法', async () => {
      queueChunks([[], [row('c')]]);
      await expect(run(['a', 'b', 'c'])).resolves.toEqual([row('c')]);
    });

    it('handler.parse 返回非数组时抛 HttpHandlerContractError，不当成空块', async () => {
      queueChunks([{ rows: [] } as unknown as unknown[]]);
      await expect(run(['a'])).rejects.toBeInstanceOf(HttpHandlerContractError);
    });
  });
});
