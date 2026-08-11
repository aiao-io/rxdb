import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities, checkMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { prepareMiniProgramRuntime } from '../runtime-polyfills.js';
import { textDecoderPolyfill, textEncoderPolyfill } from '../text-encoding-polyfills.js';

const fileSystem = {} as MiniProgramFileSystemManager;
const wechat: MiniProgramWechatApi = {
  env: { USER_DATA_PATH: '/data' },
  getFileSystemManager: () => fileSystem
};
const wasmRuntime = { instantiate: vi.fn() } as unknown as MiniProgramWasmRuntime;
const moduleFactory = vi.fn() as unknown as WaSqliteModuleFactory;

afterEach(() => vi.unstubAllGlobals());

describe('微信小程序运行时能力', () => {
  it('列出每一项硬依赖', () => {
    const capabilities = checkMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, wechat });
    expect(capabilities.map(item => item.name)).toEqual([
      'moduleFactory',
      'WXWebAssembly.instantiate',
      'wx.getFileSystemManager',
      'wx.env.USER_DATA_PATH',
      'BigInt',
      'crypto.getRandomValues',
      'structuredClone',
      'TextEncoder',
      'TextDecoder',
      'performance.now',
      'queueMicrotask'
    ]);
  });

  it('原生实现时五项可替换能力全部标记 native', () => {
    const capabilities = checkMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, wechat });

    expect(capabilities.filter(item => item.source).map(item => `${item.name}:${item.source}`)).toEqual([
      'crypto.getRandomValues:native',
      'structuredClone:native',
      'TextEncoder:native',
      'TextDecoder:native',
      'performance.now:native'
    ]);
    expect(capabilities.every(item => item.available)).toBe(true);
  });

  it('区分 wechat 随机源与 polyfill 文本编解码器', async () => {
    vi.stubGlobal('crypto', undefined);
    await prepareMiniProgramRuntime(
      {
        ...wechat,
        getRandomValues: options => options.success?.({ randomValues: new ArrayBuffer(options.length) })
      },
      { randomPoolSize: 16 }
    );
    vi.stubGlobal('TextEncoder', textEncoderPolyfill);
    vi.stubGlobal('TextDecoder', textDecoderPolyfill);

    const capabilities = checkMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, wechat });
    const sourceOf = (name: string) => capabilities.find(item => item.name === name)?.source;

    expect(sourceOf('crypto.getRandomValues')).toBe('wechat');
    expect(sourceOf('TextEncoder')).toBe('polyfill');
    expect(sourceOf('TextDecoder')).toBe('polyfill');
    expect(sourceOf('structuredClone')).toBe('native');
  });

  it('纯检查缺失能力，不修改全局对象', () => {
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('structuredClone', undefined);
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);
    vi.stubGlobal('performance', undefined);

    const capabilities = checkMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, wechat });
    expect(capabilities.find(item => item.name === 'structuredClone')?.available).toBe(false);
    expect(globalThis.structuredClone).toBeUndefined();

    expect(() => assertMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, wechat })).toThrow(
      'crypto.getRandomValues, structuredClone, TextEncoder, TextDecoder, performance.now'
    );
  });
});
