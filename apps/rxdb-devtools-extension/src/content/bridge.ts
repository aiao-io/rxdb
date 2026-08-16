import type { DevToolsMessage } from '../shared/types';
import { logger } from '../shared/utils/logger';
import {
  createBridgePing,
  extractHandshakePort,
  forwardExtensionMessage,
  forwardPageMessage,
  forwardPortMessage
} from './bridge-core';

/**
 * 当前会话的私有信道端口，由页面在 HANDSHAKE 上 transfer 过来。
 *
 * @remarks
 * `null` 表示还没握上手（或对面是 v1 connector）。每次握手都换新端口，旧的立刻关掉 ——
 * 页面侧同样会丢弃旧端口，留着只会让扩展往一条没人听的信道里发命令。
 */
let pagePort: MessagePort | null = null;

function sendToExtension(message: DevToolsMessage): void {
  chrome.runtime.sendMessage(message).catch((err: unknown) => {
    logger.debug('Failed to send message to extension', { type: message.type, err });
  });
}

function adoptPort(port: MessagePort): void {
  if (pagePort) {
    pagePort.onmessage = null;
    pagePort.close();
  }
  pagePort = port;
  port.onmessage = event => forwardPortMessage(event, sendToExtension);
  port.start();
}

function setupPageListener(): void {
  window.addEventListener('message', event => {
    // 先过 forwardPageMessage 的来源 / origin / 协议校验再取端口：跨源 iframe 伪造一条
    // 带端口的 HANDSHAKE 就能把 bridge 的下行信道劫持过去，端口的采纳必须和消息的转发
    // 共用同一道闸。转发是异步的（chrome.runtime.sendMessage 返回 promise），
    // HANDSHAKE_ACK 回来时端口早已就位，先转后采不构成竞态。
    if (!forwardPageMessage(event, window, sendToExtension)) return;
    const port = extractHandshakePort(event);
    if (port) adoptPort(port);
  });
}

function setupExtensionListener(): void {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    forwardExtensionMessage(
      message,
      window.location.origin,
      (value, origin) => window.postMessage(value, origin),
      pagePort
    );
  });
}

/**
 * 主动向页面发 PING，唤醒「在 bridge 注入之前就 init 完成」的 connector 重新握手。
 *
 * 页面刷新时 connector 在 app bootstrap 阶段就发出了 HANDSHAKE，那时 bridge 尚未注入，
 * 消息直接丢失；若再错过 background 的一次性 PING，双方就会永久互相等待
 * （panel 一直停在 "Waiting for RxDB connection..."）。
 */
function announceReady(): void {
  window.postMessage(createBridgePing(), window.location.origin);
}

const bridgeWindow = window as Window & { __AIAO_RXDB_DEVTOOLS_BRIDGE__?: boolean };

function init(): void {
  if (bridgeWindow.__AIAO_RXDB_DEVTOOLS_BRIDGE__) return;
  bridgeWindow.__AIAO_RXDB_DEVTOOLS_BRIDGE__ = true;
  logger.info('Bridge: Initializing');
  setupPageListener();
  setupExtensionListener();
  announceReady();
  logger.info('Bridge: Ready');
}

init();

export { init };
