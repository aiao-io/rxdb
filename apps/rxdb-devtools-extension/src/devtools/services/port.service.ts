import { Injectable, OnDestroy, signal } from '@angular/core';
import { DevToolsMessage, ExtensionMessageType, isDevToolsMessage, RXDB_DEVTOOLS_MESSAGE } from '../../shared/types';
import { logger } from '../../shared/utils/logger';

/**
 * Chrome Extension Port 通信服务
 * 管理与 Background Service Worker 的连接
 */
/** 重连退避：起始 1s，指数增长，封顶 30s */
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

@Injectable({ providedIn: 'root' })
export class PortService implements OnDestroy {
  private port: chrome.runtime.Port | null = null;
  private sequence = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private activationRequested = false;
  private readonly listeners = new Set<(msg: DevToolsMessage) => void>();

  /** 连接状态 */
  readonly connected = signal(false);

  constructor() {
    this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * 订阅消息
   * @returns 取消订阅函数
   */
  subscribe(callback: (msg: DevToolsMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** 在宿主权限确认后激活当前 inspected tab。 */
  activateTab(): void {
    this.activationRequested = true;
    this.postInit();
  }

  /** inspected tab 导航时立即清掉页面状态，并等待新 origin 的权限复核。 */
  notifyNavigation(): void {
    this.activationRequested = false;
    this.notifyDisconnect();
  }

  /**
   * 发送消息到页面
   */
  sendMessage(type: ExtensionMessageType, payload?: unknown): void {
    if (!this.port) {
      logger.warn('Port not connected, cannot send message', { type });
      return;
    }

    const message: DevToolsMessage = {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type,
      payload: payload ?? null,
      timestamp: Date.now(),
      sequence: this.sequence++,
      tabId: chrome.devtools.inspectedWindow.tabId
    };

    this.port.postMessage(message);
  }

  private connect(): void {
    if (this.destroyed) return;
    try {
      this.port = chrome.runtime.connect({ name: 'rxdb-devtools-panel' });

      this.port.onMessage.addListener((message: unknown) => {
        if (!isDevToolsMessage(message)) return;
        this.notifyListeners(message);
      });

      this.port.onDisconnect.addListener(() => {
        logger.info('Port disconnected');
        this.connected.set(false);
        this.port = null;
        this.notifyDisconnect();
        if (!this.destroyed) this.scheduleReconnect();
      });

      this.reconnectAttempts = 0;
      this.connected.set(true);
      if (this.activationRequested) this.postInit();
      logger.info('Port connected');
    } catch (err) {
      logger.error('Failed to connect port', err);
      this.connected.set(false);
      this.scheduleReconnect();
    }
  }

  /** 指数退避重连，避免 Service Worker 不可用时高频空转 */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(BASE_RECONNECT_DELAY * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.listeners.clear();
  }

  private notifyListeners(message: DevToolsMessage): void {
    this.listeners.forEach(listener => {
      try {
        listener(message);
      } catch (err) {
        logger.error('Listener error', err);
      }
    });
  }

  private postInit(): void {
    if (!this.port) return;
    this.port.postMessage({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type: 'INIT',
      payload: null,
      timestamp: Date.now(),
      sequence: this.sequence++,
      tabId: chrome.devtools.inspectedWindow.tabId
    });
  }

  private notifyDisconnect(): void {
    this.notifyListeners({
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type: 'DISCONNECT',
      payload: null,
      timestamp: Date.now(),
      sequence: this.sequence++,
      tabId: chrome.devtools.inspectedWindow.tabId
    });
  }
}
