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
  /** 每一轮握手读到的 session id，按发生顺序；没握上手时为空数组。 */
  readonly sessionIds: string[];
  /** 是否在预算内看到了 `HANDSHAKE_ACK`。 */
  readonly handshakeCompleted: boolean;
  /** 冒名窗口活着期间被中继按 label 拒掉的帧数（AC#3）。 */
  readonly relayRejected: number;
  /** 调试窗口里的 wire 驱动跑出来的结论（阶段 2）；没装驱动或没跑完时缺席。 */
  readonly native?: DevToolsNativeProbeResult;
}

/**
 * 真实双窗口链路上的 wire 结论（US-905 阶段 2），与 `selfcheck.rs` 的
 * `DevToolsNativeProbe` 逐字对应。
 *
 * @remarks
 * 全是**结果码**不是数据：判据要的是「这条操作在真实链路上答了什么」，而回显路径或字节
 * 会把诊断报告变成一条泄漏通道（AC#13 明写响应不得含这些）。
 */
export interface DevToolsNativeProbeResult {
  /** 驱动是否等到了握手；`false` 时其余字段无意义。 */
  readonly sessionSeen: boolean;
  /** `files.list` 的结果码。 */
  readonly filesList?: string;
  /** `files.list` 读到的条目数；`-1` 表示这次没读到结果。 */
  readonly filesEntryCount?: number;
  /**
   * 驱动动手之前，它留在盘上的那个目录是否**已经**在 `files.list` 的结果里（AC#15）。
   *
   * @remarks
   * 跨重启的判据就是它：同一个应用数据目录跑两次，第一次是 `false`、第二次是 `true`，
   * 而这条观察经的是真实 `invoke` → Rust 中继 → native host，不是 e2e 自己去看磁盘。
   * 只有**第一遍**驱动的这个值有意义，见 {@link DevToolsHandshakeWatcher.waitForNative}。
   */
  readonly keptDirSeen?: boolean;
  /** `database.query` 的结果码（AC#9 的数据面一半）。 */
  readonly databaseQuery?: string;
  /**
   * 经 wire 读到的启动记录行数；`-1` 表示这次没读到结果。
   *
   * @remarks
   * 与报告里的 `launchCount` 对照：那一个是应用自己经 repository 数出来的，这一个是面板经
   * 真实 transport 数出来的。两者相等才说明面板看到的确实是同一份数据，而不是某个替身。
   */
  readonly launchRowCount?: number;
  /** 强制 `settings.export` 的结果码。 */
  readonly settingsExport?: string;
  /** 未声明的 `settings.clear` 的结果码。 */
  readonly settingsClear?: string;
  /** 伪造 session 的同一条请求的结果码。 */
  readonly forgedSession?: string;
  /** 新建目录的结果码；只读档下与「操作没声明」同码，判别力在磁盘上。 */
  readonly createDirectory?: string;
  /** 删除的结果码。 */
  readonly deleteEntry?: string;
  /** 驱动自身失败时的原因。 */
  readonly failure?: string | null;
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
 * 调试窗口里的 wire 驱动汇报结论用的事件名，与 `devtools_driver.js` 的 `RESULT_EVENT` 一致。
 *
 * @remarks
 * 与帧通道分开：驱动的结论不是协议帧，混进 `devtools:message` 会让 `panelFrameTypes`
 * 多出一个不存在的「帧类型」，而那份列表是 AC#2 的证据。
 */
const DRIVE_RESULT_EVENT = 'devtools:drive-result';

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
  listen: <T>(event: string, handler: (message: { payload: T }) => void) => Promise<() => void>;
}

/** 一帧 v2 信封里探针关心的两个字段。 */
interface PanelFrame {
  readonly type?: unknown;
  readonly payload?: { readonly sessionId?: unknown } | null;
}

/** 已经在收帧的观察者。 */
export interface DevToolsHandshakeWatcher {
  /**
   * 等到**再多一轮**握手完成，或预算耗尽。
   *
   * @param budgetMs - 预算，默认 {@link HANDSHAKE_BUDGET_MS}。
   * @returns 已经握上手的轮数（等于 `sessionIds.length`）。
   *
   * @remarks
   * 可以多次调用：AC#4 要先等第一轮，回收窗口，再等第二轮。
   */
  waitForHandshake: (budgetMs?: number) => Promise<number>;
  /**
   * 等调试窗口里的驱动汇报一次结论（阶段 2）。
   *
   * @param budgetMs - 预算，默认 {@link HANDSHAKE_BUDGET_MS}。
   * @returns **第一条**结论；一条都没有时退回最近一条阶段打点；连打点都没有为 `undefined`。
   *
   * @remarks
   * 驱动自己也有预算，且**等不到握手也会汇报**（`sessionSeen: false`）。所以这里等到
   * `undefined` 只有一个意思：驱动根本没装上——那与「装上了但没跑通」是两个结论。
   *
   * ## 为什么取第一条而不是最新一条
   *
   * 一个进程里驱动会跑**不止一遍**：探针为了 AC#4 把调试窗口关掉再以同 label 重开，
   * 而重开的那扇窗又带着同一份注入脚本。第二遍看到的世界已经被第一遍改过——
   * 「重启之后那个目录还在」与「本进程第一遍刚把它建出来」在第二遍眼里完全同形，
   * 于是 AC#15 的跨重启比对就没有判别力了。只有第一遍的前置条件是已知的
   * （这个进程还没碰过存储）。
   *
   * 退回打点**不是**在编一份默认值：那是仅有的一条真实观察，且带着 `stage:` 前缀，
   * 与结论分得很开。
   */
  waitForNative: (budgetMs?: number) => Promise<DevToolsNativeProbeResult | undefined>;
  /** 退订并交出快照。 */
  settle: () => DevToolsProbeResult;
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
  const sessionIds: string[] = [];
  // 每等一轮就换一个 resolver：AC#4 要连等两轮，共用一个 promise 的话第二轮会立刻返回。
  let arrived: (() => void) | undefined;

  // 只留**第一条结论**。理由见 `waitForNative` 的说明：后面几遍观察到的世界已经被前面几遍
  // 改过，它们的观察不是独立证据。
  let native: DevToolsNativeProbeResult | undefined;
  // 最近一条阶段打点，只在一条结论都没有时才顶上去（那时它是仅有的观察）。
  let beacon: DevToolsNativeProbeResult | undefined;
  let nativeArrived: (() => void) | undefined;
  const driveSubscription = surface.listen<DevToolsNativeProbeResult>(DRIVE_RESULT_EVENT, message => {
    if (isStageBeacon(message.payload)) {
      // 打点不结束等待：它也是一条汇报，先到先得的话等待会拿着 `stage:booted` 提前返回，
      // 而那份「结论」里每个字段都是 undefined——与「驱动压根没跑」长得一模一样。
      // 这条竞态实测发生过：同一份代码一次红一次绿。
      beacon = message.payload;
      return;
    }
    if (native !== undefined) return;
    native = message.payload;
    nativeArrived?.();
  });

  const subscription = surface.listen<string>(DEVTOOLS_EVENT, event => {
    // 中继原样透传的是一个 JSON 字符串（`TauriTransportService.postFrame` 里 stringify 的那份）。
    // 解不动就当作「这一帧不是 v2 信封」跳过——探针不替协议层做判定。
    const frame = parseFrame(event.payload);
    if (frame === null) return;
    const type = typeof frame.type === 'string' ? frame.type : null;
    if (type === null) return;
    if (!seen.includes(type)) seen.push(type);
    const candidate = frame.payload?.sessionId;
    // 同一个 session 的 ACK 只记一次：重连时面板可能重发，而 AC#4 数的是**不同身份**的轮数。
    if (type === 'HANDSHAKE_ACK' && typeof candidate === 'string' && !sessionIds.includes(candidate)) {
      sessionIds.push(candidate);
      arrived?.();
    }
  });

  return {
    waitForHandshake: async (budgetMs: number = HANDSHAKE_BUDGET_MS): Promise<number> => {
      // `wanted` **必须在任何 await 之前**算出来：它的语义是「比调用那一刻多一轮」。
      // 放在 `await subscription` 之后算的话，等待期间到达的那一轮会把基数一起抬高，
      // 于是这次等待永远等的是「再下一轮」——表征是第二轮稳定超时，而第一轮好好的。
      const wanted = sessionIds.length + 1;
      await subscription;
      const next = new Promise<void>(resolve => {
        arrived = () => {
          if (sessionIds.length >= wanted) resolve();
        };
        // 订阅落定与装上 resolver 之间也可能到帧，所以立刻自查一次。
        arrived();
      });
      await Promise.race([next, delay(budgetMs)]);
      arrived = undefined;
      return sessionIds.length;
    },
    waitForNative: async (budgetMs: number = HANDSHAKE_BUDGET_MS): Promise<DevToolsNativeProbeResult | undefined> => {
      await driveSubscription;
      if (native === undefined) {
        const arrival = new Promise<void>(resolve => {
          nativeArrived = resolve;
        });
        await Promise.race([arrival, delay(budgetMs)]);
        nativeArrived = undefined;
      }
      return native ?? beacon;
    },
    settle: (): DevToolsProbeResult => {
      void subscription.then(unlisten => unlisten());
      void driveSubscription.then(unlisten => unlisten());
      // `relayRejected` 由调用方在拿到冒名窗口探测结果后补上：那件事发生在观察者之外。
      return {
        panelFrameTypes: [...seen],
        sessionIds: [...sessionIds],
        handshakeCompleted: sessionIds.length > 0,
        relayRejected: 0,
        native: native ?? beacon
      };
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

/**
 * 这条汇报是不是阶段打点而非结论。
 *
 * @param result - 驱动送来的一条汇报。
 * @returns 是打点时为 `true`。
 *
 * @remarks
 * 打点复用 `failure` 字段（前缀 `stage:`）而不是另加一个键：报告 schema 因此不必为
 * 调试设施多开一格，而跑通时这个字段本来就是 `null`。
 */
const isStageBeacon = (result: DevToolsNativeProbeResult): boolean =>
  typeof result.failure === 'string' && result.failure.startsWith('stage:');

/** 到点即 resolve 的计时器。 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
