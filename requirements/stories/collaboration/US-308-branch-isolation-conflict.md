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
- [x] Independent: 依赖 US-305/306b 的 revision CAS 与 US-304 的迁移 fencing，但分支往返和冲突诊断自成一条交付线
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
再使用 Epic 与 US-305/306a/306b 持久化的 activation/head/index/working-tree revision CAS。epoch 只识别 schema 迁移后的 stale writer，
普通提交竞争只看领域 revision；不得用 `BroadcastChannel` 或内存状态承担正确性。US-304、US-305、US-306a、US-306b
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

`requireClean` 的 clean 固定为：`WorkingTreeEntry` 为空、index 为空、没有 active restore session，也没有
由 durable restore session 派生的未解决 conflict。普通 CAS 失败返回一次性 `CommitConflict`，不会永久污染 clean；
仅 staged、restoring 或可重建的 conflicted 都不是 clean。错误必须按实际状态给出
commit、clear index、discard 或刷新/重新选择建议，不能只检查业务表 diff。

## 范围边界

### In Scope

- 分支与工作树 / 缓存区的隔离：切换后恢复目标分支自己的状态；没有未提交状态时才物化目标 HEAD
- `requireClean` 显式选项与对应的可操作错误
- 数据库级 `activationRevision`、active branch token 与跨标签页 switch/CRUD 竞争拒绝
- 跨标签页 / 跨 realm revision CAS 的集成 fixture 与类型化诊断
- `CommitConflict` 派生值与三端一致的冲突提示语义
- 既有 `createBranch(branchId, fromChangeId?)`、`removeBranch()`、`syncBranches()` 与 commit/working-tree/index 生命周期集成
- metadata-only 远端分支首次切换前的 durable staging 预取，以及完整本地物化、baseline/ref 原子创建与失败回滚

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
4. **Given** 当前分支存在未提交工作树，**When** 调用既有一参 `createBranch(branchId)`，**Then** 新分支保持现有“从当前物化状态创建”的用户可见语义：共享当前 HEAD、复制一份独立的未提交工作树快照、index 为空；来源与新分支不得共享可变条目。
5. **Given** A/B 两个分支各自有 dirty 工作树和 staged 条目，**When** 执行 A → B → A → B，**Then** 每次都恢复目标分支原有工作树/index/revision，任何一端都不被 reset 到 HEAD。
6. **Given** 当前仅 index 非空、存在 active restore session，或该 session 的 revision 已分叉而状态为 conflicted，**When** 以 `{ requireClean: true }` 切换，**Then** 操作被拒绝且所有状态零变化；错误建议与具体非 clean 原因一致。历史上的一次普通 CAS 失败不构成该状态。
7. **Given** 调用既有 `createBranch(branchId, fromChangeId)`，**When** change 存在，**Then** 新分支切换后的业务状态与本故事实施前从该 changeId 创建的状态一致；commit 图用确定性的 `kind=branch_baseline` 完整快照锚定该状态，不修改来源分支历史。
8. **Given** 删除非激活且无子分支的分支，**When** `removeBranch()` 成功，**Then** 在同一事务删除 branch ref、工作树、index、restore session 与既有该分支 `RxDBChange`，但不删除可能被其他 ref 共享或按 ID 审计的不可变 commit；同名重建获得新 branch generation，既有 main/active/有子分支拒绝行为不变。
9. **Given** `syncBranches()` 拉到 `local=false, remote=true` 且没有本地 commit 图的 metadata-only 分支，**When** 用户首次切换，**Then** 系统为目标分支建立独立 materialization attempt，冻结远端终止水位与配置 sync scope；随后按页拉取并把 payload、水位、scope manifest 与 fingerprint 原子写入 durable staging，期间不修改当前业务表、当前分支 `RxDBSync`、active 标记或工作树。完整收敛后，单一 switch 事务复核 active token、目标分支身份、终止水位/scope/fingerprint，物化业务表、建立确定性的本地 `kind=branch_baseline`、创建 branch ref、激活目标、递增 activation revision 并删除 staging；不把它伪装成远端 commit，也不实现 remote commit push/pull。
10. **Given** metadata-only 远端分支缺少父分支、远端 adapter、change，预取无法收敛到冻结水位，或发生网络/配额/scope 漂移，**When** 用户尝试切换，**Then** 返回 `branch_not_materialized`，来源/目标业务投影、active 标记、activation revision、当前分支同步水位、commit 图和 branch ref 全部零变化；staging 必须可安全续传或按 attempt ID 清理，不得先激活空分支再等待后续 pull 修补。
11. **Given** 首次物化在任意分页后崩溃，**When** 同一目标分支再次切换，**Then** 系统从已提交 staging 水位继续，不重复应用当前投影、不跳过远端 change；远端分支身份或 scope manifest 已变化时废弃旧 attempt 并从新冻结水位重建。

### User Story 2 - 跨标签页并发（Priority: P2）

**独立测试**：两个同源标签页打开同一数据库，一个提交，另一个尝试提交。

**验收场景**：

1. **Given** 两个同源标签页从相同 revision 开始操作同一分支，**When** 一个标签页先推进 HEAD 或 index，另一个随后提交，**Then** 后者的 CAS 失败并返回 expected/actual revision，禁止静默丢弃另一方修改。
2. **Given** commit 已成功写入但 UI 在刷新前关闭，**When** 重新打开任一标签页，**Then** commit、HEAD 和工作树状态最终收敛到同一结果。
3. **Given** stage 后另一个标签页删除或更新同一实体但未移动 HEAD/index，**When** 本标签页提交原 staged snapshot，**Then** 提交只推进 staged 版本，后续删除/更新继续作为 unstaged 保留，不因 writer 身份产生特殊分支。
4. **Given** writer 挂起期间发生 schema 迁移并抬升 epoch，**When** stale writer 恢复后提交，**Then** 先走 US-304 的 `writer_fenced` 路径；未发生迁移的普通竞争则只走 revision CAS。
5. **Given** Tab A 在分支 A 读取实体并捕获 active branch token，Tab B 随后切到 B，**When** Tab A 保存旧实体，**Then** 写事务以 `stale_active_branch` 拒绝，A/B 的业务表投影、WorkingTreeEntry 与 revision 均不被错误修改。
6. **Given** 两个 realm 从同一 `activationRevision` 同时切换到不同分支，**When** 两个事务竞争，**Then** 只有一个 activation CAS 成功；失败方刷新后读取胜出分支，不重放自己的物化动作。

## 功能需求

- **FR-017**（已改口径）：系统 MUST 与现有分支操作集成。`createBranch(branchId)` 保留从当前物化状态创建的行为，复制独立 working-tree snapshot、共享当前 HEAD 且 index 为空；`createBranch(branchId, fromChangeId)` 保留历史 change 状态并以 `kind=branch_baseline` 锚定。分支不得共享可变 HEAD / 工作树 / index。切换恢复目标分支状态；clean 检查以 `WorkingTreeSwitchBranchOptions.requireClean` 显式提供，不带选项仍无条件切换。
- **FR-020**：系统 MUST 使用持久化 activation/head/index/working-tree revision CAS 阻止跨标签页静默覆盖，并使用 US-304 epoch 拒绝迁移后的 stale writer。普通 CRUD MUST 校验实体/realm 捕获的 active branch token；不得在事务中重新读取新 active branch 后把旧实体归到新分支，也不得只依赖 `BroadcastChannel` 或内存状态。
- **FR-035**：`CommitConflict` MUST 从失败操作、对象 ID、expected/actual activation/head/index/working-tree revision 与建议动作派生，不得建立第二张可与真实 revision 漂移的冲突状态表。普通命令 CAS 失败只返回诊断值，不建立 durable conflict；`status().conflicted` 与 `requireClean` 只读取仍存在的 `WorkingTreeRestoreSession` 等 durable domain session。
- **FR-044**：`removeBranch()` MUST 原子删除该分支全部可变状态和 materialization attempt，但保留不可变 commit；同名重建 MUST 使用新 branch generation。`syncBranches()` 只同步 metadata 时不得提前伪造 baseline/ref；承接 US-305 FR-049，没有 `CommitBranchRef` 的 metadata-only 远端分支不是空 HEAD。其首次 switch MUST 使用独立 durable staging 冻结目标分支、终止水位和完整配置 sync scope，逐页持久化 payload/fingerprint 且不触碰当前投影；最终把“复核 active token、目标身份、水位/scope/fingerprint、完整物化、创建 `kind=branch_baseline`、创建 ref、切换 active、递增 activation revision、删除 staging”放进同一提交屏障。物化依据不足则以 `branch_not_materialized` 全量回滚，来源分支保持 active；分页崩溃可恢复，staging 可按 attempt 清理。旧签名、旧拒绝条件与 remote commit 非目标保持不变。

## 关键实体

- **WorkingTreeActivationState**：数据库级单行 revision；当前分支 ID 仍由 `RxDBBranch.activated` 表示，该状态不复制第二份 ID。
- **CommitConflict**：并发或版本校验失败的一次性不可变诊断值；由失败命令捕获的 expected token 与事务内读取的 actual revision 派生，包含操作、对象、受影响变更单元和建议动作。它不是协调锁、持久状态或独立真相源。
- **CommitBranchMaterializationAttempt**：metadata-only 分支首次物化的内部 durable staging；attempt ID、目标分支身份、冻结终止水位、scope manifest、已提交分页水位、payload fingerprint 与生命周期。它不属于当前工作树或 commit 图，成功 switch 后原子删除。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 测试要求

- 必须有跨标签页 / 跨 realm 并发测试，覆盖 activation/HEAD/index/working-tree CAS、重复 commit、stale writer fencing，以及 stage 后编辑统一保留为 unstaged。
- 必须有“Tab A 读 A → Tab B 切 B → Tab A 保存旧实体”的真实双 realm fixture，断言稳定 `stale_active_branch` 且两分支零污染。
- 必须有 A dirty+staged → B dirty+staged → A → B 往返测试，断言每个分支的数据、index 和 revision 均恢复。
- 必须有一条回归用例专门断言**不带选项**的 `switchBranch(branchId)` 行为未变（AC User Story 1 场景 3）。
- 必须有 `public-type-compatibility` 用例断言旧的一参调用继续编译、新的可选参数使用 `WorkingTreeSwitchBranchOptions`，适配器层 `SwitchBranchOptions` 签名不变。
- 必须有 `createBranch(branchId, fromChangeId?)`、`removeBranch()`、`syncBranches()` 的公开签名与既有行为回归；覆盖 dirty current state、历史 change、删分支状态清理、metadata-only 远端分支本地已有资料/durable staging 两条首次 baseline 路径，以及分页崩溃续传、网络失败、水位/scope 漂移、配额不足、预取不收敛时当前投影零变化。
- 三端冲突提示的语义、错误分类与恢复建议必须一致，并有等价测试。
- 测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/VersionManager.ts` — `switchBranch` 新增可选参数，默认行为不变
- `packages/rxdb/src/version/` — 分支隔离、revision 冲突派生与错误分类
- `packages/rxdb/src/system/` — `WorkingTreeActivationState` 与 capability/branch lifecycle 事务
- `packages/rxdb-{angular,react,vue}/` — 对称的冲突状态与提示
- `requirements/api-baseline/rxdb.json` — `WorkingTreeSwitchBranchOptions` 与 `CommitConflict`
- `packages/rxdb/src/__tests__/contracts/` — `switchBranch` 公开方法签名兼容测试

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — 只复用 writer 身份与迁移期 epoch fencing
- [US-306 父契约](./US-306-working-tree-index.md)
- [US-306a 工作树写入捕获与持久化](./US-306a-working-tree-capture.md)
- [US-306b 缓存区与提交状态机](./US-306b-index-commit-state-machine.md)
- [US-301 版本控制](./US-301-version-control.md) — 现有分支能力
- [分支文档](../../../website/docs/collaboration/branch.md) — 受 FR-017 口径影响的现有示例
