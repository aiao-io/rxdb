import { InjectionToken, type Signal } from '@angular/core';
import type { DevToolsMessage, ExtensionMessageType } from '@modules/rxdb-devtools-panel/wire';

/**
 * 面板与被检查页之间的**平台中立**控制信道。
 *
 * @remarks
 * 契约里刻意不出现 tabId、`chrome.runtime.Port`、Electron `webContents`、Tauri window label
 * 之类的宿主概念：面板只需要「连没连上」「来消息了」「发一条出去」三件事。宿主怎么把这三件事
 * 落到某条真实通道上（含重连退避、`INIT` 绑定、导航时合成 `DISCONNECT`），是 adapter 的责任。
 *
 * 这条边界是 US-904 阶段 D（Electron / Tauri 复用同一套面板）能成立的前提：面板一旦
 * `inject` 了 Chrome 的具体服务，桌面端就只剩复制一份 UI 这条路。
 */
export interface DevToolsTransport {
  /** 信道当前是否可用；断开期间 {@link DevToolsTransport.sendMessage} 允许被丢弃。 */
  readonly connected: Signal<boolean>;

  /**
   * 订阅页面侧消息。
   *
   * @returns 取消订阅函数；面板销毁或换 session 时必须调用，迟到消息不得进入新 session。
   */
  subscribe(callback: (message: DevToolsMessage) => void): () => void;

  /** 向页面发送一条控制消息；信道未就绪时静默丢弃而非抛错。 */
  sendMessage(type: ExtensionMessageType, payload?: unknown): void;
}

/** {@link DevToolsTransport} 的注入令牌。 */
export const DEVTOOLS_TRANSPORT = new InjectionToken<DevToolsTransport>('DEVTOOLS_TRANSPORT');
