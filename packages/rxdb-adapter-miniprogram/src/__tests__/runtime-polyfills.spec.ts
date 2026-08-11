import { uuid } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MiniProgramFileSystemManager, MiniProgramWechatApi } from '../mini-program.interface.js';
import {
  getMiniProgramRuntimeSources,
  installMiniProgramRuntimePolyfills,
  prepareMiniProgramRuntime
} from '../runtime-polyfills.js';

interface RandomValuesOption {
  readonly length: number;
  readonly success?: (result: { readonly randomValues: ArrayBuffer; readonly errMsg: string }) => void;
  readonly fail?: (error: { readonly errMsg: string }) => void;
}

const fileSystem = {} as MiniProgramFileSystemManager;

function createWechat(randomValues: Uint8Array): MiniProgramWechatApi {
  return {
    env: { USER_DATA_PATH: '/data' },
    getFileSystemManager: () => fileSystem,
    getRandomValues: vi.fn((options: RandomValuesOption) => {
      options.success?.({ randomValues: randomValues.slice(0, options.length).buffer, errMsg: 'getRandomValues:ok' });
    })
  } as MiniProgramWechatApi;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('微信小程序运行时引导', () => {
  it('用微信能力补齐同步随机源、克隆、文本编解码和性能计时', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.stubGlobal('structuredClone', undefined);
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);
    vi.stubGlobal('performance', undefined);
    const randomValues = Uint8Array.from({ length: 64 }, (_, index) => index);
    const wechat = createWechat(randomValues);

    await prepareMiniProgramRuntime(wechat, { randomPoolSize: randomValues.length });

    expect(wechat.getRandomValues).toHaveBeenCalledWith(expect.objectContaining({ length: randomValues.length }));
    expect(getMiniProgramRuntimeSources()).toEqual({
      random: 'wechat',
      structuredClone: 'polyfill',
      textEncoder: 'polyfill',
      textDecoder: 'polyfill',
      performanceNow: 'polyfill'
    });
    const output = new Uint8Array(4);
    expect(globalThis.crypto.getRandomValues(output)).toBe(output);
    expect([...output]).toEqual([0, 1, 2, 3]);

    const source = {
      bigint: 1n,
      bytes: new Uint8Array([1, 2]),
      date: new Date('2026-08-09T00:00:00.000Z'),
      map: new Map([['key', 1]]),
      set: new Set(['value'])
    };
    const cloned = globalThis.structuredClone(source);
    expect(cloned).toEqual(source);
    expect(cloned.bytes).not.toBe(source.bytes);

    const bytes = new TextEncoder().encode('A中😀');
    expect([...bytes]).toEqual([65, 228, 184, 173, 240, 159, 152, 128]);
    expect(new TextDecoder().decode(bytes)).toBe('A中😀');
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xff]))).toThrow('无效的 UTF-8');
    expect(performance.now()).toBeGreaterThanOrEqual(0);
  });

  it('随机池耗尽时立即失败', async () => {
    vi.stubGlobal('crypto', undefined);
    await prepareMiniProgramRuntime(createWechat(new Uint8Array(4)), { randomPoolSize: 4 });
    expect(() => globalThis.crypto.getRandomValues(new Uint8Array(5))).toThrow('安全随机池已耗尽');
  });

  it('支持 wa-sqlite 使用的 UTF-16LE 解码', () => {
    vi.stubGlobal('TextDecoder', undefined);
    installMiniProgramRuntimePolyfills();

    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x2d, 0x4e, 0x3d, 0xd8, 0x00, 0xde]);
    expect(new TextDecoder('utf-16le').decode(bytes)).toBe('A中😀');
    expect(new TextDecoder('utf-16le', { ignoreBOM: true }).decode(bytes)).toBe('\ufeffA中😀');
    expect(new TextDecoder('utf-16le').decode(new Uint8Array([0x41]))).toBe('\ufffd');
    expect(() => new TextDecoder('utf-16le', { fatal: true }).decode(new Uint8Array([0x41]))).toThrow(
      '无效的 UTF-16LE'
    );
  });

  it('同一毫秒生成 UUID v7 时不依赖 Math.random', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(1_786_214_400_000);
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0);
    await prepareMiniProgramRuntime(createWechat(new Uint8Array(64)), { randomPoolSize: 64 });

    expect(uuid()).not.toBe(uuid());
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('无原生 crypto 时必须提供 wx.getRandomValues', async () => {
    vi.stubGlobal('crypto', undefined);
    const wechat = {
      env: { USER_DATA_PATH: '/data' },
      getFileSystemManager: () => fileSystem
    } as MiniProgramWechatApi;
    await expect(prepareMiniProgramRuntime(wechat)).rejects.toThrow('wx.getRandomValues');
  });
});
