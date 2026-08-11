import { logger } from '../shared/utils/logger';
import { createBridgePing, forwardExtensionMessage, forwardPageMessage } from './bridge-core';

function setupPageListener(): void {
  window.addEventListener('message', event => {
    forwardPageMessage(event, window, message => {
      chrome.runtime.sendMessage(message).catch((err: unknown) => {
        logger.debug('Failed to send message to extension', { type: message.type, err });
      });
    });
  });
}

function setupExtensionListener(): void {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    forwardExtensionMessage(message, window.location.origin, (value, origin) => window.postMessage(value, origin));
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
