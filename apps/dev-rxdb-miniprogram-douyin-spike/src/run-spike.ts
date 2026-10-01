/**
 * @fileoverview 实验编排：按固定顺序跑完全部实验，产出一份可直接回填矩阵的 JSON 报告。
 *
 * 顺序有讲究：环境快照必须在引导之前；随机源原始调用在引导之前（引导会消耗随机源）；
 * 文件系统探测在核心实验之前（11 MiB 写入失败后要确认没占着配额）。
 * 任何一步失败都只记录、不中断，最后总会执行收尾删除实验目录。
 */
import { prepareMiniProgramHostRuntime, type MiniProgramRuntimeSources } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { DEFAULT_QUOTA_PLAN, type CoreExperimentReport, type QuotaPlan, type SpikeCore } from './core-contract.js';
import { adapterErrorText } from './describe-error.js';
import type { DouyinApi, DouyinFileSystemManager, DouyinWasmRuntime } from './douyin-api.js';
import { collectEnvironment, type EnvironmentReport } from './experiments/environment.js';
import { runFileSystemExperiment, type FileSystemReport } from './experiments/fs-errors.js';
import {
  DEFAULT_QUOTA_ACCOUNTING_PLAN,
  runQuotaAccountingExperiment,
  type QuotaAccountingReport
} from './experiments/quota-accounting.js';
import { runRandomExperiment, type RandomSummary } from './experiments/random.js';
import { runWasmPathExperiment, type WasmPathReport } from './experiments/wasm-path.js';
import { buildFindings, type Finding } from './findings.js';
import { readGlobalThisShim, shimApplied, type GlobalThisShimReport } from './global-this-shim.js';
import { probe, type Probe, type Skipped } from './probe.js';
import { createDouyinSpikeHost } from './spike-host.js';
import { ADAPTER_DEFAULT_WASM_PATH, VFS_MISSING_FILE_PATTERN } from './vfs-classifiers.js';

/** 报告格式版本；字段语义变了就升版本号。 */
export const SPIKE_REPORT_SCHEMA = 'aiao.us-211.douyin-spike/v7';

/** 实验目录名，位于 `tt.env.USER_DATA_PATH` 之下，收尾整个删掉。 */
export const SPIKE_DIRECTORY = 'aiao-douyin-spike';

const NOTES = [
  'host 借用已登记的 wechat 平台 id 通过 adapter 校验；正式接入需要 Phase B 登记 douyin id 与正式 host。',
  '实验 ② 直接调用 tt.getRandomValues，不经 host 包装，记录的是平台原始的成功与失败形态。',
  '实验 ③ 的 vfsSaysMissing / vfsSaysExists 是用 adapter 文件 VFS 的正则副本对 errMsg 的判定。',
  '构建产物在 globalThis 不是对象时尝试换上真实全局对象（见 globalThisShim）；垫过时 ① ② ④ 的通过不代表 adapter 现状可用。',
  'quotaAccounting 不经 SQLite 用裸文件测配额计费：一次能写多大、同一路径覆盖写时旧文件是否仍计入配额（adapter VFS 每次 flush 都整体覆盖库文件）。',
  'coreLoad 失败时报的是核心包模块顶层的原始错误：iOS 真机的 require 会吞掉它、返回半成品导出，构建包装把它挂在 initError 上再抛出。',
  'environment.residue 为 true 时，同一 JS 上下文里之前跑过引导，环境快照不是平台原生状态；要彻底重启开发者工具（真机要把抖音从后台划掉）再跑。',
  'findings 只代表这一台设备的这一次运行；矩阵回填需要开发者工具、Android、iOS 三份报告。'
];

/** 实验输入。 */
export interface SpikeOptions {
  readonly tt: DouyinApi;
  /** 全局 `TTWebAssembly`；不存在时传 `undefined`。 */
  readonly wasmRuntime: DouyinWasmRuntime | undefined;
  /** 加载核心包；真机上是 `require('../../spike-core.js')`。 */
  readonly loadCore: () => Promise<SpikeCore>;
  /** 以自由变量形式读到的全局 `typeof`，见 `captureFreeGlobals`。 */
  readonly freeGlobals: Readonly<Record<string, string>>;
  readonly quotaPlan?: QuotaPlan;
}

/** 实验目录的准备结果。 */
export interface WorkspaceReport {
  readonly root: string;
  /** 上次运行异常退出留下的目录被删掉了。 */
  readonly removedLeftover: boolean;
}

/** 完整报告。 */
export interface SpikeReport {
  readonly schema: typeof SPIKE_REPORT_SCHEMA;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly notes: readonly string[];
  /** 各包构建 banner 的 `globalThis` 垫片记录；`environment.freeGlobals` 是垫过之后采的，原始形态看这里的 `before`。 */
  readonly globalThisShim: GlobalThisShimReport;
  readonly environment: EnvironmentReport;
  readonly random: Readonly<Record<string, Probe<RandomSummary>>>;
  readonly prepare: Probe<MiniProgramRuntimeSources>;
  readonly wasmPath: WasmPathReport;
  readonly workspace: Probe<WorkspaceReport>;
  readonly fileSystem: FileSystemReport;
  readonly quotaAccounting: QuotaAccountingReport;
  /** 成功值是核心包的导出名。 */
  readonly coreLoad: Probe<readonly string[]> | Skipped;
  readonly core: CoreExperimentReport | Skipped;
  readonly cleanup: Probe<null>;
  readonly findings: readonly Finding[];
}

function resetWorkspace(fileSystem: DouyinFileSystemManager, root: string): WorkspaceReport {
  let removedLeftover = false;
  try {
    fileSystem.accessSync(root);
    removedLeftover = true;
  } catch (error) {
    if (!VFS_MISSING_FILE_PATTERN.test(adapterErrorText(error))) throw error;
  }
  if (removedLeftover) fileSystem.rmdirSync(root, true);
  fileSystem.mkdirSync(`${root}/fs`, true);
  fileSystem.mkdirSync(`${root}/quota`, true);
  fileSystem.mkdirSync(`${root}/db`, true);
  return { root, removedLeftover };
}

interface CoreSection {
  readonly coreLoad: SpikeReport['coreLoad'];
  readonly core: SpikeReport['core'];
  /** 加载成功时核心包的 banner 记录。 */
  readonly coreShim: GlobalThisShimReport['core'];
}

/**
 * 平台 `require` 吞掉模块顶层错误时返回的是半成品导出：导出名齐全，模块顶层的变量却没赋值。
 * 有构建包装接住的原始错误就抛它；没有时以 banner 记录为绊线——核心包自身的模块体在全部依赖求值完之后
 * 才给它赋值，`undefined` 说明顶层没跑完。
 */
function assertCoreInitialized(core: SpikeCore): void {
  if (core.initError !== undefined) throw core.initError;
  if (core.globalThisShim === undefined) throw new Error('核心包模块顶层没有跑完，require 返回了半成品导出');
}

async function runCore(
  options: SpikeOptions,
  input: Omit<Parameters<SpikeCore['runCoreExperiments']>[0], 'wasmRuntime'>
): Promise<CoreSection> {
  const { wasmRuntime } = options;
  if (!wasmRuntime) {
    const skipped = '全局 TTWebAssembly 不存在，核心实验无法实例化 wasm';
    return { coreLoad: { skipped }, core: { skipped }, coreShim: null };
  }
  let core: SpikeCore | undefined;
  const coreLoad = await probe(async () => {
    core = await options.loadCore();
    assertCoreInitialized(core);
    return Object.keys(core);
  });
  if (!coreLoad.ok || !core) {
    const reason = coreLoad.ok ? '核心包为空' : coreLoad.error.text;
    return { coreLoad, core: { skipped: `核心包加载失败：${reason}` }, coreShim: null };
  }
  const loaded = core;
  const coreShim = loaded.globalThisShim;
  const result = await probe(() => loaded.runCoreExperiments({ ...input, wasmRuntime }));
  if (result.ok) return { coreLoad, core: result.value, coreShim };
  return { coreLoad, core: { skipped: `核心实验中途抛错：${result.error.text}`, error: result.error }, coreShim };
}

/** 跑完全部实验并返回报告；本函数自身不抛错（`tt.getFileSystemManager` 不存在除外）。 */
export async function runSpike(options: SpikeOptions): Promise<SpikeReport> {
  const startedAt = Date.now();
  const { tt } = options;
  const environment = await collectEnvironment(tt, options.freeGlobals);
  const random = await runRandomExperiment(tt);
  const host = createDouyinSpikeHost(tt);
  const prepare = await probe(() => prepareMiniProgramHostRuntime(host));
  const wasmPath = await runWasmPathExperiment(options.wasmRuntime);

  const fileSystem = tt.getFileSystemManager();
  const root = `${tt.env.USER_DATA_PATH}/${SPIKE_DIRECTORY}`;
  const workspace = await probe(() => resetWorkspace(fileSystem, root));
  const fileSystemReport = runFileSystemExperiment(fileSystem, `${root}/fs`);
  const quotaAccounting = await runQuotaAccountingExperiment(
    fileSystem,
    `${root}/quota`,
    tt.env.USER_DATA_PATH,
    DEFAULT_QUOTA_ACCOUNTING_PLAN
  );
  const { coreLoad, core, coreShim } = await runCore(options, {
    host,
    fileSystem,
    wasmPath: wasmPath.workingPath ?? ADAPTER_DEFAULT_WASM_PATH,
    databaseRoot: `${root}/db`,
    quotaPlan: options.quotaPlan ?? DEFAULT_QUOTA_PLAN
  });
  const cleanup = await probe(() => {
    fileSystem.rmdirSync(root, true);
    return null;
  });
  const globalThisShim: GlobalThisShimReport = { page: readGlobalThisShim(), core: coreShim };

  return {
    schema: SPIKE_REPORT_SCHEMA,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    notes: NOTES,
    globalThisShim,
    environment,
    random,
    prepare,
    wasmPath,
    workspace,
    fileSystem: fileSystemReport,
    quotaAccounting,
    coreLoad,
    core,
    cleanup,
    findings: buildFindings({
      random,
      prepare,
      wasmPath,
      fileSystem: fileSystemReport,
      quotaAccounting,
      core,
      globalThisShimmed: shimApplied(globalThisShim)
    })
  };
}
