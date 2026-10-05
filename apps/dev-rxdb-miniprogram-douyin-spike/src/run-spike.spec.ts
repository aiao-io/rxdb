import { createFakeDouyin, FAKE_USER_DATA_PATH, type FakeDouyinOptions } from './__tests__/fake-douyin.js';
import { DEFAULT_QUOTA_PLAN, type SpikeCore } from './core-contract.js';
import { buildFindings } from './findings.js';
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

  it('报告自带 schema 与说明，host 是 adapter 正式登记的抖音 host', () => {
    expect(report.schema).toBe(SPIKE_REPORT_SCHEMA);
    expect(report.notes.join('\n')).toContain('createDouyinMiniProgramHost');
    expect(report.notes.join('\n')).not.toContain('借用');
    expect(report.notes.join('\n')).toContain('tt.getRandomValues');
    expect(report.notes.join('\n')).toContain('host.runtimeGlobal');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('⑤ 环境：记录基础库版本门槛与全局能力', () => {
    expect(report.environment.sdkVersion).toBe('3.0.0');
    expect(report.environment.gates).toEqual({
      randomValues: { required: '2.87.0', met: true },
      wasm: { required: '2.34.0.0', met: true }
    });
    expect(report.environment.freeGlobals).toMatchObject({ tt: 'object', TTWebAssembly: 'object' });
    expect(report.environment.globalObject).toMatchObject({ ok: true, value: { BigInt: 'function' } });
    expect(report.environment.sourcesBeforePrepare).toMatchObject({ ok: true });
    expect(report.environment.textDecoderLabels['latin1']).toMatchObject({ ok: true });
  });

  it('② 随机源：64 KiB 与 1 MiB 成功，超上限失败并留原始错误', () => {
    expect(report.random['65536']).toMatchObject({ ok: true, value: { byteLength: 65_536, allZero: false } });
    expect(report.random['1048576']).toMatchObject({ ok: true, value: { byteLength: 1_048_576 } });
    expect(report.random['1048577']).toMatchObject({ ok: false, error: { errMsg: expect.stringContaining('fail') } });
    expect(report.prepare).toMatchObject({ ok: true });
  });

  it('WASM 路径：逐个写法探测，记下能用的那个（与真机一样只认绝对路径）', () => {
    expect(report.wasmPath.compileAvailable).toBe(true);
    expect(report.wasmPath.probes['wa-sqlite/wa-sqlite.wasm']).toMatchObject({ ok: false });
    expect(report.wasmPath.probes['/wa-sqlite/wa-sqlite.wasm']).toMatchObject({ ok: true });
    expect(report.wasmPath.workingPath).toBe('/wa-sqlite/wa-sqlite.wasm');
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
    // 核心实验不传 wasmPath：路径来自 host.defaultWasmPath
    expect(core.persistence).toMatchObject({
      status: 'passed',
      integrity: 'ok',
      wasmPath: '/wa-sqlite/wa-sqlite.wasm'
    });
    expect(core.persistence.reopenedRows).toEqual(core.persistence.writtenRows);
    expect(core.persistence.writtenRows?.flat()).toContain('中文与 emoji 🚀');
    // host 声明分块布局：库文件存成 P.0、P.1…
    expect(core.persistence.files?.some(file => file.path.endsWith('.sqlite.0') && file.size > 0)).toBe(true);
    expect(core.persistence.files?.some(file => file.path.endsWith('.sqlite'))).toBe(false);
  });

  it('④ 配额：撞到 108403 后报 SQLITE_FULL 并带平台原文，不清理直接重开库仍完整', () => {
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(core.quota.status).toBe('triggered');
    expect(core.quota.insertedRows).toBeGreaterThan(0);
    expect(core.quota.failure?.error).toMatchObject({
      name: 'RxDBAdapterSqliteError',
      // RxDBAdapterSqliteError → SQLiteError(13) → VFS lastError（平台原文）→ 平台原始错误对象
      cause: {
        codes: { code: 13 },
        cause: {
          message: expect.stringContaining('size limit exceeded'),
          cause: { errMsg: expect.stringContaining('size limit exceeded'), codes: { errNo: 108403 } }
        }
      }
    });
    expect(core.quota.afterFailure?.reopenIntegrity).toMatchObject({ ok: true, value: 'ok' });
    expect(core.quota.afterFailure?.reopenCount).toMatchObject({ ok: true, value: core.quota.insertedRows });
    const files = core.quota.afterFailure?.filesAfterDisconnect;
    if (!files?.ok) throw new Error('关闭后应当能列出库文件');
    expect(files.value.some(file => file.path.endsWith('.sqlite.0') && file.size > 0)).toBe(true);
    expect(files.value.some(file => file.path.includes('-journal') && file.size > 0)).toBe(false);
    expect(finding(report, '用户目录')?.evidence).toContain('SQLITE_FULL，平台原文「');
  });

  it('配额计费：逐 MiB 探出一次能写多大，配额小于覆盖写大小时覆盖写判定为 null', () => {
    expect(report.quotaAccounting.largestFreshWriteBytes).toBe(SMALL_QUOTA.quotaBytes);
    expect(report.quotaAccounting.firstFreshFailure).toMatchObject({ bytes: SMALL_QUOTA.quotaBytes + 1024 * 1024 });
    expect(report.quotaAccounting.overwrite.countsOldSize).toBeNull();
    expect(finding(report, '用户目录')?.evidence).toContain('一次最多写入 3 MiB');
  });

  it('收尾：实验目录被删干净', () => {
    expect(report.cleanup).toMatchObject({ ok: true });
    expect([...fake.files.keys()].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
    expect([...fake.directories].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
  });

  it('⑤ 环境：首次运行的快照没有引导残留，原生 crypto 能直接取随机数', () => {
    expect(report.environment.residue).toBe(false);
    expect(report.environment.nativeRandom).toMatchObject({ ok: true, value: { byteLength: 4096, allZero: false } });
  });

  it('源码级运行没有构建 banner，realm 探测记录为空', () => {
    expect(report.realmProbe).toEqual({ page: null, core: null });
    expect(JSON.stringify(report.findings)).not.toContain('垫片');
  });

  it('findings 按矩阵行给出本次运行的判定', () => {
    expect(report.findings.map(item => item.matrixRow)).toEqual(['WASM', '同步 FS', '随机源', '用户目录', '持久化']);
    expect(report.findings.every(item => item.verdict === 'pass')).toBe(true);
  });
});

describe('runSpike：失败与边界', () => {
  it('核心包加载失败：① ④ 标记跳过，其余实验照跑', async () => {
    const topLevel = new RangeError('模块顶层出错');
    const { report, fake } = await run(SMALL_QUOTA, () => Promise.reject(topLevel));
    expect(report.coreLoad).toMatchObject({ ok: false, error: { name: 'RangeError', message: topLevel.message } });
    expect(report.core).toEqual({ skipped: expect.stringContaining('模块顶层出错') });
    expect(report.random['65536']).toMatchObject({ ok: true });
    expect(report.fileSystem.probes.length).toBeGreaterThan(0);
    expect(finding(report, '持久化')).toMatchObject({ verdict: 'unknown' });
    expect(finding(report, '同步 FS')).toMatchObject({ verdict: 'pass' });
    expect([...fake.directories].filter(path => path.startsWith(SPIKE_ROOT))).toEqual([]);
  }, 60_000);

  it('构建包装把核心包顶层错误挂在 initError 上：coreLoad 报原始错误，不调用半成品导出', async () => {
    const topLevel = new RangeError('模块顶层出错');
    const real = await loadRealCore();
    const runCoreExperiments = vi.fn(real.runCoreExperiments);
    const halfInitialized: SpikeCore = { ...real, runCoreExperiments, initError: topLevel };
    const { report } = await run(SMALL_QUOTA, async () => halfInitialized);
    expect(report.coreLoad).toMatchObject({ ok: false, error: { name: 'RangeError', message: topLevel.message } });
    expect(report.core).toEqual({ skipped: expect.stringContaining('模块顶层出错') });
    expect(runCoreExperiments).not.toHaveBeenCalled();
  }, 60_000);

  it('核心包导出里没有 banner 记录（顶层没跑完、原始错误也没接住）：判加载失败而不是去调用它', async () => {
    const real = await loadRealCore();
    const runCoreExperiments = vi.fn(real.runCoreExperiments);
    // 模拟 esbuild 的导出 getter：导出名都在，模块顶层的变量还没赋值
    const halfInitialized = { realmProbe: undefined, runCoreExperiments } as unknown as SpikeCore;
    const { report } = await run(SMALL_QUOTA, async () => halfInitialized);
    expect(report.coreLoad).toMatchObject({ ok: false, error: { message: expect.stringContaining('半成品导出') } });
    expect(report.core).toEqual({ skipped: expect.stringContaining('半成品导出') });
    expect(runCoreExperiments).not.toHaveBeenCalled();
  }, 60_000);

  it('同一 JS 上下文里再跑一次，环境快照标出上次引导的残留', async () => {
    // 开发者工具「重新运行」或热重载不换 JS 上下文，上次 prepare 装上的补丁还在。
    // Node 能力齐全，prepare 什么都不装；拿掉 structuredClone 逼它装一个 polyfill
    const original = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
    if (original === undefined) throw new Error('Node 应当有原生 structuredClone');
    const skipCore = () => Promise.reject(new Error('跳过'));
    try {
      Reflect.deleteProperty(globalThis, 'structuredClone');
      const first = await run(SMALL_QUOTA, skipCore);
      expect(first.report.environment.residue).toBe(false);
      const second = await run(SMALL_QUOTA, skipCore);
      expect(second.report.environment.sourcesBeforePrepare).toMatchObject({ value: { structuredClone: 'polyfill' } });
      expect(second.report.environment.residue).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'structuredClone', original);
    }
  }, 60_000);

  it('覆盖写把旧大小也计入配额时（模拟器与 iOS 实测）：分块布局撞配额后仍能回滚，重开读回全部已提交行', async () => {
    const { report } = await run({ ...SMALL_QUOTA, overwriteCountsOldSize: true, failedNewFileLeftEmpty: true });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(report.quotaAccounting.overwrite.countsOldSize).toBeNull();
    expect(core.quota.status).toBe('triggered');
    expect(core.quota.failure?.error).toMatchObject({ cause: { codes: { code: 13 } } });
    const after = core.quota.afterFailure;
    expect(after?.disconnect).toMatchObject({ ok: true });
    expect(after?.reopenCount).toMatchObject({ ok: true, value: core.quota.insertedRows });
    expect(after?.reopenIntegrity).toMatchObject({ ok: true, value: 'ok' });
    // 单文件布局写到配额一半就撞（每次 flush 新旧两份同时计费）；分块只覆盖脏块，能写过一半
    expect(core.quota.insertedRows * SMALL_PLAN.blobBytes).toBeGreaterThan(SMALL_QUOTA.quotaBytes / 2);
    expect(finding(report, '用户目录')).toMatchObject({
      verdict: 'pass',
      evidence: expect.stringContaining('块号连续')
    });
  }, 60_000);

  it('配额足够大时，覆盖写计费判定写进用户目录的证据', async () => {
    const { report } = await run({ overwriteCountsOldSize: true }, loadRealCore, { blobBytes: 1024, maxRows: 3 });
    expect(report.quotaAccounting.overwrite.countsOldSize).toBe(true);
    expect(finding(report, '用户目录')?.evidence).toContain('覆盖写 6 MiB 失败（旧文件仍计入配额）');
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
    const quota = { ...core.quota, plan: { blobBytes: 1024 * 1024, maxRows: 30 }, insertedRows: 30 };
    const findings = buildFindings({ ...report, core: { ...core, quota } });
    expect(findings.find(item => item.matrixRow === '用户目录')).toMatchObject({
      verdict: 'pass',
      caveat: 'quota-unobserved',
      evidence: expect.stringContaining('写入 30 MiB 未触发配额')
    });
    const short = buildFindings({ ...report, core: { ...core, quota: { ...quota, insertedRows: 29 } } });
    expect(short.find(item => item.matrixRow === '用户目录')).toMatchObject({ verdict: 'unknown' });
  }, 60_000);

  it('默认写入计划够得着门 2 的 30 MiB：真机撞不到配额时才能判 quota-unobserved', () => {
    expect(DEFAULT_QUOTA_PLAN.blobBytes * DEFAULT_QUOTA_PLAN.maxRows).toBeGreaterThanOrEqual(30 * 1024 * 1024);
  });

  it('核心实验只认 host.defaultWasmPath，不采用路径探测的结果', async () => {
    const { report } = await run({ ...SMALL_QUOTA, acceptedWasmPaths: ['wa-sqlite/wa-sqlite.wasm'] });
    const core = report.core;
    if ('skipped' in core) throw new Error(core.skipped);
    expect(report.wasmPath.workingPath).toBe('wa-sqlite/wa-sqlite.wasm');
    expect(core.persistence).toMatchObject({ status: 'failed', wasmPath: '/wa-sqlite/wa-sqlite.wasm' });
    expect(finding(report, 'WASM')).toMatchObject({ verdict: 'unknown' });
  }, 60_000);

  it('同步方法抛 Error 实例时，判定照样成立', async () => {
    const { report } = await run({ ...SMALL_QUOTA, errorShape: 'error' }, loadRealCore, {
      blobBytes: 1024,
      maxRows: 1
    });
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
