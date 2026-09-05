/**
 * @fileoverview 在被检查页上装一个 v2 wire 的旁路：录下经过的帧，并能往 connector 里投一帧。
 *
 * @remarks
 * **为什么这是真实路径，不是后门。** connector 在浏览器/Electron 宿主下的传输就是 window 总线
 * （`packages/rxdb-devtools/src/connector-transport.ts` 的 `createWindowConnectorTransport`）：
 * 出站 v2 帧走 `window.postMessage`，入站只认 `event.source === window` 且同源的帧。content bridge
 * 把 background 转来的面板帧投到的正是同一条总线。所以本文件做的两件事——监听 `message`、
 * 往同一条总线投一帧——与真实链路用的是同一个入口，没有另开通道，也没有改产品代码。
 *
 * **为什么必须有它。** 两条 AC 的判据都要求「绕开 UI」：
 * - AC#49 要「**强制**发导出命令」，而面板的导出按钮是常量禁用的，UI 上根本没有这条出口；
 * - AC#51 要「投递 A 的消息给 B」，那是一帧只可能由伪造产生的旧身份帧。
 *
 * 两者都需要当前 session 的真实 `sessionId`。它只出现在 connector 发出的 v2 `HANDSHAKE` 上，
 * 而那一帧在**打开 DevTools 时**才发——所以录制器必须在 {@link attachPanel} 之前装好。
 *
 * 不走「在面板帧里再 `chrome.runtime.connect` 一个 Port」那条路：background 的路由是
 * `ports.get(tabId)`（`background-core.ts`），**一个 tab 只留一个面板 Port**，第二个会把
 * 真面板顶掉——测试于是改变了被测系统。
 *
 * @module devtools-wire-tap
 */

import { expect, Page } from '@playwright/test';

/**
 * v2 帧的 `source` 标记，与 `packages/rxdb-devtools/src/types.ts` 的 `RXDB_DEVTOOLS_MESSAGE` 一致。
 *
 * @remarks
 * 写死而不 import——与 `packaged-app.ts` / `devtools-restart-persistence.spec.ts` 里那些常量同一个
 * 理由：本项目的 `tsconfig.json` 设了 `rootDir: '.'`，从这里 import 工作区源码会 TS6059/TS6307。
 * 漂了不会静默放行：connector 的入站守卫会直接丢掉认不出的帧，于是
 * {@link awaitAnswer} 报「没有拿到任何应答」——一次带现场的红。
 */
const WIRE_SOURCE = '@aiao/rxdb-devtools';

/** v2 协议号，与 `packages/rxdb-devtools/src/v2/constants.ts` 的 `DEVTOOLS_PROTOCOL_VERSION_V2` 一致。 */
const WIRE_PROTOCOL_V2 = 2;

/** provider 领域，与 `provider/descriptor.ts` 的 `DEVTOOLS_PROVIDER_DOMAINS` 一致。 */
export type WireDomain = 'database' | 'files' | 'settings';

/** 一条 `panel-to-connector` 方向的 v2 帧。 */
export interface WireEnvelope {
  readonly source: string;
  readonly protocol: number;
  readonly direction: 'panel-to-connector';
  readonly type: 'REQUEST';
  readonly sessionId: string;
  readonly payload: {
    readonly requestId: string;
    readonly domain: WireDomain;
    readonly operation: string;
    readonly params: unknown;
  };
  readonly timestamp: number;
  readonly sequence: number;
}

/** 录制器挂在被检查页上的键。带前缀是为了在页面自己的全局里一眼可辨。 */
const TAP_KEY = '__RXDB_E2E_WIRE_TAP__';

/**
 * 录制器保留的最大帧数。
 *
 * @remarks
 * 事件订阅一开，EVENT 帧就会持续来；不封顶的话长跑用例会把页面内存吃光，
 * 而那种失败会以「渲染进程无响应」的形态出现，和被测缺陷混在一起。
 */
const TAP_LIMIT = 2000;

/** 录到的一帧。 */
export interface TappedFrame {
  readonly source?: string;
  readonly protocol?: number;
  readonly direction?: string;
  readonly type?: string;
  readonly sessionId?: string | null;
  readonly payload?: unknown;
}

/**
 * 在被检查页上装录制器。
 *
 * @param page - 被检查页（`app.firstWindow()`）。
 *
 * @remarks
 * **必须在打开 DevTools 之前调用**：`HANDSHAKE` 只发一次，晚装就永远录不到 `sessionId`。
 * 重复调用是幂等的——已经装过就不再装第二个监听器，否则每帧会被记两遍。
 */
export async function installWireTap(page: Page): Promise<void> {
  await page.evaluate(
    ([key, limit]) => {
      const scope = window as unknown as Record<string, unknown>;
      if (scope[key]) return;
      const frames: unknown[] = [];
      scope[key] = frames;
      window.addEventListener('message', event => {
        if (event.source !== window) return;
        const data = event.data as { source?: unknown } | null;
        if (data === null || typeof data !== 'object' || typeof data.source !== 'string') return;
        if (frames.length >= (limit as number)) frames.shift();
        frames.push(data);
      });
    },
    [TAP_KEY, TAP_LIMIT] as const
  );
}

/** 读回目前录到的全部帧。 */
export function readWireTap(page: Page): Promise<TappedFrame[]> {
  return page.evaluate(key => {
    const frames = (window as unknown as Record<string, unknown>)[key];
    return Array.isArray(frames) ? (JSON.parse(JSON.stringify(frames)) as TappedFrame[]) : [];
  }, TAP_KEY);
}

/** 清空录制缓冲；用在「换一个 session 之后只看新帧」的场合。 */
export function clearWireTap(page: Page): Promise<void> {
  return page.evaluate(key => {
    const frames = (window as unknown as Record<string, unknown>)[key];
    if (Array.isArray(frames)) frames.length = 0;
  }, TAP_KEY);
}

/**
 * 轮询录制缓冲直到出现满足条件的一帧。
 *
 * @param page - 被检查页。
 * @param match - 判定函数，在**测试进程**里跑（不进页面），因此可以用闭包。
 * @param budgetMs - 预算。
 * @returns 命中的那一帧；超时返回 `null`，由调用方带着现场断言。
 */
export async function waitForFrame(
  page: Page,
  match: (frame: TappedFrame) => boolean,
  budgetMs: number
): Promise<TappedFrame | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const hit = (await readWireTap(page)).find(match);
    if (hit) return hit;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return null;
}

/**
 * 等 connector 发出 v2 `HANDSHAKE` 并取出其中的 `sessionId`。
 *
 * @param page - 被检查页。
 * @param budgetMs - 预算。
 * @returns 本次 session 的 UUID v4。
 * @throws 预算内没等到握手时抛出，并带上录到的帧类型——「没握手」与「握手了但形状变了」
 *   是两种完全不同的故障，混成一句「读不到 sessionId」会让排查从头开始。
 */
export async function waitForSessionId(page: Page, budgetMs: number): Promise<string> {
  const handshake = await waitForFrame(
    page,
    frame =>
      frame.source === WIRE_SOURCE &&
      frame.protocol === WIRE_PROTOCOL_V2 &&
      frame.type === 'HANDSHAKE' &&
      typeof frame.sessionId === 'string',
    budgetMs
  );
  if (handshake?.sessionId == null) {
    // 带上 ERROR 的错误码：「没握上手」与「握手被某个具体原因拒了」是两个结论，
    // 只列类型的话前者会把后者盖掉，排查得从头再来一遍。
    const seen = (await readWireTap(page)).map(frame => {
      const code = (frame.payload as { error?: { code?: unknown } } | null)?.error?.code;
      return `${String(frame.protocol)}:${String(frame.type)}${typeof code === 'string' ? `(${code})` : ''}`;
    });
    throw new Error(`没有录到 v2 HANDSHAKE，因此拿不到 sessionId。录到的帧：${seen.join(', ') || '(空)'}`);
  }
  return handshake.sessionId;
}

/**
 * 把一帧投进 connector。
 *
 * @param page - 被检查页。
 * @param frame - 已构造好的 v2 帧。
 *
 * @remarks
 * `location.origin` 而不是 `'*'`：connector 的入站守卫会比对 origin，用通配等于放宽了被测约束。
 */
export async function postToConnector(page: Page, frame: WireEnvelope): Promise<void> {
  await page.evaluate(payload => {
    window.postMessage(JSON.parse(payload) as unknown, location.origin);
  }, JSON.stringify(frame));
}

/**
 * 构造一条 `REQUEST` 帧。
 *
 * @param sessionId - 目标 session；投旧 session 的 id 即构成一次身份伪造。
 * @param requestId - 请求 ID，由调用方决定，便于把应答对回来。
 * @param domain - provider 领域。
 * @param operation - 操作名；**允许传 descriptor 未声明的操作**，那正是 AC#49 的一半。
 * @param params - 操作参数；默认空对象。传越界数值即构成一次边界用例（AC#47）。
 * @returns 可直接交给 {@link postToConnector} 的帧。
 *
 * @remarks
 * `direction` 写死为 `panel-to-connector`：v2 把方向钉在协议里（`DEVTOOLS_V2_MESSAGE_DIRECTIONS`），
 * `REQUEST` 只有这一个合法方向，中继据此挡反向注入。
 *
 * `sequence` 取一个单调的当前时刻即可——connector 端点不校验入站序号（它只为自己发出的帧生成
 * 序号，见 `v2/endpoint.ts` 的 `SequenceGenerator`），这里给一个合法的非负整数就够了。
 */
export function requestFrame(
  sessionId: string,
  requestId: string,
  domain: WireDomain,
  operation: string,
  params: unknown = {}
): WireEnvelope {
  return {
    source: WIRE_SOURCE,
    protocol: WIRE_PROTOCOL_V2,
    direction: 'panel-to-connector',
    type: 'REQUEST',
    sessionId,
    payload: { requestId, domain, operation, params },
    timestamp: Date.now(),
    sequence: Date.now() % 1_000_000
  };
}

/**
 * 等某条请求的应答（`RESPONSE` 或 `ERROR`），并把错误码抽出来。
 *
 * @param page - 被检查页。
 * @param requestId - 要等的请求 ID。
 * @param budgetMs - 预算。
 * @returns `{ type, code }`：成功时 `code` 为 `null`。
 * @throws 预算内没有任何应答时抛出——「拒绝了」和「石沉大海」是两个结论，不能合并。
 */
export async function awaitAnswer(
  page: Page,
  requestId: string,
  budgetMs: number
): Promise<{ type: string; code: string | null }> {
  const answered = await waitForFrame(
    page,
    frame => {
      if (frame.type !== 'RESPONSE' && frame.type !== 'ERROR') return false;
      const payload = frame.payload as { requestId?: unknown } | null;
      return payload !== null && typeof payload === 'object' && payload.requestId === requestId;
    },
    budgetMs
  );
  expect(answered, `请求 ${requestId} 在 ${String(budgetMs)}ms 内没有拿到任何应答`).not.toBeNull();

  const payload = answered?.payload as { error?: { code?: unknown } } | undefined;
  const code = typeof payload?.error?.code === 'string' ? payload.error.code : null;
  return { type: String(answered?.type), code };
}
