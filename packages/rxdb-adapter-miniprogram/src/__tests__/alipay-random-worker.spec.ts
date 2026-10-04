/**
 * 支付宝随机数 Worker 脚本：按 ES5 语法检查（开发者工具对跳过转译的文件只认 ES5），再在 `node:vm` 里跑协议。
 */
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { ALIPAY_RANDOM_WORKER_SOURCE, createFakeRandomWorker, type FakeRandomWorkerOptions } from './fake-alipay.js';

function exchange(message: unknown, options?: FakeRandomWorkerOptions): Promise<unknown> {
  const worker = createFakeRandomWorker(options);
  return new Promise(resolve => {
    worker.onMessage(resolve);
    worker.postMessage(message as object);
  });
}

describe('alipay-random-worker.js', () => {
  it('是 ES5 脚本：没有 ES2015+ 语法', () => {
    const messages = new Linter().verify(ALIPAY_RANDOM_WORKER_SOURCE, {
      languageOptions: { ecmaVersion: 5, sourceType: 'script' }
    });

    expect(messages).toEqual([]);
  });

  it('按 length 回复 0..255 的整数数组', async () => {
    const response = (await exchange({ type: 'random', id: 7, length: 65_536 })) as { value: number[] };

    expect(response).toMatchObject({ id: 7, ok: true });
    expect(Array.isArray(response.value)).toBe(true);
    expect(response.value).toHaveLength(65_536);
    expect(response.value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)).toBe(true);
    expect(new Set(response.value).size).toBeGreaterThan(200);
  });

  it('length 为 0 时回复空数组', async () => {
    await expect(exchange({ type: 'random', id: 0, length: 0 })).resolves.toEqual({ id: 0, ok: true, value: [] });
  });

  it.each([
    [{ type: 'random', length: 4 }, -1, '不合法的请求：缺非负整数 id'],
    [{ type: 'random', id: 1.5, length: 4 }, -1, '不合法的请求：缺非负整数 id'],
    [null, -1, '不合法的请求：缺非负整数 id'],
    [{ type: 'probe', id: 3 }, 3, '不认识的请求类型：probe'],
    [{ type: 'random', id: 4, length: 65_537 }, 4, 'length 必须是 0..65536 的整数：65537'],
    [{ type: 'random', id: 5, length: -1 }, 5, 'length 必须是 0..65536 的整数：-1'],
    [{ type: 'random', id: 6, length: '8' }, 6, 'length 必须是 0..65536 的整数：8']
  ])('不合法的请求 %j 回复 ok: false', async (message, id, error) => {
    await expect(exchange(message)).resolves.toEqual({ id, ok: false, error });
  });

  it('Worker 里没有 crypto 时回复 ok: false，不造随机数', async () => {
    await expect(exchange({ type: 'random', id: 9, length: 4 }, { crypto: null })).resolves.toEqual({
      id: 9,
      ok: false,
      error: 'Worker 里没有 crypto.getRandomValues'
    });
  });

  it('crypto.getRandomValues 抛错时把原文带回', async () => {
    const crypto = {
      getRandomValues: () => {
        throw new Error('QuotaExceededError');
      }
    };

    await expect(exchange({ type: 'random', id: 10, length: 4 }, { crypto })).resolves.toEqual({
      id: 10,
      ok: false,
      error: 'QuotaExceededError'
    });
  });
});
