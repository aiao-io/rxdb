import { EntityType, getEntityMetadata, isRxDBBackupError, RxDBBackupManifest } from '@aiao/rxdb';
import { get_table_name_by_metadata } from '@aiao/rxdb-adapter-sqlite-core';

// e2e 失败现场归档（US-909 阶段 B）的纯函数部分：页内测试 API 与导入页共用，契约见
// `git show 2e820521:specs/004-us-909-failure-data-archive/data-model.md`。

/** 页内归档流程的阶段。 */
export type FailureArchiveStage = 'connect' | 'inspect' | 'backup';

/**
 * 没能归档的原因。`page` / `transfer` 由 Node 端 fixture 产生。
 */
export interface FailureArchiveReason {
  readonly stage: FailureArchiveStage | 'page' | 'transfer';
  /** `RxDBBackupError.code` / `timeout` / `context_unavailable` / `error`。 */
  readonly code: string;
  readonly message: string;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const isDeadline = (signal: AbortSignal): boolean =>
  signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';

/**
 * 把某个阶段抛出的值折成原因。
 *
 * @param stage - 出错的阶段
 * @param error - 捕获值
 * @param signal - 页内截止信号；截止已到时不论抛出什么都记 `timeout`（备份会把截止报成 `aborted`）
 * @returns 原因
 */
export function toFailureArchiveReason(
  stage: FailureArchiveStage,
  error: unknown,
  signal: AbortSignal
): FailureArchiveReason {
  if (isDeadline(signal)) return { stage, code: 'timeout', message: describeError(signal.reason) };
  return { stage, ...classifyError(error) };
}

// `RxDBBackupError` 取其 code，message 拼上 cause；其他抛出值归为 `error`
function classifyError(error: unknown): { code: string; message: string } {
  if (isRxDBBackupError(error)) {
    const cause = error.cause === undefined ? '' : ` (${describeError(error.cause)})`;
    return { code: error.code, message: `${error.message}${cause}` };
  }
  return { code: 'error', message: describeError(error) };
}

/**
 * 归档认不出原库名（{@link dbNameFromManifest}）：导入页报 `unsupported_archive`。
 */
export class UnsupportedArchiveError extends Error {
  override readonly name = 'UnsupportedArchiveError';
}

/** 导入页的失败：`code` 为 `RxDBBackupError.code` / `unsupported_archive` / `error`。 */
export interface FailureArchiveImportFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * 把导入流程（读 manifest、恢复）抛出的值折成导入页的失败。
 *
 * @param error - 捕获值
 * @returns 失败代码与消息
 */
export function toImportFailure(error: unknown): FailureArchiveImportFailure {
  if (error instanceof UnsupportedArchiveError) return { code: 'unsupported_archive', message: error.message };
  return classifyError(error);
}

/**
 * 导入失败时是否提供「打开该库」：目标里已经有同名库——`target_not_empty`（之前导入过），或 `target_busy`
 * （正被别的标签页打开着）。
 *
 * @param code - {@link FailureArchiveImportFailure.code}
 * @returns 可以直接打开已有的库时为 `true`
 */
export function canOpenExisting(code: string): boolean {
  return code === 'target_not_empty' || code === 'target_busy';
}

/**
 * 有上限的内存 sink。
 */
export interface CappedSink {
  /** 交给 `backup()` 的输出流；累计字节超过上限时 `write` 以 `RangeError` 拒绝。 */
  readonly stream: WritableStream<Uint8Array>;
  /** 按写入顺序拼出的完整字节。 */
  bytes(): Uint8Array;
}

/**
 * 建一个有上限的内存 sink：归档整份留在页面内存里，再一次性回传 Node，上限挡住异常大的库。
 *
 * @param maxBytes - 字节上限（含）
 * @returns sink
 */
export function createCappedSink(maxBytes: number): CappedSink {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      if (total + chunk.byteLength > maxBytes) throw new RangeError(`failure archive exceeds maxBytes ${maxBytes}`);
      // 拷贝：写入方可能复用同一块缓冲区
      chunks.push(chunk.slice());
      total += chunk.byteLength;
    }
  });
  const bytes = (): Uint8Array => {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  };
  return { stream, bytes };
}

// `String.fromCharCode(...chunk)` 的参数个数有上限，分块展开
const BASE64_CHUNK = 0x8000;

/**
 * 字节转 base64（`page.evaluate` 只能回传可序列化值）。
 *
 * @param bytes - 原始字节
 * @returns base64 串
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK));
  }
  return btoa(binary);
}

/**
 * base64 转字节。
 *
 * @param base64 - base64 串
 * @returns 原始字节
 */
export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/**
 * 从归档 manifest 取原始库名。
 *
 * @remarks
 * manifest 没有库名字段；`encryption.authDomain` 是源实例的 `config.dbName`（`<库名>@<后缀>`），取最后一个 `@`
 * 之前的部分。后缀不在这里比对（`RXDB_DB_NAME_SUFFIX` 不在 `@aiao/rxdb` 公开面上）：按这个库名构造的目标实例
 * 后缀不符时，`restore()` 自己的兼容性校验报 `auth_domain_mismatch`。
 *
 * @param manifest - 归档 manifest
 * @returns 原始库名
 * @throws UnsupportedArchiveError 没有加密认证域，或认证域不是 `<库名>@<后缀>` 的形状
 */
export function dbNameFromManifest(manifest: Pick<RxDBBackupManifest, 'encryption'>): string {
  const authDomain = manifest.encryption?.authDomain;
  if (authDomain === undefined)
    throw new UnsupportedArchiveError('Archive has no encryption.authDomain; cannot tell its database name');
  const at = authDomain.lastIndexOf('@');
  if (at <= 0) throw new UnsupportedArchiveError(`Archive authDomain "${authDomain}" is not "<dbName>@<suffix>"`);
  return authDomain.slice(0, at);
}

/**
 * 业务表名：按实体元数据算出，不按前缀猜系统表。
 *
 * @param entities - 实体类（克隆的实体类元数据相同）
 * @returns 去重排序后的表名
 */
export function businessTableNames(entities: readonly EntityType[]): string[] {
  const names = entities.map(entity => get_table_name_by_metadata(getEntityMetadata(entity)));
  return [...new Set(names)].sort();
}
