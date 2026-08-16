/**
 * @fileoverview v2 的两个穷举错误联合，以及对外错误 envelope 的形状与脱敏规则。
 *
 * @remarks
 * 控制面与 provider 两个联合**互不相交**，这不是命名洁癖：处理路径不同。控制面错误由
 * session/transfer 状态机产生并触发资源清理；provider 错误由数据面产生、可能带 `retryable`
 * 让 panel 重试。一个码同时属于两边，就意味着同一个码在两条路径上有两种清理行为。
 * `transfer_timeout` 是最容易放错的一个——它是**控制面**的，因为时限由状态机而非 provider 掌握。
 *
 * @module @aiao/rxdb-devtools/v2/errors
 */

import { hasExactKeys, isRecord } from '../internal/guards.js';

/**
 * 控制面错误码（恰好 12 个）。
 *
 * @remarks
 * 顺序与 US-904b「控制面错误」一节一致，便于逐条比对。
 */
export const DEVTOOLS_CONTROL_PLANE_ERROR_CODES = [
  'protocol_unsupported',
  'invalid_message',
  'invalid_identifier',
  'session_invalid',
  'session_closed',
  'session_budget_exhausted',
  'request_limit_exceeded',
  'transfer_limit_exceeded',
  'request_timeout',
  'transfer_timeout',
  'request_duplicate',
  'transfer_duplicate'
] as const;

/** 控制面错误码。 */
export type DevToolsControlPlaneErrorCode = (typeof DEVTOOLS_CONTROL_PLANE_ERROR_CODES)[number];

/**
 * provider 数据面错误码（恰好 18 个）。
 *
 * @remarks
 * DOMException、Node/Rust 错误码与 host 私有错误必须映射到这里；无法安全归类时只用
 * `operation_failed`。transport 不得临时发明平台私有码——那正是三端错误分叉的起点。
 */
export const DEVTOOLS_PROVIDER_ERROR_CODES = [
  'provider_unsupported',
  'provider_unavailable',
  'invalid_path',
  'resource_not_found',
  'resource_conflict',
  'permission_denied',
  'storage_quota_exceeded',
  'payload_too_large',
  'payload_encoding_invalid',
  'transfer_sequence_invalid',
  'transfer_size_exceeded',
  'transfer_incomplete',
  'transfer_closed',
  'snapshot_expired',
  'snapshot_busy',
  'snapshot_too_large',
  'export_unsupported',
  'operation_failed'
] as const;

/** provider 数据面错误码。 */
export type DevToolsProviderErrorCode = (typeof DEVTOOLS_PROVIDER_ERROR_CODES)[number];

/** v2 对外可见的全部错误码。 */
export type DevToolsErrorCode = DevToolsControlPlaneErrorCode | DevToolsProviderErrorCode;

/** 对外错误 message 的最大字符数。 */
export const DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH = 200;

/** 换行是 stack 泄漏的标志；绝对路径覆盖 POSIX、Windows 盘符与 UNC 三种写法。 */
const MULTILINE_PATTERN = /[\r\n]/u;
const ABSOLUTE_PATH_PATTERN = /(?:^|[\s(:])(?:\/[^\s)]|[A-Za-z]:\\|\\\\)/u;

const ERROR_REQUIRED_KEYS = ['code', 'retryable'] as const;
const ERROR_OPTIONAL_KEYS = ['message'] as const;

/** 对外错误 envelope。 */
export interface DevToolsErrorPayload {
  /** 穷举联合中的错误码。 */
  readonly code: DevToolsErrorCode;
  /** panel 是否可以原样重试。 */
  readonly retryable: boolean;
  /** 可选的脱敏说明；必须通过 {@link isRedactedErrorMessage}。 */
  readonly message?: string;
}

/** 创建错误 envelope 时的可选项。 */
export interface DevToolsErrorOptions {
  /** 默认 `false`。 */
  readonly retryable?: boolean;
  /** 静态文案，不得由平台异常拼接而来。 */
  readonly message?: string;
}

/**
 * 判断值是否为控制面错误码。
 *
 * @param value - 待检查值。
 * @returns 属于控制面联合时为 `true`。
 */
export function isControlPlaneErrorCode(value: unknown): value is DevToolsControlPlaneErrorCode {
  return typeof value === 'string' && DEVTOOLS_CONTROL_PLANE_ERROR_CODES.some(code => code === value);
}

/**
 * 判断值是否为 provider 错误码。
 *
 * @param value - 待检查值。
 * @returns 属于 provider 联合时为 `true`。
 */
export function isProviderErrorCode(value: unknown): value is DevToolsProviderErrorCode {
  return typeof value === 'string' && DEVTOOLS_PROVIDER_ERROR_CODES.some(code => code === value);
}

/**
 * 判断值是否为符合脱敏要求的错误说明。
 *
 * @remarks
 * 这是最后一道**机械**防线，不是充分条件：它挡不住「把 SQL 写成一行」这类泄漏，
 * 但能挡住实践中最常见的两类——直接透传 `error.stack`（多行）与直接透传平台异常
 * 里的绝对路径。真正的保证来自 `error-mapping` 只发静态文案，从不拼接平台文本。
 *
 * @param value - 待检查值。
 * @returns 非空、单行、无绝对路径且不超长时为 `true`。
 */
export function isRedactedErrorMessage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.trim().length === 0 || value.length > DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH) return false;
  return !MULTILINE_PATTERN.test(value) && !ABSOLUTE_PATH_PATTERN.test(value);
}

/**
 * 创建对外错误 envelope。
 *
 * @param code - 穷举联合中的错误码。
 * @param options - 可选的 `retryable` 与脱敏 message。
 * @returns 冻结形状的 {@link DevToolsErrorPayload}。
 * @throws TypeError 当 message 未通过脱敏校验时——宁可让实现崩在开发期，也不把路径发出去。
 */
export function createDevToolsError(code: DevToolsErrorCode, options: DevToolsErrorOptions = {}): DevToolsErrorPayload {
  const retryable = options.retryable ?? false;
  if (options.message === undefined) return { code, retryable };
  if (!isRedactedErrorMessage(options.message)) {
    throw new TypeError(`rxdb-devtools: error message for "${code}" failed redaction checks`);
  }
  return { code, retryable, message: options.message };
}

/**
 * 判断值是否为合法的对外错误 envelope。
 *
 * @param value - 待检查值。
 * @returns exact-key 且各字段合规时为 `true`。
 */
export function isDevToolsErrorPayload(value: unknown): value is DevToolsErrorPayload {
  if (!isRecord(value) || !hasExactKeys(value, ERROR_REQUIRED_KEYS, ERROR_OPTIONAL_KEYS)) return false;
  if (!isControlPlaneErrorCode(value['code']) && !isProviderErrorCode(value['code'])) return false;
  if (typeof value['retryable'] !== 'boolean') return false;
  return !Object.hasOwn(value, 'message') || isRedactedErrorMessage(value['message']);
}
