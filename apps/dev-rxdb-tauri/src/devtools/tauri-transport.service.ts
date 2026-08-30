import { Injectable, OnDestroy, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DevToolsTransport } from '@modules/rxdb-devtools-panel';
import {
  isDevToolsMessage,
  logger,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type ExtensionMessageType
} from '@modules/rxdb-devtools-panel/wire';

/**
 * {@link DevToolsTransport} 的 Tauri 实现：面板 WebView ↔ 主 WebView 的定向中继。
 *
 * @remarks
 * 与 Chrome 的 `PortService` 同构——宿主细节（`invoke`/`listen`、window label）全部止于本类，
 * 面板只经 token 认识那三个方法。两处有意的不同：
 *
 * 1. **没有 tabId。** Tauri 没有 inspected tab 概念；身份由 Rust 侧的窗口 label（`rxdb-devtools` ↔
 *    `main`）决定，transport 只做路由，不补一个假 tabId。
 * 2. **没有重连退避。** `listen` 是常驻订阅，事件信道随窗口存在而存在；窗口销毁时 Angular 会调
 *    {@link ngOnDestroy} 摘掉监听。Chrome 的 service worker 会空闲自停，才需要退避重连。
 *
 * 消息在 Rust 侧**原样透传**（不解释、不校验），因此这里序列化成 JSON 字符串交给
 * `devtools_message` 命令，`devtools:message` 事件里收到的也是同一份 JSON 字符串，再解析回来。
 */
@Injectable({ providedIn: 'root' })
export class TauriTransportService implements DevToolsTransport, OnDestroy {
  private sequence = 0;
  private unlisten: UnlistenFn | null = null;
  private readonly listeners = new Set<(msg: DevToolsMessage) => void>();
  private readonly frameListeners = new Set<(frame: unknown) => void>();

  /** 连接状态；`listen` 注册成功即为已连接，摘除监听即为断开。 */
  readonly connected = signal(false);
  /** 每次重连自增一次（Tauri 下只在窗口重建时发生）。 */
  readonly connectionEpoch = signal(0);

  constructor() {
    void this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /** 订阅 v1 车道（经 `isDevToolsMessage` 过滤）。 */
  subscribe(callback: (msg: DevToolsMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** 订阅原始车道（v1 + v2 帧，未经守卫过滤）。 */
  subscribeFrames(callback: (frame: unknown) => void): () => void {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  /** 原样投递一帧到主 WebView 的 connector。 */
  postFrame(frame: unknown): void {
    if (!this.connected()) {
      logger.warn('Tauri transport not connected, cannot post frame');
      return;
    }
    void invoke('devtools_message', { payload: JSON.stringify(frame) }).catch(error =>
      logger.error('Failed to relay devtools frame', error)
    );
  }

  /** 发送一条控制消息到页面。 */
  sendMessage(type: ExtensionMessageType, payload?: unknown): void {
    const message: DevToolsMessage = {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'devtools-to-page',
      type,
      payload: payload ?? null,
      timestamp: Date.now(),
      sequence: this.sequence++
    };
    this.postFrame(message);
  }

  private async connect(): Promise<void> {
    try {
      this.unlisten = await listen<string>('devtools:message', event => {
        const frame = JSON.parse(event.payload) as unknown;
        this.notifyFrameListeners(frame);
        if (isDevToolsMessage(frame)) this.notifyListeners(frame);
      });
      this.connected.set(true);
      this.connectionEpoch.update(epoch => epoch + 1);
      logger.info('Tauri transport connected');
    } catch (error) {
      logger.error('Failed to connect tauri transport', error);
      this.connected.set(false);
    }
  }

  private disconnect(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.connected.set(false);
  }

  private notifyListeners(msg: DevToolsMessage): void {
    for (const listener of this.listeners) listener(msg);
  }

  private notifyFrameListeners(frame: unknown): void {
    for (const listener of this.frameListeners) listener(frame);
  }
}
