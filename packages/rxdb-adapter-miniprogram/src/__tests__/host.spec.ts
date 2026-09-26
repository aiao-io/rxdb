import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MINI_PROGRAM_PLATFORM_IDS,
  MiniProgramUnknownPlatformError,
  createWechatMiniProgramHost,
  resolveMiniProgramHost
} from '../host.js';
import type {
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramWasmRuntime,
  MiniProgramWechatApi,
  WaSqliteEmscriptenModule,
  WaSqliteMiniProgramOptions,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities, checkMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { fillMiniProgramRandomValues, prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import { createMiniProgramFileVFS, createWechatFileVFS } from '../wechat-file-vfs.js';

class MemoryFileSystem implements MiniProgramFileSystemManager {
  readonly directories: string[] = [];

  accessSync(path: string): void {
    throw new Error(`ENOENT: ${path}`);
  }

  mkdirSync(path: string): void {
    this.directories.push(path);
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

const module = {} as WaSqliteEmscriptenModule;
const wasmRuntime = { instantiate: vi.fn() } as unknown as MiniProgramWasmRuntime;
const moduleFactory = vi.fn() as unknown as WaSqliteModuleFactory;

/** 平台 id 用已知值，其余全部换成非微信名字，证明调用方只读 host 字段。 */
function createFakeHost(overrides: Partial<MiniProgramHost> = {}): MiniProgramHost {
  const fileSystem = new MemoryFileSystem();
  return {
    platform: 'wechat',
    displayName: '测试小程序',
    shortName: '测试',
    wasmRuntimeName: 'FakeWebAssembly',
    capabilityNames: { fileSystem: 'fake.getFileSystemManager', userDataPath: 'fake.env.USER_DATA_PATH' },
    userDataPath: '/fake-user-data',
    getFileSystemManager: () => fileSystem,
    requestRandomValues: length => Promise.resolve(new Uint8Array(length).fill(7)),
    ...overrides
  };
}

function withRandomValues(respond: (length: number) => ArrayBuffer): MiniProgramWechatApi {
  const fileSystem = new MemoryFileSystem();
  return {
    env: { USER_DATA_PATH: '/wx-user-data' },
    getFileSystemManager: () => fileSystem,
    getRandomValues: options => options.success?.({ randomValues: respond(options.length) })
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('MiniProgramHost 平台 id', () => {
  it('阶段 A 只登记微信一个平台', () => {
    expect(MINI_PROGRAM_PLATFORM_IDS).toEqual(['wechat']);
  });

  it('未知平台 id 抛稳定错误，列出已知平台并指向可行性文件', () => {
    const host = createFakeHost({ platform: 'alipay' as MiniProgramHost['platform'] });

    const error = (() => {
      try {
        resolveMiniProgramHost({ host });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(MiniProgramUnknownPlatformError);
    expect((error as MiniProgramUnknownPlatformError).platform).toBe('alipay');
    expect((error as MiniProgramUnknownPlatformError).knownPlatforms).toEqual(['wechat']);
    expect((error as Error).message).toBe(
      '未知小程序平台: alipay；已知平台: wechat。' +
        '平台可行性结论见 requirements/stories/adapter/miniprogram-platform-feasibility.md'
    );
  });

  it('未知平台不回退到微信全局', () => {
    const wx = { getFileSystemManager: vi.fn(), env: { USER_DATA_PATH: '/global-wx' } };
    vi.stubGlobal('wx', wx);
    const host = createFakeHost({ platform: 'my' as MiniProgramHost['platform'] });

    expect(() => assertMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, host })).toThrow(
      MiniProgramUnknownPlatformError
    );
    expect(wx.getFileSystemManager).not.toHaveBeenCalled();
  });

  it('wechat 与 host 同时传入时拒绝，而不是挑一个用', () => {
    const options = { host: createFakeHost(), wechat: withRandomValues(length => new ArrayBuffer(length)) };

    expect(() => resolveMiniProgramHost(options as never)).toThrow('wechat 与 host 只能二选一');
  });

  it('wechat 与 host 都缺失时拒绝', () => {
    expect(() => resolveMiniProgramHost({} as never)).toThrow('必须提供 wechat 或 host 其中之一');
  });

  it('类型上 wechat 与 host 互斥', () => {
    const base = { moduleFactory, wasmRuntime };
    // @ts-expect-error 同时传 wechat 与 host 不是合法配置
    const both: WaSqliteMiniProgramOptions = {
      ...base,
      host: createFakeHost(),
      wechat: withRandomValues(() => new ArrayBuffer(0))
    };
    const hostOnly: WaSqliteMiniProgramOptions = { ...base, host: createFakeHost() };

    expect(both).toBeDefined();
    expect(hostOnly.host?.platform).toBe('wechat');
  });
});

describe('createWechatMiniProgramHost', () => {
  it('把 wx 适配成 host，字段与 US-209 文案一致', () => {
    const wechat = withRandomValues(length => new ArrayBuffer(length));
    const host = createWechatMiniProgramHost(wechat);

    expect(host.platform).toBe('wechat');
    expect(host.displayName).toBe('微信小程序');
    expect(host.shortName).toBe('微信');
    expect(host.wasmRuntimeName).toBe('WXWebAssembly');
    expect(host.capabilityNames).toEqual({
      fileSystem: 'wx.getFileSystemManager',
      userDataPath: 'wx.env.USER_DATA_PATH'
    });
    expect(host.userDataPath).toBe('/wx-user-data');
    expect(host.getFileSystemManager()).toBe(wechat.getFileSystemManager());
  });

  it('resolveMiniProgramHost({ wechat }) 等价于微信 host', () => {
    const wechat = withRandomValues(length => new ArrayBuffer(length));

    expect(resolveMiniProgramHost({ wechat })).toMatchObject({ platform: 'wechat', userDataPath: '/wx-user-data' });
  });

  it('随机源保持 wx.getRandomValues 的错误文案', async () => {
    const host = createWechatMiniProgramHost(withRandomValues(() => new ArrayBuffer(3)));

    await expect(host.requestRandomValues(8)).rejects.toThrow('wx.getRandomValues 返回 3 bytes，期望 8 bytes');
    await expect(
      createWechatMiniProgramHost({
        env: { USER_DATA_PATH: '/x' },
        getFileSystemManager: () => new MemoryFileSystem()
      }).requestRandomValues(8)
    ).rejects.toThrow('微信运行时缺少 wx.getRandomValues');
  });
});

describe('按 host 预检运行时能力', () => {
  it('能力名取自 host，而不是写死 wx', () => {
    const names = checkMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime, host: createFakeHost() }).map(
      item => item.name
    );

    expect(names.slice(0, 4)).toEqual([
      'moduleFactory',
      'FakeWebAssembly.instantiate',
      'fake.getFileSystemManager',
      'fake.env.USER_DATA_PATH'
    ]);
  });

  it('缺失能力的报错以 host 名称开头并列出全部缺失项', () => {
    const host = createFakeHost({ userDataPath: undefined, getFileSystemManager: () => undefined });

    expect(() =>
      assertMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime: {} as MiniProgramWasmRuntime, host })
    ).toThrow(
      '测试小程序运行时缺少 RxDB 必需能力: FakeWebAssembly.instantiate, fake.getFileSystemManager, fake.env.USER_DATA_PATH'
    );
  });
});

describe('prepareMiniProgramHostRuntime', () => {
  it('用 host 随机源引导同步随机池，来源标记为平台 id', async () => {
    vi.stubGlobal('crypto', undefined);
    const requestRandomValues = vi.fn((length: number) => Promise.resolve(new Uint8Array(length).fill(9)));

    const sources = await prepareMiniProgramHostRuntime(createFakeHost({ requestRandomValues }), {
      randomPoolSize: 16
    });

    expect(requestRandomValues).toHaveBeenCalledWith(16);
    expect(sources.random).toBe('wechat');
    expect(Array.from(fillMiniProgramRandomValues(new Uint8Array(4)))).toEqual([9, 9, 9, 9]);
  });

  it('随机池耗尽时报 host 名称，不降级到 Math.random', async () => {
    vi.stubGlobal('crypto', undefined);
    const requestRandomValues = vi
      .fn<(length: number) => Promise<Uint8Array>>()
      .mockResolvedValueOnce(new Uint8Array(4))
      .mockRejectedValue(new Error('补给失败'));
    const mathRandom = vi.spyOn(Math, 'random');

    await prepareMiniProgramHostRuntime(createFakeHost({ requestRandomValues }), { randomPoolSize: 4 });
    fillMiniProgramRandomValues(new Uint8Array(4));
    await Promise.resolve();

    expect(() => fillMiniProgramRandomValues(new Uint8Array(1))).toThrow(
      '测试小程序安全随机池已耗尽，请重新引导运行时'
    );
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('未知平台在申请随机数之前就失败', async () => {
    vi.stubGlobal('crypto', undefined);
    const requestRandomValues = vi.fn();
    const host = createFakeHost({ platform: 'tt' as MiniProgramHost['platform'], requestRandomValues });

    await expect(prepareMiniProgramHostRuntime(host)).rejects.toBeInstanceOf(MiniProgramUnknownPlatformError);
    expect(requestRandomValues).not.toHaveBeenCalled();
  });

  it('host 首池长度不符时拒绝引导', async () => {
    vi.stubGlobal('crypto', undefined);
    const host = createFakeHost({ requestRandomValues: () => Promise.resolve(new Uint8Array(3)) });

    await expect(prepareMiniProgramHostRuntime(host, { randomPoolSize: 8 })).rejects.toThrow(
      '测试小程序随机源返回 3 bytes，期望 8 bytes'
    );
  });

  it('host 补池长度不符时不采纳，耗尽后把原因挂在 cause 上', async () => {
    vi.stubGlobal('crypto', undefined);
    const requestRandomValues = vi
      .fn<(length: number) => Promise<Uint8Array>>()
      .mockResolvedValueOnce(new Uint8Array(4))
      .mockResolvedValue(new Uint8Array(1));

    await prepareMiniProgramHostRuntime(createFakeHost({ requestRandomValues }), { randomPoolSize: 4 });
    fillMiniProgramRandomValues(new Uint8Array(4));
    await vi.waitFor(() => expect(requestRandomValues).toHaveBeenCalledTimes(2));
    await Promise.resolve();

    let thrown: unknown;
    try {
      fillMiniProgramRandomValues(new Uint8Array(1));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe('测试小程序安全随机池已耗尽，请重新引导运行时');
    expect((thrown as Error).cause).toMatchObject({ message: '测试小程序随机源返回 1 bytes，期望 4 bytes' });
  });
});

describe('createMiniProgramFileVFS', () => {
  it('默认目录与 VFS 名称取自 host', () => {
    const handle = createMiniProgramFileVFS(module, { host: createFakeHost(), databaseName: 'defaults.sqlite' });

    expect(handle.root).toBe('/fake-user-data/rxdb-wa-sqlite');
    expect(handle.vfs.name).toBe('wechat-file');
    handle.vfs.close();
  });

  it('同一数据库第二个连接被拒绝，文案带 host 名称', () => {
    const host = createFakeHost();
    const first = createMiniProgramFileVFS(module, { host, databaseName: 'single.sqlite' });

    expect(() => createMiniProgramFileVFS(module, { host, databaseName: 'single.sqlite' })).toThrow(
      '测试文件 VFS 不支持同一数据库的并发连接: /fake-user-data/rxdb-wa-sqlite/rxdb-single.sqlite'
    );
    first.vfs.close();
  });

  it('微信封装与通用 VFS 共享同一张单连接表', () => {
    const wechat = withRandomValues(length => new ArrayBuffer(length));
    const first = createWechatFileVFS(module, { databaseName: 'shared.sqlite', wechat });

    expect(() =>
      createMiniProgramFileVFS(module, { host: createWechatMiniProgramHost(wechat), databaseName: 'shared.sqlite' })
    ).toThrow('微信文件 VFS 不支持同一数据库的并发连接');
    first.vfs.close();
  });

  it('host 缺少用户目录且未指定 root 时拒绝，而不是拼出 undefined 路径', () => {
    const host = createFakeHost({ userDataPath: undefined });

    expect(() => createMiniProgramFileVFS(module, { host, databaseName: 'no-root.sqlite' })).toThrow(
      '测试小程序缺少 fake.env.USER_DATA_PATH，无法推导数据库目录'
    );
  });

  it('host 缺少同步文件系统时拒绝', () => {
    const host = createFakeHost({ getFileSystemManager: () => undefined });

    expect(() => createMiniProgramFileVFS(module, { host, databaseName: 'no-fs.sqlite' })).toThrow(
      '测试小程序缺少 fake.getFileSystemManager'
    );
  });
});
