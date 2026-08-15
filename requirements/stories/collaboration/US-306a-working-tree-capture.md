---
id: US-306a
title: 工作树写入捕获与持久化
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-15
updated: 2026-08-15
tags: [collaboration, working-tree, persistence, transaction, sync, adapter]
---

<!--
INVEST 检查清单:
- [x] Independent: 只交付业务写入到 WorkingTreeEntry 的原子捕获，不实现 index 与 UI；
      所需的 `WorkingTreeActivationState` 由前置 US-305 建表，不倒挂依赖后置的 US-308
- [x] Negotiable: 物理表名和复用 RxDBChange 的方式可在 plan 阶段调整
- [x] Valuable: 刷新后不再丢失未提交工作
- [x] Estimable: 写入口矩阵、revision 与后端范围已冻结
- [x] Small: 范围限制在 working-tree 真相源和 conformance，不含 stage/commit/restore/switch 语义
- [x] Testable: 每类写入口都能独立验证「写入 → 刷新 → 重放」；所有断言都在持久层完成，
      不需要 US-308 的 switch 入口先落地
-->

# 用户故事：工作树写入捕获与持久化

> 父契约见 [US-306](./US-306-working-tree-index.md)，状态模型与写入口矩阵见
> [epic-006](../../epics/epic-006-working-tree-commits.md)。

## 作为/我想要/以便

**作为** 在本地持续编辑数据的开发者
**我想要** 每次业务实体净变化都与可重放工作树单元原子落盘
**以便** 刷新、崩溃或切回分支后仍能从 HEAD 恢复未提交状态

## 前置依赖

- [US-304](./US-304-writer-lease-migration-fencing.md) 提供 writer 身份与迁移 epoch fencing
- [US-305](./US-305-commit-graph-head.md) 提供 commit graph、branch ref、baseline，以及
  **`WorkingTreeActivationState` 的建表与初始化**（FR-052）。本故事只消费它做写路径 token 校验，
  不实现 switch 语义，因此不依赖排在后面的 US-308

> **与 US-308 的分工（重要）**：凡「必须真的切一次分支才能观察」的行为——切出再切回后恢复目标分支工作树、
> 分支间隔离——一律归 [US-308](./US-308-branch-isolation-conflict.md)，本故事不写这类验收场景。本故事用
> **持久层重放断言**等价覆盖同一份数据契约：清掉进程内状态、只喂 HEAD + WorkingTreeEntry，验证能重建出相同结果。
> 这样 306a 在 US-308 之前就能独立验收，也不会把同一条断言在两个故事里各写一遍。

## 范围边界

### In Scope

- `WorkingTreeState` / `WorkingTreeEntry` 的持久化布局和 `workingTreeRevision` CAS
- 普通 CRUD、显式 callback transaction 与 Workspace 草稿 `save()` 的原子捕获
- pull、autoSync、pullRepository、sync、bulkSync 的 `origin=remote_sync` 捕获和 push echo 隔离
- mergeBranch、undo/redo 的工作树维护；纯 remoteId、水位和审计时间更新排除
- Workspace 插件 NEW 草稿的**排除边界**：草稿留在插件独立 IndexedDB，不进工作树；`save()` 后才作为普通 INSERT 捕获
- QueryCache 完整排除，以及混合 callback transaction 的整笔回滚
- active branch token 校验（消费 US-305 建立的 `activationRevision`）、raw/未知 bypass 拒绝、字段加密 envelope
- **既有 switch / baseline 物化路径的受信登记**：与 bypass 拒绝门禁同批交付，保证关 trigger 的批量投影重写
  不被门禁误杀、也不产生工作树条目（见 [epic-006 写入口语义矩阵](../../epics/epic-006-working-tree-commits.md#写入口语义矩阵)）
- `WorkingTreeState` / `WorkingTreeEntry` 的公开类型、TSDoc 与 api-baseline 登记
- PGlite、四个 SQLite 浏览器适配器和 Electron `node:sqlite` host 的共享 conformance（6 个 v1 后端）

### Out of Scope

- status/diff/index/stage/commit/discard，归 [US-306b](./US-306b-index-commit-state-machine.md)
- 三框架 API、a11y、E2E 和 benchmark，归 [US-306c](./US-306c-cross-framework-working-tree.md)
- restore session 归 US-307
- **分支切换的一切用户可见语义**归 US-308：切换后恢复目标分支工作树/index、`requireClean`、
  `activationRevision` 的递增与 switch CAS。本故事只登记 switch 物化路径为受信路径（机制），不改其语义
- Tauri Rust host 的 conformance —— 待 US-210 Done 后按 epic 统一补入

## 验收场景

1. **Given** 当前分支有 HEAD，**When** INSERT/UPDATE/DELETE 成功，**Then** 业务行、完整 `WorkingTreeEntry` 与递增后的 working-tree revision 在同一事务可见；任一步失败全部回滚。
2. **Given** 当前分支有未提交数据，**When** 刷新或关闭重开（进程内状态全部丢弃），**Then** 只凭该分支的 HEAD 与持久化 `WorkingTreeEntry` 可重建相同业务值、单元身份和 `workingTreeRevision`，不依赖内存 dirty set 或最后一次写入残留在业务表里的值。
   **且 Given** 直接丢弃业务表投影后只喂 HEAD + WorkingTreeEntry 冷重放，**Then** 结果与刷新前逐字段相等——这条断言证明「非激活分支可仅凭 HEAD 与自己的变更单元恢复」，无需经过 `switchBranch` 入口；切出再切回的端到端往返由 [US-308](./US-308-branch-isolation-conflict.md) US1-AC5 验收。
3. **Given** full/filter 同步关闭 `RxDBChange` trigger，**When** 远端实体产生净变化，**Then** 同一事务写入 `origin=remote_sync` 的未暂存单元且不产生可 push change。
4. **Given** 同步只更新 remoteId、水位或审计时间，**When** 事务提交，**Then** 不创建工作树单元、不递增 revision。
5. **Given** mergeBranch 或 undo/redo 修改业务表，**When** 操作提交，**Then** 对应工作树单元与操作自身 revision 在同一事务收敛。
6. **Given** QueryCache 刷新或淘汰，**When** 操作完成，**Then** 它不进入 baseline 或工作树；callback transaction 在任意时点混写 QueryCache 与版本化实体时抛 `mixed_versioned_cache_transaction` 并整笔回滚。
7. **Given** realm A 在读取实体时捕获了 `{ branchId, activationRevision }`，**When** 另一个 writer 推进了 `activationRevision`（fixture 直接推进该单行状态，不经 `switchBranch` 入口）后 A 保存旧实体，**Then** 写事务以 `stale_active_branch` 拒绝，业务表与工作树零变化，错误返回 expected/actual。
   > 真实双 Tab「Tab B 切分支 → Tab A 保存旧实体」的端到端 fixture 归 [US-308](./US-308-branch-isolation-conflict.md) US2-AC5；本故事只证明写路径的 token 校验本身成立。
8. **Given** 加密字段含明文哨兵，**When** CRUD、同步、刷新并重放，**Then** WorkingTreeEntry 原始 dump 零明文，解锁后业务值正确。
9. **Given** commit capability 已启用，**When** raw SQL 或未知 adapter 路径试图绕过工作树维护，**Then** 在业务提交前返回 `commit_capability_mismatch`，不得先写实体再补记事件。
10. **Given** Workspace 插件中存在 NEW 草稿，**When** 应用启动并读取工作树，**Then** 草稿仍按插件规则从其独立 IndexedDB 恢复，既不出现在 `WorkingTreeEntry` 中、也不递增 `workingTreeRevision`；**When** 用户对该草稿调用 `save()`，**Then** 它作为一次普通 INSERT 被捕获成本地工作树单元。承接父故事 US1-AC3 的工作树半边（baseline 半边由 US-305 AC US2-6 承担）。
11. **Given** 第 9 条的 bypass 拒绝门禁已启用，**When** 既有 `switchBranch` / baseline 物化以受信路径关闭 trigger 重写业务投影，**Then** 操作正常完成、不被 `commit_capability_mismatch` 拒绝、不产生工作树单元、不递增 `workingTreeRevision`；**When** 同一批量重写走的是未登记路径，**Then** 仍被拒绝。此条只验证「受信登记机制成立」，切换分支后的工作树恢复语义归 US-308。

## 功能需求

### 承接的父故事条目（逐条可核对）

| 父故事条目            | 本故事承接范围                                                                                        | 对应验收场景             |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| FR-039                | 全部：CRUD 在同一事务校验 active token、写实体、写/合并 WorkingTreeEntry、递增 revision               | AC1、AC7                 |
| FR-045                | 仅 `WorkingTreeEntry` 半边（`IndexEntry` 半边归 US-306b）                                             | AC8                      |
| FR-046                | 全部：写入口矩阵、`origin=remote_sync`、纯元数据更新、QueryCache 排除与混用回滚、raw/未知 bypass 拒绝 | AC3、AC4、AC6、AC9、AC11 |
| US-306 US1-AC1        | 刷新后工作树数据与未暂存标记一致（diff 部分归 US-306b）                                               | AC2                      |
| US-306 US1-AC3        | 仅工作树半边：草稿不进工作树、`save()` 后按普通 INSERT 捕获                                           | AC10                     |
| US-306 US1-AC4        | 仅持久层半边：仅凭 HEAD + WorkingTreeEntry 冷重建（switch 往返归 US-308）                             | AC2                      |
| US-306 US2-AC17/18/19 | 全部                                                                                                  | AC3、AC4、AC6            |
| US-305 FR-052         | 消费方：使用其建立的 `activationRevision` 做写路径 token 校验，不递增                                 | AC7                      |

### 本故事新增

- 每个成功工作树单元 MUST 包含分支、实体/事务身份、操作、可恢复数据、当前指纹、来源 change ID 与 origin。
- callback transaction 的混合类型只能在执行过程中被发现；检测后 MUST 通过事务回滚保证提交边界外零变化，不要求系统预知回调未来操作。
- `WorkingTreeState` 只存 revision/计数不算完成；条目必须可枚举、可重放并按分支隔离。
- 受信路径登记 MUST 与 bypass 拒绝门禁同批交付：既有 switch / baseline 物化在门禁启用后 MUST 继续可用，
  且 MUST NOT 产生工作树单元或递增 `workingTreeRevision`。未登记的批量重写 MUST 仍被拒绝。
- 新增公开类型（`WorkingTreeState`、`WorkingTreeEntry` 及其错误码）MUST 补齐 TSDoc 并登记进
  `requirements/api-baseline/rxdb.json`，前缀遵守 epic 术语表（禁止 `Workspace*`）。

## 测试要求

- 核心包先写失败用例，覆盖率不低于 90%。
- `workingTreeCaptureConformanceSuite` 在 6 个 v1 本地后端（PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai、
  Electron `node:sqlite` host）运行，逐项覆盖 CRUD、callback transaction、所有同步入口、merge、undo/redo、
  QueryCache 与 raw bypass。任一后端缺席即本故事未完成。
- 必须注入“业务行已写、WorkingTreeEntry 写入前失败”，断言事务全量回滚。
- **冷重放测试**：丢弃业务表投影与全部进程内状态后，仅凭 HEAD + `WorkingTreeEntry` 重建，逐字段比对刷新前快照。
- **受信路径测试**：登记路径的批量重写通过门禁且零工作树副作用；同一重写走未登记路径时断言 `commit_capability_mismatch`。
- **类型契约测试**：`tri-framework-check` 之外新增 type-level 断言，验证 `WorkingTreeState` / `WorkingTreeEntry`
  从 `@aiao/rxdb` 导出且形状与 api-baseline 一致；api-baseline diff 未同步更新即失败。
- 新增公开导出缺 TSDoc 时 lint 失败（零警告门禁）。
- 测试文件使用 `*.spec.ts`，跨 realm fixture 不依赖固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 工作树单元与写入口编排、受信路径登记
- `packages/rxdb/src/system/` — WorkingTreeState / WorkingTreeEntry
- `packages/rxdb-test/` — `workingTreeCaptureConformanceSuite`
- `requirements/api-baseline/rxdb.json` — 新增公开类型登记
- 各 v1 本地 adapter — 事务内 trigger/capability 接入
