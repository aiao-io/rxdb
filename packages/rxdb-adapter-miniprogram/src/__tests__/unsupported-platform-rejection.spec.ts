/**
 * US-211 AC#17：拒绝表里的平台在连接前被拒绝，错误带出阻断项与判定章节。
 *
 * 真拒绝表现在是空的（支付宝改判 supported，百度 / QQ 没写 host），在它上面循环的用例一条断言都不执行。
 * 这里把整张表换成一个演示条目，逐条走直接判定、宿主路径、预检、随机源准备、VFS 与建客户端，
 * 证明带原因的拒绝路径确实生效；真表与可行性矩阵是否逐项一致，由 `unsupported-platform.spec.ts` 核对。
 */
import { describe, expect, it, vi } from 'vitest';
import { createWaSqliteMiniProgramClient } from '../create-client.js';
import {
  MiniProgramUnknownPlatformError,
  MiniProgramUnsupportedPlatformError,
  assertMiniProgramPlatformId,
  resolveMiniProgramHost
} from '../host.js';
import type { MiniProgramHost, MiniProgramWasmRuntime, WaSqliteModuleFactory } from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import { MINI_PROGRAM_UNSUPPORTED_PLATFORMS } from '../unsupported-platforms.js';
import { createMiniProgramFileVFS } from '../wechat-file-vfs.js';

vi.mock('../unsupported-platforms.js', () => ({
  MINI_PROGRAM_UNSUPPORTED_PLATFORMS: Object.freeze({
    demo: Object.freeze({
      displayName: '演示小程序',
      blockers: Object.freeze(['missing-wasm-entry', 'missing-sync-fs']),
      reason: '找不到 WASM 入口，也没有同步文件 API',
      section: '演示小程序 `demo` — unsupported'
    })
  })
}));

const DEMO = MINI_PROGRAM_UNSUPPORTED_PLATFORMS['demo'];

/** 宿主能力全是桩：被调用就说明拒绝来得太晚。 */
function createHost(platform: string): MiniProgramHost {
  return {
    platform: platform as MiniProgramHost['platform'],
    displayName: '测试小程序',
    shortName: '测试',
    wasmRuntimeName: 'FakeWebAssembly',
    capabilityNames: { fileSystem: 'fake.getFileSystemManager', userDataPath: 'fake.env.USER_DATA_PATH' },
    userDataPath: '/fake-user-data',
    getFileSystemManager: vi.fn(),
    requestRandomValues: vi.fn()
  };
}

const wasmRuntime = { instantiate: vi.fn() } as unknown as MiniProgramWasmRuntime;
const moduleFactory = vi.fn() as unknown as WaSqliteModuleFactory;

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('拒绝表里的平台（演示条目）', () => {
  it('直接判定抛带阻断项与章节的拒绝错误，与宿主路径逐字一致', () => {
    const direct = caught(() => {
      assertMiniProgramPlatformId('demo');
    });
    const viaHost = caught(() => resolveMiniProgramHost({ host: createHost('demo') }));

    expect(direct).toBeInstanceOf(MiniProgramUnsupportedPlatformError);
    expect(direct).toBeInstanceOf(MiniProgramUnknownPlatformError);
    expect(direct).toMatchObject({ platform: 'demo', blockers: DEMO.blockers });
    expect((direct as Error).message).toContain(DEMO.reason);
    expect((direct as Error).message).toContain(`「${DEMO.section}」`);
    expect((viaHost as Error).message).toBe((direct as Error).message);
  });

  it('预检、随机源准备、VFS 与建客户端都在碰宿主能力之前拒绝', async () => {
    const host = createHost('demo');

    expect(() => assertMiniProgramRuntimeCapabilities({ host, moduleFactory, wasmRuntime })).toThrow(
      MiniProgramUnsupportedPlatformError
    );
    await expect(prepareMiniProgramHostRuntime(host)).rejects.toThrow(MiniProgramUnsupportedPlatformError);
    expect(() => createMiniProgramFileVFS({} as never, { host, databaseName: 'a.sqlite' })).toThrow(
      MiniProgramUnsupportedPlatformError
    );
    await expect(createWaSqliteMiniProgramClient('demo-db', { host, moduleFactory, wasmRuntime })).rejects.toThrow(
      MiniProgramUnsupportedPlatformError
    );
    expect(host.getFileSystemManager).not.toHaveBeenCalled();
    expect(host.requestRandomValues).not.toHaveBeenCalled();
    expect(moduleFactory).not.toHaveBeenCalled();
  });
});
