import { describe, expect, it } from 'vitest';
import { decodeP2PFrame, encodeP2PFrame, P2P_SESSION_VERSION, type P2PFrame } from '../../session/frame.js';
import { MAX_P2P_FRAME_PAYLOAD } from '../../session/limits.js';
import { frameHeader } from '../fixtures.js';

const encoder = new TextEncoder();

/** 手工拼一帧：任意元数据 + 负载，用来构造编码器不会产出的帧。 */
const rawFrame = (metadata: unknown, payload: Uint8Array = new Uint8Array(0)): Uint8Array => {
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  return Uint8Array.from([...frameHeader(metadataBytes.byteLength), ...metadataBytes, ...payload]);
};

describe('P2P 会话帧 v2', () => {
  it('编码后解码得到同一帧：hello、请求、应答、错误、取消、心跳与 bye', () => {
    const frames: P2PFrame[] = [
      {
        kind: 'hello',
        session: P2P_SESSION_VERSION,
        instanceId: 'tab-1',
        credential: 'token',
        protocols: { 'p2p.files': 1 }
      },
      {
        kind: 'request',
        id: 7,
        protocol: 'p2p.files',
        method: 'read',
        params: { contentHash: 'h', offset: 0, size: 3 },
        payload: new Uint8Array(0)
      },
      { kind: 'response', id: 7, result: null, payload: new Uint8Array([1, 2, 3]) },
      { kind: 'error', id: 8, code: 'not_holder', message: 'peer does not hold requested content' },
      { kind: 'cancel', id: 9 },
      { kind: 'ping' },
      { kind: 'pong' },
      { kind: 'bye', reason: 'closed' }
    ];
    for (const frame of frames) expect(decodeP2PFrame(encodeP2PFrame(frame))).toEqual(frame);
  });

  it('请求可以带二进制负载，参数缺省编码为 null', () => {
    const decoded = decodeP2PFrame(
      encodeP2PFrame({
        kind: 'request',
        id: 1,
        protocol: 'echo',
        method: 'put',
        params: null,
        payload: new Uint8Array([9, 8])
      })
    );
    expect(decoded).toEqual({
      kind: 'request',
      id: 1,
      protocol: 'echo',
      method: 'put',
      params: null,
      payload: new Uint8Array([9, 8])
    });
  });

  it('未知帧类型解码为 null，留给会话忽略：较新版本的对端不会因此断连', () => {
    expect(decodeP2PFrame(rawFrame({ kind: 'stream-data', id: 1, payloadLength: 2 }, new Uint8Array([1, 2])))).toBe(
      null
    );
  });

  it('已知帧类型字段不合法即抛 RangeError', () => {
    const malformed = [
      { kind: 'request', id: -1, protocol: 'p', method: 'm', params: null, payloadLength: 0 },
      { kind: 'request', id: 1.5, protocol: 'p', method: 'm', params: null, payloadLength: 0 },
      { kind: 'request', id: 1, protocol: '', method: 'm', params: null, payloadLength: 0 },
      { kind: 'request', id: 1, protocol: 'p', method: 'x'.repeat(200), params: null, payloadLength: 0 },
      { kind: 'response', id: 'a', result: null, payloadLength: 0 },
      { kind: 'error', id: 1, code: 7, message: 'm', payloadLength: 0 },
      { kind: 'cancel', payloadLength: 0 },
      { kind: 'bye', payloadLength: 0 },
      { kind: 'hello', session: 2, instanceId: 'i', credential: 'c', protocols: { p: 0 }, payloadLength: 0 },
      { kind: 'hello', session: 2, instanceId: 'i', credential: 'c', protocols: [], payloadLength: 0 },
      { kind: 'hello', session: 2, instanceId: '', credential: 'c', protocols: {}, payloadLength: 0 }
    ];
    for (const metadata of malformed) expect(() => decodeP2PFrame(rawFrame(metadata))).toThrow(RangeError);
  });

  it('负载长度与元数据不符、不带负载的帧却有负载，都判截断或畸形', () => {
    expect(() => decodeP2PFrame(rawFrame({ kind: 'ping', payloadLength: 1 }))).toThrow(RangeError);
    expect(() => decodeP2PFrame(rawFrame({ kind: 'ping', payloadLength: 1 }, new Uint8Array([1])))).toThrow(RangeError);
    expect(() => decodeP2PFrame(rawFrame({ payloadLength: 0 }))).toThrow(RangeError);
  });

  it('拒绝截断的帧头、超长或非对象的元数据', () => {
    expect(() => decodeP2PFrame(new Uint8Array([0, 0, 0]))).toThrow(RangeError);
    expect(() => decodeP2PFrame(encoder.encode('invalid'))).toThrow(RangeError);
    const oversized = new Uint8Array(4 + 64 * 1024);
    new DataView(oversized.buffer).setUint32(0, 64 * 1024);
    expect(() => decodeP2PFrame(oversized)).toThrow(RangeError);
    const notAnObject = Uint8Array.from([...frameHeader(1), ...encoder.encode('7')]);
    expect(() => decodeP2PFrame(notAnObject)).toThrow('metadata is invalid');
    const notJson = Uint8Array.from([...frameHeader(7), ...encoder.encode('{"kind"')]);
    expect(() => decodeP2PFrame(notJson)).toThrow('metadata is invalid');
  });

  it('编码时错误文本截断到协议上限；负载或元数据超限直接拒绝', () => {
    const longError = decodeP2PFrame(
      encodeP2PFrame({ kind: 'error', id: 1, code: 'internal', message: 'x'.repeat(10_000) })
    );
    expect(longError?.kind === 'error' && longError.message.length).toBeLessThanOrEqual(1024);
    expect(() =>
      encodeP2PFrame({ kind: 'response', id: 1, result: null, payload: new Uint8Array(MAX_P2P_FRAME_PAYLOAD + 1) })
    ).toThrow(RangeError);
    expect(() =>
      encodeP2PFrame({
        kind: 'request',
        id: 1,
        protocol: 'p',
        method: 'm',
        params: 'x'.repeat(10_000),
        payload: new Uint8Array(0)
      })
    ).toThrow(RangeError);
  });
});
