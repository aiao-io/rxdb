---
id: US-308
title: 分支隔离与跨 realm 冲突检测
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-13
tags: [collaboration, branch, concurrency, writer-lease, conflict]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-306 的工作树状态与 US-304 的 lease，但冲突协议自成一条交付线
- [x] Negotiable: 冲突记录结构与提示文案可在 plan 阶段调整
- [x] Valuable: 多标签页/多分支下不会静默丢失另一方的修改
- [x] Estimable: 现有 switchBranch 行为与 lease 契约都已确认
- [x] Small: 只做分支隔离与并发校验，不改 commit 存储，不改 restore 语义
- [x] Testable: 双 realm fixture 可判定「后到的提交被拒绝且无数据丢失」
-->

# 用户故事：分支隔离与跨 realm 冲突检测

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。

## 作为/我想要/以便

**作为** 在多个实验分支或标签页中工作的开发者
**我想要** 每个分支拥有自己的 HEAD、工作树和缓存区，并能发现并发冲突
**以便** 切换和协作时不会静默覆盖本地修改

## 前置依赖

跨 realm 校验必须建立在 [US-304](./US-304-writer-lease-migration-fencing.md) 的 writer lease / epoch fencing 之上（复用 `rxdb_writer_lease` 的 writer 身份与 epoch），**不得**另起一套跨 realm 协调协议，也不得只依赖 `BroadcastChannel` 或内存状态。US-304 未 Done 时本故事不可开工。

## 既有 `switchBranch()` 的兼容处置

原 US-305 的 FR-017 写「切换分支前**默认**要求工作区 clean」。这与同一份文档的 FR-018「已有 API 的行为不能因为 commit 功能而改变」直接冲突，而且是会打破用户代码的那种冲突：

- [VersionManager.ts:756](../../../packages/rxdb/src/version/VersionManager.ts#L756) 的 `switchBranch(branchId: string)` 当前**无条件**切换，没有 dirty 检查，也没有 options 参数。
- [website/docs/collaboration/branch.md](../../../website/docs/collaboration/branch.md) 里所有示例都是直接 `await rxdb.versionManager.switchBranch('feature-1')`。
- [apps/dev-rxdb-supabase/src/app/branch-manager.ts:203](../../../apps/dev-rxdb-supabase/src/app/branch-manager.ts#L203) 从一个下拉框直接调用它，没有任何 dirty 处理路径。
- `VersionManager` 类本身不在 [api-baseline/rxdb.json](../../api-baseline/rxdb.json) 的导出清单里（只有 `SwitchBranchOptions` 在），所以**给它加拒绝路径不会被 api-baseline 门禁挡住**——破坏会一路走到用户那里才被发现。

本故事定死：

1. `switchBranch(branchId)` 的默认行为**不变**：仍然无条件切换。
2. clean 检查是**显式选项**：`switchBranch(branchId, { requireClean: true })`，或本 Epic 新契约自己的入口；参数省略时行为与今天完全一致。
3. 要把默认改成拒绝，必须走独立的破坏性变更故事，并按仓库的版本发布门禁处理，不在本 Epic 内夹带。

## 范围边界

### In Scope

- 分支与工作树 / 缓存区的隔离：切换后物化为目标分支 HEAD，缓存区不串分支
- `requireClean` 显式选项与对应的可操作错误
- 跨标签页 / 跨 realm 的 HEAD、缓存区版本、工作树版本校验，复用 US-304 的 epoch
- 冲突记录（`CommitConflict`）与三端一致的冲突提示语义
- 提交前对 staged 条目的版本指纹重校验

### Out of Scope

- 改变 `switchBranch()` 的现有默认行为（见上）
- 自动合并冲突的最终解决 UI（本故事只要求检测并阻止静默覆盖）
- 自动 stash / stash pop 与跨分支携带脏工作树
- 远程多人协作的权限与签名

## 用户场景与验收标准

### User Story 1 - 分支隔离（Priority: P2）

**独立测试**：在分支 A 留下未提交修改，创建/切换分支 B，回到 A 检查隔离。

**验收场景**：

1. **Given** 分支 A 和 B 指向不同 commit，**When** 用户切换分支，**Then** 工作树物化为目标分支 HEAD，缓存区不会串到另一分支。
2. **Given** 当前工作树 dirty，**When** 用户以 `{ requireClean: true }` 切换分支，**Then** 拒绝切换并保留数据，错误说明可用的处理方式（commit / discard）。
3. **Given** 当前工作树 dirty，**When** 用户调用不带选项的 `switchBranch(branchId)`，**Then** 行为与本故事实施前**完全一致**（切换成功），现有文档示例与 `dev-rxdb-supabase` demo 无需修改即可通过。
4. **Given** 创建新分支，**When** 操作完成，**Then** 新分支从当前 HEAD 开始，且分支之间不共享可变的 HEAD / 缓存区状态。

### User Story 2 - 跨标签页并发（Priority: P2）

**独立测试**：两个同源标签页打开同一数据库，一个提交，另一个尝试提交。

**验收场景**：

1. **Given** 两个同源标签页同时修改同一工作树，**When** 后到的标签页尝试提交，**Then** 系统检测 HEAD 或缓存区版本已变化，要求刷新、合并或重新 stage，禁止静默丢弃另一方修改。
2. **Given** commit 已成功写入但 UI 在刷新前关闭，**When** 重新打开任一标签页，**Then** commit、HEAD 和工作树状态最终收敛到同一结果。
3. **Given** 缓存区中的实体已被其他标签页删除或更新，**When** 本标签页提交，**Then** 版本指纹重校验失败并返回冲突，不使用过期快照写入。
4. **Given** 另一 realm 持有的 writer lease 已过期，**When** 本 realm 提交，**Then** 走 US-304 既有的 fencing 路径判定，不额外发明第二套判定。

## 功能需求

- **FR-017**（已改口径）：系统 MUST 与现有分支操作集成：创建分支从当前 HEAD 开始，分支之间不得共享可变的 HEAD / 缓存区状态。分支切换的 clean 检查 MUST 以显式选项提供；`switchBranch(branchId)` 不带选项时的行为 MUST NOT 改变。
- **FR-020**：系统 MUST 在跨标签页或并发写入时校验 HEAD、缓存区版本和工作树版本；检测到冲突时阻止静默覆盖并提供可操作错误。该校验 MUST 建立在 [US-304](./US-304-writer-lease-migration-fencing.md) 的 writer lease / epoch fencing 之上，MUST NOT 另起一套跨 realm 协调协议，也不得只依赖 `BroadcastChannel` 或内存状态。

## 关键实体

- **CommitConflict**：并发或版本校验失败记录；本地版本、发现的其他 realm 版本、受影响的变更单元、处理状态。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 测试要求

- 必须有跨标签页 / 跨 realm 并发测试，覆盖 HEAD 乐观校验、重复 commit、防止旧 stage 覆盖新编辑。
- 必须有一条回归用例专门断言**不带选项**的 `switchBranch(branchId)` 行为未变（AC User Story 1 场景 3）。
- 三端冲突提示的语义、错误分类与恢复建议必须一致，并有等价测试。
- 测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/VersionManager.ts` — `switchBranch` 新增可选参数，默认行为不变
- `packages/rxdb/src/version/` — 分支隔离与并发校验
- `packages/rxdb/src/system/` — 冲突记录
- `packages/rxdb-{angular,react,vue}/` — 对称的冲突状态与提示
- `requirements/api-baseline/rxdb.json` — `SwitchBranchOptions` 与新增冲突类型

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — 本故事复用其 writer 身份与 epoch
- [US-306 工作树、缓存区与提交操作](./US-306-working-tree-index.md)
- [US-301 版本控制](./US-301-version-control.md) — 现有分支能力
- [分支文档](../../../website/docs/collaboration/branch.md) — 受 FR-017 口径影响的现有示例
