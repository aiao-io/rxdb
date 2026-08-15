import { describe, expect, it } from 'vitest';

import {
  createDevToolsV2Message,
  DEVTOOLS_V2_MESSAGE_DIRECTIONS,
  DEVTOOLS_V2_MESSAGE_TYPES,
  isDevToolsV2Envelope,
  isDevToolsV2Message
} from '../../v2/wire.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../../types.js';

const SESSION_ID = '7f3e4d2c-1a0b-4c9d-8e7f-0a1b2c3d4e5f';
const OTHER_SESSION_ID = '00000000-0000-4000-8000-000000000001';

/** 组装一条外层合法的 v2 消息，便于逐字段做负向用例。 */
function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    protocol: 2,
    direction: 'panel-to-connector',
    type: 'PING',
    sessionId: SESSION_ID,
    payload: null,
    timestamp: 1_700_000_000_000,
    sequence: 1,
    ...overrides
  };
}

describe('v2 message catalogue', () => {
  it('MUST declare a direction for every message type', () => {
    for (const type of DEVTOOLS_V2_MESSAGE_TYPES) {
      expect(DEVTOOLS_V2_MESSAGE_DIRECTIONS[type]).toBeDefined();
    }
  });

  it('MUST rename the ambiguous v1 CLEAR to CLEAR_EVENT_BUFFER', () => {
    // v2 不再有含糊的 `CLEAR`：语义收窄为「只清本 session 的事件缓冲」，
    // 数据库 / Storage / OPFS 清理另由 `settings.clear` 定义。
    expect(DEVTOOLS_V2_MESSAGE_TYPES).toContain('CLEAR_EVENT_BUFFER');
    expect(DEVTOOLS_V2_MESSAGE_TYPES).not.toContain('CLEAR');
  });
});

describe('isDevToolsV2Envelope', () => {
  it('MUST accept a well-formed outer layer without inspecting the payload', () => {
    // 外层宽、内层严：外层只判「这是不是一条 v2 消息」，payload 交给 exact-key 内层 guard。
    expect(isDevToolsV2Envelope(envelope({ type: 'REQUEST', payload: { garbage: true } }))).toBe(true);
  });

  it('MUST reject v1 envelopes', () => {
    expect(
      isDevToolsV2Envelope({
        source: RXDB_DEVTOOLS_MESSAGE,
        direction: 'devtools-to-page',
        type: 'PING',
        payload: null,
        timestamp: 1,
        sequence: 1
      })
    ).toBe(false);
  });

  it('MUST reject wrong source, protocol, direction, type and non-safe-integer metadata', () => {
    expect(isDevToolsV2Envelope(envelope({ source: 'other' }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ protocol: 1 }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ direction: 'page-to-devtools' }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ type: 'NOPE' }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ timestamp: -1 }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ sequence: 1.5 }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ sequence: Number.NaN }))).toBe(false);
  });

  it('MUST reject extra and missing envelope keys', () => {
    expect(isDevToolsV2Envelope(envelope({ extra: 1 }))).toBe(false);
    const { payload: _payload, ...withoutPayload } = envelope();
    expect(isDevToolsV2Envelope(withoutPayload)).toBe(false);
  });

  it('MUST reject a direction the message type is not allowed to travel', () => {
    expect(isDevToolsV2Envelope(envelope({ type: 'HANDSHAKE', direction: 'panel-to-connector' }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ type: 'PING', direction: 'connector-to-panel' }))).toBe(false);
  });

  it('MUST allow a null sessionId only during negotiation', () => {
    expect(
      isDevToolsV2Envelope(envelope({ type: 'PROTOCOL_HELLO', sessionId: null, payload: { supportedVersions: [2, 1] } }))
    ).toBe(true);
    expect(isDevToolsV2Envelope(envelope({ sessionId: null }))).toBe(false);
    expect(isDevToolsV2Envelope(envelope({ sessionId: 'not-a-uuid' }))).toBe(false);
  });

  it('MUST reject non-object input without throwing', () => {
    expect(isDevToolsV2Envelope(null)).toBe(false);
    expect(isDevToolsV2Envelope('PING')).toBe(false);
    expect(isDevToolsV2Envelope([envelope()])).toBe(false);
  });
});

describe('isDevToolsV2Message payload guards', () => {
  it('MUST accept the exact PROTOCOL_HELLO payload', () => {
    const hello = envelope({ type: 'PROTOCOL_HELLO', sessionId: null, payload: { supportedVersions: [2, 1] } });

    expect(isDevToolsV2Message(hello)).toBe(true);
    expect(isDevToolsV2Message({ ...hello, payload: { supportedVersions: [1, 2] } })).toBe(false);
    expect(isDevToolsV2Message({ ...hello, payload: { supportedVersions: [2], extra: 1 } })).toBe(false);
    expect(isDevToolsV2Message({ ...hello, payload: {} })).toBe(false);
  });

  it('MUST accept the exact v2 HANDSHAKE payload and pin protocolVersion at 2', () => {
    const handshake = envelope({
      type: 'HANDSHAKE',
      direction: 'connector-to-panel',
      payload: { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } }
    });

    expect(isDevToolsV2Message(handshake)).toBe(true);
    expect(
      isDevToolsV2Message({
        ...handshake,
        payload: { protocolVersion: 3, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } }
      })
    ).toBe(false);
    expect(
      isDevToolsV2Message({
        ...handshake,
        payload: { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'root', descriptors: [] } }
      })
    ).toBe(false);
  });

  it('MUST reject a handshake whose payload sessionId disagrees with the envelope', () => {
    // 两个 sessionId 不一致会让「旧 session 消息一律拒绝」的判定取决于读哪一个字段。
    const handshake = envelope({
      type: 'HANDSHAKE',
      direction: 'connector-to-panel',
      payload: {
        protocolVersion: 2,
        sessionId: OTHER_SESSION_ID,
        capabilities: { capability: 'readonly', descriptors: [] }
      }
    });

    expect(isDevToolsV2Message(handshake)).toBe(false);
    expect(isDevToolsV2Message({ ...handshake, payload: null })).toBe(false);
  });

  it('MUST accept the exact v2 HANDSHAKE_ACK payload', () => {
    const ack = envelope({ type: 'HANDSHAKE_ACK', payload: { protocolVersion: 2, sessionId: SESSION_ID } });

    expect(isDevToolsV2Message(ack)).toBe(true);
    expect(isDevToolsV2Message({ ...ack, payload: { protocolVersion: 2, sessionId: SESSION_ID, extra: 1 } })).toBe(
      false
    );
  });

  it('MUST require a null payload for the lifecycle messages', () => {
    expect(isDevToolsV2Message(envelope({ type: 'PING', payload: null }))).toBe(true);
    expect(isDevToolsV2Message(envelope({ type: 'CLEAR_EVENT_BUFFER', payload: null }))).toBe(true);
    expect(isDevToolsV2Message(envelope({ type: 'PING', payload: {} }))).toBe(false);
    expect(isDevToolsV2Message(envelope({ type: 'PING', payload: undefined }))).toBe(false);
  });

  it('MUST validate REQUEST identifiers, domain and operation', () => {
    const request = envelope({
      type: 'REQUEST',
      payload: { requestId: 'req-1', domain: 'files', operation: 'list', params: { path: '/' } }
    });

    expect(isDevToolsV2Message(request)).toBe(true);
    expect(isDevToolsV2Message({ ...request, payload: { ...request['payload'] as object, requestId: 'req 1' } })).toBe(
      false
    );
    expect(
      isDevToolsV2Message({ ...request, payload: { ...(request['payload'] as object), operation: 'inspect' } })
    ).toBe(false);
    expect(isDevToolsV2Message({ ...request, payload: { ...(request['payload'] as object), domain: 'network' } })).toBe(
      false
    );
  });

  it('MUST validate the TRANSFER_CHUNK numeric and base64 fields', () => {
    const chunk = envelope({
      type: 'TRANSFER_CHUNK',
      payload: { transferId: 'tx-1', chunkIndex: 0, offset: 0, dataBase64: 'SGk=' }
    });

    expect(isDevToolsV2Message(chunk)).toBe(true);
    expect(isDevToolsV2Message({ ...chunk, payload: { ...(chunk['payload'] as object), chunkIndex: -1 } })).toBe(false);
    expect(isDevToolsV2Message({ ...chunk, payload: { ...(chunk['payload'] as object), offset: 1.5 } })).toBe(false);
    expect(
      isDevToolsV2Message({ ...chunk, payload: { ...(chunk['payload'] as object), offset: Number.MAX_SAFE_INTEGER + 2 } })
    ).toBe(false);
  });

  it('MUST leave base64 canonicality to the transfer state machine, not the wire guard', () => {
    // wire guard 只判「是不是字符串」。规范性判定必须发生在 transfer 状态机里，
    // 因为拒绝结果要影响 idle deadline 的刷新时机——那是 wire 层看不到的状态。
    const chunk = envelope({
      type: 'TRANSFER_CHUNK',
      payload: { transferId: 'tx-1', chunkIndex: 0, offset: 0, dataBase64: 'SGk' }
    });

    expect(isDevToolsV2Message(chunk)).toBe(true);
  });

  it('MUST validate the remaining transfer payloads', () => {
    expect(
      isDevToolsV2Message(
        envelope({ type: 'TRANSFER_START', payload: { transferId: 'tx-1', requestId: 'req-1', totalBytes: 0 } })
      )
    ).toBe(true);
    expect(isDevToolsV2Message(envelope({ type: 'TRANSFER_COMPLETE', payload: { transferId: 'tx-1' } }))).toBe(true);
    expect(isDevToolsV2Message(envelope({ type: 'TRANSFER_CANCEL', payload: { transferId: 'tx-1' } }))).toBe(true);
    expect(
      isDevToolsV2Message(
        envelope({ type: 'TRANSFER_START', payload: { transferId: 'tx-1', requestId: 'req-1', totalBytes: -1 } })
      )
    ).toBe(false);
  });

  it('MUST validate RESPONSE, ERROR and EVENT payloads', () => {
    expect(
      isDevToolsV2Message(
        envelope({ type: 'RESPONSE', direction: 'connector-to-panel', payload: { requestId: 'req-1', result: null } })
      )
    ).toBe(true);
    expect(
      isDevToolsV2Message(
        envelope({
          type: 'ERROR',
          direction: 'connector-to-panel',
          payload: { requestId: 'req-1', error: { code: 'operation_failed', retryable: false } }
        })
      )
    ).toBe(true);
    expect(
      isDevToolsV2Message(
        envelope({
          type: 'ERROR',
          direction: 'connector-to-panel',
          payload: { requestId: null, error: { code: 'session_closed', retryable: false } }
        })
      )
    ).toBe(true);
    expect(
      isDevToolsV2Message(
        envelope({
          type: 'ERROR',
          direction: 'connector-to-panel',
          payload: { requestId: 'req-1', error: { code: 'made_up', retryable: false } }
        })
      )
    ).toBe(false);
    expect(
      isDevToolsV2Message(
        envelope({ type: 'EVENT', direction: 'connector-to-panel', payload: { eventType: 'SYNC_BEGIN', data: {} } })
      )
    ).toBe(true);
  });
});

/** 每种消息类型的一份合法样本，用于统一的负向表驱动。 */
const VALID_PAYLOADS: Record<string, unknown> = {
  PROTOCOL_HELLO: { supportedVersions: [2, 1] },
  HANDSHAKE: {
    protocolVersion: 2,
    sessionId: SESSION_ID,
    capabilities: { capability: 'readonly', descriptors: [] }
  },
  HANDSHAKE_ACK: { protocolVersion: 2, sessionId: SESSION_ID },
  DISCONNECT: null,
  PING: null,
  PONG: null,
  CLEAR_EVENT_BUFFER: null,
  REQUEST: { requestId: 'req-1', domain: 'files', operation: 'list', params: null },
  RESPONSE: { requestId: 'req-1', result: null },
  ERROR: { requestId: 'req-1', error: { code: 'operation_failed', retryable: false } },
  EVENT: { eventType: 'SYNC_BEGIN', data: {} },
  TRANSFER_START: { transferId: 'tx-1', requestId: 'req-1', totalBytes: 0 },
  TRANSFER_CHUNK: { transferId: 'tx-1', chunkIndex: 0, offset: 0, dataBase64: 'SGk=' },
  TRANSFER_COMPLETE: { transferId: 'tx-1' },
  TRANSFER_CANCEL: { transferId: 'tx-1' }
};

/** 该类型允许的一个方向；双向类型任取其一即可。 */
function directionFor(type: string): string {
  const allowed = DEVTOOLS_V2_MESSAGE_DIRECTIONS[type as keyof typeof DEVTOOLS_V2_MESSAGE_DIRECTIONS];
  return allowed === 'both' ? 'panel-to-connector' : allowed;
}

describe('exact-key coverage across every message type', () => {
  it('MUST have a sample payload for every declared type', () => {
    // 样本表漏了某个类型，下面两条表驱动就会静默少测一种消息。
    expect(Object.keys(VALID_PAYLOADS).sort()).toEqual([...DEVTOOLS_V2_MESSAGE_TYPES].sort());
  });

  it.each([...DEVTOOLS_V2_MESSAGE_TYPES])('MUST accept the sample payload for %s', type => {
    const sessionId = type === 'PROTOCOL_HELLO' ? null : SESSION_ID;
    expect(
      isDevToolsV2Message(
        envelope({ type, direction: directionFor(type), sessionId, payload: VALID_PAYLOADS[type] })
      )
    ).toBe(true);
  });

  it.each([...DEVTOOLS_V2_MESSAGE_TYPES])('MUST reject a non-record payload for %s', type => {
    const sessionId = type === 'PROTOCOL_HELLO' ? null : SESSION_ID;
    expect(
      isDevToolsV2Message(envelope({ type, direction: directionFor(type), sessionId, payload: 'payload' }))
    ).toBe(false);
  });

  it.each([...DEVTOOLS_V2_MESSAGE_TYPES])('MUST reject an extra payload key for %s', type => {
    const sessionId = type === 'PROTOCOL_HELLO' ? null : SESSION_ID;
    const sample = VALID_PAYLOADS[type];
    // null 载荷的「多一个键」形态就是「不再是 null」——任何对象都必须被拒。
    const payload = sample === null ? { extra: 1 } : { ...(sample as object), extra: 1 };

    expect(isDevToolsV2Message(envelope({ type, direction: directionFor(type), sessionId, payload }))).toBe(false);
  });
});

describe('isDevToolsV2Message identifier and value checks', () => {
  it('MUST reject a malformed outer layer before touching the payload', () => {
    expect(isDevToolsV2Message(null)).toBe(false);
    expect(isDevToolsV2Message(envelope({ protocol: 1 }))).toBe(false);
  });

  it('MUST reject malformed identifiers in every id-bearing payload', () => {
    const cases: readonly (readonly [string, Record<string, unknown>])[] = [
      ['RESPONSE', { requestId: 'req 1', result: null }],
      ['ERROR', { requestId: 'req 1', error: { code: 'operation_failed', retryable: false } }],
      ['TRANSFER_START', { transferId: 'tx-1', requestId: '', totalBytes: 0 }],
      ['TRANSFER_CHUNK', { transferId: 'tx 1', chunkIndex: 0, offset: 0, dataBase64: 'SGk=' }],
      ['TRANSFER_COMPLETE', { transferId: 'tx 1' }]
    ];

    for (const [type, payload] of cases) {
      expect(isDevToolsV2Message(envelope({ type, direction: directionFor(type), payload }))).toBe(false);
    }
  });

  it('MUST reject a non-string dataBase64 while accepting any string', () => {
    const base = { transferId: 'tx-1', chunkIndex: 0, offset: 0 };

    expect(isDevToolsV2Message(envelope({ type: 'TRANSFER_CHUNK', payload: { ...base, dataBase64: 42 } }))).toBe(false);
    expect(isDevToolsV2Message(envelope({ type: 'TRANSFER_CHUNK', payload: { ...base, dataBase64: '' } }))).toBe(true);
  });

  it('MUST reject an empty or blank EVENT eventType', () => {
    expect(
      isDevToolsV2Message(
        envelope({ type: 'EVENT', direction: 'connector-to-panel', payload: { eventType: '  ', data: null } })
      )
    ).toBe(false);
  });

  it('MUST reject handshake capabilities that are malformed', () => {
    const withCapabilities = (capabilities: unknown): Record<string, unknown> =>
      envelope({
        type: 'HANDSHAKE',
        direction: 'connector-to-panel',
        payload: { protocolVersion: 2, sessionId: SESSION_ID, capabilities }
      });

    expect(isDevToolsV2Message(withCapabilities('readonly'))).toBe(false);
    expect(isDevToolsV2Message(withCapabilities({ capability: 'readonly' }))).toBe(false);
    expect(isDevToolsV2Message(withCapabilities({ capability: 'readonly', descriptors: {} }))).toBe(false);
    expect(
      isDevToolsV2Message(withCapabilities({ capability: 'readonly', descriptors: [{ domain: 'files' }] }))
    ).toBe(false);
  });

  it('MUST reject a HANDSHAKE_ACK whose protocolVersion is not 2', () => {
    expect(
      isDevToolsV2Message(envelope({ type: 'HANDSHAKE_ACK', payload: { protocolVersion: 1, sessionId: SESSION_ID } }))
    ).toBe(false);
  });
});

describe('createDevToolsV2Message', () => {
  it('MUST derive direction from the message type and emit a self-valid message', () => {
    const message = createDevToolsV2Message('PROTOCOL_HELLO', { supportedVersions: [2, 1] }, {
      sessionId: null,
      sequence: 3,
      timestamp: 1_700_000_000_000
    });

    expect(message.direction).toBe('panel-to-connector');
    expect(isDevToolsV2Message(message)).toBe(true);
  });

  it('MUST emit a self-valid message for a bidirectional type', () => {
    const message = createDevToolsV2Message(
      'TRANSFER_CANCEL',
      { transferId: 'tx-1' },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1, direction: 'connector-to-panel' }
    );

    expect(message.direction).toBe('connector-to-panel');
    expect(isDevToolsV2Message(message)).toBe(true);
  });

  it('MUST refuse to build a bidirectional message without an explicit direction', () => {
    expect(() =>
      createDevToolsV2Message('TRANSFER_CANCEL', { transferId: 'tx-1' }, { sessionId: SESSION_ID, sequence: 1, timestamp: 1 })
    ).toThrow(TypeError);
  });

  it('MUST refuse a direction the message type is not allowed to travel', () => {
    // 方向由类型推导。允许调用方覆盖成非法方向，等于把「ACK 归 panel 所有」这条约束
    // 推迟到接收侧才发现——那时伪造帧已经跨了三段中继。
    expect(() =>
      createDevToolsV2Message(
        'HANDSHAKE_ACK',
        { protocolVersion: 2, sessionId: SESSION_ID },
        { sessionId: SESSION_ID, sequence: 1, timestamp: 1, direction: 'connector-to-panel' }
      )
    ).toThrow(TypeError);
  });

  it('MUST survive a JSON round-trip unchanged', () => {
    // v2 帧要跨 Port / IPC / invoke 三种 transport，唯一有等价保证的表示是 JSON 文本。
    const message = createDevToolsV2Message(
      'HANDSHAKE_ACK',
      { protocolVersion: 2, sessionId: SESSION_ID },
      { sessionId: SESSION_ID, sequence: 7, timestamp: 1_700_000_000_000 }
    );
    const frame = JSON.stringify(message);

    expect(JSON.stringify(JSON.parse(frame))).toBe(frame);
    expect(isDevToolsV2Message(JSON.parse(frame))).toBe(true);
  });
});
