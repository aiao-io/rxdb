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
- [x] Independent: 只交付业务写入到 WorkingTreeEntry 的原子捕获，不实现 index 与 UI
- [x] Negotiable: 物理表名和复用 RxDBChange 的方式可在 plan 阶段调整
- [x] Valuable: 刷新和切回分支后不再丢失未提交工作
- [x] Estimable: 写入口矩阵、revision 与后端范围已冻结
- [x] Small: 范围限制在 working-tree 真相源和 conformance，不含 stage/commit/restore/switch UI
- [x] Testable: 每类写入口都能独立验证「写入 → 刷新 → 重放」
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
- [US-305](./US-305-commit-graph-head.md) 提供 commit graph、branch ref 与 baseline

## 范围边界

### In Scope

- `WorkingTreeState` / `WorkingTreeEntry` 的持久化布局和 `workingTreeRevision` CAS
- 普通 CRUD、显式 callback transaction 与 Workspace 草稿 `save()` 的原子捕获
- pull、autoSync、pullRepository、sync、bulkSync 的 `origin=remote_sync` 捕获和 push echo 隔离
- mergeBranch、undo/redo 的工作树维护；纯 remoteId、水位和审计时间更新排除
- QueryCache 完整排除，以及混合 callback transaction 的整笔回滚
- active branch token 校验、raw/未知 bypass 拒绝、字段加密 envelope
- PGlite、四个 SQLite 浏览器适配器和 desktop SQLite host 的共享 conformance

### Out of Scope

- status/diff/index/stage/commit/discard，归 [US-306b](./US-306b-index-commit-state-machine.md)
- 三框架 API、a11y、E2E 和 benchmark，归 [US-306c](./US-306c-cross-framework-working-tree.md)
- restore session 与 branch switch，分别归 US-307 / US-308

## 验收场景

1. **Given** 当前分支有 HEAD，**When** INSERT/UPDATE/DELETE 成功，**Then** 业务行、完整 `WorkingTreeEntry` 与递增后的 working-tree revision 在同一事务可见；任一步失败全部回滚。
2. **Given** A 分支有未提交数据，**When** 刷新、关闭重开或切出再切回，**Then** 只凭 A 的 HEAD 与 WorkingTreeEntry 可重建相同业务值、单元身份和 revision。
3. **Given** full/filter 同步关闭 `RxDBChange` trigger，**When** 远端实体产生净变化，**Then** 同一事务写入 `origin=remote_sync` 的未暂存单元且不产生可 push change。
4. **Given** 同步只更新 remoteId、水位或审计时间，**When** 事务提交，**Then** 不创建工作树单元、不递增 revision。
5. **Given** mergeBranch 或 undo/redo 修改业务表，**When** 操作提交，**Then** 对应工作树单元与操作自身 revision 在同一事务收敛。
6. **Given** QueryCache 刷新或淘汰，**When** 操作完成，**Then** 它不进入 baseline 或工作树；callback transaction 在任意时点混写 QueryCache 与版本化实体时抛 `mixed_versioned_cache_transaction` 并整笔回滚。
7. **Given** Tab A 持有分支 A 的 active token，**When** Tab B 切换分支后 A 保存旧实体，**Then** 返回 `stale_active_branch`，业务表与两个分支工作树均零变化。
8. **Given** 加密字段含明文哨兵，**When** CRUD、同步、刷新并重放，**Then** WorkingTreeEntry 原始 dump 零明文，解锁后业务值正确。
9. **Given** commit capability 已启用，**When** raw SQL 或未知 adapter 路径试图绕过工作树维护，**Then** 在业务提交前返回 `commit_capability_mismatch`，不得先写实体再补记事件。

## 功能需求

- 承接父故事 FR-039、FR-045、FR-046 中的 WorkingTreeEntry 部分。
- 每个成功工作树单元 MUST 包含分支、实体/事务身份、操作、可恢复数据、当前指纹、来源 change ID 与 origin。
- callback transaction 的混合类型只能在执行过程中被发现；检测后 MUST 通过事务回滚保证提交边界外零变化，不要求系统预知回调未来操作。
- `WorkingTreeState` 只存 revision/计数不算完成；条目必须可枚举、可重放并按分支隔离。

## 测试要求

- 核心包先写失败用例，覆盖率不低于 90%。
- `workingTreeCaptureConformanceSuite` 在全部 v1 本地后端运行，逐项覆盖 CRUD、callback transaction、所有同步入口、merge、undo/redo、QueryCache 与 raw bypass。
- 必须注入“业务行已写、WorkingTreeEntry 写入前失败”，断言事务全量回滚。
- 测试文件使用 `*.spec.ts`，跨 realm fixture 不依赖固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 工作树单元与写入口编排
- `packages/rxdb/src/system/` — WorkingTreeState / WorkingTreeEntry
- `packages/rxdb-test/` — 跨后端 capture conformance
- 各 v1 本地 adapter — 事务内 trigger/capability 接入

