import {
  isDevToolsMessage,
  isRelayFrameTowards,
  isRelayHandshake,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type DevToolsRelayFrame
} from '@modules/rxdb-devtools-panel/wire';

/**
 * 构造 bridge 就绪后主动注入页面的 PING。
 *
 * background 只能在 `executeScript` resolve 后发 PING，而 crxjs 的 content script
 * 是异步 loader（`await import(...)`），resolve 时 `chrome.runtime.onMessage`
 * 往往还没注册，PING 会以 "Receiving end does not exist" 丢掉且没有重试。
 * 因此由 bridge 在自己确实能中转消息的那一刻自己发 PING，消除竞态。
 */
export function createBridgePing(): DevToolsMessage {
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
 * 校验并把当前页面发出的消息转交给扩展运行时。
 *
 * @returns 消息通过来源、origin、方向和协议校验时返回 `true`
 */
export function forwardPageMessage(
  event: MessageEvent,
  currentWindow: Window,
  send: (message: DevToolsRelayFrame) => void
): boolean {
  if (event.source !== currentWindow) return false;
  // P2-1：早先有 `event.origin !== '' &&` 的例外，等于对空 origin 无条件放行。
  // `event.source === currentWindow` 已经挡住绝大多数场景，但 origin 校验是第二道闸，
  // 不该自带一个可绕过的口子 —— sandboxed iframe / `data:` / `blob:` 文档的 origin 正是空串。
  if (event.origin !== currentWindow.location.origin) return false;
  // C2/AC#36：宽外层 + 方向判定，两代协议同一条链路。判定收成一个函数是因为
  // 原来「各处各写一次 `direction === 'page-to-devtools'`」的写法，加上 v2 的两个方向标签后
  // 要在四处各展开成一个或表达式，漏改任何一处都表现为某个方向的 v2 帧被静默吞掉。
  if (!isRelayFrameTowards(event.data, 'to-panel')) return false;
  send(event.data);
  return true;
}

/**
 * 校验并把私有端口上收到的消息转交给扩展运行时。
 *
 * @returns 消息通过方向与协议校验时返回 `true`
 *
 * @remarks
 * 端口是点对点的，没有 `source` / `origin` 可查 —— 能往里发消息的只有握手时留下
 * `port1` 的那个 connector，所以这里只做结构校验，不重复 {@link forwardPageMessage}
 * 的来源检查。
 */
export function forwardPortMessage(event: MessageEvent, send: (message: DevToolsRelayFrame) => void): boolean {
  if (!isRelayFrameTowards(event.data, 'to-panel')) return false;
  send(event.data);
  return true;
}

/**
 * 从页面 HANDSHAKE 消息中取出随附的私有端口。
 *
 * @returns 该消息确实是带端口的握手时返回端口，否则 `null`
 *
 * @remarks
 * 协议 v2 起 connector 会在 HANDSHAKE 上 transfer 一个 `MessagePort`。取不到端口
 * 说明对面是不带私有信道的 connector —— 调用方应当据此给出诊断，而不是当作正常握手继续。
 *
 * C2/AC#36：识别用的是 {@link isRelayHandshake}（两代协议的上行 HANDSHAKE），不是 v1 的类型白名单。
 * 私有信道的建立与协议版本无关，用 v1 守卫识别等于逼 v2 connector 为了拿到端口而伪装成 v1 ——
 * 而那次伪装会直接污染面板的版本判定。
 */
export function extractHandshakePort(event: MessageEvent): MessagePort | null {
  if (!isRelayHandshake(event.data)) return null;
  return event.ports[0] ?? null;
}

/**
 * 校验并把扩展消息投递给页面。
 *
 * @param message - 待投递的消息，非 `devtools-to-page` 方向一律拒绝
 * @param origin - 退回 `window` 总线时使用的 targetOrigin
 * @param post - `window.postMessage` 适配器
 * @param port - 已握手时的私有端口；`null` 表示尚未握手
 * @returns 消息属于 `devtools-to-page` 方向且已投递时返回 `true`
 *
 * @remarks
 * **v1 有端口就走端口**：命令载荷（分支名、查询参数）不该出现在同页任何脚本都能监听的
 * `window` 总线上。唯独 `PING` 例外 —— 它正是用来唤醒「握手时 bridge 还没注入」的
 * connector 的，那种情况下端口必然还不存在，只能广播。
 *
 * **v2 一律走 `window` 总线，端口在不在都一样**：私有端口是 v1 命令面的传输层，
 * connector 的 `#port.onmessage` 只解 v1 消息，v2 帧的收发两个方向都固定在
 * `window` 总线上（见 `packages/rxdb-devtools/src/connector.ts` 的 `#postMessage`）。
 * 把 v2 帧塞进端口，对端一条都读不到：`PROTOCOL_HELLO` 石沉大海、协商窗口静默到期，
 * 「两端都支持 v2」于是在真实 Chrome 里**稳定**退回 v1 facade。两代协议各自完整地
 * 待在自己的信道上，中继不得替它们换信道。
 *
 * v2 的下行载荷因此确实经过 `window` 总线——这是阶段 B 冻结协议时就定下的形态
 * （connector 的 v2 出站同样走总线，且 `targetOrigin` 锁死 `location.origin`），
 * 不是这里放宽的。要改只能改协议本身，不能由中继单方面改路由。
 */
export function forwardExtensionMessage(
  message: unknown,
  origin: string,
  post: (message: DevToolsRelayFrame, targetOrigin: string) => void,
  port: MessagePort | null = null
): boolean {
  if (!isRelayFrameTowards(message, 'to-page')) return false;
  if (port && isDevToolsMessage(message)) {
    port.postMessage(message);
    return true;
  }
  post(message, origin);
  return true;
}
