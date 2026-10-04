/**
 * 支付宝随机源：逻辑层经 Worker 的 `crypto.getRandomValues` 取随机数。做不到就以无文档能力缺失报错，不降级。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlipayRandomWorker } from '../hosts/alipay-api.js';
import { AlipayUndocumentedCapabilityError } from '../hosts/alipay-capability.js';
import { ALIPAY_RANDOM_TIMEOUT_MS, createAlipayRandomSource } from '../hosts/alipay-random.js';
import { createFakeRandomWorker } from './fake-alipay.js';

const FEASIBILITY_HINT =
  '判定依据见 requirements/stories/adapter/miniprogram-platform-feasibility.md 的「支付宝 `my` — supported（阶段 C 交付，依赖未文档化能力，Android 未验证）」一节';

/** 手动应答的 Worker：记下请求，由测试决定回什么。 */
function manualWorker() {
  let listener: ((message: unknown) => void) | undefined;
  const requests: { type: string; id: number; length: number }[] = [];
  const worker: AlipayRandomWorker = {
    postMessage: message => requests.push(message as (typeof requests)[number]),
    onMessage: next => (listener = next)
  };
  return { worker, requests, reply: (message: unknown) => listener?.(message) };
}

/** 多监听的 Worker：每次 `onMessage` 都追加监听，回复分发给所有监听。 */
function multiListenerWorker() {
  const listeners: ((message: unknown) => void)[] = [];
  const requests: { type: string; id: number; length: number }[] = [];
  const worker: AlipayRandomWorker = {
    postMessage: message => requests.push(message as (typeof requests)[number]),
    onMessage: next => listeners.push(next)
  };
  return { worker, requests, listeners, reply: (message: unknown) => listeners.forEach(listener => listener(message)) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createAlipayRandomSource', () => {
  it('超过 65536 字节时分块依次请求，拼成恰好 length 字节的新缓冲区', async () => {
    const worker = createFakeRandomWorker();
    const requestRandomValues = createAlipayRandomSource(worker);
    const first = await requestRandomValues(65_536 * 2 + 5);
    const second = await requestRandomValues(16);

    expect(worker.requests).toEqual([
      { type: 'random', id: 0, length: 65_536 },
      { type: 'random', id: 1, length: 65_536 },
      { type: 'random', id: 2, length: 5 },
      { type: 'random', id: 3, length: 16 }
    ]);
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first.byteLength).toBe(65_536 * 2 + 5);
    expect(new Set(first).size).toBeGreaterThan(200);
    expect(second.buffer).not.toBe(first.buffer);
  });

  it('Worker 串行处理：上一块回复之后才发下一块，并发调用也排队', async () => {
    const { worker, requests, reply } = manualWorker();
    const requestRandomValues = createAlipayRandomSource(worker);
    const first = requestRandomValues(65_537);
    const second = requestRandomValues(2);
    await Promise.resolve();

    expect(requests).toEqual([{ type: 'random', id: 0, length: 65_536 }]);
    reply({ id: 0, ok: true, value: Array.from({ length: 65_536 }, () => 7) });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ type: 'random', id: 1, length: 1 });
    reply({ id: 1, ok: true, value: [9] });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    reply({ id: 2, ok: true, value: [1, 2] });

    await expect(first).resolves.toHaveLength(65_537);
    await expect(second).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it('超时只算单块往返：每块 9 秒回复、16 块共 144 秒也不超时（iOS 真机 1 MiB 实测 7.6 秒）', async () => {
    vi.useFakeTimers();
    const { worker, requests, reply } = manualWorker();
    const pending = createAlipayRandomSource(worker)(1_048_576);
    for (let index = 0; index < 16; index++) {
      await vi.advanceTimersByTimeAsync(9_000);
      expect(requests).toHaveLength(index + 1);
      reply({ id: index, ok: true, value: Array.from({ length: 65_536 }, () => index) });
    }

    await expect(pending).resolves.toHaveLength(1_048_576);
  });

  it('length 为 0 时不发请求，返回空缓冲区', async () => {
    const worker = createFakeRandomWorker();

    await expect(createAlipayRandomSource(worker)(0)).resolves.toEqual(new Uint8Array(0));
    expect(worker.requests).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN])('length 为 %s 时 reject，不发请求', async length => {
    const worker = createFakeRandomWorker();

    await expect(createAlipayRandomSource(worker)(length)).rejects.toThrow(
      `随机数长度必须是非负整数：${String(length)}`
    );
    expect(worker.requests).toEqual([]);
  });

  it('Worker 里没有 crypto：以 worker-crypto-random 缺失报错，Worker 原文与矩阵章节都在文案里', async () => {
    const error: unknown = await createAlipayRandomSource(createFakeRandomWorker({ crypto: null }))(4).catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(AlipayUndocumentedCapabilityError);
    expect(error).toMatchObject({
      name: 'AlipayUndocumentedCapabilityError',
      capability: 'worker-crypto-random',
      message:
        '支付宝小程序缺少无文档能力 worker-crypto-random：Worker 回复失败：Worker 里没有 crypto.getRandomValues。' +
        FEASIBILITY_HINT
    });
  });

  it('Worker 超时不回：报错提示检查 Worker 接线', async () => {
    vi.useFakeTimers();
    const { worker } = manualWorker();
    const pending = createAlipayRandomSource(worker)(4);
    const settled = pending.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(ALIPAY_RANDOM_TIMEOUT_MS);

    expect(ALIPAY_RANDOM_TIMEOUT_MS).toBe(10_000);
    await expect(settled).resolves.toMatchObject({
      capability: 'worker-crypto-random',
      message: expect.stringContaining(
        'Worker 10000 ms 内没有回复：检查 app.json 的 workers、mini.project.json 的 transpile.script.ignore ' +
          '与 my.createWorker 的 useExperimentalWorker'
      ) as unknown
    });
  });

  it('回复的不是 length 个 0..255 的整数：reject，不把可疑字节交出去', async () => {
    const { worker, requests, reply } = manualWorker();
    const pending = createAlipayRandomSource(worker)(4);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    reply({ id: 0, ok: true, value: [1, 2, 256, 3] });

    await expect(pending).rejects.toThrow('Worker 回复不合法：期望 4 个 0..255 的整数');
  });

  it('对不上号的回复说明协议已乱：在途、排队与之后的请求都失败，不再发消息', async () => {
    const { worker, requests, reply } = manualWorker();
    const requestRandomValues = createAlipayRandomSource(worker);
    const pending = [requestRandomValues(4), requestRandomValues(8)];
    await Promise.resolve();
    reply({ id: 99, ok: true, value: [] });

    for (const request of [...pending, requestRandomValues(1)]) {
      await expect(request).rejects.toThrow('Worker 回了对不上号的消息：{"id":99,"ok":true,"value":[]}');
    }
    expect(requests).toHaveLength(1);
  });

  it('分块里有一块失败，整个请求 reject', async () => {
    const { worker, requests, reply } = manualWorker();
    const pending = createAlipayRandomSource(worker)(65_537);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    reply({ id: 0, ok: true, value: Array.from({ length: 65_536 }, () => 7) });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    reply({ id: 1, ok: false, error: 'QuotaExceededError' });

    await expect(pending).rejects.toThrow('Worker 回复失败：QuotaExceededError');
  });

  it('postMessage 抛错时 reject，原始异常挂在 cause 上', async () => {
    const cause = new Error('worker terminated');
    const worker: AlipayRandomWorker = {
      postMessage: () => {
        throw cause;
      },
      onMessage: () => undefined
    };

    await expect(createAlipayRandomSource(worker)(4)).rejects.toMatchObject({
      capability: 'worker-crypto-random',
      cause
    });
  });

  describe('多个随机源复用同一 Worker（页面重进时新 host 拿到旧 Worker）', () => {
    it('请求 ID 共享、不冲突，回复分派给各自的请求', async () => {
      const { worker, requests, reply } = manualWorker();
      const oldSource = createAlipayRandomSource(worker);
      const newSource = createAlipayRandomSource(worker);
      const first = oldSource(1);
      const second = newSource(2);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      reply({ id: 0, ok: true, value: [7] });
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      reply({ id: 1, ok: true, value: [8, 9] });

      expect(requests).toEqual([
        { type: 'random', id: 0, length: 1 },
        { type: 'random', id: 1, length: 2 }
      ]);
      await expect(first).resolves.toEqual(new Uint8Array([7]));
      await expect(second).resolves.toEqual(new Uint8Array([8, 9]));
    });

    it('旧随机源的请求在途时建新随机源：新旧请求都正确完成，之后仍可继续取', async () => {
      const { worker, requests, reply } = manualWorker();
      const pendingOld = createAlipayRandomSource(worker)(1);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      const newSource = createAlipayRandomSource(worker);
      const pendingNew = newSource(2);
      reply({ id: 0, ok: true, value: [7] });
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      reply({ id: 1, ok: true, value: [1, 2] });

      await expect(pendingOld).resolves.toEqual(new Uint8Array([7]));
      await expect(pendingNew).resolves.toEqual(new Uint8Array([1, 2]));
      const next = newSource(1);
      await vi.waitFor(() => expect(requests).toHaveLength(3));
      reply({ id: 2, ok: true, value: [3] });
      await expect(next).resolves.toEqual(new Uint8Array([3]));
    });

    it('多监听 Worker 上只挂一次监听：不重复分派，也不因对不上号而失效', async () => {
      const { worker, requests, listeners, reply } = multiListenerWorker();
      const oldSource = createAlipayRandomSource(worker);
      const newSource = createAlipayRandomSource(worker);
      const first = oldSource(1);
      const second = newSource(1);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      reply({ id: 0, ok: true, value: [4] });
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      reply({ id: 1, ok: true, value: [5] });

      expect(listeners).toHaveLength(1);
      await expect(first).resolves.toEqual(new Uint8Array([4]));
      await expect(second).resolves.toEqual(new Uint8Array([5]));
    });

    it('真实 Worker 脚本下两个随机源并发取数，各自拿到正确长度', async () => {
      const worker = createFakeRandomWorker();
      const [first, second] = await Promise.all([
        createAlipayRandomSource(worker)(3),
        createAlipayRandomSource(worker)(5)
      ]);

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(5);
      expect(worker.requests).toEqual([
        { type: 'random', id: 0, length: 3 },
        { type: 'random', id: 1, length: 5 }
      ]);
    });
  });
});
