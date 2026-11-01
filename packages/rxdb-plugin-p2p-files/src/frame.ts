/** 块协议的帧格式与编解码，WebRTC 与 TCP 适配器共用。 */
import { isValidChunkRange, MAX_FRAME_METADATA } from './limits.js';

/** 承载已编码帧的双向字节通道。 */
export interface P2PByteTransport {
  /** 发送一帧；底层缓冲已满时等到可写再完成。 */
  readonly send: (frame: Uint8Array) => Promise<void>;
  /** 接收下一帧；通道失败或关闭后拒绝。 */
  readonly receive: (signal?: AbortSignal) => Promise<Uint8Array>;
  /** 关闭通道并释放底层连接；可重复调用。 */
  readonly close: () => void | Promise<void>;
}

/** 块协议帧的 JSON 元数据与二进制负载。 */
export type P2PFrame =
  | {
      /** 块请求。 */
      readonly kind: 'request';
      /** 本端分配、在本条连接内唯一的请求号。 */
      readonly requestId: string;
      /** 请求的内容哈希。 */
      readonly contentHash: string;
      /** 字节区间起点。 */
      readonly offset: number;
      /** 字节区间长度。 */
      readonly size: number;
    }
  | {
      /** 成功响应。 */
      readonly kind: 'response';
      /** 对应的请求号。 */
      readonly requestId: string;
      /** 成功标记。 */
      readonly ok: true;
      /** 请求区间的字节。 */
      readonly payload: Uint8Array;
    }
  | {
      /** 失败响应。 */
      readonly kind: 'response';
      /** 对应的请求号。 */
      readonly requestId: string;
      /** 失败标记。 */
      readonly ok: false;
      /** 可诊断的错误文本（截断到协议上限）。 */
      readonly error: string;
    };

/** 错误响应里错误文本的字符上限，保证元数据不超限。 */
const MAX_ERROR_LENGTH = 1024;

const frameEncoder = new TextEncoder();
const frameDecoder = new TextDecoder();

/** 编码一帧，供 WebRTC 和 TCP 适配器共用；错误文本截断到协议上限。 */
export const encodeP2PFrame = (frame: P2PFrame): Uint8Array => {
  const payload = frame.kind === 'response' && frame.ok ? frame.payload : new Uint8Array(0);
  const metadata =
    frame.kind === 'request' ? frame
    : frame.ok ? { kind: frame.kind, requestId: frame.requestId, ok: true, payloadLength: payload.byteLength }
    : { ...frame, error: frame.error.slice(0, MAX_ERROR_LENGTH) };
  const metadataBytes = frameEncoder.encode(JSON.stringify(metadata));
  const result = new Uint8Array(4 + metadataBytes.byteLength + payload.byteLength);
  new DataView(result.buffer).setUint32(0, metadataBytes.byteLength);
  result.set(metadataBytes, 4);
  result.set(payload, 4 + metadataBytes.byteLength);
  return result;
};

const parseMetadata = (bytes: Uint8Array): Record<string, unknown> => {
  try {
    const metadata: unknown = JSON.parse(frameDecoder.decode(bytes));
    if (typeof metadata === 'object' && metadata !== null) return metadata as Record<string, unknown>;
  } catch (error) {
    throw new RangeError('P2P frame metadata is invalid', { cause: error });
  }
  throw new RangeError('P2P frame metadata is invalid');
};

const toFrame = (metadata: Record<string, unknown>, payload: Uint8Array): P2PFrame => {
  const { kind, requestId } = metadata;
  if (typeof requestId !== 'string') throw new RangeError('P2P frame requestId is missing');
  if (kind === 'request' && typeof metadata.contentHash === 'string' && payload.byteLength === 0) {
    if (!isValidChunkRange(metadata.offset, metadata.size)) throw new RangeError('P2P request range is invalid');
    const { contentHash, offset, size } = metadata as { contentHash: string; offset: number; size: number };
    return { kind, requestId, contentHash, offset, size };
  }
  if (kind === 'response' && metadata.ok === true && metadata.payloadLength === payload.byteLength) {
    return { kind, requestId, ok: true, payload };
  }
  if (kind === 'response' && metadata.ok === false && typeof metadata.error === 'string' && payload.byteLength === 0) {
    return { kind, requestId, ok: false, error: metadata.error };
  }
  throw new RangeError('unknown or truncated P2P frame');
};

/** 解码并严格校验一帧；截断、超限、区间越界或未知类型均以 RangeError 暴露。 */
export const decodeP2PFrame = (bytes: Uint8Array): P2PFrame => {
  if (bytes.byteLength < 4) throw new RangeError('P2P frame is truncated');
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (metadataLength === 0 || metadataLength > MAX_FRAME_METADATA || metadataLength > bytes.byteLength - 4)
    throw new RangeError('P2P frame metadata is truncated or too large');
  const metadata = parseMetadata(bytes.subarray(4, 4 + metadataLength));
  return toFrame(metadata, bytes.subarray(4 + metadataLength));
};
