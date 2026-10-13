---
id: epic-010-worktree-contexts
status: In Progress
startDate: 2026-10-13
targetDate: TBD
owner: jimmy
---

# 命名工作上下文（git worktree 能力）

## 愿景

让用户像用 `git worktree` 一样**并行持有多条工作线**：每条工作线有名字、钉在一条分支上、
各自保留未提交改动，彼此之间自由切换而不需要先提交或丢弃。

本仓库的模型里业务表同一时刻只装一条分支的内容（切换即物化替换），所以 worktree 在这里不是
第二个目录，而是**钉在分支上的命名工作上下文**：单库同一时刻一个 checkout，切换 worktree
等于切到它钉住的分支。未提交改动沿用 epic-006 按分支隔离的 `WorkingTreeState`，切走再切回
原样还在——这正是 git worktree 相对「切分支前先 stash」的核心价值。

## 为什么单列一个 Epic

[epic-006](epic-006-working-tree-commits.md) 已 `Done`，它交付的是**一条**工作线上的
status / diff / commit / restore 与分支隔离；本 Epic 在其之上新增「多条命名工作线」这一层
产品能力，带一张新系统表与一条持久化迁移，不是对 epic-006 某条 FR 的补漏。挂回 epic-006
会让一个已 `Done` 的 Epic 重新持有进行中的故事（`requirements-consistency` 门禁也不允许）。

## 目标

- [ ] 用户能创建、列出、切换、移除命名 worktree，三框架 API 对称（[US-310](../stories/collaboration/US-310-named-worktrees.md)）
- [ ] 每个 worktree 的未提交改动独立保留，worktree 之间切换不要求工作树干净（[US-310](../stories/collaboration/US-310-named-worktrees.md)）
- [ ] 既有库升级后自带一条钉在当前分支上的主 worktree，零 active 分支的老库照常打开（[US-310](../stories/collaboration/US-310-named-worktrees.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-310 命名工作上下文（git worktree 能力）](../stories/collaboration/US-310-named-worktrees.md) (High)

## 非目标

- **同一时刻多个 checkout。** 业务表只装一条分支的物化结果，两个 worktree 同时「检出」需要按
  worktree 分表或分库，是存储布局级的改动；本 Epic 接受单 checkout 语义。
- **worktree 自带分支切换。** git 里一个 worktree 可以 `checkout` 到别的分支；这里 worktree 与分支
  1:1 钉死，换分支就是换 worktree。直接从分支菜单切到未钉住的分支仍然可以，那时当前没有对应的
  worktree 行（「active 无行分支」是合法状态）。
- **改名 / 移动（`git worktree move`）、锁定（`git worktree lock`）、清理（`git worktree prune`）。**
  label 只在创建时给定；没有路径，也就没有 move 与 prune 的对象。
