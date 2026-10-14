---
id: US-310
title: 命名工作上下文（git worktree 能力）
status: In Review
priority: High
epic: epic-010-worktree-contexts
created: 2026-10-13
updated: 2026-10-13
tags: [collaboration, worktree, version-control, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只依赖已 Done 的 epic-006 与 US-309 改名
- [x] Negotiable (可协商): 语义（单 checkout、1:1 钉分支、自由切换）已与 owner 确认
- [x] Valuable (有价值): demo 的 worktree 页面没有「创建 worktree」入口，并行工作线只能靠先提交再切分支
- [x] Estimable (可估算): 一张表 + 一条迁移 + 4 个命令 + 三端绑定与 demo
- [x] Small (小): 不碰捕获 / 提交 / 物化，worktree 的 WIP 就是分支的 WIP
- [x] Testable (测试): AC 逐条对应单测、conformance 用例与 e2e
-->

# 用户故事：命名工作上下文（git worktree 能力）

## 作为/我想要/以便

**作为** 在本地优先应用里同时推进几条改动的用户
**我想要** 像 `git worktree add / list / remove` 那样创建、列出、切换、移除命名的工作上下文
**以便** 在几条工作线之间来回切换时，每条线上没提交的改动原样保留，不必先提交或丢弃

## 范围边界

### In Scope

- 新系统表 `rxdb_worktree`（实体 `Worktree`，第 11 张）：一行 = 一个钉在某条分支上的 worktree，`branchId` 唯一
- 迁移 `0005-worktrees`：既有库为当前 active 分支补一行主 worktree；新库随建表写主行
- `WorktreeManager` 新增 `listWorktrees()` / `createWorktree()` / `switchWorktree()` / `removeWorktree()`，全部经能力门禁
- 五个错误类：`WorktreeBranchPinnedError` / `WorktreeBranchNotFoundError` / `WorktreeNotFoundError` / `WorktreeActiveError` / `WorktreeLabelError`
- `removeBranch()` 连带清掉钉在该分支上的 worktree 行
- 三端 `useWorktree()` 对称新增 4 格状态与 4 个命令
- 三端 demo 的 worktree 菜单（创建 / 切换 / 移除）与 e2e、a11y 用例

### Out of Scope

- 同一时刻多个 checkout（按 worktree 分表 / 分库），见 [epic-010 非目标](../../epics/epic-010-worktree-contexts.md#非目标)
- 改 label、`move` / `lock` / `prune`
- 捕获、提交、物化与同步：worktree 的未提交改动就是所钉分支的 `WorkingTreeState`，三个捕获位仍锚定 active 分支
- 能力水位：`WORKING_TREE_CAPABILITY = 'workingTree'` 与 `WORKTREE_CAPABILITY_VERSION = 1` 不动

## 验收标准

| #   | 前置条件                                   | 操作                                                    | 预期结果                                                                                                                                                                     | 状态 |
| --- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 装了本插件的宿主                           | `use(rxDBPluginWorktree)` 后读系统表登记                | `Worktree`（`rxdb_worktree`）是第 11 张系统表：`namespace: 'rxdb'`、`log: false`、`SYSTEM_ENTITY_PERMISSIONS`、`branchId` 上有唯一索引                                       | ✅   |
| 2   | 新库                                       | `connect()` 建库                                        | 随建表写入一行主 worktree，钉在 `main`，`label` 为 `null`；迁移名 `0005-worktrees` 直接记成已执行水位                                                                        | ✅   |
| 3   | 既有库，恰一条 active 分支                 | 升级后首次 `connect()`                                  | `0005-worktrees` 恰跑一次，主行钉在该 active 分支；排在 `0004-working-tree-commits` 之后                                                                                     | ✅   |
| 4   | 既有库，零 / 多条 active 分支              | 升级后首次 `connect()`                                  | 零 active：不落行、照常打开（零行是合法态）；多 active：抛 `AmbiguousActiveBranchError` 整条回滚；`down()` 一律拒绝                                                          | ✅   |
| 5   | 已启用能力的库                             | `createWorktree(branchId, label?)`                      | 落行并切到该分支；同分支已有行抛 `WorktreeBranchPinnedError`；分支不存在抛 `WorktreeBranchNotFoundError`；空白 label 抛 `WorktreeLabelError`；当前 active 但无行的分支允许钉 | ✅   |
| 6   | 已启用能力的库，切换阶段失败               | `createWorktree()` 的目标分支提交图损坏                 | 原错误原样上抛，worktree 行保留（可用 `switchWorktree()` 重试）                                                                                                              | ✅   |
| 7   | 已启用能力的库                             | `listWorktrees()`                                       | 全部行按 `(createdAt, branchId)` 升序，`active` 与 `rxdb_branch.activated` 同口径；零行返回 `[]`                                                                             | ✅   |
| 8   | 已启用能力的库                             | `switchWorktree(id, options?)`                          | 切到所钉分支；`requireClean` / `expectedActivationRevision` 原样透传给 `switchBranch()`；行不存在抛 `WorktreeNotFoundError`；切当前 worktree 是 no-op                        | ✅   |
| 9   | 已启用能力的库                             | `removeWorktree(id)`                                    | 删行，分支 / 未提交改动 / 提交图不动，删后可再钉；active 行抛 `WorktreeActiveError`；所钉分支有未提交改动抛 `WorktreeDirtyError`                                             | ✅   |
| 10  | 未启用能力的库                             | 调四个新成员（零参）                                    | 一律以 `commit_capability_disabled` 拒绝，零写入、未切换                                                                                                                     | ✅   |
| 11  | 某分支钉着 worktree                        | `versionManager.removeBranch(branchId)`                 | worktree 行随分支一起删掉（显式删 + 外键级联）                                                                                                                               | ✅   |
| 12  | 6 个真后端（commit conformance §2.8）      | 裸插两行同 `branchId`；并发两次 `createWorktree` 同分支 | 唯一约束拒绝第二行；并发恰一个成功、另一个抛 `WorktreeBranchPinnedError`                                                                                                     | ✅   |
| 13  | 三端绑定                                   | `useWorktree()`                                         | 新增 `listWorktreesState`（查询，零行 = empty）与 create / switch / remove 三格命令状态；create / switch 后重读 status 与 list，remove 后重读 list；错误原样上抛             | ✅   |
| 14  | 三端 demo                                  | worktree 菜单                                           | 显示当前 worktree（无行时显示分支名）；按已有分支或新建分支创建（可带 label）；点行切换；移除非 active 行；active 行的移除按钮禁用                                           | ✅   |
| 15  | 三端 demo，当前 worktree 有未提交改动      | 切到另一个 worktree 再切回                              | 两次切换都成功；切回后 Changes 原样还在；另一个 worktree 的改动不串过来                                                                                                      | ✅   |
| 16  | 三端 demo，非 active worktree 有未提交改动 | 移除它                                                  | 被拒并 toast；行仍在                                                                                                                                                         | ✅   |
| 17  | 三端 demo                                  | a11y 走查                                               | 纯 Tab 可达、Escape（document 级）与背板点击关闭、role / aria 断言、筛空文案、remove 按钮有可访问名                                                                          | ✅   |
| 18  | 门禁                                       | 收尾                                                    | api-baseline 自更新；`rxdb-plugin-worktree` 覆盖率 ≥ 90%；package-graph 重生成；`audit:suite-callsites` / `audit:callsite-drift` / `tri-framework-check` 全绿                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

复验方式：AC 1～11 见 `pnpm nx test rxdb-plugin-worktree`（`src/__tests__/worktree/` 与 `system/`、`working-tree/` 下的增补用例）；
AC 12 见六个适配器包的 `working-tree-commit-conformance.spec.ts`（commit 套件 §2.8）；AC 13 见三个绑定包的
`use-worktree.spec`（`describe('useWorktree：命名 worktree（US-310）')`）；AC 14～17 见三端 e2e 的
`worktree.spec.ts`（`describe('命名 worktree（US-310）')`）与 `worktree.a11y.spec.ts`（worktree 菜单那一条）。
AC 18 见 `pnpm audit:*` 各项与 `pnpm test-all`（全量 affected 门禁，82 个项目全绿）。

## 技术笔记

- **语义**：worktree = 钉在分支上的命名工作上下文，1:1、单 checkout。active 勾选复用
  `rxdb_branch.activated`，不另存「当前 worktree」——与 `activation-state.ts` 的「没有第二份
  active branch ID」同一条裁决。主 worktree **显式落行**，不做合成视图。
- **自由切换**：worktree 之间切换不带 `requireClean`。未提交改动按分支隔离保存
  （`WorkingTreeState` 一分支一行），切走再切回原样还在；这是 git worktree 的核心价值，
  也与「`createWorktree()` 创建即切换」同一口径。只有 `removeWorktree()` 拒绝有未提交改动的
  worktree（git 同款）。分支菜单的 `switchBranch(…, { requireClean: true })` 不变。
- **两阶段**：`createWorktree()` / `switchWorktree()` 先在 `runEnabled()` 的事务里落行 / 读行，
  **提交之后**再调 `versionManager.switchBranch()`——后者自己开事务，嵌套会死锁。
  切换失败时行保留、原错误上抛，不做补偿删除（补偿本身也可能失败，会盖掉原错误）。
- **0005 不用 `assertSingleActiveBranch()`**：迁移对所有既有库都跑，而零 active 是
  未启用能力的老库的合法状态（`commit-error-codes.ts` 的 `no_active_branch`：迁移期不抛）。
  零 active 不落行，多 active 抛 `AmbiguousActiveBranchError`，与 `ensureBranchActiveKey` 同口径。
- **唯一索引**：`branchId` 是 MANY_TO_ONE 生成的外键列，唯一性走
  `indexes: [{ properties: ['branchId'], unique: true }]`，与 `WorkingTreeEntry` 的
  `idx_working_tree_entry_identity` 同款。
- **测试分层**：核心包单测底座 `createCommitGraphProbe()` 不执行 SQL、不校验唯一约束，
  唯一约束、并发仲裁与全流程放进 commit conformance 套件 §2.8，在 6 个真后端上跑（capture 套件的库声明了不注册的远端适配器名，`createBranch()` 在那里建不出分支）。
- **迁移名是持久化元数据**：`0005-worktrees` 合入即钉死。

## 实现文件

- `packages/rxdb-plugin-worktree/src/worktree/` — `Worktree` 实体、错误类、命令体
- `packages/rxdb-plugin-worktree/src/migrations/0005-worktrees.ts` — 迁移与新库初始行
- `packages/rxdb-plugin-worktree/src/working-tree/working-tree-facade.ts` — `WorktreeManager` 四个新成员
- `packages/rxdb-plugin-worktree/src/working-tree/{async-state,working-tree-commands}.ts` — 三端共用状态与命令
- `packages/rxdb-plugin-worktree-{angular,react,vue}/src/use-worktree.ts` — 三端绑定
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — demo 与端到端用例

## References

- 执行任务单：[specs/011-us310-named-worktrees/tasks.md](../../../specs/011-us310-named-worktrees/tasks.md)
- 前置：[US-309 工作树插件改名](../plugin/US-309-worktree-rename.md)
