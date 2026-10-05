/**
 * US-211 阶段 C：可行性矩阵与平台表、拒绝表、改判标准逐项核对；判 `unsupported` 的平台在连接前被拒绝，错误带出矩阵里的阻断项与判定章节。
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
import { ALIPAY_UNDOCUMENTED_CAPABILITIES, AlipayUndocumentedCapabilityError } from '../hosts/alipay-capability.js';
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
  /** 维护者书面豁免的真机环境（门 3）；缺席为空。 */
  readonly waived: readonly string[];
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
        evidence: mapField(chunk, 'evidence'),
        waived: listField(chunk, 'waived') ?? []
      };
    });
}

const FEASIBILITY_ROWS = parseFeasibilityRows(FEASIBILITY_MARKDOWN);

function isFirstTier(row: FeasibilityRow): row is FirstTierRow {
  return row.tier === 'first';
}

const FIRST_TIER_ROWS = FEASIBILITY_ROWS.filter(isFirstTier);

/**
 * 改判标准门 3 推出的证据缺口：模拟器必须有；有未文档化依赖时 iOS 与 Android 都必须有（书面豁免的那台除外），
 * 否则至少一台真机。
 */
function evidenceGaps({ evidence, undocumented, waived }: FirstTierRow): string[] {
  const absent = EVIDENCE_ENVIRONMENTS.filter(env => evidence[env] === null);
  const absentDevices = absent.filter(env => env !== 'devtools' && !waived.includes(env));
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
      expect(
        row.blockers.filter(blocker => !MISSING_CAPABILITY_BLOCKERS.includes(blocker)),
        row.id
      ).toEqual([]);
    }
  });

  it('门 3：其余平台的判定与阻断项由证据推出', () => {
    for (const row of FIRST_TIER_ROWS.filter(candidate => !lacksCapability(candidate))) {
      const gaps = evidenceGaps(row);
      expect(row.decision, row.id).toBe(gaps.length === 0 ? 'supported' : 'unsupported');
      expect(row.blockers, row.id).toEqual(gaps);
    }
  });

  it('豁免只给有未文档化依赖的平台，只豁免一台还没有报告的真机，模拟器不能豁免', () => {
    for (const row of FIRST_TIER_ROWS.filter(candidate => candidate.waived.length > 0)) {
      expect(row.undocumented.length, row.id).toBeGreaterThan(0);
      expect(row.waived.length, row.id).toBe(1);
      expect(['ios', 'android'], row.id).toEqual(expect.arrayContaining([...row.waived]));
      expect(
        row.waived.map(env => row.evidence[env as EvidenceEnvironment]),
        row.id
      ).toEqual(row.waived.map(() => null));
    }
  });

  it('非第一档平台不写豁免', () => {
    for (const row of FEASIBILITY_ROWS.filter(candidate => !isFirstTier(candidate))) {
      expect(row.waived, row.id).toEqual([]);
    }
  });

  it('supported 平台没跑的真机逐个写进 caveats', () => {
    for (const row of FIRST_TIER_ROWS.filter(candidate => candidate.decision === 'supported')) {
      const absent = EVIDENCE_ENVIRONMENTS.filter(env => row.evidence[env] === null);
      expect(row.caveats, row.id).toEqual(expect.arrayContaining(absent.map(env => `${env}-unverified`)));
    }
  });
});

describe('支付宝 alipay（阶段 C：带豁免改判 supported）', () => {
  const row = FIRST_TIER_ROWS.find(candidate => candidate.id === 'alipay');

  it('矩阵判 supported：iOS 与开发者工具有报告，Android 书面豁免并记 caveat', () => {
    expect(row).toMatchObject({
      decision: 'supported',
      blockers: [],
      waived: ['android'],
      evidence: { devtools: 'aiao.us-211.alipay-probe/v7', ios: 'aiao.us-211.alipay-probe/v7', android: null }
    });
    expect(row?.caveats).toEqual(['android-unverified', 'quota-unobserved']);
  });

  it('支付宝宿主检测的无文档能力与矩阵 undocumented 逐项一致，报错指向的章节真实存在', () => {
    const message = new AlipayUndocumentedCapabilityError('logic-layer-bigint', '探测').message;
    const section = /「(.+)」一节$/.exec(message)?.[1];

    expect(row?.undocumented).toEqual([...ALIPAY_UNDOCUMENTED_CAPABILITIES]);
    expect(section).toMatch(/^支付宝 `my` — supported/);
    expect(FEASIBILITY_MARKDOWN).toContain(`\n### ${String(section)}\n`);
  });

  it('已登记、不在拒绝表里：平台判定与宿主路径都放行', () => {
    expect(MINI_PROGRAM_PLATFORM_IDS).toContain('alipay');
    expect(Object.hasOwn(MINI_PROGRAM_UNSUPPORTED_PLATFORMS, 'alipay')).toBe(false);
    expect(() => {
      assertMiniProgramPlatformId('alipay');
    }).not.toThrow();
    expect(resolveMiniProgramHost({ host: createHost('alipay') }).platform).toBe('alipay');
  });
});

describe('MiniProgramUnsupportedPlatformError', () => {
  const entry = Object.freeze({
    displayName: '某小程序',
    blockers: Object.freeze(['missing-wasm-entry']),
    reason: '找不到 WASM 入口',
    section: '某平台 — unsupported'
  });

  it('文案带出判定理由、阻断项、已知平台与矩阵章节，继承未知平台错误', () => {
    const error = new MiniProgramUnsupportedPlatformError('some', entry);

    expect(error).toBeInstanceOf(MiniProgramUnknownPlatformError);
    expect(error).toMatchObject({
      name: 'MiniProgramUnsupportedPlatformError',
      platform: 'some',
      blockers: ['missing-wasm-entry'],
      knownPlatforms: ['wechat', 'douyin', 'alipay']
    });
    expect(error.message).toBe(
      '某小程序（some）不支持：找不到 WASM 入口。阻断项: missing-wasm-entry；已知平台: wechat, douyin, alipay。' +
        '判定理由与复议条件见 requirements/stories/adapter/miniprogram-platform-feasibility.md 的「某平台 — unsupported」一节'
    );
  });

  it('拒绝表里的平台在预检、随机源准备、VFS 与建客户端时都在碰宿主能力之前拒绝', async () => {
    for (const id of Object.keys(MINI_PROGRAM_UNSUPPORTED_PLATFORMS)) {
      const host = createHost(id);
      expect(() => assertMiniProgramRuntimeCapabilities({ host, moduleFactory, wasmRuntime }), id).toThrow(
        MiniProgramUnsupportedPlatformError
      );
      await expect(prepareMiniProgramHostRuntime(host), id).rejects.toThrow(MiniProgramUnsupportedPlatformError);
      expect(() => createMiniProgramFileVFS({} as never, { host, databaseName: 'a.sqlite' }), id).toThrow(
        MiniProgramUnsupportedPlatformError
      );
      await expect(
        createWaSqliteMiniProgramClient(`${id}-db`, { host, moduleFactory, wasmRuntime }),
        id
      ).rejects.toThrow(MiniProgramUnsupportedPlatformError);
      expect(host.getFileSystemManager, id).not.toHaveBeenCalled();
      expect(host.requestRandomValues, id).not.toHaveBeenCalled();
    }
    expect(moduleFactory).not.toHaveBeenCalled();
  });
});

describe('assertMiniProgramPlatformId：造不出宿主时直接判定平台 id', () => {
  it('拒绝表里的平台抛的错与宿主路径逐字一致', () => {
    for (const [id, entry] of Object.entries(MINI_PROGRAM_UNSUPPORTED_PLATFORMS)) {
      const direct = caught(() => {
        assertMiniProgramPlatformId(id);
      });
      const viaHost = caught(() => resolveMiniProgramHost({ host: createHost(id) }));

      expect(direct, id).toBeInstanceOf(MiniProgramUnsupportedPlatformError);
      expect(direct, id).toMatchObject({ platform: id, blockers: entry.blockers });
      expect((direct as Error).message, id).toBe((viaHost as Error).message);
    }
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

  it('宿主没有 Object.hasOwn 也照样判定：iOS 15.4 之前的 JavaScriptCore 没有它', () => {
    const hasOwn = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
    if (!hasOwn) throw new Error('测试环境本身没有 Object.hasOwn');
    Reflect.deleteProperty(Object, 'hasOwn');
    const [alipay, swan] = ['alipay', 'swan'].map(value =>
      caught(() => {
        assertMiniProgramPlatformId(value);
      })
    );
    Object.defineProperty(Object, 'hasOwn', hasOwn);

    expect(alipay).toBeUndefined();
    expect(swan).toBeInstanceOf(MiniProgramUnknownPlatformError);
    expect(swan).not.toBeInstanceOf(MiniProgramUnsupportedPlatformError);
  });

  it('主入口与轻量 /runtime 入口导出的是同一个函数', async () => {
    const [main, runtime] = await Promise.all([import('../index.js'), import('../runtime.js')]);

    expect(assertMiniProgramPlatformId).toBeTypeOf('function');
    expect(main.assertMiniProgramPlatformId).toBe(assertMiniProgramPlatformId);
    expect(runtime.assertMiniProgramPlatformId).toBe(assertMiniProgramPlatformId);
  });
});
