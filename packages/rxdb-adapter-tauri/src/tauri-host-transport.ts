/**
 * Tauri 侧的 {@link DesktopHostTransport} 实现（US-210）。
 *
 * @remarks
 * `invoke` 与 `listen` 由调用方注入，本包因此**不依赖 `@tauri-apps/api`**——
 * 与 Electron 那侧把 window 收窄成 `DesktopChangeEventTarget` 是同一手法：
 * 依赖注在边界上，包本体就能同时打进浏览器预览和 Tauri WebView。
 *
 * 与 Electron 传输层的唯一实质差别是**编码**：Tauri 的 IPC 是 JSON，
 * 协议里的 `bigint` / `Uint8Array` / `Date` 过不去，因此进出各加一层
 * {@link ./desktop-json-codec.js | 标签编码}。协议本身没变，`DESKTOP_HOST_PROTOCOL_VERSION` 仍是 1。
 *
 * @module tauri-host-transport
 */

import { RxDBAdapterDesktopError, type DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { decodeDesktopJsonPayload, encodeDesktopJsonPayload } from './desktop-json-codec.js';

/**
 * Rust 侧 `#[tauri::command]` 的名字。
 *
 * @remarks
 * `generate_handler!` 注册的应用自定义命令不受 capability 门禁约束，
 * 因此接上桌面数据库**不需要**给应用授予 `sql` / `fs` / `shell` 任何插件权限（AC#1）。
 */
export const TAURI_DESKTOP_REQUEST_COMMAND = 'rxdb_desktop_request';

/** host 推送变更事件所用的 Tauri 事件名。 */
export const TAURI_DESKTOP_CHANGE_EVENT = 'rxdb-desktop-change';

/**
 * 宿主命令自身 panic 时，Rust 侧 `rxdb_desktop_request` reject 的消息前缀。
 *
 * @remarks
 * 这是**本包自己写下的**文案（`rust/src/commands.rs` 的 `HOST_PANIC_PREFIX`），
 * 因此可以拿来分类；`invoke` 的其余 reject 来自 Tauri 的 IPC 层（命令未注册、
 * capability 不许、参数序列化失败），它们的文案是 Tauri 的实现细节，匹配不得。
 *
 * 两个常量之间唯一的机械联系是 Rust 侧的 `host_panic_prefix_matches_the_renderer_contract`，
 * 改一侧忘了改另一侧时那条用例会红。
 */
export const TAURI_DESKTOP_HOST_PANIC_PREFIX = 'rxdb desktop host panicked: ';

/** {@link createTauriHostTransport} 的依赖注入点。 */
export interface TauriHostTransportOptions {
  /**
   * Tauri 的命令调用函数，通常是 `@tauri-apps/api/core` 的 `invoke`。
   *
   * @param command - 命令名
   * @param args - 命令参数
   * @returns 命令返回值（JSON 形状）
   */
  readonly invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
  /**
   * Tauri 的事件订阅函数，通常是 `@tauri-apps/api/event` 的 `listen`。
   *
   * @param event - 事件名
   * @param handler - 事件回调
   * @param options - 订阅选项；本传输层只用 `target`，见 {@link TauriHostTransportOptions.target}
   * @returns 解除订阅的函数
   */
  readonly listen: (
    event: string,
    handler: (event: { payload: unknown }) => void,
    options?: { readonly target?: string }
  ) => Promise<() => void>;
  /**
   * 本 WebView 所在窗口的 label，通常是 `getCurrentWebviewWindow().label`。
   *
   * @remarks
   * **这是定向投递的另一半，不是可选的调优项。** Rust 侧用 `emit_to(owner)` 只把变更事件
   * 发给开出该会话的窗口，但 tauri 的 `match_any_or_filter` 在监听者 target 为 `Any` 时
   * **无条件匹配**任何 `emit_to`——而 `@tauri-apps/api` 的 `listen()` 默认正是 `{ kind: 'Any' }`。
   * 不带 target 注册，任何能调用 `listen` 的 webview（只需 `core:event:allow-listen`）
   * 都会收到所有窗口的 sessionId、库名、表名与 rowIds。
   *
   * 故意**必填**而不是省略时退回全局订阅：那种默认是「未配置即全放行」，
   * 而这正是本仓库不接受的兜底形态。注入 `getCurrentWebviewWindow().listen` 的调用方
   * 已经自带 `{ kind: 'Webview', label }`，那份 `listen` 会忽略本字段，填上也无害。
   */
  readonly target: string;
  /**
   * 变更事件通道出问题时的回调，覆盖注册失败与送达失败两种。
   *
   * @remarks
   * 省略时错误会被抛进全局错误处理器。**不能悄悄吞掉**：变更事件不通意味着
   * 响应式查询永远不刷新，在 UI 上表现为「数据没变」——所有故障形态里最难查的一种。
   *
   * 实现**不应抛出**：它是从 Tauri 的事件回调里同步调用的，抛出去无人接管。
   *
   * @param error - `listen` 注册失败的原因，或某条推送解码 / 分发失败的原因
   */
  readonly onListenError?: (error: unknown) => void;
}

/**
 * 用 Tauri 的 `invoke` / `listen` 组装一条桌面 host 传输层。
 *
 * @remarks
 * 事件订阅是**惰性且共享**的：第一个订阅者到来时才 `listen` 一次，之后所有订阅者
 * 复用同一条通道，最后一个退订时再解除。多个 `DesktopSqliteClient` 共享一条传输层，
 * 每条消息带 `sessionId`，各客户端自己对号入座。
 *
 * `listen` 是异步的，而 `DesktopHostTransport.subscribe` 必须同步返回退订函数。
 * 桥接办法是先把回调放进本地集合、再去注册：注册落定前到达的退订不会漏，
 * 因为落定时会重新检查集合是否已空。
 *
 * @param options - 注入的 Tauri API 与错误回调
 * @returns 可直接交给 `RxDBAdapterTauri` 或 `DesktopSqliteClient.connect` 的传输层
 */
export function createTauriHostTransport(options: TauriHostTransportOptions): DesktopHostTransport {
  const listeners = new Set<(message: unknown) => void>();
  let unlisten: (() => void) | undefined;
  let starting: Promise<void> | undefined;
  /**
   * 最近一次订阅触发的注册结果，暴露给 {@link DesktopHostTransport.subscriptionReady}。
   *
   * @remarks
   * 与 `starting` 分开是因为两者生命周期不同：`starting` 在退订收摊或注册失败时被清掉，
   * 好让下一个订阅者重新注册；而等待方要看的是**上一次注册到底成没成**，
   * 所以这份引用必须留着，直到下一次 `subscribe()` 覆盖它。
   *
   * 还没有人订阅过时通道本来就不需要建，语义上即「已就绪」。
   */
  let ready: Promise<void> = Promise.resolve();

  const reportListenError = (error: unknown): void => {
    if (options.onListenError) {
      options.onListenError(error);
      return;
    }
    queueMicrotask(() => {
      throw error;
    });
  };

  const stopListening = (): void => {
    const stop = unlisten;
    unlisten = undefined;
    starting = undefined;
    stop?.();
  };

  /**
   * 解码一条推送并扇出给所有订阅者。
   *
   * @remarks
   * 本函数跑在 Tauri `listen` 的回调里，**不能让异常逃出去**：Tauri 从自己的事件分发器
   * 调用回调，抛上去既没有 try/catch 接、也不落在任何 promise 链上，故障于是彻底无痕。
   * 解码失败（host 发来不合协议的负载）和订阅者自身抛出（`parseDesktopHostChangeEvent`
   * 拒绝事件、或业务 handler 出错）都走 {@link TauriHostTransportOptions.onListenError}，
   * 与 host 侧 `postChange` 失败走 `onDeliveryError` 是同一手法。
   *
   * 每个订阅者单独包一层：多个 `DesktopSqliteClient` 共享一条通道，一个客户端出错
   * 不该让排在它后面的客户端收不到这条变更——那会表现为「某个库的响应式查询不刷新」。
   */
  const deliver = (payload: unknown): void => {
    let message: unknown;
    try {
      message = decodeDesktopJsonPayload(payload);
    } catch (error) {
      reportListenError(error);
      return;
    }
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        reportListenError(error);
      }
    }
  };

  /**
   * 惰性建立共享通道，并把本次注册的结果交出去。
   *
   * @returns 注册落定的 Promise；失败时以 `listen` 的原始原因 reject
   */
  const startListening = (): Promise<void> => {
    starting ??= options
      .listen(TAURI_DESKTOP_CHANGE_EVENT, event => deliver(event.payload), { target: options.target })
      .then(stop => {
        unlisten = stop;
        // 注册期间订阅者可能已经全退了；这时立刻收摊，别留一条没人听的通道。
        if (listeners.size === 0) stopListening();
      })
      .catch(error => {
        // 清掉 starting，让下一个订阅者能重新注册，而不是永远卡在这次失败上。
        starting = undefined;
        reportListenError(error);
        throw error;
      });
    const attempt = starting;
    // 就绪状态没人等时不能变成 unhandled rejection——错误已经走过 onListenError 了。
    attempt.catch(() => undefined);
    return attempt;
  };

  return {
    async request(payload) {
      const response = await options
        .invoke(TAURI_DESKTOP_REQUEST_COMMAND, { payload: encodeDesktopJsonPayload(payload) })
        .catch((reason: unknown) => {
          throw asDesktopError(reason);
        });
      return decodeDesktopJsonPayload(response);
    },

    subscribe(listener) {
      listeners.add(listener);
      ready = startListening();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && unlisten) stopListening();
      };
    },

    subscriptionReady: () => ready
  };
}

/**
 * 把 `invoke` 的 reject 翻译成契约内的桌面错误。
 *
 * @remarks
 * 宿主**答得出来**的失败走的是正常返回值（`{ kind: 'error', code, message }`），
 * 由 `assertDesktopHostResponse` 还原成错误码。走到这里的只有「话没递到」或
 * 「递到了但宿主自己炸了」两种，此前它们原样透传成裸字符串，于是这两种最需要
 * 分支处理的故障反而是唯一拿不到 `code` 的——Electron 侧的
 * `resolveDesktopHostTransport()` 是真会抛 `host_unavailable` 的，两端因此不对称。
 *
 * 分类只认本包自己的 {@link TAURI_DESKTOP_HOST_PANIC_PREFIX}：命令未注册、capability
 * 不许、参数序列化失败这些都由 Tauri 的 IPC 层产生，文案属于它的实现细节，
 * 从 WebView 的角度也确实都是「拿不到宿主」。
 *
 * @param reason - `invoke` 的 reject 原因
 * @returns 带稳定错误码、并以 `cause` 原样保留 `reason` 的错误
 */
function asDesktopError(reason: unknown): RxDBAdapterDesktopError {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const code = detail.startsWith(TAURI_DESKTOP_HOST_PANIC_PREFIX) ? 'host_internal_error' : 'host_unavailable';
  return new RxDBAdapterDesktopError(code, `tauri command ${TAURI_DESKTOP_REQUEST_COMMAND} failed: ${detail}`, {
    cause: reason
  });
}
