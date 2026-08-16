import { describe, expect, it } from 'vitest';

import { createMessage } from '../../types.js';
import type { AnyDevToolsMessage } from '../../types.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import { DEVTOOLS_PROTOCOL_VERSION_V2 } from '../../v2/constants.js';
import { isCanonicalUuidV4 } from '../../v2/ids.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../../v2/wire.js';
import { createConnectorNegotiation } from '../../v2/negotiation-connector.js';
import type { DevToolsConnectorNegotiationMessage } from '../../v2/negotiation-connector.js';

const OTHER_SESSION_ID = 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4';

/** connector owner 自己构造的 eager 握手；协商机只决定它何时出门。 */
function legacyHandshake(): AnyDevToolsMessage {
  return createMessage('HANDSHAKE', 'page-to-devtools', null, 1);
}

function hello(supportedVersions: readonly number[] = [DEVTOOLS_PROTOCOL_VERSION_V2, 1], sequence = 1): unknown {
  return createDevToolsV2Message(
    'PROTOCOL_HELLO',
    { supportedVersions },
    { sessionId: null, sequence, timestamp: 1_700_000_000_000 }
  );
}

function ack(sessionId: string, sequence = 2): unknown {
  return createDevToolsV2Message(
    'HANDSHAKE_ACK',
    { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId },
    { sessionId, sequence, timestamp: 1_700_000_000_000 }
  );
}

function setup(supportedVersions?: readonly number[]): {
  legacy: AnyDevToolsMessage;
  sent: DevToolsConnectorNegotiationMessage[];
  connector: ReturnType<typeof createConnectorNegotiation>;
} {
  const legacy = legacyHandshake();
  const sent: DevToolsConnectorNegotiationMessage[] = [];
  const connector = createConnectorNegotiation({
    clock: createFakeClock(),
    send: message => sent.push(message),
    capability: 'readonly',
    descriptors: [],
    legacyHandshake: legacy,
    ...(supportedVersions === undefined ? {} : { supportedVersions })
  });
  return { legacy, sent, connector };
}

function typesOf(sent: readonly DevToolsConnectorNegotiationMessage[]): string[] {
  return sent.map(message => message.type);
}

describe('connector negotiation', () => {
  it('MUST send the eager legacy HANDSHAKE first, before any v2 frame', () => {
    // 旧面板只认这一条；把任何 v2 帧插到它前面都会让 v1 链路多出一条看不懂的消息。
    const { legacy, sent, connector } = setup();
    connector.start();

    expect(sent).toEqual([legacy]);
    expect(connector.state).toBe('announced');
  });

  it('MUST mint one canonical UUID v4 session for the whole transport connection', () => {
    const { connector } = setup();
    expect(isCanonicalUuidV4(connector.sessionId)).toBe(true);

    const other = setup();
    expect(other.connector.sessionId).not.toBe(connector.sessionId);
  });

  it('MUST answer EVERY legal HELLO, not just the first', () => {
    // 已经发过 eager legacy HANDSHAKE 不构成「这条 HELLO 是重复消息」的理由：
    // panel 的补发正是为了对付「首个 HELLO 早已丢失」的情形。
    const { sent, connector } = setup();
    connector.start();
    connector.receive(hello());
    connector.receive(hello([DEVTOOLS_PROTOCOL_VERSION_V2], 2));

    expect(typesOf(sent)).toEqual(['HANDSHAKE', 'HANDSHAKE', 'HANDSHAKE']);
    expect(connector.state).toBe('offered');
    // 两条响应必须复用同一个 session：一次连接只允许一个 session，逐条铸造会让两端各认一个。
    const offers = sent.slice(1).filter(isDevToolsV2Message);
    expect(offers).toHaveLength(2);
    expect(offers.every(message => message.sessionId === connector.sessionId)).toBe(true);
  });

  it('MUST offer a self-consistent v2 HANDSHAKE that passes the strict guard', () => {
    const { sent, connector } = setup();
    connector.start();
    connector.receive(hello());

    const offer = sent.at(-1);
    expect(isDevToolsV2Message(offer)).toBe(true);
    expect(offer).toMatchObject({
      type: 'HANDSHAKE',
      direction: 'connector-to-panel',
      sessionId: connector.sessionId,
      payload: {
        protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
        sessionId: connector.sessionId,
        capabilities: { capability: 'readonly', descriptors: [] }
      }
    });
  });

  it('MUST establish the session only on an ACK that echoes its own session id', () => {
    const { connector } = setup();
    connector.start();
    connector.receive(hello());
    connector.receive(ack(connector.sessionId));

    expect(connector.state).toBe('v2');
    expect(connector.negotiatedVersion).toBe(DEVTOOLS_PROTOCOL_VERSION_V2);
  });

  it('MUST reject a cross-session ACK, an unsolicited ACK and a duplicate ACK', () => {
    const cross = setup();
    cross.connector.start();
    cross.connector.receive(hello());
    cross.connector.receive(ack(OTHER_SESSION_ID));
    expect(cross.connector.state).toBe('offered');
    expect(cross.connector.rejectedFrames).toBe(1);

    const unsolicited = setup();
    unsolicited.connector.start();
    unsolicited.connector.receive(ack(unsolicited.connector.sessionId));
    expect(unsolicited.connector.state).toBe('announced');
    expect(unsolicited.connector.rejectedFrames).toBe(1);

    const duplicate = setup();
    duplicate.connector.start();
    duplicate.connector.receive(hello());
    duplicate.connector.receive(ack(duplicate.connector.sessionId));
    duplicate.connector.receive(ack(duplicate.connector.sessionId, 3));
    expect(duplicate.connector.state).toBe('v2');
    expect(duplicate.connector.rejectedFrames).toBe(1);
  });

  it('MUST reject a HELLO that arrives after the session is established', () => {
    const { sent, connector } = setup();
    connector.start();
    connector.receive(hello());
    connector.receive(ack(connector.sessionId));

    const settled = sent.length;
    connector.receive(hello([DEVTOOLS_PROTOCOL_VERSION_V2], 5));

    expect(sent).toHaveLength(settled);
    expect(connector.rejectedFrames).toBe(1);
    expect(connector.state).toBe('v2');
  });

  it('MUST answer protocol_unsupported with its own version list when there is no overlap', () => {
    const { sent, connector } = setup();
    connector.start();
    connector.receive(hello([7, 5]));

    expect(connector.state).toBe('announced');
    expect(connector.negotiatedVersion).toBeNull();
    expect(sent.at(-1)).toMatchObject({
      type: 'ERROR',
      direction: 'connector-to-panel',
      payload: {
        requestId: null,
        error: { code: 'protocol_unsupported', retryable: false, message: 'supported versions: 2,1' }
      }
    });
    // 错误帧本身必须是合法 v2 消息，否则 panel 侧的严 guard 会把它当垃圾丢掉。
    expect(isDevToolsV2Message(sent.at(-1))).toBe(true);
  });

  it('MUST stay silent when the highest common version is v1', () => {
    // 双方都能说 v1，eager legacy HANDSHAKE 就是全部要约；再回 protocol_unsupported 是谎报。
    const { legacy, sent, connector } = setup();
    connector.start();
    connector.receive(hello([9, 1]));

    // 只有那条 legacy 握手；不能有第二条同名的 v2 HANDSHAKE 混进来。
    expect(sent).toEqual([legacy]);
    expect(connector.negotiatedVersion).toBe(1);
    expect(connector.rejectedFrames).toBe(0);
  });

  it('MUST answer invalid_message for a HELLO whose payload fails the strict guard', () => {
    const malformed = [
      { supportedVersions: [1, 2] }, // 非降序
      { supportedVersions: [2, 2] }, // 重复
      { supportedVersions: [] }, // 空
      { supportedVersions: [2, 1, 0] }, // 越界
      { supportedVersions: [2.5] }, // 非整数
      { supportedVersions: 2 } // 非数组
    ];

    for (const payload of malformed) {
      const { sent, connector } = setup();
      connector.start();
      connector.receive({ ...(hello() as Record<string, unknown>), payload });

      expect(sent.at(-1)).toMatchObject({ type: 'ERROR', payload: { error: { code: 'invalid_message' } } });
      expect(connector.state).toBe('announced');
    }
  });

  it('MUST reject frames that claim this protocol but fail the envelope guard', () => {
    const { sent, connector } = setup();
    connector.start();
    const settled = sent.length;

    connector.receive({ ...(hello() as Record<string, unknown>), extra: 'key' });
    connector.receive({ ...(hello() as Record<string, unknown>), sessionId: 'not-a-uuid' });

    expect(connector.rejectedFrames).toBe(2);
    // 外壳都不合法时不回 ERROR：回一条本身就要靠外壳承载的错误，只会给伪造者一个放大器。
    expect(sent).toHaveLength(settled);
  });

  it('MUST ignore v1 frames and foreign frames alike', () => {
    // v1 帧由 connector.ts 的既有路径处理（v1 guard 先判），协商机不能把它们记成被拒帧。
    const { connector } = setup();
    connector.start();
    connector.receive(createMessage('PING', 'devtools-to-page', null, 1));
    connector.receive({ source: 'other-extension', type: 'PROTOCOL_HELLO' });
    connector.receive(undefined);

    expect(connector.rejectedFrames).toBe(0);
  });

  it('MUST leave session traffic to the session layer', () => {
    const { connector } = setup();
    connector.start();
    connector.receive(hello());
    connector.receive(ack(connector.sessionId));
    connector.receive(
      createDevToolsV2Message('PING', null, { sessionId: connector.sessionId, sequence: 4, timestamp: 1 })
    );

    expect(connector.rejectedFrames).toBe(0);
    expect(connector.state).toBe('v2');
  });

  it('MUST go deaf after dispose', () => {
    const { sent, connector } = setup();
    connector.start();
    connector.dispose();

    const settled = sent.length;
    connector.receive(hello());

    expect(sent).toHaveLength(settled);
    expect(connector.rejectedFrames).toBe(0);
  });

  it('MUST refuse to be restarted on the same transport connection', () => {
    const { connector } = setup();
    connector.start();
    expect(() => connector.start()).toThrow(/already started/);

    connector.dispose();
    expect(() => connector.start()).toThrow(/disposed/);
  });

  it('MUST refuse a malformed supportedVersions list at construction', () => {
    expect(() => setup([1, 2])).toThrow(/supportedVersions/);
    expect(() => setup([])).toThrow(/supportedVersions/);
  });
});
