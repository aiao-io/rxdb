/**
 * @fileoverview 把**真实的** Chrome 中继逻辑装进 conformance driver 的中间两段。
 *
 * @remarks
 * US-904 AC#44 要求 Chrome 与 fake native driver 跑**同一份** conformance，且
 * 「fixture、状态机和错误断言没有平台副本」。这里因此只提供两样东西：
 *
 * 1. `background` 段 = 真实的 {@link createBackgroundController}；
 * 2. `content` 段 = 真实的 `bridge-core` 三个转发函数。
 *
 * 时钟、探针、scenario 旋钮、排空策略与两端端点全部沿用 `@aiao/rxdb-devtools/testing`
 * 的同一份装配 —— 不是靠约定不复制，是结构上没地方复制。
 *
 * **这里模拟了什么、没模拟什么，必须说清楚。** 被测的是中继的**判定与路由逻辑**：
 * 谁转发、往哪转、谁被丢弃、谁不该被自造。没有被测的是 Chrome 的**传输实现**本身 ——
 * `chrome.runtime.connect` 的真实 Port、`chrome.tabs.sendMessage` 的跨进程投递、
 * service worker 的休眠与重启、页面刷新。它们要真扩展 + 真浏览器才能观测，
 * 属于 AC#38 / #39 的 e2e，不在本文件的射程内。把这里叫做「真实 Port」是不诚实的。
 *
 * @module apps/rxdb-devtools-extension/testing/chrome-relay-nodes
 */

import type { FakeRelayNode, JsonDriverNodeFactory, JsonDriverNodes } from '@aiao/rxdb-devtools/testing';
import { RXDB_DEVTOOLS_MESSAGE } from '@modules/rxdb-devtools-panel/wire';
import { createBackgroundController, type BackgroundPort } from '../background/background-core';
import { forwardExtensionMessage, forwardPageMessage } from '../content/bridge-core';

/** 被调试页面的 origin；content 段的来源校验以它为准。 */
const PAGE_ORIGIN = 'https://conformance.test';

/** 被调试 tab 的标识；panel 在 INIT 里绑定的就是它。 */
const INSPECTED_TAB_ID = 7;

/**
 * 原文台账：解析出来的对象 → 它来自的那一帧原文。
 *
 * @remarks
 * 中继必须**逐字节原样**转发，不能「解析再重新序列化」：后者会把非规范 JSON 悄悄改写成规范
 * JSON，于是 wire hygiene 的往返判据在这条链路上恒真 —— 一个会破坏字节的中继照样能绿。
 *
 * 用 WeakMap 而不是一个「当前帧」变量，是因为真实 background 会把转发挂在注入 promise 上
 * （`activation.then(forward)`）：等续体跑到时，「当前帧」早就是下一帧了。
 */
type FrameLedger = WeakMap<object, string>;

/** 解析一帧并记账；不可解析时返回 `undefined`（等价于「不是本协议的帧」）。 */
function parseFrame(ledger: FrameLedger, frame: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    return undefined;
  }
  if (typeof parsed === 'object' && parsed !== null) ledger.set(parsed, frame);
  return parsed;
}

/**
 * 取回一条消息对应的原文。
 *
 * @remarks
 * 两条路径都是真的，不是兜底：**转发**的帧一定在台账里（刚被 {@link parseFrame} 记过），
 * **中继自造**的帧一定不在 —— 后者在整条链路上只有一条，就是 background 注入完成后的
 * 存活探针 PING（见 `background-core` 的 `pingMessage`）。
 */
function frameOf(ledger: FrameLedger, message: unknown): string {
  if (typeof message === 'object' && message !== null) {
    const original = ledger.get(message);
    if (original !== undefined) return original;
  }
  return JSON.stringify(message);
}

/**
 * panel 在建立 Port 时发出的 INIT。
 *
 * @remarks
 * INIT 是 **Chrome 传输层**的消息（面板的 `PortService` 产出，绑定 inspected tab），
 * 不是 v2 协议的一部分；共享的 panel 端点因此不知道它，也不该知道。
 * 由这个平台适配层代为发出，正是「传输差异住在 driver 里、协议住在 suite 里」的分界。
 *
 * 它不跨任何一跳：真实系统里 INIT 也只走 panel ↔ background 这条 Port，不下页面。
 */
function initMessage(): unknown {
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction: 'devtools-to-page',
    type: 'INIT',
    payload: null,
    timestamp: 0,
    sequence: 0,
    tabId: INSPECTED_TAB_ID
  };
}

/**
 * 真实 background service worker 段。
 *
 * @param forward - 把帧送往下一跳。
 * @returns 收帧回调。
 */
function createBackgroundNode(forward: FakeRelayNode): FakeRelayNode {
  const ledger: FrameLedger = new WeakMap();
  const listeners: ((message: unknown) => void)[] = [];

  const port: BackgroundPort = {
    name: 'rxdb-devtools-panel',
    postMessage: message => {
      forward(frameOf(ledger, message), 'connector-to-panel');
    },
    onMessage: { addListener: listener => listeners.push(listener) },
    onDisconnect: { addListener: () => undefined }
  };

  const controller = createBackgroundController({
    injectIntoTab: () => Promise.resolve(),
    sendToTab: (_tabId, message) => {
      forward(frameOf(ledger, message), 'panel-to-connector');
      return Promise.resolve();
    },
    // 不吞：中继内部的失败若只记不抛，整条链路会退化成「静默丢弃」，
    // 而静默丢弃恰好让「被拒调用为 0」类断言恒真。
    onError: (label, error) => {
      throw new Error(`chrome relay: background reported ${label}`, { cause: error });
    }
  });

  controller.connect(port);

  // `connect` 对名字不符的 port 是静默返回的。没拿到监听器就当场抛：否则整条下行链路
  // 只是「什么都不发生」，而 conformance 会把它报成一堆协商超时，离真正的原因很远。
  const deliverFromPanel = listeners[0];
  if (deliverFromPanel === undefined) {
    throw new Error('chrome relay: background controller refused the panel port');
  }
  deliverFromPanel(initMessage());

  return (frame, direction) => {
    const message = parseFrame(ledger, frame);
    if (direction === 'panel-to-connector') {
      deliverFromPanel(message);
      return;
    }
    controller.receiveContent(message, INSPECTED_TAB_ID);
  };
}

/**
 * 真实 content script 段。
 *
 * @remarks
 * 上行走 `forwardPageMessage`（window 总线）而不是 `forwardPortMessage`（私有 MessagePort）：
 * 共享的 connector 端点只产出 JSON 文本，不 transfer 端口，真实 bridge 在这种对端下走的
 * 也正是总线这条路。私有端口的采纳由 `bridge.spec.ts` 单独覆盖。
 *
 * @param forward - 把帧送往下一跳。
 * @returns 收帧回调。
 */
function createContentNode(forward: FakeRelayNode): FakeRelayNode {
  const ledger: FrameLedger = new WeakMap();
  // 只需要 `location.origin` 与身份比较：`forwardPageMessage` 用到的就这两样。
  const pageWindow = { location: { origin: PAGE_ORIGIN } } as unknown as Window;

  return (frame, direction) => {
    const data = parseFrame(ledger, frame);
    if (direction === 'panel-to-connector') {
      forwardExtensionMessage(data, PAGE_ORIGIN, message => {
        forward(frameOf(ledger, message), 'panel-to-connector');
      });
      return;
    }
    const event = { source: pageWindow, origin: PAGE_ORIGIN, data } as unknown as MessageEvent;
    forwardPageMessage(event, pageWindow, message => {
      forward(frameOf(ledger, message), 'connector-to-panel');
    });
  };
}

/**
 * 跨一个宏任务，把此刻排在微任务队列上的续体全部放行。
 *
 * @remarks
 * 用宏任务而不是数几个 `Promise.resolve()`：要等的是 `activation.then().catch().finally()`
 * 这条三节链，数 tick 是在给别人的实现细节写死一个常数。
 */
function macrotask(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * 建一个把真实 Chrome 中继逻辑装进中间两段的节点工厂。
 *
 * @returns 可直接交给 `createJsonConformanceDriver` 的节点工厂。
 */
export function createChromeRelayNodes(): JsonDriverNodeFactory {
  return (): JsonDriverNodes => ({
    background: createBackgroundNode,
    content: createContentNode,
    // 建链信号：`ready` 在这里就登记，而节点是随后的 `attachNode` 才构造的 —— 顺序是对的，
    // 因为 INIT 与注入编排都发生在同一个同步块里，宏任务必然排在它们排出的微任务之后。
    //
    // 等的是 background 的注入编排（`activateTab` 的 `then/catch/finally`）跑完：
    // 注入未完成时到达的下行帧会被挂在注入 promise 上，那条续体走微任务，跳延迟却走假时钟。
    // 若两端已经上线并发出第一条 HELLO，它就会被挂起、在 `advanceTime` 结束之后才落地，
    // 然后向一个不会再前进的时钟登记下一跳 —— 协商就此永久停摆。
    //
    // 让注入在 open 阶段收敛，对应的正是真实系统的稳态：协议帧开始往返时 content script
    // 早已注入完毕。注入期间的排队与丢弃行为不在这里验，由 `background-core.spec.ts` 直接覆盖。
    ready: macrotask()
  });
}
