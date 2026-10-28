---
id: US-314
title: 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree
status: Done
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-17
updated: 2026-10-28
tags: [collaboration, branch, worktree, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 建在 US-313 的检出位登记与生命周期之上；后台写入产品闭环不是本故事前置
- [x] Negotiable (可协商): 存储方案已定为库内影子表（[对比](US-314-storage-options.md)）；多检出位下只有主检出位同步（owner 2026-10-21 定）
- [x] Valuable (有价值): 支持多条工作线同时编辑与提交，并能从可达历史提交新建分支
- [x] Estimable (可估算): 范围由阶段 A/B/C 与各自 AC 确定；存储代价见 [方案边界](US-314-storage-options.md#代价与边界)
- [ ] Small (小): 按交付阶段 A～C 拆
- [x] Testable (可测试): 检出位上的读写与「切过去读写」逐行比对；三端 demo 的流程对照 GitHub Desktop 3.6
-->

# 用户故事：可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 像 GitHub Desktop 3.6 那样新建一个 worktree、在上面照常改与提交、在工具栏上随时切换，也能从历史里的某个提交新建分支
**以便** 同时推进几条线，不必为了换一条线先处理掉当前工作树的改动

## 用户目标与参照

- 同时维护独立的可写工作线，每条工作线可读取、编辑与提交；主检出位的数据和工作树不被其他检出位改写。
- 从当前分支的可达历史提交创建新分支，保留原工作树，不从提交内容猜测日志分叉点。
- 三端 demo 参照 GitHub Desktop 3.6 的 Worktree 下拉、New/Rename/Delete 和 Create branch from commit 流程；
  本地数据的复制、未提交变更归属与同步边界以本故事 AC 为准，不承诺复刻 Git 的全部语义。

## 范围边界

### In Scope

- **从提交建分支**：新分支的 HEAD 指向那个提交，业务表等于那个提交刚完成时的数据；三端 demo 的提交右键
  「Create branch from commit」与「Create a branch」对话框
- **可写检出位**（epic-006 [分期](../../epics/epic-006-working-tree-commits.md#分期与解锁条件) 阶段 5）：库内影子表
  （[存储方案](US-314-storage-options.md)）、在检出位上写与提交、一条分支至多被一个可写检出位检出（epic-006 设计指点 2）、关闭与回收沿用 US-313 的登记与锁
- **三端绑定与三端 demo**：按 GitHub Desktop 3.6——Worktree 下拉分「Main worktree / Linked worktrees」两组、
  New Worktree…（名字 + 可选分支）、切换、Rename…、Delete…（有未提交改动时先确认）；分支右键「Checkout in new worktree…」

### Out of Scope

- 后台同步、批量导入或 agent 的审阅产品闭环，仍是 [长期愿景](../../vision.md#阶段-3-多端协作与同步) 中的待立项方向
- 跨设备、进同步（epic-006 设计指点 9）
- Bring my changes：带着未提交改动切到另一条分支（库按分支保存未提交改动，demo 的 Switch branch 只给 Leave my changes）

## 交付阶段

| 阶段 | 交付                                                                     | 状态 |
| ---- | ------------------------------------------------------------------------ | ---- |
| A    | 从提交建分支：库 API、六个后端一致性、三端 demo 的提交右键与建分支对话框 | ✅   |
| B    | 可写检出位：库内影子表、读写与提交、分支独占、切换与合并、关闭与回收     | ✅   |
| C    | 三端绑定与三端 demo 的 Worktree 下拉、New Worktree…、Rename… / Delete…   | ✅   |

## 验收标准

### 阶段 A — 从提交建分支

| #   | 阶段 | 前置条件                                   | 操作                                    | 预期结果                                                                                         | 状态 |
| --- | ---- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | A    | 当前分支上一个可达提交，工作树有未提交改动 | 从它建分支并切过去                      | 业务表与「那次 `commit()` 刚完成时读到的数据」逐行一致；新分支的 HEAD 是该提交；原分支的改动还在 | ✅   |
| 2   | A    | 三端 demo                                  | 历史行右键「Create branch from commit」 | 弹「Create a branch」对话框，写明基于哪个提交；建完切到新分支                                    | ✅   |

### 阶段 B — 可写检出位

| #   | 阶段 | 前置条件                                               | 操作                                               | 预期结果                                                                                                             | 状态 |
| --- | ---- | ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| 3   | B    | 主检出位有未提交改动                                   | 新建可写检出位，在上面写并提交                     | 主检出位的业务表、工作树与 active 分支都不变；提交进那条分支的历史                                                   | ✅   |
| 4   | B    | 一条分支已被一个可写检出位检出                         | 在别处再检出它                                     | 拒绝（git：`already used by worktree`）                                                                              | ✅   |
| 8   | B    | 挂在可写检出位上，持有的分支有未提交改动               | 在检出位里切到另一条分支，或合并别的分支           | 切分支：改动留在原分支，读到的与主检出位切过去逐行一致；合并落在这套表里；主检出位一处不动                           | ✅   |
| 9   | B    | 两个标签页共用一个库，一个挂主检出位、一个挂可写检出位 | 各自写入；改两套表里都有的同一行；在检出位里切分支 | 两边的活查询只收到自己那套表上的变更，同 id 的行不被另一边的值改掉                                                   | ✅   |
| 10  | B    | 应用升级改了实体结构，或插件建在表上的附属对象变了     | 挂上升级之前开的可写检出位                         | 一笔事务里按新结构整套重建：未提交改动还在、与切过去逐行一致；重建失败整笔回滚报 `schema_rebuild_failed`，检出位原样 | ✅   |

### 阶段 C — 三端交互

| #   | 阶段 | 前置条件                    | 操作                              | 预期结果                                                                       | 状态 |
| --- | ---- | --------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ---- |
| 5   | C    | 三端 demo，有一个链接检出位 | 工具栏 Worktree 下拉选中它        | 分两组列出；切过去之后 Changes、History、Current Branch 都换到它上             | ✅   |
| 6   | C    | 三端 demo                   | New Worktree… / Rename… / Delete… | 与 GitHub Desktop 3.6 同流程；主检出位不能改名或删除；有未提交改动时删除先确认 | ✅   |
| 7   | C    | 三端 demo                   | a11y 走查                         | Worktree 下拉与三个对话框 axe 零违规、键盘可达                                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 当前存储与分支合同

- 系统 schema 8；已发布基线为 schema 7，下一次发布必须完成 7 → 8 的真实迁移门禁，见
  [release-plan](../../release-plan.md#下一次发布迁移发布schema-78)。故事代码交付不代替发布验收。
- 库内影子表是选定方案，分库方案的否决理由见 [存储方案](US-314-storage-options.md)。主表集保留旧物理名；
  SQLite 影子表加表集后缀，PGlite 使用影子 schema。物理名只从适配器表名解析器产生，系统表、QueryCache 和无日志实体共享。
- `WorktreeTableSet.heldBranchWhere` 决定实例当前分支。`RxDBBranch.activeKey` 区分主检出位哨兵和可写检出位持有键；
  一条分支只能被一个可写检出位持有，被持有时不得删除或被其他检出位抢占。合并时 `deleteSource` 无法删除被持有的源分支，返回删除错误。
- 事务执行器携带表集；触发器、写捕获、分支切换与合并只作用于该表集。切分支只推进本表集的激活版本号，改动留在原分支。
  合并与播种按 `table-set-scope.ts` 限定成员，不把共享的 QueryCache 数据写入主检出位。
- 只有主检出位执行同步；挂在可写检出位上的实例拒绝同步写入口，QueryCache 出站回推等待挂回主检出位。
  未物化的远端分支须先在主检出位物化，才能在可写检出位打开或切换。

### 从提交建分支

`createBranchFromCommit(branchId, commitId)` 使用提交时冻结的 `CommitForkPoint`，共享该提交之前的历史，创建空工作树而不自动切换。
`checkBranchFromCommit()` 返回预检结果：`unreachable_target`、`fork_point_unknown` 或 `history_rewritten`；不从提交单元猜测日志分叉点。
普通 `createBranch()` 仍复制当前工作树，两者不同。提交后不进日志的拉取/清理会影响物化起点；继承历史的撤销边界按
[US-315](US-315-undo-inherited-change-switch-corruption.md) 执行，不再允许任意改写子分支已继承的历史。

### 生命周期、重建与隔离

- `workingTree.checkouts` 提供 `add` / `mount` / `mountMain` / `release` / `remove` / `rename`；`list` / `prune` 同时管理只读和可写检出位。
  [`Worktree`](../../../packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts) 是登记结构的符号真相源，不在正文复制字段清单。
- 打开在一笔事务内持有分支、建表集、播种、执行插件建表钩子并登记；任一步失败不留半套表。关闭在事务内删表集、释放持有键并删登记，
  未提交改动仍保留在分支日志上。Web Lock 控制认领，别人持有时报 `in_use`；主检出位不能改名或删除。
- 播种在库内复制加密 envelope，不要求解锁。自增序列按已有行对齐，跨检出位独立发号仍可能在后续合并时撞 id，应用应选择合适主键策略。
- `worktreeTableSetFingerprint()` 合并成员结构与插件指纹；挂载不匹配时在同一事务内重建，恢复未提交状态并重跑建表钩子。
  重建失败回滚并报 `schema_rebuild_failed`；重命名列、新增无默认值的必填列、新增加密列等跨结构历史不承诺自动转换。
  `prune()` 按登记、持有键、激活态与物理目录回收孤儿表集。
- 本地实体事件携带 `tableSetSuffix`，查询与搜索用 `WorktreeTableSet.accepts()` 过滤；网关原样转发。换挂先清实体身份缓存，
  再发 `worktreeTableSet$` 并重查。旧表集的实体对象保存时报 `WorktreeTableSetMismatchError`，不写入新表集。
- 草稿缓存按表集隔离，主检出位保留原键；换挂等待旧分区写入落盘再装载新视图。全文索引由插件建表钩子与成员表同事务创建，查询、回填、清理随表集路由。
- SharedWorker 的共用连接由库级 Web Lock 串行化；失去持有者的事务先回滚，断开只释放当前 owner，最后一个 owner 才关闭连接。
  SharedWorker 传输的备份/恢复仍不在支持范围。

### 三端与验证

三端 `useWorktrees()` 共享命令状态与 `mounted` 流；当前分支按挂载表集持有键解析。工具栏提供 Main / Linked、New Worktree、Rename、Delete，
失败保留输入与错误；换挂清除旧详情、对比和选择。删除先确认并说明未提交改动留在分支；焦点、键盘、IME 与明暗主题可访问性由三端 e2e 守护。

复验方式：下方实现文件中的检出位一致性套件、表集隔离/重建、共享连接、草稿、搜索与三端管理用例；不以一次执行数字作为当前通过证明。
A/B/C 的代码交付事实不作为新场景的准入豁免；唯一留有明确例外记录的是 owner 对 B1 底座的先行解锁，不补造 B2/C 的价值评审记录。

## 实现文件

- `packages/rxdb-plugin-working-tree/src/commit/commit-fork-point.entity.ts`、`commit/commit-fork-point.ts`、`commit/write-commit.ts`
  — 分叉点表、提交时记下与读回核对
- `packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts`、`working-tree/working-tree-facade.ts`、
  `commit/branch-commit-rows.ts` — 判定、门面方法与「HEAD 指向点名提交」那一支
- `packages/rxdb-plugin-history/src/create-branch.ts` — 在调用方事务里写分支行、远端查重；`packages/rxdb/src/rxdb-plugin-system.ts`
  — 建分支上下文的 `fromCommitId`
- `packages/rxdb-plugin-working-tree/src/working-tree/testing/worktree.suite.ts` — 六个后端的从提交建分支用例
- `packages/rxdb-plugin-working-tree-{angular,react,vue}/` — 三端绑定（`checkBranchFromCommit` / `createBranchFromCommit`）
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 「Create a branch」对话框、History 右键；三端 Worktree 下拉、New/Rename/Delete 对话框、键盘与 a11y 交互（阶段 C）
- `apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.worktrees.ts`、`apps/dev-rxdb-react/src/app/pages/working-tree/utils/worktrees.ts`、
  `apps/dev-rxdb-vue/src/pages/working-tree/utils/worktrees.ts`（`currentBranchOf` / `heldElsewhere`），三端工作树页、分支下拉与侧栏分支选择器
  — demo 认当前分支（阶段 C），并把可写检出位绑定到三端工作树页（阶段 C）
- `packages/rxdb/src/system/worktree-table-set.ts`、`packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts`、
  `packages/rxdb-adapter-pglite/src/table-name-resolver.ts` — 表集与两个适配器的表名解析器；`scripts/audit/table-name-resolver.mjs` — 门禁
- `packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts`（`generate_table_set_trigger_sql`）、两个适配器的
  `createWorktreeTableSet` / `dropWorktreeTableSet` 与系统迁移、`version/switch_branch.ts`、`with_triggers_disabled.ts` /
  `execute_switch_actions.ts` — 按表集建表与重建触发器；`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-worktree-table-set.suite.ts`、
  `packages/rxdb-adapter-pglite/src/__tests__/worktree-table-set.spec.ts` — 隔离探针
- `packages/rxdb/src/RxDB.ts`（`mountWorktreeTableSet` / `worktreeTableSet$`）、`system/worktree-table-set.ts`（`heldBranchWhere`）、
  `system/system-repositories.ts`、`entity/entity-manager.ts`（`resetForWorktreeTableSet`）、两个适配器的 `version/read_current_branch_id.ts`、
  `packages/rxdb-plugin-history/src/HistoryManager.ts` / `undo-redo-apply.ts` — 实例挂可写检出位；挂载用例在上面两份隔离探针里
- `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`（`add` / `mount` / `mountMain` / `release` / `remove` / `prune`）、
  `checkout/worktree-writable.ts`、`checkout/worktree.entity.ts`、`checkout/worktree-startup-reclaim.ts`、`plugin.ts`；
  `packages/rxdb-adapter-sqlite-core/src/worktree/worktree-table-set.ts`、`packages/rxdb-adapter-pglite/src/worktree/worktree-table-set.ts`、
  两个适配器的 `version/switch-result.utils.ts` 与 `table-name-resolver.ts`；`packages/rxdb/src/rxdb-adapter.ts`（可选槽位）、
  `system/worktree-table-set.ts`（`WorktreeTableSetSeed`） — 可写检出位的生命周期；六个后端的用例在 `working-tree/testing/worktree.suite.ts`
- `packages/rxdb/src/transaction/transaction-executor.interface.ts`（`tableSet`）与两个适配器的事务执行器、
  `packages/rxdb/src/system/system-repositories.ts`（`resolve_current_branch`）、
  `packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts` / `capture-hook.ts`、`checkout/worktree-snapshot.ts`、
  `packages/rxdb-plugin-history/src/VersionManager.ts`、`packages/rxdb-plugin-sync/src/sync-manager.utils.ts`
  （`assertSyncOnMainCheckout`）/ `SyncManager.ts` / `sync-listeners.ts` 与四处写事务 — 当前分支贯穿捕获、历史与同步；
  六个后端的用例在 `working-tree/testing/worktree.suite.ts`
- `packages/rxdb-plugin-history/src/remove-branch.ts`、`merge-branch.ts`、`branch-compare.ts`、`table-set-scope.ts`、`undo-redo-apply.ts`；
  `packages/rxdb-plugin-sync/src/query-cache-outbox.ts`；`packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts`；
  `packages/rxdb-adapter-pglite/src/version/with_triggers_disabled.ts`、`query-cache/query_cache_events.ts`、`worktree/worktree-table-set.ts`；
  `packages/rxdb-plugin-graph/src/sqlite/graph_edge_table.ts`、`graph_edge_entity.ts` — 守卫与修复（阶段 B）
- 两个适配器的 `version/switch_branch.ts`（`switchCheckoutBranch`）、`packages/rxdb-plugin-history/src/VersionManager.ts` /
  `switch-branch-actions.ts`、`packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts`（`activationStateIdOf`）/
  `activation-cas.ts` / `materialize-branch.ts`、`checkout/worktree-writable.ts`（登记行跟随、激活态行、名字）/
  `worktree-manager.ts`（`rename`）/ `worktree.entity.ts`、`plugin.ts` — 检出位里切分支、激活版本号按表集、改名（阶段 B）
- `packages/rxdb/src/rxdb-events.ts`（`tableSetSuffix`）、`system/worktree-table-set.ts`（`accepts` / `ownerSuffixOf` / `eventTagOf`）、
  `RxDB.ts`（挂载信号）、`entity/entity-manager.ts`、`repository/QueryManager.ts`、`system/change.ts`（`tableSetSuffix` 列）、
  `system/migration.ts`（系统 schema 8）；两个适配器的 `handle_rxdb_change.ts`、`version/execute_switch_actions.ts`；`packages/rxdb-plugin-search/src/plugin.ts`；
  `packages/rxdb-adapter-wa-sqlite/src/__tests__/worktree-cross-connection.spec.ts` — 事件按表集路由（阶段 B）
- `packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts`（`sharedClientLockName` / `clientOwner`）、`sqlite-core.types.ts`
  （`release` / `rollbackOrphanTransaction`）、`handle_rxdb_change.ts`；`packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts`、
  `packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts` 与两个包的 `create_sqlite_client.ts` / `RxDBAdapterSqlite.ts`；
  两个包的 `__tests__/shared-client.spec.ts` 与 SharedWorker 夹具 — SharedWorker 共用连接（阶段 B）
- `packages/rxdb-plugin-workspace/src/workspace-entry.ts`（`workspaceStorageKeyOf` / `splitWorkspaceStorageKey`）、`RxDBPluginWorkspace.ts`；
  `packages/rxdb/src/system/worktree-table-set.ts`（`WorktreeTableSetMismatchError`）、`entity/entity-status.ts`（`tableSet`）、
  `entity/worktree-table-set-guard.ts`、`repository/Repository.ts`、`entity/entity-manager.ts` — 草稿缓存按检出位与保存守卫（阶段 B）
- `packages/rxdb/src/rxdb-plugin.ts`（`WorktreeTableSetHooks`）、`RxDB.ts`（`notifyWorktreeTableSetCreated`）；
  `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`；`packages/rxdb-plugin-search/src/plugin.ts`、
  `backend/search-backend.ts`（`bindPlan` / `installForTableSet`）、`backend/fts5-backend.ts`、`core/fts5-runtime.ts`
  （`installFtsForTableSet`）、`core/fts5-installer.ts`、`backend/pg/pg-backend.ts`、`pg-runtime.ts`（`installPgFtsForTableSet`）、
  `pg-fts-contract.ts`；`packages/rxdb-adapter-pglite/src/fts/index.ts`（`getSchemaName`）；`scripts/audit/table-name-resolver.mjs`（R4）；
  `packages/rxdb-plugin-search/src/__tests__/worktree-search.suite.ts` — 全文检索按表集（阶段 B）
- `packages/rxdb/src/backup/schema-fingerprint-encoding.ts`、`backup/schema-fingerprint.ts`、`system/worktree-table-set.ts`
  （`isSuffix` / `schemaFingerprintOf`）、`rxdb-plugin.ts`（`WorktreeTableSetHooks.fingerprint`）、`RxDB.ts`（`worktreeTableSetFingerprint`）、
  `rxdb-adapter.ts`（`listWorktreeTableSetSuffixes`）；两个适配器的 `table-name-resolver.ts` 与 `worktree/worktree-table-set.ts`（`listTableSetSuffixes`）；
  `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`（`mount` 重建、`prune` 收孤儿）、`worktree-startup-reclaim.ts`
  （`findOrphanTableSets`）、`worktree-writable.ts`（`isCheckoutTableSetSuffix`）、`worktree-errors.ts`（`schema_rebuild_failed`）、`plugin.ts`；
  `packages/rxdb-plugin-search/src/plugin.ts`（`fingerprint`） — 按指纹重建与孤儿回收（阶段 B）
- `packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts`（六个命令、`readMountedWorktreeTableSet`）、
  `working-tree/testing/use-worktrees-fixtures.ts`（`createWorktreeHookStubs`）；`packages/rxdb-plugin-working-tree-{angular,react,vue}/src/use-worktrees.ts`
  — 三端绑定（阶段 C）
- `packages/rxdb/src/system/active-branch-guard.ts`（`WorktreeBranchHeldError`）、`system/system-repositories.ts`、
  两个适配器的 `version/switch_branch.ts` 与系统迁移（sqlite-core `RxDBAdapterSqliteBase.ts`、PGlite `system/migrate_system_schema.ts`）
  — 分支持有模型

## References

- [PR #122](https://github.com/aiao-io/rxdb/pull/122)（squash `b109ba33`）— 交付
- [GitHub Desktop 3.6: Worktrees and deeper Copilot integration](https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration/)
- [Managing worktrees in GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop)
