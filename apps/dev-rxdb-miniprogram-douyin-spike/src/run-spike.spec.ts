import { createFakeDouyin, FAKE_USER_DATA_PATH, type FakeDouyinOptions } from './__tests__/fake-douyin.js';
import type { SpikeCore } from './core-contract.js';
import { runSpike, SPIKE_REPORT_SCHEMA, type SpikeReport } from './run-spike.js';

const SPIKE_ROOT = `${FAKE_USER_DATA_PATH}/aiao-douyin-spike`;

/** 小配额 + 小 blob：几十毫秒内就能撞到配额，形态与真机 10 MiB 一致。 */
const SMALL_QUOTA = { quotaBytes: 3 * 1024 * 1024 } satisfies FakeDouyinOptions;
const SMALL_PLAN = { blobBytes: 256 * 1024, maxRows: 40 };

const loadRealCore = async (): Promise<SpikeCore> => import('./core.js');

async function run(
  options: FakeDouyinOptions,
  loadCore: () => Promise<SpikeCore> = loadRealCore,
  quotaPlan = SMALL_PLAN
): Promise<{ report: SpikeReport; fake: ReturnType<typeof createFakeDouyin> }> {
  const fake = createFakeDouyin(options);
  const report = await runSpike({
    tt: fake.tt,
    wasmRuntime: fake.wasm,
    loadCore,
    freeGlobals: { tt: 'object', TTWebAssembly: 'object' },
    quotaPlan
  });
  return { report, fake };
}

function finding(report: SpikeReport, row: string) {
  return report.findings.find(item => item.matrixRow === row);
}

describe('runSpike：全部实验跑通', () => {
  let report: SpikeReport;
  let fake: ReturnType<typeof createFakeDouyin>;

  beforeAll(async () => {
    ({ report, fake } = await run(SMALL_QUOTA));
  }, 60_000);

  it('报告自带 schema 与借用 id 的说明', () => {
    expect(report.schema).toBe(SPIKE_REPORT_SCHEMA);
    expect(report.notes.join('\n')).toContain('tt.getRandomValues');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('⑤ 环境：记录基础库版本门槛与全局能力', () => {
    expect(report.environment.sdkVersion).toBe('3.0.0');
    expect(report.environment.gates).toEqual({
      randomValues: { required: '2.87.0', met: true },
      wasm: { required: '2.34.0.0', met: true }
    });
    expect(report.environment.globals).toMatchObject({ tt: 'object', TTWebAssembly: 'object', BigInt: 'function' });
    expect(report.environment.textDecoderLabels['latin1']).toMatchObject({ ok: true });
  });

  it('② 随机源：64 KiB 与 1 MiB 成功，超上限失败并留原始错误', () => {
    expect(report.random['65536']).toMatchObject({ ok: true, value: { byteLength: 65_536, allZero: false } });
    expect(report.random['1048576']).toMatchObject({ ok: true, value: { byteLength: 1_048_576 } });
    expect(report.random['1048577']).toMatchObject({ ok: false, error: { errMsg: expect.stringContaining('fail') } });
    expect(report.prepare).toMatchObject({ ok: true });
  });

  it('WASM 路径：逐个写法探测，记下能用的那个', () => {
    expect(report.wasmPath.compileAvailable).toBe(true);
    expect(report.wasmPath.probes['wa-sqlite/wa-sqlite.wasm']).toMatchObject({ ok: true });
    expect(report.wasmPath.probes['/wa-sqlite/wa-sqlite.wasm']).toMatchObject({ ok: false });
    expect(report.wasmPath.workingPath).toBe('wa-sqlite/wa-sqlite.wasm');
  });

  it('③ 文件错误：原文、错误码与 VFS 正则的判定逐条记下', () => {
    const byOp = Object.fromEntries(report.fileSystem.probes.map(item => [item.op, item]));
    expect(byOp['accessSync(不存在的文件)']).toMatchObject({
      asExpected: true,
      vfsSaysMissing: true,
      outcome: { ok: false, error: { codes: { errNo: 108802 } } }
    });
    expect(byOp['unlinkSync(不存在的文件)']).toMatchObject({ asExpected: true, vfsSaysMissing: true });
    expect(byOp['mkdirSync(已存在的目录, false)']).toMatchObject({ asExpected: true, vfsSaysExists: true });
    expect(byOp['writeFileSync(11 MiB)']).toMatchObject({
      asExpected: true,
      outcome: { ok: false, error: { codes: { errNo: 108403 } } }
    });
    expect(report.fileSystem.probes.every(item => item.asExpected)).toBe(true);
  });

  it('① 持久化：关闭重开后中文与 emoji 原样读回，integrity_check 为 ok', () => {
    expect(report.coreLoad).toMatchObject({ ok: true });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.persistence).toMatchObject({ status: 'passed', integrity: 'ok', wasmPath: 'wa-sqlite/wa-sqlite.wasm' });
    expect(core.persistence.reopenedRows).toEqual(core.persistence.writtenRows);
    expect(core.persistence.writtenRows?.flat()).toContain('中文与 emoji 🚀');
    expect(core.persistence.files?.some(file => file.path.endsWith('.sqlite') && file.size > 0)).toBe(true);
  });

  it('④ 配额：撞到 108403 后记录失败形态，重开库仍完整', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota.status).toBe('triggered');
    expect(core.quota.insertedRows).toBeGreaterThan(0);
    expect(core.quota.failure?.error.cause).toMatchObject({ codes: { errNo: 108403 } });
    expect(core.quota.afterFailure?.reopenIntegrity).toMatchObject({ ok: true, value: 'ok' });
    expect(core.quota.afterFailure?.reopenCount).toMatchObject({ ok: true, value: core.quota.insertedRows });
  });

  it('收尾：实验目录被删干净', () => {
    expect(report.cleanup).toMatchObject({ ok: true });
    expect([...fake.files.keys()].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
    expect([...fake.directories].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
  });

  it('findings 按矩阵行给出本次运行的判定', () => {
    expect(report.findings.map(item => item.matrixRow)).toEqual(['WASM', '同步 FS', '随机源', '用户目录', '持久化']);
    expect(report.findings.every(item => item.verdict === 'pass')).toBe(true);
  });
});

describe('runSpike：失败与边界', () => {
  it('核心包加载失败：① ④ 标记跳过，其余实验照跑', async () => {
    const latin1 = new RangeError('不支持的 TextDecoder 编码: latin1');
    const { report, fake } = await run(SMALL_QUOTA, () => Promise.reject(latin1));
    expect(report.coreLoad).toMatchObject({ ok: false, error: { name: 'RangeError', message: latin1.message } });
    expect(report.core).toEqual({ skipped: expect.stringContaining('latin1') });
    expect(report.random['65536']).toMatchObject({ ok: true });
    expect(report.fileSystem.probes.length).toBeGreaterThan(0);
    expect(finding(report, '持久化')).toMatchObject({ verdict: 'unknown' });
    expect(finding(report, '同步 FS')).toMatchObject({ verdict: 'pass' });
    expect([...fake.directories].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
  }, 60_000);

  it('配额没撞到时如实写「未触发」', async () => {
    const { report } = await run({}, loadRealCore, { blobBytes: 1024, maxRows: 3 });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota).toMatchObject({ status: 'not-triggered', insertedRows: 3 });
    expect(finding(report, '用户目录')?.evidence).toContain('未触发');
  }, 60_000);

  it('只认绝对路径时，核心实验改用探测到的写法', async () => {
    const { report } = await run({ ...SMALL_QUOTA, acceptedWasmPaths: ['/wa-sqlite/wa-sqlite.wasm'] });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(report.wasmPath.workingPath).toBe('/wa-sqlite/wa-sqlite.wasm');
    expect(core.persistence).toMatchObject({ status: 'passed', wasmPath: '/wa-sqlite/wa-sqlite.wasm' });
  }, 60_000);

  it('同步方法抛 Error 实例时，判定照样成立', async () => {
    const { report } = await run({ ...SMALL_QUOTA, errorShape: 'error' }, loadRealCore, { blobBytes: 1024, maxRows: 1 });
    const access = report.fileSystem.probes.find(item => item.op === 'accessSync(不存在的文件)');
    expect(access).toMatchObject({ asExpected: true, outcome: { ok: false, error: { constructorName: 'Error' } } });
  }, 60_000);

  it('基础库低于门槛时 gates 标 false', async () => {
    const { report } = await run({ sdkVersion: '2.33.9' }, () => Promise.reject(new Error('跳过')));
    expect(report.environment.gates.randomValues.met).toBe(false);
    expect(report.environment.gates.wasm.met).toBe(false);
  }, 60_000);

  it('缺 TTWebAssembly 时跳过核心实验并写明原因', async () => {
    const fake = createFakeDouyin();
    const report = await runSpike({ tt: fake.tt, wasmRuntime: undefined, loadCore: loadRealCore, freeGlobals: {} });
    expect(report.core).toEqual({ skipped: expect.stringContaining('TTWebAssembly') });
    expect(finding(report, 'WASM')).toMatchObject({ verdict: 'fail' });
  }, 60_000);
});
