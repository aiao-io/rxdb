import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevToolsConnector } from '../connector.js';
import { createMessage, RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import { DEVTOOLS_PROTOCOL_VERSION_V2 } from '../v2/constants.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../v2/wire.js';
import type { DevToolsV2Envelope, DevToolsV2MessageType } from '../v2/wire.js';
import { createMockRxDB } from './fixtures/mock-rxdb.js';

const TIMESTAMP = 1_700_000_000_000;

describe('DevToolsConnector v2 negotiation', () => {
  let connector: DevToolsConnector;
  let posted: unknown[];
  let handler: (event: MessageEvent) => void;

  /** 把一帧原始值当作页面消息投给 connector 的 `window` 监听器。 */
  function deliver(data: unknown): void {
    handler(pageEvent(data));
  }

  /** 取出已发出的某一类型 v2 帧；按判别字段收窄到具体 payload。 */
  function framesOf<TType extends DevToolsV2MessageType>(type: TType): readonly DevToolsV2Envelope<TType>[] {
    const matches: DevToolsV2Envelope<TType>[] = [];
    for (const value of posted) {
      // 运行时判据与断言一致：TS 不会因与泛型值比较而收窄联合，只能在此断言。
      if (isDevToolsV2Message(value) && value.type === type) matches.push(value as DevToolsV2Envelope<TType>);
    }
    return matches;
  }

  /** 本端点铸造的 session 身份；取自它自己发出的 HANDSHAKE 要约。 */
  function sessionId(): string {
    const offered = framesOf('HANDSHAKE')[0]?.payload.sessionId;
    if (typeof offered !== 'string') throw new Error('connector never offered a v2 session');
    return offered;
  }

  /** 走完 HELLO → HANDSHAKE → ACK，让数据面真正打开。 */
  function connect(): void {
    deliver(
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] },
        { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );
    deliver(
      createDevToolsV2Message(
        'HANDSHAKE_ACK',
        { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: sessionId() },
        { sessionId: sessionId(), sequence: 2, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );
  }

  /** 已发出的、关联到某个 requestId 的错误载荷。 */
  function errorsFor(requestId: string | null): readonly unknown[] {
    return framesOf('ERROR')
      .filter(frame => frame.payload.requestId === requestId)
      .map(frame => frame.payload.error);
  }

  function init(capability: 'none' | 'readonly' | 'full' = 'readonly'): void {
    connector = new DevToolsConnector({ capabilities: capability });
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    connector.init(createMockRxDB());
    const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
    if (registered === undefined) throw new Error('connector never registered a message listener');
    handler = registered[1] as (event: MessageEvent) => void;
  }

  beforeEach(() => {
    posted = [];
    vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown) => {
      posted.push(message);
    }) as unknown as typeof window.postMessage);
  });

  afterEach(() => {
    connector.disconnect();
    vi.restoreAllMocks();
  });

  it('MUST keep the legacy HANDSHAKE as the very first outbound message', () => {
    init();

    // 只支持 v1 的面板碰到未知 `type` 会直接丢弃，而它需要这条握手才知道页面上有 connector。
    // 把任何 v2 帧插到它前面都会让既有面板看不见本页。
    expect(posted[0]).toMatchObject({ source: RXDB_DEVTOOLS_MESSAGE, type: 'HANDSHAKE' });
    expect(isDevToolsV2Message(posted[0])).toBe(false);
    expect(framesOf('HANDSHAKE')).toHaveLength(0);
  });

  it('MUST answer PROTOCOL_HELLO with a v2 HANDSHAKE carrying a session identity', () => {
    init();
    // `isDevToolsMessage` 是对已知 v1 `type` 的闭集判断，`PROTOCOL_HELLO` 会被它判否。
    // 入站过滤不分流的话这一帧会被静默丢弃，v2 协商永远起不来——这条用例守的就是那处分流。
    deliver(
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] },
        { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );

    const offers = framesOf('HANDSHAKE');
    expect(offers).toHaveLength(1);
    expect(offers[0]?.payload).toMatchObject({
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
      capabilities: { capability: 'readonly', descriptors: [] }
    });
    // 页内还没有接上任何 v2 provider：声明服务不了的 operation 会让面板据此点亮按钮。
    expect(offers[0]?.payload.capabilities.descriptors).toEqual([]);
  });

  it('MUST leave v1 command handling untouched', () => {
    init();
    deliver(createMessage('PING', 'devtools-to-page', null, 1));

    // v1 优先：PING 仍走 v1 路径回一条 legacy HANDSHAKE，不产生任何 v2 帧。
    const legacy = posted.filter(value => isRecordOfType(value, 'HANDSHAKE') && !isDevToolsV2Message(value));
    expect(legacy).toHaveLength(2);
    expect(framesOf('HANDSHAKE')).toHaveLength(0);
  });

  it('MUST ignore frames from a foreign source or origin before they reach negotiation', () => {
    init();
    const hello = createDevToolsV2Message(
      'PROTOCOL_HELLO',
      { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2] },
      { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
    );

    handler(pageEvent(hello, { source: {} }));
    handler(pageEvent(hello, { origin: 'https://evil.example' }));

    expect(framesOf('HANDSHAKE')).toHaveLength(0);
  });

  it('MUST mint a fresh session on re-init after disconnect', () => {
    init();
    const hello = (sequence: number): unknown =>
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2] },
        { sessionId: null, sequence, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      );

    deliver(hello(1));
    const first = framesOf('HANDSHAKE')[0]?.payload.sessionId;

    connector.disconnect();
    connector.init(createMockRxDB());
    deliver(hello(2));
    const offers = framesOf('HANDSHAKE');

    // 一个协商机只服务一次 transport connection；复用旧 session 会让重连后的迟到帧
    // 被当成本次会话的合法帧。
    expect(offers).toHaveLength(2);
    expect(offers[1]?.payload.sessionId).not.toBe(first);
  });

  it('MUST answer a data-plane frame with a structured error once the session is open', () => {
    init();
    connect();

    deliver(
      createDevToolsV2Message(
        'REQUEST',
        { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} },
        { sessionId: sessionId(), sequence: 3, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );

    // 协商机自己不认识数据面帧。只接协商机、不接端点，REQUEST 就会掉在地上：面板等到
    // 15 秒请求时限才知道「没人答」，而 wire 上分不清这是超时还是这条能力根本不存在。
    expect(errorsFor('r1')).toEqual([{ code: 'provider_unsupported', retryable: false }]);
  });

  it('MUST refuse a data-plane frame carrying a foreign session id', () => {
    init();
    connect();

    deliver(
      createDevToolsV2Message(
        'REQUEST',
        { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} },
        {
          sessionId: 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4',
          sequence: 3,
          timestamp: TIMESTAMP,
          direction: 'panel-to-connector'
        }
      )
    );

    // 归属不符是**已识别**的错帧，答的是 session_invalid 而不是这条请求的业务结论。
    expect(errorsFor(null)).toContainEqual({ code: 'session_invalid', retryable: false });
    expect(errorsFor('r1')).toEqual([]);
  });

  it('MUST report the absent database provider as soon as the session opens', () => {
    init();
    connect();

    // 页内还没接上任何 v2 provider，事件流因此建立不起来。把这个结论咽下去，面板会一直
    // 等一条永远不会来的 EVENT；`requestId: null` 是它诚实的关联键——订阅不是任何一条
    // REQUEST 的结果。descriptor 填上真实 provider 后这一帧自然消失。
    expect(errorsFor(null)).toEqual([{ code: 'provider_unsupported', retryable: false }]);
  });

  it('MUST NOT answer a v2 hello at all once negotiation is disposed', () => {
    init();
    connector.disconnect();
    deliver(
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2] },
        { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );

    expect(framesOf('HANDSHAKE')).toHaveLength(0);
  });
});

/**
 * 造一个只带 connector 会读的三个字段的页面消息事件。
 *
 * @remarks
 * `MessageEvent` 的其余字段 connector 一概不读，逐一填充只会让用例误导性地更像真实事件。
 */
function pageEvent(data: unknown, overrides: { source?: unknown; origin?: string } = {}): MessageEvent {
  const source = 'source' in overrides ? overrides.source : window;
  return { source, origin: overrides.origin ?? location.origin, data } as unknown as MessageEvent;
}

/** v1 帧的类型判断；只看 `type`，不涉及 v2 信封。 */
function isRecordOfType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type;
}
