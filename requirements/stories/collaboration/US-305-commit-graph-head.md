---
id: US-305
title: 提交图与 HEAD 持久化
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-09
updated: 2026-08-13
tags: [collaboration, commit, head, persistence, migration]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖 US-304 的 lease/epoch，不依赖工作树与缓存区的任何 UI 或状态机
- [x] Negotiable: commit ID 生成方式、存储表名和 ChangeSet 编码可在 plan 阶段调整
- [x] Valuable: 有了持久 commit 图，历史节点第一次成为可长期引用的锚点
- [x] Estimable: 存储层次、审计字段和迁移路径已在本文列出
- [x] Small: 不含 status/diff/stage、不含 restore、不含分支切换改动
- [x] Testable: 最小闭环「写 commit → 刷新 → 读回 log/show」可独立验收
-->

# 用户故事：提交图与 HEAD 持久化

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> 本故事不重述，只承接落地与验收。

## 背景与问题

当前历史记录可以支持 undo、redo 和从历史恢复实体，但恢复结果与部分状态依赖当前页面会话；刷新后用户看不到上次的结果，也没有一个可以长期引用的提交节点。

早期的 `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 已在 `0.0.24` 删除（提交 `4d2495bdd`），因此这是全新设计，没有需要兼容的旧暂存契约。

本故事只做**底座**：commit 图、HEAD、分支引用的原子一致性、存储布局与一次性迁移。工作树与缓存区的状态机在 [US-306](./US-306-working-tree-index.md)。

## 作为/我想要/以便

**作为** 使用 RxDB 管理本地数据的开发者
**我想要** 把一组变更写成不可变 commit，并让 HEAD 与 commit 图在刷新后仍然可查询
**以便** 我有一个跨会话稳定、可审计、可被后续恢复引用的版本锚点

## 术语与状态模型

| Git 概念               | RxDB 中的含义                                          | 持久化要求                          |
| ---------------------- | ------------------------------------------------------ | ----------------------------------- |
| `HEAD`                 | 当前分支最近一次成功 commit 的指针                     | 必须持久化且只能指向已存在的 commit |
| 分支引用（branch ref） | 分支名到 `HEAD` commit 的映射；沿用现有分支能力         | 必须与 commit 更新原子一致          |
| commit                 | 带父节点、消息、作者和变更集合的不可变版本节点         | 创建后不可改；刷新后可查询          |
| ChangeSet              | commit 的变更单元集合，按实体/事务分组，保留可恢复信息 | 与 commit 同一提交屏障内可见        |

v1 的变更单元粒度为「实体操作或完整事务」。同一事务不能被拆到不同 commit；字段级、代码行级粒度属于后续扩展。

## 范围边界

### In Scope

- commit 图、`HEAD` 指针与分支引用的持久化存储布局
- commit 的原子写入：变更集合、父 commit、作者、时间、摘要与新的分支 HEAD 在一次操作内可见
- ChangeSet 的 patch / inverse patch 存储与实体身份、操作类型、基线版本、当前版本指纹
- `log(options?)` / `show(commitId)` 查询：按分支、实体、时间排序，返回详情与父子关系
- 已有数据库的一次性初始化：生成基线 commit、导入仍存在的 NEW 草稿、保留旧 change 记录，失败可重试且幂等
- 损坏或不兼容 commit 记录的隔离与诊断
- 与 `RxDBChange`、undo/redo、`restoreEntity` 的兼容边界

### Out of Scope

- status / diff / stage / unstage / commit 的用户操作面 —— 属 [US-306](./US-306-working-tree-index.md)
- 历史恢复会话 —— 属 [US-307](./US-307-restore-session.md)
- 分支切换行为与跨标签页冲突检测 —— 属 [US-308](./US-308-branch-isolation-conflict.md)
- 远程 push/pull、rebase、cherry-pick、任意历史改写
- 基于时间或大小的 commit 自动清理策略

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

### User Story 2 - 已有数据库首次启用（Priority: P1）

**作为** 已经在用 RxDB 的开发者
**我想要** 打开 commit 能力时不丢失既有数据与历史
**以便** 升级是一次可重试的迁移而不是重建

**独立测试**：在已有数据（含 NEW 草稿与旧 `RxDBChange`）的数据库上首次启用，重复启动两次。

**验收场景**：

1. **Given** 数据库已有数据但无 commit 图，**When** 首次启用，**Then** 生成一个只作为基线的初始 commit，不伪造旧 commit 的作者和消息；既有 `RxDBChange` 仍可供历史/undo 使用。
2. **Given** 首次初始化已完成，**When** 再次启动应用，**Then** 迁移幂等，不重复建立基线。
3. **Given** 迁移中途失败，**When** 重试，**Then** 从可验证的一致点继续，不产生重复基线或孤立 commit。
4. **Given** commit 图或索引记录损坏，**When** 启动，**Then** 隔离损坏记录，保留可验证的 commit，提供错误详情；**不得**静默回退到空库或内存模式。

## 功能需求

- **FR-001**：系统 MUST 为每个数据库和当前分支维护唯一有效的 `HEAD` 指针；`HEAD` 不得指向不存在或未完成写入的 commit。
- **FR-002**：系统 MUST 持久化 commit 元数据、分支引用与 HEAD；刷新、重启和正常关闭后可恢复。
- **FR-003**：系统 MUST 把 NEW、UPDATE、DELETE 和完整事务表示为可比较的变更单元，并为每条保留实体身份、操作类型、基线版本和当前版本指纹。
- **FR-008**：系统 MUST 要求 commit 包含非空、可读的消息，并在一次原子操作中写入变更集合、父 commit、作者、时间、摘要和新的分支 HEAD。
- **FR-009**：系统 MUST 保证 commit 不为空；无变更单元时提交失败且不产生空节点。
- **FR-010**：系统 MUST 保证 commit 创建失败时恢复提交前状态，不出现可见半状态。
- **FR-012**：系统 MUST 提供按当前分支、实体和时间排序的历史列表，以及单个 commit 的变更详情和父节点关系。
- **FR-018**：系统 MUST 与现有 `RxDBChange`、历史 undo/redo 和 `restoreEntity` 保持兼容；已有 API 的行为不能因为 commit 功能而改变。
- **FR-019**：系统 MUST 明确区分 durable commit 历史与会话级 redo 栈；刷新后 redo 可清空，但 commit 与 HEAD 不得清空。
- **FR-021**：系统 MUST 为已有数据库提供一次性初始化和迁移策略：生成基线 commit、导入仍存在的 NEW 草稿、保留旧 change 记录，并支持失败重试。
- **FR-022**：系统 MUST 对损坏或不兼容的 commit 记录进行隔离和诊断，不得将整个数据库静默降级为空工作树或内存模式。
- **FR-027**：commit 历史 MUST 可审计，至少记录稳定 commit ID、父节点、分支、作者标识、消息、创建时间、变更数量和 schema/数据版本；不得记录无法恢复的数据引用。

## 关键实体

- **Commit**：不可变提交；稳定 ID、一个或多个父节点、分支、作者、消息、时间、变更集合、摘要、数据/schema 版本。
- **BranchRef**：分支引用；分支 ID、名称、HEAD commit、创建来源、更新时间。
- **CommitChangeSet**：commit 的变更单元集合；按实体/事务分组，保留 patch、inverse patch 或等价可恢复信息。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：新导出一律 `Commit*` 前缀，
> **不得**使用 `Workspace*`——该前缀已被 `@aiao/rxdb-plugin-workspace` 的草稿缓存占用。

## 设计展开

### 持久化层次

1. 业务实体表保存当前物化数据，仍沿用现有 CRUD、事务和响应式查询。
2. 变更日志保存原子变更的 patch/inverse patch；commit 只引用经过校验的变更单元或不可变快照，不能依赖易失的 UI 状态。
3. commit 元数据（分支、HEAD、版本水位）必须与业务数据在同一提交屏障内可恢复。
4. commit 图保存父子关系和审计字段；任何 commit 一旦可见就必须可重放到其父节点之后的完整状态。

### 提交规则

- commit 的父节点固定为提交开始时读取到的当前分支 HEAD；提交结束时若 HEAD 已被其他 writer 推进，整个提交失败并要求重新读取状态。跨 realm 的推进判定复用 [US-304](./US-304-writer-lease-migration-fencing.md) 的 epoch，不新增第二套 lease 表。
- 历史节点永不通过「把旧节点改成当前」实现变更；需要可追踪的动作时必须再创建一个新 commit。

### 兼容与迁移

- 保留 `RxDBChange` 的现有 ID、transactionId、patch/inversePatch、branchId 和 undo/redo 字段；commit 层不改变旧 API 的过滤规则。
- 首次启用时建立基线 commit 并记录迁移版本；重复启动幂等。
- 旧 Workspace NEW 草稿直接进入工作树，保存后按普通变更处理；无法识别的旧缓存记录隔离并报告，不静默删除。

## 非功能要求

- **一致性**：commit、HEAD 与分支引用遵守全有或全无的可见性；重启恢复不得依赖写入顺序的偶然性。
- **可靠性**：写入失败、崩溃、标签页关闭和 schema 升级中断后，重试结果可预测且不重复生成 commit。
- **可诊断性**：错误带稳定类别、对象标识和建议动作；不能静默 fallback 到 memory、空历史或另一种未声明的存储。
- **安全性**：默认不记录敏感实体字段到 UI 日志或错误文本；作者标识由调用方提供，不能伪造为系统用户。

## 测试要求

- 核心包按 TDD 先写崩溃/刷新恢复的失败用例，再实现；覆盖率不低于 90%。
- 本地适配器集成测试覆盖事务原子性与 schema 迁移。
- 迁移幂等性与损坏记录隔离必须有独立 fixture。
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
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — 提交乐观校验复用其 epoch
- [US-306 工作树、缓存区与提交操作](./US-306-working-tree-index.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — NEW 草稿持久化现状与明确限制
- [版本控制文档](../../../website/docs/versioning.md)
