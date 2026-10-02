/**
 * @fileoverview 把报告压成可行性矩阵抖音列的逐行判定。
 *
 * 判定只针对「这一台设备、这一次运行」；矩阵要的是开发者工具 + Android + iOS 三份报告都 pass。
 * 证据不足一律给 `unknown`，不往 pass 上靠。
 */
import type { CoreExperimentReport, DatabaseFile } from './core-contract.js';
import type { DescribedError } from './describe-error.js';
import type { FileSystemReport } from './experiments/fs-errors.js';
import type { QuotaAccountingReport } from './experiments/quota-accounting.js';
import type { RandomSummary } from './experiments/random.js';
import type { WasmPathReport } from './experiments/wasm-path.js';
import type { Probe, Skipped } from './probe.js';
import { VFS_QUOTA_EXCEEDED_PATTERN } from './vfs-classifiers.js';

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
}

/** SQLite 的 `SQLITE_FULL`：adapter 把平台配额错误映射成它。 */
const SQLITE_FULL = 13;

function errorText(error: DescribedError): string {
  return error.errMsg ?? error.message ?? error.text;
}

function probeText(result: Probe<unknown> | undefined): string {
  if (!result) return '未运行';
  return result.ok ? '成功' : `失败（${errorText(result.error)}）`;
}

/** 沿 cause 链展开，自身在前。 */
function causeChain(error: DescribedError): DescribedError[] {
  const chain: DescribedError[] = [];
  for (let current: DescribedError | undefined = error; current; current = current.cause) chain.push(current);
  return chain;
}

/** 撞配额那条错误的分类：cause 链上有没有 `SQLITE_FULL`、有没有平台配额原文。 */
function classifyQuotaFailure(error: DescribedError): { readonly full: boolean; readonly platformText?: string } {
  const chain = causeChain(error);
  const full = chain.some(item => item.codes['code'] === SQLITE_FULL);
  const platformText = chain.map(errorText).find(text => VFS_QUOTA_EXCEEDED_PATTERN.test(text));
  return { full, platformText };
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

/**
 * 分块文件的块号空洞：`P.n` 在而 `P.0`…`P.n-1` 缺的那些块路径，去重后按出现顺序排列。
 * 撞配额后关闭的库文件不该有空洞；有就说明有孤儿块落在空洞之后，库再长回来就会被判「非末块不满」。
 */
export function chunkGaps(files: readonly DatabaseFile[]): string[] {
  const present = new Set(files.map(file => file.path));
  const gaps = files.flatMap(({ path }) => {
    const match = /^(.*)\.(\d+)$/.exec(path);
    if (!match) return [];
    return Array.from({ length: Number(match[2]) }, (_, index) => `${match[1]}.${index}`);
  });
  return [...new Set(gaps)].filter(path => !present.has(path)).sort(byChunkIndex);
}

function byChunkIndex(left: string, right: string): number {
  return Number(/\d+$/.exec(left)?.[0]) - Number(/\d+$/.exec(right)?.[0]) || left.localeCompare(right);
}

function chunkLayoutText(files: Probe<readonly DatabaseFile[]>, gaps: readonly string[] | undefined): string {
  if (gaps === undefined) return `关闭后列文件${probeText(files)}`;
  return gaps.length === 0 ? '块号连续' : `块号空洞：缺 ${gaps.join('、')}`;
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
  const { reopenCount, reopenIntegrity, filesAfterDisconnect } = quota.afterFailure;
  const gaps = filesAfterDisconnect.ok ? chunkGaps(filesAfterDisconnect.value) : undefined;
  const recovered =
    reopenCount.ok && reopenCount.value === quota.insertedRows && reopenIntegrity.ok && reopenIntegrity.value === 'ok';
  const { full, platformText } = classifyQuotaFailure(quota.failure.error);
  const classified = `${full ? 'SQLITE_FULL' : '不是 SQLITE_FULL'}，平台原文${platformText ? `「${platformText}」` : '不在 cause 链上'}`;
  const evidence =
    `第 ${quota.failure.atRow} 行撞配额（${errorText(quota.failure.error)}；${classified}）；` +
    `重开后行数 ${reopenCount.ok ? String(reopenCount.value) : probeText(reopenCount)} / 已提交 ${quota.insertedRows}，` +
    `integrity ${reopenIntegrity.ok ? String(reopenIntegrity.value) : probeText(reopenIntegrity)}，` +
    `${chunkLayoutText(filesAfterDisconnect, gaps)}；${rawText}`;
  const passed = recovered && full && platformText !== undefined && gaps?.length === 0;
  return { matrixRow: row, verdict: passed ? 'pass' : 'fail', evidence };
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
  return [
    wasmFinding(input),
    fileSystemFinding(input),
    randomFinding(input),
    userDataFinding(input),
    persistenceFinding(input)
  ];
}
