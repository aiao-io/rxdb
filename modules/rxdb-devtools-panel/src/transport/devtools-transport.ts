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
   * 每次成功建链自增一次。
   *
   * @remarks
   * 只看 {@link DevToolsTransport.connected} 无法区分「一直连着」和「断开后又连上了」——
   * 两者的终值都是 `true`，而 v2 协商对这两件事的处理完全不同：后者必须换新端点重新协商
   * （v1 facade 是终态）。把「第几次建链」显式化，宿主才有可观察的重连边界。
   */
  readonly connectionEpoch: Signal<number>;

  /**
   * 订阅页面侧消息。
   *
   * @returns 取消订阅函数；面板销毁或换 session 时必须调用，迟到消息不得进入新 session。
   */
  subscribe(callback: (message: DevToolsMessage) => void): () => void;

  /**
   * 订阅**未经 v1 守卫过滤**的原始入站帧（v1 + v2）。
   *
   * @remarks
   * 与 {@link DevToolsTransport.subscribe} 是两条并行的车道：v1 车道用 `isDevToolsMessage`
   * 把 v2 帧挡在外面，v2 端点复用 v1 车道就收不到任何 v2 帧；把 v1 守卫放宽又会让 v1 状态服务
   * 收到看不懂的帧。所以两条车道各走各的。原始车道还必须收到 legacy `HANDSHAKE`——v2 协商是
   * 证据触发的，那条 v1 握手就是唯一证据，过滤掉它协商窗口永远不会开始。
   *
   * @param callback - 每帧回调，值未经任何协议校验。
   * @returns 取消订阅函数。
   */
  subscribeFrames(callback: (frame: unknown) => void): () => void;

  /** 原样投递一帧（v1 或 v2）到页面侧；信道未就绪时静默丢弃而非抛错。 */
  postFrame(frame: unknown): void;

  /** 向页面发送一条控制消息；信道未就绪时静默丢弃而非抛错。 */
  sendMessage(type: ExtensionMessageType, payload?: unknown): void;
}

/** {@link DevToolsTransport} 的注入令牌。 */
export const DEVTOOLS_TRANSPORT = new InjectionToken<DevToolsTransport>('DEVTOOLS_TRANSPORT');
