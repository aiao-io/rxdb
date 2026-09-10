import { createDevToolsV2Message } from '@aiao/rxdb-devtools';
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
 * 注入完成后的存活探针。
 *
 * @remarks
 * AC#36：这里刻意不收类型参数。background 是纯中继，握手语义（尤其是 `HANDSHAKE_ACK`）
 * 归面板独有；把可造类型钉死成 `PING`，代发 ACK 就不再是「少写一行」能退回去的事。
 *
 * background 能自己造的消息**一共只有两条**，另一条是 {@link disconnectFrame}；
 * 那里写清了为什么它可以代发而 ACK 不可以。这个清单不该再长。
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
 * background 能自己造出来的**第二**条、也是最后一条消息：面板 port 死了的讣告。
 *
 * @remarks
 * # 为什么这条可以代发，而 `HANDSHAKE_ACK` 不可以
 *
 * 两者的性质完全不同，别把这里当成「代发禁令松动了」：
 *
 * - `HANDSHAKE_ACK` 是一个**协议决定**（哪一版赢下协商），决定权归面板。中继代发的 ACK 在格式上
 *   完全合法，只有「ACK 归面板独有」这条所有权规则能挡住它——所以那条禁令一步都不能退。
 * - `DISCONNECT` 是一个**传输事实**（面板的 port 没了）。而这件事**只有 background 观察得到**：
 *   页面看不见扩展 port，面板此刻已经不存在、不可能自己发出讣告。`direction: 'both'` 也说明
 *   协议本来就允许两侧发它。
 *
 * # 不发它的后果（实测）
 *
 * 关掉 DevTools 再重开、中间不刷新页面时：connector 手上的 session A 一直是 `open`，
 * 于是订阅、计时器与在途传输全部继续活着；而重开的面板拿不到新 session——它的
 * `PROTOCOL_HELLO` 会被协商机当成「session 已建立时的迟到帧」拒掉。面板于是静默退回 v1 车道，
 * 连接守卫照样显示「已连接」，但 v2 数据面已经不属于它了。
 *
 * @param sessionId - 该 tab 上最后一次协商出的 session；没有它这帧会被 connector 判为身份不符。
 */
function disconnectFrame(sessionId: string): DevToolsRelayFrame {
  return createDevToolsV2Message('DISCONNECT', null, {
    sessionId,
    sequence: 0,
    timestamp: Date.now(),
    direction: 'panel-to-connector'
  });
}

/**
 * 从一帧下行帧里认出 v2 握手带来的 session id。
 *
 * @returns 该帧是 v2 `HANDSHAKE` 且带合法 `sessionId` 时返回它，否则 `null`。
 *
 * @remarks
 * background 只从**经过它的帧**上读这一个字段，不做任何 payload 校验——严校验在两个端点上。
 * 读它的唯一用途是将来能把讣告发对身份；读错了的后果是讣告被 connector 拒掉，
 * 与「没发」等价，不会造成越权。
 */
function sessionIdOf(frame: DevToolsRelayFrame): string | null {
  if (frame.type !== 'HANDSHAKE') return null;
  const payload = (frame as { payload?: { sessionId?: unknown } }).payload;
  return typeof payload?.sessionId === 'string' ? payload.sessionId : null;
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
  // 每个 tab 上最后一次协商出的 session：面板 port 死掉时用它把讣告发对身份。
  const sessions = new Map<number, string>();
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
        if (connectedTabId === null || ports.get(connectedTabId) !== port) return;
        const tabId = connectedTabId;
        ports.delete(tabId);
        // 讣告在删掉 port 之后发：它走的是 content script 那条路，与已经死掉的 port 无关。
        // 没有 session 就什么都不发——那说明这个 tab 上从来没协商成功过 v2，没有要关的东西。
        const sessionId = sessions.get(tabId);
        if (sessionId === undefined) return;
        sessions.delete(tabId);
        void dependencies
          .sendToTab(tabId, disconnectFrame(sessionId))
          .catch(error => dependencies.onError?.('DISCONNECT', error));
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
      // 顺路记下 session：`HANDSHAKE` 本来就要经过这里，不必为此新增任何通道或校验。
      const sessionId = sessionIdOf(message);
      if (sessionId !== null) sessions.set(tabId, sessionId);
      ports.get(tabId)?.postMessage(message);
    }
  };
}
