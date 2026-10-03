/**
 * @fileoverview 实验编排：按固定顺序跑完全部实验，产出一份可直接回填矩阵的 JSON 报告。
 *
 * 顺序有讲究：环境快照必须在引导之前；Worker 要在随机源与引导之前建好（逻辑层没有随机源，引导要从 Worker 取）；
 * 文件系统探测在核心实验之前（11 MiB 写入失败后要确认没占着配额）。
 * 任何一步失败都只记录、不中断，最后总会删实验目录、结束 Worker。
 */
import {
  prepareMiniProgramHostRuntime,
  type MiniProgramRuntimeGlobal,
  type MiniProgramRuntimeSources
} from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi, StandardWasmApi } from './alipay-api.js';
import { frameUserFiles, wrapAlipayFileSystem, type AlipayProbeFileSystem } from './alipay-fs.js';
import { createAlipayProbeHost, createAlipayWasmRuntime } from './alipay-host.js';
import {
  DEFAULT_QUOTA_PLAN,
  type CoreExperimentInput,
  type CoreExperimentReport,
  type ProbeCore,
  type QuotaPlan
} from './core-contract.js';
import { adapterErrorText } from './describe-error.js';
import { collectEnvironment, type EnvironmentReport } from './experiments/environment.js';
import { runFileSystemExperiment, type FileSystemReport } from './experiments/fs-errors.js';
import { runRawFsExperiment, type RawFsReport } from './experiments/fs-raw.js';
import {
  DEFAULT_QUOTA_ACCOUNTING_PLAN,
  runQuotaAccountingExperiment,
  type QuotaAccountingPlan,
  type QuotaAccountingReport
} from './experiments/quota-accounting.js';
import { runRandomExperiment, type RandomReport } from './experiments/random.js';
import { runWasmExperiment, type WasmReport } from './experiments/wasm.js';
import { buildFindings, type Finding } from './findings.js';
import { probe, type Probe, type Skipped } from './probe.js';
import { readProbedRuntimeGlobal, readRealmProbe, type RealmProbeReport } from './realm-probe.js';
import { repairRuntimeGlobal, type RuntimeRepairs } from './runtime-repairs.js';
import { VFS_MISSING_FILE_PATTERN } from './vfs-classifiers.js';
import type { WasmFingerprints } from './wasm-fingerprint.js';
import { createWorkerBridge, type WorkerBridge, type WorkerProbeResult } from './worker-protocol.js';

/**
 * 报告格式版本；字段语义变了就升版本号。v1 / v2 是改写成 TS 工程之前的手写探针；
 * v5 起超限写入按 adapter VFS 的视角判（整块落盘或撞配额都算对），并加了 `vfsSaysQuota`。
 */
export const PROBE_REPORT_SCHEMA = 'aiao.us-211.alipay-probe/v5';

/** 实验目录名，位于 `my.env.USER_DATA_PATH` 之下，收尾整个删掉。 */
export const PROBE_DIRECTORY = 'aiao-alipay-probe';

/** Worker 脚本路径，与 `app.json` 的 `workers` 声明一致。 */
export const WORKER_SCRIPT = 'workers/index.js';

/** Worker 里 `MYWebAssembly` 实例化的路径：只认代码包根的绝对路径（v2 探针两端实测）。 */
export const WORKER_WASM_PATH = '/wasm/add.wasm';

/** 单个 Worker 请求的默认超时。 */
const DEFAULT_WORKER_TIMEOUT_MS = 10_000;

const NOTES = [
  '支付宝已判 unsupported，不在 MINI_PROGRAM_PLATFORM_IDS 里；实验 host（createAlipayProbeHost）借用 wechat 平台 id 才能交给 adapter 的公开 API，平台 id 在 adapter 里只做登记校验。',
  '同步 FS 失败时返回错误对象而不抛，实验 host 用包装层把它转成抛错、把错误码归一成 adapter VFS 正则认得的英文文案，平台原文挂在 cause 上；写入一律走「base64 串 + base64」。',
  '模拟器拒绝任何空写入（error 2），adapter VFS 建库却要写空文件：实验 host 与核心实验的 FS 再套一层分帧（frameUserFiles），每个文件前垫 1 字节头，读与 stat 时剥掉。fileSystem 探测测的就是交给 adapter 的这一层；rawFs 与 quotaAccounting 不经包装与分帧，记录的是平台原样（含空写入 error 2、写到不存在的父目录照样成功）。',
  '引导前实验 host 给真实全局对象补缺的 BigInt（从 wasm 的 i64 返回值取回原生构造器）与 queueMicrotask（用 Promise 排微任务），已有的不动，见 runtimeRepairs；模拟器两个都缺，iOS 只缺 queueMicrotask。',
  '逻辑层没有随机源：随机数经 Worker 的 crypto.getRandomValues 桥接（my.createWorker + useExperimentalWorker），random.worker 是直接从 Worker 取的原始结果。',
  '逻辑层的标准 WebAssembly 文档没写，v2 探针两端实测都有；核心实验用它实例化 adapter 默认路径 wa-sqlite/wa-sqlite.wasm。字节按构建时记下的指纹（字节数 + FNV-1a）选源：先读 .wasm 原文件，对得上就用；对不上（模拟器把代码包文件当 UTF-8 文本读、非法字节序列改写成 EF BF BD）再读构建放进包里的 base64 文本副本（.base64.txt，iOS 真机代码包里没有），两者都对不上就抛错。wasm.sources 记每个 wasm 选到的来源，wasm.codePackageBinary 记二进制读与指纹对不对得上。Worker 的 MYWebAssembly 只做探测。',
  '构建 banner 只探测真实全局对象、不改 globalThis（见 realmProbe）；页面包把选中的对象经 adapter 公开字段 host.runtimeGlobal 注入。objectPrototypeGetter 一路会在 Object.prototype 上临时定义一个 getter、读完即删。',
  'quotaAccounting 不经 SQLite 用裸文件测文档的 10028「单个超过 10M 或者文件夹超过 50M」：单文件能写多大、文件夹上限算在直接目录还是整个用户目录。',
  '实验 ④ 写到撞配额后不删任何文件，直接关掉重开读回：通过要求失败错误带 SQLITE_FULL（13）与平台配额原文，且重开后行数与已提交行数一致、integrity_check 为 ok、分块块号连续。',
  'environment.residue 为 true 时，同一 JS 上下文里之前跑过引导，环境快照不是平台原生状态；要重新编译（真机要把支付宝从后台划掉）再跑。',
  'findings 只代表这一台设备的这一次运行；矩阵回填需要开发者工具、Android、iOS 三份报告。'
];

/** 实验输入。 */
export interface ProbeOptions {
  readonly my: AlipayApi;
  /** 逻辑层的标准 `WebAssembly`；不存在时传 `undefined`。 */
  readonly wasm: StandardWasmApi | undefined;
  /** 构建脚本记下的代码包 wasm 指纹，wasm 运行时据此选字节来源。 */
  readonly wasmFingerprints: WasmFingerprints;
  /** 加载核心包；真机上是 `require('../../probe-core.js')`。 */
  readonly loadCore: () => Promise<ProbeCore>;
  /** 以自由变量形式读到的全局 `typeof`，见 `captureFreeGlobals`。 */
  readonly freeGlobals: Readonly<Record<string, string>>;
  readonly quotaPlan?: QuotaPlan;
  readonly quotaAccountingPlan?: QuotaAccountingPlan;
  readonly workerTimeoutMs?: number;
}

/** 实验目录的准备结果。 */
export interface WorkspaceReport {
  readonly root: string;
  /** 上次运行异常退出留下的目录被删掉了。 */
  readonly removedLeftover: boolean;
}

/** 完整报告。 */
export interface ProbeReport {
  readonly schema: typeof PROBE_REPORT_SCHEMA;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly notes: readonly string[];
  /** 各包构建 banner 的真实全局对象探测记录；页面包的 `chosen` 即注入 `host.runtimeGlobal` 的那一条。 */
  readonly realmProbe: RealmProbeReport;
  readonly environment: EnvironmentReport;
  /** 建 Worker 并探它的全局；失败（含超时）后 Worker 被丢弃，后续实验不再用它。 */
  readonly worker: Probe<WorkerProbeResult> | Skipped;
  readonly random: RandomReport;
  /** 引导前给真实全局对象补的全局；`target` 说明补在 banner 找到的对象上还是 `globalThis` 上。 */
  readonly runtimeRepairs: Probe<RuntimeRepairsReport>;
  readonly prepare: Probe<MiniProgramRuntimeSources>;
  readonly wasm: WasmReport;
  readonly workspace: Probe<WorkspaceReport>;
  readonly rawFs: RawFsReport;
  readonly fileSystem: FileSystemReport;
  readonly quotaAccounting: QuotaAccountingReport;
  /** 成功值是核心包的导出名。 */
  readonly coreLoad: Probe<readonly string[]> | Skipped;
  readonly core: CoreExperimentReport | Skipped;
  readonly cleanup: Probe<null>;
  readonly findings: readonly Finding[];
}

/** {@link ProbeReport.runtimeRepairs} 的成功值。 */
export interface RuntimeRepairsReport extends RuntimeRepairs {
  readonly target: 'banner' | 'globalThis';
}

async function repairRuntime(
  runtimeGlobal: MiniProgramRuntimeGlobal | undefined,
  wasm: StandardWasmApi | undefined
): Promise<RuntimeRepairsReport> {
  if (runtimeGlobal) return { target: 'banner', ...(await repairRuntimeGlobal(runtimeGlobal, wasm)) };
  if (typeof globalThis !== 'object') throw new Error('banner 没找到真实全局对象，globalThis 也不可用，无处可补');
  return { target: 'globalThis', ...(await repairRuntimeGlobal(globalThis, wasm)) };
}

const WORKSPACE_SUBDIRECTORIES = ['raw', 'fs', 'quota', 'db'] as const;

function resetWorkspace(fileSystem: AlipayProbeFileSystem, root: string): WorkspaceReport {
  let removedLeftover = false;
  try {
    fileSystem.accessSync(root);
    removedLeftover = true;
  } catch (error) {
    if (!VFS_MISSING_FILE_PATTERN.test(adapterErrorText(error))) throw error;
  }
  if (removedLeftover) fileSystem.rmdirSync(root, true);
  for (const name of WORKSPACE_SUBDIRECTORIES) fileSystem.mkdirSync(`${root}/${name}`, true);
  return { root, removedLeftover };
}

interface WorkerSection {
  readonly worker: ProbeReport['worker'];
  /** 探测成功才有；失败时已 terminate。 */
  readonly bridge?: WorkerBridge;
}

async function openWorker(my: AlipayApi, timeoutMs: number): Promise<WorkerSection> {
  const createWorker = my.createWorker;
  if (typeof createWorker !== 'function') return { worker: { skipped: 'my.createWorker 不存在' } };
  let bridge: WorkerBridge | undefined;
  const worker = await probe(async () => {
    bridge = createWorkerBridge(createWorker.call(my, WORKER_SCRIPT, { useExperimentalWorker: true }), timeoutMs);
    return bridge.probe(WORKER_WASM_PATH);
  });
  if (worker.ok) return { worker, bridge };
  bridge?.terminate();
  return { worker };
}

interface CoreSection {
  readonly coreLoad: ProbeReport['coreLoad'];
  readonly core: ProbeReport['core'];
  /** 加载成功时核心包的 banner 记录。 */
  readonly coreRealmProbe: RealmProbeReport['core'];
}

/**
 * 平台 `require` 吞掉模块顶层错误时返回的是半成品导出：导出名齐全，模块顶层的变量却没赋值。
 * 有构建包装接住的原始错误就抛它；没有时以 banner 记录为绊线——核心包自身的模块体在全部依赖求值完之后
 * 才给它赋值，`undefined` 说明顶层没跑完。
 */
function assertCoreInitialized(core: ProbeCore): void {
  if (core.initError !== undefined) throw core.initError;
  if (core.realmProbe === undefined) throw new Error('核心包模块顶层没有跑完，require 返回了半成品导出');
}

async function runCore(options: ProbeOptions, input: Omit<CoreExperimentInput, 'wasmRuntime'>): Promise<CoreSection> {
  const { wasm } = options;
  if (!wasm) {
    const skipped = '逻辑层没有标准 WebAssembly，核心实验无法实例化 wasm';
    return { coreLoad: { skipped }, core: { skipped }, coreRealmProbe: null };
  }
  let core: ProbeCore | undefined;
  const coreLoad = await probe(async () => {
    core = await options.loadCore();
    assertCoreInitialized(core);
    return Object.keys(core);
  });
  if (!coreLoad.ok || !core) {
    const reason = coreLoad.ok ? '核心包为空' : coreLoad.error.text;
    return { coreLoad, core: { skipped: `核心包加载失败：${reason}` }, coreRealmProbe: null };
  }
  const loaded = core;
  const coreRealmProbe = loaded.realmProbe;
  const wasmRuntime = createAlipayWasmRuntime(input.fileSystem, wasm, options.my, options.wasmFingerprints);
  const result = await probe(() => loaded.runCoreExperiments({ ...input, wasmRuntime }));
  if (result.ok) return { coreLoad, core: result.value, coreRealmProbe };
  const skipped = `核心实验中途抛错：${result.error.text}`;
  return { coreLoad, core: { skipped, error: result.error }, coreRealmProbe };
}

function noWorkerRandom(): Promise<Uint8Array> {
  return Promise.reject(new Error('Worker 没有建起来，逻辑层没有随机源'));
}

/** 跑完全部实验并返回报告；只在 `USER_DATA_PATH` 缺失（没有可写目录）时抛错，Worker 照样结束。 */
export async function runProbe(options: ProbeOptions): Promise<ProbeReport> {
  const startedAt = Date.now();
  const { my } = options;
  const environment = await collectEnvironment(my, options.freeGlobals);
  const { worker, bridge } = await openWorker(my, options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS);
  try {
    const random = await runRandomExperiment(my, bridge);
    const raw = my.getFileSystemManager();
    const fileSystem = wrapAlipayFileSystem(raw, my);
    const framed = frameUserFiles(fileSystem, my);
    const runtimeGlobal = readProbedRuntimeGlobal();
    const runtimeRepairs = await probe(() => repairRuntime(runtimeGlobal, options.wasm));
    const host = createAlipayProbeHost(my, framed, bridge ? bridge.randomValues : noWorkerRandom, runtimeGlobal);
    const prepare = await probe(() => prepareMiniProgramHostRuntime(host));
    const wasm = await runWasmExperiment(fileSystem, options.wasm, my, options.wasmFingerprints);

    const userDataPath = host.userDataPath;
    if (userDataPath === undefined) throw new Error('my.env.USER_DATA_PATH 不可用，没有可写目录');
    const root = `${userDataPath}/${PROBE_DIRECTORY}`;
    const workspace = await probe(() => resetWorkspace(fileSystem, root));
    const rawFs = await runRawFsExperiment(raw, my, `${root}/raw`);
    const fileSystemReport = runFileSystemExperiment(framed, `${root}/fs`);
    const quotaAccounting = await runQuotaAccountingExperiment(
      fileSystem,
      `${root}/quota`,
      userDataPath,
      options.quotaAccountingPlan ?? DEFAULT_QUOTA_ACCOUNTING_PLAN
    );
    const { coreLoad, core, coreRealmProbe } = await runCore(options, {
      host,
      fileSystem: framed,
      databaseRoot: `${root}/db`,
      quotaPlan: options.quotaPlan ?? DEFAULT_QUOTA_PLAN
    });
    const cleanup = await probe(() => {
      fileSystem.rmdirSync(root, true);
      return null;
    });

    return {
      schema: PROBE_REPORT_SCHEMA,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      notes: NOTES,
      realmProbe: { page: readRealmProbe(), core: coreRealmProbe },
      environment,
      worker,
      random,
      runtimeRepairs,
      prepare,
      wasm,
      workspace,
      rawFs,
      fileSystem: fileSystemReport,
      quotaAccounting,
      coreLoad,
      core,
      cleanup,
      findings: buildFindings({
        random,
        runtimeRepairs,
        prepare,
        wasm,
        rawFs,
        fileSystem: fileSystemReport,
        quotaAccounting,
        core
      })
    };
  } finally {
    bridge?.terminate();
  }
}
