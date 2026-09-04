/**
 * @fileoverview 主 WebView 侧的 DevTools 握手探针（US-905 阶段 1 AC#1 / AC#2）。
 *
 * @module devtools-probe
 */

/**
 * 探针结果，与 `src-tauri/src/selfcheck.rs` 的 `DevToolsProbe`
 * （serde `rename_all = "camelCase"`）逐字对应。
 *
 * @remarks
 * 字段名漂了的表现是 serde 反序列化失败 → `invoke` 被拒 → 没有报告 → 只能等 60s 看门狗，
 * 与 `SelfCheckOutcome` 上那条注释同一个坑。Rust 侧有一条单测把这份形状钉住。
 */
export interface DevToolsProbeResult {
  /** 调试窗口发过来的 v2 帧类型，按首次出现排序、已去重。 */
  readonly panelFrameTypes: string[];
  /** 从 `HANDSHAKE_ACK` 里读到的 session id；没握上手时为 `null`。 */
  readonly sessionId: string | null;
  /** 是否在预算内看到了 `HANDSHAKE_ACK`。 */
  readonly handshakeCompleted: boolean;
}

/**
 * Rust 中继投递到本窗口的事件名，与 `lib.rs` 的 `devtools_message` 里
 * `target.emit("devtools:message", …)` 一致。
 *
 * @remarks
 * 写死而不从 transport 里 import：探针订阅的是**与 connector 并列**的一条独立监听，
 * 借 transport 的常量会让人以为探针复用了它的状态。
 */
const DEVTOOLS_EVENT = 'devtools:message';

/**
 * 等握手的预算。
 *
 * @remarks
 * 必须**明显小于** `selfcheck.rs` 的 60s 看门狗：探针耗满预算只是「这次没握上手」，
 * 应当照常出一份写着 `handshakeCompleted: false` 的报告；让它把看门狗拖到期的话，
 * 拿到的是一份 `timedOut`，而那与「前端整个挂死」无法区分。
 */
const HANDSHAKE_BUDGET_MS = 20_000;

/** `listen()` 的最小接口；参数化是为了让单测不必起一个真实 Tauri 运行时。 */
export interface DevToolsEventSurface {
  listen: (event: string, handler: (payload: { payload: string }) => void) => Promise<() => void>;
}

/** 一帧 v2 信封里探针关心的两个字段。 */
interface PanelFrame {
  readonly type?: unknown;
  readonly payload?: { readonly sessionId?: unknown } | null;
}

/** 已经在收帧的观察者。 */
export interface DevToolsHandshakeWatcher {
  /**
   * 等到握手完成或预算耗尽，退订并交出快照。
   *
   * @param budgetMs - 预算，默认 {@link HANDSHAKE_BUDGET_MS}。
   */
  settle: (budgetMs?: number) => Promise<DevToolsProbeResult>;
}

/**
 * **立刻**开始收调试窗口发过来的帧。
 *
 * @param surface - 事件订阅面（生产调用传 `@tauri-apps/api/event` 的 `listen`）。
 * @returns 观察者；调用方在需要结果的时刻再 {@link DevToolsHandshakeWatcher.settle}。
 *
 * @remarks
 * ## 为什么必须「先订阅、后等待」而不是到点才订阅
 *
 * **实测踩过**：探针原本排在启动链最后，等到它调用 `listen()` 时握手早已结束——而 Tauri 的
 * 事件不重放，于是主窗口一帧都收不到，报告里是 `panelFrameTypes: []`。那个失败形态与
 * 「调试窗口根本没建起来」完全一样，极易误判。
 *
 * 调试窗口是 Rust 在 `setup()` 里与主窗口一起建的，它的面板什么时候完成协商，与主窗口这边
 * 建库多快没有任何关系。所以订阅必须发生在**应用 bootstrap 的最早处**，等待才放在启动链末尾。
 *
 * ## 为什么订阅的是与 connector 同一条事件
 *
 * Rust 中继按窗口 label 定向投递：调试窗口发出的帧被 `emit` 到 `main`。所以主 WebView 上
 * 挂一个监听，看到的就是**调试窗口经真实 Rust 中继送达的原帧**——不是 connector 的内部状态，
 * 也不是某个替身。收到 `HANDSHAKE_ACK` 一次性证明四件事：调试窗口真的建起来了、
 * 它加载的是共享面板、面板协商到了 v2、帧走完了真实中继。
 *
 * 不去读 connector 的状态：那需要它暴露一个只为测试存在的观察口，而这条监听用的是 Tauri
 * 的公开事件 API，产品代码一行不动。
 */
export const watchDevToolsHandshake = (surface: DevToolsEventSurface): DevToolsHandshakeWatcher => {
  const seen: string[] = [];
  let sessionId: string | null = null;
  let settleHandshake: (() => void) | undefined;
  const handshake = new Promise<void>(resolve => {
    settleHandshake = resolve;
  });

  const subscription = surface.listen(DEVTOOLS_EVENT, event => {
    // 中继原样透传的是一个 JSON 字符串（`TauriTransportService.postFrame` 里 stringify 的那份）。
    // 解不动就当作「这一帧不是 v2 信封」跳过——探针不替协议层做判定。
    const frame = parseFrame(event.payload);
    if (frame === null) return;
    const type = typeof frame.type === 'string' ? frame.type : null;
    if (type === null) return;
    if (!seen.includes(type)) seen.push(type);
    const candidate = frame.payload?.sessionId;
    if (type === 'HANDSHAKE_ACK' && typeof candidate === 'string') {
      sessionId = candidate;
      settleHandshake?.();
    }
  });

  return {
    settle: async (budgetMs: number = HANDSHAKE_BUDGET_MS): Promise<DevToolsProbeResult> => {
      const unlisten = await subscription;
      try {
        await Promise.race([handshake, delay(budgetMs)]);
      } finally {
        unlisten();
      }
      return { panelFrameTypes: [...seen], sessionId, handshakeCompleted: sessionId !== null };
    }
  };
};

/** 解析中继投来的 JSON 字符串；不是对象就返回 `null`。 */
function parseFrame(raw: string): PanelFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as PanelFrame) : null;
  } catch {
    return null;
  }
}

/** 到点即 resolve 的计时器。 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
