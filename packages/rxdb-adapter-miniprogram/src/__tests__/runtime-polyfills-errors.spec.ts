import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramRandomValuesOptions,
  MiniProgramWechatApi
} from '../mini-program.interface.js';
import {
  MAX_MINI_PROGRAM_RANDOM_POOL_SIZE,
  fillMiniProgramRandomValues,
  getMiniProgramRuntimeSources,
  installMiniProgramRuntimePolyfills,
  prepareMiniProgramRuntime
} from '../runtime-polyfills.js';

const fileSystem = {} as MiniProgramFileSystemManager;

function createWechat(getRandomValues?: MiniProgramWechatApi['getRandomValues']): MiniProgramWechatApi {
  return {
    env: { USER_DATA_PATH: '/data' },
    getFileSystemManager: () => fileSystem,
    getRandomValues
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('randomPoolSize 校验', () => {
  it('拒绝非安全整数、非正数和超过上限的池大小', async () => {
    vi.stubGlobal('crypto', undefined);
    const wechat = createWechat(vi.fn());
    const message = `randomPoolSize 必须是 1-${MAX_MINI_PROGRAM_RANDOM_POOL_SIZE} 的安全整数`;

    await expect(prepareMiniProgramRuntime(wechat, { randomPoolSize: 0 })).rejects.toThrow(RangeError);
    await expect(prepareMiniProgramRuntime(wechat, { randomPoolSize: -1 })).rejects.toThrow(message);
    await expect(prepareMiniProgramRuntime(wechat, { randomPoolSize: 1.5 })).rejects.toThrow(message);
    await expect(
      prepareMiniProgramRuntime(wechat, { randomPoolSize: MAX_MINI_PROGRAM_RANDOM_POOL_SIZE + 1 })
    ).rejects.toThrow(message);
    expect(wechat.getRandomValues).not.toHaveBeenCalled();
  });

  it('缺省时按上限申请整池', async () => {
    vi.stubGlobal('crypto', undefined);
    const getRandomValues = vi.fn((options: MiniProgramRandomValuesOptions) => {
      options.success?.({ randomValues: new ArrayBuffer(options.length) });
    });

    await prepareMiniProgramRuntime(createWechat(getRandomValues));

    expect(getRandomValues).toHaveBeenCalledWith(
      expect.objectContaining({ length: MAX_MINI_PROGRAM_RANDOM_POOL_SIZE })
    );
  });
});

describe('wx.getRandomValues 失败处理', () => {
  it('返回长度与申请不符时拒绝引导', async () => {
    vi.stubGlobal('crypto', undefined);
    const getRandomValues = vi.fn((options: MiniProgramRandomValuesOptions) => {
      options.success?.({ randomValues: new ArrayBuffer(8) });
    });

    await expect(prepareMiniProgramRuntime(createWechat(getRandomValues), { randomPoolSize: 64 })).rejects.toThrow(
      'wx.getRandomValues 返回 8 bytes，期望 64 bytes'
    );
  });

  it('走 fail 回调时带出微信的 errMsg', async () => {
    vi.stubGlobal('crypto', undefined);
    const getRandomValues = vi.fn((options: MiniProgramRandomValuesOptions) => {
      options.fail?.({ errMsg: 'getRandomValues:fail auth denied' });
    });

    await expect(prepareMiniProgramRuntime(createWechat(getRandomValues), { randomPoolSize: 8 })).rejects.toThrow(
      'wx.getRandomValues 失败: getRandomValues:fail auth denied'
    );
  });

  it('同步抛 Error 时转成 fail 路径', async () => {
    vi.stubGlobal('crypto', undefined);
    const getRandomValues = vi.fn(() => {
      throw new Error('bridge unavailable');
    });

    await expect(prepareMiniProgramRuntime(createWechat(getRandomValues), { randomPoolSize: 8 })).rejects.toThrow(
      'wx.getRandomValues 失败: bridge unavailable'
    );
  });

  it('同步抛非 Error 值时按字符串化处理', async () => {
    vi.stubGlobal('crypto', undefined);
    const getRandomValues = vi.fn(() => {
      throw 'bridge exploded';
    });

    await expect(prepareMiniProgramRuntime(createWechat(getRandomValues), { randomPoolSize: 8 })).rejects.toThrow(
      'wx.getRandomValues 失败: bridge exploded'
    );
  });
});

describe('同步随机源', () => {
  it('拒绝非 ArrayBufferView 以及超过 Web Crypto 单次上限的请求', async () => {
    vi.stubGlobal('crypto', undefined);
    await prepareMiniProgramRuntime(
      createWechat(options => options.success?.({ randomValues: new ArrayBuffer(options.length) })),
      { randomPoolSize: 128 }
    );

    // 这里要的就是「传了个类型上不该传的东西」，`as unknown as` 把这层故意说清楚，
    // 又不像 `as any` 那样连后面 `.getRandomValues` 的返回值一起放弃检查
    const notAView = null as unknown as Uint8Array;

    expect(() => globalThis.crypto.getRandomValues(notAView)).toThrow('getRandomValues 需要 ArrayBufferView');
    expect(() => globalThis.crypto.getRandomValues(new Uint8Array(65_537))).toThrow(
      'getRandomValues 单次不能超过 65536 bytes'
    );
  });

  it('已有 crypto 对象但缺少 getRandomValues 时就地补齐', async () => {
    const existing = { subtle: 'kept' };
    vi.stubGlobal('crypto', existing);

    await prepareMiniProgramRuntime(
      createWechat(options => options.success?.({ randomValues: new ArrayBuffer(options.length) })),
      { randomPoolSize: 16 }
    );

    expect(globalThis.crypto).toBe(existing);
    expect(getMiniProgramRuntimeSources().random).toBe('wechat');
  });

  it('原生 crypto 可用时不向微信申请随机池', async () => {
    const getRandomValues = vi.fn();

    const sources = await prepareMiniProgramRuntime(createWechat(getRandomValues));

    expect(sources.random).toBe('native');
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('fillMiniProgramRandomValues 未引导时抛错，引导后原地填充并回传同一视图', async () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => fillMiniProgramRandomValues(new Uint8Array(4))).toThrow('微信小程序安全随机源尚未引导');

    const pool = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    await prepareMiniProgramRuntime(
      createWechat(options => options.success?.({ randomValues: pool.slice(0, options.length).buffer })),
      { randomPoolSize: 16 }
    );

    const target = new Uint8Array(4);
    expect(fillMiniProgramRandomValues(target)).toBe(target);
    expect([...target]).toEqual([1, 2, 3, 4]);
  });
});

describe('能力来源判定', () => {
  it('全部缺失时逐项报 missing', () => {
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('structuredClone', undefined);
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);
    vi.stubGlobal('performance', undefined);

    expect(getMiniProgramRuntimeSources()).toEqual({
      random: 'missing',
      structuredClone: 'missing',
      textEncoder: 'missing',
      textDecoder: 'missing',
      performanceNow: 'missing'
    });
  });

  it('原生能力齐全时不覆盖任何全局对象', () => {
    const before = {
      structuredClone: globalThis.structuredClone,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      now: globalThis.performance.now
    };

    installMiniProgramRuntimePolyfills();

    expect(globalThis.structuredClone).toBe(before.structuredClone);
    expect(globalThis.TextEncoder).toBe(before.TextEncoder);
    expect(globalThis.TextDecoder).toBe(before.TextDecoder);
    expect(globalThis.performance.now).toBe(before.now);
    expect(getMiniProgramRuntimeSources()).toEqual({
      random: 'native',
      structuredClone: 'native',
      textEncoder: 'native',
      textDecoder: 'native',
      performanceNow: 'native'
    });
  });

  it('已有 performance 对象但缺少 now 时就地补齐且单调不减', () => {
    const existing = { timeOrigin: 0 } as unknown as Performance;
    vi.stubGlobal('performance', existing);

    installMiniProgramRuntimePolyfills();

    expect(globalThis.performance).toBe(existing);
    expect(getMiniProgramRuntimeSources().performanceNow).toBe('polyfill');
    const first = performance.now();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(performance.now()).toBeGreaterThanOrEqual(first);
  });
});
