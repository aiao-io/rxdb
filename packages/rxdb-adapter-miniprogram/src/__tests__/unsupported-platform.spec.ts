/**
 * US-211 阶段 C：可行性矩阵判 `unsupported` 的平台在连接前被拒绝，错误带出矩阵里的阻断项与判定章节。
 *
 * 拒绝表与矩阵的 YAML 结论逐项核对：矩阵改判而代码没跟（或反过来），这里先红。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- requirements/ 不是 Nx 项目，是拒绝表的契约原文，越过包边界读的正是它
import FEASIBILITY_MARKDOWN from '../../../../requirements/stories/adapter/miniprogram-platform-feasibility.md?raw';
import { createWaSqliteMiniProgramClient } from '../create-client.js';
import {
  MINI_PROGRAM_PLATFORM_IDS,
  MINI_PROGRAM_UNSUPPORTED_PLATFORMS,
  MiniProgramUnknownPlatformError,
  MiniProgramUnsupportedPlatformError,
  resolveMiniProgramHost
} from '../host.js';
import type {
  MiniProgramFileSystemManager,
  MiniProgramHost,
  MiniProgramWasmRuntime,
  WaSqliteModuleFactory
} from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import { createMiniProgramFileVFS } from '../wechat-file-vfs.js';

/** 矩阵 YAML 里与拒绝表相关的三个字段。 */
interface FeasibilityRow {
  readonly id: string;
  readonly tier: string;
  readonly decision: string;
  readonly blockers: readonly string[];
}

/**
 * 解析矩阵「机器可读结论」代码块。只认文件里实际用到的两种 blockers 写法（行内 `[a, b]` 与逐行 `- a`），
 * 格式一变就解析失败而不是静默少读。
 */
function parseFeasibilityRows(markdown: string): FeasibilityRow[] {
  const block = /```yaml\n([\s\S]*?)```/.exec(markdown)?.[1];
  if (!block) throw new Error('可行性矩阵缺少 yaml 代码块');
  return block
    .split(/^ {2}- id: /m)
    .slice(1)
    .map(chunk => {
      const field = (name: string): string => {
        const value = new RegExp(`^ {4}${name}: (.+)$`, 'm').exec(chunk)?.[1];
        if (value === undefined) throw new Error(`矩阵行缺少 ${name}: ${chunk}`);
        return value.trim();
      };
      const inline = /^ {4}blockers: \[(.*)\]$/m.exec(chunk)?.[1];
      const listed = /^ {4}blockers:\n((?: {6}- .+\n?)+)/m.exec(chunk)?.[1];
      const blockers =
        inline !== undefined ?
          inline
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        : (listed?.match(/(?<=- ).+/g) ?? []).map(item => item.trim());
      return { id: chunk.split('\n', 1)[0].trim(), tier: field('tier'), decision: field('decision'), blockers };
    });
}

const FEASIBILITY_ROWS = parseFeasibilityRows(FEASIBILITY_MARKDOWN);

class MemoryFileSystem implements MiniProgramFileSystemManager {
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

/** 能力齐全、只有平台 id 不同的宿主：拒绝只能来自平台 id 本身。 */
function createHost(platform: string): MiniProgramHost {
  const fileSystem = new MemoryFileSystem();
  return {
    platform: platform as MiniProgramHost['platform'],
    displayName: '测试小程序',
    shortName: '测试',
    wasmRuntimeName: 'FakeWebAssembly',
    capabilityNames: { fileSystem: 'fake.getFileSystemManager', userDataPath: 'fake.env.USER_DATA_PATH' },
    userDataPath: '/fake-user-data',
    getFileSystemManager: vi.fn(() => fileSystem),
    requestRandomValues: vi.fn((length: number) => Promise.resolve(new Uint8Array(length)))
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('可行性矩阵 ↔ 平台表', () => {
  it('解析出矩阵的全部九行', () => {
    expect(FEASIBILITY_ROWS.map(row => row.id)).toEqual([
      'wechat',
      'alipay',
      'douyin',
      'baidu',
      'qq',
      'jd',
      'kuaishou',
      'xiaohongshu',
      'wecom'
    ]);
  });

  it('登记的平台恰好是矩阵里 supported 的平台', () => {
    const supported = FEASIBILITY_ROWS.filter(row => row.decision === 'supported').map(row => row.id);

    expect([...MINI_PROGRAM_PLATFORM_IDS].sort()).toEqual(supported.sort());
  });

  it('拒绝表里每个平台在矩阵中都是 unsupported，阻断项逐项一致', () => {
    const entries = Object.entries(MINI_PROGRAM_UNSUPPORTED_PLATFORMS);

    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      const row = FEASIBILITY_ROWS.find(candidate => candidate.id === id);
      expect(row, id).toMatchObject({ decision: 'unsupported', blockers: entry.blockers });
    }
  });

  it('拒绝表指向的章节在矩阵里真实存在', () => {
    for (const [id, entry] of Object.entries(MINI_PROGRAM_UNSUPPORTED_PLATFORMS)) {
      expect(FEASIBILITY_MARKDOWN, id).toContain(`\n### ${entry.section}\n`);
    }
  });

  it('观察档（unknown）平台不进拒绝表，也不登记：按未知平台拒绝（AC#19）', () => {
    const observation = FEASIBILITY_ROWS.filter(row => row.tier === 'observation');

    expect(observation.map(row => row.decision)).toEqual(observation.map(() => 'unknown'));
    for (const { id } of observation) {
      expect(Object.hasOwn(MINI_PROGRAM_UNSUPPORTED_PLATFORMS, id), id).toBe(false);
      const error = caught(() => resolveMiniProgramHost({ host: createHost(id) }));
      expect(error, id).toBeInstanceOf(MiniProgramUnknownPlatformError);
      expect(error, id).not.toBeInstanceOf(MiniProgramUnsupportedPlatformError);
    }
  });

  it('拒绝表冻结到条目一层，JS 调用方改不动阻断项', () => {
    expect(Object.isFrozen(MINI_PROGRAM_UNSUPPORTED_PLATFORMS)).toBe(true);
    for (const entry of Object.values(MINI_PROGRAM_UNSUPPORTED_PLATFORMS)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.blockers)).toBe(true);
    }
  });
});

describe('支付宝 alipay（AC#17）', () => {
  it('抛 MiniProgramUnsupportedPlatformError，带出矩阵阻断项与判定章节', () => {
    const error = caught(() => resolveMiniProgramHost({ host: createHost('alipay') }));

    expect(error).toBeInstanceOf(MiniProgramUnsupportedPlatformError);
    // 阶段 C 之前 alipay 抛的是未知平台错误；子类保证已有的 instanceof 判断不失效
    expect(error).toBeInstanceOf(MiniProgramUnknownPlatformError);
    const unsupported = error as MiniProgramUnsupportedPlatformError;
    expect(unsupported.name).toBe('MiniProgramUnsupportedPlatformError');
    expect(unsupported.platform).toBe('alipay');
    expect(unsupported.knownPlatforms).toEqual(['wechat', 'douyin']);
    expect(unsupported.blockers).toEqual(['wasm-worker-only', 'no-documented-secure-random']);
    expect(unsupported.message).toBe(
      '支付宝小程序（alipay）不支持：MYWebAssembly 只能在 Worker 线程使用，与 wa-sqlite 在逻辑层单 realm 同步运行的设计冲突；' +
        '也没有文档化的安全随机 API。阻断项: wasm-worker-only, no-documented-secure-random；已知平台: wechat, douyin。' +
        '判定理由与复议条件见 requirements/stories/adapter/miniprogram-platform-feasibility.md 的「支付宝 `my` — unsupported」一节'
    );
  });

  it('运行时预检、随机源准备与 VFS 都在碰宿主能力之前拒绝', async () => {
    const host = createHost('alipay');

    expect(() => assertMiniProgramRuntimeCapabilities({ host, moduleFactory, wasmRuntime })).toThrow(
      MiniProgramUnsupportedPlatformError
    );
    await expect(prepareMiniProgramHostRuntime(host)).rejects.toThrow(MiniProgramUnsupportedPlatformError);
    expect(() => createMiniProgramFileVFS({} as never, { host, databaseName: 'a.sqlite' })).toThrow(
      MiniProgramUnsupportedPlatformError
    );
    expect(host.getFileSystemManager).not.toHaveBeenCalled();
    expect(host.requestRandomValues).not.toHaveBeenCalled();
  });

  it('连接前失败：不加载 wasm，也不读微信全局', async () => {
    const wx = { getFileSystemManager: vi.fn(), env: { USER_DATA_PATH: '/global-wx' } };
    vi.stubGlobal('wx', wx);
    const host = createHost('alipay');

    await expect(createWaSqliteMiniProgramClient('alipay-db', { host, moduleFactory, wasmRuntime })).rejects.toThrow(
      MiniProgramUnsupportedPlatformError
    );
    expect(moduleFactory).not.toHaveBeenCalled();
    expect(wasmRuntime.instantiate).not.toHaveBeenCalled();
    expect(host.getFileSystemManager).not.toHaveBeenCalled();
    expect(wx.getFileSystemManager).not.toHaveBeenCalled();
  });
});
