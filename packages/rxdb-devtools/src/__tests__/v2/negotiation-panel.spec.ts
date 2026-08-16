import { describe, expect, it } from 'vitest';

import { createMessage } from '../../types.js';
import type { AnyDevToolsMessage } from '../../types.js';
import { createFakeClock } from '../../testing/fake-clock.js';
import { DEVTOOLS_NEGOTIATION_WINDOW_MS, DEVTOOLS_PROTOCOL_VERSION_V2 } from '../../v2/constants.js';
import { createDevToolsV2Message } from '../../v2/wire.js';
import type { DevToolsV2Message } from '../../v2/wire.js';
import { createPanelNegotiation } from '../../v2/negotiation-panel.js';
import type { DevToolsPanelNegotiationMessage } from '../../v2/negotiation-panel.js';

const SESSION_ID = '2f1c8a4e-6b0d-4f37-9c25-7ae3b8140d6f';
const OTHER_SESSION_ID = 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4';

/** 旧 connector 的 eager 握手；`null` payload 是弃用窗口内的合法形态。 */
function legacyHandshake(sequence = 1): AnyDevToolsMessage {
  return createMessage('HANDSHAKE', 'page-to-devtools', null, sequence);
}

function v2Handshake(sessionId = SESSION_ID): DevToolsV2Message {
  return createDevToolsV2Message(
    'HANDSHAKE',
    {
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
      sessionId,
      capabilities: { capability: 'readonly', descriptors: [] }
    },
    { sessionId, sequence: 1, timestamp: 1_700_000_000_000 }
  );
}

function setup(supportedVersions?: readonly number[]): {
  clock: ReturnType<typeof createFakeClock>;
  sent: DevToolsPanelNegotiationMessage[];
  panel: ReturnType<typeof createPanelNegotiation>;
} {
  const clock = createFakeClock();
  const sent: DevToolsPanelNegotiationMessage[] = [];
  const panel = createPanelNegotiation({
    clock,
    send: message => sent.push(message),
    ...(supportedVersions === undefined ? {} : { supportedVersions })
  });
  return { clock, sent, panel };
}

function typesOf(sent: readonly DevToolsPanelNegotiationMessage[]): string[] {
  return sent.map(message => message.type);
}

describe('panel negotiation', () => {
  it('MUST announce itself with exactly one session-less PROTOCOL_HELLO', () => {
    const { sent, panel } = setup();
    panel.start();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'PROTOCOL_HELLO',
      direction: 'panel-to-connector',
      sessionId: null,
      payload: { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] }
    });
    expect(panel.state).toBe('idle');
  });

  it('MUST NOT start the decision window at panel init', () => {
    // 窗口以 init 起算，正是本故事要修的缺陷：content script 注入要等
    // chrome.permissions.request 的用户授权，延迟无上界，计时器会在任何握手到达前过期。
    const { clock, sent, panel } = setup();
    panel.start();
    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS * 10);

    expect(typesOf(sent)).toEqual(['PROTOCOL_HELLO']);
    expect(panel.state).toBe('idle');
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST stash a legacy HANDSHAKE and re-send HELLO in the same tick', () => {
    const { sent, panel } = setup();
    const evidence = legacyHandshake();
    panel.start();
    panel.receive(evidence);

    // 「同一 tick」在这里是可判定的：receive 返回时补发已经发生，没有被推到任何异步边界。
    expect(typesOf(sent)).toEqual(['PROTOCOL_HELLO', 'PROTOCOL_HELLO']);
    expect(panel.state).toBe('awaiting');
    expect(panel.stashedHandshake).toBe(evidence);
  });

  it('MUST start the 1,000 ms window at the first stash, not at init', () => {
    const { clock, sent, panel } = setup();
    panel.start();
    clock.advance(5_000); // relay 就绪延迟；此刻窗口尚未启动
    panel.receive(legacyHandshake());

    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS - 1);
    expect(panel.state).toBe('awaiting');
    expect(typesOf(sent)).not.toContain('HANDSHAKE_ACK');

    clock.advance(1);
    expect(panel.state).toBe('v1-facade');
    expect(sent.at(-1)).toMatchObject({ type: 'HANDSHAKE_ACK', direction: 'devtools-to-page', payload: null });
  });

  it('MUST NOT extend the window when the connector re-handshakes at high frequency', () => {
    const { clock, sent, panel } = setup();
    panel.start();
    panel.receive(legacyHandshake(1));

    clock.advance(900);
    const last = legacyHandshake(3);
    panel.receive(legacyHandshake(2));
    panel.receive(last);

    // 暂存内容被替换，但窗口仍从首次暂存起算：第 1,000 ms 到期，而不是 1,900。
    expect(panel.stashedHandshake).toBe(last);
    expect(panel.state).toBe('awaiting');

    clock.advance(100);
    expect(panel.state).toBe('v1-facade');
    expect(sent.filter(message => message.type === 'HANDSHAKE_ACK')).toHaveLength(1);
  });

  it('MUST let a v2 HANDSHAKE inside the window win without ever entering v1', () => {
    const { clock, sent, panel } = setup();
    panel.start();
    panel.receive(legacyHandshake());
    panel.receive(v2Handshake());

    expect(panel.state).toBe('v2');
    expect(panel.sessionId).toBe(SESSION_ID);
    expect(sent.at(-1)).toMatchObject({
      type: 'HANDSHAKE_ACK',
      direction: 'panel-to-connector',
      sessionId: SESSION_ID,
      payload: { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: SESSION_ID }
    });
    // 计时器必须被取消：否则窗口到期时会补发一条 legacy ACK，短暂跌回 v1。
    expect(clock.pendingTimers()).toBe(0);

    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS * 2);
    expect(panel.state).toBe('v2');
    expect(sent.filter(message => message.direction === 'devtools-to-page')).toHaveLength(0);
    expect(panel.stashedHandshake).toBeNull();
  });

  it('MUST accept a v2 HANDSHAKE that arrives before any legacy evidence', () => {
    // 四段中继不保证两条握手的相对顺序；先到的 v2 不该因为「还没暂存」被丢掉。
    const { panel, sent } = setup();
    panel.start();
    panel.receive(v2Handshake());

    expect(panel.state).toBe('v2');
    expect(typesOf(sent)).toEqual(['PROTOCOL_HELLO', 'HANDSHAKE_ACK']);
  });

  it('MUST reject every late or forged handshake once a session exists', () => {
    const { panel, sent } = setup();
    panel.start();
    panel.receive(v2Handshake());
    const settled = sent.length;

    panel.receive(v2Handshake()); // 重复握手
    panel.receive(v2Handshake(OTHER_SESSION_ID)); // 交叉握手
    panel.receive(legacyHandshake(9)); // 迟到的 legacy 握手
    panel.receive({ ...v2Handshake(), extra: 'key' }); // 额外键
    panel.receive(
      createDevToolsV2Message(
        'HANDSHAKE_ACK',
        { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: SESSION_ID },
        { sessionId: SESSION_ID, sequence: 2, timestamp: 1 }
      )
    ); // ACK 回显：ACK 的所有权属于 panel 自己

    expect(panel.rejectedFrames).toBe(5);
    expect(panel.state).toBe('v2');
    expect(panel.sessionId).toBe(SESSION_ID);
    expect(sent).toHaveLength(settled);
  });

  it('MUST ignore frames that are not addressed to this protocol', () => {
    // 与「被拒帧」分开计数：非本协议的帧不是攻击面，计进去会让 AC#8 的计数失真。
    const { panel } = setup();
    panel.start();
    panel.receive(null);
    panel.receive({ source: 'other-extension', type: 'HANDSHAKE' });
    panel.receive('HANDSHAKE');

    expect(panel.rejectedFrames).toBe(0);
    expect(panel.state).toBe('idle');
  });

  it('MUST treat the v1 facade as terminal and flag the missed upgrade', () => {
    const { clock, sent, panel } = setup();
    panel.start();
    panel.receive(legacyHandshake());
    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS);
    expect(panel.state).toBe('v1-facade');
    expect(panel.downgraded).toBe(false);

    const settled = sent.length;
    panel.receive(v2Handshake());

    expect(panel.state).toBe('v1-facade');
    expect(panel.sessionId).toBeNull();
    expect(panel.downgraded).toBe(true);
    expect(panel.rejectedFrames).toBe(1);
    expect(sent).toHaveLength(settled);
  });

  it('MUST keep answering legacy handshakes inside the facade without re-probing for v2', () => {
    // ACK 的所有权属于 panel（AC#1）。facade 里若停止应答，重新握手的 v1 connector 会永远等下去，
    // 而唯一的替代方案是让 904c 的 bridge 自行合成 ACK——那正是本故事要禁的越权。
    const { clock, sent, panel } = setup();
    panel.start();
    panel.receive(legacyHandshake());
    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS);

    const settled = sent.length;
    panel.receive(legacyHandshake(7));

    expect(sent.slice(settled)).toHaveLength(1);
    expect(sent.at(-1)).toMatchObject({ type: 'HANDSHAKE_ACK', direction: 'devtools-to-page' });
    expect(panel.rejectedFrames).toBe(0);
    expect(panel.downgraded).toBe(false);
  });

  it('MUST record a protocol_unsupported rejection without establishing a session', () => {
    const { panel } = setup();
    panel.start();
    panel.receive(
      createDevToolsV2Message(
        'ERROR',
        { requestId: null, error: { code: 'protocol_unsupported', retryable: false, message: 'supported versions: 3' } },
        { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
      )
    );

    expect(panel.rejection).toEqual({
      code: 'protocol_unsupported',
      retryable: false,
      message: 'supported versions: 3'
    });
    expect(panel.state).toBe('idle');
    expect(panel.sessionId).toBeNull();
  });

  it('MUST leave session traffic to the session layer', () => {
    const { panel } = setup();
    panel.start();
    panel.receive(v2Handshake());
    panel.receive(
      createDevToolsV2Message('PONG', null, { sessionId: SESSION_ID, sequence: 3, timestamp: 1 })
    );

    expect(panel.rejectedFrames).toBe(0);
    expect(panel.state).toBe('v2');
  });

  it('MUST cancel the pending window on dispose and go deaf afterwards', () => {
    const { clock, sent, panel } = setup();
    panel.start();
    panel.receive(legacyHandshake());
    panel.dispose();

    expect(clock.pendingTimers()).toBe(0);

    const settled = sent.length;
    clock.advance(DEVTOOLS_NEGOTIATION_WINDOW_MS * 2);
    panel.receive(v2Handshake());

    expect(sent).toHaveLength(settled);
    expect(panel.state).toBe('awaiting');
  });

  it('MUST refuse to be restarted on the same transport connection', () => {
    // 重连必须换一个协商实例：复用会让 v1 facade 的「终态」跨连接残留，而终态只到重连为止。
    const { panel } = setup();
    panel.start();
    expect(() => panel.start()).toThrow(/already started/);

    panel.dispose();
    expect(() => panel.start()).toThrow(/disposed/);
  });

  it('MUST refuse a malformed supportedVersions list at construction', () => {
    expect(() => setup([1, 2])).toThrow(/supportedVersions/);
    expect(() => setup([])).toThrow(/supportedVersions/);
    expect(() => setup([2, 2, 1])).toThrow(/supportedVersions/);
  });
});
