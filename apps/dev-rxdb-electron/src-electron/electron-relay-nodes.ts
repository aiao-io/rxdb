import type { FakeRelayNode, JsonDriverNodeFactory, JsonDriverNodes } from '@aiao/rxdb-devtools/testing';

/**
 * US-904 AC#53：把 Electron transport 装进 conformance driver 的中间两段。
 *
 * @remarks
 * Electron 的四段中继与 Chrome 是**同一份** unpacked MV3 扩展（panel → background → content →
 * connector），那个扩展的 background/content 真实逻辑（`createBackgroundController` +
 * `bridge-core`）已经由 `apps/rxdb-devtools-extension/src/testing/chrome-conformance.spec.ts`
 * 在同一份 suite 上关闭。Electron 特有的 `renderer connector → preload → main/host` 是
 * **请求/应答信道**（connector 的 `files` provider 往主进程发 `file.*` 请求），不是帧中继——
 * 它由 AC#50 的主进程 host 单测与 AC#52 的真实 E2E 关闭，不进这份 conformance 的射程。
 *
 * 因此这里的中间两段是**透明转发**：与 Tauri 的 `tauri-relay-nodes` 同构，差别只有一个
 * `createNodes`——判据、fixture、状态机、错误码一份都不复制。本 driver 的价值是证明
 * Electron 的 connector 接线 + 传输在已冻结的协议上全绿（CI 的对照信号），而不是再测一遍
 * 已经在 Chrome 侧验证过的扩展中继逻辑。
 *
 * 与 Chrome bridge 有一处**有意的不对称**：bridge 按方向丢弃方向相反的帧，而 Electron 的
 * 帧中继 = Chrome 的中继（方向校验在 bridge-core 里，Chrome driver 已验证）。这里节点不丢弃
 * 方向相反的帧，只做定向转发；「方向错 → 拒绝」由 suite 在端点层验证。
 *
 * @module apps/dev-rxdb-electron/electron-relay-nodes
 */

/**
 * 建一个透明的 Electron 中继节点。
 *
 * @param forward - 把帧送往下一跳
 * @returns 收帧回调
 *
 * @remarks
 * 四段里的 `background` / `content` 两个中间段在 Electron 里由同一份 MV3 扩展承载，
 * 帧在 port / window 总线之间逐字节原样转发。这里两者共享同一个转发实现——这是单中继结构
 * 的直接建模，不是省事。
 */
function createElectronRelayNode(forward: FakeRelayNode): FakeRelayNode {
  return (frame, direction) => {
    // 原样转发：Electron 的扩展中继不代 ACK、不解释 payload、不按方向分流（方向校验在两端点）。
    forward(frame, direction);
  };
}

/**
 * 建一个把 Electron transport（透明定向中继）装进中间两段的节点工厂。
 *
 * @returns 可直接交给 `createJsonConformanceDriver` 的节点工厂。
 */
export function createElectronRelayNodes(): JsonDriverNodeFactory {
  return (): JsonDriverNodes => ({
    background: createElectronRelayNode,
    content: createElectronRelayNode
  });
}
