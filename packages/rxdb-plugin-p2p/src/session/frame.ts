/** 会话帧格式 v2 与编解码，WebRTC 与 TCP 适配器共用。 */
import { MAX_FRAME_METADATA, MAX_NAME_LENGTH, MAX_P2P_FRAME_PAYLOAD } from './limits.js';

/** 承载已编码帧的双向字节通道。 */
export interface P2PByteTransport {
  /** 发送一帧；底层缓冲已满时等到可写再完成。 */
  readonly send: (frame: Uint8Array) => Promise<void>;
  /** 接收下一帧；通道失败或关闭后拒绝。 */
  readonly receive: (signal?: AbortSignal) => Promise<Uint8Array>;
  /** 关闭通道并释放底层连接；可重复调用。 */
  readonly close: () => void | Promise<void>;
}

/** 会话协议版本：hello 里两端不一致即判不兼容。 */
export const P2P_SESSION_VERSION = 2;

/** 帧元数据里可以携带的 JSON 对象。 */
export interface P2PJsonObject {
  /** 任意 JSON 值。 */
  readonly [key: string]: P2PJsonValue;
}

/** 帧元数据里可以携带的 JSON 值。 */
export type P2PJsonValue = null | boolean | number | string | readonly P2PJsonValue[] | P2PJsonObject;

/** 会话帧：JSON 元数据加二进制负载；只有请求与应答带负载。 */
export type P2PFrame =
  | {
      /** 建连协商：双方各自发出的第一帧。 */
      readonly kind: 'hello';
      /** 会话协议版本。 */
      readonly session: number;
      /** 发送方的运行实例标识。 */
      readonly instanceId: string;
      /** 发送方的身份凭据，由认证宿主签发并绑定到本连接。 */
      readonly credential: string;
      /** 发送方支持的协议：协议名到版本。 */
      readonly protocols: Readonly<Record<string, number>>;
    }
  | {
      /** 请求。 */
      readonly kind: 'request';
      /** 发送方分配、在本会话内唯一的请求号。 */
      readonly id: number;
      /** 协议名。 */
      readonly protocol: string;
      /** 协议内的方法名。 */
      readonly method: string;
      /** JSON 参数。 */
      readonly params: P2PJsonValue;
      /** 二进制负载。 */
      readonly payload: Uint8Array;
    }
  | {
      /** 成功应答。 */
      readonly kind: 'response';
      /** 对应的请求号。 */
      readonly id: number;
      /** JSON 结果。 */
      readonly result: P2PJsonValue;
      /** 二进制负载。 */
      readonly payload: Uint8Array;
    }
  | {
      /** 失败应答。 */
      readonly kind: 'error';
      /** 对应的请求号。 */
      readonly id: number;
      /** 稳定的拒绝原因。 */
      readonly code: string;
      /** 可诊断的错误文本（编码时截断到协议上限）。 */
      readonly message: string;
    }
  | {
      /** 请求方放弃一次请求。 */
      readonly kind: 'cancel';
      /** 被放弃的请求号。 */
      readonly id: number;
    }
  | {
      /** 心跳。 */
      readonly kind: 'ping';
    }
  | {
      /** 心跳回应。 */
      readonly kind: 'pong';
    }
  | {
      /** 结束会话。 */
      readonly kind: 'bye';
      /** 结束原因，例如 `closed`、`unauthorized`、`duplicate`。 */
      readonly reason: string;
    };

type Fields = Readonly<Record<string, unknown>>;
type Parser = (fields: Fields, payload: Uint8Array) => P2PFrame | undefined;

/** 错误文本的字符上限，保证元数据不超限。 */
const MAX_ERROR_LENGTH = 1024;
/** hello 里至多声明的协议数。 */
const MAX_PROTOCOLS = 64;

const EMPTY = new Uint8Array(0);
const frameEncoder = new TextEncoder();
const frameDecoder = new TextDecoder();

const payloadOf = (frame: P2PFrame): Uint8Array =>
  frame.kind === 'request' || frame.kind === 'response' ? frame.payload : EMPTY;

/** 元数据：去掉负载本体、记下负载长度；错误文本截断到协议上限。 */
const metadataOf = (frame: P2PFrame, payloadLength: number): Record<string, unknown> => {
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(frame).filter(([key]) => key !== 'payload')
  );
  if (frame.kind === 'error') fields.message = frame.message.slice(0, MAX_ERROR_LENGTH);
  return { ...fields, payloadLength };
};

/**
 * 编码一帧：4 字节无符号大端元数据长度 + JSON 元数据 + 负载；错误文本截断到协议上限。
 *
 * @throws RangeError 负载超过 1 MiB，或元数据超过 8 KiB
 */
export const encodeP2PFrame = (frame: P2PFrame): Uint8Array => {
  const payload = payloadOf(frame);
  if (payload.byteLength > MAX_P2P_FRAME_PAYLOAD) throw new RangeError('P2P frame payload is too large');
  const metadata = frameEncoder.encode(JSON.stringify(metadataOf(frame, payload.byteLength)));
  if (metadata.byteLength > MAX_FRAME_METADATA) throw new RangeError('P2P frame metadata is too large');
  const result = new Uint8Array(4 + metadata.byteLength + payload.byteLength);
  new DataView(result.buffer).setUint32(0, metadata.byteLength);
  result.set(metadata, 4);
  result.set(payload, 4 + metadata.byteLength);
  return result;
};

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH;

/** hello 里的协议表：普通对象，键是协议名、值是正整数版本。 */
const protocolsOf = (value: unknown): Record<string, number> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  const valid =
    entries.length <= MAX_PROTOCOLS && entries.every(([name, version]) => isName(name) && isVersion(version));
  return valid ? (Object.fromEntries(entries) as Record<string, number>) : undefined;
};

const parseHello: Parser = ({ session, instanceId, credential, protocols }) => {
  const advertised = protocolsOf(protocols);
  if (!isVersion(session) || !isName(instanceId) || typeof credential !== 'string' || !advertised) return undefined;
  return { kind: 'hello', session, instanceId, credential, protocols: advertised };
};

const parseRequest: Parser = ({ id, protocol, method, params }, payload) =>
  isId(id) && isName(protocol) && isName(method) ?
    { kind: 'request', id, protocol, method, params: (params ?? null) as P2PJsonValue, payload }
  : undefined;

const parseResponse: Parser = ({ id, result }, payload) =>
  isId(id) ? { kind: 'response', id, result: (result ?? null) as P2PJsonValue, payload } : undefined;

const parseError: Parser = ({ id, code, message }) =>
  isId(id) && isName(code) && typeof message === 'string' && message.length <= MAX_ERROR_LENGTH ?
    { kind: 'error', id, code, message }
  : undefined;

const parseCancel: Parser = ({ id }) => (isId(id) ? { kind: 'cancel', id } : undefined);

const parseBye: Parser = ({ reason }) => (isName(reason) ? { kind: 'bye', reason } : undefined);

const PARSERS: ReadonlyMap<string, Parser> = new Map<string, Parser>([
  ['hello', parseHello],
  ['request', parseRequest],
  ['response', parseResponse],
  ['error', parseError],
  ['cancel', parseCancel],
  ['ping', () => ({ kind: 'ping' })],
  ['pong', () => ({ kind: 'pong' })],
  ['bye', parseBye]
]);

/** 只有请求与应答带负载；其它已知类型带负载即畸形。 */
const PAYLOAD_KINDS: ReadonlySet<string> = new Set(['request', 'response']);

const parseMetadata = (bytes: Uint8Array): Fields => {
  try {
    const metadata: unknown = JSON.parse(frameDecoder.decode(bytes));
    if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) return metadata as Fields;
  } catch (error) {
    throw new RangeError('P2P frame metadata is invalid', { cause: error });
  }
  throw new RangeError('P2P frame metadata is invalid');
};

/**
 * 解码并严格校验一帧。
 *
 * @returns 解码后的帧；元数据里的帧类型未知时返回 `null`——那是较新版本对端的帧，调用方应忽略它而不是断开
 * @throws RangeError 帧头或元数据截断、超限，负载长度与元数据不符，或已知类型的字段不合法
 */
export const decodeP2PFrame = (bytes: Uint8Array): P2PFrame | null => {
  if (bytes.byteLength < 4) throw new RangeError('P2P frame is truncated');
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (metadataLength === 0 || metadataLength > MAX_FRAME_METADATA || metadataLength > bytes.byteLength - 4)
    throw new RangeError('P2P frame metadata is truncated or too large');
  const fields = parseMetadata(bytes.subarray(4, 4 + metadataLength));
  const payload = bytes.subarray(4 + metadataLength);
  const { kind, payloadLength } = fields;
  if (typeof kind !== 'string' || payloadLength !== payload.byteLength)
    throw new RangeError('P2P frame is malformed or truncated');
  const parse = PARSERS.get(kind);
  if (!parse) return null;
  const frame = PAYLOAD_KINDS.has(kind) || payload.byteLength === 0 ? parse(fields, payload) : undefined;
  if (!frame) throw new RangeError(`malformed P2P ${kind} frame`);
  return frame;
};
