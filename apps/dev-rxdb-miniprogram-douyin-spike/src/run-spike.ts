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
import { runRandomExperiment, type RandomSummary } from './experiments/random.js';
import { runWasmPathExperiment, type WasmPathReport } from './experiments/wasm-path.js';
import { buildFindings, type Finding } from './findings.js';
import { probe, type Probe, type Skipped } from './probe.js';
import { createDouyinSpikeHost } from './spike-host.js';
import { ADAPTER_DEFAULT_WASM_PATH, VFS_MISSING_FILE_PATTERN } from './vfs-classifiers.js';

/** 报告格式版本；字段语义变了就升版本号。 */
export const SPIKE_REPORT_SCHEMA = 'aiao.us-211.douyin-spike/v1';

/** 实验目录名，位于 `tt.env.USER_DATA_PATH` 之下，收尾整个删掉。 */
export const SPIKE_DIRECTORY = 'aiao-douyin-spike';

const NOTES = [
  'host 借用已登记的 wechat 平台 id 通过 adapter 校验；正式接入需要 Phase B 登记 douyin id 与正式 host。',
  '实验 ② 直接调用 tt.getRandomValues，不经 host 包装，记录的是平台原始的成功与失败形态。',
  '实验 ③ 的 vfsSaysMissing / vfsSaysExists 是用 adapter 文件 VFS 的正则副本对 errMsg 的判定。',
  'findings 只代表这一台设备的这一次运行；矩阵回填需要开发者工具、Android、iOS 三份报告。'
];

/** 实验输入。 */
export interface SpikeOptions {
  readonly tt: DouyinApi;
  /** 全局 `TTWebAssembly`；不存在时传 `undefined`。 */
  readonly wasmRuntime: DouyinWasmRuntime | undefined;
  /** 加载核心包；真机上是 `require('../../spike-core.js')`。 */
  readonly loadCore: () => Promise<SpikeCore>;
  /** 页面里以自由变量出现、不一定挂在 globalThis 上的全局的 `typeof`。 */
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
  readonly environment: EnvironmentReport;
  readonly random: Readonly<Record<string, Probe<RandomSummary>>>;
  readonly prepare: Probe<MiniProgramRuntimeSources>;
  readonly wasmPath: WasmPathReport;
  readonly workspace: Probe<WorkspaceReport>;
  readonly fileSystem: FileSystemReport;
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
  fileSystem.mkdirSync(`${root}/db`, true);
  return { root, removedLeftover };
}

interface CoreSection {
  readonly coreLoad: SpikeReport['coreLoad'];
  readonly core: SpikeReport['core'];
}

async function runCore(
  options: SpikeOptions,
  input: Omit<Parameters<SpikeCore['runCoreExperiments']>[0], 'wasmRuntime'>
): Promise<CoreSection> {
  const { wasmRuntime } = options;
  if (!wasmRuntime) {
    const skipped = '全局 TTWebAssembly 不存在，核心实验无法实例化 wasm';
    return { coreLoad: { skipped }, core: { skipped } };
  }
  let core: SpikeCore | undefined;
  const coreLoad = await probe(async () => {
    core = await options.loadCore();
    return Object.keys(core);
  });
  if (!coreLoad.ok || !core) {
    const reason = coreLoad.ok ? '核心包为空' : coreLoad.error.text;
    return { coreLoad, core: { skipped: `核心包加载失败：${reason}` } };
  }
  const loaded = core;
  const result = await probe(() => loaded.runCoreExperiments({ ...input, wasmRuntime }));
  if (result.ok) return { coreLoad, core: result.value };
  return { coreLoad, core: { skipped: `核心实验中途抛错：${result.error.text}`, error: result.error } };
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
  const { coreLoad, core } = await runCore(options, {
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

  return {
    schema: SPIKE_REPORT_SCHEMA,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    notes: NOTES,
    environment,
    random,
    prepare,
    wasmPath,
    workspace,
    fileSystem: fileSystemReport,
    coreLoad,
    core,
    cleanup,
    findings: buildFindings({ random, prepare, wasmPath, fileSystem: fileSystemReport, core })
  };
}
