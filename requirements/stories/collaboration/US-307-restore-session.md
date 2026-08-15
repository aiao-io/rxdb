---
id: US-307
title: 历史恢复会话
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-15
tags: [collaboration, restore, history, persistence, angular, react, vue]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305 的 commit 图与 US-306 的工作树状态，但恢复语义可单独交付与验收
- [x] Negotiable: 恢复会话的存储位置与事件名可在 plan 阶段调整
- [x] Valuable: 用户可以先看恢复结果，再决定是否落成新 commit，且刷新不丢
- [x] Estimable: 恢复规则、拒绝条件与性能口径已列出
- [x] Small: 只有 restore 一条主路径加它的拒绝分支
- [x] Testable: 「restore → 刷新 → 仍显示且标记未提交 → commit」可独立验收
-->

# 用户故事：历史恢复会话

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。

## 作为/我想要/以便

**作为** 想纠正错误的用户
**我想要** 浏览 commit 历史并把某个版本恢复到工作树，且刷新后恢复结果仍在
**以便** 我可以先检查结果，再决定是否以新 commit 保存，而不必担心恢复被静默当成历史改写

## 范围边界

### In Scope

- `restore(commitId)`：把目标 commit 的数据物化到当前工作树，**不移动 HEAD**、不改写历史
- 恢复会话（`RestoreSession`）的持久化与刷新后重建，且在 UI 中明确标记为「恢复后未提交」
- 恢复前的 dirty 工作树 / 缓存区检测与拒绝
- 把恢复结果作为普通工作树变更重新 stage / commit
- `restore` 的性能基线（并入 `bench-working-tree`）
- Angular / React / Vue 三端对称的恢复入口与状态

### Out of Scope

- commit 图与 HEAD 存储 —— 属 [US-305](./US-305-commit-graph-head.md)
- status / diff / stage 的状态机 —— 属 [US-306](./US-306-working-tree-index.md)
- 跨标签页冲突检测 —— 属 [US-308](./US-308-branch-isolation-conflict.md)
- rebase、cherry-pick、任意历史改写
- 把恢复实现成「把旧节点改成当前」

## 用户场景与验收标准

### User Story 1 - 查看历史并恢复（Priority: P1）

**独立测试**：创建至少三个 commit，选择中间版本恢复，刷新后确认恢复结果，再 commit 验证历史没有被覆盖。

**验收场景**：

1. **Given** commit 图中存在目标 commit，**When** 用户打开 log 并查看详情，**Then** 能看到消息、作者、时间、父 commit、涉及实体数量和变更摘要。
2. **Given** 工作树和缓存区均 clean，**When** 用户恢复任意可达 commit，**Then** 目标数据物化到当前工作树，当前分支 HEAD 不移动，恢复状态可被 `status()` 识别为 `restoring`。
3. **Given** 用户执行 `restore(commitId)` 尚未 commit，**When** 页面刷新，**Then** 恢复后的工作树继续显示，且明确标记为「恢复后未提交」。
4. **Given** 历史恢复会话已建立，**When** 用户用新消息 commit，**Then** 生成以原 HEAD 为父节点的新 commit，旧 commit 和原有后继节点仍可访问。
5. **Given** 用户在恢复会话中选择 discard，**When** 操作完成，**Then** 工作树回到当前 HEAD，恢复会话和未提交 stage 一并清除，历史 commit 不变。

### User Story 2 - 拒绝会造成数据丢失的恢复（Priority: P1）

**验收场景**：

1. **Given** 工作树存在未提交修改，**When** 用户恢复历史 commit，**Then** 系统拒绝操作并说明需先 commit、stage 后处理或 discard，不覆盖未提交数据。
2. **Given** 恢复目标 commit 不存在、不可达或属于其他数据库，**When** 用户恢复，**Then** 拒绝操作，工作树不变。
3. **Given** 恢复涉及跨实体的外键依赖，**When** 恢复中途失败，**Then** 在事务边界内回滚全部实体和元数据，不留下部分物化的中间态。
4. **Given** 恢复目标包含已被删除的实体，**When** 恢复到删除前的 commit，**Then** 实体重新出现，且以普通 INSERT 变更形式进入工作树。
5. **Given** 已存在一个未提交的恢复会话（`status()` 为 `restoring`），**When** 用户再次 `restore(另一个 commitId)`，**Then** 操作被拒绝（恢复会话即 dirty，FR-035），错误说明需先 commit 或 discard，前一个恢复会话的目标 commit 与工作树数据均不变。
6. **Given** HEAD 处于 unborn（[US-305 FR-030](./US-305-commit-graph-head.md)），**When** 用户 restore，**Then** 操作被拒绝并说明"尚无可恢复的历史"，工作树不变。

## 功能需求

- **FR-013**：系统 MUST 支持将可达历史 commit 恢复到当前工作树；恢复默认不移动 HEAD、不删除历史，并将恢复会话持久化。
- **FR-014**：系统 MUST 在恢复前检测 dirty 工作树 / 缓存区；未显式处理未提交变更时，恢复操作必须拒绝并保持原状。
- **FR-015**：系统 MUST 支持将恢复结果作为普通工作树变更重新 stage/commit；生成的新 commit 不得改写被恢复的历史节点。
- **FR-029**（原 FR-026b，已改口径与编号，见 [epic-006](../../epics/epic-006-working-tree-commits.md)）：系统 MUST 在 [US-305 FR-037](./US-305-commit-graph-head.md) 建立的 `bench-working-tree` harness 中**补充**「打开已有历史并恢复最近 commit」场景，报告 p50/p95。MUST NOT 重复注册 target 或另起 bench 文件。门禁用**同一次运行内的 A/B 对照**（A = 未启用 commit 能力的等价物化路径，B = 经 restore 的同一操作），判定值 `(B.p50 - A.p50) / A.p50`，阈值随 [US-306 FR-026](./US-306-working-tree-index.md) 一并冻结，并同样需要**实测分布 + 独立论证的上限**两样依据。固定 fixture 为 10,000 条实体记录 / 100 个 commit，基准环境为 Node + PGlite memory。不承诺浏览器 OPFS / IDB 下的同一数字。
- **FR-035**（新增）：恢复会话 MUST 是**每分支至多一个**的状态。当前已存在未提交的恢复会话时，再次调用 `restore(commitId)` MUST 按 FR-014 的 dirty 规则拒绝（恢复会话本身即视为 dirty 工作树），并在错误中说明可用出路：commit、discard 恢复会话，或先 `clearIndex()`。MUST NOT 静默覆盖前一个恢复会话的目标 commit。

## 关键实体

- **RestoreSession**：历史恢复会话；目标 commit、恢复前 HEAD、生成的工作树版本、创建时间、是否已提交。

## 设计展开

### 恢复规则

- restore 以目标 commit 为数据源、以当前 HEAD 为工作树基线，产生普通的 INSERT / UPDATE / DELETE 工作树变更；目标 commit 本身**不**被标记为「当前」。
- restore、discard 均须在事务边界内物化跨实体关系；失败时回滚全部实体和元数据。
- 历史节点永不通过「把旧节点改成当前」实现恢复；需要可追踪的恢复动作时，用户必须再创建一个新 commit。
- 恢复会话必须与工作树数据在同一提交屏障内可恢复，否则刷新后会出现「数据是恢复后的、状态却显示 clean」的错配。
- 恢复会话每分支至多一个，且本身计为 dirty：restore → restore 走拒绝路径而不是"覆盖上一个会话"（FR-035）。恢复会话同样是 per-(database, branch) 的共享状态（[US-306 FR-034](./US-306-working-tree-index.md)），另一标签页看到的 `restoring` 与本标签页一致。
- `restore` 依赖存在可达 commit，因此在 unborn HEAD 下无意义并被拒绝。

## 测试要求

- 先写「restore → 刷新 → 仍标记未提交」的失败用例，再实现；覆盖率不低于 90%。
- 拒绝路径（dirty、不可达 commit、跨库 commit、恢复会话中再次 restore、unborn HEAD）各有独立用例，断言工作树零变化。
- 三端各有等价测试，并用跨框架 E2E 验证 log → restore → refresh → commit 流程。
- 恢复中断的回滚用例必须覆盖含外键依赖的多实体事务。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 恢复语义与恢复会话
- `packages/rxdb/src/system/` — 恢复会话元数据
- `packages/rxdb-{angular,react,vue}/` — 对称的恢复入口与状态
- `apps/dev-rxdb-{angular,react,vue}/` — 历史与恢复演示
- `benchmarks/working-tree.bench.ts` — **在既有 harness 中追加**恢复场景的 A/B 对照采样；harness 与 target 注册见 [US-305 FR-037](./US-305-commit-graph-head.md)，本故事不改 `benchmarks/project.json`
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md)
- [US-306 工作树、缓存区与提交操作](./US-306-working-tree-index.md)
- [US-302 撤销/重做](./US-302-undo-redo.md) — 现有 `restoreEntity` 与 durable undo 语义
