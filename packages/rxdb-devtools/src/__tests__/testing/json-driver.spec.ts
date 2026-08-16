import { describe, expect, it } from 'vitest';

import type { DevToolsConformanceSession } from '../../testing/driver.js';
import { createScenario } from '../../testing/driver.js';
import { createJsonConformanceDriver } from '../../testing/json-driver.js';
import { runDevToolsWireHygieneSuite } from '../../testing/wire-hygiene.suite.js';
import { RXDB_DEVTOOLS_MESSAGE } from '../../types.js';
import { createDevToolsV2Message } from '../../v2/wire.js';

const SESSION_ID = '9c2f7a10-58b4-4d2e-b6a7-3e1f04c9d85b';

function pingFrame(sequence = 1): string {
  return JSON.stringify(
    createDevToolsV2Message('PING', null, { sessionId: SESSION_ID, timestamp: 1_700_000_000_000, sequence })
  );
}

function pongFrame(sequence = 1): string {
  return JSON.stringify(
    createDevToolsV2Message('PONG', null, { sessionId: SESSION_ID, timestamp: 1_700_000_000_000, sequence })
  );
}

// 强制前置套件在内存 driver 上必须绿：它是所有下游 driver 的对照组。
runDevToolsWireHygieneSuite(createJsonConformanceDriver());

describe('json conformance driver', () => {
  function open(overrides: Parameters<typeof createScenario>[0] = {}): Promise<DevToolsConformanceSession> {
    return createJsonConformanceDriver().open(createScenario(overrides));
  }

  it('MUST walk a downstream frame through all four segments in order', async () => {
    const session = await open();
    await session.segment('panel').inject(pingFrame(), 'panel-to-connector');

    expect(session.segment('panel').sent).toHaveLength(1);
    expect(session.segment('background').received).toHaveLength(1);
    expect(session.segment('content').received).toHaveLength(1);
    expect(session.segment('connector').received).toHaveLength(1);
    // 中间两段既收也转，端点段只收不转。
    expect(session.segment('content').sent).toHaveLength(1);
    expect(session.segment('connector').sent).toHaveLength(0);
  });

  it('MUST walk an upstream frame back to the panel', async () => {
    const session = await open();
    await session.segment('connector').inject(pongFrame(), 'connector-to-panel');

    expect(session.segment('content').received).toHaveLength(1);
    expect(session.segment('panel').received).toEqual([pongFrame()]);
  });

  it('MUST deliver asynchronously even at zero hop delay', async () => {
    // 同步投递会让「同一 tick 内补发 HELLO」这类断言恒真——每个 tick 都是同一个 tick。
    const session = await open();
    const panel = session.segment('panel');
    const sent = panel.inject(pingFrame(), 'panel-to-connector');

    expect(session.segment('background').received).toHaveLength(0);
    await sent;
    expect(session.segment('background').received).toHaveLength(1);
  });

  it('MUST hold a delayed frame until protocol time advances', async () => {
    const session = await open({ hopDelayMs: 5 });
    await session.segment('panel').inject(pingFrame(), 'panel-to-connector');

    // settle() 只排空微任务，绝不推进协议时间：等一次投递不能顺带引爆 15 s 请求时限。
    await session.settle();
    expect(session.segment('background').received).toHaveLength(0);

    await session.advanceTime(5);
    expect(session.segment('background').received).toHaveLength(1);
    expect(session.segment('connector').received).toHaveLength(0);

    await session.advanceTime(10);
    expect(session.segment('connector').received).toEqual([pingFrame()]);
  });

  it('MUST queue every frame until the relay reports ready', async () => {
    // 模拟 chrome.permissions.request 的无上界授权等待（AC#2）。
    const session = await open({ relayReadyDelayMs: 40 });
    await session.segment('panel').inject(pingFrame(), 'panel-to-connector');
    expect(session.segment('background').received).toHaveLength(0);

    await session.advanceTime(39);
    expect(session.segment('background').received).toHaveLength(0);

    await session.advanceTime(1);
    expect(session.segment('connector').received).toEqual([pingFrame()]);
  });

  it('MUST forge a legacy ACK at background when configured to replay the old relay', async () => {
    const session = await open({ relayAcksLegacyHandshake: true });
    const handshake = JSON.stringify(
      createDevToolsV2Message(
        'HANDSHAKE',
        { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
        { sessionId: SESSION_ID, timestamp: 1_700_000_000_000, sequence: 1 }
      )
    );
    await session.segment('connector').inject(handshake, 'connector-to-panel');

    const delivered = session.segment('panel').received;
    expect(delivered).toHaveLength(2);
    const forged = delivered
      .map(frame => JSON.parse(frame) as Record<string, unknown>)
      .find(message => message['type'] === 'HANDSHAKE_ACK');
    expect(forged).toMatchObject({
      source: RXDB_DEVTOOLS_MESSAGE,
      type: 'HANDSHAKE_ACK',
      direction: 'devtools-to-page'
    });
  });

  it('MUST NOT forge anything when the relay is a plain forwarder', async () => {
    const session = await open({ relayAcksLegacyHandshake: false });
    const handshake = JSON.stringify(
      createDevToolsV2Message(
        'HANDSHAKE',
        { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
        { sessionId: SESSION_ID, timestamp: 1_700_000_000_000, sequence: 1 }
      )
    );
    await session.segment('connector').inject(handshake, 'connector-to-panel');

    expect(session.segment('panel').received).toHaveLength(1);
  });

  it('MUST forward frames it cannot parse', async () => {
    // 中继是纯 transport：解析是端点的事。中间段替协议做判断，就等于把拒绝语义分裂到四处。
    const session = await open();
    await session.segment('panel').inject('{"type":', 'panel-to-connector');
    expect(session.segment('connector').received).toEqual(['{"type":']);
  });

  it('MUST wire endpoint factories on both ends', async () => {
    const seenByPanel: string[] = [];
    const driver = createJsonConformanceDriver(() => ({
      panel: send => {
        send(pingFrame());
        return frame => seenByPanel.push(frame);
      },
      connector: send => frame => {
        if (frame === pingFrame()) send(pongFrame());
      }
    }));

    const session = await driver.open(createScenario());
    await session.settle();

    expect(seenByPanel).toEqual([pongFrame()]);
    await session.dispose();
  });

  it('MUST throw rather than report zeroed counters when no provider is wired', async () => {
    // 返回全 0 会让 AC#9 / #16 / #24 的「调用次数为 0」恒真——那正是这些 AC 要证伪的东西。
    const session = await open();
    expect(() => session.provider).toThrow(/no provider probe/);
  });

  it('MUST expose the wired provider probe', async () => {
    const probe = {
      operationCalls: new Map<string, number>([['files.list', 0]]),
      hostReads: 0,
      eventSubscriptions: 0,
      bufferedEvents: 0,
      peakRetainedBytes: 0,
      temporaryArtifacts: () => Promise.resolve([]),
      committedTransfers: () => Promise.resolve([])
    };
    const session = await createJsonConformanceDriver(() => ({ provider: probe })).open(createScenario());

    expect(session.provider.operationCalls.get('files.list')).toBe(0);
    await expect(session.provider.temporaryArtifacts()).resolves.toEqual([]);
  });

  it('MUST reject an unknown segment', async () => {
    const session = await open();
    // @ts-expect-error 段标识是闭集；这里刻意越界，验证 fake 不会静默造出一段。
    expect(() => session.segment('worker')).toThrow(/unknown segment/);
  });
});
