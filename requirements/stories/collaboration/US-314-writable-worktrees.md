---
id: US-314
title: 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-17
updated: 2026-10-17
tags: [collaboration, branch, worktree, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 建在 US-313 的检出位登记与生命周期之上；不依赖往非 active 线写的原语（阶段 4）
- [ ] Negotiable (可协商): 可写检出位的存储方案（影子表或分库）、提交图怎么在分支间共享，待 owner 定
- [x] Valuable (有价值): 今天换一条线就得先清空或带着改动切走当前工作树；历史里的提交建不了分支
- [ ] Estimable (可估算): 存储方案定了才估得出
- [ ] Small (小): 按交付阶段 A～C 拆
- [x] Testable (可测试): 检出位上的读写与「切过去读写」逐行比对；三端 demo 的流程对照 GitHub Desktop 3.6
-->

# 用户故事：可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 像 GitHub Desktop 3.6 那样新建一个 worktree、在上面照常改与提交、在工具栏上随时切换，也能从历史里的某个提交新建分支
**以便** 同时推进几条线，不必为了换一条线先处理掉当前工作树的改动

## 症状

由读源码确认：

1. **三端 demo 没有 worktree 入口。** 库里只有只读检出位（[US-313](US-313-read-only-checkout.md)），只能看、不能写。
   GitHub Desktop 3.6 的 worktree 是可写的：工具栏 Repository 与 Branch 之间有 Worktree 下拉（有链接 worktree 时才出现），
   Repository 菜单与仓库下拉的右键里有 New Worktree…，链接 worktree 的右键有 Rename… / Copy Name / Copy Path / Delete…；
   切过去之后 Changes、History、Current Branch 都换到那个 worktree 上。
2. **历史里的提交建不了分支。** [`createBranch(branchId, fromChangeId)`](../../../packages/rxdb-plugin-history/src/VersionManager.ts)
   按变更日志上的位置分叉，而提交（[`rxdb_commit`](../../../packages/rxdb-plugin-working-tree/src/commit/commit.entity.ts) 与
   `rxdb_commit_change_set`）不记它对应日志上的哪一条变更，从提交推不出分叉点。GitHub Desktop 的提交右键有
   Create branch from commit，对话框写明「Your new branch will be based on the commit …」，建完切到新分支。

## 范围边界

### In Scope

- **从提交建分支**：新分支的 HEAD 指向那个提交，业务表等于那个提交刚完成时的数据；三端 demo 的提交右键
  「Create branch from commit」与「Create a branch」对话框
- **可写检出位**（epic-006 [分期](../../epics/epic-006-working-tree-commits.md#分期与解锁条件) 阶段 5）：库内的存储方案、
  在检出位上写与提交、一条分支至多被一个可写检出位检出（epic-006 设计指点 2）、关闭与回收沿用 US-313 的登记与锁
- **三端绑定与三端 demo**：按 GitHub Desktop 3.6——Worktree 下拉分「Main worktree / Linked worktrees」两组、
  New Worktree…（名字 + 可选分支）、切换、Rename…、Delete…（有未提交改动时先确认）；分支右键「Checkout in new worktree…」

### Out of Scope

- 往非 active 线写的原语与隔离写入方（epic-006 阶段 4）
- 跨设备、进同步（epic-006 设计指点 9）
- Bring my changes：带着未提交改动切到另一条分支（库按分支保存未提交改动，demo 的 Switch branch 只给 Leave my changes）

## 交付阶段

| 阶段 | 交付                                                                     | 状态 |
| ---- | ------------------------------------------------------------------------ | ---- |
| A    | 从提交建分支：库 API、六个后端一致性、三端 demo 的提交右键与建分支对话框 | ⬜   |
| B    | 可写检出位：存储方案、读写与提交、分支独占、关闭与回收                   | ⬜   |
| C    | 三端绑定与三端 demo 的 Worktree 下拉、New Worktree…、Rename… / Delete…   | ⬜   |

## 验收标准

| #   | 阶段 | 前置条件                                   | 操作                                    | 预期结果                                                                                         | 状态 |
| --- | ---- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | A    | 当前分支上一个可达提交，工作树有未提交改动 | 从它建分支并切过去                      | 业务表与「那次 `commit()` 刚完成时读到的数据」逐行一致；新分支的 HEAD 是该提交；原分支的改动还在 | ⬜   |
| 2   | A    | 三端 demo                                  | 历史行右键「Create branch from commit」 | 弹「Create a branch」对话框，写明基于哪个提交；建完切到新分支                                    | ⬜   |
| 3   | B    | 主检出位有未提交改动                       | 新建可写检出位，在上面写并提交          | 主检出位的业务表、工作树与 active 分支都不变；提交进那条分支的历史                               | ⬜   |
| 4   | B    | 一条分支已被一个可写检出位检出             | 在别处再检出它                          | 拒绝（git：`already used by worktree`）                                                          | ⬜   |
| 5   | C    | 三端 demo，有一个链接检出位                | 工具栏 Worktree 下拉选中它              | 分两组列出；切过去之后 Changes、History、Current Branch 都换到它上                               | ⬜   |
| 6   | C    | 三端 demo                                  | New Worktree… / Rename… / Delete…       | 与 GitHub Desktop 3.6 同流程；主检出位不能改名或删除；有未提交改动时删除先确认                   | ⬜   |
| 7   | C    | 三端 demo                                  | a11y 走查                               | Worktree 下拉与三个对话框 axe 零违规、键盘可达                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **从提交得出那一刻的数据**：US-313 的提交视图（`checkout/worktree-commit-view.ts`）已经能从 HEAD 沿可达路径反向应用
  变更单元，算出某个提交刚完成时的数据；从提交建分支要的是把这份数据落成一条新分支，而不是只读快照。推断：要么给提交
  记下它在变更日志上的水位，要么新分支从当前 tip 分叉、再写入反向增量（后者会在新分支上留下一批不属于任何提交的变更，
  与「工作树干净」冲突）。
- **新分支的历史**：`createBranch` 从历史点分叉时给新分支写一个 `branch_baseline` 根（`commit/branch-commit-rows.ts`），
  历史从零开始；GitHub Desktop 的新分支与源分支共享那个提交之前的历史。要对齐就得让新分支的 HEAD 直接指向源提交。
- **存储方案**：epic-006「多检出位」一节比较了只读快照库与库内影子表；可写检出位还要回答在检出位上提交、合并回主线、
  schema 迁移与全文检索覆盖到每套表的代价。
- **GitHub Desktop 参照**（`desktop/desktop`）：`app/src/ui/branches/branch-list-item-context-menu.tsx`（Checkout in new worktree…）、
  `app/src/ui/history/commit-list.tsx`（Create branch from commit）、`app/src/ui/create-branch/create-branch-dialog.tsx`。

## 实现文件

- `packages/rxdb-plugin-history/`、`packages/rxdb-plugin-working-tree/` — 从提交建分支、可写检出位
- `packages/rxdb-plugin-working-tree-{angular,react,vue}/` — 三端绑定
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — Worktree 下拉、对话框与用例

## References

- [GitHub Desktop 3.6: Worktrees and deeper Copilot integration](https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration/)
- [Managing worktrees in GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop)
