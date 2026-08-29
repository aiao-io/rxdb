import { isDevToolsMessage, RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '@aiao/rxdb-devtools-panel/wire';

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
  send: (message: DevToolsMessage) => void
): boolean {
  if (event.source !== currentWindow) return false;
  // P2-1：早先有 `event.origin !== '' &&` 的例外，等于对空 origin 无条件放行。
  // `event.source === currentWindow` 已经挡住绝大多数场景，但 origin 校验是第二道闸，
  // 不该自带一个可绕过的口子 —— sandboxed iframe / `data:` / `blob:` 文档的 origin 正是空串。
  if (event.origin !== currentWindow.location.origin) return false;
  if (!isDevToolsMessage(event.data) || event.data.direction !== 'page-to-devtools') return false;
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
export function forwardPortMessage(event: MessageEvent, send: (message: DevToolsMessage) => void): boolean {
  if (!isDevToolsMessage(event.data) || event.data.direction !== 'page-to-devtools') return false;
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
 * 说明对面是 v1 connector —— 调用方应当据此给出诊断，而不是当作正常握手继续。
 */
export function extractHandshakePort(event: MessageEvent): MessagePort | null {
  if (!isDevToolsMessage(event.data) || event.data.type !== 'HANDSHAKE') return null;
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
 * 有端口就走端口：命令载荷（分支名、查询参数）不该出现在同页任何脚本都能监听的
 * `window` 总线上。唯独 `PING` 例外 —— 它正是用来唤醒「握手时 bridge 还没注入」的
 * connector 的，那种情况下端口必然还不存在，只能广播。
 */
export function forwardExtensionMessage(
  message: unknown,
  origin: string,
  post: (message: DevToolsMessage, targetOrigin: string) => void,
  port: MessagePort | null = null
): boolean {
  if (!isDevToolsMessage(message) || message.direction !== 'devtools-to-page') return false;
  if (port) {
    port.postMessage(message);
    return true;
  }
  post(message, origin);
  return true;
}
