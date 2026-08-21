---
id: US-306
title: 工作树、暂存区与提交操作
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-16
tags:
  [collaboration, working-tree, staging, diff, persistence, concurrency, angular, react, vue, accessibility, benchmark]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305 的 commit graph / `WorkingTreeActivationState`，
      其余契约自包含；不倒挂依赖排在后面的 US-307 / US-308
- [x] Negotiable: 核心 DTO 字段、物理表名和事件名可在 plan 阶段冻结；三框架入口固定为 `useWorkingTree()`
- [x] Valuable: 用户第一次能选择性提交，并在刷新后接着上次干
- [x] Estimable: 状态集合、写入口矩阵、revision 校验矩阵、操作契约与 bench fixture 已列出
- [ ] Small: 体量偏大——同时覆盖全部业务写入口、六类本地后端、working-tree/index 状态机、三框架、
      E2E 与 benchmark。按「交付阶段」表的 A → B → C 顺序分批交付，每个阶段有独立可验收的场景区段；
      不拆成独立故事文件
- [x] Testable: 「改 → stage → 刷新 → commit → 查 status」可独立验收
-->

# 用户故事：工作树、暂存区与提交操作

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> commit 图与 HEAD 的存储契约见 [US-305](./US-305-commit-graph-head.md)。

## 作为/我想要/以便

**作为** 需要控制发布边界的开发者
**我想要** 先在工作树里改，再选择一部分变更进入暂存区，然后用消息提交
**以便** 一次编辑可以拆成多个有意义的版本，且刷新后不必重新判断上次做到哪一步

## 术语与状态模型

| 概念                    | 含义                                                                | 持久化要求                                                       |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 工作树（`WorkingTree`） | 当前分支 HEAD 叠加未提交 `WorkingTreeEntry` 后的逻辑状态            | 按分支持久化；刷新/切回后恢复                                    |
| 暂存区（`Index`）       | 用户明确选择、准备放入下一次 commit 的变更集合                      | 按分支持久化；与工作树分离                                       |
| 工作树状态              | `clean`、`modified`、`staged`、`conflicted`、`restoring` 等可见状态 | `conflicted` 只由 durable restore session 派生；状态不依赖内存栈 |

变更选择粒度为「实体操作或完整事务」，同一事务不可拆到不同 commit。
工作树、index 和 HEAD 的唯一真相源及 revision 关系见 Epic 的
[v1 状态模型](../../epics/epic-006-working-tree-commits.md#v1-状态模型唯一真相源)。

业务实体表只是当前激活分支的物化投影。每次普通 CRUD 必须在同一事务内写入或合并该分支的
`WorkingTreeEntry` 并递增 `workingTreeRevision`；离开分支后，目标状态只能由 HEAD 与这些条目重建。
实现可以复用 `RxDBChange`，但不能只存计数、内存 dirty set 或最后一次切换时的业务表内容。

### 状态关系

```text
                    stage / unstage
工作树（当前数据） ─────────────────────► 暂存区（下一次 commit）
       │                                      │
       │ discard / reset to HEAD              │ commit（原子）
       ▼                                      ▼
     HEAD 状态                            新 commit ───► 分支 HEAD
```

## 交付阶段与边界

阶段顺序是硬约束，阶段之间不可并行；每个阶段有独立可运行的验收场景区段，落地后即可单独回归。

| 阶段 | 交付闭环                             | 主要内容                                                                                                                             | 承接的 FR                                                                                                           | 承接的 AC                                                                                                                                       |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | CRUD / sync 写入 → 刷新 → 工作树重建 | 写入口矩阵、active token、working-tree revision、受信意图登记、加密与后端 conformance                                                | FR-039、FR-046、FR-045（`WorkingTreeEntry` 半边）                                                                   | US1-AC1（工作树半边）、US1-AC3（工作树半边）、US1-AC4（持久层半边）、US2-AC14（工作树半边）、US2-AC17（刷新重放半边）、US2-AC18～19、US4-AC1～7 |
| B    | stage → 刷新 → commit → status/diff  | index 独立重放、关系依赖闭包、commit residual rebase、discard 与冲突状态口径，含 `WorkingTreeRestoreSession` 建表与 `CommitConflict` | FR-004、FR-005、FR-006、FR-007、FR-011、FR-016、FR-031、FR-032、FR-040、FR-041、FR-047、FR-045（`IndexEntry` 半边） | US1-AC1（diff 半边）、US1-AC2、US2-AC1～AC16（AC14 只承接 `IndexEntry` 半边）、US2-AC20～22、US3-AC1～AC3                                       |
| C    | 三端操作 → 刷新 → 同语义读回         | Angular/React/Vue 公开 API、异步状态、a11y、E2E、benchmark 与公开文档                                                                | FR-023、FR-026                                                                                                      | US5-AC1～AC8                                                                                                                                    |

阶段 B 依赖阶段 A 的持久工作树；阶段 C 只从 `@aiao/rxdb` 透传阶段 B 冻结的共享类型，不自带业务分支逻辑，
A 与 B 都未落地时 C 不可开工。整体固定顺序为
**US-305 → 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。US-307 / US-308 的核心持久层语义可与阶段 C
并行开工，但它们的三框架入口必须排在阶段 C 之后；benchmark 追加只涉及 US-307 的 restore 场景，US-308 无 benchmark 交付项（见
[epic-006 依赖顺序](../../epics/epic-006-working-tree-commits.md#依赖顺序)）。

两条 AC 的另一半落在本故事**之外**，由相邻故事收口，审计时按此核对，不得视为无人承接：

| 本故事条目 | 落在本故事外的半边                        | 收口故事与场景                                           |
| ---------- | ----------------------------------------- | -------------------------------------------------------- |
| US1-AC3    | baseline 不含草稿的半边                   | [US-305](./US-305-commit-graph-head.md) AC US2-6         |
| US1-AC4    | 切出/切回端到端往返半边                   | [US-308](./US-308-branch-isolation-conflict.md) US1-AC5  |
| US2-AC17   | remote_sync 单元在切出/切回后仍一致的半边 | [US-308](./US-308-branch-isolation-conflict.md) US1-AC12 |

> 明确不由本故事承接的相邻条目：`WorkingTreeActivationState` 建表归 [US-305](./US-305-commit-graph-head.md) FR-052
> （本故事只消费它做写路径 token 校验，不递增）；分支切换的用户可见语义（切回恢复、`requireClean`、switch CAS）
> 归 [US-308](./US-308-branch-isolation-conflict.md)——本故事只登记 switch 物化路径为受信路径（机制），不改其语义；
> restore session 的**语义**（`restore()` / discard 路径、`active | conflicted | committed` 生命周期、no-op 与
> 兼容预检）归 [US-307](./US-307-restore-session.md)。
>
> 反过来，两件**必须落在本故事内**的相邻资产：`WorkingTreeRestoreSession` 的**建表与 schema 迁移**，以及
> `CommitConflict` 的类型定义/api-baseline 登记，都在阶段 B 交付——FR-004 的 durable conflicted 与全部 CAS
> 失败诊断由阶段 B 首先落地，表和类型不能等到排在其后的 US-307 / US-308 才存在（与 `WorkingTreeActivationState`
> 前移到 US-305 同一条规则，见
> [epic-006 状态归属](../../epics/epic-006-working-tree-commits.md#状态归属哪个故事负责建表)）。阶段 B 只建表
> 并实现「从已存在 session 派生 conflicted」的读路径，写入该 session 的领域操作归 US-307。

**与 US-308 的分工（重要）**：凡「必须真的切一次分支才能观察」的行为——切出再切回后恢复目标分支工作树、
分支间隔离——一律归 [US-308](./US-308-branch-isolation-conflict.md)，本故事不写这类验收场景。本故事用
**持久层重放断言**等价覆盖同一份数据契约：清掉进程内状态、只喂 HEAD + `WorkingTreeEntry`，验证能重建出相同结果。
这样阶段 A 在 US-308 之前就能独立验收，也不会把同一条断言在两个故事里各写一遍。

## 范围边界

### In Scope

- 工作树与暂存区状态的持久化与刷新后重建
- 普通 CRUD、`WorkingTreeEntry` 与 `workingTreeRevision` 的原子双写；active branch token 校验遵守 Epic 矩阵
- `pull` / autoSync / repository sync / bulk sync、merge、undo/redo 等全部业务表写入口遵守 Epic 写入口矩阵
- `workingTreeRevision` / `indexRevision` 的事务内 CAS；跨 realm 的数据安全原语在本故事完成，不推迟到 US-308
- `status()`：至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中、冲突
- `diff(scope?)`：分别比较 `HEAD ↔ 工作树` 与 `HEAD ↔ 暂存区`
- `stage` / `unstage` / stage all / `clearIndex`
- `commit(message, options)`：`authorId`、`operationId` 必填，只提交暂存区内容，保留未暂存修改
- `discardWorkingTree()`：回到当前 HEAD
- stage 后再次编辑时保留 staged 快照，新增部分标记为 unstaged
- stage / unstage 对跨实体、跨事务依赖执行可独立从 HEAD 重放的递归闭包，并返回实际选择列表
- **受信路径的意图登记**：与 raw/未知 bypass 拒绝门禁同批交付，登记以**调用方意图**为键、不以传输层函数为键
- `WorkingTreeRestoreSession` 的**建表与 schema 迁移**，以及「从已存在 session 派生 conflicted」的读路径
- 共享 DTO（`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、
  `WorkingTreeCommandError`、`CommitConflict`）的定义、TSDoc 与 api-baseline 登记；`CommitConflict` 由本故事
  首个使用者落地，[US-308](./US-308-branch-isolation-conflict.md) 只做 activation 维度扩展
- Angular / React / Vue 三端对称 API 与演示
- `pnpm nx run benchmarks:bench-working-tree` 中 status / diff / stage 的性能基线（本故事拥有该 target 本身）

### Out of Scope

- commit 图、HEAD、分支引用的存储布局与迁移 —— 属 [US-305](./US-305-commit-graph-head.md)
- 历史恢复会话的**语义** —— 属 [US-307](./US-307-restore-session.md)（本故事只建表、让 `status()` 能表达
  `restoring`，并从已存在 session 派生 conflicted）
- 分支切换入口、冲突记录和三端冲突提示 —— 属 [US-308](./US-308-branch-isolation-conflict.md)；底层 revision CAS 不在其范围
- Workspace 插件 NEW 草稿本身：草稿留在插件独立 IndexedDB，不进工作树；`save()` 后才作为普通 INSERT 捕获
- Tauri Rust host 的 conformance —— 待 US-210 Done 后按 epic 统一补入
- 字段级或代码行级的部分暂存
- 自动 stash / stash pop

## 用户场景与验收标准

### User Story 1 - 刷新后继续未提交工作（Priority: P1）

**独立测试**：创建、修改、删除若干实体，stage 一部分，刷新或关闭并重新打开；只依赖本地存储即可验证。

**验收场景**：

1. **Given** 当前分支有一个已提交的 HEAD，**When** 用户修改实体但不 commit 后刷新，**Then** 工作树数据、未暂存标记和对应 diff 与刷新前一致。
2. **Given** 暂存区已有实体变更，**When** 用户刷新或重新打开应用，**Then** 暂存区选择、变更顺序和事务边界保持不变。
3. **Given** Workspace 插件中只有 NEW 草稿，**When** 应用启动，**Then** 草稿仍按 Workspace 插件规则恢复，不出现在 SQL/PGlite 工作树或 baseline 中；草稿 `save()` 后才作为普通 INSERT 进入工作树。
4. **Given** A 分支存在未暂存 INSERT/UPDATE/DELETE，**When** 用户切到 B、关闭应用、重新打开并切回 A，**Then** A 的业务数据可仅凭 HEAD 与持久化 `WorkingTreeEntry` 完整重建，变更单元身份和 diff 不变。

### User Story 2 - 暂存并提交一组变更（Priority: P1）

**独立测试**：对两个实体做不同修改，只 stage 其中一个并提交，检查 HEAD、日志和另一个实体的工作树状态。

**验收场景**：

1. **Given** 工作树包含两个实体的修改，**When** 用户只 stage 其中一个并 commit，**Then** 新 commit 只包含被 stage 的变更，另一个修改仍在工作树且未进入该 commit。
2. **Given** 暂存区为空，**When** 用户提交，**Then** 操作被拒绝，不创建空 commit，工作树和 HEAD 均不改变。
3. **Given** stage 后实体再次修改，**When** 用户查看 status/diff，**Then** 系统分别展示「已暂存版本」和「未暂存版本」，不会把新修改静默并入旧 stage。
4. **Given** stage 集合包含一个多实体事务，**When** 用户 commit，**Then** 该事务作为一个不可拆分的变更单元写入 commit。
5. **Given** 删除实体后 stage，**When** 查看 diff，**Then** 必须显示删除，而不是显示为空或消失。
6. **Given** commit 成功，**When** 查看工作树，**Then** 只清除已提交的暂存区条目，未暂存变更继续留在工作树并显示准确 diff。
7. **Given** 空事务、重复 stage、重复 discard，**When** 反复执行，**Then** 幂等，不产生额外 commit 或错误历史。
8. **Given** stage 后任意 realm 又编辑同一实体，**When** 用户查看 status 或提交原 stage，**Then** staged snapshot 保持不变，后续编辑统一显示为 unstaged；提交不得覆盖或丢弃后续编辑。
9. **Given** 两个 realm 从相同 index/head revision 开始 stage 或 commit，**When** 它们竞争同一分支，**Then** 条件更新只允许一个操作成功；失败方不留下半成品 index/commit，并返回 expected/actual revision。
10. **Given** 已 stage 的实体后来又被编辑，**When** 用户再次 stage 同一选择，**Then** staged snapshot 原子替换为当前工作树版本，新增编辑不再显示为 unstaged；工作树未变化时重复 stage 是 no-op 且不递增 revision。
11. **Given** 用户只选择一个属于多实体事务的实体，**When** stage 或 unstage，**Then** 系统自动扩展到该 `transactionId` 的完整变更单元及其跨事务实体关系依赖，并返回实际选择列表，不允许把事务或可重放依赖拆进不同 commit。
12. **Given** 另一个 realm 在本次 stage 捕获 token 后修改工作树，**When** stage 尝试落盘，**Then** `workingTreeRevision` CAS 失败，index 零变化；调用方刷新后可重新选择。
13. **Given** 普通提交缺少 `authorId`、缺少 `operationId` 或 message trim 后为空，**When** 调用 commit，**Then** 在任何持久状态变化前返回类型化校验错误。
14. **Given** 实体含 `encrypted: true` 字段，**When** CRUD、stage、刷新并 commit，**Then** 原始 WorkingTreeEntry 与 IndexEntry dump 中明文哨兵零命中，解锁后的 status/diff/commit 语义与未加密字段一致。
15. **Given** T1 插入 A/B、T2 随后更新 A，且 HEAD 中不存在 A/B，**When** 用户只选择 T2 stage，**Then** 系统递归扩展为 T1+T2 并返回实际单元列表；生成的 index 可仅凭 HEAD 完整重放。unstage T1 时必须同时移除依赖它的 T2，任何一步失败 index 零变化。
16. **Given** T1 插入 Parent P、T2 插入引用 P 的 Child C，且 HEAD 中均不存在，**When** 用户只选择 T2 stage，**Then** 关系闭包必须包含 T1 并按 Parent→Child 重放；反向 unstage T1 必须移除 T2。父子 DELETE、关系键 UPDATE 与关系环各有稳定拓扑或类型化拒绝结果。
17. **Given** full/filter 同步通过 `disableTriggers=true` 应用远端实体变更，**When** pull/autoSync/repository sync/bulk sync 提交，**Then** 同一事务写入 `origin=remote_sync` 的未暂存 WorkingTreeEntry，不生成可 push 的本地 `RxDBChange`；**刷新后**status、diff 与业务值保持一致（本故事只承接刷新重放半边，切出/切回半边由 [US-308](./US-308-branch-isolation-conflict.md) US1-AC12 收口，见「交付阶段与边界」的半边表）。
18. **Given** 同步只回填 remoteId、推进水位或更新时间而没有业务实体变化，**When** 事务提交，**Then** 不创建 WorkingTreeEntry、不递增 working-tree revision。
19. **Given** 实体使用 QueryCache 同步类型，**When** cache upsert/delete/过期清理发生，**Then** 该实体不进入 baseline、status、diff、stage 或 commit；若一个 callback transaction 先后写入 QueryCache 与版本化实体，检测到混用时以 `mixed_versioned_cache_transaction` 终止并回滚整个事务，提交后两类数据均零变化。
20. **Given** commit 响应丢失，**When** 以相同 operation ID 与相同 payload 重试，**Then** 返回原 commit；payload 不同返回 `idempotency_key_reused`。
21. **Given** 存在 active restore session 且其 expected revision 与当前值分叉（表由本故事阶段 B 建立，fixture **直接写入 session 行**构造分叉，不经 [US-307](./US-307-restore-session.md) 的 `restore()` 入口——与阶段 A 直接推进 `activationRevision` 同源），**When** 调用 `status()`，**Then** 返回 durable conflicted；session 解决或删除后该状态消失。
22. **Given** 普通 stage/commit 的 CAS 失败，**When** 刷新后调用 `status()`，**Then** 状态按最新持久数据重建，不因历史失败永久显示 conflicted。

### User Story 3 - 丢弃与清空（Priority: P2）

**验收场景**：

1. **Given** 工作树有未提交修改，**When** 用户 `discardWorkingTree()`，**Then** 工作树回到当前 HEAD，未提交 stage 一并清除，历史 commit 不变。
2. **Given** 暂存区有条目，**When** 用户 `clearIndex()`，**Then** 只清除暂存选择，工作树数据不变。
3. **Given** 同一事务跨多个实体且含外键依赖，**When** discard，**Then** 在事务边界内整体回滚，不留下部分实体的中间态。

### User Story 4 - 写入口捕获与绕过防护（Priority: P1，阶段 A）

**独立测试**：所有断言都在持久层完成，不需要 US-308 的 switch 入口先落地。

**验收场景**：

1. **Given** 当前分支有 HEAD，**When** INSERT/UPDATE/DELETE 成功，**Then** 业务行、完整 `WorkingTreeEntry` 与递增后的 working-tree revision 在同一事务可见；任一步失败全部回滚。
2. **Given** 当前分支有未提交数据，**When** 丢弃业务表投影与全部进程内状态后只喂 HEAD + `WorkingTreeEntry` 冷重放，**Then** 结果与刷新前逐字段相等——这条断言证明「非激活分支可仅凭 HEAD 与自己的变更单元恢复」，无需经过 `switchBranch` 入口；切出再切回的端到端往返由 [US-308](./US-308-branch-isolation-conflict.md) US1-AC5 验收。
3. **Given** mergeBranch（per-change 与 squash 两条策略分支）、undo/redo 或 `VersionManager.restoreEntity()` 修改业务表，**When** 操作提交，**Then** 对应工作树单元与操作自身 revision 在同一事务收敛。
4. **Given** realm A 在读取实体时捕获了 `{ branchId, activationRevision }`，**When** 另一个 writer 推进了 `activationRevision`（fixture 直接推进该单行状态，不经 `switchBranch` 入口）后 A 保存旧实体，**Then** 写事务以 `stale_active_branch` 拒绝，业务表与工作树零变化，错误返回 expected/actual。真实双 Tab「Tab B 切分支 → Tab A 保存旧实体」的端到端 fixture 归 [US-308](./US-308-branch-isolation-conflict.md) US2-AC5；本故事只证明写路径的 token 校验本身成立。
5. **Given** commit capability 已启用，**When** raw SQL 或未知 adapter 路径试图绕过工作树维护，**Then** 在业务提交前返回 `commit_capability_mismatch`，不得先写实体再补记事件。
6. **Given** AC5 的 bypass 拒绝门禁已启用，且写路径按**调用方意图**而非按函数名登记，**When** `switchBranch` 物化 / baseline 物化以受信意图关闭 trigger 重写业务投影，**Then** 操作正常完成、不被 `commit_capability_mismatch` 拒绝、不产生工作树单元、不递增 `workingTreeRevision`。
7. **Given** 同一批底层函数（`adapter.switchBranch`、`mergeChanges(disableTriggers)`）被不同意图调用，**When** 意图为 `restore` 实体、undo/redo 应用、merge 应用、pull 批量或 `cleanupExpired()` 过期删除，**Then** 每一类都必须产生对应 origin（`restore` / `undo_redo` / `merge` / `remote_sync`）的工作树单元并递增 `workingTreeRevision`——**受信登记不得因为它们共用同一个 adapter 函数而顺带放行**；**When** 批量重写不携带任何已登记意图，**Then** 以 `commit_capability_mismatch` 拒绝。此条只验证「意图登记机制成立」，切换分支后的工作树恢复语义归 US-308。

### User Story 5 - 三端对称操作面与性能门禁（Priority: P1，阶段 C）

**作为** Angular、React 或 Vue 应用开发者，**我想要** 使用同名、同语义的工作树 API 和状态，
**以便** 框架选择不会改变 status、stage、commit 与错误处理能力。

**验收场景**：

1. **Given** 三端加载同一 fixture，**When** status → stage → refresh → commit，**Then** 三端返回相同状态、依赖闭包、commit 摘要和错误 code。
2. **Given** 查询无 diff，**When** 页面渲染，**Then** empty 与 clean 可被辅助技术读取；命令不伪造 empty。
3. **Given** 命令运行、成功或失败，**When** 状态变化，**Then** 三端均暴露 loading/success/error，错误包含操作、对象和恢复建议。
4. **Given** 仅键盘操作，**When** 浏览 diff、选择单元、stage、clear 或 commit，**Then** 焦点顺序、可见焦点、名称与状态公告达到 WCAG 2.1 AA。
5. **Given** 最长实体名、错误文本和窄视口，**When** 状态更新，**Then** 文本不溢出、遮挡或改变固定工具栏尺寸。
6. **Given** 任一共享类型或运行时入口只在一到两端导出，**When** parity 门禁运行，**Then** 整个故事失败，不能把单端实现记为 Done。
7. **Given** Epic 冻结的 Node + PGlite memory fixture 与已签入的 reference 报告，**When** 执行 `pnpm nx run benchmarks:bench-working-tree`（status、完整 diff、批量 stage 50 单元，各 5 次 warmup / 50 次采样），**Then** 输出含 p50/p95、control ratio、fixture hash 与 `runnerProfileHash` 的报告；归一化 ratio 超过 reference median 110% 时门禁失败，且失败后不得以重算基线的方式转绿；`runnerProfileHash` 与 reference 匹配时额外以绝对 p95 100 ms 作为发布门禁，不匹配时该绝对判据 MUST 跳过而非放宽为通过。
8. **Given** `useWorkingTree()` 的三端契约冻结，**When** 公开文档发布，**Then** 文档说明数据库级显式启用方式、工作树与草稿缓存（`@aiao/rxdb-plugin-workspace`）的区别、恢复语义、commit 历史长期保留敏感旧值的风险、加密边界与不改写历史的承诺，并明示远端同步会产生 `origin=remote_sync` 的未提交变化（承接 [epic-006 发布门禁 9](../../epics/epic-006-working-tree-commits.md#发布门禁)）。

## 功能需求

- **FR-004**：系统 MUST 提供工作树 status，至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中和冲突状态。普通命令 CAS 失败只返回一次性 `CommitConflict`，不得形成 durable conflicted；v1 的 conflicted 只由仍存在且 revision 已分叉的 `WorkingTreeRestoreSession` 重建。
- **FR-005**：系统 MUST 提供面向实体或完整事务的 diff，能够分别比较 `HEAD ↔ 工作树` 和 `HEAD ↔ 暂存区`。
- **FR-006**：系统 MUST 支持 stage、unstage、stage all 和 clear index；这些操作不得修改已有 commit，也不得丢弃未选择的工作树变更。
- **FR-007**：系统 MUST 在 stage 后再次发生编辑时保留 staged 快照，并把新增部分标记为 unstaged；禁止隐式扩大 stage 范围。
- **FR-011**：系统 MUST 在 commit 成功后只清除已提交的暂存区变更；未暂存变更继续留在工作树并显示准确 diff。
- **FR-016**：系统 MUST 支持 discard working tree 和 clear index，且两者操作范围明确：前者回到当前 HEAD，后者只清除暂存选择。
- **FR-023**：系统 MUST 为异步命令提供 loading、success、error，为查询额外提供 empty；错误必须说明操作、对象和恢复建议。
- **FR-026**（已改口径）：`bench-working-tree` MUST 在 Node + PGlite memory、10,000 条实体 / 100 个 commit、100 个 unstaged / 50 个 staged 单元的固定 fixture 下，以 5 次 warmup、50 次采样测完整 status、完整 diff 和批量 stage 50 个单元并输出 p50/p95、runner profile 与 JSON。普通 CI 以归一化 ratio 不超过已签入 reference median 的 110% 为硬门禁；三项 promise resolve 的 p95 不高于 100 ms 只在 `runnerProfileHash` 匹配 reference 的固定性能 runner 上作为发布硬门禁。浏览器 OPFS / IDB 不承诺相同绝对数字。
- **FR-031**：所有操作 MUST 遵守 Epic revision 矩阵：stage/re-stage 同时校验 expected working-tree 与 index revision；unstage/clear index 校验 index revision；commit 校验 active branch token、head 与 index revision，并在同一事务读取当前工作树完成 residual rebase。commit 不得仅因 stage 后普通编辑改变 working-tree revision 而拒绝，也不得覆盖该编辑。CAS 失败时操作全量回滚。
- **FR-032**：stage 后发生的实体编辑不按 writer 身份分叉处理；无论来自当前 realm 还是其他 realm，都 MUST 保留为相对 staged snapshot 的 unstaged 变更。writer 身份不得成为提交正确性的必要条件。
- **FR-039**：每次普通 CRUD MUST 在同一事务内校验 active branch token、写入业务实体、写入或合并完整 `WorkingTreeEntry` 并递增 `workingTreeRevision`。任一步失败全部回滚；禁止只靠内存 dirty set 重建。
- **FR-040**：stage/re-stage MUST 同时校验 expected working-tree 与 index revision；已暂存选择在工作树变化后再次 stage 时替换为当前快照，未变化的重复调用是 no-op。实体选择命中多实体事务时 MUST 自动扩展整个事务，stage 与 unstage 规则对称。
- **FR-041**：普通提交 MUST 接收 trim 后非空 message 与必填 `CommitOptions.authorId`、`CommitOptions.operationId`；调用方 metadata 只能放扩展审计字段，不得覆盖 parent、时间、作者、operation ID、schema/codec manifest 或变更数量。
- **FR-045**：WorkingTreeEntry 与 IndexEntry MUST 延续字段加密 at-rest 契约；读取可在解锁后返回明文业务值，但任何持久化 dump、错误和摘要不得出现加密字段明文。
- **FR-046**：所有业务实体写入口 MUST 遵守 Epic 写入口矩阵。full/filter 远端实体应用即使关闭 `RxDBChange` trigger，也 MUST 在同一事务写入 `origin=remote_sync` 的未暂存单元且不得形成 push echo；纯同步元数据更新不改变工作树。QueryCache 实体 MUST 完整排除；callback transaction 在任意时点检测到 QueryCache/版本化实体混用时 MUST 抛 `mixed_versioned_cache_transaction` 并回滚整个事务，不能要求事务系统预知回调未来操作。raw/未知绕过路径 MUST fail-fast。
- **FR-047**：Index MUST 在任何 revision 下都能仅凭当前 HEAD 与自身条目重放。stage 选择 MUST 向前扩展同实体前置单元，并按完整事务、schema relation graph 与实际行引用递归包含跨实体/跨事务依赖；unstage 前置单元 MUST 向后移除失去实体、事务或关系依赖的 staged 单元。闭包按依赖拓扑稳定排序；不能拆分的关系环纳入同一原子单元，无法形成闭包时返回 `index_dependency_cycle`。计算失败或 CAS 失败时 index 零变化。

> FR-026 保留原 100 ms 产品预算，但把环境、数据分布、完成时点、采样数和 p95 口径固定下来；相对门禁使用
> 同次 control CRUD 归一化与 Epic 冻结的 reference，不照搬 hot-path bench 的 2%。浏览器首次可见状态由三端 E2E 单独记录。

### 实现级约束

- 每个成功工作树单元 MUST 包含分支、实体/事务身份、操作、可恢复数据、当前指纹、来源 change ID 与 origin。
- callback transaction 的混合类型只能在执行过程中被发现；检测后 MUST 通过事务回滚保证提交边界外零变化，
  不要求系统预知回调未来操作。
- `WorkingTreeState` 只存 revision/计数不算完成；条目必须可枚举、可重放并按分支隔离。
- 受信路径登记 MUST 与 bypass 拒绝门禁同批交付：既有 switch / baseline 物化在门禁启用后 MUST 继续可用，
  且 MUST NOT 产生工作树单元或递增 `workingTreeRevision`。未登记的批量重写 MUST 仍被拒绝。
- 登记的键 MUST 是调用方意图，不是底层函数。每个关 trigger 的写路径 MUST 在事务上下文中携带一个显式意图枚举
  （枚举名在 plan 阶段冻结），由调用点一直传到事务体；同一函数的不同意图 MUST 得到不同处置。登记表以
  [epic-006 调用点登记表](../../epics/epic-006-working-tree-commits.md#写入口语义矩阵)为准，新增
  `disableTriggers` 调用点 MUST 先登记再实现，未登记即拒绝。
- 新增公开类型（`WorkingTreeState`、`WorkingTreeEntry`、`IndexState`、`IndexEntry` 及全部共享 DTO 与错误码）
  MUST 补齐 TSDoc 并登记进 `requirements/api-baseline/rxdb.json`，前缀遵守 epic 术语表（禁止 `Workspace*`）。
- 阶段 C 不承接任何持久层 FR：状态机语义归阶段 B，写入口捕获归阶段 A；三端只做透传与呈现，不得自带业务分支逻辑。

## 关键实体

- **WorkingTreeState**：数据库/分支级工作树状态；基于哪个 HEAD、是否恢复中、未提交变更计数、`workingTreeRevision`。
- **WorkingTreeEntry**：数据库/分支级未提交变更单元；实体或完整事务身份、操作、patch/inverse patch 或等价快照、当前指纹、来源 change ID、`local | remote_sync | merge | undo_redo | restore` 来源。
- **IndexState**：数据库/分支级 index 水位；`indexRevision`、基线 HEAD、条目计数。
- **IndexEntry**：分支级暂存区条目；变更单元 ID、基线 commit、暂存快照、stage 时工作树 revision、依赖单元 ID、stage 时间。
- **CommitOptions**：普通提交选项；必填 `authorId`、`operationId`，可选 `metadata`。保留审计字段不能由 metadata 覆盖。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 设计展开

### 操作契约

内部 DTO 字段布局在 plan 阶段冻结；核心操作名与语义保持以下边界，公开共享类型和三框架映射见 US-306 阶段 C：

| 操作                       | 语义                                                      | revision 校验                        | 成功变化                                  | 创建 commit |
| -------------------------- | --------------------------------------------------------- | ------------------------------------ | ----------------------------------------- | :---------: |
| `status()`                 | 返回工作树、暂存区、HEAD 和冲突摘要                       | 读取一致快照                         | 无                                        |     否      |
| `diff(scope?)`             | 比较 HEAD、暂存区、工作树的变更                           | 读取一致快照                         | 无                                        |     否      |
| `stage(selection)`         | 将实体或完整事务的当前版本复制进暂存区；re-stage 刷新快照 | active + working-tree + index        | index；工作树不变                         |     否      |
| `unstage(selection)`       | 从暂存区移除实体所属的完整事务单元，工作树不变            | active + index                       | index                                     |     否      |
| `commit(message, options)` | 以必填 author/operation ID 原子写入 commit 并移动 HEAD    | active + head + index                | head、index、working-tree residual rebase |     是      |
| `discardWorkingTree()`     | 丢弃工作树未提交变更并回到 HEAD                           | active + head + working-tree + index | working-tree；index 非空时同时变化        |     否      |
| `clearIndex()`             | 清空暂存选择                                              | active + index                       | index                                     |     否      |

所有修改操作按 Epic 的 revision 矩阵接收或内部捕获 expected revision，并在事务内做条件更新。公开 API 是否显式
暴露 expected revision 在 plan 阶段冻结，但 active branch token 必须随实体/realm 上下文传入写路径，不能在事务开始后
重新读取新分支来掩盖 stale writer；冲突错误必须返回 expected/actual，调用方不能靠字符串解析。

上表是**调用方捕获型** CAS。普通 CRUD 的 `workingTreeRevision` 是**事务内读改写**递增（不接收调用方 expected 值、
不因并发失败），两者不重叠，见
[epic revision 校验矩阵](../../epics/epic-006-working-tree-commits.md#revision-校验矩阵)。

`CommitConflict` 只描述一次失败命令。v1 不持久化通用冲突表；`status().conflicted` 只由 durable
`WorkingTreeRestoreSession` 派生，不能依赖页面内存保留一次旧 CAS 错误。

### 三框架公开契约（阶段 C）

三端都 MUST 导出 `useWorkingTree()`，并从 `@aiao/rxdb` 透传同一组共享类型：
`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、
`WorkingTreeCommandError`、`CommitOptions`、`CommitConflict`。

`useWorkingTree()` 的返回对象在三端保持同一组语义键：

| 键                                  | 语义                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| `status`                            | 当前持久状态；支持 clean/modified/staged/restoring/conflicted |
| `diff`                              | HEAD↔working tree 与 HEAD↔index 的当前差异                    |
| `refresh`                           | 主动读取最新 revision                                         |
| `stage` / `unstage`                 | 返回实际依赖闭包                                              |
| `clearIndex` / `discardWorkingTree` | 明确范围的清理命令                                            |
| `commit`                            | message + CommitOptions 提交                                  |
| `commandState`                      | 当前命令的 idle/loading/success/error 与类型化错误            |

Angular 使用 signal、React 使用 state/store、Vue 使用 ref 只是容器差异；导出名、参数、返回键、错误 code、
empty/loading/success/error 判定和恢复建议必须对称。不得让某一端额外拥有业务能力。

#### 扩展点（本故事冻结协议，不冻结键的全集）

上表是 **v1 基线键集**，对应本故事交付时可用的能力；它**不是**最终全集。后续故事按同一协议向 `useWorkingTree()`
追加键，本故事负责把「怎么加」定死，避免它们各自另立入口：

| 追加者                                          | 新增键                    | 约束                                                                                               |
| ----------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| [US-307](./US-307-restore-session.md)           | `restore`、`restoreState` | 复用同一 `commandState` 形状与错误 code 结构；`status` 的 `restoring` 值在本故事已存在，不得改语义 |
| [US-308](./US-308-branch-isolation-conflict.md) | 分支切换与冲突提示入口    | 同上；不得在某一端把切换做成组件内部逻辑                                                           |

追加 MUST 满足：三端同名同签名同返回键、共享类型仍从 `@aiao/rxdb` 透传、`tri-framework-check` 与 a11y 门禁
对新键同样生效（缺一端整故事失败）。追加者 MUST NOT 重定义已冻结键的语义；确需变更时改本故事并同步三端。

### 性能门禁（阶段 C）

- 新增 `pnpm nx run benchmarks:bench-working-tree`，使用 Epic 固定的 Node + PGlite memory fixture。
  **本故事拥有该 target 本身**：fixture 构造、warmup/采样参数、`runnerProfileHash`、报告 JSON 结构与
  reference 签入流程。[US-307](./US-307-restore-session.md) FR-026b 只向其中**追加 restore 采样场景**，
  不新建 target、不改报告结构、不重算已冻结的 reference。
- status、完整 diff、批量 stage 50 单元执行 5 次 warmup、50 次采样，输出 p50/p95、control ratio、fixture hash 与 runner profile。
- 普通 CI 的归一化 ratio 不得超过冻结 reference median 的 110%；绝对 p95 100 ms 只在 profile 匹配的固定 runner 上作为发布门禁。
- 三端 E2E 记录首次可见状态耗时，但浏览器 OPFS/IDB 不承诺相同绝对数字。

### 边界情况

- stage 后实体被任意 realm 删除或更新：不改写 staged snapshot，变化作为 unstaged 保留；只有 head/index/worktree revision CAS 失败才返回并发冲突。
- commit staged snapshot 时读取当前 `WorkingTreeEntry` 并原子 rebase：与 staged snapshot 相同的部分删除，后续编辑形成的差量保留；不得用 staged snapshot 覆盖业务表。
- stage/unstage 的实体选择命中 transactionId 时统一扩展完整事务；错误和返回值列出实际受影响的全部实体。
- 闭包不仅扩展当前 transactionId：同一实体被多个未提交单元顺序修改时，stage 向前包含重放所需前置单元，
  unstage 向后移除失去前置的 staged 单元；递归跨过事务成员、schema relation 与实际行引用直到 index 自包含。
- 远端实体应用继续关闭本地 change trigger 以避免 push echo，但关闭 trigger 不等于关闭工作树记录；远端 action、
  WorkingTreeEntry 和同步水位必须共享一个事务，任一步失败全部回滚。
- QueryCache 是可丢弃投影，不参与版本历史。callback transaction 无法预知回调未来操作；一旦检测到 QueryCache 与
  版本化实体混用就抛错并回滚整个事务，保证提交边界外零变化，不伪造“首笔 SQL 前即可预知”的能力。
- 存储配额不足、浏览器禁用持久化或 schema 升级失败：明确报告持久化不可用，禁止把状态伪装成已保存。
- undo/redo 与 commit 同时触发时按调用顺序串行化；redo 仍是会话级能力，不能被误报为 durable commit。

## 测试要求

### 横切

- 核心包按 TDD 先写失败用例，再实现；覆盖率不低于 90%。
- 测试文件使用 `*.spec.ts`，跨 realm fixture 不依赖固定延时。
- 新增公开导出缺 TSDoc 时 lint 失败（零警告门禁）；api-baseline diff 未同步更新即失败。

### 阶段 A — 写入口捕获

- `workingTreeCaptureConformanceSuite` 在 6 个 v1 本地后端（PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai、
  Electron `node:sqlite` host）运行，逐项覆盖 CRUD、callback transaction、pull / autoSync / pullRepository /
  sync / bulkSync、mergeBranch、undo/redo、`cleanupExpired()` 过期删除、QueryCache 与 raw bypass。任一后端缺席即未完成。
- 必须注入「业务行已写、`WorkingTreeEntry` 写入前失败」，断言事务全量回滚；旧 active branch token 写入被拒绝。
- 断言业务表变化必有对应工作树变化，纯 remoteId/watermark 更新无工作树变化，远端应用不产生 push echo。
- **冷重放测试**：丢弃业务表投影与全部进程内状态后，仅凭 HEAD + `WorkingTreeEntry` 重建，逐字段比对刷新前快照。
- **受信路径测试**：登记路径的批量重写通过门禁且零工作树副作用；同一重写走未登记路径时断言 `commit_capability_mismatch`。
- **意图登记漂移测试**：静态扫描全部 `adapter.switchBranch` / 本地 `mergeChanges(disableTriggers)` 调用点，
  与 epic 登记表逐条比对；出现未登记调用点即失败。扫描口径固定为：
  - 比对键是**文件 + 符号 + 意图**（如 `merge-branch.ts · merge_branch · per-change 应用`），不是行号，
    重排代码不得让门禁变红或漏检。符号取**实际发起该次批量重写的最内层具名函数**，不是把调用委托出去的
    公开门面方法（例如 restore 那一项登记 `restore-entity.ts · restore_entity`，而不是
    `VersionManager.ts · restoreEntity`）；
  - 必须区分同名的两个 `mergeChanges` 重载——只有本地重载 `(actions, localChanges?, disableTriggers?)` 进登记表，
    远端重载 `(actions, branchId?, changes?)`（`push-repository` / Supabase 推送）MUST NOT 被登记；
  - 扫描范围 MUST 排除 `dist/`：构建产物虽已 gitignore，但在本地工作副本中常驻，按文本 grep 会命中 `.d.ts` 声明。

  必须显式覆盖「同一函数、受信意图零副作用 vs 非受信意图必须产生工作树单元」的成对断言，防止按函数放行把
  restore / undo/redo / merge / pull 静默吞掉。

- QueryCache fixture 必须证明 cache 刷新/淘汰不污染 status，混合事务在持久化前失败。

### 阶段 B — 暂存区与提交状态机

- 先写 index 不可重放和 residual edit 丢失的失败用例。
- `workingTreeCommitConformanceSuite` 在同样 6 个 v1 本地后端运行，覆盖 stage/unstage/commit/discard 的
  revision CAS、崩溃恢复与幂等。US-305 的 commit 图 / HEAD 断言并入同一 suite（见
  [epic-006 conformance 口径](../../epics/epic-006-working-tree-commits.md)），任一后端缺席即未完成。
- 依赖闭包 fixture 至少覆盖 INSERT→UPDATE、UPDATE→DELETE、多实体事务、Parent INSERT→Child INSERT、
  Child DELETE→Parent DELETE、关系键 UPDATE 与关系环；每个成功 index 都必须通过「从 HEAD 在空投影重放」的通用断言。
- 双 realm fixture 覆盖 stage、re-stage、commit、discard CAS。
- 幂等 fixture 必须断言「不递增 revision」，而不只是「不报错」。
- `WorkingTreeRestoreSession` 需独立 fixture：启用后表存在、可直接写入 session 行并派生 `status().conflicted`、
  session 删除后该状态消失；全程不依赖 US-307 的 `restore()` 入口。
- 支持字段加密的后端必须扫描 `IndexEntry` 原始 dump，断言明文哨兵零命中。
- API baseline 与类型契约覆盖全部核心 DTO、选项和类型化错误（含 `WorkingTreeStatus` / `WorkingTreeDiff` /
  `WorkingTreeSelection` / `WorkingTreeStageResult` / `WorkingTreeCommandError` / `CommitConflict`，
  即阶段 C 三端透传的共享类型全集）。

### 阶段 C — 三框架与性能

- 三端 `src/index.ts` 导出与共享类型透传通过 `tri-framework-check`，缺一端即失败。
- 三端各有等价组件测试，统一 fixture 验证返回键、状态转换、错误 code 和恢复建议。
- Playwright 覆盖 status → stage → refresh → commit，以及失败、empty、键盘和屏幕阅读器名称。
- `pnpm nx run benchmarks:bench-working-tree` 按 Epic 固定的 100 dirty / 50 staged fixture、50 次采样与冻结
  reference ratio 纳入普通 CI；固定性能 runner 额外执行绝对 p95 发布门禁，报告都写入 `benchmarks/reports/`。
  benchmark reference 必须先于候选发布签入；失败后不得重算基线。
- 公开文档（US5-AC8）随三端契约一并签入，覆盖发布门禁 9 的六项内容；文档中出现的 API 示例必须与
  `useWorkingTree()` 的实际导出一致，示例代码纳入文档构建校验，不得只写在正文里不跑。

## 实现文件（计划阶段待确认）

| 路径                                       | 阶段 | 用途                                                                       |
| ------------------------------------------ | ---- | -------------------------------------------------------------------------- |
| `packages/rxdb/src/version/`               | A    | 工作树单元与写入口编排、受信路径登记                                       |
| `packages/rxdb/src/version/`               | B    | status/diff/index/commit 状态机                                            |
| `packages/rxdb/src/system/`                | A    | `WorkingTreeState` / `WorkingTreeEntry`                                    |
| `packages/rxdb/src/system/`                | B    | `IndexState` / `IndexEntry` / `WorkingTreeRestoreSession`（仅建表与迁移）  |
| `packages/rxdb/src/__tests__/version/`     | B    | 闭包、CAS、幂等与 residual rebase                                          |
| `packages/rxdb-test/`                      | A/B  | `workingTreeCaptureConformanceSuite` / `workingTreeCommitConformanceSuite` |
| 各 v1 本地 adapter                         | A    | 事务内 trigger/capability 接入                                             |
| `packages/rxdb-{angular,react,vue}/`       | C    | `useWorkingTree()` 与共享类型透传                                          |
| `apps/dev-rxdb-{angular,react,vue}/`       | C    | 对称演示与 E2E                                                             |
| `benchmarks/working-tree.bench.ts`（新增） | C    | FR-026 的判定依据                                                          |
| `benchmarks/reports/`                      | C    | 冻结 reference 报告                                                        |
| `website/docs/collaboration/`（新增）      | C    | 发布门禁 9 的公开文档（US5-AC8）                                           |
| `requirements/api-baseline/rxdb.json`      | A/B  | 新增公开类型登记                                                           |

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md) — 提供 commit graph、branch ref、baseline 与
  `WorkingTreeActivationState` 建表（FR-052）
- [US-307 历史恢复会话](./US-307-restore-session.md)
- [US-308 分支隔离与跨 realm 冲突检测](./US-308-branch-isolation-conflict.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md)
- [Workspace 插件文档](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
