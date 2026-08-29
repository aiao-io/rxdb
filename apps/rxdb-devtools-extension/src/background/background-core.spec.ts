import { describe, expect, it, vi } from 'vitest';
import { RXDB_DEVTOOLS_MESSAGE } from '@modules/rxdb-devtools-panel/wire';
import { createBackgroundController, type BackgroundPort } from './background-core';

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

  it('acknowledges a page handshake and forwards it to the connected panel', () => {
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
    expect(sendToTab).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'HANDSHAKE_ACK' }));
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
