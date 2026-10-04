import {
  createFakeAlipay,
  FAKE_USER_DATA_PATH,
  fakeWasmFingerprints,
  wasmBytes,
  type FakeAlipayOptions
} from './__tests__/fake-alipay.js';
import { FRAME_HEADER } from './alipay-fs.js';
import type { ProbeCore } from './core-contract.js';
import type { QuotaAccountingPlan } from './experiments/quota-accounting.js';
import { buildFindings } from './findings.js';
import { PROBE_REPORT_SCHEMA, runProbe, type ProbeReport } from './run-probe.js';

const MIB = 1024 * 1024;
const PROBE_ROOT = `${FAKE_USER_DATA_PATH}/aiao-alipay-probe`;

/** 小限额 + 小 blob：几十毫秒内就能撞到配额，形态与文档的「单个 10M、文件夹 50M」一致。 */
const SMALL_LIMITS = { fileLimitBytes: MIB, folderLimitBytes: 3 * MIB } satisfies FakeAlipayOptions;
const SMALL_PLAN = { blobBytes: 256 * 1024, maxRows: 40 };
const SMALL_ACCOUNTING: QuotaAccountingPlan = {
  stepBytes: MIB / 2,
  maxSingleBytes: 2 * MIB,
  // 留出裸 FS 实验那几个小文件的余量：4 个写得进，第 5 个撞文件夹上限
  fillFileBytes: 700 * 1024,
  maxFillFiles: 8
};

const loadRealCore = async (): Promise<ProbeCore> => import('./core.js');
const skipCore = () => Promise.reject(new Error('跳过'));

async function run(
  options: FakeAlipayOptions,
  loadCore: () => Promise<ProbeCore> = loadRealCore,
  quotaPlan = SMALL_PLAN
): Promise<{ report: ProbeReport; fake: ReturnType<typeof createFakeAlipay> }> {
  const fake = createFakeAlipay(options);
  const report = await runProbe({
    my: fake.my,
    wasm: fake.wasm,
    wasmFingerprints: fakeWasmFingerprints,
    loadCore,
    freeGlobals: { my: 'object', MYWebAssembly: 'undefined', WebAssembly: 'object' },
    quotaPlan,
    quotaAccountingPlan: SMALL_ACCOUNTING,
    workerTimeoutMs: 2000
  });
  return { report, fake };
}

function finding(report: ProbeReport, row: string) {
  return report.findings.find(item => item.matrixRow === row);
}

function leftovers(fake: ReturnType<typeof createFakeAlipay>): string[] {
  return [...fake.files.keys(), ...fake.directories].filter(path => path.startsWith(PROBE_ROOT));
}

describe('runProbe：iOS 形态下全部实验跑通', () => {
  let report: ProbeReport;
  let fake: ReturnType<typeof createFakeAlipay>;

  beforeAll(async () => {
    ({ report, fake } = await run({ ...SMALL_LIMITS, mode: 'ios' }));
  }, 60_000);

  it('报告自带 schema 与说明，写明借用 wechat 平台 id 与 Worker 随机源', () => {
    expect(report.schema).toBe(PROBE_REPORT_SCHEMA);
    const notes = report.notes.join('\n');
    expect(notes).toContain('wechat');
    expect(notes).toContain('Worker');
    expect(notes).toContain('host.runtimeGlobal');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('环境：记录 SDK 版本、用户目录与 canIUse', () => {
    expect(report.environment.sdkVersion).toBe('2.10.42');
    expect(report.environment.userDataPath).toBe(FAKE_USER_DATA_PATH);
    expect(report.environment.canIUse['createWorker']).toMatchObject({ ok: true, value: true });
    expect(report.environment.freeGlobals).toMatchObject({ my: 'object' });
    expect(report.environment.residue).toBe(false);
  });

  it('Worker：MYWebAssembly 按绝对路径实例化 add.wasm，crypto 可取随机数', () => {
    expect(report.worker).toMatchObject({
      ok: true,
      value: {
        MYWebAssembly: { ok: true, value: { path: '/wasm/add.wasm', addResult: 5 } },
        cryptoGetRandomValues: { ok: true, value: { length: 16 } }
      }
    });
  });

  it('运行时补丁：源码级跑在 Node 全局上，BigInt / queueMicrotask 都在，什么都不补', () => {
    expect(report.runtimeRepairs).toEqual({
      ok: true,
      ms: expect.any(Number),
      value: { target: 'globalThis', before: { BigInt: 'function', queueMicrotask: 'function' }, installed: [] }
    });
  });

  it('随机源：逻辑层没有 my.getRandomValues，Worker 取 64 KiB 与 1 MiB 都成功', () => {
    expect(report.random.logic.myGetRandomValues).toBe('undefined');
    expect(report.random.worker).toMatchObject({
      '65536': { ok: true, value: { byteLength: 65_536, allZero: false } },
      '1048576': { ok: true, value: { byteLength: 1_048_576 } }
    });
    expect(report.prepare).toMatchObject({ ok: true });
  });

  it('WASM：逻辑层标准 WebAssembly 实例化 add.wasm，代码包按相对路径可读', () => {
    expect(report.wasm.standardAvailable).toBe(true);
    expect(report.wasm.add).toMatchObject({ ok: true, value: 5 });
    expect(report.wasm.codePackageReads['wasm/add.wasm']).toMatchObject({ ok: true });
    const bytes = wasmBytes.byteLength;
    expect(report.wasm.codePackageBinary).toMatchObject({
      ok: true,
      value: { binaryBytes: bytes, expectedBytes: bytes, bytesMatch: true }
    });
  });

  it('WASM：真机代码包没有文本副本，二进制读与构建指纹一致，adapter 的 wasm 直接读 .wasm 原文件', () => {
    expect(report.wasm.sources).toEqual({
      'wasm/add.wasm': expect.objectContaining({ ok: true, value: 'binary' }),
      'wa-sqlite/wa-sqlite.wasm': expect.objectContaining({ ok: true, value: 'binary' })
    });
    expect(finding(report, 'WASM')).toMatchObject({
      verdict: 'pass',
      evidence: expect.stringContaining('字节来源：代码包里的 .wasm 原文件')
    });
    expect(finding(report, 'WASM')?.evidence).toContain('与构建指纹一致');
  });

  it('裸 FS：只有 base64 串两端字节一致', () => {
    expect(report.rawFs.writeModes.base64String.bytesMatch).toBe(true);
    expect(report.rawFs.writeModes.arrayBuffer.bytesMatch).toBe(true);
    expect(report.rawFs.writeModes.typedArray.bytesMatch).toBe(false);
  });

  it('裸 FS：空写入成功，写到不存在的父目录返回 10022', () => {
    expect(report.rawFs.emptyWrite).toMatchObject({ ok: true, value: { success: true } });
    expect(report.rawFs.missingParentWrite).toMatchObject({ ok: true, value: { error: 10022 } });
    expect(finding(report, '同步 FS')?.evidence).toContain('裸写空串成功、写到不存在的父目录返回 error 10022');
  });

  it('包装层 + 分帧层 FS：全部探测符合 adapter VFS 的预期', () => {
    expect(report.fileSystem.probes.every(item => item.asExpected)).toBe(true);
  });

  it('配额计费：单文件与文件夹上限都探到，兄弟目录写不进', () => {
    expect(report.quotaAccounting.largestSingleWriteBytes).toBe(MIB);
    expect(report.quotaAccounting.fill).toMatchObject({ filesWritten: 4, scope: 'ancestor-or-user-dir' });
    expect(finding(report, '用户目录')?.evidence).toContain('单文件最多写入 1 MiB');
  });

  it('持久化：关闭重开后原样读回，库按 64 KiB 分块落盘', () => {
    expect(report.coreLoad).toMatchObject({ ok: true });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.persistence).toMatchObject({ status: 'passed', integrity: 'ok', wasmPath: 'wa-sqlite/wa-sqlite.wasm' });
    expect(core.persistence.reopenedRows).toEqual(core.persistence.writtenRows);
    expect(core.persistence.files?.some(file => file.path.endsWith('.sqlite.0') && file.size > 0)).toBe(true);
  });

  it('配额：撞到 10028 后报 SQLITE_FULL 并带平台原文，重开库仍完整', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota.status).toBe('triggered');
    expect(core.quota.afterFailure?.reopenCount).toMatchObject({ ok: true, value: core.quota.insertedRows });
    expect(core.quota.afterFailure?.reopenIntegrity).toMatchObject({ ok: true, value: 'ok' });
    expect(finding(report, '用户目录')?.evidence).toContain('SQLITE_FULL，平台原文「');
  });

  it('收尾：实验目录删干净，Worker 已 terminate', () => {
    expect(report.cleanup).toMatchObject({ ok: true });
    expect(leftovers(fake)).toEqual([]);
    expect(fake.liveWorkers()).toBe(0);
  });

  it('findings 按矩阵行全部 pass', () => {
    expect(report.findings.map(item => item.matrixRow)).toEqual(['WASM', '同步 FS', '随机源', '用户目录', '持久化']);
    expect(report.findings.filter(item => item.verdict !== 'pass')).toEqual([]);
  });
});

/**
 * 模拟器实测形态（v3b，2026-10-03）：空写入一律 error 2、父目录自动建出、单文件按 base64 串长计费。
 * 裸 FS 照实记下前两条；交给 adapter 与 FS 探测的都是分帧层（`frameUserFiles`），空文件也落得了盘。
 * 逻辑层没有 realm / BigInt / queueMicrotask 那一半由 dist-smoke 用真实构建产物验。
 */
describe('runProbe：模拟器形态下经分帧层建库', () => {
  let report: ProbeReport;
  let fake: ReturnType<typeof createFakeAlipay>;
  let persistedChunk: Uint8Array | undefined;

  beforeAll(async () => {
    const fakeForRun = createFakeAlipay({ ...SMALL_LIMITS, mode: 'simulator' });
    // 收尾会删掉整个实验目录，落盘形态只能在写的当下抓
    const raw = fakeForRun.my.getFileSystemManager();
    const writeFileSync = raw.writeFileSync.bind(raw);
    raw.writeFileSync = (path, data, encoding) => {
      const result = writeFileSync(path, data, encoding);
      if (path.endsWith('rxdb-persistence.sqlite.0')) persistedChunk = fakeForRun.files.get(path);
      return result;
    };
    fake = fakeForRun;
    report = await runProbe({
      my: fake.my,
      wasm: fake.wasm,
      wasmFingerprints: fakeWasmFingerprints,
      loadCore: loadRealCore,
      freeGlobals: { my: 'object', MYWebAssembly: 'undefined', WebAssembly: 'object' },
      quotaPlan: SMALL_PLAN,
      quotaAccountingPlan: SMALL_ACCOUNTING,
      workerTimeoutMs: 2000
    });
  }, 60_000);

  it('WASM：代码包二进制读被改写成 UTF-8 文本，adapter 的 wasm 改从 base64 文本副本读', () => {
    expect(report.wasm.codePackageBinary).toMatchObject({
      ok: true,
      value: { expectedBytes: wasmBytes.byteLength, bytesMatch: false }
    });
    expect(report.wasm.sources['wa-sqlite/wa-sqlite.wasm']).toMatchObject({ ok: true, value: 'textCopy' });
    expect(finding(report, 'WASM')).toMatchObject({
      verdict: 'pass',
      evidence: expect.stringContaining('字节来源：代码包里的 base64 文本副本')
    });
    expect(finding(report, 'WASM')?.evidence).toContain('二进制读取被改写');
  });

  it('裸 FS：空写入报 error 2，写到不存在的父目录照样成功', () => {
    expect(report.rawFs.emptyWrite).toMatchObject({ ok: true, value: { error: 2 } });
    expect(report.rawFs.missingParentWrite).toMatchObject({ ok: true, value: { success: true } });
  });

  it('包装层 + 分帧层 FS：空写入也落得了盘，全部探测符合 adapter VFS 的预期', () => {
    expect(report.fileSystem.probes.filter(item => !item.asExpected)).toEqual([]);
    expect(report.fileSystem.probes.find(item => item.op === 'writeFileSync(空 ArrayBuffer)')).toMatchObject({
      outcome: { ok: true, value: { base64: '' } }
    });
  });

  it('配额计费：单文件按 base64 串长算，1 MiB 限额下只写得进 0.5 MiB；填充文件随之缩小，照样撞到文件夹上限', () => {
    expect(report.quotaAccounting.largestSingleWriteBytes).toBe(MIB / 2);
    expect(report.quotaAccounting.fill).toMatchObject({ fileBytes: MIB / 2, scope: 'ancestor-or-user-dir' });
  });

  it('持久化：经分帧层建库、关闭重开原样读回；落盘的块以分帧头开头，报告里的大小是逻辑字节', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.persistence).toMatchObject({ status: 'passed', integrity: 'ok' });
    expect(persistedChunk?.[0]).toBe(FRAME_HEADER);
    const chunk = core.persistence.files?.find(file => file.path.endsWith('.sqlite.0'));
    expect(chunk?.size).toBe((persistedChunk?.byteLength ?? 0) - 1);
  });

  it('配额：撞到 10028 后报 SQLITE_FULL 并带平台原文，重开库仍完整', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota.status).toBe('triggered');
    expect(core.quota.afterFailure?.reopenCount).toMatchObject({ ok: true, value: core.quota.insertedRows });
    expect(core.quota.afterFailure?.reopenIntegrity).toMatchObject({ ok: true, value: 'ok' });
  });

  it('findings：经实验 host 全部 pass，同步 FS 的证据里照实记着裸 FS 的两处平台差异', () => {
    expect(report.findings.map(item => [item.matrixRow, item.verdict])).toEqual([
      ['WASM', 'pass'],
      ['同步 FS', 'pass'],
      ['随机源', 'pass'],
      ['用户目录', 'pass'],
      ['持久化', 'pass']
    ]);
    expect(finding(report, '同步 FS')?.evidence).toContain('裸写空串返回 error 2');
    expect(finding(report, '同步 FS')?.evidence).toContain('写到不存在的父目录成功');
  });

  it('收尾：实验目录删干净，Worker 已 terminate', () => {
    expect(report.cleanup).toMatchObject({ ok: true });
    expect(leftovers(fake)).toEqual([]);
    expect(fake.liveWorkers()).toBe(0);
  });
});

describe('runProbe：失败与边界', () => {
  it('核心包加载失败：持久化 unknown，其余实验照跑，目录照删', async () => {
    const { report, fake } = await run(SMALL_LIMITS, () => Promise.reject(new RangeError('模块顶层出错')));
    expect(report.coreLoad).toMatchObject({ ok: false, error: { name: 'RangeError' } });
    expect(report.core).toEqual({ skipped: expect.stringContaining('模块顶层出错') });
    expect(finding(report, '持久化')).toMatchObject({ verdict: 'unknown' });
    expect(finding(report, '同步 FS')).toMatchObject({ verdict: 'pass' });
    expect(leftovers(fake)).toEqual([]);
    expect(fake.liveWorkers()).toBe(0);
  }, 60_000);

  it('构建包装挂了 initError：报原始错误，不调用半成品导出', async () => {
    const real = await loadRealCore();
    const runCoreExperiments = vi.fn(real.runCoreExperiments);
    const halfInitialized: ProbeCore = { ...real, runCoreExperiments, initError: new RangeError('模块顶层出错') };
    const { report } = await run(SMALL_LIMITS, async () => halfInitialized);
    expect(report.core).toEqual({ skipped: expect.stringContaining('模块顶层出错') });
    expect(runCoreExperiments).not.toHaveBeenCalled();
  }, 60_000);

  it('半成品导出（banner 记录为 undefined）：判加载失败', async () => {
    const real = await loadRealCore();
    const runCoreExperiments = vi.fn(real.runCoreExperiments);
    const halfInitialized = { realmProbe: undefined, runCoreExperiments } as unknown as ProbeCore;
    const { report } = await run(SMALL_LIMITS, async () => halfInitialized);
    expect(report.core).toEqual({ skipped: expect.stringContaining('半成品导出') });
    expect(runCoreExperiments).not.toHaveBeenCalled();
  }, 60_000);

  it('上次异常退出留下的实验目录：先删掉再跑', async () => {
    const fake = createFakeAlipay(SMALL_LIMITS);
    fake.directories.add(PROBE_ROOT);
    fake.files.set(`${PROBE_ROOT}/stale.bin`, new Uint8Array(4));
    const report = await runProbe({
      my: fake.my,
      wasm: fake.wasm,
      wasmFingerprints: fakeWasmFingerprints,
      loadCore: skipCore,
      freeGlobals: {}
    });
    expect(report.workspace).toMatchObject({ ok: true, value: { root: PROBE_ROOT, removedLeftover: true } });
    expect(leftovers(fake)).toEqual([]);
  }, 60_000);

  it('配额没撞到、写得不够 30 MiB：如实写「未触发」，判 unknown', async () => {
    const { report } = await run({}, loadRealCore, { blobBytes: 1024, maxRows: 3 });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota).toMatchObject({ status: 'not-triggered', insertedRows: 3 });
    const userData = finding(report, '用户目录');
    expect(userData).toMatchObject({ verdict: 'unknown', evidence: expect.stringContaining('未触发') });
    expect(userData).not.toHaveProperty('caveat');
  }, 60_000);

  it('配额没撞到、经 SQLite 写满 30 MiB：按改判标准门 2 判 pass，记 caveat quota-unobserved', async () => {
    const { report } = await run({}, loadRealCore, { blobBytes: 1024, maxRows: 3 });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    // 真跑 30 MiB 要近一分钟；判定只看写入计划与已提交行数，换成写满 30 MiB 的记录即可
    const quota = { ...core.quota, plan: { blobBytes: MIB, maxRows: 30 }, insertedRows: 30 };
    const findings = buildFindings({ ...report, core: { ...core, quota } });
    expect(findings.find(item => item.matrixRow === '用户目录')).toMatchObject({
      verdict: 'pass',
      caveat: 'quota-unobserved',
      evidence: expect.stringContaining('写入 30 MiB 未触发配额')
    });
    const short = buildFindings({ ...report, core: { ...core, quota: { ...quota, insertedRows: 29 } } });
    expect(short.find(item => item.matrixRow === '用户目录')).toMatchObject({ verdict: 'unknown' });
  }, 60_000);

  it('iOS 真机调试实测单文件不设上限：超限写入写得进也符合 VFS 预期，同步 FS 照样 pass', async () => {
    const { report } = await run({ mode: 'ios', fileLimitBytes: Number.POSITIVE_INFINITY }, skipCore);
    expect(report.fileSystem.probes.filter(item => !item.asExpected)).toEqual([]);
    expect(finding(report, '同步 FS')).toMatchObject({ verdict: 'pass' });
    expect(finding(report, '用户目录')?.evidence).toContain('裸写 11 MiB 成功');
  }, 60_000);

  it('构建没记指纹：选源失败，adapter 打不开库，WASM 判 fail，不拿没校验的字节去实例化', async () => {
    const fake = createFakeAlipay(SMALL_LIMITS);
    const report = await runProbe({
      my: fake.my,
      wasm: fake.wasm,
      wasmFingerprints: {},
      loadCore: loadRealCore,
      freeGlobals: {},
      quotaPlan: SMALL_PLAN,
      quotaAccountingPlan: SMALL_ACCOUNTING,
      workerTimeoutMs: 2000
    });
    expect(report.wasm.sources['wa-sqlite/wa-sqlite.wasm']).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('记指纹') }
    });
    expect(report.wasm.codePackageBinary).toMatchObject({ ok: false });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.persistence).toMatchObject({ status: 'failed' });
    expect(finding(report, 'WASM')).toMatchObject({ verdict: 'fail' });
  }, 60_000);

  it('逻辑层没有 WebAssembly：跳过核心实验，WASM 判 fail', async () => {
    const { report } = await run({ ...SMALL_LIMITS, withoutLogicWasm: true });
    expect(report.wasm.standardAvailable).toBe(false);
    expect(report.core).toEqual({ skipped: expect.stringContaining('WebAssembly') });
    expect(finding(report, 'WASM')).toMatchObject({ verdict: 'fail' });
  }, 60_000);

  it('没有 my.createWorker：Worker 与随机源跳过，随机源判 fail', async () => {
    const { report, fake } = await run({ ...SMALL_LIMITS, withoutWorker: true }, skipCore);
    expect(report.worker).toEqual({ skipped: expect.stringContaining('createWorker') });
    expect(report.random.worker).toHaveProperty('skipped');
    expect(finding(report, '随机源')).toMatchObject({ verdict: 'fail' });
    expect(fake.liveWorkers()).toBe(0);
  }, 60_000);

  it('Worker 里没有 crypto：随机源判 fail，并留下 Worker 的原始错误', async () => {
    const { report } = await run({ ...SMALL_LIMITS, withoutWorkerCrypto: true }, skipCore);
    expect(report.worker).toMatchObject({
      ok: true,
      value: { cryptoGetRandomValues: { skipped: expect.any(String) } }
    });
    expect(report.random.worker).toMatchObject({
      '65536': { ok: false, error: { message: expect.stringContaining('crypto') } }
    });
    expect(finding(report, '随机源')).toMatchObject({ verdict: 'fail' });
  }, 60_000);

  it('Worker 不回消息：探测超时后丢弃 Worker，后续实验不再等它', async () => {
    const fake = createFakeAlipay(SMALL_LIMITS);
    const terminate = vi.fn();
    const silent = { postMessage: vi.fn(), onMessage: vi.fn(), terminate };
    const my = { ...fake.my, createWorker: () => silent };
    const report = await runProbe({
      my,
      wasm: fake.wasm,
      wasmFingerprints: fakeWasmFingerprints,
      loadCore: skipCore,
      freeGlobals: {},
      workerTimeoutMs: 50
    });
    expect(report.worker).toMatchObject({ ok: false, error: { message: expect.stringContaining('没有回调') } });
    expect(report.random.worker).toHaveProperty('skipped');
    expect(silent.postMessage).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalled();
  }, 60_000);

  it('USER_DATA_PATH 缺失：没有可写目录，整个实验抛错，Worker 照样 terminate', async () => {
    const fake = createFakeAlipay(SMALL_LIMITS);
    const my = { ...fake.my, env: {} };
    await expect(
      runProbe({ my, wasm: fake.wasm, wasmFingerprints: fakeWasmFingerprints, loadCore: skipCore, freeGlobals: {} })
    ).rejects.toThrow('USER_DATA_PATH');
    expect(fake.liveWorkers()).toBe(0);
  }, 60_000);
});
