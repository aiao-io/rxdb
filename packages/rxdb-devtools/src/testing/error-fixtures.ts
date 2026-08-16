/**
 * @fileoverview provider 错误联合的 fixture 表 —— 穷尽性的唯一可执行凭据。
 *
 * @remarks
 * 「provider 错误是穷尽的」这句话本身**没法用普通测试证明**：`operation_failed` 兜底会把
 * 一切漏网情况吸收掉，测试照样绿，只是绿得毫无意义。本表是对这个假绿的缓解——它把
 * 「每个码至少有一条已知来路」变成一份可执行的清单，并由 meta-test 强制：
 *
 * - {@link DEVTOOLS_PROVIDER_ERROR_CODES} 的每个成员都必须在这里出现；
 * - 平台可映射的码，**三个来源各要有一条 fixture**——只给某一端加映射会直接红。
 *
 * 于是 US-904 阶段 D 与 US-905 接入真实平台时，正确动作是往这张表**加行**，而不是往映射里加分支
 * 然后让新情况落进兜底。
 *
 * @module @aiao/rxdb-devtools/testing/error-fixtures
 */

import type { DevToolsErrorOrigin } from '../v2/error-mapping.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';

/**
 * 一条错误来路。
 *
 * @remarks
 * 分两类不是为了整齐：`platform` 可以被 `mapPlatformError` 直接复算，`protocol` 不能——
 * 后者由状态机在特定时序下产生，只能记录**由谁产生**，供人工与下游 driver 追溯。
 * 混成一类会让 meta-test 无法对前者做真正的断言。
 */
export type DevToolsErrorFixture =
  | {
      readonly kind: 'platform';
      /** 人类可读的场景名。 */
      readonly name: string;
      /** 该值来自哪个平台。 */
      readonly origin: DevToolsErrorOrigin;
      /** 平台原样抛出/回传的值。 */
      readonly error: unknown;
      /** 期望映射到的码。 */
      readonly expected: DevToolsProviderErrorCode;
    }
  | {
      readonly kind: 'protocol';
      readonly name: string;
      /** 产生该码的模块，形如 `v2/transfer`。 */
      readonly producedBy: string;
      readonly expected: DevToolsProviderErrorCode;
    };

function dom(name: string, expected: DevToolsProviderErrorCode): DevToolsErrorFixture {
  return { kind: 'platform', name: `OPFS ${name}`, origin: 'dom', error: { name, message: 'redacted' }, expected };
}

function node(code: string, expected: DevToolsProviderErrorCode): DevToolsErrorFixture {
  return { kind: 'platform', name: `Node ${code}`, origin: 'node', error: { name: 'Error', code }, expected };
}

function rust(kind: string, expected: DevToolsProviderErrorCode): DevToolsErrorFixture {
  return { kind: 'platform', name: `Rust ${kind}`, origin: 'rust', error: { kind }, expected };
}

function protocol(name: string, producedBy: string, expected: DevToolsProviderErrorCode): DevToolsErrorFixture {
  return { kind: 'protocol', name, producedBy, expected };
}

/**
 * 全部已登记的错误来路。
 *
 * @remarks
 * 顺序按码分组，方便 review 时一眼看出某个码在三端是否齐备。
 */
export const DEVTOOLS_ERROR_MAPPING_FIXTURES: readonly DevToolsErrorFixture[] = [
  dom('NotFoundError', 'resource_not_found'),
  node('ENOENT', 'resource_not_found'),
  rust('NotFound', 'resource_not_found'),

  dom('NotAllowedError', 'permission_denied'),
  node('EACCES', 'permission_denied'),
  rust('PermissionDenied', 'permission_denied'),

  dom('InvalidModificationError', 'resource_conflict'),
  node('EEXIST', 'resource_conflict'),
  rust('AlreadyExists', 'resource_conflict'),

  dom('QuotaExceededError', 'storage_quota_exceeded'),
  node('ENOSPC', 'storage_quota_exceeded'),
  rust('StorageFull', 'storage_quota_exceeded'),

  dom('TypeMismatchError', 'invalid_path'),
  node('ENAMETOOLONG', 'invalid_path'),
  rust('InvalidFilename', 'invalid_path'),

  dom('InvalidStateError', 'provider_unavailable'),
  node('ENODEV', 'provider_unavailable'),
  rust('NotConnected', 'provider_unavailable'),

  // 兜底也要三端各来一条：否则某一端的兜底行为改了都没人发现。
  dom('UnknownDomError', 'operation_failed'),
  node('EUNKNOWN', 'operation_failed'),
  rust('Uncategorized', 'operation_failed'),

  protocol('capability 足够但 descriptor 未声明该操作', 'v2/authorization', 'provider_unsupported'),
  protocol('chunk 编码长度超过 256 KiB 上界', 'v2/transfer', 'payload_too_large'),
  protocol('非规范 base64（未填充 / 内嵌空白 / URL-safe）', 'v2/transfer', 'payload_encoding_invalid'),
  protocol('chunkIndex 或 offset 与账本不符', 'v2/transfer', 'transfer_sequence_invalid'),
  protocol('累计字节超过协商上限', 'v2/transfer', 'transfer_size_exceeded'),
  protocol('COMPLETE 时字节数短少', 'v2/transfer', 'transfer_incomplete'),
  protocol('对已终结或未知 transferId 发帧', 'v2/transfer', 'transfer_closed'),
  protocol('cursor 绑定的快照已释放或已过期', 'provider/snapshot', 'snapshot_expired'),
  protocol('等锁超时或 epoch 重试用尽', 'provider/snapshot', 'snapshot_busy'),
  protocol('快照超过 100,000 条或 32 MiB', 'provider/snapshot', 'snapshot_too_large'),
  protocol('database export 在任何 kind 与 runtime 下', 'provider/database', 'export_unsupported')
];
