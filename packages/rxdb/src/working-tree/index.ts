/**
 * @fileoverview 工作树（working tree）—— 可变的一面
 *
 * @remarks
 * 本目录承载 epic-006 v1 中**每次写入都在变**的那一半：未提交变更单元的捕获与折叠、
 * `status` / `diff` / `commit` / `discard` 操作面、恢复会话，以及目标分支物化 staging。
 *
 * 与之相对的不可变一面在 `../commit/`。
 *
 * v1 只有**一条 diff 轴**：`HEAD ↔ 工作树`。没有 `HEAD ↔ index` 的第二条轴，
 * 因为没有 index。详见 `specs/001-working-tree-commits/spec.md` 硬裁决 2。
 */
export * from './activation-state.js';
export * from './working-tree-facade.js';
export * from './working-tree-patch-codec.js';
// 写入面（US-306 阶段 A）：判定、门禁、捕获、折叠与冷重放不变量。
// 适配器包在**包外**，只能经这里拿到判定入口——`judgeRawWrite` / `gateRawWrite` 六处调用、
// `gateBulkWrite` 两个方法、`captureCrudWrite` 四个挂载点用的都是这一份实现。
// 不导出的话，六个适配器只剩「各自抄一份」这一条路，而那正是 adapter-contract.md §2
// 「判定实现只有一份」明确禁止的形态。
export * from './bulk-write-gate.js';
export * from './capture-hook.js';
export * from './capture-interceptor.js';
export * from './capture-mount-points.js';
export * from './capture-runtime.js';
export * from './cold-replay.js';
export * from './external-notify-gate.js';
export * from './raw-write-judgment.js';
export * from './trusted-write-intent.js';
export * from './trusted-write-scope.js';
export * from './versioned-domain.js';
export * from './write-entry-matrix.js';
export * from './write-entry.js';
