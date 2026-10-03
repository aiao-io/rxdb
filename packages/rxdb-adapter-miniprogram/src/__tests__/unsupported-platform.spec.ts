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
  assertMiniProgramPlatformId,
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

/** 改判标准门 3 的三个运行环境。 */
const EVIDENCE_ENVIRONMENTS = ['devtools', 'ios', 'android'] as const;

/** 运行环境名。 */
type EvidenceEnvironment = (typeof EVIDENCE_ENVIRONMENTS)[number];

/** 改判标准门 1：缺硬依赖时的阻断项。 */
const MISSING_CAPABILITY_BLOCKERS = ['missing-wasm-entry', 'missing-sync-fs', 'missing-secure-random'];

/** 矩阵 YAML 里与拒绝表、改判标准相关的字段。 */
interface FeasibilityRow {
  readonly id: string;
  readonly tier: string;
  readonly decision: string;
  readonly blockers: readonly string[];
  readonly caveats: readonly string[];
  /** 正式 host 依赖的未文档化行为；只有第一档有。 */
  readonly undocumented?: readonly string[];
  /** 每个环境合格报告的 schema，`null` 为没有；只有第一档有。 */
  readonly evidence?: Readonly<Record<string, string | null>>;
}

/** 第一档平台：改判标准管的那些行。 */
interface FirstTierRow extends FeasibilityRow {
  readonly undocumented: readonly string[];
  readonly evidence: Readonly<Record<EvidenceEnvironment, string | null>>;
}

/** 列表字段，只认文件里实际用到的两种写法：行内 `[a, b]` 与逐行 `- a`。字段缺席为 `undefined`。 */
function listField(chunk: string, name: string): string[] | undefined {
  const inline = new RegExp(`^ {4}${name}: \\[(.*)\\]$`, 'm').exec(chunk)?.[1];
  if (inline !== undefined) {
    return inline
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  const listed = new RegExp(`^ {4}${name}:\\n((?: {6}- .+\\n?)+)`, 'm').exec(chunk)?.[1];
  return listed?.match(/(?<=- ).+/g)?.map(item => item.trim());
}

/** 逐行 `key: value` 的映射字段，`null` 读成 `null`。字段缺席为 `undefined`。 */
function mapField(chunk: string, name: string): Record<string, string | null> | undefined {
  const body = new RegExp(`^ {4}${name}:\\n((?: {6}[\\w-]+: .+\\n?)+)`, 'm').exec(chunk)?.[1];
  if (body === undefined) return undefined;
  const entries = [...body.matchAll(/^ {6}([\w-]+): (.+)$/gm)].map(([, key, value]) => {
    const trimmed = value.trim();
    return [key, trimmed === 'null' ? null : trimmed] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * 解析矩阵「机器可读结论」代码块。格式一变就解析失败而不是静默少读。
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
      return {
        id: chunk.split('\n', 1)[0].trim(),
        tier: field('tier'),
        decision: field('decision'),
        blockers: listField(chunk, 'blockers') ?? [],
        caveats: listField(chunk, 'caveats') ?? [],
        undocumented: listField(chunk, 'undocumented'),
        evidence: mapField(chunk, 'evidence')
      };
    });
}

const FEASIBILITY_ROWS = parseFeasibilityRows(FEASIBILITY_MARKDOWN);

function isFirstTier(row: FeasibilityRow): row is FirstTierRow {
  return row.tier === 'first';
}

const FIRST_TIER_ROWS = FEASIBILITY_ROWS.filter(isFirstTier);

/**
 * 改判标准门 3 推出的证据缺口：模拟器必须有；有未文档化依赖时 iOS 与 Android 都必须有，否则至少一台真机。
 */
function evidenceGaps({ evidence, undocumented }: FirstTierRow): string[] {
  const absent = EVIDENCE_ENVIRONMENTS.filter(env => evidence[env] === null);
  const absentDevices = absent.filter(env => env !== 'devtools');
  const deviceGaps = undocumented.length > 0 || absentDevices.length === 2 ? absentDevices : [];
  const gaps = absent.includes('devtools') ? ['devtools', ...deviceGaps] : deviceGaps;
  return gaps.map(env => `${env}-unverified`);
}

function lacksCapability(row: FeasibilityRow): boolean {
  return row.blockers.some(blocker => MISSING_CAPABILITY_BLOCKERS.includes(blocker));
}

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

describe('可行性矩阵 ↔ 改判标准', () => {
  it('第一档每行都写了未文档化依赖与三个环境的证据', () => {
    expect(FIRST_TIER_ROWS.map(row => row.id)).toEqual(['alipay', 'douyin', 'baidu', 'qq']);
    for (const row of FIRST_TIER_ROWS) {
      expect(row.undocumented, row.id).toBeInstanceOf(Array);
      expect(Object.keys(row.evidence ?? {}), row.id).toEqual([...EVIDENCE_ENVIRONMENTS]);
    }
  });

  it('门 1：缺硬依赖的平台判 unsupported，阻断项只写缺的能力', () => {
    const lacking = FIRST_TIER_ROWS.filter(lacksCapability);

    expect(lacking.map(row => row.id)).toEqual(['baidu', 'qq']);
    for (const row of lacking) {
      expect(row.decision, row.id).toBe('unsupported');
      expect(row.blockers.filter(blocker => !MISSING_CAPABILITY_BLOCKERS.includes(blocker)), row.id).toEqual([]);
    }
  });

  it('门 3：其余平台的判定与阻断项由证据推出', () => {
    for (const row of FIRST_TIER_ROWS.filter(candidate => !lacksCapability(candidate))) {
      const gaps = evidenceGaps(row);
      expect(row.decision, row.id).toBe(gaps.length === 0 ? 'supported' : 'unsupported');
      expect(row.blockers, row.id).toEqual(gaps);
    }
  });

  it('supported 平台没跑的真机逐个写进 caveats', () => {
    for (const row of FIRST_TIER_ROWS.filter(candidate => candidate.decision === 'supported')) {
      const absent = EVIDENCE_ENVIRONMENTS.filter(env => row.evidence[env] === null);
      expect(row.caveats, row.id).toEqual(expect.arrayContaining(absent.map(env => `${env}-unverified`)));
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
    expect(unsupported.blockers).toEqual(['devtools-unverified', 'ios-unverified', 'android-unverified']);
    expect(unsupported.message).toBe(
      '支付宝小程序（alipay）不支持：逻辑层的 WebAssembly 与安全随机源都没有文档承诺，' +
        '要由正式 host 在开发者工具、iOS 与 Android 非调试真机上全部跑通，目前三端都没有合格报告。' +
        '阻断项: devtools-unverified, ios-unverified, android-unverified；已知平台: wechat, douyin。' +
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

describe('assertMiniProgramPlatformId：造不出宿主时直接判定平台 id', () => {
  it('支付宝抛的错与宿主路径逐字一致', () => {
    const direct = caught(() => {
      assertMiniProgramPlatformId('alipay');
    });
    const viaHost = caught(() => resolveMiniProgramHost({ host: createHost('alipay') }));

    expect(direct).toBeInstanceOf(MiniProgramUnsupportedPlatformError);
    expect(direct).toMatchObject({ platform: 'alipay', blockers: ['devtools-unverified', 'ios-unverified', 'android-unverified'] });
    expect((direct as Error).message).toBe((viaHost as Error).message);
  });

  it('已登记的平台 id 放行', () => {
    for (const id of MINI_PROGRAM_PLATFORM_IDS) {
      expect(() => {
        assertMiniProgramPlatformId(id);
      }, id).not.toThrow();
    }
  });

  it('其余值按未知平台拒绝，原型链上的键不算拒绝表条目', () => {
    for (const value of ['swan', 'weapp', 'constructor', '__proto__', 'toString', undefined, 42]) {
      const error = caught(() => {
        assertMiniProgramPlatformId(value);
      });
      expect(error, String(value)).toBeInstanceOf(MiniProgramUnknownPlatformError);
      expect(error, String(value)).not.toBeInstanceOf(MiniProgramUnsupportedPlatformError);
    }
  });

  it('主入口与轻量 /runtime 入口导出的是同一个函数', async () => {
    const [main, runtime] = await Promise.all([import('../index.js'), import('../runtime.js')]);

    expect(assertMiniProgramPlatformId).toBeTypeOf('function');
    expect(main.assertMiniProgramPlatformId).toBe(assertMiniProgramPlatformId);
    expect(runtime.assertMiniProgramPlatformId).toBe(assertMiniProgramPlatformId);
  });
});
