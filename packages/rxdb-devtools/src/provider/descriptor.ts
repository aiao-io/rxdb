/**
 * @fileoverview 三领域 provider descriptor：语义 kind、操作集合、runtime 与资源限制。
 *
 * @remarks
 * descriptor 是「这个 session 里存在哪些 provider、各自支持什么」的唯一声明。它同时是
 * 三层授权矩阵的中间那一层——`capability` 说「这个连接被允许做多重的事」，descriptor 说
 * 「这个 provider 实际实现了什么」，`mutationPolicy` 说「owner 是否为写操作单独开了口」。
 *
 * **`runtime` 只用于显示。** 相同 kind 在 browser / electron / tauri 上跑同一份 conformance；
 * 任何「按 runtime、按 URL、按 adapter 名或按字段缺失推断行为」的实现都会让三端语义分叉，
 * 而分叉的表现是某一端悄悄少做一件事，没有任何一侧报错。
 *
 * @module @aiao/rxdb-devtools/provider/descriptor
 */

import { DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT } from '../v2/constants.js';
import { hasExactKeys, isRecord, isSafeIntegerInRange } from '../v2/guards.js';

/** provider 领域。 */
export const DEVTOOLS_PROVIDER_DOMAINS = ['database', 'files', 'settings'] as const;

/** provider 领域。 */
export type DevToolsProviderDomain = (typeof DEVTOOLS_PROVIDER_DOMAINS)[number];

/** provider 运行时；**只用于显示**，不得参与行为判定。 */
export const DEVTOOLS_PROVIDER_RUNTIMES = ['browser', 'electron', 'tauri'] as const;

/** provider 运行时。 */
export type DevToolsProviderRuntime = (typeof DEVTOOLS_PROVIDER_RUNTIMES)[number];

/** 每个领域允许的语义 kind。 */
export const DEVTOOLS_PROVIDER_KINDS = {
  database: ['rxdb', 'unavailable'],
  files: ['opfs', 'native-files', 'unavailable'],
  settings: ['opfs', 'idb', 'sqlite', 'unavailable']
} as const satisfies Record<DevToolsProviderDomain, readonly string[]>;

/** 领域到语义 kind 的映射。 */
export type DevToolsProviderKind<TDomain extends DevToolsProviderDomain = DevToolsProviderDomain> =
  (typeof DEVTOOLS_PROVIDER_KINDS)[TDomain][number];

/**
 * 每个领域可声明的操作，**顺序即协议定义顺序**。
 *
 * @remarks
 * descriptor 里的 `operations` 必须是本列表的有序子集。要求有序而不是「集合相等即可」，
 * 是为了让 descriptor 有唯一的规范形式：否则同一份能力有 N! 种合法写法，
 * 跨端 fixture 对比与快照测试都会因书写顺序而假红。
 */
export const DEVTOOLS_PROVIDER_OPERATIONS = {
  database: ['inspect', 'query', 'events', 'get-branches', 'switch-branch', 'create-branch', 'delete-branch'],
  files: ['list', 'download', 'upload', 'create-directory', 'delete'],
  settings: ['clear', 'export']
} as const satisfies Record<DevToolsProviderDomain, readonly string[]>;

/** 领域到操作名的映射。 */
export type DevToolsProviderOperation<TDomain extends DevToolsProviderDomain = DevToolsProviderDomain> =
  (typeof DEVTOOLS_PROVIDER_OPERATIONS)[TDomain][number];

/**
 * `kind: 'unavailable'` 时必须携带的共享 reason code。
 *
 * @remarks
 * 共享而不是各端自定义文案：panel 要按 reason 决定提示语与是否给出重试入口，
 * 自由文本会让这个分支变成字符串匹配。
 */
export const DEVTOOLS_UNAVAILABLE_REASONS = [
  'not_configured',
  'permission_denied',
  'runtime_unsupported',
  'initialization_failed'
] as const;

/** provider 不可用的原因。 */
export type DevToolsUnavailableReason = (typeof DEVTOOLS_UNAVAILABLE_REASONS)[number];

/** provider 声明的资源限制。 */
export interface DevToolsProviderLimits {
  /** 单次 transfer 的最大字节数；0～1 GiB 的非负 safe integer。 */
  readonly maxTransferBytes: number;
}

/** provider descriptor；每个领域最多一份。 */
export interface DevToolsProviderDescriptor {
  readonly domain: DevToolsProviderDomain;
  /** descriptor schema 版本，固定为 1。 */
  readonly version: 1;
  readonly kind: DevToolsProviderKind;
  /** 协议定义顺序的有序子集；`unavailable` 时必须为空。 */
  readonly operations: readonly DevToolsProviderOperation[];
  readonly runtime: DevToolsProviderRuntime;
  readonly limits: DevToolsProviderLimits;
  /** 仅当 `kind === 'unavailable'` 时存在且必填。 */
  readonly reason?: DevToolsUnavailableReason;
}

/** 需要 `maxTransferBytes > 0` 的 files 操作。 */
const FILES_TRANSFER_OPERATIONS: readonly string[] = ['download', 'upload'];

const DESCRIPTOR_REQUIRED_KEYS = ['domain', 'version', 'kind', 'operations', 'runtime', 'limits'] as const;
const DESCRIPTOR_OPTIONAL_KEYS = ['reason'] as const;
const LIMITS_REQUIRED_KEYS = ['maxTransferBytes'] as const;

/**
 * 判断值是否为已知的 provider 领域。
 *
 * @param value - 待检查值。
 * @returns 是三个领域之一时为 `true`。
 */
export function isDevToolsProviderDomain(value: unknown): value is DevToolsProviderDomain {
  return typeof value === 'string' && DEVTOOLS_PROVIDER_DOMAINS.some(domain => domain === value);
}

function isRuntime(value: unknown): value is DevToolsProviderRuntime {
  return typeof value === 'string' && DEVTOOLS_PROVIDER_RUNTIMES.some(runtime => runtime === value);
}

function isLimits(value: unknown): value is DevToolsProviderLimits {
  if (!isRecord(value) || !hasExactKeys(value, LIMITS_REQUIRED_KEYS)) return false;
  return isSafeIntegerInRange(value['maxTransferBytes'], 0, DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT);
}

/** 判断 `operations` 是否为该领域协议顺序的有序、无重复子集。 */
function isOrderedOperationSubset(value: unknown, domain: DevToolsProviderDomain): boolean {
  if (!Array.isArray(value)) return false;
  const catalogue: readonly string[] = DEVTOOLS_PROVIDER_OPERATIONS[domain];
  let nextAllowedIndex = 0;

  for (const operation of value as readonly unknown[]) {
    if (typeof operation !== 'string') return false;
    const index = catalogue.indexOf(operation);
    // `indexOf < nextAllowedIndex` 一次同时挡下乱序与重复：重复项的下标必然小于游标。
    if (index < nextAllowedIndex) return false;
    nextAllowedIndex = index + 1;
  }
  return true;
}

/** `unavailable` 必须无操作且带 reason；其余 kind 必须没有 reason。 */
function hasValidAvailability(value: Record<string, unknown>, operations: readonly unknown[]): boolean {
  if (value['kind'] !== 'unavailable') return !Object.hasOwn(value, 'reason');
  if (operations.length > 0) return false;
  return DEVTOOLS_UNAVAILABLE_REASONS.some(reason => reason === value['reason']);
}

/** files 声明 download/upload 时，`maxTransferBytes` 必须大于 0。 */
function hasUsableTransferLimit(
  domain: DevToolsProviderDomain,
  operations: readonly unknown[],
  limits: DevToolsProviderLimits
): boolean {
  if (domain !== 'files') return true;
  const declaresTransfer = operations.some(operation => FILES_TRANSFER_OPERATIONS.includes(String(operation)));
  return !declaresTransfer || limits.maxTransferBytes > 0;
}

/**
 * 判断值是否为合法的 provider descriptor。
 *
 * @param value - 待检查值。
 * @returns exact-key、kind 与领域匹配、操作有序无重、限额自洽时为 `true`。
 */
export function isDevToolsProviderDescriptor(value: unknown): value is DevToolsProviderDescriptor {
  if (!isRecord(value) || !hasExactKeys(value, DESCRIPTOR_REQUIRED_KEYS, DESCRIPTOR_OPTIONAL_KEYS)) return false;

  const domain = value['domain'];
  if (!isDevToolsProviderDomain(domain) || value['version'] !== 1 || !isRuntime(value['runtime'])) return false;

  const kinds: readonly string[] = DEVTOOLS_PROVIDER_KINDS[domain];
  if (typeof value['kind'] !== 'string' || !kinds.includes(value['kind'])) return false;

  const limits = value['limits'];
  if (!isLimits(limits) || !isOrderedOperationSubset(value['operations'], domain)) return false;

  const operations = value['operations'] as readonly unknown[];
  return hasValidAvailability(value, operations) && hasUsableTransferLimit(domain, operations, limits);
}

/**
 * 判断值是否为合法的 descriptor 集合：每个领域最多一份。
 *
 * @remarks
 * 领域缺席是合法的 wire 形状——对该领域的请求返回结构化 `provider_unsupported`。
 * 重复领域则必须在这里挡下：两份同域 descriptor 会让「用哪一份判权限」变成顺序依赖。
 *
 * @param value - 待检查值。
 * @returns 全部条目合法且领域互不重复时为 `true`。
 */
export function isDevToolsProviderDescriptorSet(value: unknown): value is readonly DevToolsProviderDescriptor[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();

  for (const entry of value as readonly unknown[]) {
    if (!isDevToolsProviderDescriptor(entry) || seen.has(entry.domain)) return false;
    seen.add(entry.domain);
  }
  return true;
}
