/**
 * US-211：抖音页面模块里 `globalThis` 是 `undefined`，`global` 是不带内置对象的空壳，
 * 只有非严格函数的 `this` 才是真实全局对象。adapter 是严格模式 ESM，自己拿不到，
 * 必须由调用方经 `host.runtimeGlobal` 注入；所有补丁与能力读取都走解析出的全局对象。
 */
import { createContext, runInContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramRuntimeGlobal,
  MiniProgramWasmRuntime,
  WaSqliteEmscriptenModule,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';
import { checkMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { resolveMiniProgramRuntimeGlobal, selectMiniProgramRuntimeGlobal } from '../runtime-global.js';
import {
  fillMiniProgramRandomValues,
  getMiniProgramRuntimeSources,
  installMiniProgramRuntimePolyfills,
  prepareMiniProgramHostRuntime
} from '../runtime-polyfills.js';
import { createMiniProgramFileVFS } from '../wechat-file-vfs.js';

const INJECTION_HINT = '请经 host.runtimeGlobal 注入';

class EmptyFileSystem implements MiniProgramFileSystemManager {
  accessSync(path: string): void {
    throw new Error(`ENOENT: ${path}`);
  }
  mkdirSync(): void {
    return undefined;
  }
  readFileSync(path: string): string {
    throw new Error(`ENOENT: ${path}`);
  }
  unlinkSync(): void {
    return undefined;
  }
  writeFileSync(): void {
    return undefined;
  }
}

/**
 * 只带本 realm `Object` 的替身全局对象：通过 realm 判据，却与 Node 的全局对象互不相干，
 * 用来证明读写落在注入对象上而不是环境里的 `globalThis`。
 */
function createInjectedGlobal(extra: Record<string, unknown> = {}): MiniProgramRuntimeGlobal {
  return { Object, ...extra } as unknown as MiniProgramRuntimeGlobal;
}

function createFakeHost(overrides: Partial<MiniProgramHost> = {}): MiniProgramHost {
  const fileSystem = new EmptyFileSystem();
  return {
    platform: 'wechat',
    displayName: '测试小程序',
    shortName: '测试',
    wasmRuntimeName: 'FakeWebAssembly',
    capabilityNames: { fileSystem: 'fake.getFileSystemManager', userDataPath: 'fake.env.USER_DATA_PATH' },
    userDataPath: '/fake-user-data',
    getFileSystemManager: () => fileSystem,
    requestRandomValues: length => Promise.resolve(Uint8Array.from({ length }, (_, index) => index)),
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('selectMiniProgramRuntimeGlobal', () => {
  it('没有注入时用环境里的真实 globalThis', () => {
    expect(selectMiniProgramRuntimeGlobal('测试小程序', undefined, globalThis)).toBe(globalThis);
  });

  it('注入的对象优先于环境', () => {
    const injected = createInjectedGlobal();
    expect(selectMiniProgramRuntimeGlobal('测试小程序', injected, globalThis)).toBe(injected);
  });

  it('globalThis 为 undefined 且没有注入时抛稳定错误，指向 host.runtimeGlobal', () => {
    expect(() => selectMiniProgramRuntimeGlobal('测试小程序', undefined, undefined)).toThrow(
      `测试小程序拿不到真实全局对象（globalThis 为 undefined），${INJECTION_HINT}`
    );
  });

  it('globalThis 是不带内置对象的空壳时同样拒绝，不拿空壳凑数', () => {
    expect(() => selectMiniProgramRuntimeGlobal('测试小程序', undefined, {})).toThrow(
      `测试小程序拿不到真实全局对象（globalThis 不是当前运行时的全局对象），${INJECTION_HINT}`
    );
  });

  it.each([
    ['空壳对象', {}],
    ['别的 realm 的全局对象', runInContext('this', createContext({})) as object],
    ['Object 不是函数', { Object: {} }],
    ['null', null]
  ])('注入%s时抛 TypeError，即使环境里的 globalThis 可用', (_label, injected) => {
    expect(() =>
      selectMiniProgramRuntimeGlobal('测试小程序', injected as MiniProgramRuntimeGlobal, globalThis)
    ).toThrow(new TypeError('测试小程序的 host.runtimeGlobal 不是当前运行时的全局对象'));
  });
});

describe('resolveMiniProgramRuntimeGlobal', () => {
  it('按 host 解析：有注入用注入，没有用环境', () => {
    const injected = createInjectedGlobal();
    expect(resolveMiniProgramRuntimeGlobal(createFakeHost({ runtimeGlobal: injected }))).toBe(injected);
    expect(resolveMiniProgramRuntimeGlobal(createFakeHost())).toBe(globalThis);
  });
});

describe('补丁与能力读取走注入的全局对象', () => {
  it('引导把全部补丁装到注入对象上，环境里的 globalThis 不动', async () => {
    const injected = createInjectedGlobal();
    const ambientCrypto = globalThis.crypto;

    const sources = await prepareMiniProgramHostRuntime(createFakeHost({ runtimeGlobal: injected }), {
      randomPoolSize: 16
    });

    const expected = {
      random: 'wechat',
      structuredClone: 'polyfill',
      textEncoder: 'polyfill',
      textDecoder: 'polyfill',
      performanceNow: 'polyfill'
    };
    expect(sources).toEqual(expected);
    expect(getMiniProgramRuntimeSources(injected)).toEqual(expected);
    expect(globalThis.crypto).toBe(ambientCrypto);
    expect(getMiniProgramRuntimeSources().random).toBe('native');
    expect(new injected.TextDecoder().decode(new injected.TextEncoder().encode('中'))).toBe('中');
  });

  it('fillMiniProgramRandomValues 从注入对象的随机源取数', async () => {
    const injected = createInjectedGlobal();
    await prepareMiniProgramHostRuntime(createFakeHost({ runtimeGlobal: injected }), { randomPoolSize: 16 });

    expect([...fillMiniProgramRandomValues(new Uint8Array(3), injected)]).toEqual([0, 1, 2]);
  });

  it('installMiniProgramRuntimePolyfills 只补注入对象', () => {
    const injected = createInjectedGlobal();
    installMiniProgramRuntimePolyfills(injected);

    expect(typeof injected.structuredClone).toBe('function');
    expect(typeof injected.performance.now).toBe('function');
  });

  it('公开函数显式传入空壳时拒绝，不往空壳上装补丁', () => {
    const shell = {} as MiniProgramRuntimeGlobal;
    const message = '小程序运行时的 host.runtimeGlobal 不是当前运行时的全局对象';
    expect(() => getMiniProgramRuntimeSources(shell)).toThrow(message);
    expect(() => installMiniProgramRuntimePolyfills(shell)).toThrow(message);
    expect(() => fillMiniProgramRandomValues(new Uint8Array(1), shell)).toThrow(message);
    expect(shell).toEqual({});
  });

  it('能力预检的 BigInt / queueMicrotask 读注入对象', () => {
    const check = (runtimeGlobal: MiniProgramRuntimeGlobal) =>
      checkMiniProgramRuntimeCapabilities({
        moduleFactory: vi.fn() as unknown as WaSqliteModuleFactory,
        wasmRuntime: { instantiate: vi.fn() } as unknown as MiniProgramWasmRuntime,
        host: createFakeHost({ runtimeGlobal })
      });
    const bare = check(createInjectedGlobal());
    const full = check(createInjectedGlobal({ BigInt, queueMicrotask }));

    const availability = (list: typeof bare, name: string) => list.find(item => item.name === name)?.available;
    expect(availability(bare, 'BigInt')).toBe(false);
    expect(availability(bare, 'queueMicrotask')).toBe(false);
    expect(availability(full, 'BigInt')).toBe(true);
    expect(availability(full, 'queueMicrotask')).toBe(true);
  });

  it('文件 VFS 的 xRandomness 读注入对象的随机源', async () => {
    const getRandomValues = vi.fn((target: Uint8Array) => target.fill(9));
    const injected = createInjectedGlobal({ crypto: { getRandomValues } });
    const module = { HEAPU8: new Uint8Array(64) } as unknown as WaSqliteEmscriptenModule;
    const handle = createMiniProgramFileVFS(module, {
      databaseName: 'runtime-global.sqlite',
      host: createFakeHost({ runtimeGlobal: injected })
    });
    const vfs = handle.vfs as typeof handle.vfs & {
      xRandomness(pVfs: number, length: number, output: number): number;
    };

    try {
      expect(vfs.xRandomness(0, 2, 8)).toBe(2);
      expect([...module.HEAPU8.subarray(8, 10)]).toEqual([9, 9]);
      expect(getRandomValues).toHaveBeenCalledOnce();
    } finally {
      await handle.vfs.close();
    }
  });
});
