/**
 * @fileoverview 三层授权矩阵：capability × descriptor.operations × mutationPolicy。
 *
 * @remarks
 * 三层**互相独立**，且全部取自 connector / provider owner 的本地可信配置。HANDSHAKE 与
 * descriptor 里回显的 capability 只是**告知**，绝不作为权限输入——否则对端只要在自己的
 * 握手里多写一个词就能提权。
 *
 * **capability 不足必须静默丢弃，且必须排在 descriptor 之前。** 结构化的
 * `provider_unsupported` 会告诉对端「这个领域/操作是否存在」，于是一个 `none` 档连接可以靠
 * 逐个试探把 provider 目录枚举出来。把 capability 放在第一位、并且不回任何帧，才是零泄漏。
 * 反过来，descriptor 未声明与 mutation 未 opt-in 属于「已识别的请求」，回结构化错误是对的：
 * 对端有权知道自己请求的东西这一端根本没实现。
 *
 * **本模块不放进 `capability.ts`**：授权要读消息类型与操作目录，而 `wire.ts` 反过来依赖
 * `capability.ts` 的 `isDevToolsCapability`。放在一起会形成 capability ↔ wire 的循环。
 *
 * @module @aiao/rxdb-devtools/v2/authorization
 */

import type {
  DevToolsProviderDescriptor,
  DevToolsProviderDomain,
  DevToolsProviderOperation
} from '../provider/descriptor.js';
import type { DevToolsCapability } from '../types.js';
import { satisfiesCapability } from './capability.js';
import type { DevToolsErrorPayload } from './errors.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsV2MessageType } from './wire.js';

/**
 * 每种消息类型所需的最低档位。
 *
 * @remarks
 * `none` 只放行生命周期与协议机制帧。业务数据（`REQUEST` / `RESPONSE` / `EVENT` /
 * `TRANSFER_*`）一条都不许出门——`none` 不只是「拒绝入站命令」，它同时意味着不建事件订阅、
 * 不写缓冲、不发任何业务数据。
 *
 * 写成 `satisfies Record<DevToolsV2MessageType, …>`：新增消息类型却忘记登记，直接编译失败。
 */
export const DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY = {
  PROTOCOL_HELLO: 'none',
  HANDSHAKE: 'none',
  HANDSHAKE_ACK: 'none',
  DISCONNECT: 'none',
  PING: 'none',
  PONG: 'none',
  CLEAR_EVENT_BUFFER: 'none',
  ERROR: 'none',
  REQUEST: 'readonly',
  RESPONSE: 'readonly',
  EVENT: 'readonly',
  TRANSFER_START: 'readonly',
  TRANSFER_CHUNK: 'readonly',
  TRANSFER_COMPLETE: 'readonly',
  TRANSFER_CANCEL: 'readonly'
} as const satisfies Record<DevToolsV2MessageType, DevToolsCapability>;

/**
 * 每个操作所需的最低档位。
 *
 * @remarks
 * `full` 档恰好等于「会改变持久状态」的那一组，因此 {@link isMutatingOperation} 直接由本表
 * 推导，而不是另立一张写操作清单——两张必须保持一致的清单迟早会漂移，且漂移的表现是某个写
 * 操作悄悄绕过 `mutationPolicy`。
 *
 * `settings.export` 留在 `readonly`：它不触碰任何状态，且当前恒返回 `export_unsupported`。
 */
export const DEVTOOLS_OPERATION_REQUIRED_CAPABILITY = {
  database: {
    inspect: 'readonly',
    query: 'readonly',
    events: 'readonly',
    'get-branches': 'readonly',
    'switch-branch': 'full',
    'create-branch': 'full',
    'delete-branch': 'full'
  },
  files: {
    list: 'readonly',
    download: 'readonly',
    upload: 'full',
    'create-directory': 'full',
    delete: 'full'
  },
  settings: {
    clear: 'full',
    export: 'readonly'
  }
} as const satisfies {
  readonly [TDomain in DevToolsProviderDomain]: Record<DevToolsProviderOperation<TDomain>, DevToolsCapability>;
};

/**
 * owner 是否为写操作单独开口。
 *
 * @remarks
 * 省略即只读。`full` 档并不隐含「允许写」——档位说的是「这个连接被允许做多重的事」，
 * policy 说的是「owner 是否为这次运行打开了写入」，两个开关服务于不同的决策者。
 */
export type DevToolsMutationPolicy = 'allow' | 'omit';

/** 一次操作授权的输入；三项配置全部来自本地，`domain` / `operation` 来自 wire。 */
export interface DevToolsAuthorizationInput {
  /** 本地配置的档位。 */
  readonly capability: DevToolsCapability;
  /** 本地配置的写入开关。 */
  readonly mutationPolicy: DevToolsMutationPolicy;
  /** 本 session 存在的 provider 声明。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  /** 请求的领域。 */
  readonly domain: DevToolsProviderDomain;
  /** 请求的操作名；wire 上可能是任意字符串。 */
  readonly operation: string;
}

/**
 * 授权结论。
 *
 * @remarks
 * `silent-drop` 与 `rejected` 的区别是承重的：前者不得产生任何出站帧、任何 provider 调用、
 * 任何资源分配；后者要回一条结构化错误。
 */
export type DevToolsAuthorization =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'silent-drop' }
  | { readonly outcome: 'rejected'; readonly error: DevToolsErrorPayload };

/** 查表取操作所需档位；未登记的操作返回 `undefined`。 */
function requiredCapability(domain: DevToolsProviderDomain, operation: string): DevToolsCapability | undefined {
  const table: Readonly<Record<string, DevToolsCapability>> = DEVTOOLS_OPERATION_REQUIRED_CAPABILITY[domain];
  return Object.hasOwn(table, operation) ? table[operation] : undefined;
}

function unsupported(): DevToolsAuthorization {
  return { outcome: 'rejected', error: createDevToolsError('provider_unsupported') };
}

/**
 * 判断一条消息类型在给定档位下是否可以收发。
 *
 * @param type - v2 消息类型。
 * @param capability - 本地配置的档位。
 * @returns 档位不低于该类型所需时为 `true`。
 */
export function authorizeMessage(type: DevToolsV2MessageType, capability: DevToolsCapability): boolean {
  return satisfiesCapability(capability, DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY[type]);
}

/**
 * 判断一个操作是否会改变持久状态。
 *
 * @param domain - provider 领域。
 * @param operation - 操作名。
 * @returns 该操作要求 `full` 档时为 `true`；未登记的操作为 `false`。
 */
export function isMutatingOperation(domain: DevToolsProviderDomain, operation: string): boolean {
  return requiredCapability(domain, operation) === 'full';
}

/**
 * 对一次操作请求做三层授权。
 *
 * @remarks
 * 判定顺序固定为 capability → descriptor → mutationPolicy，且**未登记的操作按最严处理**
 * （静默丢弃）：类型系统挡不住 wire 上的任意字符串，此时默认放行是最坏的默认值。
 *
 * @param input - 本地配置与被请求的领域、操作。
 * @returns 三种结论之一。
 */
export function authorizeOperation(input: DevToolsAuthorizationInput): DevToolsAuthorization {
  const required = requiredCapability(input.domain, input.operation);
  // 档位不足绝不回帧：结构化拒绝足以让对端把 provider 目录枚举出来。
  if (required === undefined || !satisfiesCapability(input.capability, required)) return { outcome: 'silent-drop' };

  const descriptor = input.descriptors.find(entry => entry.domain === input.domain);
  if (descriptor === undefined || descriptor.kind === 'unavailable') return unsupported();
  if (!descriptor.operations.some(operation => operation === input.operation)) return unsupported();

  if (required === 'full' && input.mutationPolicy !== 'allow') return unsupported();
  return { outcome: 'allowed' };
}
