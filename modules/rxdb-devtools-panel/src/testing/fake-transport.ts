import { signal } from '@angular/core';
import {
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsMessage,
  type ExtensionMessageType
} from '@modules/rxdb-devtools-panel/wire';
import type { DevToolsTransport } from '../transport';

/** 面板经 {@link FakeDevToolsTransport} 发出的一条消息。 */
export interface RecordedMessage {
  type: ExtensionMessageType;
  payload: unknown;
}

/**
 * 纯内存的 {@link DevToolsTransport} 实现，供面板在**没有任何宿主全局**的环境里装配。
 *
 * @remarks
 * 它的存在本身就是 AC#32 的判据：面板若还偷偷依赖 `chrome.*`，用这份 fake 引导就会当场炸。
 * 所以它刻意不提供任何逃生口 —— 没有 `chrome` 垫片，没有默认放行的 `any`。
 */
export class FakeDevToolsTransport implements DevToolsTransport {
  private readonly listeners = new Set<(message: DevToolsMessage) => void>();
  private readonly frameListeners = new Set<(frame: unknown) => void>();
  private sequence = 0;

  readonly connected = signal(false);
  readonly connectionEpoch = signal(0);

  /** 面板发出的全部消息，按时序记录。 */
  readonly sent: RecordedMessage[] = [];

  /** 面板经 {@link FakeDevToolsTransport.postFrame} 发出的全部原始帧。 */
  readonly frames: unknown[] = [];

  /** 当前订阅者数量；用于断言换 session / 销毁后没有残留订阅。 */
  get subscriberCount(): number {
    return this.listeners.size;
  }

  subscribe(callback: (message: DevToolsMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  subscribeFrames(callback: (frame: unknown) => void): () => void {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  postFrame(frame: unknown): void {
    this.frames.push(frame);
  }

  sendMessage(type: ExtensionMessageType, payload?: unknown): void {
    this.sent.push({ type, payload: payload ?? null });
  }

  /** 模拟页面侧发来一条消息。 */
  emit(type: ExtensionMessageType, payload: unknown = null): void {
    const message: DevToolsMessage = {
      source: RXDB_DEVTOOLS_MESSAGE,
      direction: 'page-to-devtools',
      type,
      payload,
      timestamp: 0,
      sequence: this.sequence++
    };
    this.listeners.forEach(listener => listener(message));
  }

  /** 模拟页面侧发来一帧原始帧（v1 或 v2）。 */
  emitFrame(frame: unknown): void {
    this.frameListeners.forEach(listener => listener(frame));
  }
}
