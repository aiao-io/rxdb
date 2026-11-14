import { copyValue, isRecord } from './payload.js';
import type { OrbitClientContext, OrbitProps, OrbitValue } from './types.js';

/** 协议名；握手消息的 `protocol` 字段是 `<协议名>:<版本号>`。 */
export const PROTOCOL_NAME = 'aiao.orbit';
/** 本实现支持的协议版本（正整数）。版本规则见 README 的「协议版本」。 */
export const PROTOCOL_VERSION = 1;
/** 本实现发出的握手字符串；协议版本 1 的应用已发布，字符串不能变。 */
export const PROTOCOL = `${PROTOCOL_NAME}:${PROTOCOL_VERSION}`;
export const CHANNEL_PARAM = '__aiao_orbit';

/** 协议版本号对应的握手字符串。 */
export function protocolId(version: number): string {
  return `${PROTOCOL_NAME}:${version}`;
}

const PROTOCOL_PATTERN = /^aiao\.orbit:([1-9]\d{0,8})$/;

/** 从握手字符串读出协议版本；不是 `aiao.orbit:<正整数>` 的一律不是本协议，返回 undefined。 */
export function parseProtocol(value: unknown): number | undefined {
  const match = typeof value === 'string' ? PROTOCOL_PATTERN.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}

/** 协商成功：应用声明的版本不高于宿主支持的版本。 */
export interface CompatibleProtocol {
  /** 恒为 true。 */
  readonly compatible: true;
  /** 双方通信用的版本：应用声明的版本。 */
  readonly version: number;
}

/** 协商失败：应用声明的版本高于宿主支持的版本。 */
export interface IncompatibleProtocol {
  /** 恒为 false。 */
  readonly compatible: false;
  /** 应用声明的版本。 */
  readonly requested: number;
  /** 宿主支持的最高版本。 */
  readonly supported: number;
}

/** 协商结果：兼容时按应用声明的版本通信，应用版本更高时不兼容。 */
export type ProtocolNegotiation = CompatibleProtocol | IncompatibleProtocol;

/**
 * 协议版本协商：应用声明的版本不高于 `supported`（同版本或更低）就照常运行，宿主按应用声明的版本通信；
 * 高于宿主支持的版本时不兼容，宿主明确失败，不缺能力继续运行。
 */
export function negotiateProtocol(requested: number, supported: number = PROTOCOL_VERSION): ProtocolNegotiation {
  return requested <= supported ?
      { compatible: true, version: requested }
    : { compatible: false, requested, supported };
}

export type Message =
  | { type: 'ready' | 'disposed' }
  | { type: 'error'; message: string }
  | { type: 'event'; event: string; args: OrbitValue[] }
  | { type: 'props'; props: OrbitProps }
  | { type: 'visibility'; visible: boolean }
  | { type: 'request'; id: string; method: string; payload: OrbitValue }
  | { type: 'response'; id: string; value: OrbitValue }
  | { type: 'reject'; id: string; code: string; message: string }
  | { type: 'cancel'; id: string };

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export function readMessage(data: unknown): Message | undefined {
  if (!isRecord(data)) return undefined;
  switch (data['type']) {
    case 'ready':
    case 'disposed':
      return { type: data['type'] };
    case 'error':
      return typeof data['message'] === 'string' ? { type: 'error', message: data['message'] } : undefined;
    case 'visibility':
      return typeof data['visible'] === 'boolean' ? { type: 'visibility', visible: data['visible'] } : undefined;
    case 'props':
      return isRecord(data['props']) ? { type: 'props', props: copyValue(data['props']) as OrbitProps } : undefined;
    case 'event':
      return validName(data['event']) && Array.isArray(data['args']) ?
          { type: 'event', event: data['event'], args: copyValue(data['args']) as OrbitValue[] }
        : undefined;
    case 'request':
      return validName(data['id']) && validName(data['method']) ?
          { type: 'request', id: data['id'], method: data['method'], payload: copyValue(data['payload']) }
        : undefined;
    case 'response':
      return validName(data['id']) ? { type: 'response', id: data['id'], value: copyValue(data['value']) } : undefined;
    case 'cancel':
      return validName(data['id']) ? { type: 'cancel', id: data['id'] } : undefined;
    case 'reject':
      return validName(data['id']) && typeof data['code'] === 'string' && typeof data['message'] === 'string' ?
          { type: 'reject', id: data['id'], code: data['code'], message: data['message'] }
        : undefined;
    default:
      return undefined;
  }
}

export function readContext(data: unknown): OrbitClientContext | undefined {
  if (!isRecord(data) || !validName(data['appId']) || !validName(data['instanceId']) || !validName(data['version']))
    return undefined;
  if (typeof data['url'] !== 'string' || typeof data['visible'] !== 'boolean' || !isRecord(data['props']))
    return undefined;
  return Object.freeze({
    appId: data['appId'],
    instanceId: data['instanceId'],
    version: data['version'],
    url: data['url'],
    visible: data['visible'],
    props: Object.freeze(copyValue(data['props']) as OrbitProps)
  });
}
