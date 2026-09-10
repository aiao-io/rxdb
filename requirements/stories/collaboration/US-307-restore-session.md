---
id: US-307
title: 历史恢复会话
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-09-06
tags: [collaboration, restore, history, persistence, angular, react, vue]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305 的 commit 图与 US-306 阶段 B 的工作树/提交状态机，但恢复语义可单独交付与验收
- [x] Negotiable: 恢复会话的存储位置与事件名可在 plan 阶段调整
- [x] Valuable: 用户可以先看恢复结果，再决定是否落成新 commit，且刷新不丢
- [x] Estimable: 恢复规则、拒绝条件与性能口径已列出
- [x] Small: 只有 restore 一条主路径加它的拒绝分支
- [x] Testable: 「restore → 刷新 → 仍显示且标记未提交 → commit」可独立验收
-->

# 用户故事：历史恢复会话

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。

## 前置依赖

- [US-305](./US-305-commit-graph-head.md)：commit 图、父链可达性与 baseline，是 restore 的数据源与路径校验依据
- [US-306 阶段 A](./US-306-working-tree-commits.md)：`WorkingTreeEntry` 的持久化布局与写入口捕获。FR-015 要求
  restore 结果写成**普通的 `WorkingTreeEntry`**，`restoreEntity` 也在 epic 的调用点登记表中被列为
  「必须产生工作树单元」的意图；没有阶段 A 的捕获层，restore 无处落盘
- [US-306 阶段 B](./US-306-working-tree-commits.md)：status/diff/commit 状态机与 revision CAS 口径；
  本故事的「工作树 clean 时 commit 被拒」直接复用其规则。**`WorkingTreeRestoreSession` 的建表、schema
  迁移与「从已存在 session 派生 conflicted」的读路径也由 US-306 阶段 B 交付**（`status()` 的 durable `conflicted`
  在阶段 B 就必须成立，表不能等到本故事才存在）；本故事只负责会话的**创建与生命周期语义**。
  `CommitConflict` 同理，由 US-306 阶段 B 定义并登记 api-baseline，本故事直接复用
- [US-306 阶段 C](./US-306-working-tree-commits.md)：`useWorkingTree()` 的三端契约。本故事的恢复入口是对
  该契约的**扩展**（新增 `restore` 与 `restoreState`），不得在某一端另立一套命名或状态机

## 作为/我想要/以便

**作为** 想纠正错误的用户
**我想要** 浏览 commit 历史并把某个版本恢复到工作树，且刷新后恢复结果仍在
**以便** 我可以先检查结果，再决定是否以新 commit 保存，而不必担心恢复被静默当成历史改写

## 范围边界

### In Scope

- `restore(commitId)`：把目标 commit 的数据物化到当前工作树，**不移动 HEAD**、不改写历史
- 恢复会话（`WorkingTreeRestoreSession`）的**创建、`active | conflicted | committed` 生命周期与删除**，
  刷新后据其重建「恢复后未提交」标记并在 UI 中明确呈现（表与迁移由 US-306 阶段 B 提供，本故事不重复建表）
- 恢复前的 dirty 工作树检测与拒绝
- 恢复目标的当前分支可达性，以及完整物化路径的 schema/change codec 兼容预检
- restore / discard 的 active branch token 与 head、working tree revision CAS
- restore 只生成普通工作树条目，用户随后用 `commit(message)` 一次提交
- 目标内容与当前 HEAD 相同时的 no-op 语义
- 加密字段恢复数据与 session 元数据的 at-rest envelope 契约
- `restore` 的性能基线（并入 `bench-working-tree`）
- Angular / React / Vue 三端对称的恢复入口与状态

### Out of Scope

- commit 图与 HEAD 存储 —— 属 [US-305](./US-305-commit-graph-head.md)
- status / diff / commit 的状态机 —— 属 [US-306 阶段 B](./US-306-working-tree-commits.md)
- **恢复结果的选择性提交**（只提交恢复出来的一部分实体）：暂存区已在
  [epic-006「非目标」](../../epics/epic-006-working-tree-commits.md#非目标) 显式裁决不做，
  restore 后只有「整棵工作树一起 commit」或「discard 全部」两条路；要隔离恢复结果就先开分支
- `WorkingTreeRestoreSession` 的建表 / schema 迁移，以及 `CommitConflict` 的类型定义与 api-baseline 登记
  —— 同属 [US-306 阶段 B](./US-306-working-tree-commits.md)；本故事是它们的使用者，不是所有者
- 冲突记录和三端冲突提示 —— 属 [US-308](./US-308-branch-isolation-conflict.md)；底层 revision CAS 已由 US-305 与 US-306 阶段 A/B 提供
- rebase、cherry-pick、任意历史改写
- 把恢复实现成「把旧节点改成当前」

## 用户场景与验收标准

### User Story 1 - 查看历史并恢复（Priority: P1）

**独立测试**：创建至少三个 commit，选择中间版本恢复，刷新后确认恢复结果，再 commit，验证历史没有被覆盖。

**验收场景**：

1. **Given** commit 图中存在目标 commit，**When** 用户打开 log 并查看详情，**Then** 能看到消息、作者、时间、父 commit、涉及实体数量和变更摘要。
2. **Given** 工作树 clean，**When** 用户恢复任意可达 commit，**Then** 目标数据物化到当前工作树，当前分支 HEAD 不移动，恢复状态可被 `status()` 识别为 `restoring`。
3. **Given** 用户执行 `restore(commitId)` 尚未 commit，**When** 页面刷新，**Then** 恢复后的工作树继续显示，且明确标记为「恢复后未提交」。
4. **Given** 历史恢复会话已建立，**When** 用户用新消息 `commit(message)` 提交，**Then** 恢复产生的**全部**工作树变更一次落成以原 HEAD 为父节点的新 commit，restore session 在同一事务转为 `committed`，旧 commit 和原有后继节点仍可访问；`commit()` 不接受「只提交其中一部分」的选择参数，工作树 clean 时仍按 US-306 阶段 B 的规则拒绝。
5. **Given** 用户在恢复会话中选择 discard，**When** 操作完成，**Then** 工作树回到当前 HEAD，恢复会话与恢复产生的工作树变更一并清除，历史 commit 不变。
6. **Given** 恢复会话建立后其他 realm 推进了当前分支 HEAD，**When** 用户尝试提交或 discard，**Then** revision CAS 拒绝静默覆盖，恢复结果继续保留并标记为 conflicted。
7. **Given** 用户从 clean HEAD 恢复当前 HEAD，或目标 commit 虽不同但物化内容与当前 HEAD 完全相同，**When** restore 完成，**Then** 返回类型化 no-op 结果，不创建恢复会话、不递增 revision，后续 commit 仍因工作树 clean 被拒绝。
8. **Given** 仅键盘操作三端任一恢复入口，**When** 浏览 log、选择目标 commit、执行 restore 或 discard，**Then** 焦点顺序、可见焦点、可访问名称与 `restoring` / `conflicted` / 错误状态的公告达到 WCAG 2.1 AA；三端行为对称，单端缺失即本故事失败（承接 [epic-006 横切约束 1/3](../../epics/epic-006-working-tree-commits.md#横切约束按故事适用不单独成故事)）。本故事只新增恢复相关的交互元素，其余控件复用 US-306 阶段 C 已收口的组件与 a11y 断言，不重复实现。

### User Story 2 - 拒绝会造成数据丢失的恢复（Priority: P1）

**验收场景**：

1. **Given** 工作树存在未提交修改，**When** 用户恢复历史 commit，**Then** 系统拒绝操作并说明需先 commit 或 discard；判定只看工作树是否 clean，没有第二个「已暂存但未提交」的中间态需要考虑。
2. **Given** 恢复目标 commit 不存在、不可达或属于其他数据库，**When** 用户恢复，**Then** 拒绝操作，工作树不变。
3. **Given** 恢复涉及跨实体的外键依赖，**When** 恢复中途失败，**Then** 在事务边界内回滚全部实体和元数据，不留下部分物化的中间态。
4. **Given** 恢复目标包含已被删除的实体，**When** 恢复到删除前的 commit，**Then** 实体重新出现，且以普通 INSERT 变更形式进入工作树。
5. **Given** 从 baseline 到目标的正向重放路径，或从当前 HEAD 到目标的逆向路径中任一 ChangeSet 的实体 schema fingerprint / change codec version 与当前客户端不兼容，**When** 用户恢复，**Then** 在物化前返回稳定的 `incompatible_schema`，指出首个不兼容 commit、方向与目标/当前 manifest，工作树、HEAD 和恢复会话均零变化；不能只检查目标 commit。
6. **Given** restore 捕获 expected revision 后、事务提交前其他 realm 改变 HEAD、工作树或 active branch，**When** CAS 失败，**Then** 初次 restore 全量回滚且不创建 session；错误返回 expected/actual。只有已经成功存在的 session 在后续 commit/discard 冲突时才保留并派生 `conflicted`。
7. **Given** 目标 commit 包含加密字段，**When** restore、刷新并 commit，**Then** 持久化的 working-tree entry 与 restore session dump 中明文哨兵零命中，解锁后的业务值正确。

## 功能需求

- **FR-013**：系统 MUST 支持将可达历史 commit 恢复到当前工作树；恢复默认不移动 HEAD、不删除历史，并将恢复会话持久化。
- **FR-014**：系统 MUST 在恢复前检测 dirty 工作树；未显式处理未提交变更时，恢复操作必须拒绝并保持原状。判定口径只有 clean / dirty 两态。
- **FR-015**：系统 MUST 把恢复结果写成普通的 `WorkingTreeEntry`，与用户手写的变更同形、同表、同 revision 轴，不存在「已恢复但未暂存」这一额外状态。用户随后用 `commit(message)` 把当前工作树整体落成新 commit；`commit()` MUST NOT 接受任何只提交恢复结果子集的参数。生成的新 commit 不得改写被恢复的历史节点，并须与 restore session 的 `committed` 转换原子提交。
- **FR-026b**（口径见 [epic-006 性能预算的口径](../../epics/epic-006-working-tree-commits.md#性能预算的口径)）：`bench-working-tree` MUST 在 Node + PGlite memory、10,000 条实体 / 100 个 commit 下，以 5 次 warmup、50 次采样恢复含 100 个完整变更单元的 `HEAD~1` 并记录 runner profile。普通 CI 以归一化 ratio 不超过 reference median 的 110% 为硬门禁；promise resolve 的 p95 不高于 1 s 只在 `runnerProfileHash` 匹配 reference 的固定性能 runner 上作为发布硬门禁。
- **FR-033**：v1 只允许恢复当前分支 HEAD 沿父链可达的 commit。系统 MUST 在任何持久写入前选定确定性的物化路径，并校验该路径每个 ChangeSet 涉及实体的 schema fingerprint manifest 与 change codec version 均与当前客户端完全相等；v1 不提供跨 schema/codec patch 转换。拒绝时所有持久状态 MUST 零变化。
- **FR-034**：restore / discard MUST 在同一数据库事务内校验 active branch token 与 expected head、working tree revision。初次 restore 要求工作树 clean，成功只递增 working-tree revision。初次 restore CAS 失败时全部回滚且不创建 session；已有 session 的 commit/discard CAS 失败时保留工作树和 session，并由 expected/actual revision 派生 conflicted，不得自动选择任一 writer 的状态。恢复会话上的 commit 与普通 commit 一样是**调用方捕获型** `workingTreeRevision` CAS（见 [US-306 FR-031](./US-306-working-tree-commits.md)）：其他 realm 在 restore 之后、commit 之前写入工作树时返回 `CommitConflict`，MUST NOT 为了让恢复结果顺利落盘而放宽该校验。
- **FR-042**：restore 产生的完整 diff 为空时 MUST 返回 no-op，不创建 `WorkingTreeRestoreSession` 或 `WorkingTreeEntry`，也不递增任何 revision。
- **FR-043**：restore 物化与 session 持久化 MUST 保持字段加密 envelope；任何错误、摘要与 session 诊断不得包含加密字段明文。
- **FR-050**：restore 兼容性判断 MUST 覆盖实际读取/应用的完整 commit 路径，而不只是目标节点。错误 MUST 稳定返回首个不兼容 commit ID、重放方向、实体和版本 manifest；检查期间不得解码或写入后续 ChangeSet。

## 关键实体

- **WorkingTreeRestoreSession**：历史恢复会话；目标 commit、恢复前 HEAD 与各 expected revision、生成的工作树 revision、目标 schema/codec manifest、数据库创建时间、`active | conflicted | committed` 生命周期。discard 成功后删除 session；commit 与 `committed` 转换原子提交。conflicted 可由 session expected revision 与当前 revision 重建，不另建冲突真相表。
  > **表归属**：schema、建表与迁移由 [US-306 阶段 B](./US-306-working-tree-commits.md) 交付，本故事只新增写入与状态转换。本故事若需要给该表加列，MUST 走 US-306 阶段 B 的迁移路径，不得另建第二张会话表。

## 设计展开

### 恢复规则

- restore 以当前分支父链上的兼容目标 commit 为数据源、以当前 HEAD 为工作树基线，产生普通的 INSERT / UPDATE / DELETE 工作树变更；目标 commit 本身**不**被标记为「当前」。实现可以选择 baseline→target 正向重放或 HEAD→target 逆向重放，但必须先冻结路径并校验路径上的每个 ChangeSet。
- restore、discard 均须在事务边界内物化跨实体关系；失败时回滚全部实体和元数据。
- restore 先计算完整 diff；diff 为空直接返回 no-op。初次 restore 的任何 revision/activation CAS 失败也必须回滚，不能留下一个只记录“失败”的 session。
- 历史节点永不通过「把旧节点改成当前」实现恢复；需要可追踪的恢复动作时，用户必须再创建一个新 commit。
- 恢复会话必须与工作树数据在同一提交屏障内可恢复，否则刷新后会出现「数据是恢复后的、状态却显示 clean」的错配。
- commit 只记录 schema fingerprint manifest / codec version 不等于可以跨版本恢复；实际物化路径上任一 manifest 不完全相等都必须在写事务前 fail-fast，不猜测字段映射、不跳过未知字段。

## 测试要求

- 先写「restore → 刷新 → 仍标记未提交」的失败用例，再实现；覆盖率不低于 90%。
- 拒绝路径（dirty、不可达 commit、跨库 commit、目标不兼容、中间祖先/后继 ChangeSet 不兼容、初次 restore revision/activation CAS 失败）各有独立用例，断言全部持久状态零变化。
- 已有 session 的 commit/discard 冲突另设用例，断言 session 与工作树保留、状态可在刷新后重新派生为 conflicted。
- 三端各有等价测试，并用跨框架 E2E 验证 log → restore → refresh → commit 流程；另断言 no-op restore 之后工作树仍 clean、commit 被拒绝，以及「restore 后另一个 Tab `save()` 再 commit」返回 `CommitConflict`。
- 三端 a11y 断言覆盖 US1-AC8：键盘可达、焦点可见、可访问名称与 `restoring` / `conflicted` / 错误状态公告，达到 WCAG 2.1 AA。
- 恢复中断的回滚用例必须覆盖含外键依赖的多实体事务。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 恢复语义与恢复会话生命周期
- `packages/rxdb/src/system/` — 恢复会话元数据（表由 US-306 阶段 B 建立，本故事只写入）
- `packages/rxdb-{angular,react,vue}/` — 对称的恢复入口与状态
- `apps/dev-rxdb-{angular,react,vue}/` — 历史与恢复演示
- `benchmarks/working-tree.bench.ts` — 恢复场景采样
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md)
- [US-306 父契约](./US-306-working-tree-commits.md)
- [US-306 阶段 B 提交状态机](./US-306-working-tree-commits.md)
- [US-302 撤销/重做](./US-302-undo-redo.md) — 现有 `restoreEntity` 与 durable undo 语义
