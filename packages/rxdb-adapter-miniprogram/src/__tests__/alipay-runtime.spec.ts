/**
 * 支付宝逻辑层的运行时修补：找真实全局对象、取回原生 `BigInt`、补 `queueMicrotask`，
 * 以及宿主的 `prepareRuntime` 钩子在 `prepareMiniProgramHostRuntime` 里的位置。
 *
 * 形态取自 US-211 支付宝探针 v6：模拟器逻辑层没有 `globalThis`、`BigInt`、`queueMicrotask`，
 * 只有 `Object.prototype` getter 一路拿到真实全局对象；iOS 真机有 `globalThis` 与 `BigInt`，只缺 `queueMicrotask`。
 */
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createWechatMiniProgramHost } from '../host.js';
import type { AlipayStandardWasmApi } from '../hosts/alipay-api.js';
import { AlipayUndocumentedCapabilityError } from '../hosts/alipay-capability.js';
import { discoverAlipayRuntimeGlobal, prepareAlipayRuntimeGlobal } from '../hosts/alipay-runtime.js';
import { createDouyinMiniProgramHost } from '../hosts/douyin.js';
import type { MiniProgramHost, MiniProgramRuntimeGlobal } from '../mini-program.interface.js';
import { prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import { createFakeDouyin } from './fake-douyin.js';

const FEASIBILITY_HINT =
  '判定依据见 requirements/stories/adapter/miniprogram-platform-feasibility.md 的「支付宝 `my` — supported（阶段 C 交付，依赖未文档化能力，Android 未验证）」一节';

const GETTER_KEY = '__aiaoAlipayRuntimeGlobal';

/** 一个独立 realm 的全局对象，删掉给定的全局后交出，连同 realm 自己的 `WebAssembly` 与原生 `BigInt`。 */
function bareRealm(...missing: ('BigInt' | 'queueMicrotask')[]) {
  const context = createContext();
  // createContext 交出的是沙箱壳，内置对象在 realm 内部的全局上
  const realm = runInContext('globalThis', context) as MiniProgramRuntimeGlobal & Record<string, unknown>;
  const webAssembly = realm.WebAssembly as unknown as AlipayStandardWasmApi;
  const nativeBigInt: unknown = realm.BigInt;
  realm.queueMicrotask = () => undefined;
  for (const name of missing) Reflect.deleteProperty(realm, name);
  return { realm, webAssembly, nativeBigInt };
}

function i64Stub(result: unknown): AlipayStandardWasmApi & { instantiate: ReturnType<typeof vi.fn> } {
  return { instantiate: vi.fn(async () => ({ instance: { exports: { f: () => result } } })) };
}

async function rejection(task: Promise<unknown>): Promise<unknown> {
  return task.then(
    () => {
      throw new Error('应当 reject');
    },
    (reason: unknown) => reason
  );
}

describe('discoverAlipayRuntimeGlobal', () => {
  it('环境里有 globalThis 时不插手，交给通用解析核对（iOS 真机形态）', () => {
    expect(discoverAlipayRuntimeGlobal({})).toBeUndefined();
  });

  it('没有 globalThis 时经 Object.prototype getter 取到真实全局对象，读完即删（模拟器形态）', () => {
    expect(discoverAlipayRuntimeGlobal(undefined)).toBe(globalThis);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, GETTER_KEY)).toBeUndefined();
  });

  it('自由变量查找抛错：以 object-prototype-global 缺失报错，getter 照样删掉', () => {
    const cause = new ReferenceError(`${GETTER_KEY} is not defined`);
    const error = (() => {
      try {
        discoverAlipayRuntimeGlobal(undefined, () => {
          throw cause;
        });
      } catch (thrown) {
        return thrown;
      }
      throw new Error('应当抛错');
    })();

    expect(error).toBeInstanceOf(AlipayUndocumentedCapabilityError);
    expect(error).toMatchObject({
      capability: 'object-prototype-global',
      message:
        `支付宝小程序缺少无文档能力 object-prototype-global：经 Object.prototype getter 读全局对象失败：` +
        `${GETTER_KEY} is not defined。${FEASIBILITY_HINT}`,
      cause
    });
    expect(Object.getOwnPropertyDescriptor(Object.prototype, GETTER_KEY)).toBeUndefined();
  });

  it('读到的不是当前 realm 的全局对象：报错，不拿它凑合', () => {
    expect(() => discoverAlipayRuntimeGlobal(undefined, () => createContext())).toThrow(
      '支付宝小程序缺少无文档能力 object-prototype-global：经 Object.prototype getter 读到的不是当前运行时的全局对象（object）'
    );
    expect(() => discoverAlipayRuntimeGlobal(undefined, () => undefined)).toThrow(
      '读到的不是当前运行时的全局对象（undefined）'
    );
  });
});

describe('prepareAlipayRuntimeGlobal', () => {
  it('缺 BigInt：经 wasm i64 返回值取回原生 BigInt，不可枚举地装上', async () => {
    const { realm, webAssembly, nativeBigInt } = bareRealm('BigInt');
    await prepareAlipayRuntimeGlobal(realm, webAssembly);

    expect(realm.BigInt).toBe(nativeBigInt);
    expect(Object.getOwnPropertyDescriptor(realm, 'BigInt')).toMatchObject({
      configurable: true,
      enumerable: false,
      writable: true
    });
  });

  it('缺 queueMicrotask：用目标自己的 Promise 排微任务，按入队顺序执行', async () => {
    const { realm, webAssembly } = bareRealm('queueMicrotask');
    await prepareAlipayRuntimeGlobal(realm, webAssembly);
    const order: number[] = [];
    realm.queueMicrotask(() => order.push(1));
    realm.queueMicrotask(() => order.push(2));

    expect(order).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([1, 2]);
    expect(Object.getOwnPropertyDescriptor(realm, 'queueMicrotask')?.enumerable).toBe(false);
  });

  it('两者都在时什么都不动，也不实例化 wasm', async () => {
    const { realm } = bareRealm();
    const before = { BigInt: realm.BigInt, queueMicrotask: realm.queueMicrotask };
    const webAssembly = i64Stub(7n);
    await prepareAlipayRuntimeGlobal(realm, webAssembly);

    expect({ BigInt: realm.BigInt, queueMicrotask: realm.queueMicrotask }).toEqual(before);
    expect(webAssembly.instantiate).not.toHaveBeenCalled();
  });

  it.each([
    ['undefined', undefined],
    ['没有 instantiate 的对象', {}]
  ])('逻辑层 WebAssembly 为 %s：以 logic-layer-webassembly 缺失报错', async (_label, webAssembly) => {
    const { realm } = bareRealm();

    await expect(
      prepareAlipayRuntimeGlobal(realm, webAssembly as unknown as AlipayStandardWasmApi)
    ).rejects.toMatchObject({
      name: 'AlipayUndocumentedCapabilityError',
      capability: 'logic-layer-webassembly',
      message: `支付宝小程序缺少无文档能力 logic-layer-webassembly：逻辑层没有标准 WebAssembly.instantiate。${FEASIBILITY_HINT}`
    });
  });

  it('i64 返回值不是 bigint：以 logic-layer-bigint 缺失报错，什么都不装', async () => {
    const { realm } = bareRealm('BigInt', 'queueMicrotask');

    await expect(prepareAlipayRuntimeGlobal(realm, i64Stub(7))).rejects.toMatchObject({
      capability: 'logic-layer-bigint',
      message: `支付宝小程序缺少无文档能力 logic-layer-bigint：wasm 的 i64 返回值是 number，不是 bigint。${FEASIBILITY_HINT}`
    });
    expect('BigInt' in realm).toBe(false);
    expect('queueMicrotask' in realm).toBe(false);
  });

  it('实例化 i64 模块失败：以 logic-layer-bigint 缺失报错，原始异常挂在 cause 上', async () => {
    const { realm } = bareRealm('BigInt');
    const cause = new Error('CompileError');
    const webAssembly: AlipayStandardWasmApi = { instantiate: () => Promise.reject(cause) };
    const error = await rejection(prepareAlipayRuntimeGlobal(realm, webAssembly));

    expect(error).toMatchObject({
      capability: 'logic-layer-bigint',
      message: expect.stringContaining('实例化 i64 模块失败：CompileError') as unknown,
      cause
    });
  });
});

describe('MiniProgramHost.prepareRuntime 钩子', () => {
  function hookedHost(prepareRuntime: (runtimeGlobal: MiniProgramRuntimeGlobal) => Promise<void>): MiniProgramHost {
    return {
      ...createWechatMiniProgramHost({ env: { USER_DATA_PATH: '/u' }, getFileSystemManager: () => undefined as never }),
      prepareRuntime,
      requestRandomValues: vi.fn(async (length: number) => new Uint8Array(length))
    };
  }

  it('解析出全局对象后调用一次，参数就是解析出的全局对象', async () => {
    const prepareRuntime = vi.fn(async () => undefined);
    await prepareMiniProgramHostRuntime(hookedHost(prepareRuntime));

    expect(prepareRuntime).toHaveBeenCalledTimes(1);
    expect(prepareRuntime).toHaveBeenCalledWith(globalThis);
  });

  it('在通用 polyfill 之前调用', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
    let seen: string | undefined;
    Reflect.deleteProperty(globalThis, 'structuredClone');
    try {
      await prepareMiniProgramHostRuntime(
        hookedHost(async runtimeGlobal => {
          seen = typeof runtimeGlobal.structuredClone;
        })
      );
      expect(seen).toBe('undefined');
      expect(typeof globalThis.structuredClone).toBe('function');
    } finally {
      if (original) Object.defineProperty(globalThis, 'structuredClone', original);
    }
  });

  it('钩子 reject 时引导失败，不申请随机数', async () => {
    const host = hookedHost(() => Promise.reject(new Error('repair failed')));

    await expect(prepareMiniProgramHostRuntime(host)).rejects.toThrow('repair failed');
    expect(host.requestRandomValues).not.toHaveBeenCalled();
  });

  it('未登记的平台在调用钩子之前就被拒绝', async () => {
    const prepareRuntime = vi.fn(async () => undefined);
    const host = { ...hookedHost(prepareRuntime), platform: 'jd' } as unknown as MiniProgramHost;

    await expect(prepareMiniProgramHostRuntime(host)).rejects.toThrow('未知小程序平台: jd');
    expect(prepareRuntime).not.toHaveBeenCalled();
  });

  it('微信与抖音宿主不实现钩子', () => {
    const wechat = createWechatMiniProgramHost({
      env: { USER_DATA_PATH: '/u' },
      getFileSystemManager: () => undefined as never
    });

    expect(wechat).not.toHaveProperty('prepareRuntime');
    expect(createDouyinMiniProgramHost(createFakeDouyin().tt)).not.toHaveProperty('prepareRuntime');
  });
});
