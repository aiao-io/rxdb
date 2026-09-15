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
// 提交历史的公开面（FR-012）。遍历本身（`list-commits.ts`）与 `Commit` 实体都留在包内：
// 实体带着幂等键与节点指纹，两者都不承诺跨版本稳定，摆上公开面就会被当成内容判据。
export * from './commit-error-codes.js';
export * from './commit-log.js';
// 能力三元组：`WorkingTreeManager.enable()` 的返回类型。只导出类型，读写能力行的四个
// 函数留在包内——它们要求调用方自带事务执行器，而那是门面的职责，不是调用方的。
export type { CommitCapabilityInfo, CommitCapabilityVersions } from './commit-capability.js';
// 提交写路径的**校验失败**类型。写路径本身（`writeCommit` / `buildCommitRows`）留在包内，
// 但它抛的这个错必须能被叫出名字：`commit()` 在干净工作树上抛 `empty_commit`，而三端入口
// 要按 tri-framework-api.md §4「同一错误码在三端呈现同一语义」把它和「连接断了」分开呈现。
// 只能靠 `message` 字符串匹配来区分的错，等于没有错误码。
export { CommitValidationError, type CommitValidationReason } from './write-commit.js';
