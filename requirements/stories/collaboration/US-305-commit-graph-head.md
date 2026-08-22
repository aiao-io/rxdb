---
id: US-305
title: 提交图与 HEAD 持久化
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-09
updated: 2026-08-15
tags: [collaboration, commit, head, persistence, migration]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖工作树的 UI 或状态机
- [x] Negotiable: commit ID 生成方式、存储表名和 ChangeSet 编码可在 plan 阶段调整
- [x] Valuable: 有了持久 commit 图，历史节点第一次成为可长期引用的锚点
- [x] Estimable: 存储层次、审计字段和迁移路径已在本文列出
- [x] Small: 不含 status/diff 操作面、不含 restore、不含分支切换改动
- [x] Testable: 最小闭环「写 commit → 刷新 → 读回 log/show」可独立验收
-->

# 用户故事：提交图与 HEAD 持久化

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> 本故事不重述，只承接落地与验收。

## 背景与问题

当前历史记录可以支持 undo、redo 和从历史恢复实体，但恢复结果与部分状态依赖当前页面会话；刷新后用户看不到上次的结果，也没有一个可以长期引用的提交节点。

早期的 `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 在可复核的 `v0.0.24` 公开表面中已不存在，因此这是全新设计，没有需要兼容的旧暂存契约。

本故事只做**底座**：commit 图、HEAD、分支引用的原子一致性、存储布局与一次性迁移。工作树与提交状态机在 [US-306](./US-306-working-tree-commits.md)。

## 作为/我想要/以便

**作为** 使用 RxDB 管理本地数据的开发者
**我想要** 把一组变更写成不可变 commit，并让 HEAD 与 commit 图在刷新后仍然可查询
**以便** 我有一个跨会话稳定、可审计、可被后续恢复引用的版本锚点

## 术语与状态模型

| Git 概念               | RxDB 中的含义                                          | 持久化要求                          |
| ---------------------- | ------------------------------------------------------ | ----------------------------------- |
| `HEAD`                 | 当前激活分支的 `CommitBranchRef.headCommitId` 派生值   | 不持久化第二份独立指针              |
| 分支引用（branch ref） | 分支名到 head commit 的唯一映射；沿用现有分支能力      | 与 commit 更新原子一致并带 revision |
| commit                 | 带父节点、消息、作者和变更集合的不可变版本节点         | 创建后不可改；刷新后可查询          |
| ChangeSet              | commit 的变更单元集合，按实体/事务分组，保留可恢复信息 | 与 commit 同一提交屏障内可见        |

v1 的变更单元粒度为「实体操作或完整事务」。同一事务不能被拆到不同 commit；字段级、代码行级粒度属于后续扩展。
迁移生成的 `kind=baseline` 与兼容历史 `fromChangeId` / remote branch 本地锚定生成的 `kind=branch_baseline`
都是无父节点的系统根快照；普通 commit 固定一个父节点。既有 `mergeBranch()` 只把合并结果写成目标分支的普通工作树变更，
不自动创建双父 commit；用户随后提交时仍以目标分支原 HEAD 为唯一父节点。

Commit 记录 `originBranchId` 表示创建位置，不表示节点只属于该分支。`log({ branchId })` 必须从该分支
`CommitBranchRef` 沿父链遍历可达节点，不能用 `originBranchId = branchId` 过滤，否则新分支会丢失继承历史。
同一父链按拓扑顺序返回，创建时间只用于展示和稳定游标的次级排序；时间取数据库时钟，不信任 realm 本地时钟。

## 范围边界

### In Scope

- commit 图与 `CommitBranchRef` 的持久化存储布局；HEAD 只作为当前 branch ref 的派生概念
- `CommitBranchRef.headRevision` 的事务内 CAS；它是普通提交竞争的唯一判定
- commit 的原子写入：变更集合、父 commit、作者、时间、摘要与新的分支 HEAD 在一次操作内可见
- ChangeSet 的 patch / inverse patch 存储与实体身份、操作类型、基线版本、当前版本指纹
- `log(options?)` / `show(commitId)` 查询：按分支、实体、时间排序，返回详情与父子关系
- 显式启用后的首次初始化：为每个本地可完整物化的既有分支生成基线 commit；metadata-only 远端分支延迟到
  US-308 首次成功物化；保留旧 change 记录，失败可重试且幂等
- 数据库级 `CommitCapabilityState`、writer 能力协商与启用/未启用混用拒绝
- 数据库级 `WorkingTreeActivationState` 的**建表与初始化**（单行、`activationRevision` 从 0 起）。
  它排在 US-306 阶段 A 之前只因为后者的普通 CRUD 必须校验 active branch token；本故事不实现 switch 语义、
  不递增该 revision，见 [epic-006 状态归属](../../epics/epic-006-working-tree-commits.md#状态归属哪个故事负责建表)
- 普通 commit 的 `operationId` 幂等约束、必填作者来源与数据库时间
- commit/ChangeSet 对字段加密 envelope 的原样持久化与明文泄漏门禁
- 损坏或不兼容 commit 记录的隔离与诊断
- 与 `RxDBChange`、undo/redo、`restoreEntity` 的兼容边界
- 真实 migration 发布前的 bridge lineage 预检：只接受当前发布提交祖先上的 bridge tag，不接受内容相同但经 squash 脱离祖先链的 tag

### Out of Scope

- status / diff / commit / discard 的用户操作面 —— 属 [US-306](./US-306-working-tree-commits.md)
- 历史恢复会话 —— 属 [US-307](./US-307-restore-session.md)
- 分支切换入口、冲突诊断和三端提示 —— 属 [US-308](./US-308-branch-isolation-conflict.md)；底层 head revision CAS 在本故事完成
- 远程 push/pull、rebase、cherry-pick、任意历史改写
- 基于时间或大小的 commit 自动清理策略
- Workspace IndexedDB 草稿的读取、搬迁或隔离；草稿不属于 SQL/PGlite 迁移事务

## 用户场景与验收标准

### User Story 1 - 提交后刷新仍可查询（Priority: P1）

**作为** 需要长期引用版本节点的开发者
**我想要** commit 与 HEAD 在刷新后仍然完整
**以便** 历史不随页面会话消失

**独立测试**：写入一组变更并 commit，刷新或重新打开应用，查询 log 与 HEAD。

**验收场景**：

1. **Given** 一组已确定的变更单元，**When** 创建 commit 并刷新页面，**Then** commit、父节点、作者、时间、摘要与分支 HEAD 全部可查询，且与提交时一致。
2. **Given** commit 正在写入时出现存储错误，**When** 操作返回失败，**Then** HEAD 与分支引用保持提交前状态，不出现「commit 已存在但 HEAD 未更新」这类可见半状态，错误包含可重试信息。
3. **Given** 应用在持久化写入中途崩溃，**When** 下次打开应用，**Then** 只能看到上一次完整一致的状态，不出现半个 commit 或半个事务。
4. **Given** 变更单元集合为空，**When** 创建 commit，**Then** 操作被拒绝，不产生空节点，HEAD 不变。
5. **Given** commit message 为空或只含空白，**When** 创建 commit，**Then** 操作被拒绝并保留调用前状态。
6. **Given** 两个 writer 从相同 `headRevision` 开始提交，**When** 先后尝试推进同一分支，**Then** 只有一个 CAS 成功；失败方不产生可见 commit，并收到包含 expected/actual revision 的稳定冲突错误。
7. **Given** commit 已在数据库提交但响应在返回前丢失，**When** 调用方用相同 `operationId`、message、author 和提交内容重试，**Then** 返回第一次创建的同一 commit，不推进第二次 HEAD；同一 branch generation 内复用 `operationId` 却携带不同 payload 时返回 `idempotency_key_reused`。
8. **Given** 普通 commit 缺少 `authorId` 或 `operationId`，**When** 用户提交，**Then** 在写事务前拒绝；不得从空值、设备名或 writer ID 伪造作者。

### User Story 2 - 已有数据库首次启用（Priority: P1）

**作为** 已经在用 RxDB 的开发者
**我想要** 打开 commit 能力时不丢失既有数据与历史
**以便** 升级是一次可重试的迁移而不是重建

**独立测试**：在已有多分支数据与旧 `RxDBChange` 的数据库上显式启用，重复启动两次。

**验收场景**：

1. **Given** 数据库已有数据但无 commit 图，**When** 首次显式启用，**Then** 为每个能仅凭本地主库与旧 `RxDBChange` 完整物化的分支生成一个 `kind=baseline` 的初始 commit；baseline 不伪造用户作者和消息，既有 `RxDBChange` 仍可供历史/undo 使用。
2. **Given** 首次初始化已完成，**When** 再次启动应用，**Then** 迁移幂等，不重复建立基线。
3. **Given** 迁移中途失败，**When** 重试，**Then** 从可验证的一致点继续，不产生重复基线或孤立 commit。
4. **Given** 不可达的孤立 commit 损坏，**When** 启动，**Then** 隔离原始记录并保留其他可验证 commit；**Given** 损坏节点是某个 branch ref 的 HEAD 或可达祖先，**Then** 该分支进入 `corrupted_read_only`，保留原 ref，不自动改指针、不删除记录、不允许 commit/restore/switch-to，并返回首个损坏节点与修复建议。其他健康分支仍可使用，禁止静默回退到空库或内存模式。
5. **Given** 数据库已有 A/B 多个分支且指向不同状态，**When** 首次启用完成后依次切换分支，**Then** 每个 `CommitBranchRef` 指向代表该分支原 tip 的 baseline，当前激活分支与业务实体状态不因迁移改变。
6. **Given** Workspace 插件仍有 NEW 草稿，**When** 首次启用 commit 能力，**Then** baseline 不包含也不删除草稿；草稿 `save()` 后才以普通 INSERT 出现在工作树。
7. **Given** 应用未显式启用 commit 能力，**When** 打开旧数据库，**Then** 不创建 commit 系统表、不生成 baseline，现有 CRUD、branch、undo/redo 行为不变。
8. **Given** 既有数据库或某个已证明完整物化的本地分支没有任何业务实体，**When** 首次启用，**Then** 允许创建确定性的空 `kind=baseline` 根节点；metadata-only 远端分支不适用该例外，该例外也不得放宽普通 commit 的非空要求。
9. **Given** 数据库已由一个 realm 启用 commit 能力，**When** 另一个 realm 以未启用或不兼容协议连接并尝试写入，**Then** 在业务写入前返回 `commit_capability_mismatch` 或进入调用方明确请求的只读模式，实体表、工作树与 revision 零变化。
10. **Given** 实体含 `encrypted: true` 字段，**When** 建立 baseline 或普通 commit，**Then** commit 与 ChangeSet 持久化 dump 中只出现 versioned envelope，明文哨兵零命中；解锁后 `show()` 仍返回正确值。
11. **Given** `syncBranches()` 已建立 `local=false, remote=true` 但本地没有完整实体状态的分支，**When** 首次启用，**Then** 不为它伪造空 baseline 或 branch ref；健康本地分支照常迁移，该远端分支由 US-308 首次成功物化时原子建立 `kind=branch_baseline`。
12. **Given** 迁移前没有 active 分支且 `main` 存在，**When** 首次启用，**Then** 沿用既有语义激活 `main` 后建立 baseline；**Given** 存在多个 `activated=true` 分支，**Then** 以 `ambiguous_active_branch` 整体失败，所有 commit capability 状态零变化，不按查询顺序任选一个。
13. **Given** 数据库首次启用 commit 能力，**When** 迁移事务提交，**Then** 存在唯一一行 `WorkingTreeActivationState` 且 `activationRevision = 0`，重启后可读、值不变，且其中不含第二份 active branch ID；**Given** 应用未显式启用 commit 能力，**Then** 该表不被创建。
14. **Given** `requirements/migration-release.json` 当前为 `bridge.tag = null` / `bridge.version = null`，且历史 bridge 发布 `v0.0.25` 的 tagged commit 因 squash 已不在发布主线上（`git merge-base --is-ancestor v0.0.25 HEAD` 为 false），**When** 本故事的 system schema 迁移发布进入门禁，**Then** 门禁必须失败，直到发布主线上产出一个新的**非迁移** bridge 版本并把它的真实 tag 写入 `bridge.tag`；该 tag 必须满足 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 且不得是 `v0.0.25`。**Then** 补齐后重跑门禁通过，且全程不重打、移动或伪造任何已发布 tag。

## 功能需求

- **FR-001**：系统 MUST 为每个数据库/分支维护唯一 `CommitBranchRef`；HEAD MUST 从当前激活分支的 `headCommitId` 派生，不得持久化第二份可漂移的 HEAD 指针。
- **FR-002**：系统 MUST 持久化 commit 元数据、`CommitBranchRef.headCommitId` 与 `headRevision`；刷新、重启和正常关闭后可恢复。
- **FR-003**：系统 MUST 把 NEW、UPDATE、DELETE 和完整事务表示为可比较的变更单元，并为每条保留实体身份、操作类型、基线版本和当前版本指纹。
- **FR-008**：系统 MUST 要求普通 commit 包含 trim 后非空的消息、调用方提供的 `authorId` 与 `operationId`，并在一次原子操作中写入变更集合、父 commit、数据库时间、摘要和新的分支 HEAD；`kind=baseline | branch_baseline` 是仅有的无用户作者/消息系统根节点。
- **FR-009**：系统 MUST 保证普通 commit 不为空；无变更单元时提交失败且不产生空节点。实体数为零的 `kind=baseline | branch_baseline` 是仅有的空 ChangeSet 例外。
- **FR-010**：系统 MUST 保证 commit 创建失败时恢复提交前状态，不出现可见半状态。
- **FR-012**：系统 MUST 提供按 branch ref 父链可达性、实体和数据库时间查询的历史列表，以及单个 commit 的变更详情和父节点关系；`originBranchId` 只用于审计，不得用于截断继承历史。
- **FR-018**：系统 MUST 与现有 `RxDBChange`、历史 undo/redo 和 `restoreEntity` 保持兼容；已有 API 的行为不能因为 commit 功能而改变。
- **FR-019**：系统 MUST 明确区分 durable commit 历史与会话级 redo 栈；刷新后 redo 可清空，但 commit 与 HEAD 不得清空。
- **FR-021**：系统 MUST 在显式启用后为已有数据库提供一次性初始化：为每个本地可完整物化分支生成 baseline、保留旧 change 记录、保持激活分支与业务实体状态，并支持失败重试；Workspace 草稿不参与迁移，metadata-only 远端分支遵守 FR-049。
- **FR-022**：系统 MUST 对损坏或不兼容的 commit 记录进行隔离和诊断。不可达孤立记录可单独隔离；HEAD 或可达祖先损坏时该分支 MUST fail-closed 为 `corrupted_read_only`，保留原始 ref 与记录，不得自动回退到较早 commit、空工作树或内存模式。
- **FR-027**：commit 历史 MUST 可审计，至少记录稳定 commit ID、父节点、分支、作者标识、消息、创建时间、变更数量和 schema/数据版本；不得记录无法恢复的数据引用。
- **FR-029**：普通 commit MUST 在同一数据库事务内以 expected `headRevision` 条件更新 `CommitBranchRef`；CAS 失败时 commit、ChangeSet 与 branch ref 全部不可见。跨 realm 正确性由该 revision CAS 本身承担，不引入额外的协调协议。
- **FR-030**：本故事是首个真实系统迁移发布。实现进入发布分支前，发布负责人 MUST 从
  最近一次已验证、且满足 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的 bridge manifest 读取
  `bridge.tag` / `bridge.version`，启用明确的 `oldBundlePolicy`，并通过真实 git tag 的 migration release gate。
  `v0.0.25` 虽是历史 bridge 发布，但当前主线经 squash 后不再包含其 tagged commit，MUST NOT 作为本故事的迁移锚点；
  不得重打、移动或伪造已发布 tag。若发布主线没有有效 bridge ancestor，必须先从该主线发布新的非迁移 bridge 版本，
  再开始本故事的 system schema 迁移发布。
- **FR-036**：普通 commit MUST 以 database + immutable branch generation + `operationId` 建立唯一幂等约束。相同请求重试返回原 commit；相同 key 的 message、author、parent 或 ChangeSet 指纹不同则返回稳定错误，不得覆盖原记录。删除并同名重建的分支使用新 generation，不与旧幂等键碰撞。
- **FR-037**：首次启用 MUST 持久化数据库级 capability/protocol 状态。此后所有 writer 在连接时协商；未启用或不兼容 writer 不得继续裸写业务表。
- **FR-038**：commit、ChangeSet 与 baseline MUST 保持既有字段加密 at-rest 契约；持久化路径不得先解密再把明文写入新系统表，日志、错误与摘要不得包含加密字段值。
- **FR-048**：commit 能力启用后 MUST 保证 `RxDBBranch.activated` 恰好一行是 true。首次迁移零 active 时沿用既有 main 恢复语义；多 active 时返回 `ambiguous_active_branch` 并全量回滚。系统 schema MUST 约束至多一个 active，每次连接 MUST 验证至少一个。
- **FR-049**：首次迁移 MUST 区分本地可完整物化分支与 metadata-only 远端分支。后者在没有完整本地状态时不得创建 baseline 或 `CommitBranchRef`；其首次 baseline/ref 创建由 US-308 与完整物化放在同一事务。除该明确例外外，任一本地分支无法物化都 MUST 使迁移整体失败。
- **FR-052**：首次启用 MUST 在同一迁移事务内建立数据库级单行 `WorkingTreeActivationState` 并把 `activationRevision`
  初始化为 0。该状态 MUST NOT 复制第二份 active branch ID——当前分支仍由 `RxDBBranch.activated` 表示。本故事只负责
  建表、初始化与「连接时可读」；递增该 revision 的 switch 语义归 [US-308](./US-308-branch-isolation-conflict.md)，
  写路径的 token 校验归 [US-306 阶段 A](./US-306-working-tree-commits.md)。未启用 commit 能力的数据库 MUST NOT 创建该表。
- **FR-051**：commit 图校验 MUST 从每个 branch ref 遍历完整可达父链并区分孤立损坏与可达损坏。可达损坏的分支只允许读取不依赖重放的当前投影、导出诊断和切离；commit、restore、switch-to 及任何历史重放 MUST 返回稳定的 `commit_graph_corrupted`。

## 关键实体

- **Commit**：不可变提交；稳定 ID、kind、零或一个父节点、`originBranchId`、`originBranchGeneration`、operation ID、作者、消息、数据库时间、变更集合、摘要、change codec version 与按实体记录的 schema fingerprint。
- **CommitBranchRef**：分支引用；分支 ID、不可变 generation、head commit、head revision、创建来源、更新时间，是该次分支生命周期 HEAD 的唯一真相源。同名重建必须生成新 generation。metadata-only 远端分支在首次完整本地物化前没有该记录，不能用 `headCommitId=null` 制造第二种 ref 状态。
- **CommitChangeSet**：commit 的变更单元集合；按实体/事务分组，保留 patch、inverse patch 或等价可恢复信息。
- **CommitCapabilityState**：数据库级启用与协议协商状态；commit protocol、system schema、change codec version、启用迁移 ID 与时间。
- **WorkingTreeActivationState**：数据库级单行 `activationRevision`（本故事只建表并初始化为 0）。当前分支 ID 仍由 `RxDBBranch.activated` 表示，不在此复制第二份；递增语义见 US-308，写路径校验见 US-306 阶段 A。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：新导出一律 `Commit*` 前缀，
> **不得**使用 `Workspace*`——该前缀已被 `@aiao/rxdb-plugin-workspace` 的草稿缓存占用。

## 设计展开

### 持久化层次

1. 业务实体表保存当前物化数据，仍沿用现有 CRUD、事务和响应式查询。
2. 变更日志保存原子变更的 patch/inverse patch；commit 必须复制不可变恢复数据，不能只持有会被 undo、清理或删分支删除的 `RxDBChange` 外键。
3. commit 元数据、ChangeSet 和 `CommitBranchRef` 必须在同一提交屏障内可恢复；HEAD 只从 branch ref 派生。
4. commit 图保存父子关系和审计字段；任何 commit 一旦可见就必须可重放到其父节点之后的完整状态。

### 提交规则

- commit 的父节点固定为提交开始时读取到的当前分支 HEAD；同一事务内执行
  `UPDATE branch_ref ... WHERE headRevision = expected`，受影响行数不为 1 时整个提交失败。
- `operationId` 的唯一记录与 commit/ChangeSet/branch ref 同事务写入。数据库提交后响应丢失不属于“提交失败”；
  调用方只能以相同 operation ID 重试并取回原结果。
- baseline ID 由数据库、分支、迁移 ID 与 schema/codec manifest 确定性生成；branch baseline 额外绑定来源类型和 `fromChangeId` 或 remote materialization fingerprint。空状态也可生成系统根节点，重复操作必须命中同一 ID。
- 历史节点永不通过「把旧节点改成当前」实现变更；需要可追踪的动作时必须再创建一个新 commit。

### 兼容与迁移

- 保留 `RxDBChange` 的现有 ID、transactionId、patch/inversePatch、branchId 和 undo/redo 字段；commit 层不改变旧 API 的过滤规则。
- commit 能力在从未启用的数据库上显式启用；未启用时不建立系统表、不生成 baseline，也不改变既有 API 行为。
- 数据库一旦启用，后续 writer 不得通过省略配置回到裸写模式；同版本 realm 的配置分歧与旧 bundle 都必须在首笔业务写入前被拒绝或显式只读。
- 首次启用时按每个本地可完整物化分支的原 tip 建立 baseline 和 `CommitBranchRef`，并记录迁移版本；迁移前后的激活分支与当前业务实体状态一致，重复启动幂等。metadata-only 远端分支保持无 ref，不能把未知远端内容解释为空 tip。
- 启用事务先收敛 active 分支基数：零 active 沿用 `main` 恢复语义，多 active 直接失败；成功后用数据库约束维持至多一个 active，并在连接时验证至少一个。
- 启动图校验不得“修复”不可变历史。可达链损坏时保留原 ref 和原始行，把分支标记为派生的只读损坏态；显式历史修复工具不在本 Epic 范围。
- Workspace NEW 草稿继续由插件独立恢复；commit 迁移不读取、不搬迁、不删除 IndexedDB 记录，草稿保存后按普通 INSERT 处理。
- migration release 不能按版本号猜 bridge。候选 tag 必须同时满足：manifest 声明 `kind=bridge`、包版本与 tag 一致、
  含系统迁移面、tag commit 是候选发布提交的真实祖先。cherry-pick 或 squash 后内容相同不等于 ancestry 成立。

## 非功能要求

- **一致性**：commit、HEAD 与分支引用遵守全有或全无的可见性；重启恢复不得依赖写入顺序的偶然性。
- **可靠性**：写入失败、崩溃、标签页关闭和 schema 升级中断后，重试结果可预测且不重复生成 commit。
- **可诊断性**：错误带稳定类别、对象标识和建议动作；不能静默 fallback 到 memory、空历史或另一种未声明的存储。
- **安全性**：默认不记录敏感实体字段到 UI 日志或错误文本；作者标识由调用方提供，不能伪造为系统用户；加密字段在所有历史系统表中保持 envelope。

## 测试要求

- 核心包按 TDD 先写崩溃/刷新恢复的失败用例，再实现；覆盖率不低于 90%。
- 本故事的跨后端断言（事务原子性、head revision CAS、operation ID 幂等、schema 迁移）先落进
  [epic-006](../../epics/epic-006-working-tree-commits.md#启用与存储边界) 冻结的 `workingTreeCommitConformanceSuite`，
  由 US-306 阶段 B 收口整套；本故事**不另起第三个套件名**。运行矩阵为 epic 定义的 6 个 v1 后端（PGlite、四个 SQLite 浏览器适配器、Electron `node:sqlite` host）。
- 迁移幂等性、空/非空多分支 baseline、metadata-only 远端分支延迟建 ref、零/多 active、未启用零副作用、启用状态混用拒绝、Workspace 草稿隔离与损坏记录隔离必须有独立 fixture。
- `WorkingTreeActivationState` 需独立 fixture：启用后单行存在且 `activationRevision = 0`、重启可读、未启用时表不存在（FR-052 / AC US2-13）。
- 损坏 fixture 必须分别覆盖不可达孤立节点、HEAD 损坏和中间祖先损坏；后两者断言 ref 不被改写、健康分支可用且损坏分支所有重放写入口稳定 fail-closed。
- 支持字段加密的后端必须扫描 commit/ChangeSet/baseline 原始持久化 dump，断言明文哨兵零命中。
- 桥接血统门禁需独立用例（FR-030 / AC US2-14）：`bridge.tag` 为 `null`、为 `v0.0.25`、或不满足
  `git merge-base --is-ancestor <bridge-tag> <release-commit>` 时门禁均失败；只有真实祖先 tag 才放行。
  用例读真实 git 仓库状态，不 mock 祖先判定。
- 本故事是无 UI 的核心底座，不适用三框架对称与 UI a11y，但必须满足
  [epic-006 横切约束 1](../../epics/epic-006-working-tree-commits.md#横切约束按故事适用不单独成故事) 的另一半：
  全部新增公开类型与入口带 TSDoc（`Commit*` / `WorkingTree*` 命名、参数、抛错与 revision 语义），
  TSDoc lint 零警告；并有类型契约测试断言公开签名与 api-baseline 一致，新导出不使用 `Workspace*` 前缀、
  不复用 `SwitchBranchOptions`。
- 测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — commit 图、HEAD 与分支引用
- `packages/rxdb/src/system/` — commit 元数据表与迁移
- `packages/rxdb/src/__tests__/version/` — 核心回归套件
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-301 版本控制](./US-301-version-control.md) — 现有分支、合并和远程同步边界
- [US-302 撤销/重做](./US-302-undo-redo.md) — 现有 durable undo 与会话级 redo 语义
- [US-306 工作树与提交操作](./US-306-working-tree-commits.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — NEW 草稿持久化现状与明确限制
- [版本控制文档](../../../website/docs/versioning.md)
