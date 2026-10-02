import { webcrypto } from 'node:crypto';
import { addWasmBytes, createFakeAlipay } from './__tests__/fake-alipay.js';
import type { AlipayWorker } from './alipay-api.js';
import { createWorkerBridge, handleWorkerMessage, type WorkerEnvironment } from './worker-protocol.js';

const environment: WorkerEnvironment = {
  freeGlobals: { MYWebAssembly: 'object', crypto: 'object' },
  MYWebAssembly: { instantiate: (_path, imports) => WebAssembly.instantiate(addWasmBytes, imports) },
  crypto: webcrypto
};

/** 手动驱动的 Worker：测试自己决定回什么消息。 */
function manualWorker() {
  const posted: unknown[] = [];
  let listener: ((message: unknown) => void) | undefined;
  let terminated = false;
  const worker: AlipayWorker = {
    postMessage: message => posted.push(message),
    onMessage: next => (listener = next),
    terminate: () => (terminated = true)
  };
  return { worker, posted, reply: (message: unknown) => listener?.(message), terminated: () => terminated };
}

describe('handleWorkerMessage', () => {
  it('probe：回报自由变量、MYWebAssembly 跑 add(2, 3)、crypto 取样', async () => {
    const response = await handleWorkerMessage({ type: 'probe', id: 1, wasmPath: '/wasm/add.wasm' }, environment);
    expect(response).toMatchObject({
      id: 1,
      ok: true,
      value: {
        freeGlobals: { MYWebAssembly: 'object', crypto: 'object' },
        MYWebAssembly: { ok: true, value: { path: '/wasm/add.wasm', addResult: 5 } },
        cryptoGetRandomValues: { ok: true, value: { length: 16 } }
      }
    });
  });

  it('probe：没有 MYWebAssembly / crypto 时记为跳过而不是失败', async () => {
    const response = await handleWorkerMessage(
      { type: 'probe', id: 2, wasmPath: '/wasm/add.wasm' },
      { freeGlobals: {} }
    );
    expect(response).toMatchObject({
      ok: true,
      value: {
        MYWebAssembly: { skipped: expect.stringContaining('MYWebAssembly') },
        cryptoGetRandomValues: { skipped: expect.stringContaining('crypto') }
      }
    });
  });

  it('probe：实例化失败如实记下原始错误', async () => {
    const response = await handleWorkerMessage(
      { type: 'probe', id: 3, wasmPath: 'wasm/add.wasm' },
      { ...environment, MYWebAssembly: { instantiate: () => Promise.reject(new Error('not found')) } }
    );
    expect(response).toMatchObject({ ok: true, value: { MYWebAssembly: { ok: false, error: { message: 'not found' } } } });
  });

  it('random：超过 65536 字节分块填充，整段都要被填过', async () => {
    const response = await handleWorkerMessage({ type: 'random', id: 4, length: 200_000 }, environment);
    expect(response.ok).toBe(true);
    const value = (response as { value: number[] }).value;
    expect(value).toHaveLength(200_000);
    // 每个 64 KiB 块的末尾 64 字节全为 0 的概率可以忽略
    for (const end of [65_536, 131_072, 196_608, 200_000]) {
      expect(value.slice(end - 64, end).some(byte => byte !== 0)).toBe(true);
    }
  });

  it('random：没有 crypto 时回失败', async () => {
    const response = await handleWorkerMessage({ type: 'random', id: 5, length: 8 }, { freeGlobals: {} });
    expect(response).toMatchObject({ id: 5, ok: false, error: { message: expect.stringContaining('crypto') } });
  });

  it.each([[undefined], [{ type: 'probe' }], [{ type: 'nope', id: 6 }], [{ type: 'random', id: 7, length: -1 }]])(
    '不合法的请求 %j：不 reject，回失败',
    async message => {
      const response = await handleWorkerMessage(message, environment);
      expect(response.ok).toBe(false);
    }
  );
});

describe('createWorkerBridge', () => {
  it('经替身 Worker 往返：probe 与 randomValues', async () => {
    const fake = createFakeAlipay();
    const createWorker = fake.my.createWorker;
    if (!createWorker) throw new Error('替身应当有 createWorker');
    const bridge = createWorkerBridge(createWorker('workers/index.js', { useExperimentalWorker: true }), 1000);
    const probeResult = await bridge.probe('/wasm/add.wasm');
    expect(probeResult).toMatchObject({ MYWebAssembly: { ok: true, value: { addResult: 5 } } });
    const bytes = await bridge.randomValues(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(32);
    bridge.terminate();
    expect(fake.liveWorkers()).toBe(0);
  });

  it('并发请求按 id 对号入座', async () => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 1000);
    const first = bridge.randomValues(1);
    const second = bridge.randomValues(2);
    const [a, b] = manual.posted as { id: number }[];
    manual.reply({ id: b.id, ok: true, value: [9, 9] });
    manual.reply({ id: a.id, ok: true, value: [7] });
    expect([...(await first)]).toEqual([7]);
    expect([...(await second)]).toEqual([9, 9]);
  });

  it('远端失败包成 Error，DescribedError 挂在 cause 上', async () => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 1000);
    const pending = bridge.randomValues(1);
    const { id } = manual.posted[0] as { id: number };
    manual.reply({ id, ok: false, error: { typeof: 'object', message: 'boom', codes: {}, ownKeys: [], text: 'boom' } });
    await expect(pending).rejects.toMatchObject({ message: expect.stringContaining('boom'), cause: { message: 'boom' } });
  });

  it.each([
    ['长度不对', [1, 2]],
    ['元素越界', [256]],
    ['不是数组', 'xx']
  ])('random 返回值%s：拒收', async (_label, value) => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 1000);
    const pending = bridge.randomValues(1);
    manual.reply({ id: (manual.posted[0] as { id: number }).id, ok: true, value });
    await expect(pending).rejects.toThrow(/random/);
  });

  it('收到不合法或未知 id 的消息：所有待决请求一起失败', async () => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 1000);
    const pending = [bridge.randomValues(1), bridge.probe('/wasm/add.wasm')];
    manual.reply({ id: 999, ok: true, value: [] });
    for (const request of pending) await expect(request).rejects.toThrow(/999/);
  });

  it('超时：Worker 不回消息也会失败', async () => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 20);
    await expect(bridge.randomValues(1)).rejects.toThrow(/20ms/);
  });

  it('terminate：结束 Worker，待决请求失败', async () => {
    const manual = manualWorker();
    const bridge = createWorkerBridge(manual.worker, 1000);
    const pending = bridge.randomValues(1);
    bridge.terminate();
    expect(manual.terminated()).toBe(true);
    await expect(pending).rejects.toThrow(/terminate/);
  });
});
