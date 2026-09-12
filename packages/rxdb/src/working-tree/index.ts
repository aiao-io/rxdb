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
export * from './working-tree-patch-codec.js';
