import { createDevToolsV2Message } from '@aiao/rxdb-devtools';
import { RXDB_DEVTOOLS_MESSAGE } from '@modules/rxdb-devtools-panel/wire';
import { describe, expect, it, vi } from 'vitest';
import { createBackgroundController, type BackgroundPort } from './background-core';

/** 协商完成后每一帧都必须归属的规范 UUID v4。 */
const SESSION_ID = '4b1d0f3a-2c6e-4a58-9f31-8d7c5e2b0a94';

/**
 * 构造一条**能通过严校验**的消息。
 *
 * P0-1 之后 payload 形状会被检查，所以 `EVENT` 不能再用 `payload: null` ——
 * 原来的 helper 之所以能用，正是因为当时的校验不看 payload。
 */
function devtoolsMessage(type = 'EVENT', direction: 'page-to-devtools' | 'devtools-to-page' = 'page-to-devtools') {
  const payload =
    type === 'EVENT' ? { id: 'e1', eventType: 'insert', timestamp: 1, sequence: 1, data: {} }
    : type === 'DB_INFO' ? {}
    : null;
  return { source: RXDB_DEVTOOLS_MESSAGE, direction, type, payload, timestamp: 1, sequence: 1 };
}

/**
 * 构造一条完整协议形态的 INIT。
 *
 * P1-4 之后 INIT 不再是裸对象 `{ type: 'INIT', tabId }`，它是协议的一部分。
 */
function initMessage(tabId: number) {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'devtools-to-page' as const,
    type: 'INIT',
    payload: null,
    timestamp: 1,
    sequence: 0,
    tabId
  };
}

/** 构造一条下行的 v2 `REQUEST`（面板 → connector）。 */
function v2Request(requestId = 'r1') {
  return createDevToolsV2Message(
    'REQUEST',
    { requestId, domain: 'database', operation: 'query', params: {} },
    { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
  );
}

/** 构造一条上行的 v2 `RESPONSE`（connector → 面板）。 */
function v2Response(requestId = 'r1') {
  return createDevToolsV2Message(
    'RESPONSE',
    { requestId, result: null },
    { sessionId: SESSION_ID, sequence: 2, timestamp: 2 }
  );
}

function createPort(name = 'rxdb-devtools-panel') {
  let onMessage: (message: unknown) => void = () => undefined;
  let onDisconnect: () => void = () => undefined;
  const port = {
    name,
    postMessage: vi.fn(),
    onMessage: { addListener: vi.fn(listener => (onMessage = listener)) },
    onDisconnect: { addListener: vi.fn(listener => (onDisconnect = listener)) }
  } as unknown as BackgroundPort;
  return {
    port,
    // port 被强转成 BackgroundPort 后 postMessage 丢了 Mock 类型，单独暴露原始 mock 供断言
    postMessage: port.postMessage as unknown as ReturnType<typeof vi.fn>,
    emitMessage: (value: unknown) => onMessage(value),
    disconnect: () => onDisconnect()
  };
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('createBackgroundController', () => {
  it('connects a panel, sends PING, and forwards panel messages to its tab', async () => {
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab
    });
    const panel = createPort();
    controller.connect(panel.port);
    panel.emitMessage(initMessage(7));
    panel.emitMessage(devtoolsMessage('INSPECT_DB', 'devtools-to-page'));
    await Promise.resolve();
    await Promise.resolve();
    expect(sendToTab).toHaveBeenNthCalledWith(1, 7, expect.objectContaining({ type: 'PING' }));
    expect(sendToTab).toHaveBeenNthCalledWith(2, 7, expect.objectContaining({ type: 'INSPECT_DB' }));
  });

  it('ignores unrelated ports', () => {
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab
    });
    const panel = createPort('other');
    controller.connect(panel.port);
    expect(panel.port.onMessage.addListener).not.toHaveBeenCalled();
    expect(sendToTab).not.toHaveBeenCalled();
  });

  it('forwards a page handshake without ever minting an ACK of its own', () => {
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab
    });
    const panel = createPort();
    controller.connect(panel.port);
    panel.emitMessage(initMessage(7));
    const handshake = devtoolsMessage('HANDSHAKE');
    controller.receiveContent(handshake, 7);

    // AC#36：ACK 的唯一所有者是面板。background 代发 ACK 会让页面在面板还没决定协议版本时
    // 就认为握手已完成 —— 这正是阶段 B 判定的「伪造 ACK」，v2 协商窗口据此失效。
    expect(sendToTab).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'HANDSHAKE_ACK' }));
    expect(panel.port.postMessage).toHaveBeenCalledWith(handshake);
  });

  it('forwards only page-to-devtools content messages', () => {
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab: vi.fn(async () => undefined)
    });
    const panel = createPort();
    controller.connect(panel.port);
    panel.emitMessage(initMessage(7));
    panel.postMessage.mockClear();
    controller.receiveContent(devtoolsMessage(), 7);
    controller.receiveContent(devtoolsMessage('PING', 'devtools-to-page'), 7);
    controller.receiveContent({ type: 'EVENT' }, 7);
    expect(panel.port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('drops the panel mapping after disconnect', () => {
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab: vi.fn(async () => undefined)
    });
    const panel = createPort();
    controller.connect(panel.port);
    panel.emitMessage(initMessage(7));
    panel.disconnect();
    controller.receiveContent(devtoolsMessage(), 7);
    expect(panel.port.postMessage).not.toHaveBeenCalled();
  });

  it('keeps the newest panel when an older panel for the same tab disconnects', async () => {
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => undefined),
      sendToTab: vi.fn(async () => undefined)
    });
    const first = createPort();
    const second = createPort();
    controller.connect(first.port);
    controller.connect(second.port);
    first.emitMessage(initMessage(7));
    second.emitMessage(initMessage(7));
    await Promise.resolve();
    await Promise.resolve();
    first.postMessage.mockClear();
    second.postMessage.mockClear();

    first.disconnect();
    const event = devtoolsMessage();
    controller.receiveContent(event, 7);

    expect(first.port.postMessage).not.toHaveBeenCalled();
    expect(second.port.postMessage).toHaveBeenCalledWith(event);
  });

  it('does not ping after the panel disconnects during script injection', async () => {
    const injection = createDeferred();
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(() => injection.promise),
      sendToTab
    });
    const panel = createPort();
    controller.connect(panel.port);

    panel.emitMessage(initMessage(7));
    panel.disconnect();
    injection.resolve();
    await injection.promise;
    await Promise.resolve();

    expect(sendToTab).not.toHaveBeenCalled();
  });

  it('deduplicates a pending activation for the same tab', async () => {
    const injection = createDeferred();
    const injectIntoTab = vi.fn(() => injection.promise);
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({ injectIntoTab, sendToTab });
    const first = createPort();
    const second = createPort();
    controller.connect(first.port);
    controller.connect(second.port);

    first.emitMessage(initMessage(7));
    second.emitMessage(initMessage(7));

    expect(injectIntoTab).toHaveBeenCalledOnce();

    injection.resolve();
    await injection.promise;
    await Promise.resolve();

    expect(sendToTab).toHaveBeenCalledOnce();
    expect(sendToTab).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'PING' }));
  });

  it('reports injection failures without sending a ping', async () => {
    const onError = vi.fn();
    const sendToTab = vi.fn(async () => undefined);
    const controller = createBackgroundController({
      injectIntoTab: vi.fn(async () => {
        throw new Error('restricted page');
      }),
      onError,
      sendToTab
    });
    const panel = createPort();
    controller.connect(panel.port);
    panel.emitMessage(initMessage(7));
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith('INJECT', expect.any(Error));
    expect(sendToTab).not.toHaveBeenCalled();
  });
});

/**
 * US-904 阶段 C2 / AC#36：四段 relay 必须**两代协议都能承载**。
 *
 * 修复前 background 的两个转发点都直接读 v1 的方向标签，而 `isDevToolsMessage`
 * 对每一个 v2 类型都返回 false —— 也就是说阶段 B 冻结的协商、授权与传输状态机
 * 在 Chrome 上一帧都过不去，且是静默丢弃，两端都看不出发生了什么。
 */
describe('createBackgroundController —— v2 帧穿透（C2/AC#36）', () => {
  const connected = async () => {
    const sendToTab = vi.fn(async () => undefined);
    const instance = createBackgroundController({ injectIntoTab: vi.fn(async () => undefined), sendToTab });
    const panel = createPort();
    instance.connect(panel.port);
    panel.emitMessage(initMessage(7));
    await Promise.resolve();
    await Promise.resolve();
    sendToTab.mockClear();
    panel.postMessage.mockClear();
    return { instance, panel, sendToTab };
  };

  it('把面板发出的 v2 下行帧转给页面', async () => {
    const { panel, sendToTab } = await connected();
    const request = v2Request();

    panel.emitMessage(request);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToTab).toHaveBeenCalledWith(7, request);
  });

  it('把页面发出的 v2 上行帧转给面板', async () => {
    const { instance, panel } = await connected();
    const response = v2Response();

    instance.receiveContent(response, 7);

    expect(panel.port.postMessage).toHaveBeenCalledWith(response);
  });

  it('转发 v2 握手，且绝不自造 HANDSHAKE_ACK', async () => {
    const { instance, panel, sendToTab } = await connected();
    const handshake = createDevToolsV2Message(
      'HANDSHAKE',
      { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
    );

    instance.receiveContent(handshake, 7);

    // ACK 的唯一所有者是面板。中继一旦替页面认下协议版本，v2 协商窗口就形同虚设 ——
    // 而一条中继伪造的 ACK 在格式上完全合法，只能靠「所有权」这条规则挡住。
    expect(panel.port.postMessage).toHaveBeenCalledWith(handshake);
    expect(sendToTab).not.toHaveBeenCalled();
  });

  /**
   * US-904 AC#51：面板 port 一死，页面必须收到讣告，否则 connector 手上的 session 永远不关。
   *
   * 判据取**三件事同时成立**，少一件都能被一个错误实现蒙混过去：
   * 帧是 v2 `DISCONNECT`、带的是这个 tab 真实协商出的 session、方向是 `panel-to-connector`
   * （写成 `connector-to-panel` 的话中继自己那道方向闸会把它挡回来，页面永远收不到）。
   */
  it('面板 port 断开时，用该 tab 真实的 session 发一条 DISCONNECT 给页面', async () => {
    const { instance, panel, sendToTab } = await connected();
    const handshake = createDevToolsV2Message(
      'HANDSHAKE',
      { protocolVersion: 2, sessionId: SESSION_ID, capabilities: { capability: 'readonly', descriptors: [] } },
      { sessionId: SESSION_ID, sequence: 1, timestamp: 1 }
    );
    instance.receiveContent(handshake, 7);
    sendToTab.mockClear();

    panel.disconnect();
    await Promise.resolve();

    expect(sendToTab).toHaveBeenCalledTimes(1);
    expect(sendToTab).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: 'DISCONNECT', sessionId: SESSION_ID, direction: 'panel-to-connector' })
    );
  });

  /**
   * 从没协商成功过 v2 的 tab 上，断开**不该**发任何东西。
   *
   * 没有这一条，一个「断开就无脑发一帧」的实现同样能让上面那条绿——而它会往每个只跑 v1 的
   * 页面投一条带着编造 session 的帧，connector 只能回 `session_invalid`，白白多一轮噪声。
   */
  it('没协商过 v2 的 tab 断开时不发讣告', async () => {
    const { panel, sendToTab } = await connected();

    panel.disconnect();
    await Promise.resolve();

    expect(sendToTab).not.toHaveBeenCalled();
  });

  it('丢弃方向与链路相反的帧', async () => {
    const { instance, panel, sendToTab } = await connected();

    // 上行帧出现在面板 port 上：面板永远不产生上行帧，这只可能是伪造或串线。
    panel.emitMessage(v2Response());
    // 下行帧出现在 content 通道上：同理。
    instance.receiveContent(v2Request(), 7);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToTab).not.toHaveBeenCalled();
    expect(panel.port.postMessage).not.toHaveBeenCalled();
  });

  it('丢弃信封不成立的伪 v2 帧', async () => {
    const { instance, panel, sendToTab } = await connected();
    const base = v2Request() as unknown as Record<string, unknown>;

    panel.emitMessage({ ...base, extra: 1 });
    panel.emitMessage({ ...base, protocol: 1 });
    instance.receiveContent({ ...v2Response(), source: 'other' }, 7);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToTab).not.toHaveBeenCalled();
    expect(panel.port.postMessage).not.toHaveBeenCalled();
  });

  it('v2 帧同样只走 INIT 绑定的 tab', async () => {
    const { panel, sendToTab } = await connected();

    panel.emitMessage({ ...v2Request(), tabId: 99 });
    await Promise.resolve();
    await Promise.resolve();

    // 夹带 `tabId` 会让信封的 exact-key 校验失败 —— v2 帧根本没有自称 tab 的字段可用。
    expect(sendToTab).not.toHaveBeenCalled();
  });
});

describe('createBackgroundController —— 协议正规化（P1-4）', () => {
  const controller = () => {
    const sendToTab = vi.fn(async () => undefined);
    const injectIntoTab = vi.fn(async () => undefined);
    return {
      sendToTab,
      injectIntoTab,
      instance: createBackgroundController({ injectIntoTab, sendToTab })
    };
  };

  /**
   * P1-4：`INIT` 原先是一个绕过协议的裸对象 `{ type: 'INIT', tabId }` ——
   * 没有 source / direction / timestamp / sequence，`'INIT'` 也不在类型白名单里。
   * 任何页面脚本只要凑出这两个字段，就能让 background 把某个 tab 的 port 指向自己。
   */
  it('拒绝不符合协议的裸 INIT', async () => {
    const { instance, injectIntoTab } = controller();
    const panel = createPort();
    instance.connect(panel.port);

    // 刻意保留裸对象形态：这正是修复前的样子
    panel.emitMessage({ type: 'INIT', tabId: 7 });
    await Promise.resolve();

    expect(injectIntoTab).not.toHaveBeenCalled();
  });

  it('接受完整协议形态的 INIT 并建立连接', async () => {
    const { instance, injectIntoTab, sendToTab } = controller();
    const panel = createPort();
    instance.connect(panel.port);

    panel.emitMessage(initMessage(7));
    await Promise.resolve();
    await Promise.resolve();

    expect(injectIntoTab).toHaveBeenCalledWith(7);
    expect(sendToTab).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'PING' }));
  });

  /**
   * P1-4 的另一半：`const tabId = message.tabId ?? connectedTabId` 让**每一条消息**
   * 都能重定向 tabId。原守卫只挡「转发到别人的 tab」，不挡「用别人的 tabId
   * 让自己的消息被静默丢弃」—— 一个面板可以把另一个面板的通道打哑。
   *
   * 一个 panel port 在 INIT 时就已经绑定了唯一的 inspected tab，
   * 之后每条消息自称的 tabId **不该参与路由**。
   */
  it('路由只认 INIT 绑定的 tab，忽略消息自称的 tabId', async () => {
    const { instance, sendToTab } = controller();
    const panel = createPort();
    instance.connect(panel.port);
    panel.emitMessage(initMessage(7));
    await Promise.resolve();
    await Promise.resolve();
    sendToTab.mockClear();

    // 这条消息自称属于 tab 99；它必须仍然被送到 7，而不是被丢弃
    panel.emitMessage({ ...devtoolsMessage('INSPECT_DB', 'devtools-to-page'), tabId: 99 });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToTab).toHaveBeenCalledTimes(1);
    expect(sendToTab).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'INSPECT_DB' }));
  });

  it('未 INIT 就发消息一律丢弃', async () => {
    const { instance, sendToTab } = controller();
    const panel = createPort();
    instance.connect(panel.port);

    panel.emitMessage({ ...devtoolsMessage('INSPECT_DB', 'devtools-to-page'), tabId: 7 });
    await Promise.resolve();

    expect(sendToTab).not.toHaveBeenCalled();
  });
});
