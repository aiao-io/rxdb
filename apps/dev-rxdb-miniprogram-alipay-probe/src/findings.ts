/**
 * @fileoverview 把报告压成可行性矩阵支付宝列的逐行判定。
 *
 * 判定只针对「这一台设备、这一次运行」；矩阵要的是开发者工具 + Android + iOS 三份报告都 pass。
 * 证据不足一律给 `unknown`，不往 pass 上靠。走的是实验 host（FS 包装层 + Worker 随机源），
 * pass 说明「照这个形态写正式 host 可行」，不说明 adapter 现状支持支付宝。
 */
import { isAlipayFsFailure } from './alipay-fs.js';
import type { CoreExperimentReport, DatabaseFile } from './core-contract.js';
import type { DescribedError } from './describe-error.js';
import { OVER_SINGLE_FILE_OP, type FileSystemReport } from './experiments/fs-errors.js';
import type { RawFsReport, RawWriteMode } from './experiments/fs-raw.js';
import type { FolderLimitScope, QuotaAccountingReport } from './experiments/quota-accounting.js';
import type { RandomReport } from './experiments/random.js';
import type { WasmReport } from './experiments/wasm.js';
import type { Probe, Skipped } from './probe.js';
import type { RuntimeRepairs } from './runtime-repairs.js';
import { VFS_QUOTA_EXCEEDED_PATTERN } from './vfs-classifiers.js';

/** 可行性矩阵里支付宝列需要实验证据的行，顺序与矩阵一致。 */
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
  readonly random: RandomReport;
  readonly runtimeRepairs: Probe<RuntimeRepairs>;
  readonly prepare: Probe<unknown>;
  readonly wasm: WasmReport;
  readonly rawFs: RawFsReport;
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

/**
 * 顶层错误加 cause 链上最深一条带 `message` 的错误：`sqlite3_open_v2` 这类顶层消息说明不了为什么失败；
 * 再往里的平台原始对象只有 `errorMessage`，路径与错误码在包装它的 `AlipayFsError` 上。
 */
function chainText(error: DescribedError): string {
  const root = causeChain(error)
    .filter(item => item.message !== undefined)
    .at(-1);
  return root === undefined || root === error ? errorText(error) : `${errorText(error)}；根因：${errorText(root)}`;
}

/** 撞配额那条错误的分类：cause 链上有没有 `SQLITE_FULL`、有没有平台配额原文。 */
function classifyQuotaFailure(error: DescribedError): { readonly full: boolean; readonly platformText?: string } {
  const chain = causeChain(error);
  const full = chain.some(item => item.codes['code'] === SQLITE_FULL);
  const platformText = chain.map(errorText).find(text => VFS_QUOTA_EXCEEDED_PATTERN.test(text));
  return { full, platformText };
}

function isSkipped(value: object): value is Skipped {
  return 'skipped' in value;
}

function codePackageBinaryText({ codePackageBinary }: WasmReport): string {
  if (!codePackageBinary.ok) return `代码包二进制读取对比失败：${probeText(codePackageBinary)}`;
  const { binaryBytes, textBytes, bytesMatch } = codePackageBinary.value;
  if (bytesMatch) return '代码包二进制读取原样';
  return `代码包二进制读取被改写（${String(binaryBytes)} / ${String(textBytes)} 字节），wasm 只能读 base64 文本副本`;
}

function wasmFinding({ wasm, core }: FindingsInput): Finding {
  const row = 'WASM';
  if (!wasm.standardAvailable) {
    const evidence =
      '逻辑层没有标准 WebAssembly（Worker 的 MYWebAssembly 只能按代码包路径实例化，adapter 的同步 VFS 用不了）';
    return { matrixRow: row, verdict: 'fail', evidence };
  }
  if (!isSkipped(core) && core.persistence.status === 'passed') {
    const evidence =
      `adapter 经逻辑层标准 WebAssembly 实例化 '${core.persistence.wasmPath}'（字节由同步 FS 从代码包的 base64 文本副本读出）` +
      `完成建库、读写、关闭重开；文档未写逻辑层有 WebAssembly；${codePackageBinaryText(wasm)}`;
    return { matrixRow: row, verdict: 'pass', evidence };
  }
  if (!isSkipped(wasm.add) && wasm.add.ok && wasm.add.value === 5) {
    return {
      matrixRow: row,
      verdict: 'unknown',
      evidence: 'add.wasm 实例化成功，但 adapter 实例化未验证（核心实验未通过或未运行）'
    };
  }
  const add = isSkipped(wasm.add) ? wasm.add.skipped : probeText(wasm.add);
  return { matrixRow: row, verdict: 'fail', evidence: `add.wasm 实例化：${add}` };
}

const RAW_WRITE_MODES: readonly RawWriteMode[] = ['arrayBuffer', 'arrayBufferBinary', 'base64String', 'typedArray'];

function rawWriteText(rawFs: RawFsReport): string {
  return RAW_WRITE_MODES.map(mode => `${mode} ${rawFs.writeModes[mode].bytesMatch ? '一致' : '不一致'}`).join('、');
}

/** 原始 FS 调用的结果：返回失败对象记错误码，正常返回记成功，抛错记原文。 */
function rawCallText(result: Probe<unknown>): string {
  if (!result.ok) return `抛错（${errorText(result.error)}）`;
  if (!isAlipayFsFailure(result.value)) return '成功';
  return `返回 error ${String(result.value.error ?? result.value.errorCode)}`;
}

function fileSystemFinding({ fileSystem, rawFs }: FindingsInput): Finding {
  const row = '同步 FS';
  if (fileSystem.probes.length === 0) return { matrixRow: row, verdict: 'unknown', evidence: '没有跑任何探测' };
  const rawText =
    `裸写空串${rawCallText(rawFs.emptyWrite)}、写到不存在的父目录${rawCallText(rawFs.missingParentWrite)}；` +
    `裸写各传参读回字节：${rawWriteText(rawFs)}`;
  const failing = fileSystem.probes.filter(item => !item.asExpected);
  if (failing.length === 0 && rawFs.writeModes.base64String.bytesMatch) {
    const evidence =
      `经包装层与分帧层（失败返回值转抛错、错误码归一、只用 base64 串写、每个文件垫 1 字节头）${fileSystem.probes.length} 条探测` +
      `全部符合 adapter VFS 的预期；${rawText}`;
    return { matrixRow: row, verdict: 'pass', evidence };
  }
  const details = failing.map(item => `${item.op} 期望「${item.expectation}」，实际${probeText(item.outcome)}`);
  return { matrixRow: row, verdict: 'fail', evidence: [...details, rawText].join('；') };
}

function randomFinding({ random, prepare }: FindingsInput): Finding {
  const row = '随机源';
  const logic = `逻辑层 my.getRandomValues ${random.logic.myGetRandomValues}、crypto ${random.logic.crypto}`;
  if (isSkipped(random.worker)) {
    return { matrixRow: row, verdict: 'fail', evidence: `${logic}；Worker 随机源未运行：${random.worker.skipped}` };
  }
  const pool = random.worker['65536'];
  if (!pool?.ok)
    return { matrixRow: row, verdict: 'fail', evidence: `${logic}；Worker 取 65536 字节${probeText(pool)}` };
  if (pool.value.allZero) return { matrixRow: row, verdict: 'fail', evidence: `${logic}；Worker 取 65536 字节全零` };
  if (!prepare.ok) {
    return {
      matrixRow: row,
      verdict: 'fail',
      evidence: `${logic}；prepareMiniProgramHostRuntime ${probeText(prepare)}`
    };
  }
  const evidence =
    `${logic}；经 Worker crypto.getRandomValues 桥接：64 KiB 成功（${pool.value.distinctByteValues} 种字节值），` +
    `1 MiB ${probeText(random.worker['1048576'])}；prepare 成功`;
  return { matrixRow: row, verdict: 'pass', evidence };
}

const MIB = 1024 * 1024;

const SCOPE_TEXT: Record<FolderLimitScope, string> = {
  'direct-folder': '只算直接所在目录（兄弟目录还能写）',
  'ancestor-or-user-dir': '算在上级目录或整个用户目录（兄弟目录也写不进）'
};

function accountingText({ largestSingleWriteBytes, firstSingleFailure, fill }: QuotaAccountingReport): string {
  const limit = firstSingleFailure ? '' : '（到计划上限都没失败）';
  const single = `单文件最多写入 ${largestSingleWriteBytes / MIB} MiB${limit}`;
  if (fill.fileBytes === 0) return `${single}；单文件一次都没写成功，没做文件夹实验`;
  const files = `${fill.filesWritten} 个 ${fill.fileBytes / MIB} MiB 文件共 ${fill.bytesWritten / MIB} MiB`;
  const fillText =
    fill.failure ?
      `写入 ${files} 后第 ${fill.failure.atFile} 个失败（${errorText(fill.failure.error)}）`
    : `写入 ${files} 没撞到上限`;
  const scope = fill.scope ? `，计费范围${SCOPE_TEXT[fill.scope]}` : '';
  return `${single}；文件夹${fillText}${scope}`;
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
  const rawWrite = fileSystem.probes.find(item => item.op === OVER_SINGLE_FILE_OP);
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

function repairsText(repairs: Probe<RuntimeRepairs>): string {
  if (!repairs.ok || repairs.value.installed.length === 0) return '';
  return `；实验 host 补了 ${repairs.value.installed.join('、')}`;
}

function persistenceFinding({ core, runtimeRepairs }: FindingsInput): Finding {
  const row = '持久化';
  if (isSkipped(core)) return { matrixRow: row, verdict: 'unknown', evidence: `核心实验未运行：${core.skipped}` };
  const { persistence } = core;
  if (persistence.status === 'passed') {
    const files = (persistence.files ?? []).map(file => `${file.path} ${file.size} bytes`).join('、');
    const evidence = `关闭重开后 ${persistence.reopenedRows?.length} 行逐字一致，integrity ok；文件：${files}${repairsText(runtimeRepairs)}`;
    return { matrixRow: row, verdict: 'pass', evidence };
  }
  const failure = persistence.failure;
  const evidence = failure ? `停在「${failure.stage}」：${chainText(failure.error)}` : '失败但没有记录原因';
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
