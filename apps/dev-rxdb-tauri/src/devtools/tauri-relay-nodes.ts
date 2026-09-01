import type { FakeRelayNode, JsonDriverNodeFactory, JsonDriverNodes } from '@aiao/rxdb-devtools/testing';

/**
 * US-905 AC#2 / AC#7：把 Tauri transport 装进 conformance driver 的中间两段。
 *
 * @remarks
 * 与 Chrome 的 `chrome-relay-nodes` 同构，差别**只有一个 createNodes**——判据、fixture、状态机
 * 断言一份都不复制。Tauri transport 的中继是 `src-tauri` 里那条 `devtools_message` 命令：
 * 按发起窗口 label 定向路由（`rxdb-devtools` ↔ `main`），payload 是 `String` 进、`String` 出，
 * **不解析**。因此这里没有 Chrome bridge 那种「解析再重序列化」会改写字节的风险——逐字节
 * 保真对 Tauri 是结构性的，不需要 Chrome 那套 WeakMap 原文台账。
 *
 * 与 Chrome bridge 有一处**有意的不对称**：bridge 会按帧的方向（`direction`）丢弃方向相反的帧，
 * 而 Tauri 的 Rust 中继是方向无关的——它不解析 payload，也不看方向。方向的校验落在两端的
 * v2 endpoint（WebView 层）上，正是「宽外层、严内层」里 transport 是宽外层的落法。所以这里的
 * 节点**不丢弃**方向相反的帧，只做定向转发；「方向错 → 拒绝」由 suite 在端点层验证。
 *
 * @module apps/dev-rxdb-tauri/devtools/tauri-relay-nodes
 */

/** 面板所在窗口（调试窗口）的 label，与 Rust 侧 `devtools_routing::DEVTOOLS_LABEL` 一致。 */
export const DEVTOOLS_WINDOW_LABEL = 'rxdb-devtools';

/** 被检查页所在窗口（主窗口）的 label，与 Rust 侧 `devtools_routing::MAIN_LABEL` 一致。 */
export const MAIN_WINDOW_LABEL = 'main';

/**
 * 建一个透明的 Tauri 中继节点。
 *
 * @param forward - 把帧送往下一跳
 * @returns 收帧回调
 *
 * @remarks
 * 四个段里的 `background` / `content` 两个中间段在 Tauri 里**不是**两个进程，而是同一条
 * Rust `devtools_message` 命令的两个入站面。所以两者共享同一个转发实现——这是单中继结构
 * 的直接建模，不是省事。
 */
function createTauriRelayNode(forward: FakeRelayNode): FakeRelayNode {
  return (frame, direction) => {
    // 原样转发：Rust 侧 `String` 进、`String` 出，不解析、不改写、不按方向分流。
    forward(frame, direction);
  };
}

/**
 * 建一个把 Tauri transport（透明 JSON 定向中继）装进中间两段的节点工厂。
 *
 * @returns 可直接交给 `createJsonConformanceDriver` 的节点工厂。
 */
export function createTauriRelayNodes(): JsonDriverNodeFactory {
  return (): JsonDriverNodes => ({
    background: createTauriRelayNode,
    content: createTauriRelayNode
  });
}
