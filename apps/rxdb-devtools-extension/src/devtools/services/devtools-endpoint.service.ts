import { effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import {
  createDevToolsPanelEndpoint,
  createSystemClock,
  type DevToolsPanelEndpoint,
  type DevToolsPanelNegotiationState
} from '@aiao/rxdb-devtools';
import { logger } from '@modules/rxdb-devtools-panel/wire';
import { PortService } from './port.service';

/**
 * Chrome 侧的 v2 transport driver。
 *
 * @remarks
 * 它**只做接线**：把 `chrome.runtime.Port` 的原始收发接到阶段 B 冻结的 panel 端点上。
 * 协商时机、1,000 ms 窗口、`HANDSHAKE_ACK` 的所有权、降级判定全部在
 * `@aiao/rxdb-devtools` 的状态机里，这里一条协议分支都不写——一旦宿主开始参与版本决策，
 * Electron 与 Tauri 就得各写一份同样的决策，三份实现的分歧只会在真实设备上才暴露。
 *
 * 协商是**证据触发**的：`start()` 发出首帧 `PROTOCOL_HELLO` 之后，状态机要等到第一条
 * legacy `HANDSHAKE` 被暂存才开窗计时。所以原始车道必须把 v1 握手也送进来，
 * 见 {@link PortService.subscribeFrames}。
 *
 * 每次重连都换一个新端点：v1 facade 是终态，旧端点在 session 关闭后只会对每次请求
 * 回 `session_closed`。这也是文件信道拿的是**取端点的函数**而不是端点实例的原因。
 */
@Injectable({ providedIn: 'root' })
export class DevToolsEndpointService implements OnDestroy {
  private readonly ports = inject(PortService);
  private endpoint: DevToolsPanelEndpoint | null = null;
  private unsubscribe: (() => void) | null = null;

  /** 当前协商状态；未建链时为 `null`。 */
  readonly state = signal<DevToolsPanelNegotiationState | null>(null);

  constructor() {
    effect(() => {
      // epoch 而不是 connected：断开→重连两端都是 `true`，只有计数能把重连表达出来。
      const epoch = this.ports.connectionEpoch();
      this.teardown();
      if (epoch === 0) return;
      this.attach();
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /**
   * 取当前端点。
   *
   * @returns 已建链时为端点，否则 `null`。
   */
  resolve(): DevToolsPanelEndpoint | null {
    return this.endpoint;
  }

  private attach(): void {
    // 状态只在两个时刻变化：收到一帧，或状态机自己发出一帧。**出站边不能省**——1,000 ms
    // 窗口到期是纯计时驱动的，那一刻没有任何入站帧，只盯入站会让「已降级到 v1 facade」
    // 对 UI 永远不可见。回读拿到的一定是新值：协商机在每次状态赋值之后才调 `send`
    // （见 `negotiation-panel.ts` 的 `#enterFacade` / `#onV2Handshake`）。
    // 这样宿主也不必复制那个 1,000 ms 常量——窗口时长仍然只有协商机知道。
    const holder: { endpoint: DevToolsPanelEndpoint | null } = { endpoint: null };
    const publish = (): void => {
      // 只发布自己这一次连接的状态：出站回调是闭包，重连后旧闭包若还能写信号，
      // 会把上一条连接的终态盖到新连接上。
      if (holder.endpoint !== null) this.state.set(holder.endpoint.state);
    };

    const endpoint = createDevToolsPanelEndpoint({
      send: message => {
        this.ports.postFrame(message);
        publish();
      },
      clock: createSystemClock()
    });
    holder.endpoint = endpoint;
    this.endpoint = endpoint;
    this.unsubscribe = this.ports.subscribeFrames(frame => {
      endpoint.receive(frame);
      publish();
    });
    endpoint.start();
    publish();
    logger.info('DevTools v2 endpoint started');
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.endpoint?.dispose();
    this.endpoint = null;
    this.state.set(null);
  }
}
