import { isDevToolsMessage, RXDB_DEVTOOLS_MESSAGE, type DevToolsMessage } from '../shared/types';

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
 * 校验并把扩展消息投递到当前页面的指定 origin。
 *
 * @returns 消息属于 `devtools-to-page` 方向且已投递时返回 `true`
 */
export function forwardExtensionMessage(
  message: unknown,
  origin: string,
  post: (message: DevToolsMessage, targetOrigin: string) => void
): boolean {
  if (!isDevToolsMessage(message) || message.direction !== 'devtools-to-page') return false;
  post(message, origin);
  return true;
}
