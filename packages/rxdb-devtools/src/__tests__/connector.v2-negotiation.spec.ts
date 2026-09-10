import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevToolsConnector } from '../connector.js';
import { createDevToolsDesktopSettingsProvider } from '../native/settings-provider.js';
import { createMessage, RXDB_DEVTOOLS_MESSAGE } from '../types.js';
import { DEVTOOLS_PROTOCOL_VERSION_V2 } from '../v2/constants.js';
import type { DevToolsV2Envelope, DevToolsV2MessageType } from '../v2/wire.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../v2/wire.js';
import type { FakeOpfsRoot } from './browser/fake-opfs.js';
import { createFakeOpfsRoot } from './browser/fake-opfs.js';
import { createMockRxDB, listenerCount, type MockRxDB } from './fixtures/mock-rxdb.js';
import { createFakeNativeFilesystem } from './native/fake-native-filesystem.js';

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

  /**
   * 等到 `predicate` 成立，或耗尽宏任务预算。
   *
   * @remarks
   * 只让出一次宏任务不足以断言 `MessagePort` 的投递：端口消息由宿主自己排队，让出一次
   * 只保证「当前任务结束了」，不保证那条消息已经被派发。整包并发跑时这点差别会变成偶发失败，
   * 单文件跑却一直是绿的——所以这里等的是**事实**，不是一个猜出来的时长。
   */
  async function until(predicate: () => boolean, attempts = 50): Promise<void> {
    for (let index = 0; index < attempts; index += 1) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
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
      capabilities: { capability: 'readonly' }
    });
    // 只宣告本页**真的**实现了的领域。`database` 的 v2 操作还没实现，所以不出现在这里——
    // 声明服务不了的 operation 会让面板据此点亮按钮。测试环境没有 OPFS，`files` 同理缺席。
    expect(offers[0]?.payload.capabilities.descriptors).toEqual([
      {
        domain: 'settings',
        version: 1,
        kind: 'opfs',
        operations: ['export'],
        runtime: 'browser',
        limits: { maxTransferBytes: 0 }
      }
    ]);
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

  it('MUST treat an open v2 session as connected for the v1 event stream', async () => {
    // v1 的 `connected` 原先只认 legacy `HANDSHAKE_ACK`。可两端都会说 v2 时协商直接落到 v2，
    // 面板**永远不会**发那条 legacy ACK——事件于是无限期滞留在 buffer 里，Database / Events
    // 两页在真实 Chrome 上全空。这不是「v1 该退场了」，阶段 C2 只迁了 files：
    // 数据库能力仍靠 v1 消息承载（AC#42 要求用户可见行为不变）。
    let remotePort: MessagePort | null = null;
    vi.spyOn(window, 'postMessage').mockImplementation(((
      message: unknown,
      _targetOrigin?: string,
      transfer?: readonly Transferable[]
    ) => {
      posted.push(message);
      // 握手随附的 port2 是 v1 命令面的传输层：握过手之后 EVENT 走它而不是 window 总线
      // （见 connector 的 `#postMessage`），所以冲出去的事件只能在这一端观察到。
      // 按能力认而不是 `instanceof MessagePort`：测试环境里的端口来自另一个 realm，
      // 全局构造器与实例的原型链对不上，`instanceof` 会稳定判否。
      const handed = transfer?.[0] as MessagePort | undefined;
      if (typeof handed?.start === 'function') remotePort = handed;
    }) as unknown as typeof window.postMessage);

    connector = new DevToolsConnector({ capabilities: 'readonly' });
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    const rxdb = createMockRxDB();
    connector.init(rxdb);
    const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
    if (registered === undefined) throw new Error('connector never registered a message listener');
    handler = registered[1] as (event: MessageEvent) => void;

    const received: unknown[] = [];
    if (remotePort === null) throw new Error('connector never handed over a session port');
    (remotePort as MessagePort).onmessage = (event: MessageEvent) => void received.push(event.data);

    rxdb.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE', entityId: 'e1' });
    expect(received).toHaveLength(0);

    connect();
    await until(() => received.length > 0);

    expect(connector.connected).toBe(true);
    expect(received.filter(value => isRecordOfType(value, 'EVENT'))).toHaveLength(1);
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

    // 没给 `getEntityMetadata` 就不宣告 `database`（遮罩表会算成空集，密文列会原样出门），
    // 事件流因此建立不起来。把这个结论咽下去，面板会一直等一条永远不会来的 EVENT；
    // `requestId: null` 是它诚实的关联键——订阅不是任何一条 REQUEST 的结果。
    expect(errorsFor(null)).toEqual([{ code: 'provider_unsupported', retryable: false }]);
  });

  describe('database 领域（阶段 D AC#46）', () => {
    /** 带元数据的 init：`database` 三个入口齐全才宣告，见 `createConnectorProviders`。 */
    function initWithDatabase(): MockRxDB {
      connector = new DevToolsConnector({ capabilities: 'readonly' });
      const addEventSpy = vi.spyOn(window, 'addEventListener');
      const rxdb = createMockRxDB();
      // 夹具没有实体，读取函数因此恒为 undefined——`database` 的宣告取决于「有没有这个
      // 函数」，而不是它此刻返回什么。
      connector.init(rxdb, () => undefined);
      const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
      if (registered === undefined) throw new Error('connector never registered a message listener');
      handler = registered[1] as (event: MessageEvent) => void;
      return rxdb;
    }

    it('MUST declare the database domain and answer its requests', async () => {
      initWithDatabase();
      deliver(
        createDevToolsV2Message(
          'PROTOCOL_HELLO',
          { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] },
          { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
        )
      );
      const descriptors = framesOf('HANDSHAKE')[0]?.payload.capabilities.descriptors;
      // 测试环境没有 OPFS，`files` 照旧缺席；顺序仍按领域枚举，不按装配顺序。
      expect(descriptors?.map(descriptor => descriptor.domain)).toEqual(['database', 'settings']);

      deliver(
        createDevToolsV2Message(
          'HANDSHAKE_ACK',
          { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: sessionId() },
          { sessionId: sessionId(), sequence: 2, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
        )
      );
      deliver(
        createDevToolsV2Message(
          'REQUEST',
          { requestId: 'r1', domain: 'database', operation: 'inspect', params: {} },
          { sessionId: sessionId(), sequence: 3, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
        )
      );
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(framesOf('RESPONSE')[0]?.payload).toMatchObject({ requestId: 'r1' });
      // 订阅这一路也通了，不再有那条 `provider_unsupported`。
      expect(errorsFor(null)).toEqual([]);
    });

    it('MUST push RxDB events out as v2 EVENT frames', async () => {
      const rxdb = initWithDatabase();
      connect();
      await new Promise(resolve => setTimeout(resolve, 0));

      rxdb.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE', entityId: 'e1' });

      // 事件是**推**的：`database.events` 只建订阅，此后每条事件自己成帧。
      expect(framesOf('EVENT')[0]?.payload).toMatchObject({ eventType: 'ENTITY_LOCAL_CREATE' });
    });

    it('MUST stop pushing events after disconnect', async () => {
      const rxdb = initWithDatabase();
      connect();
      await new Promise(resolve => setTimeout(resolve, 0));
      connector.disconnect();

      rxdb.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE', entityId: 'e1' });

      // 拆了端点却留着 RxDB 监听，实例就再也回收不掉。
      expect(framesOf('EVENT')).toHaveLength(0);
      expect(listenerCount(rxdb)).toBe(0);
    });
  });

  describe('mutation policy', () => {
    let opfs: FakeOpfsRoot;

    /** 装一个可用的 OPFS，`files` 领域才会被宣告出来。 */
    function initWithOpfs(options: { mutationPolicy?: 'allow' | 'omit' } = {}): void {
      opfs = createFakeOpfsRoot();
      vi.stubGlobal('navigator', {
        ...globalThis.navigator,
        storage: { getDirectory: () => Promise.resolve(opfs.handle) }
      });
      connector = new DevToolsConnector({ capabilities: 'full', ...options });
      const addEventSpy = vi.spyOn(window, 'addEventListener');
      connector.init(createMockRxDB());
      const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
      if (registered === undefined) throw new Error('connector never registered a message listener');
      handler = registered[1] as (event: MessageEvent) => void;
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('MUST refuse a full-tier write while the owner has not opted in', async () => {
      // 默认拒绝：`capabilities: 'full'` 说的是「面板可以下达高权命令」，不等于
      // 「页面愿意被写盘」。两者合一会让接上 provider 这一步顺带打开写路径。
      //
      // 错误码是 `provider_unsupported` 而不是一个「被策略拒绝」的专用码：阶段 B 冻结的
      // 授权层有意让「owner 没开写」与「压根没这个领域」对外同形，否则对端可以靠错误码
      // 的差异反推页面开了哪些写能力（见 `v2/authorization.ts` 顶部说明）。
      initWithOpfs();
      connect();
      deliver(request('r1', 'create-directory', { path: 'made' }));
      await Promise.resolve();

      expect(errorsFor('r1')).toEqual([{ code: 'provider_unsupported', retryable: false }]);
      expect(opfs.exists('made')).toBe(false);
    });

    it('MUST let a full-tier write through once the owner opts in', async () => {
      initWithOpfs({ mutationPolicy: 'allow' });
      connect();
      deliver(request('r1', 'create-directory', { path: 'made' }));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(errorsFor('r1')).toEqual([]);
      expect(opfs.exists('made')).toBe(true);
    });

    function request(requestId: string, operation: string, params: unknown): unknown {
      return createDevToolsV2Message(
        'REQUEST',
        { requestId, domain: 'files', operation, params },
        { sessionId: sessionId(), sequence: 3, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      );
    }
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

  it('MUST wire native providers (files/settings/runtime) into the v2 descriptor set', () => {
    connector = new DevToolsConnector({
      capabilities: 'readonly',
      providers: {
        nativeFiles: { filesystem: createFakeNativeFilesystem(), maxTransferBytes: 64 },
        settings: createDevToolsDesktopSettingsProvider('electron'),
        runtime: 'electron'
      }
    });
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    // 传了读取函数（即便恒回 undefined），`database` 就会宣告——这里一并断言它的 runtime 换掉了。
    connector.init(createMockRxDB(), () => undefined);
    const registered = addEventSpy.mock.calls.find(call => call[0] === 'message');
    if (registered === undefined) throw new Error('connector never registered a message listener');
    handler = registered[1] as (event: MessageEvent) => void;

    deliver(
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: [DEVTOOLS_PROTOCOL_VERSION_V2, 1] },
        { sessionId: null, sequence: 1, timestamp: TIMESTAMP, direction: 'panel-to-connector' }
      )
    );

    const descriptors = framesOf('HANDSHAKE')[0]?.payload.capabilities.descriptors;
    expect(descriptors?.map(descriptor => descriptor.domain)).toEqual(['database', 'files', 'settings']);
    expect(descriptors?.find(descriptor => descriptor.domain === 'files')).toMatchObject({
      kind: 'native-files',
      runtime: 'electron'
    });
    expect(descriptors?.find(descriptor => descriptor.domain === 'settings')).toMatchObject({
      kind: 'sqlite',
      runtime: 'electron'
    });
    expect(descriptors?.find(descriptor => descriptor.domain === 'database')).toMatchObject({ runtime: 'electron' });
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
