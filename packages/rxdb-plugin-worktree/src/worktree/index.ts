/**
 * @fileoverview 命名工作上下文（git worktree 能力，US-310）
 *
 * @remarks
 * 一个 worktree = 一个钉在分支上的命名工作上下文，1:1、单 checkout。它的未提交改动就是所钉分支的
 * `WorkingTreeState`（`../working-tree/`），本目录只多出「哪些分支被起了名、钉成了 worktree」这一层。
 *
 * 公开面只有视图类型与失败出口：`Worktree` 实体与事务内命令体留在包内——命令体要求调用方自带
 * 事务执行器，而开事务、过门禁、两阶段切换都是 `WorktreeManager` 的职责。
 */
export type { WorktreeInfo } from './worktree-command.js';
export * from './worktree-errors.js';
