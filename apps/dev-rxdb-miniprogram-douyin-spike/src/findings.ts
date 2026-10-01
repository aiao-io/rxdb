/**
 * @fileoverview 把报告压成可行性矩阵抖音列的逐行判定。
 *
 * 判定只针对「这一台设备、这一次运行」；矩阵要的是开发者工具 + Android + iOS 三份报告都 pass。
 * 证据不足一律给 `unknown`，不往 pass 上靠。
 */
import type { CoreExperimentReport } from './core-contract.js';
import type { DescribedError } from './describe-error.js';
import type { FileSystemReport } from './experiments/fs-errors.js';
import type { QuotaAccountingReport } from './experiments/quota-accounting.js';
import type { RandomSummary } from './experiments/random.js';
import type { WasmPathReport } from './experiments/wasm-path.js';
import type { Probe, Skipped } from './probe.js';

/** 可行性矩阵里抖音列需要实验证据的行，顺序与矩阵一致。 */
export const MATRIX_ROWS = ['WASM', '同步 FS', '随机源', '用户目录', '持久化'] as const;

/** 矩阵行名。 */
export type MatrixRow = (typeof MATRIX_ROWS)[number];

/** 单行判定。 */
export interface Finding {
  readonly matrixRow: MatrixRow;
  readonly verdict: 'pass' | 'fail' | 'unknown';
  readonly evidence: string;
}

/** 判定需要的报告片段。 */
export interface FindingsInput {
  readonly random: Readonly<Record<string, Probe<RandomSummary>>>;
  readonly prepare: Probe<unknown>;
  readonly wasmPath: WasmPathReport;
  readonly fileSystem: FileSystemReport;
  readonly quotaAccounting: QuotaAccountingReport;
  readonly core: CoreExperimentReport | Skipped;
  /** 构建 banner 是否垫过 `globalThis`；垫过时，经 adapter 的行在证据里标明前提。 */
  readonly globalThisShimmed: boolean;
}

/** 垫片下取得的证据后缀：adapter 现状在同样环境里会因 `globalThis` 不是对象而 TypeError。 */
const SHIM_CONDITION =
  '；前提：globalThis 垫片（构建产物把 globalThis 换成了真实全局对象），adapter 现状在此环境会 TypeError';

/** 不经 adapter、结论不受垫片影响的矩阵行。 */
const SHIM_INDEPENDENT_ROWS: readonly MatrixRow[] = ['同步 FS'];

function errorText(error: DescribedError): string {
  return error.errMsg ?? error.message ?? error.text;
}

function probeText(result: Probe<unknown> | undefined): string {
  if (!result) return '未运行';
  return result.ok ? '成功' : `失败（${errorText(result.error)}）`;
}

function isSkipped(core: CoreExperimentReport | Skipped): core is Skipped {
  return 'skipped' in core;
}

function wasmFinding({ wasmPath, core }: FindingsInput): Finding {
  const row = 'WASM';
  if (!wasmPath.runtimeAvailable) return { matrixRow: row, verdict: 'fail', evidence: '全局 TTWebAssembly 不存在' };
  if (!isSkipped(core) && core.persistence.status === 'passed') {
    const evidence = `adapter 经 TTWebAssembly.instantiate('${core.persistence.wasmPath}') 完成建库、读写、关闭重开`;
    return { matrixRow: row, verdict: 'pass', evidence };
  }
  if (!wasmPath.compileAvailable) {
    return { matrixRow: row, verdict: 'unknown', evidence: 'TTWebAssembly.compile 不存在，且 adapter 实例化未验证' };
  }
  if (!wasmPath.workingPath) {
    const tried = Object.entries(wasmPath.probes).map(([path, result]) => `${path}: ${probeText(result)}`);
    return { matrixRow: row, verdict: 'fail', evidence: `所有候选路径 compile 失败：${tried.join('；')}` };
  }
  const evidence = `compile('${wasmPath.workingPath}') 成功，但 adapter 实例化未验证（核心实验未通过或未运行）`;
  return { matrixRow: row, verdict: 'unknown', evidence };
}

function fileSystemFinding({ fileSystem }: FindingsInput): Finding {
  const row = '同步 FS';
  if (fileSystem.probes.length === 0) return { matrixRow: row, verdict: 'unknown', evidence: '没有跑任何探测' };
  const failing = fileSystem.probes.filter(item => !item.asExpected);
  if (failing.length === 0) {
    return {
      matrixRow: row,
      verdict: 'pass',
      evidence: `${fileSystem.probes.length} 条探测全部符合 adapter VFS 的预期`
    };
  }
  const details = failing.map(item => `${item.op} 期望「${item.expectation}」，实际${probeText(item.outcome)}`);
  return { matrixRow: row, verdict: 'fail', evidence: details.join('；') };
}

function randomFinding({ random, prepare }: FindingsInput): Finding {
  const row = '随机源';
  const pool = random['65536'];
  if (!pool?.ok) return { matrixRow: row, verdict: 'fail', evidence: `getRandomValues(65536) ${probeText(pool)}` };
  if (pool.value.allZero) return { matrixRow: row, verdict: 'fail', evidence: 'getRandomValues(65536) 返回全零' };
  if (!prepare.ok)
    return { matrixRow: row, verdict: 'fail', evidence: `prepareMiniProgramHostRuntime ${probeText(prepare)}` };
  const evidence =
    `64 KiB 成功（${pool.value.distinctByteValues} 种字节值）；1 MiB ${probeText(random['1048576'])}；` +
    `超上限 ${probeText(random['1048577'])}；prepare 成功`;
  return { matrixRow: row, verdict: 'pass', evidence };
}

const MIB = 1024 * 1024;

function accountingText({ largestFreshWriteBytes, firstFreshFailure, overwrite }: QuotaAccountingReport): string {
  const limit = firstFreshFailure ? '' : '（到计划上限都没失败）';
  const overwriteMib = overwrite.bytes / MIB;
  const overwriteText: Record<string, string> = {
    true: `覆盖写 ${overwriteMib} MiB 失败（旧文件仍计入配额）`,
    false: `覆盖写 ${overwriteMib} MiB 成功`,
    null: `覆盖写未测（首次写入 ${overwriteMib} MiB 已失败）`
  };
  return `一次最多写入 ${largestFreshWriteBytes / MIB} MiB${limit}，${overwriteText[String(overwrite.countsOldSize)]}`;
}

function userDataFinding({ core, fileSystem, quotaAccounting }: FindingsInput): Finding {
  const row = '用户目录';
  const rawWrite = fileSystem.probes.find(item => item.op === 'writeFileSync(11 MiB)');
  const rawText = `裸写 11 MiB ${probeText(rawWrite?.outcome)}；${accountingText(quotaAccounting)}`;
  if (isSkipped(core)) return { matrixRow: row, verdict: 'unknown', evidence: `数据库配额实验未运行；${rawText}` };
  const { quota } = core;
  if (quota.status === 'not-triggered') {
    const evidence = `写入 ${quota.insertedRows} × ${quota.plan.blobBytes} bytes 未触发配额；${rawText}`;
    return { matrixRow: row, verdict: 'unknown', evidence };
  }
  if (quota.status === 'failed' || !quota.failure || !quota.afterFailure) {
    return {
      matrixRow: row,
      verdict: 'unknown',
      evidence: `配额实验在「${quota.stageFailure?.stage}」中止；${rawText}`
    };
  }
  const { reopenCount, reopenIntegrity } = quota.afterFailure;
  const recovered =
    reopenCount.ok && reopenCount.value === quota.insertedRows && reopenIntegrity.ok && reopenIntegrity.value === 'ok';
  const evidence =
    `第 ${quota.failure.atRow} 行撞配额（${errorText(quota.failure.error)}）；` +
    `重开后行数 ${reopenCount.ok ? String(reopenCount.value) : probeText(reopenCount)} / 已提交 ${quota.insertedRows}，` +
    `integrity ${reopenIntegrity.ok ? String(reopenIntegrity.value) : probeText(reopenIntegrity)}；${rawText}`;
  return { matrixRow: row, verdict: recovered ? 'pass' : 'fail', evidence };
}

function persistenceFinding({ core }: FindingsInput): Finding {
  const row = '持久化';
  if (isSkipped(core)) return { matrixRow: row, verdict: 'unknown', evidence: `核心实验未运行：${core.skipped}` };
  const { persistence } = core;
  if (persistence.status === 'passed') {
    const files = (persistence.files ?? []).map(file => `${file.path} ${file.size} bytes`).join('、');
    const evidence = `关闭重开后 ${persistence.reopenedRows?.length} 行逐字一致，integrity ok；文件：${files}`;
    return { matrixRow: row, verdict: 'pass', evidence };
  }
  const failure = persistence.failure;
  const evidence = failure ? `停在「${failure.stage}」：${errorText(failure.error)}` : '失败但没有记录原因';
  return { matrixRow: row, verdict: 'fail', evidence };
}

/** 按 {@link MATRIX_ROWS} 的顺序给出判定。 */
export function buildFindings(input: FindingsInput): Finding[] {
  const findings = [
    wasmFinding(input),
    fileSystemFinding(input),
    randomFinding(input),
    userDataFinding(input),
    persistenceFinding(input)
  ];
  if (!input.globalThisShimmed) return findings;
  return findings.map(item =>
    SHIM_INDEPENDENT_ROWS.includes(item.matrixRow) ? item : { ...item, evidence: item.evidence + SHIM_CONDITION }
  );
}
