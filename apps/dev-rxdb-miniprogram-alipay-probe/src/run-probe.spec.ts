import { createFakeAlipay, FAKE_USER_DATA_PATH, type FakeAlipayOptions } from './__tests__/fake-alipay.js';
import type { ProbeCore } from './core-contract.js';
import type { QuotaAccountingPlan } from './experiments/quota-accounting.js';
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
  });

  it('裸 FS：只有 base64 串两端字节一致', () => {
    expect(report.rawFs.writeModes.base64String.bytesMatch).toBe(true);
    expect(report.rawFs.writeModes.arrayBuffer.bytesMatch).toBe(true);
    expect(report.rawFs.writeModes.typedArray.bytesMatch).toBe(false);
  });

  it('包装层 FS：全部探测符合 adapter VFS 的预期', () => {
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
 * 这里只验 FS 层的事实怎样传到报告上；逻辑层没有 realm / BigInt 那一半由 dist-smoke 用真实构建产物验。
 */
describe('runProbe：模拟器形态下 adapter 建不了库', () => {
  let report: ProbeReport;
  let fake: ReturnType<typeof createFakeAlipay>;

  beforeAll(async () => {
    ({ report, fake } = await run({ ...SMALL_LIMITS, mode: 'simulator' }));
  }, 60_000);

  it('包装层 FS：只有「父目录不存在照样写成」与「空写入 error 2」两条不符合 VFS 预期', () => {
    const mismatched = report.fileSystem.probes.filter(item => !item.asExpected).map(item => item.op);
    expect(mismatched).toEqual(['writeFileSync(父目录不存在)', 'writeFileSync(空 ArrayBuffer)']);
  });

  it('配额计费：单文件按 base64 串长算，1 MiB 限额下只写得进 0.5 MiB；填充文件随之缩小，照样撞到文件夹上限', () => {
    expect(report.quotaAccounting.largestSingleWriteBytes).toBe(MIB / 2);
    expect(report.quotaAccounting.fill).toMatchObject({ fileBytes: MIB / 2, scope: 'ancestor-or-user-dir' });
  });

  it('持久化与配额：建库时写空的 .sqlite.0 被 error 2 拒收，sqlite3_open_v2 失败', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.persistence).toMatchObject({ status: 'failed', failure: { stage: '打开 persistence' } });
    expect(core.quota).toMatchObject({ status: 'failed', insertedRows: 0 });
  });

  it('findings：同步 FS 与持久化 fail，持久化证据带上 cause 链根因；WASM / 用户目录 unknown；随机源照样 pass', () => {
    expect(report.findings.map(item => [item.matrixRow, item.verdict])).toEqual([
      ['WASM', 'unknown'],
      ['同步 FS', 'fail'],
      ['随机源', 'pass'],
      ['用户目录', 'unknown'],
      ['持久化', 'fail']
    ]);
    expect(finding(report, '同步 FS')?.evidence).toContain('error 2');
    expect(finding(report, '持久化')?.evidence).toContain(
      '根因：接口参数无效 (writeFileSync https://usr/aiao-alipay-probe/db/rxdb-persistence.sqlite.0, error 2)'
    );
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
    const report = await runProbe({ my: fake.my, wasm: fake.wasm, loadCore: skipCore, freeGlobals: {} });
    expect(report.workspace).toMatchObject({ ok: true, value: { root: PROBE_ROOT, removedLeftover: true } });
    expect(leftovers(fake)).toEqual([]);
  }, 60_000);

  it('配额没撞到时如实写「未触发」', async () => {
    const { report } = await run({}, loadRealCore, { blobBytes: 1024, maxRows: 3 });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota).toMatchObject({ status: 'not-triggered', insertedRows: 3 });
    expect(finding(report, '用户目录')).toMatchObject({ verdict: 'unknown', evidence: expect.stringContaining('未触发') });
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
    expect(report.worker).toMatchObject({ ok: true, value: { cryptoGetRandomValues: { skipped: expect.any(String) } } });
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
    await expect(runProbe({ my, wasm: fake.wasm, loadCore: skipCore, freeGlobals: {} })).rejects.toThrow('USER_DATA_PATH');
    expect(fake.liveWorkers()).toBe(0);
  }, 60_000);
});
