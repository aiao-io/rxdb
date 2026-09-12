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
export * from './commit-error-codes.js';
