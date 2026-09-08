import {
  DEVTOOLS_PROTOCOL_VERSION_V2,
  RXDB_DEVTOOLS_MESSAGE,
  type DevToolsConnectorTransport
} from '@aiao/rxdb-devtools';
import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

/**
 * {@link DevToolsConnectorTransport} 的 Tauri 实现：主 WebView connector 侧。
 *
 * @remarks
 * 与面板侧的 `TauriTransportService` 走同一条 Rust 中继（`devtools_message` 命令 +
 * `devtools:message` 事件），只是这里在**被检查页**（`main` 窗口）这一端：connector 发帧 →
 * Rust 按窗口 label 转发给 `rxdb-devtools` 窗口；面板发帧 → Rust 转发回这里。
 *
 * 无私有端口：Tauri 没有 `MessageChannel`，握手不随附端口。隔离由 Rust 按窗口 label 路由
 * 提供——`createSessionPort` 恒返 `undefined`，`closeSessionPort` 是空操作。代价是 v1 的
 * 握手后命令（`QUERY_ENTITY` 等）没有私有信道可走；阶段 1 走 v2 数据面不受影响，v1 facade
 * 的这条限制随「是否要为 Tauri 补 v1 命令面」另行决策。
 */
export function createTauriConnectorTransport(): DevToolsConnectorTransport {
  let unlisten: UnlistenFn | null = null;
  let unlistenPeerGone: UnlistenFn | null = null;
  let disposed = false;
  // 本次会话的身份，从**自己发出去的** v2 HANDSHAKE 上记下来。
  // 调试窗口没了的时候要用它造一条 DISCONNECT，见下面 `devtools:peer-gone` 的订阅。
  let sessionId: string | null = null;
  // 出站闸门：入站监听登记完成之前，一帧都不出门。未 `subscribe` 时是一个已 settle 的
  // promise，行为与直接发出去只差一个微任务。理由见 `send`。
  let inboundReady: Promise<unknown> = Promise.resolve();

  return {
    /**
     * @remarks
     * # 为什么要等入站监听登记完才发
     *
     * `listen()` 是一条 IPC 往返（`plugin:event|listen`），登记落定**之前** Rust 侧的
     * `emit_to("main", …)` 找不到本窗口的监听者，那一帧就地丢掉——Tauri 的事件不重放。
     *
     * connector 的第一条出站帧是 eager legacy `HANDSHAKE`，而它触发的正是对端的应答：
     * 面板收到握手就补发 `PROTOCOL_HELLO` 并开启 1,000 ms 决策窗口。所以不设闸门时，
     * 「握手已出门、监听还没登记」这段空窗里到达的那条 HELLO 会被丢掉，connector 于是
     * 永远不发 v2 要约，面板窗口到期落进**终态** `v1-facade`——两端就此各说各话：
     * connector 停在 `offered` 等一条永不到来的 ACK，面板走 v1 车道，v2 数据面（`files` /
     * `database` / 传输）全线不可用，且一个进程内不再有任何恢复路径。
     *
     * 空窗有多宽由**对端**的往返决定，不由本端：面板那条应答走的是「Rust → 面板窗口 →
     * 面板 JS → Rust → 本窗口」，与本端 `listen()` 的登记是两条互不相干的赛道。开发机上
     * 本端总是先到，CI 机器一忙就未必——2026-09-09 `devtools-smoke` 的那条红即是（表征是
     * `sessionIds: []` + `panelFrameTypes` 里那条**不带 session** 的 legacy `HANDSHAKE_ACK`）。
     * 把 `listen()` 的登记人为推后 1,500 ms 可以稳定复现同一份报告。
     *
     * 闸门只推迟出站，不改变顺序：所有 `send` 挂在**同一个** promise 上，`.then` 回调按注册
     * 先后执行，因此 eager legacy 握手仍是第一条出门的帧（negotiation-connector 的前提）。
     *
     * 登记失败时闸门照样放行（`subscribe` 里那个 `catch`）：发不出去只会把「监听挂了」
     * 变成第二种沉默，而那条错误已经单独打过日志了。
     */
    send(message) {
      const frame = message as { type?: unknown; payload?: { sessionId?: unknown } | null };
      if (frame.type === 'HANDSHAKE' && typeof frame.payload?.sessionId === 'string') {
        sessionId = frame.payload.sessionId;
      }
      // 序列化在闸门**之前**：闸门后才 stringify 的话，送出去的是调用方在这段等待里
      // 可能已经改过的那个对象，而不是 `send` 那一刻的那一帧。
      const payload = JSON.stringify(message);
      void inboundReady
        .then(() => invoke('devtools_message', { payload }))
        .catch(error => console.error('[RxDB DevTools] Failed to relay message', error));
    },

    subscribe(callback) {
      disposed = false;
      // listen 是异步注册：退订可能在注册完成前就来了（init 后立刻 disconnect），
      // 用一个 flag 兜住「注册落定后发现已退订」的竞态。
      // **必须**是 `getCurrentWebviewWindow().listen` 而不是全局 `listen`。
      // 全局 `listen` 注册的监听 target 是 `EventTarget::Any`，而 Tauri 的投递过滤是
      // `match_any_or_filter`（tauri 2.11.2 `event/listener.rs:286`）——`Any` 监听**无视**过滤器，
      // 每一帧都收得到，包括本窗口自己刚发出去的那些。Rust 侧的 `emit_to` 只解决了一半，
      // 另一半在这里：监听必须绑定到本窗口 label 上，定向投递才真的成立。
      const frames = getCurrentWebviewWindow()
        .listen<string>('devtools:message', event => callback(JSON.parse(event.payload)))
        .then(fn => {
          if (disposed) {
            fn();
            return;
          }
          unlisten = fn;
        });
      // US-905 AC#4/#5：调试窗口销毁时 Rust 发一条**不带 payload** 的讣告，这里把它翻译成
      // 一帧 v2 `DISCONNECT` 交给 connector——只有这样它才会关掉当前 session 并换一个新端点，
      // 下一个（同 label 重开的）面板才协商得上。
      //
      // 为什么由**这一侧**造这帧：中继按设计不解释 payload，Rust 手上没有 session 身份；
      // 而调试窗口此刻已经不存在、不可能自己发讣告。页内 transport 是唯一同时知道
      // 「对端没了」与「这次 session 是谁」的地方。它与「`HANDSHAKE_ACK` 归面板独有」
      // 那条禁令不冲突：ACK 是协议决定，`DISCONNECT` 是传输事实，且方向本就是 `both`。
      const peerGone = getCurrentWebviewWindow()
        .listen('devtools:peer-gone', () => {
          if (sessionId === null) return;
          callback({
            source: RXDB_DEVTOOLS_MESSAGE,
            protocol: DEVTOOLS_PROTOCOL_VERSION_V2,
            direction: 'panel-to-connector',
            type: 'DISCONNECT',
            sessionId,
            payload: null,
            timestamp: Date.now(),
            sequence: 0
          });
          sessionId = null;
        })
        .then(fn => {
          if (disposed) {
            fn();
            return;
          }
          unlistenPeerGone = fn;
        });

      // 闸门：两条监听都登记落定才放出站帧。讣告那条一起等，是因为它与帧信道同属
      // 「这个 transport 的入站面」——分开放行只会多出一个「哪一条已经就绪」的状态。
      inboundReady = Promise.all([frames, peerGone]).catch(error => {
        console.error('[RxDB DevTools] Failed to register inbound listeners', error);
      });

      return () => {
        disposed = true;
        unlisten?.();
        unlisten = null;
        unlistenPeerGone?.();
        unlistenPeerGone = null;
      };
    },

    createSessionPort() {
      return undefined;
    },

    closeSessionPort() {
      // 无端口可关。
    }
  };
}
