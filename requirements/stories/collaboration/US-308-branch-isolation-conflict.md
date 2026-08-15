---
id: US-308
title: 分支隔离与跨 realm 冲突检测
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-15
tags: [collaboration, branch, concurrency, writer-lease, conflict]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305/306 的 revision CAS 与 US-304 的迁移 fencing，但分支往返和冲突诊断自成一条交付线
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

跨 realm 写入先经过 [US-304](./US-304-writer-lease-migration-fencing.md) 的 writer lease / epoch fencing，
再使用 US-305/306 持久化的 head/index/working-tree revision CAS。epoch 只识别 schema 迁移后的 stale writer，
普通提交竞争只看领域 revision；不得用 `BroadcastChannel` 或内存状态承担正确性。US-304、US-305、US-306
任一未 Done 时本故事不可开工。

## 既有 `switchBranch()` 的兼容处置

原 US-305 的 FR-017 写「切换分支前**默认**要求工作区 clean」。这与同一份文档的 FR-018「已有 API 的行为不能因为 commit 功能而改变」直接冲突，而且是会打破用户代码的那种冲突：

- [VersionManager.ts:756](../../../packages/rxdb/src/version/VersionManager.ts#L756) 的 `switchBranch(branchId: string)` 当前**无条件**切换，没有 dirty 检查，也没有 options 参数。
- [website/docs/collaboration/branch.md](../../../website/docs/collaboration/branch.md) 里所有示例都是直接 `await rxdb.versionManager.switchBranch('feature-1')`。
- [apps/dev-rxdb-supabase/src/app/branch-manager.ts:203](../../../apps/dev-rxdb-supabase/src/app/branch-manager.ts#L203) 从一个下拉框直接调用它，没有任何 dirty 处理路径。
- `VersionManager` 类方法签名不受只记录导出名的 api-baseline 完整保护；现有 `SwitchBranchOptions` 还是
  适配器层 `{ branchId, actions }` 契约，不能拿来表示用户侧 `{ requireClean }`。所以本故事必须补
  `public-type-compatibility` 方法签名测试，不能只更新导出名基线。

本故事定死：

1. `switchBranch(branchId)` 的默认行为**不变**：仍然无条件切换。
2. clean 检查是**显式选项**：`switchBranch(branchId, { requireClean: true })`，公开选项类型为
   `WorkingTreeSwitchBranchOptions`；参数省略时行为与今天完全一致。
3. 要把默认改成拒绝，必须走独立的破坏性变更故事，并按仓库的版本发布门禁处理，不在本 Epic 内夹带。
4. 无条件切换不等于 reset：来源分支的工作树/index 必须保留，目标分支有未提交状态时恢复自己的状态，
   只有目标分支从未产生未提交状态时才从 HEAD 物化。

## 范围边界

### In Scope

- 分支与工作树 / 缓存区的隔离：切换后恢复目标分支自己的状态；没有未提交状态时才物化目标 HEAD
- `requireClean` 显式选项与对应的可操作错误
- 跨标签页 / 跨 realm revision CAS 的集成 fixture 与类型化诊断
- `CommitConflict` 派生值与三端一致的冲突提示语义

### Out of Scope

- 改变 `switchBranch()` 的现有默认行为（见上）
- 自动合并冲突的最终解决 UI（本故事只要求检测并阻止静默覆盖）
- 自动 stash / stash pop 与跨分支携带脏工作树
- 远程多人协作的权限与签名

## 用户场景与验收标准

### User Story 1 - 分支隔离（Priority: P2）

**独立测试**：在分支 A 留下未提交修改，创建/切换分支 B，回到 A 检查隔离。

**验收场景**：

1. **Given** 分支 A 和 B 指向不同 commit 且都没有未提交状态，**When** 用户切换分支，**Then** 工作树物化为目标分支 HEAD，缓存区不会串到另一分支。
2. **Given** 当前工作树 dirty，**When** 用户以 `{ requireClean: true }` 切换分支，**Then** 拒绝切换并保留数据，错误说明可用的处理方式（commit / discard）。
3. **Given** 当前工作树 dirty，**When** 用户调用不带选项的 `switchBranch(branchId)`，**Then** 行为与本故事实施前**完全一致**（切换成功），现有文档示例与 `dev-rxdb-supabase` demo 无需修改即可通过。
4. **Given** 创建新分支，**When** 操作完成，**Then** 新分支从当前 HEAD 开始，且分支之间不共享可变的 HEAD / 缓存区状态。
5. **Given** A/B 两个分支各自有 dirty 工作树和 staged 条目，**When** 执行 A → B → A → B，**Then** 每次都恢复目标分支原有工作树/index/revision，任何一端都不被 reset 到 HEAD。

### User Story 2 - 跨标签页并发（Priority: P2）

**独立测试**：两个同源标签页打开同一数据库，一个提交，另一个尝试提交。

**验收场景**：

1. **Given** 两个同源标签页从相同 revision 开始操作同一分支，**When** 一个标签页先推进 HEAD 或 index，另一个随后提交，**Then** 后者的 CAS 失败并返回 expected/actual revision，禁止静默丢弃另一方修改。
2. **Given** commit 已成功写入但 UI 在刷新前关闭，**When** 重新打开任一标签页，**Then** commit、HEAD 和工作树状态最终收敛到同一结果。
3. **Given** stage 后另一个标签页删除或更新同一实体但未移动 HEAD/index，**When** 本标签页提交原 staged snapshot，**Then** 提交只推进 staged 版本，后续删除/更新继续作为 unstaged 保留，不因 writer 身份产生特殊分支。
4. **Given** writer 挂起期间发生 schema 迁移并抬升 epoch，**When** stale writer 恢复后提交，**Then** 先走 US-304 的 `writer_fenced` 路径；未发生迁移的普通竞争则只走 revision CAS。

## 功能需求

- **FR-017**（已改口径）：系统 MUST 与现有分支操作集成：创建分支从当前 HEAD 开始，分支之间不得共享可变的 HEAD / 工作树 / index。切换 MUST 保存来源分支状态并恢复目标分支状态；clean 检查 MUST 以 `WorkingTreeSwitchBranchOptions.requireClean` 显式提供，`switchBranch(branchId)` 不带选项时仍无条件切换。
- **FR-020**：系统 MUST 使用 US-305/306 的持久化 revision CAS 阻止跨标签页静默覆盖，并使用 US-304 epoch 拒绝迁移后的 stale writer。两者职责不得混用，也不得只依赖 `BroadcastChannel` 或内存状态。
- **FR-035**：`CommitConflict` MUST 从失败操作、对象 ID、expected/actual head/index/working-tree revision 与建议动作派生，不得建立第二张可与真实 revision 漂移的冲突状态表。

## 关键实体

- **CommitConflict**：并发或版本校验失败的不可变诊断值；操作、对象、expected/actual revision、受影响变更单元和建议动作。它由持久化状态派生，不是协调锁或独立真相源。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 测试要求

- 必须有跨标签页 / 跨 realm 并发测试，覆盖 HEAD/index CAS、重复 commit、stale writer fencing，以及 stage 后编辑统一保留为 unstaged。
- 必须有 A dirty+staged → B dirty+staged → A → B 往返测试，断言每个分支的数据、index 和 revision 均恢复。
- 必须有一条回归用例专门断言**不带选项**的 `switchBranch(branchId)` 行为未变（AC User Story 1 场景 3）。
- 必须有 `public-type-compatibility` 用例断言旧的一参调用继续编译、新的可选参数使用 `WorkingTreeSwitchBranchOptions`，适配器层 `SwitchBranchOptions` 签名不变。
- 三端冲突提示的语义、错误分类与恢复建议必须一致，并有等价测试。
- 测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/VersionManager.ts` — `switchBranch` 新增可选参数，默认行为不变
- `packages/rxdb/src/version/` — 分支隔离、revision 冲突派生与错误分类
- `packages/rxdb-{angular,react,vue}/` — 对称的冲突状态与提示
- `requirements/api-baseline/rxdb.json` — `WorkingTreeSwitchBranchOptions` 与 `CommitConflict`
- `packages/rxdb/src/__tests__/contracts/` — `switchBranch` 公开方法签名兼容测试

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — 只复用 writer 身份与迁移期 epoch fencing
- [US-306 工作树、缓存区与提交操作](./US-306-working-tree-index.md)
- [US-301 版本控制](./US-301-version-control.md) — 现有分支能力
- [分支文档](../../../website/docs/collaboration/branch.md) — 受 FR-017 口径影响的现有示例
