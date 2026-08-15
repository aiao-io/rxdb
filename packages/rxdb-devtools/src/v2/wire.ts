/**
 * @fileoverview v2 线协议：宽外层 envelope、消息联合、exact-key 内层 guard 与消息工厂。
 *
 * @remarks
 * **宽外层 / 严内层。** 外层只回答「这是不是一条 v2 消息、往哪个方向走、属于哪个 session」，
 * 不看 payload；内层按 `type` 精确校验 payload 的键集合与取值。分成两层不是风格问题：
 * 四段中继里的 `background` / `content` 只需要外层就能决定是否转发，它们不该、也不能持有
 * 全部 payload schema——否则每加一个操作都要同步升级中继，而中继升级与页面刷新不同步。
 *
 * **envelope 里的 `protocol: 2` 是显式的版本判别位。** v1 的 {@link isDevToolsMessage} 是对已知
 * `type` 的 switch，遇到 `PROTOCOL_HELLO` 会静默返回 `false`；反过来 v2 也必须能一眼把 v1 帧排除，
 * 而不是靠「有没有某个新字段」这种会随协议演进而失真的推断。
 *
 * **`sessionId` 提到 envelope 层。** 「旧 session 的消息一律拒绝」要在解析 payload 之前就能判定，
 * 否则一条属于已轮换 session 的畸形帧，会先走完 payload 校验才被丢弃——那正是攻击面最宽的顺序。
 *
 * @module @aiao/rxdb-devtools/v2/wire
 */

import {
  DEVTOOLS_PROVIDER_OPERATIONS,
  isDevToolsProviderDescriptorSet,
  isDevToolsProviderDomain
} from '../provider/descriptor.js';
import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from '../provider/descriptor.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import type { DevToolsCapability } from '../types.js';
import { isDevToolsCapability } from './capability.js';
import { DEVTOOLS_PROTOCOL_VERSION_V2 } from './constants.js';
import { isDevToolsErrorPayload } from './errors.js';
import type { DevToolsErrorPayload } from './errors.js';
import { hasExactKeys, isNonEmptyString, isNonNegativeSafeInteger, isRecord, isSupportedVersionList } from './guards.js';
import { isCanonicalUuidV4, isDevToolsIdentifier } from './ids.js';

/**
 * v2 消息类型。
 *
 * @remarks
 * 相对 v1 的破坏性改名：含糊的 `CLEAR` 变为 `CLEAR_EVENT_BUFFER`，语义收窄为
 * 「只清本 session 的事件缓冲」。数据库 / Storage / OPFS 的清理由 `settings.clear` 操作定义，
 * 两者走完全不同的授权路径（前者 `none` 即可，后者要 `full` + `mutationPolicy: allow`）。
 * 一个名字同时表示这两件事，是 v1 里最容易误用的地方。
 */
export const DEVTOOLS_V2_MESSAGE_TYPES = [
  'PROTOCOL_HELLO',
  'HANDSHAKE',
  'HANDSHAKE_ACK',
  'DISCONNECT',
  'PING',
  'PONG',
  'CLEAR_EVENT_BUFFER',
  'REQUEST',
  'RESPONSE',
  'ERROR',
  'EVENT',
  'TRANSFER_START',
  'TRANSFER_CHUNK',
  'TRANSFER_COMPLETE',
  'TRANSFER_CANCEL'
] as const;

/** v2 消息类型。 */
export type DevToolsV2MessageType = (typeof DEVTOOLS_V2_MESSAGE_TYPES)[number];

/** v2 帧的传输方向。 */
export type DevToolsV2Direction = 'panel-to-connector' | 'connector-to-panel';

/**
 * 每种消息允许的方向；`'both'` 表示双向。
 *
 * @remarks
 * 方向写死在协议里而不是由发送方自述，是为了让中继能在不解析 payload 的前提下挡掉反向注入：
 * 一条 `direction: 'connector-to-panel'` 的 `HANDSHAKE_ACK` 只可能来自伪造，因为 ACK 的所有权
 * 属于 panel（AC#1）。
 */
export const DEVTOOLS_V2_MESSAGE_DIRECTIONS = {
  PROTOCOL_HELLO: 'panel-to-connector',
  HANDSHAKE: 'connector-to-panel',
  HANDSHAKE_ACK: 'panel-to-connector',
  DISCONNECT: 'both',
  PING: 'panel-to-connector',
  PONG: 'connector-to-panel',
  CLEAR_EVENT_BUFFER: 'panel-to-connector',
  REQUEST: 'panel-to-connector',
  RESPONSE: 'connector-to-panel',
  ERROR: 'connector-to-panel',
  EVENT: 'connector-to-panel',
  TRANSFER_START: 'both',
  TRANSFER_CHUNK: 'both',
  TRANSFER_COMPLETE: 'both',
  TRANSFER_CANCEL: 'both'
} as const satisfies Record<DevToolsV2MessageType, DevToolsV2Direction | 'both'>;

/** connector 在 HANDSHAKE 中告知的能力面。 */
export interface DevToolsHandshakeCapabilities {
  /** connector owner 本地配置的档位；**只是告知**，panel 不得据此放宽自身校验。 */
  readonly capability: DevToolsCapability;
  /** 本 session 存在的 provider；领域缺席是合法形状，请求它返回 `provider_unsupported`。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
}

/** `PROTOCOL_HELLO` 载荷。 */
export interface DevToolsProtocolHelloPayload {
  /** 非空、严格降序、去重、≤ 8 项，每项 1–255。 */
  readonly supportedVersions: readonly number[];
}

/** v2 `HANDSHAKE` 载荷。 */
export interface DevToolsV2HandshakePayload {
  readonly protocolVersion: typeof DEVTOOLS_PROTOCOL_VERSION_V2;
  readonly sessionId: string;
  readonly capabilities: DevToolsHandshakeCapabilities;
}

/** v2 `HANDSHAKE_ACK` 载荷。 */
export interface DevToolsV2HandshakeAckPayload {
  readonly protocolVersion: typeof DEVTOOLS_PROTOCOL_VERSION_V2;
  readonly sessionId: string;
}

/** `REQUEST` 载荷；`params` 的领域形状由 provider 层校验，wire 层只保证键存在。 */
export interface DevToolsRequestPayload {
  readonly requestId: string;
  readonly domain: DevToolsProviderDomain;
  readonly operation: string;
  readonly params: unknown;
}

/** `RESPONSE` 载荷。 */
export interface DevToolsResponsePayload {
  readonly requestId: string;
  readonly result: unknown;
}

/** `ERROR` 载荷；`requestId` 为 `null` 表示 session 级错误，无对应请求。 */
export interface DevToolsErrorFramePayload {
  readonly requestId: string | null;
  readonly error: DevToolsErrorPayload;
}

/** `EVENT` 载荷。 */
export interface DevToolsEventPayload {
  readonly eventType: string;
  readonly data: unknown;
}

/** `TRANSFER_START` 载荷。 */
export interface DevToolsTransferStartPayload {
  readonly transferId: string;
  /** 发起本次传输的请求；用于把 transfer 的终态归因到某条 REQUEST。 */
  readonly requestId: string;
  /** 声明的解码后总字节数；是否超限由协商出的三方最小值判定，不在 wire 层。 */
  readonly totalBytes: number;
}

/** `TRANSFER_CHUNK` 载荷。 */
export interface DevToolsTransferChunkPayload {
  readonly transferId: string;
  readonly chunkIndex: number;
  readonly offset: number;
  /** RFC 4648 标准字母表 + 规范填充；**规范性由 transfer 状态机判定**，见下方说明。 */
  readonly dataBase64: string;
}

/** `TRANSFER_COMPLETE` / `TRANSFER_CANCEL` 载荷。 */
export interface DevToolsTransferIdPayload {
  readonly transferId: string;
}

/** 消息类型到载荷类型的映射。 */
export interface DevToolsV2PayloadMap {
  PROTOCOL_HELLO: DevToolsProtocolHelloPayload;
  HANDSHAKE: DevToolsV2HandshakePayload;
  HANDSHAKE_ACK: DevToolsV2HandshakeAckPayload;
  DISCONNECT: null;
  PING: null;
  PONG: null;
  CLEAR_EVENT_BUFFER: null;
  REQUEST: DevToolsRequestPayload;
  RESPONSE: DevToolsResponsePayload;
  ERROR: DevToolsErrorFramePayload;
  EVENT: DevToolsEventPayload;
  TRANSFER_START: DevToolsTransferStartPayload;
  TRANSFER_CHUNK: DevToolsTransferChunkPayload;
  TRANSFER_COMPLETE: DevToolsTransferIdPayload;
  TRANSFER_CANCEL: DevToolsTransferIdPayload;
}

/** 单一消息类型的 v2 envelope。 */
export interface DevToolsV2Envelope<TType extends DevToolsV2MessageType = DevToolsV2MessageType> {
  readonly source: typeof RXDB_DEVTOOLS_MESSAGE;
  readonly protocol: typeof DEVTOOLS_PROTOCOL_VERSION_V2;
  readonly direction: DevToolsV2Direction;
  readonly type: TType;
  /** 协商完成后为 UUID v4；仅 `PROTOCOL_HELLO` 为 `null`。 */
  readonly sessionId: string | null;
  readonly payload: DevToolsV2PayloadMap[TType];
  readonly timestamp: number;
  readonly sequence: number;
}

/** 全部 v2 消息的判别联合。 */
export type DevToolsV2Message = {
  [TType in DevToolsV2MessageType]: DevToolsV2Envelope<TType>;
}[DevToolsV2MessageType];

/** 外层校验通过、payload 尚未校验的 v2 消息形状。 */
export interface DevToolsV2EnvelopeShape {
  readonly source: typeof RXDB_DEVTOOLS_MESSAGE;
  readonly protocol: typeof DEVTOOLS_PROTOCOL_VERSION_V2;
  readonly direction: DevToolsV2Direction;
  readonly type: DevToolsV2MessageType;
  readonly sessionId: string | null;
  readonly payload: unknown;
  readonly timestamp: number;
  readonly sequence: number;
}

/** {@link createDevToolsV2Message} 的固定字段。 */
export interface DevToolsV2MessageOptions {
  readonly sessionId: string | null;
  readonly sequence: number;
  readonly timestamp: number;
  /** 仅双向消息需要且必须提供；单向消息提供了不一致的值会抛错。 */
  readonly direction?: DevToolsV2Direction;
}

const ENVELOPE_KEYS = [
  'source',
  'protocol',
  'direction',
  'type',
  'sessionId',
  'payload',
  'timestamp',
  'sequence'
] as const;

/** payload 自带 `sessionId`、必须与 envelope 一致的消息类型。 */
const SESSION_BEARING_TYPES: readonly DevToolsV2MessageType[] = ['HANDSHAKE', 'HANDSHAKE_ACK'];

function isV2MessageType(value: unknown): value is DevToolsV2MessageType {
  return typeof value === 'string' && Object.hasOwn(DEVTOOLS_V2_MESSAGE_DIRECTIONS, value);
}

function isAllowedDirection(type: DevToolsV2MessageType, direction: unknown): direction is DevToolsV2Direction {
  if (direction !== 'panel-to-connector' && direction !== 'connector-to-panel') return false;
  const allowed = DEVTOOLS_V2_MESSAGE_DIRECTIONS[type];
  return allowed === 'both' || allowed === direction;
}

/** 协商期（`PROTOCOL_HELLO`）必须无 session；此后每一帧都必须归属一个 UUID v4 session。 */
function isAllowedSessionId(type: DevToolsV2MessageType, sessionId: unknown): sessionId is string | null {
  if (type === 'PROTOCOL_HELLO') return sessionId === null;
  return isCanonicalUuidV4(sessionId);
}

function isNullPayload(payload: unknown): payload is null {
  return payload === null;
}

function isProtocolHelloPayload(payload: unknown): payload is DevToolsProtocolHelloPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['supportedVersions'])) return false;
  return isSupportedVersionList(payload['supportedVersions']);
}

function isHandshakeCapabilities(value: unknown): value is DevToolsHandshakeCapabilities {
  if (!isRecord(value) || !hasExactKeys(value, ['capability', 'descriptors'])) return false;
  return isDevToolsCapability(value['capability']) && isDevToolsProviderDescriptorSet(value['descriptors']);
}

function isHandshakePayload(payload: unknown): payload is DevToolsV2HandshakePayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['protocolVersion', 'sessionId', 'capabilities'])) return false;
  if (payload['protocolVersion'] !== DEVTOOLS_PROTOCOL_VERSION_V2) return false;
  return isCanonicalUuidV4(payload['sessionId']) && isHandshakeCapabilities(payload['capabilities']);
}

function isHandshakeAckPayload(payload: unknown): payload is DevToolsV2HandshakeAckPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['protocolVersion', 'sessionId'])) return false;
  return payload['protocolVersion'] === DEVTOOLS_PROTOCOL_VERSION_V2 && isCanonicalUuidV4(payload['sessionId']);
}

/** 判断 `operation` 是否属于该领域的协议目录；未知操作在 wire 层就挡下，不进 provider。 */
function isDeclaredOperation(domain: DevToolsProviderDomain, operation: unknown): boolean {
  const catalogue: readonly string[] = DEVTOOLS_PROVIDER_OPERATIONS[domain];
  return typeof operation === 'string' && catalogue.includes(operation);
}

function isRequestPayload(payload: unknown): payload is DevToolsRequestPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['requestId', 'domain', 'operation', 'params'])) return false;
  if (!isDevToolsIdentifier(payload['requestId'])) return false;

  const domain = payload['domain'];
  return isDevToolsProviderDomain(domain) && isDeclaredOperation(domain, payload['operation']);
}

function isResponsePayload(payload: unknown): payload is DevToolsResponsePayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['requestId', 'result'])) return false;
  return isDevToolsIdentifier(payload['requestId']);
}

function isErrorFramePayload(payload: unknown): payload is DevToolsErrorFramePayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['requestId', 'error'])) return false;

  const requestId = payload['requestId'];
  if (requestId !== null && !isDevToolsIdentifier(requestId)) return false;
  return isDevToolsErrorPayload(payload['error']);
}

function isEventPayload(payload: unknown): payload is DevToolsEventPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['eventType', 'data'])) return false;
  return isNonEmptyString(payload['eventType']);
}

function isTransferStartPayload(payload: unknown): payload is DevToolsTransferStartPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['transferId', 'requestId', 'totalBytes'])) return false;
  if (!isDevToolsIdentifier(payload['transferId']) || !isDevToolsIdentifier(payload['requestId'])) return false;
  return isNonNegativeSafeInteger(payload['totalBytes']);
}

function isTransferChunkPayload(payload: unknown): payload is DevToolsTransferChunkPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['transferId', 'chunkIndex', 'offset', 'dataBase64'])) return false;
  if (!isDevToolsIdentifier(payload['transferId'])) return false;
  if (!isNonNegativeSafeInteger(payload['chunkIndex']) || !isNonNegativeSafeInteger(payload['offset'])) return false;
  // 只判类型，不判规范性：`payload_encoding_invalid` 必须在刷新 idle deadline **之前**返回，
  // 而 deadline 是 transfer 状态机的状态，wire 层看不到。放在这里判会让「被拒帧不续命」
  // 这条约束的执行点分裂成两处。
  return typeof payload['dataBase64'] === 'string';
}

function isTransferIdPayload(payload: unknown): payload is DevToolsTransferIdPayload {
  if (!isRecord(payload) || !hasExactKeys(payload, ['transferId'])) return false;
  return isDevToolsIdentifier(payload['transferId']);
}

/**
 * 类型到内层 guard 的映射。
 *
 * @remarks
 * 显式 `Record<DevToolsV2MessageType, …>` 而不是 `as const`：新增消息类型却忘记登记 guard 时
 * 直接编译失败。若退化成可选映射，未登记的类型会走到「找不到 guard 就放行」的分支上——
 * 那是最坏的默认值。
 */
const PAYLOAD_GUARDS: Record<DevToolsV2MessageType, (payload: unknown) => boolean> = {
  PROTOCOL_HELLO: isProtocolHelloPayload,
  HANDSHAKE: isHandshakePayload,
  HANDSHAKE_ACK: isHandshakeAckPayload,
  DISCONNECT: isNullPayload,
  PING: isNullPayload,
  PONG: isNullPayload,
  CLEAR_EVENT_BUFFER: isNullPayload,
  REQUEST: isRequestPayload,
  RESPONSE: isResponsePayload,
  ERROR: isErrorFramePayload,
  EVENT: isEventPayload,
  TRANSFER_START: isTransferStartPayload,
  TRANSFER_CHUNK: isTransferChunkPayload,
  TRANSFER_COMPLETE: isTransferIdPayload,
  TRANSFER_CANCEL: isTransferIdPayload
};

/** 握手类消息的 payload `sessionId` 必须与 envelope 一致，否则「拒绝旧 session」取决于读哪个字段。 */
function hasConsistentSessionId(envelope: DevToolsV2EnvelopeShape): boolean {
  if (!SESSION_BEARING_TYPES.includes(envelope.type)) return true;
  return isRecord(envelope.payload) && envelope.payload['sessionId'] === envelope.sessionId;
}

/**
 * 宽外层 guard：判断值是否为一条 v2 消息的外壳，**不校验 payload**。
 *
 * @param value - 待检查值，通常来自 `postMessage` / Port / IPC。
 * @returns 外壳合法时为 `true`。
 */
export function isDevToolsV2Envelope(value: unknown): value is DevToolsV2EnvelopeShape {
  if (!isRecord(value) || !hasExactKeys(value, ENVELOPE_KEYS)) return false;
  if (value['source'] !== RXDB_DEVTOOLS_MESSAGE || value['protocol'] !== DEVTOOLS_PROTOCOL_VERSION_V2) return false;
  if (!isNonNegativeSafeInteger(value['timestamp']) || !isNonNegativeSafeInteger(value['sequence'])) return false;

  const type = value['type'];
  if (!isV2MessageType(type) || !isAllowedDirection(type, value['direction'])) return false;
  return isAllowedSessionId(type, value['sessionId']);
}

/**
 * 严内层 guard：判断值是否为一条完全合法的 v2 消息。
 *
 * @param value - 待检查值。
 * @returns 外壳、session 一致性与 payload 全部通过时为 `true`。
 */
export function isDevToolsV2Message(value: unknown): value is DevToolsV2Message {
  if (!isDevToolsV2Envelope(value)) return false;
  if (!hasConsistentSessionId(value)) return false;
  return PAYLOAD_GUARDS[value.type](value.payload);
}

/** 由消息类型推导方向；双向消息必须显式给出，单向消息不得给出冲突值。 */
function resolveDirection(type: DevToolsV2MessageType, requested: DevToolsV2Direction | undefined): DevToolsV2Direction {
  const allowed = DEVTOOLS_V2_MESSAGE_DIRECTIONS[type];
  if (allowed !== 'both') {
    if (requested !== undefined && requested !== allowed) {
      throw new TypeError(`rxdb-devtools: ${type} may only travel ${allowed}`);
    }
    return allowed;
  }
  if (requested === undefined) throw new TypeError(`rxdb-devtools: ${type} requires an explicit direction`);
  return requested;
}

/**
 * 构造一条 v2 消息。
 *
 * @remarks
 * 方向由类型推导而不是由调用方自由填写，是为了让「ACK 只能由 panel 产出」这类所有权约束
 * 在发送侧就成立，而不是等到接收侧才发现方向不对。
 *
 * @typeParam TType - 消息类型。
 * @param type - 消息类型。
 * @param payload - 与类型匹配的载荷。
 * @param options - session、序号、时间戳与（双向消息的）方向。
 * @returns 自洽的 v2 消息，必然通过 {@link isDevToolsV2Message}。
 * @throws TypeError 当双向消息缺少方向、或单向消息给出冲突方向时。
 */
export function createDevToolsV2Message<TType extends DevToolsV2MessageType>(
  type: TType,
  payload: DevToolsV2PayloadMap[TType],
  options: DevToolsV2MessageOptions
): DevToolsV2Envelope<TType> {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    protocol: DEVTOOLS_PROTOCOL_VERSION_V2,
    direction: resolveDirection(type, options.direction),
    type,
    sessionId: options.sessionId,
    payload,
    timestamp: options.timestamp,
    sequence: options.sequence
  };
}
