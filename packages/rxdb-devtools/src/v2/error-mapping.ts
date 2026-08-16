/**
 * @fileoverview 平台异常 → provider 穷尽错误联合的共享映射。
 *
 * @remarks
 * 没有这一层，DOMException、Node `errno` 与 Rust `io::ErrorKind` 会直接穿透到 wire 上，
 * 同一件事（文件不存在）在 Chrome、Electron、Tauri 三端变成三个互不相同的码，panel 只能
 * 为每个平台写一份分支——而那正是共享契约要消灭的东西。
 *
 * 两条结构性约束：
 *
 * 1. **映射永远不产出 `message`。** 平台消息里混着绝对路径、SQL 与 bind 值、加密字段、
 *    文件内容片段和栈帧；靠正则「脱敏」只能挡住其中长得像路径的一类。唯一能在结构上保证
 *    不泄漏的做法，是**根本不提供转发通道**：需要人类可读补充时，由调用点用本地写死的
 *    文案自行附加，绝不从平台错误里派生。
 * 2. **`retryable` 由码决定，不由平台决定。** 同一个码在三端给出不同的可重试性，会让 panel
 *    的重试策略随平台漂移；这种漂移只在某一端复现，最难发现。
 *
 * 兜底到 `operation_failed` 是**最后手段**：它会吸收掉一切未登记的情况，所以新增平台错误的
 * 正确做法是往下面的表里**加行**，而不是让它落进兜底。`@aiao/rxdb-devtools/testing` 导出的
 * fixture 表配合 meta-test 就是为此设的闸——见 `testing/error-fixtures.ts`。
 *
 * @module @aiao/rxdb-devtools/v2/error-mapping
 */

import type { DevToolsErrorPayload, DevToolsProviderErrorCode } from './errors.js';
import { createDevToolsError, DEVTOOLS_PROVIDER_ERROR_CODES } from './errors.js';
import { isRecord } from './guards.js';

/**
 * 错误的来源平台。
 *
 * @remarks
 * 由调用方显式给出，**不做运行时嗅探**：Node 错误的 `name` 完全可能恰好等于某个
 * DOMException 名，嗅探会在那种情况下给出错误的分类，而调用方本来就确知自己跑在哪一端。
 */
export type DevToolsErrorOrigin = 'dom' | 'node' | 'rust';

/**
 * 每个 provider 错误码是否值得对端重试。
 *
 * @remarks
 * 只有「等一会儿真的可能变好」的码为 `true`。配额耗尽、路径非法、资源冲突都需要人或上层
 * 改变输入，标成可重试会诱导 panel 空转。
 *
 * 写成 `satisfies Record<DevToolsProviderErrorCode, boolean>`：新增错误码却忘记表态，
 * 直接编译失败。
 */
export const DEVTOOLS_PROVIDER_ERROR_RETRYABLE = {
  provider_unsupported: false,
  provider_unavailable: true,
  invalid_path: false,
  resource_not_found: false,
  resource_conflict: false,
  permission_denied: false,
  storage_quota_exceeded: false,
  payload_too_large: false,
  payload_encoding_invalid: false,
  transfer_sequence_invalid: false,
  transfer_size_exceeded: false,
  transfer_incomplete: false,
  transfer_closed: false,
  snapshot_expired: false,
  snapshot_busy: true,
  snapshot_too_large: false,
  export_unsupported: false,
  operation_failed: false
} as const satisfies Record<DevToolsProviderErrorCode, boolean>;

/** DOMException `name` → provider 码。OPFS 与 File System Access 用的就是这一组。 */
const DOM_ERROR_CODES: Readonly<Record<string, DevToolsProviderErrorCode>> = {
  NotFoundError: 'resource_not_found',
  NotAllowedError: 'permission_denied',
  SecurityError: 'permission_denied',
  InvalidModificationError: 'resource_conflict',
  NoModificationAllowedError: 'resource_conflict',
  QuotaExceededError: 'storage_quota_exceeded',
  TypeMismatchError: 'invalid_path',
  SyntaxError: 'invalid_path',
  InvalidStateError: 'provider_unavailable',
  NotSupportedError: 'provider_unavailable'
};

/** Node `error.code` → provider 码。 */
const NODE_ERROR_CODES: Readonly<Record<string, DevToolsProviderErrorCode>> = {
  ENOENT: 'resource_not_found',
  EACCES: 'permission_denied',
  EPERM: 'permission_denied',
  EROFS: 'permission_denied',
  EEXIST: 'resource_conflict',
  ENOTEMPTY: 'resource_conflict',
  EBUSY: 'resource_conflict',
  ENOSPC: 'storage_quota_exceeded',
  EDQUOT: 'storage_quota_exceeded',
  EINVAL: 'invalid_path',
  ENAMETOOLONG: 'invalid_path',
  EISDIR: 'invalid_path',
  ENOTDIR: 'invalid_path',
  ELOOP: 'invalid_path',
  ENODEV: 'provider_unavailable',
  EAGAIN: 'provider_unavailable'
};

/** Rust `std::io::ErrorKind` 名 → provider 码。 */
const RUST_ERROR_CODES: Readonly<Record<string, DevToolsProviderErrorCode>> = {
  NotFound: 'resource_not_found',
  PermissionDenied: 'permission_denied',
  ReadOnlyFilesystem: 'permission_denied',
  AlreadyExists: 'resource_conflict',
  DirectoryNotEmpty: 'resource_conflict',
  ResourceBusy: 'resource_conflict',
  StorageFull: 'storage_quota_exceeded',
  QuotaExceeded: 'storage_quota_exceeded',
  InvalidFilename: 'invalid_path',
  InvalidInput: 'invalid_path',
  NotADirectory: 'invalid_path',
  IsADirectory: 'invalid_path',
  NotConnected: 'provider_unavailable',
  Unsupported: 'provider_unavailable'
};

const ORIGIN_TABLES: Readonly<Record<DevToolsErrorOrigin, Readonly<Record<string, DevToolsProviderErrorCode>>>> = {
  dom: DOM_ERROR_CODES,
  node: NODE_ERROR_CODES,
  rust: RUST_ERROR_CODES
};

/** 每个来源的判别字段名。 */
const ORIGIN_FIELDS = { dom: 'name', node: 'code', rust: 'kind' } as const satisfies Record<
  DevToolsErrorOrigin,
  string
>;

/**
 * 取出该来源的判别字段。
 *
 * @remarks
 * 每个来源**只**读它自己的字段：DOM 读 `name`、Node 读 `code`、Rust 读 `kind`
 * （Tauri 也常把 `ErrorKind` 直接序列化成字符串）。跨字段兜底看似宽容，实际上会让
 * 一个 `name` 恰好撞名的 Node 错误被分到 DOM 的类别里。
 */
function discriminator(origin: DevToolsErrorOrigin, error: unknown): string | undefined {
  if (origin === 'rust' && typeof error === 'string') return error;
  if (!isRecord(error)) return undefined;

  const value = error[ORIGIN_FIELDS[origin]];
  return typeof value === 'string' ? value : undefined;
}

/**
 * 把一个平台异常映射成 provider 错误载荷。
 *
 * @remarks
 * 结果**不含** `message`；平台的消息、栈与原始错误码一律不出门。
 *
 * @param origin - 调用方所处的平台，不做嗅探。
 * @param error - 平台抛出或回传的任意值。
 * @returns 穷尽联合里的一个码，外加由 {@link DEVTOOLS_PROVIDER_ERROR_RETRYABLE} 决定的可重试性。
 */
export function mapPlatformError(origin: DevToolsErrorOrigin, error: unknown): DevToolsErrorPayload {
  const key = discriminator(origin, error);
  const table = ORIGIN_TABLES[origin];
  const code = key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
  return createProviderError(code ?? 'operation_failed');
}

/**
 * 按共享的可重试性表构造一个 provider 错误。
 *
 * @remarks
 * 协议自身产生的 provider 错误（transfer、snapshot、授权）也走这里，
 * 好让「同一个码的可重试性」在平台映射与协议逻辑之间不会分叉。
 *
 * @param code - provider 错误码。
 * @returns 对应的错误载荷。
 */
export function createProviderError(code: DevToolsProviderErrorCode): DevToolsErrorPayload {
  return createDevToolsError(code, { retryable: DEVTOOLS_PROVIDER_ERROR_RETRYABLE[code] });
}

/**
 * 本模块登记的全部平台错误码，按来源分组。
 *
 * @remarks
 * 供 conformance fixture 与文档核对使用；不是运行时决策的输入。
 */
export const DEVTOOLS_PLATFORM_ERROR_KEYS: Readonly<Record<DevToolsErrorOrigin, readonly string[]>> = {
  dom: Object.keys(DOM_ERROR_CODES),
  node: Object.keys(NODE_ERROR_CODES),
  rust: Object.keys(RUST_ERROR_CODES)
};

/**
 * 平台映射能够产出的全部 provider 码。
 *
 * @remarks
 * 其余码只可能由协议逻辑（transfer、snapshot、授权、导出）产生。fixture 表的 meta-test
 * 用这个集合区分「该由平台 fixture 覆盖」与「该由协议 fixture 覆盖」。
 */
export const DEVTOOLS_MAPPABLE_ERROR_CODES: readonly DevToolsProviderErrorCode[] = DEVTOOLS_PROVIDER_ERROR_CODES.filter(
  code =>
    code === 'operation_failed' ||
    Object.values(ORIGIN_TABLES).some(table => Object.values(table).some(mapped => mapped === code))
);
