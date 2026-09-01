import { Injectable, OnDestroy, signal } from '@angular/core';
import type { DevToolsTransport } from '@modules/rxdb-devtools-panel';
import {
  isDevToolsMessage,
  logger,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type ExtensionMessageType
} from '@modules/rxdb-devtools-panel/wire';

/** 重连退避：起始 1s，指数增长，封顶 30s */
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * {@link DevToolsTransport} 的 Chrome 实现：面板 ↔ background service worker 的 Port 通道。
 *
 * @remarks
 * tabId、`chrome.runtime.Port`、重连退避、`INIT` 绑定、导航时合成 `DISCONNECT` —— 这些宿主细节
 * 全部止于本类。面板只经 token 认识那三个方法，因此 Electron / Tauri 换一份 adapter 即可复用同一套 UI。
 */
@Injectable({ providedIn: 'root' })
export class PortService implements DevToolsTransport, OnDestroy {
  private port: chrome.runtime.Port | null = null;
  private sequence = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private activationRequested = false;
  private readonly listeners = new Set<(msg: DevToolsMessage) => void>();
  private readonly frameListeners = new Set<(frame: unknown) => void>();

  /** 连接状态 */
  readonly connected = signal(false);

  /**
   * 每次成功建链自增一次。
   *
   * @remarks
   * 只看 {@link PortService.connected} 无法区分「一直连着」和「断开后又连上了」——
   * 两者的终值都是 `true`，而 v2 协商机对这两件事的处理完全不同：后者必须换一个新
   * 端点重新协商（v1 facade 是终态）。把「第几次建链」显式化，宿主才有一个可观察的
   * 重连边界，不必去猜信号的中间态。
   */
  readonly connectionEpoch = signal(0);

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

  /**
   * 订阅**未经 v1 守卫过滤**的原始入站帧。
   *
   * @remarks
   * 与 {@link PortService.subscribe} 是两条并行的车道，不是它的超集用法。v1 车道用
   * `isDevToolsMessage` 把非 v1 的帧挡在外面，那道守卫对 v2 帧的判定是「不是本协议」——
   * 让 v2 端点复用它，等于要求 v2 帧伪装成 v1 才收得到。反过来把守卫放宽，则会让 v1
   * 的三个状态服务收到自己看不懂的帧。所以两条车道各走各的，谁也不替谁做版本决定。
   *
   * 原始车道**必须**同时收到 legacy `HANDSHAKE`：v2 的协商是证据触发的，那条 v1 握手
   * 就是唯一的证据（见 `negotiation-panel.ts`），过滤掉它协商窗口永远不会开始。
   *
   * @param callback - 每帧回调，值未经任何协议校验。
   * @returns 取消订阅函数。
   */
  subscribeFrames(callback: (frame: unknown) => void): () => void {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  /**
   * 原样投递一帧到 background 中继。
   *
   * @remarks
   * 不补 `tabId`：background 的路由只认 `INIT` 绑定的那个 tab，消息自称的 tabId 不参与
   * 路由（见 `background-core.ts` 的 P1-4）。这里再塞一个只会制造「帧上写着 A、实际去了 B」
   * 的错觉。
   *
   * @param frame - 已由协议层构造完毕的出站帧。
   */
  postFrame(frame: unknown): void {
    if (!this.port) {
      logger.warn('Port not connected, cannot post frame');
      return;
    }
    this.port.postMessage(frame);
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
        this.notifyFrameListeners(message);
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
      this.connectionEpoch.update(epoch => epoch + 1);
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
    this.frameListeners.clear();
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

  private notifyFrameListeners(frame: unknown): void {
    this.frameListeners.forEach(listener => {
      try {
        listener(frame);
      } catch (err) {
        logger.error('Frame listener error', err);
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
