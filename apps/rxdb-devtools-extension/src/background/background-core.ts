import {
  isDevToolsMessage,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type InitMessage
} from '@aiao/rxdb-devtools-panel/wire';

interface Listener<T> {
  addListener(listener: T): void;
}

/** background 控制器所需的最小 Chrome runtime port 契约。 */
export interface BackgroundPort {
  name: string;
  postMessage(message: unknown): void;
  onMessage: Listener<(message: unknown) => void>;
  onDisconnect: Listener<() => void>;
}

interface BackgroundDependencies {
  injectIntoTab: (tabId: number) => Promise<void>;
  sendToTab: (tabId: number, message: DevToolsMessage) => Promise<unknown>;
  onError?: (message: string, error: unknown) => void;
}

function controlMessage(type: 'HANDSHAKE_ACK' | 'PING' | 'DISCONNECT'): DevToolsMessage {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: type === 'DISCONNECT' ? 'page-to-devtools' : 'devtools-to-page',
    type,
    payload: null,
    timestamp: Date.now(),
    sequence: 0
  };
}

/**
 * 判断一条**已通过严校验**的消息是不是 INIT 握手。
 *
 * @remarks
 * P1-4：原实现是一个独立的 `isInitMessage`，只认 `{ type: 'INIT', tabId }` ——
 * 没有 source / direction / timestamp / sequence，而 `'INIT'` 当时也不在类型白名单里。
 * 也就是说它是一条**绕过整个协议的侧信道**：任何能往这个 port 投递对象的上下文，
 * 只要凑出两个字段就能让 background 把某个 tab 的 port 指向自己。
 *
 * 现在 INIT 已经是协议的一部分（见 `@aiao/rxdb-devtools-panel/wire` 的 `ExtensionOnlyMessageType`），
 * 所以先过 `isDevToolsMessage` 严校验，再判断类型即可。
 */
function isInitMessage(message: DevToolsMessage): message is InitMessage {
  return message.type === 'INIT' && typeof message.tabId === 'number';
}

/**
 * 创建按 inspected tab 隔离端口和注入任务的 background 消息控制器。
 *
 * @param dependencies - 页面注入、消息投递和错误上报能力
 */
export function createBackgroundController(dependencies: BackgroundDependencies) {
  const ports = new Map<number, BackgroundPort>();
  const activations = new Map<number, Promise<void>>();
  const sendControl = (tabId: number, type: 'HANDSHAKE_ACK' | 'PING') => {
    void dependencies.sendToTab(tabId, controlMessage(type)).catch(error => dependencies.onError?.(type, error));
  };
  const activateTab = (tabId: number) => {
    if (activations.has(tabId)) return;
    const activation = dependencies.injectIntoTab(tabId);
    activations.set(tabId, activation);
    void activation
      .then(() => {
        if (activations.get(tabId) === activation && ports.has(tabId)) sendControl(tabId, 'PING');
      })
      .catch(error => dependencies.onError?.('INJECT', error))
      .finally(() => {
        if (activations.get(tabId) === activation) activations.delete(tabId);
      });
  };

  return {
    connect(port: BackgroundPort): void {
      if (port.name !== 'rxdb-devtools-panel') return;
      let connectedTabId: number | null = null;
      port.onMessage.addListener(message => {
        // P1-4：**先严校验，再分派** —— INIT 不再有绕过协议的入口。
        if (!isDevToolsMessage(message)) return;
        if (isInitMessage(message)) {
          connectedTabId = message.tabId;
          ports.set(message.tabId, port);
          activateTab(message.tabId);
          return;
        }
        // P1-4：路由**只认 INIT 绑定的 tab**。
        // 原实现是 `message.tabId ?? connectedTabId`，等于让每条消息自称属于哪个 tab；
        // 下面那道 `ports.get(tabId) !== port` 守卫只挡住「转发到别人的 tab」，
        // 挡不住「用别人的 tabId 让自己的消息被静默丢弃」—— 一个面板可以把另一个打哑。
        // 一个 panel port 在 INIT 时就绑定了唯一的 inspected tab，之后自称的 tabId 不参与路由。
        const tabId = connectedTabId;
        if (tabId === null) return;
        const forward = () => {
          if (ports.get(tabId) !== port) return;
          void dependencies.sendToTab(tabId, message).catch(error => dependencies.onError?.(message.type, error));
        };
        const activation = activations.get(tabId);
        if (activation) {
          void activation.then(forward).catch(error => dependencies.onError?.(message.type, error));
          return;
        }
        forward();
      });
      port.onDisconnect.addListener(() => {
        if (connectedTabId !== null && ports.get(connectedTabId) === port) ports.delete(connectedTabId);
      });
    },

    receiveContent(message: unknown, tabId: number | undefined): void {
      if (!isDevToolsMessage(message) || tabId === undefined) return;
      const port = ports.get(tabId);
      if (message.type === 'HANDSHAKE') {
        sendControl(tabId, 'HANDSHAKE_ACK');
        port?.postMessage(message);
        return;
      }
      if (message.direction === 'page-to-devtools') port?.postMessage(message);
    }
  };
}
