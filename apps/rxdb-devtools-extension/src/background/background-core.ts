import {
  isDevToolsMessage,
  isRelayFrameTowards,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type DevToolsRelayFrame,
  type InitMessage
} from '@modules/rxdb-devtools-panel/wire';

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
  sendToTab: (tabId: number, message: DevToolsRelayFrame) => Promise<unknown>;
  onError?: (message: string, error: unknown) => void;
}

/**
 * background **唯一**能自己造出来的消息：注入完成后的存活探针。
 *
 * @remarks
 * AC#36：这里刻意不收类型参数。background 是纯中继，握手语义（尤其是 `HANDSHAKE_ACK`）
 * 归面板独有；把可造类型钉死成 `PING`，代发 ACK 就不再是「少写一行」能退回去的事。
 */
function pingMessage(): DevToolsMessage {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'devtools-to-page',
    type: 'PING',
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
 * 现在 INIT 已经是协议的一部分（见 `@modules/rxdb-devtools-panel/wire` 的 `ExtensionOnlyMessageType`），
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
  const sendPing = (tabId: number) => {
    void dependencies.sendToTab(tabId, pingMessage()).catch(error => dependencies.onError?.('PING', error));
  };
  const activateTab = (tabId: number) => {
    if (activations.has(tabId)) return;
    const activation = dependencies.injectIntoTab(tabId);
    activations.set(tabId, activation);
    void activation
      .then(() => {
        if (activations.get(tabId) === activation && ports.has(tabId)) sendPing(tabId);
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
        // INIT 是扩展内部消息（面板 → background，永不下页面），所以它先于中继判定处理：
        // 它是唯一一条 background 自己消费而不转发的帧。
        if (isDevToolsMessage(message) && isInitMessage(message)) {
          connectedTabId = message.tabId;
          ports.set(message.tabId, port);
          activateTab(message.tabId);
          return;
        }
        // C2/AC#36：其余帧按**宽外层**判定转发，两代协议同一条链路。
        // 方向必须是 `to-page`：面板 port 上出现一条上行帧只可能是伪造或串线，
        // 转发它等于让页面能给自己回消息。
        if (!isRelayFrameTowards(message, 'to-page')) return;
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

    /**
     * 把 content script 收到的页面消息转给对应 tab 的面板。
     *
     * @remarks
     * AC#36：`HANDSHAKE` 在这里**没有特例分支**，两代协议都没有。它本就是上行帧，
     * 走下面同一条转发即可；原先那条特例会在转发的同时代发 `HANDSHAKE_ACK`，
     * 等于替面板做了协议版本决定 —— 而中继伪造的 ACK 在格式上完全合法，
     * 只有「ACK 归面板独有」这条所有权规则能挡住它。
     */
    receiveContent(message: unknown, tabId: number | undefined): void {
      if (tabId === undefined || !isRelayFrameTowards(message, 'to-panel')) return;
      ports.get(tabId)?.postMessage(message);
    }
  };
}
