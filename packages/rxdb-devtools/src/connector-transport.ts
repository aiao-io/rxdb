/**
 * @fileoverview connector 传输层的最小抽象：出站、入站与会话私有端口。
 *
 * @remarks
 * connector（被检查页侧）此前把传输写死在浏览器原语上：`window.postMessage` +
 * `MessageChannel` 私有端口。这套模型在 Tauri 上不成立——两个独立 WebView 没有共享
 * `window`，也没有 `MessageChannel`。把传输抽成可注入接口后，浏览器实现保持现有行为
 * （window 总线 + MessageChannel），Tauri 实现走宿主命令/事件（`invoke`/`listen`），
 * 私有端口语义由宿主按窗口 label 路由替代。协议逻辑（v1/v2 分流、命令白名单）**不在这里**，
 * 仍由 connector 自己处理——这里只做「把一帧送出去 / 收回来」。
 *
 * @module @aiao/rxdb-devtools/connector-transport
 */

import { isDevToolsMessage, RXDB_DEVTOOLS_MESSAGE } from './types.js';
import type { DevToolsConnectorNegotiationMessage } from './v2/negotiation-connector.js';

/** opaque origin（`location.origin === 'null'`）；与 connector 里的判据同源。 */
const OPAQUE_ORIGIN = 'null' as const;

/**
 * connector 传输层的最小抽象。
 *
 * @remarks
 * 三个方法各自对应 connector 的一处浏览器硬编码：
 * - {@link send} —— 出站帧（v1 握手随附私有端口，v2 帧走总线/宿主通道）。
 * - {@link subscribe} —— 入站帧（宿主做 source/origin/身份过滤后交回原始帧）。
 * - {@link createSessionPort} —— 会话私有端口；无端口宿主（Tauri）返回 `undefined`。
 */
export interface DevToolsConnectorTransport {
  /**
   * 发送一条消息到面板。
   *
   * @param message - v1 或 v2 帧。
   * @param transfer - 握手的私有端口（无端口宿主省略）。
   */
  send(message: DevToolsConnectorNegotiationMessage, transfer?: Transferable[]): void;

  /**
   * 订阅面板消息。
   *
   * @remarks
   * 回调收到的是**未经 v1/v2 分流**的原始帧（宿主已做身份/来源过滤）。协议分流是 connector 的
   * 职责，不在这里——否则每个宿主都要复制一份「哪条是 v1 命令、哪条是 v2 帧」的判定。
   *
   * @param callback - 每帧回调。
   * @returns 退订函数。
   */
  subscribe(callback: (message: unknown) => void): () => void;

  /**
   * 创建会话私有端口，返回随握手移交的那一端。
   *
   * @remarks
   * 无端口宿主（Tauri）返回 `undefined`：它的隔离由宿主按窗口 label 路由提供，等价于浏览器
   * 的 MessageChannel。调用方据此决定握手是否要带 `transfer`。
   *
   * @param onMessage - 端口入站回调（原始帧，未做协议过滤）。
   * @returns 要移交的对端，或 `undefined`。
   */
  createSessionPort(onMessage: (message: unknown) => void): Transferable | undefined;

  /** 关闭会话私有端口；幂等。 */
  closeSessionPort(): void;
}

/**
 * 浏览器实现：window 总线 + MessageChannel 私有端口。
 *
 * @returns 现有 connector 行为的传输层。
 */
export function createWindowConnectorTransport(): DevToolsConnectorTransport {
  let port: MessagePort | null = null;

  return {
    send(message, transfer) {
      if (typeof window === 'undefined') return;
      try {
        // 握手之后 v1 命令走私有端口（点对点，无需 origin）；其余退回 window 总线。
        if (port !== null && transfer === undefined && isDevToolsMessage(message)) {
          port.postMessage(message);
          return;
        }
        const targetOrigin = location.origin === OPAQUE_ORIGIN ? '*' : location.origin;
        window.postMessage(message, targetOrigin, transfer);
      } catch (error) {
        console.warn(`[${RXDB_DEVTOOLS_MESSAGE}] Failed to post message:`, error);
      }
    },

    subscribe(callback) {
      if (typeof window === 'undefined') return () => undefined;
      const handler = (event: MessageEvent): void => {
        if (event.source !== window) return;
        if (event.origin && event.origin !== location.origin) return;
        callback(event.data);
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },

    createSessionPort(onMessage) {
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (event: MessageEvent) => onMessage(event.data);
      port.start();
      return channel.port2;
    },

    closeSessionPort() {
      if (port === null) return;
      port.onmessage = null;
      port.close();
      port = null;
    }
  };
}
