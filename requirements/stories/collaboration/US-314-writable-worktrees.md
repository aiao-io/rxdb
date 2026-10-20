---
id: US-314
title: 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree
status: In Progress
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-17
updated: 2026-10-21
tags: [collaboration, branch, worktree, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 建在 US-313 的检出位登记与生命周期之上；不依赖往非 active 线写的原语（阶段 4）
- [x] Negotiable (可协商): 存储方案已定为库内影子表（[对比](US-314-storage-options.md)）；多检出位下只有主检出位同步（owner 2026-10-21 定）
- [x] Valuable (有价值): 今天换一条线就得先清空或带着改动切走当前工作树；历史里的提交建不了分支
- [x] Estimable (可估算): 粗估阶段 A 5～8 人日，阶段 B、C 合计约 40～55 人日（[分期](US-314-storage-options.md#分期)）
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
   阶段 A 让提交记下分叉点、交付了从提交建分支，见技术笔记。

## 范围边界

### In Scope

- **从提交建分支**：新分支的 HEAD 指向那个提交，业务表等于那个提交刚完成时的数据；三端 demo 的提交右键
  「Create branch from commit」与「Create a branch」对话框
- **可写检出位**（epic-006 [分期](../../epics/epic-006-working-tree-commits.md#分期与解锁条件) 阶段 5）：库内影子表
  （[存储方案](US-314-storage-options.md)）、在检出位上写与提交、一条分支至多被一个可写检出位检出（epic-006 设计指点 2）、关闭与回收沿用 US-313 的登记与锁
- **三端绑定与三端 demo**：按 GitHub Desktop 3.6——Worktree 下拉分「Main worktree / Linked worktrees」两组、
  New Worktree…（名字 + 可选分支）、切换、Rename…、Delete…（有未提交改动时先确认）；分支右键「Checkout in new worktree…」

### Out of Scope

- 往非 active 线写的原语与隔离写入方（epic-006 阶段 4）
- 跨设备、进同步（epic-006 设计指点 9）
- Bring my changes：带着未提交改动切到另一条分支（库按分支保存未提交改动，demo 的 Switch branch 只给 Leave my changes）

## 交付阶段

| 阶段 | 交付                                                                                 | 状态 |
| ---- | ------------------------------------------------------------------------------------ | ---- |
| A    | 从提交建分支：库 API、六个后端一致性、三端 demo 的提交右键与建分支对话框             | ✅   |
| B    | 可写检出位：库内影子表的底座（B1）与完整语义（B2）、读写与提交、分支独占、关闭与回收 | ⚠️   |
| C    | 三端绑定与三端 demo 的 Worktree 下拉、New Worktree…、Rename… / Delete…               | ⬜   |

## 验收标准

| #   | 阶段 | 前置条件                                   | 操作                                    | 预期结果                                                                                         | 状态 |
| --- | ---- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | A    | 当前分支上一个可达提交，工作树有未提交改动 | 从它建分支并切过去                      | 业务表与「那次 `commit()` 刚完成时读到的数据」逐行一致；新分支的 HEAD 是该提交；原分支的改动还在 | ✅   |
| 2   | A    | 三端 demo                                  | 历史行右键「Create branch from commit」 | 弹「Create a branch」对话框，写明基于哪个提交；建完切到新分支                                    | ✅   |
| 3   | B    | 主检出位有未提交改动                       | 新建可写检出位，在上面写并提交          | 主检出位的业务表、工作树与 active 分支都不变；提交进那条分支的历史                               | ⬜   |
| 4   | B    | 一条分支已被一个可写检出位检出             | 在别处再检出它                          | 拒绝（git：`already used by worktree`）                                                          | ⬜   |
| 5   | C    | 三端 demo，有一个链接检出位                | 工具栏 Worktree 下拉选中它              | 分两组列出；切过去之后 Changes、History、Current Branch 都换到它上                               | ⬜   |
| 6   | C    | 三端 demo                                  | New Worktree… / Rename… / Delete…       | 与 GitHub Desktop 3.6 同流程；主检出位不能改名或删除；有未提交改动时删除先确认                   | ⬜   |
| 7   | C    | 三端 demo                                  | a11y 走查                               | Worktree 下拉与三个对话框 axe 零违规、键盘可达                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **从提交建分支（阶段 A）**：提交时在同一事务里记下分叉点（`CommitForkPoint`，`rxdb_commit_fork_point`）：提交所在的分支、
  那一刻它未回滚的最大一条自有变更，以及谱系上不晚于分叉点那一段的回滚条数与最大回滚号。
  `rxdb.workingTree.createBranchFromCommit(branchId, commitId)` 在那里分叉，新分支的 HEAD 就是该提交（与源分支共享之前的历史）、
  工作树为空，切过去由历史插件沿谱系折叠出数据；只建不切。`checkBranchFromCommit(commitId)` 先问建不建得了。
  被拒三种，都走返回值：`unreachable_target`（不在 HEAD 可达父链上）、`fork_point_unknown`（分叉点表出现之前的提交、
  metadata-only 分支首次物化写下的基线）、`history_rewritten`（提交之后的撤销 / 重做改动了要继承的那段日志：撤销领的回滚号
  全局单调，重做把它清空，条数与最大回滚号都没变，回滚状态就与提交那一刻相同）。
  不从提交单元反推分叉点：单元不存来源变更 id，合并、撤销、拉取派生的单元连事务号都没有，推出来的位置会偏；
  也不从 tip 分叉再写反向增量，那是往非 active 线写（阶段 4）。
- **已知限制**（owner 2026-10-18 定，与切分支同口径）：提交之后不进变更日志的写（拉取、过期清理）切换时不会撤掉，
  新分支会带着它们；建完之后在父分支上撤销分叉点之前的变更，新分支的数据跟着变，与任何一条子分支一样（FR-017）。
- **三端 demo（阶段 A）**：History 右键「Create branch from commit」与分支下拉的「New branch」共用 GitHub Desktop 的
  「Create a branch」对话框，打开时先预检，建不了就写明原因、按钮置灰；建完切过去，当前分支有改动时照常弹 Switch branch。
  New branch 从当前分支 HEAD 建：`createBranch(name)` 会把未提交改动复制一份给新分支、两边都留着，与 GitHub Desktop
  「留在原分支 / 带去新分支」两个去处都不同。GitHub Desktop 在非默认分支上还让人挑基于默认分支还是当前分支，
  从提交建分支只认当前分支历史上的提交，这里只基于当前分支。
- **存储方案**：库内影子表（owner 2026-10-17 定）；与分库的对比、证据与分期见 [US-314-storage-options.md](US-314-storage-options.md)。
  阶段 B1 由 owner 2026-10-21 先行解锁，不等具名需求。
- **同步归属**（owner 2026-10-21 定）：多检出位下只有主检出位同步。拉取、推送照旧只作用于主检出位所在的分支，挂在可写检出位上的实例不跑同步；
  检出位上的提交等那条分支回到主检出位、或合并进主线之后才进同步（epic-006 设计指点 12）。
- **表名解析器**（阶段 B1 的底座）：业务实体的物理名只从两个适配器的解析器出，表集（核心的 `WorktreeTableSet`）参数必填。
  - 主表集的名字与引入检出位之前逐字相同，存量库零迁移。
  - 影子表集：SQLite 系给表名加后缀（`<命名空间>$<表名>$<后缀>`），条件唯一索引与区间排他触发器这类库级对象换掉名字末尾的定义哈希，
    违约消息里仍嵌约束的逻辑名；PGlite 换 schema（`<命名空间>$<后缀>`），表名、索引名、约束名不变，变更触发器函数跟着换 schema。
  - 系统表、QueryCache、关掉变更日志的实体没有副本，无论哪一套都落主表集。
  - 公开的表名函数与 SQL 生成函数随之多了必填参数，迁移见文档站的 table-set-parameter；
    `scripts/audit/table-name-resolver.mjs`（CI setup job）守着「解析器之外不推物理名」。
- **分支持有模型**（阶段 B1.2）：`rxdb_branch.activeKey` 有三种值，`NULL` 是没人持有，`'*active*'` 是主检出位持有
  （与 `activated` 同进同出），其余是可写检出位的持有键（形状由 B1.5 的打开流程定，那一行 `activated` 为假）。
  - 唯一索引加上一格只放一个值，检出位与分支一一对应。但主检出位点亮分支时写的是哨兵，正好把持有键覆盖掉，索引撞不上，
    所以主检出位要持有一条分支之前都先过核心的 `WorktreeBranchHeldError.throwIfHeld`：
    两个适配器的 `switchBranch` 在切换事务里、动第一行之前查，被占就抛 `WorktreeBranchHeldError`（git：`already used by worktree`）；
    零 active 时点亮 `main` 的两处（首次启用迁移、`resolve_current_branch`）与系统迁移回填哨兵同样先查，被占就拒，不抢也不换。
  - 系统迁移只清旧哨兵，不再按「非空」清，后者会把持有键一起抹掉。
  - 重建触发器时顺手重跑的那条激活（sqlite `withTriggersDisabled`、PGlite `execute_switch_actions`）目标是当前分支，
    B1.3 改成只重建触发器、不写分支表。
  - 验收 4 的主检出位这一半就位；可写检出位那一半（再开一个检出位检出被占的分支）随 B1.5 的打开流程。
  - **已知限制**：B1.2 之前的版本不认持有键，在带持有键的库上切分支会直接覆盖它。检出位是本地概念，不保证跨版本降级。
- **GitHub Desktop 参照**（`desktop/desktop`）：`app/src/ui/branches/branch-list-item-context-menu.tsx`（Checkout in new worktree…）、
  `app/src/ui/history/commit-list.tsx`（Create branch from commit）、`app/src/ui/create-branch/create-branch-dialog.tsx`。

## 实现文件

- `packages/rxdb-plugin-working-tree/src/commit/commit-fork-point.entity.ts`、`commit/commit-fork-point.ts`、`commit/write-commit.ts`
  — 分叉点表、提交时记下与读回核对
- `packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts`、`working-tree/working-tree-facade.ts`、
  `commit/branch-commit-rows.ts` — 判定、门面方法与「HEAD 指向点名提交」那一支
- `packages/rxdb-plugin-history/src/create-branch.ts` — 在调用方事务里写分支行、远端查重；`packages/rxdb/src/rxdb-plugin-system.ts`
  — 建分支上下文的 `fromCommitId`
- `packages/rxdb-plugin-working-tree/src/working-tree/testing/worktree.suite.ts` — 六个后端的从提交建分支用例
- `packages/rxdb-plugin-working-tree-{angular,react,vue}/` — 三端绑定（`checkBranchFromCommit` / `createBranchFromCommit`）
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 「Create a branch」对话框、History 右键；可写检出位的 Worktree 下拉随阶段 C
- `packages/rxdb/src/system/worktree-table-set.ts`、`packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts`、
  `packages/rxdb-adapter-pglite/src/table-name-resolver.ts` — 表集与两个适配器的表名解析器；`scripts/audit/table-name-resolver.mjs` — 门禁
- `packages/rxdb/src/system/active-branch-guard.ts`（`WorktreeBranchHeldError`）、`system/system-repositories.ts`、
  两个适配器的 `version/switch_branch.ts` 与系统迁移（sqlite-core `RxDBAdapterSqliteBase.ts`、PGlite `system/migrate_system_schema.ts`）
  — 分支持有模型

## References

- [GitHub Desktop 3.6: Worktrees and deeper Copilot integration](https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration/)
- [Managing worktrees in GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop)
