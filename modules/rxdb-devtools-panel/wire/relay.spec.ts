import { createDevToolsV2Message, createMessage, RXDB_DEVTOOLS_MESSAGE } from '@aiao/rxdb-devtools';
import { describe, expect, it } from 'vitest';
import { isRelayFrameTowards, isRelayHandshake, relayDirectionOf } from './relay';

/** 协商完成后每一帧都必须归属的规范 UUID v4。 */
const SESSION_ID = '4b1d0f3a-2c6e-4a58-9f31-8d7c5e2b0a94';

describe('relayDirectionOf', () => {
  it('把 v1 的两个方向标签映射到中继方向', () => {
    expect(relayDirectionOf(createMessage('HANDSHAKE', 'page-to-devtools', null, 1))).toBe('to-panel');
    expect(relayDirectionOf(createMessage('PING', 'devtools-to-page', null, 1))).toBe('to-page');
  });

  it.each([
    ['PROTOCOL_HELLO', 'to-page'],
    ['HANDSHAKE', 'to-panel'],
    ['HANDSHAKE_ACK', 'to-page'],
    ['REQUEST', 'to-page'],
    ['RESPONSE', 'to-panel'],
    ['EVENT', 'to-panel']
  ] as const)('把 v2 的 %s 映射到 %s', (type, expected) => {
    // 这组用例是 C2 的核心回归：在中继换成宽外层判定之前，下面每一条都返回 null——
    // 也就是 v2 帧在 Chrome 上一条都过不去，阶段 B 的协议在这条链路上是死的。
    const frame = v2Frame(type);
    expect(relayDirectionOf(frame)).toBe(expected);
  });

  it('双向类型按帧自己声明的方向路由', () => {
    const upstream = createDevToolsV2Message(
      'TRANSFER_CHUNK',
      { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: 'AA==' },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1, direction: 'connector-to-panel' }
    );
    const downstream = createDevToolsV2Message(
      'TRANSFER_CHUNK',
      { transferId: 't1', chunkIndex: 0, offset: 0, dataBase64: 'AA==' },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1, direction: 'panel-to-connector' }
    );

    expect(relayDirectionOf(upstream)).toBe('to-panel');
    expect(relayDirectionOf(downstream)).toBe('to-page');
  });

  it('拒绝非本协议的值', () => {
    for (const value of [
      null,
      undefined,
      42,
      'PING',
      {},
      { type: 'PING' },
      [createMessage('PING', 'devtools-to-page', null, 1)]
    ]) {
      expect(relayDirectionOf(value)).toBeNull();
    }
  });

  it('拒绝自称本协议但信封不成立的帧', () => {
    const base = v2Frame('PING') as Record<string, unknown>;

    // 少了版本判别位：v1 严校验不认识 `PING` 之外的 v2 类型，v2 外层守卫要求 `protocol: 2`。
    expect(relayDirectionOf({ ...base, protocol: 1 })).toBeNull();
    // 方向与类型不匹配：`PING` 只能下行，一条上行的 PING 只可能来自伪造。
    expect(relayDirectionOf({ ...base, direction: 'connector-to-panel' })).toBeNull();
    // 夹带键：中继不看 payload，但信封必须精确匹配，夹带是最省事的注入手段。
    expect(relayDirectionOf({ ...base, extra: 1 })).toBeNull();
    // 来源标记不对：同源 message 洪流里必须先筛出本协议的帧。
    expect(relayDirectionOf({ ...base, source: 'other' })).toBeNull();
  });
});

describe('isRelayFrameTowards', () => {
  it('只接受朝向指定方向的帧', () => {
    const upstream = createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
    const downstream = v2Frame('REQUEST');

    expect(isRelayFrameTowards(upstream, 'to-panel')).toBe(true);
    expect(isRelayFrameTowards(upstream, 'to-page')).toBe(false);
    expect(isRelayFrameTowards(downstream, 'to-page')).toBe(true);
    expect(isRelayFrameTowards(downstream, 'to-panel')).toBe(false);
    expect(isRelayFrameTowards({ type: 'REQUEST' }, 'to-page')).toBe(false);
  });

  it('把值收窄成可读 type 的中继帧', () => {
    const frame: unknown = v2Frame('RESPONSE');
    if (!isRelayFrameTowards(frame, 'to-panel')) throw new Error('unreachable');

    // 收窄的意义在这一行：转发点要记日志、要上报错误，必须能读 `type` 而**不用 as**。
    // 一旦这里退回成 `unknown`，转发点就会重新长出强转，而强转正是 v1-only 判定的藏身处。
    expect(frame.type).toBe('RESPONSE');
  });
});

describe('isRelayHandshake', () => {
  it('认得两代协议的上行握手', () => {
    expect(isRelayHandshake(createMessage('HANDSHAKE', 'page-to-devtools', null, 1))).toBe(true);
    expect(isRelayHandshake(v2Frame('HANDSHAKE'))).toBe(true);
  });

  it('不认下行帧与其它类型', () => {
    expect(isRelayHandshake(createMessage('PING', 'devtools-to-page', null, 1))).toBe(false);
    expect(isRelayHandshake(v2Frame('HANDSHAKE_ACK'))).toBe(false);
    expect(isRelayHandshake({ source: RXDB_DEVTOOLS_MESSAGE, type: 'HANDSHAKE' })).toBe(false);
  });
});

/** 造一帧类型正确、方向由协议表决定的合法 v2 消息。 */
function v2Frame(
  type: 'PROTOCOL_HELLO' | 'HANDSHAKE' | 'HANDSHAKE_ACK' | 'REQUEST' | 'RESPONSE' | 'EVENT' | 'PING'
): unknown {
  const options = { sessionId: SESSION_ID, sequence: 1, timestamp: 1 } as const;
  switch (type) {
    case 'PING':
      return createDevToolsV2Message('PING', null, options);
    case 'PROTOCOL_HELLO':
      return createDevToolsV2Message('PROTOCOL_HELLO', { supportedVersions: [2, 1] }, { ...options, sessionId: null });
    case 'HANDSHAKE':
      return createDevToolsV2Message(
        'HANDSHAKE',
        { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
        options
      );
    case 'HANDSHAKE_ACK':
      return createDevToolsV2Message('HANDSHAKE_ACK', { protocolVersion: 2, sessionId: SESSION_ID }, options);
    case 'REQUEST':
      return createDevToolsV2Message(
        'REQUEST',
        { requestId: 'r1', domain: 'database', operation: 'query', params: {} },
        options
      );
    case 'RESPONSE':
      return createDevToolsV2Message('RESPONSE', { requestId: 'r1', result: null }, options);
    case 'EVENT':
      return createDevToolsV2Message('EVENT', { eventType: 'insert', data: null }, options);
  }
}
