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

  return {
    send(message) {
      const frame = message as { type?: unknown; payload?: { sessionId?: unknown } | null };
      if (frame.type === 'HANDSHAKE' && typeof frame.payload?.sessionId === 'string') {
        sessionId = frame.payload.sessionId;
      }
      void invoke('devtools_message', { payload: JSON.stringify(message) }).catch(error =>
        console.error('[RxDB DevTools] Failed to relay message', error)
      );
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
      void getCurrentWebviewWindow()
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
      void getCurrentWebviewWindow()
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
