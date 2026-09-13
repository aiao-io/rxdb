/**
 * @fileoverview 提交图（commit graph）—— 不可变的一面
 *
 * @remarks
 * 本目录承载 epic-006 v1 中**只追加、永不改写**的那一半：提交节点、提交的不可变
 * 恢复数据、分支 HEAD 引用、数据库级能力协商，以及它们的损坏守卫。
 *
 * 与之相对的可变一面在 `../working-tree/`。两者分家的理由不是文件数量，而是
 * **可变性契约不同**：本目录的表除 `rxdb_commit_branch_ref` 的 HEAD 指针与
 * `status` 外一律不 UPDATE / DELETE；`working-tree/` 的表每次 `save()` 都在改。
 * 混在一起会让「这张表能不能改」变成要逐字段回忆的问题。
 *
 * v1 **没有暂存区**：这里不存在 index / staging / 部分提交的任何形态。
 * 详见 `specs/001-working-tree-commits/spec.md` 硬裁决 1–2。
 */
// active 分支基数守卫（FR-048）。`ACTIVE_BRANCH_KEY` 必须出现在公开面上：
// 两个后端的 `switch_branch` 是裸 SQL，哨兵值要直接拼进 UPDATE 里。各自抄一份字面量的话，
// 某一端拼错了不会有编译错误——只会让那一端的 active 行安静地退出唯一约束的管辖。
export * from './active-branch-guard.js';
export * from './commit-codec.js';
export * from './commit-error-codes.js';
