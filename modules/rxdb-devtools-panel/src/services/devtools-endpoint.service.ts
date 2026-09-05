import {
  createDevToolsPanelEndpoint,
  createSystemClock,
  type DevToolsPanelEndpoint,
  type DevToolsPanelNegotiationState
} from '@aiao/rxdb-devtools';
import { effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { isDevToolsMessage, logger } from '@modules/rxdb-devtools-panel/wire';
import { DEVTOOLS_TRANSPORT } from '../transport/devtools-transport';

/**
 * 平台中立的 v2 transport driver。
 *
 * @remarks
 * 从 Chrome 扩展的 `DevToolsEndpointService` 上移：它**只做接线**——把 {@link DEVTOOLS_TRANSPORT}
 * 的原始收发接到阶段 B 冻结的 panel 端点上。协商时机、1,000 ms 窗口、`HANDSHAKE_ACK` 的所有权、
 * 降级判定全部在 `@aiao/rxdb-devtools` 的状态机里，这里一条协议分支都不写——一旦宿主开始参与
 * 版本决策，Chrome / Electron / Tauri 就得各写一份同样的决策，三份实现的分歧只会在真实设备上才暴露。
 *
 * 协商是**证据触发**的：`start()` 发出首帧 `PROTOCOL_HELLO` 之后，状态机要等到第一条 legacy
 * `HANDSHAKE` 被暂存才开窗计时。所以原始车道必须把 v1 握手也送进来（transport 的 `subscribeFrames`）。
 *
 * 每次重连都换一个新端点：v1 facade 是终态，旧端点在 session 关闭后只会对每次请求回
 * `session_closed`。这也是文件信道拿的是**取端点的函数**而不是端点实例的原因。
 */
@Injectable({ providedIn: 'root' })
export class DevToolsEndpointService implements OnDestroy {
  private readonly transport = inject(DEVTOOLS_TRANSPORT);
  private endpoint: DevToolsPanelEndpoint | null = null;
  private unsubscribe: (() => void) | null = null;

  /** 当前协商状态；未建链时为 `null`。 */
  readonly state = signal<DevToolsPanelNegotiationState | null>(null);

  constructor() {
    effect(() => {
      // epoch 而不是 connected：断开→重连两端都是 `true`，只有计数能把重连表达出来。
      const epoch = this.transport.connectionEpoch();
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
    // 对 UI 永远不可见。回读拿到的一定是新值：协商机在每次状态赋值之后才调 `send`。
    const holder: { endpoint: DevToolsPanelEndpoint | null } = { endpoint: null };
    const publish = (): void => {
      // 只发布自己这一次连接的状态：出站回调是闭包，重连后旧闭包若还能写信号，
      // 会把上一条连接的终态盖到新连接上。
      if (holder.endpoint !== null) this.state.set(holder.endpoint.state);
    };

    const endpoint = createDevToolsPanelEndpoint({
      send: message => {
        this.transport.postFrame(message);
        publish();
      },
      clock: createSystemClock()
    });
    holder.endpoint = endpoint;
    this.endpoint = endpoint;
    this.unsubscribe = this.transport.subscribeFrames(frame => {
      // connector 重启的唯一证据：一条**新的 legacy 握手**，而本端协商已经落定。
      // 落定之后的端点是终态（`v2` 或 `v1-facade`），它不会再协商第二次——
      // 继续喂给它，面板就一直对着一个已经不存在的 session 说话。
      if (this.#restartsNegotiation(frame, endpoint)) {
        this.teardown();
        this.attach();
        // 交给**新**端点：这一帧正是它开窗计时所等的那条证据，丢掉就要等下一次握手。
        this.endpoint?.receive(frame);
        this.state.set(this.endpoint?.state ?? null);
        return;
      }
      endpoint.receive(frame);
      publish();
    });
    endpoint.start();
    publish();
    logger.info('DevTools v2 endpoint started');
  }

  /**
   * 这一帧是不是「connector 重启了」的证据。
   *
   * @remarks
   * # 为什么判据是 legacy 握手 + 本端终态
   *
   * connector 每次 `#startNegotiation()` 都会 eager 发一条 v1 `HANDSHAKE`（`endpoint.start()`）。
   * 所以在本端**已经协商完**之后又收到一条，只可能是对端重新起了一轮——被检查页刷新、
   * 或 connector 侧换了端点。v2 的 `HANDSHAKE` 不算：那是对本端 `PROTOCOL_HELLO` 的应答，
   * 属于正常协商流程。
   *
   * `idle` / `awaiting` 期间收到的握手是本轮协商的正常输入，交给现有端点即可——
   * 在那两个状态下重建端点会把刚开的 1,000 ms 决策窗口一起丢掉。
   *
   * # 为什么必须换端点而不是复位状态
   *
   * 与 connector 侧同一个理由：session 身份在协商机**构造时**就铸好，原地复位会让新一轮
   * 复用旧身份。面板这边还多一层——`v1-facade` 是终态，旧端点此后对每次请求只会回
   * `session_closed`。
   *
   * # 不修的后果（实测）
   *
   * 主窗口刷新之后面板**不重新协商**：连接守卫因为收到 v1 握手而显示「已连接」，
   * 但 v2 数据面已经不属于它了。这与 US-904 AC#51 那条 connector 侧缺陷是镜像关系，
   * 两边都必须把「传输断了」当作一条连接的终点。
   */
  #restartsNegotiation(frame: unknown, current: DevToolsPanelEndpoint): boolean {
    if (current.state !== 'v2' && current.state !== 'v1-facade') return false;
    return isDevToolsMessage(frame) && frame.direction === 'page-to-devtools' && frame.type === 'HANDSHAKE';
  }

  private teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.endpoint?.dispose();
    this.endpoint = null;
    this.state.set(null);
  }
}
