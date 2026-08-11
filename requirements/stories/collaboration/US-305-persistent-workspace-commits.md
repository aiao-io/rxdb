---
id: US-305
title: 持久化 Git 式工作区提交
status: Backlog
priority: High
epic: epic-002-data-sync
created: 2026-08-09
updated: 2026-08-11
tags: [collaboration, workspace, staging, commit, persistence, restore]
---

<!--
INVEST 检查清单:
- [x] Independent: 可先交付本地持久化、status 和 commit，再扩展恢复与多标签页冲突
- [x] Negotiable: commit 存储布局、事件名称和具体 UI 可在 plan 阶段调整
- [x] Valuable: 刷新或重启后不丢失工作区和历史恢复结果
- [x] Estimable: 变更边界、迁移、跨框架和性能门槛均已列出
- [x] Small: 不包含远程协作、rebase、stash 和字段级暂存
- [x] Testable: 每条主流程和故障路径均有验收场景或功能需求
-->

# 用户故事：持久化 Git 式工作区提交

## 背景与问题

当前历史记录可以支持 undo、redo 和从历史恢复实体，但“恢复后的状态”以及部分工作区状态依赖当前页面会话。刷新或重新打开页面后，用户看不到刚才的恢复结果，无法判断哪些修改已经保存，也没有一个可以长期引用的提交节点。

现有 Workspace 插件只覆盖尚未入库的 NEW 草稿；已存在实体的 UPDATE、DELETE、回滚和提交分组不在其范围内。早期的 `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 导出已经在 `0.0.24` 删除（提交 `4d2495bdd`），因此本故事是全新设计，没有需要兼容或复用的旧暂存契约。

本故事把 RxDB 的本地变更组织成 Git 式工作流，但不把 Git 的远程仓库、权限和代码评审一并引入。核心目标是：用户刷新页面后，工作区、缓存区、当前提交和历史恢复结果仍然存在且语义一致。

## 作为/我想要/以便

**作为** 使用 RxDB 管理本地数据的开发者
**我想要** 通过工作区、缓存区和不可变 commit 管理数据变更
**以便** 我能在刷新、重启或意外关闭后继续工作，清楚知道哪些改动已提交，并安全地恢复到任意历史节点

## 术语与状态模型

| Git 概念                       | RxDB 需求中的含义                                                              | 持久化要求                          |
| ------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------- |
| 工作区（working tree）         | 当前分支上用户实际看到和编辑的实体状态，包含已保存到本地数据库但尚未提交的修改 | 必须持久化；刷新后恢复原状          |
| 缓存区（index / staging area） | 用户明确选择、准备放入下一次 commit 的变更集合                                 | 必须持久化；与工作区分离            |
| `HEAD`                         | 当前分支最近一次成功 commit 的指针                                             | 必须持久化且只能指向已存在的 commit |
| 分支引用（branch ref）         | 分支名到 `HEAD` commit 的映射；沿用现有分支能力                                | 必须与 commit 更新原子一致          |
| commit                         | 带父节点、消息、作者和变更集合的不可变版本节点                                 | 创建后不可改；刷新后可查询          |
| 历史恢复会话                   | 将某个历史 commit 的数据投影到当前工作区、但尚未形成新 commit 的状态           | 必须持久化，并在 UI 中标识为未提交  |
| 工作区状态                     | `clean`、`modified`、`staged`、`conflicted`、`restoring` 等用户可见状态        | 状态重建结果必须稳定，不依赖内存栈  |

v1 的变更选择粒度为“实体操作或完整事务”。同一事务不能被拆到不同 commit；字段级、代码行级暂存属于后续扩展。

### 状态关系

```text
                     stage / unstage
工作区（当前数据） ─────────────────────► 缓存区（下一次 commit）
       │                                      │
       │ discard / reset to HEAD              │ commit（原子）
       ▼                                      ▼
     HEAD 状态 ◄──── restore(commit) ──── 新 commit ───► 分支 HEAD
```

`restore(commit)` 默认只改变工作区，不改写已有 commit、不移动分支引用；用户需要显式 commit 才能把恢复结果纳入当前分支历史。这样恢复操作不会因为刷新页面而消失，也不会静默重写历史。

## 范围边界

### In Scope

- 为当前分支建立可持久化的初始 `HEAD` 和 commit 图
- 记录 NEW、UPDATE、DELETE 及完整事务的工作区变更
- 查看 status、diff，按实体或事务 stage / unstage
- 使用 commit message 创建不可变 commit，并保留未暂存修改
- 查看 commit log、commit 详情和父子关系
- 从历史 commit 恢复到当前工作区，刷新后恢复会话仍然存在
- 工作区丢弃（回到当前 HEAD）和缓存区清空
- 与已有分支切换、分支创建、undo/redo、`RxDBChange` 历史的兼容边界
- Angular、React、Vue 三端的等价 API、状态和演示
- 崩溃、刷新、跨标签页和持久化失败时的一致性与可诊断错误

### Out of Scope

- 远程 commit push/pull、认证、签名和多人协作权限
- rebase、cherry-pick、interactive rebase 和任意历史改写
- 字段级或代码行级的部分暂存
- 自动 stash、stash pop 及跨分支携带脏工作区
- 自动合并冲突的最终解决 UI（本故事只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略

## 用户场景与验收标准

### User Story 1 - 刷新后继续未提交工作（Priority: P1）

**作为** 正在编辑本地数据的用户
**我想要** 工作区和缓存区在刷新后保持
**以便** 不丢失修改，也不必重新判断上次做到哪一步

**独立测试**：创建、修改、删除若干实体，分别 stage 一部分，刷新或关闭并重新打开应用；只依赖本地存储即可验证状态恢复。

**验收场景**：

1. **Given** 当前分支有一个已提交的 HEAD，**When** 用户修改实体但不 commit 后刷新，**Then** 修改后的工作区数据、未暂存标记和对应 diff 与刷新前一致。
2. **Given** 缓存区已有实体变更，**When** 用户刷新或重新打开应用，**Then** 缓存区选择、变更顺序和事务边界保持不变。
3. **Given** 用户在历史页执行 `restore(commitId)` 尚未 commit，**When** 页面刷新，**Then** 恢复后的工作区继续显示，且明确标记为“恢复后未提交”。
4. **Given** 应用在持久化写入中途崩溃，**When** 下次打开应用，**Then** 只能看到上一次完整一致的状态，不出现半个 commit 或半个事务。

### User Story 2 - 暂存并提交一组变更（Priority: P1）

**作为** 需要控制发布边界的开发者
**我想要** 先选择变更进入缓存区，再用消息创建 commit
**以便** 一次编辑可以拆成多个有意义的版本

**独立测试**：对两个实体做不同修改，只 stage 其中一个并提交，检查 HEAD、日志和另一个实体的工作区状态。

**验收场景**：

1. **Given** 工作区包含两个实体的修改，**When** 用户只 stage 其中一个并 commit，**Then** 新 commit 只包含被 stage 的变更，另一个修改仍在工作区且未进入该 commit。
2. **Given** 缓存区为空，**When** 用户提交，**Then** 操作被拒绝，不创建空 commit，工作区和 HEAD 均不改变。
3. **Given** stage 后实体再次修改，**When** 用户查看 status/diff，**Then** 系统分别展示“已暂存版本”和“未暂存版本”，不会把新修改静默并入旧 stage。
4. **Given** stage 集合包含一个多实体事务，**When** 用户 commit，**Then** 该事务作为一个不可拆分的变更单元写入 commit。
5. **Given** commit message 为空或只含空白，**When** 用户提交，**Then** 操作被拒绝并保留缓存区原状。
6. **Given** commit 正在写入时出现存储错误，**When** 操作返回失败，**Then** HEAD、分支引用、缓存区和工作区保持提交前的一致状态，错误包含可重试信息。

### User Story 3 - 查看并持久化历史恢复（Priority: P1）

**作为** 想纠正错误的用户
**我想要** 浏览 commit 历史并把某个版本恢复到工作区
**以便** 先检查结果，再决定是否以新 commit 保存

**独立测试**：创建至少三个 commit，选择中间版本恢复，刷新后确认恢复结果，再 commit 验证历史没有被覆盖。

**验收场景**：

1. **Given** commit 图中存在目标 commit，**When** 用户打开 log 并查看详情，**Then** 能看到消息、作者、时间、父 commit、涉及实体数量和变更摘要。
2. **Given** 工作区和缓存区均 clean，**When** 用户恢复任意可达 commit，**Then** 目标数据物化到当前工作区，当前分支 HEAD 不移动，恢复状态可被 status 识别。
3. **Given** 工作区存在未提交修改，**When** 用户恢复历史 commit，**Then** 系统拒绝操作并说明需先 commit、stage 后处理或 discard，不覆盖未提交数据。
4. **Given** 历史恢复会话已建立，**When** 用户用新消息 commit，**Then** 生成以原 HEAD 为父节点的新 commit，旧 commit 和原有后继节点仍可访问。
5. **Given** 用户选择 discard workspace，**When** 操作完成，**Then** 工作区回到当前 HEAD，恢复会话和未提交 stage 一并清除，历史 commit 不变。

### User Story 4 - 分支和多标签页中的可预测状态（Priority: P2）

**作为** 在多个实验分支或标签页中工作的开发者
**我想要** 每个分支拥有自己的 HEAD、工作区和缓存区，并能发现并发冲突
**以便** 切换和协作时不会静默覆盖本地修改

**独立测试**：在分支 A 留下未提交修改，创建/切换分支 B，在另一标签页提交，再回到 A 检查隔离和冲突提示。

**验收场景**：

1. **Given** 分支 A 和 B 指向不同 commit，**When** 用户切换分支，**Then** 工作区物化为目标分支 HEAD，缓存区不会串到另一分支。
2. **Given** 当前工作区 dirty，**When** 用户切换分支，**Then** 默认拒绝切换并保留数据；只有显式 discard（或未来支持 stash）后才能切换。
3. **Given** 两个同源标签页同时修改同一工作区，**When** 后到的标签页尝试提交，**Then** 系统检测 HEAD 或 stage 版本已变化，要求刷新、合并或重新 stage，禁止静默丢弃另一方修改。
4. **Given** commit 已成功写入但 UI 在刷新前关闭，**When** 重新打开任一标签页，**Then** commit、HEAD 和工作区状态最终收敛到同一结果。

## 边界情况

- 首次启用功能但数据库已有数据：生成一个只作为基线的初始 commit，不伪造旧 commit 的作者和消息；既有 `RxDBChange` 仍可供历史/undo 使用。
- 只有 NEW 草稿、没有 HEAD：草稿仍按 Workspace 插件规则恢复，并在首次提交时作为普通 INSERT 变更进入 commit。
- 删除实体后 stage：diff 必须显示删除，restore 到删除前 commit 后实体可重新出现。
- stage 的实体已被其他标签页删除或更新：提交前重新校验版本指纹，返回冲突而不是使用过期快照。
- 恢复目标 commit 不存在、不可达或属于其他数据库：拒绝操作，不改变工作区。
- commit 图或索引记录损坏：启动时隔离损坏记录，保留可验证的 commit 和工作区，并提供错误详情；不得静默回退到空库。
- 存储配额不足、浏览器禁用持久化或 schema 升级失败：明确报告持久化不可用，禁止把状态伪装成已保存。
- 空事务、重复 stage、重复 discard 必须幂等，不产生额外 commit 或错误历史。
- 同一事务跨多个实体且包含外键依赖时，恢复、discard 和 commit 必须保持事务原子性。
- undo/redo 与工作区 commit 同时触发时，按调用顺序串行化；redo 仍是会话级能力，不能被误报为 durable commit。

## 功能需求

### Functional Requirements

- **FR-001**：系统 MUST 为每个数据库和当前分支维护唯一有效的 `HEAD` 指针；`HEAD` 不得指向不存在或未完成写入的 commit。
- **FR-002**：系统 MUST 将工作区状态、缓存区选择、当前分支、HEAD 和 commit 元数据持久化；刷新、重启和正常关闭后可恢复。
- **FR-003**：系统 MUST 把 NEW、UPDATE、DELETE 和完整事务表示为可比较的工作区变更，并为每条变更保留实体身份、操作类型、基线版本和当前版本指纹。
- **FR-004**：系统 MUST 提供工作区 status，至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中和冲突状态。
- **FR-005**：系统 MUST 提供面向实体或完整事务的 diff，能够分别比较 `HEAD ↔ 工作区` 和 `HEAD ↔ 缓存区`。
- **FR-006**：系统 MUST 支持 stage、unstage、stage all 和 clear index；这些操作不得修改已有 commit，也不得丢弃未选择的工作区变更。
- **FR-007**：系统 MUST 在 stage 后再次发生编辑时保留 staged 快照，并把新增部分标记为 unstaged；禁止隐式扩大 stage 范围。
- **FR-008**：系统 MUST 要求 commit 包含非空、可读的消息，并在一次原子操作中写入变更集合、父 commit、作者、时间、摘要和新的分支 HEAD。
- **FR-009**：系统 MUST 保证 commit 不为空；无 staged 变更时提交失败且不产生空节点。
- **FR-010**：系统 MUST 保证 commit 创建失败时恢复提交前状态；不能出现 commit 已存在但 HEAD 未更新、HEAD 已更新但 index 未清空等可见半状态。
- **FR-011**：系统 MUST 在 commit 成功后只清除已提交的缓存区变更；未暂存变更继续留在工作区并显示准确 diff。
- **FR-012**：系统 MUST 提供按当前分支、实体和时间排序的历史列表，以及单个 commit 的变更详情和父节点关系。
- **FR-013**：系统 MUST 支持将可达历史 commit 恢复到当前工作区；恢复默认不移动 HEAD、不删除历史，并将恢复会话持久化。
- **FR-014**：系统 MUST 在恢复前检测 dirty workspace/index；未显式处理未提交变更时，恢复操作必须拒绝并保持原状。
- **FR-015**：系统 MUST 支持将恢复结果作为普通工作区变更重新 stage/commit；生成的新 commit 不得改写被恢复的历史节点。
- **FR-016**：系统 MUST 支持 discard workspace 和 clear index，且两者操作范围明确：前者回到当前 HEAD，后者只清除暂存选择。
- **FR-017**：系统 MUST 与现有分支操作集成：创建分支从当前 HEAD 开始，切换分支前默认要求工作区 clean，分支之间不得共享可变的 HEAD/index 状态。
- **FR-018**：系统 MUST 与现有 `RxDBChange`、历史 undo/redo 和 `restoreEntity` 保持兼容；已有 API 的行为不能因为 commit 功能而改变。
- **FR-019**：系统 MUST 明确区分 durable commit 历史与会话级 redo 栈；刷新后 redo 可清空，但 commit、工作区和缓存区不得清空。
- **FR-020**：系统 MUST 在跨标签页或并发写入时校验 HEAD、index 版本和工作区版本；检测到冲突时阻止静默覆盖并提供可操作错误。该校验 MUST 建立在 [US-304](./US-304-writer-lease-migration-fencing.md) 的 writer lease / epoch fencing 之上（复用 `rxdb_writer_lease` 的 writer 身份与 epoch），MUST NOT 另起一套跨 realm 协调协议，也不得只依赖 `BroadcastChannel` 或内存状态。
- **FR-021**：系统 MUST 为已有数据库提供一次性初始化和迁移策略：生成基线 commit、导入仍存在的 NEW 草稿、保留旧 change 记录，并支持失败重试。
- **FR-022**：系统 MUST 对损坏或不兼容的 commit/index 记录进行隔离和诊断，不得将整个数据库静默降级为空工作区或内存模式。
- **FR-023**：系统 MUST 为所有异步操作提供可观察的 loading、success、empty 和 error 状态；错误必须说明操作、对象和恢复建议。
- **FR-024**：Angular、React、Vue MUST 提供语义对称的工作区 status、diff、stage、unstage、commit、log、restore 和 discard 能力；命名、参数、状态转换和错误语义一致。
- **FR-025**：三端 UI MUST 支持键盘操作、焦点可见、屏幕阅读器可读的状态和错误提示，达到 WCAG 2.1 AA；不能只提供图标而没有可访问名称。
- **FR-026**：在默认本地环境下，工作区 status/diff 和 stage/unstage 的用户可见响应 MUST 在 100 ms 内完成；打开已有历史并恢复最近 commit MUST 在 1 s 内呈现可交互状态。验证必须覆盖代表性数据集（至少 10,000 条实体记录、100 个 commit）。
- **FR-027**：commit 历史 MUST 可审计，至少记录稳定 commit ID、父节点、分支、作者标识、消息、创建时间、变更数量和 schema/数据版本；不得记录无法恢复的数据引用。
- **FR-028**：v1 MUST NOT 复活已在 `0.0.24` 删除的 `stagedChange()`、`unstageChange()`、`commit()`、`stagedCount` 与 `WorkspaceCacheEntry.staged`，也不得让新导出与它们同名同签名；新契约必须使用独立命名空间，并在文档中写明这些名字不会回归。

## 关键实体

- **WorkspaceState**：当前数据库/分支的工作区状态；包括基于哪个 HEAD、是否恢复中、未提交变更计数和最后一次持久化版本。
- **IndexEntry**：缓存区条目；包括变更单元 ID、基线 commit、暂存快照、工作区版本和 stage 时间。
- **Commit**：不可变提交；包括稳定 ID、一个或多个父节点、分支、作者、消息、时间、变更集合、摘要和数据/schema 版本。
- **BranchRef**：分支引用；包括分支 ID、名称、HEAD commit、创建来源和更新时间。
- **ChangeSet**：commit 或工作区的变更单元集合；按实体/事务分组，保留 patch、inverse patch 或等价可恢复信息。
- **RestoreSession**：历史恢复会话；包括目标 commit、恢复前 HEAD、生成的工作区版本、创建时间和是否已提交。
- **WorkspaceConflict**：并发或版本校验失败记录；包括本地版本、发现的远端/其他标签页版本、受影响的变更单元和处理状态。

## 设计展开

### 持久化层次

1. 业务实体表保存当前工作区物化数据，仍沿用现有 CRUD、事务和响应式查询。
2. 变更日志保存原子变更的 patch/inverse patch；commit 只引用经过校验的变更单元或不可变快照，不能依赖易失的 UI 状态。
3. 工作区元数据保存当前分支、HEAD、index、恢复会话和版本水位；这些元数据必须与业务数据在同一提交屏障内可恢复。
4. commit 图保存父子关系和审计字段；任何 commit 一旦可见就必须可重放到其父节点之后的完整状态。

### 推荐操作契约

具体导出名在 plan 阶段冻结，但语义应保持以下边界：

| 操作                               | 语义                                | 是否创建 commit |
| ---------------------------------- | ----------------------------------- | :-------------: |
| `status()`                         | 返回工作区、缓存区、HEAD 和冲突摘要 |       否        |
| `diff(scope?)`                     | 比较 HEAD、index、工作区的变更      |       否        |
| `stage(selection)`                 | 将实体或事务的当前版本复制进 index  |       否        |
| `unstage(selection)`               | 从 index 移除选择，工作区不变       |       否        |
| `commit(message, metadata?)`       | 原子写入 commit 并移动当前分支 HEAD |       是        |
| `log(options?)` / `show(commitId)` | 查询历史节点和详情                  |       否        |
| `restore(commitId)`                | 将历史状态物化到工作区，保留 HEAD   |       否        |
| `discardWorkspace()`               | 丢弃工作区未提交变更并回到 HEAD     |       否        |
| `clearIndex()`                     | 清空暂存选择                        |       否        |

### 提交与恢复规则

- commit 的父节点固定为提交开始时读取到的当前分支 HEAD；提交结束时若 HEAD 已被其他 writer 推进，整个提交失败并要求重新读取状态。
- commit 成功后 index 只移除本次成功写入的条目；清理失败必须可重试且不能误删新的 stage。
- restore 以目标 commit 为数据源、以当前 HEAD 为工作区基线，产生普通的 INSERT/UPDATE/DELETE 工作区变更；目标 commit 本身不被标记为“当前”。
- restore、discard、branch switch 均须在事务边界内物化跨实体关系；失败时回滚全部实体和元数据。
- 历史节点永不通过“把旧节点改成当前”实现恢复；需要可追踪的恢复动作时，用户必须再创建一个新 commit。

### 兼容与迁移

- 保留 `RxDBChange` 的现有 ID、transactionId、patch/inversePatch、branchId 和 undo/redo 字段；commit 层不能改变旧 API 的过滤规则。
- 首次启用时建立基线 commit，并记录迁移版本；重复启动必须幂等，不重复建立基线。
- 旧 Workspace NEW 草稿直接进入工作区，保存后按普通变更处理；无法识别的旧缓存记录隔离并报告，不静默删除。
- 旧的遗留 staging 导出已在 `0.0.24` 删除，不存在需要保留的别名或兼容层；新 API 直接以新名字发布。
- 跨 realm 的写入协调沿用 US-304 的 writer lease/upgrade guard：commit 的乐观校验与 fencing 复用同一 epoch，不新增第二套 lease 表。

## 非功能要求

- **一致性**：commit、HEAD、index 和工作区元数据遵守全有或全无的可见性；重启恢复不得依赖写入顺序的偶然性。
- **可靠性**：写入失败、浏览器崩溃、标签页关闭和 schema 升级中断后，重试结果可预测且不重复生成 commit。
- **可诊断性**：错误带稳定类别、对象标识和建议动作；不能静默 fallback 到 memory、空历史或另一种未声明的存储。
- **安全性**：默认不记录敏感实体字段到 UI 日志或错误文本；作者标识由调用方提供，不能伪造为系统用户。
- **可观测性**：状态流在 commit、restore、stage、冲突和恢复完成时发出事件，三端可订阅同一语义事件。

## 测试要求

- 核心包必须按 TDD 先写刷新/崩溃恢复失败用例，再实现，覆盖率目标不低于 90%。
- 必须有本地适配器集成测试覆盖事务原子性、schema 迁移、10,000 条记录/100 个 commit 的性能预算。
- 必须有跨标签页并发测试覆盖 HEAD 乐观校验、重复 commit、防止旧 stage 覆盖新编辑。
- Angular、React、Vue 必须各有等价的单元/组件测试，并用跨框架 E2E 验证 status → stage → commit → restore → refresh 流程。
- 失败、空状态、键盘可达性和屏幕阅读器名称必须有 UI 回归测试；测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — commit 图、HEAD、工作区状态和恢复语义
- `packages/rxdb/src/system/` — commit/index/workspace 元数据与迁移
- `packages/rxdb-plugin-workspace/` — NEW 草稿与完整工作区状态的整合
- `packages/rxdb-{angular,react,vue}/` — 对称的 hooks/composables/signals 与 UI 状态
- `apps/dev-rxdb-{angular,react,vue}/` — 三端工作区、历史和恢复演示
- `packages/rxdb/src/__tests__/version/`、`packages/rxdb-plugin-workspace/src/__tests__/` — 核心回归套件

## 依赖与参考

- [US-301 版本控制](./US-301-version-control.md) — 现有分支、合并和远程同步边界
- [US-302 撤销/重做](./US-302-undo-redo.md) — 现有 durable undo 与会话级 redo 语义
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — FR-020 依赖的 writer 身份与 epoch fencing
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — NEW 草稿持久化现状与明确限制
- [Workspace 插件文档](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
- [版本控制文档](../../../website/docs/versioning.md)
