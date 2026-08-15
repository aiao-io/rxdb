---
id: US-306
title: 工作树、缓存区与提交操作
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-15
tags: [collaboration, working-tree, staging, diff, angular, react, vue, parent-story]
---

<!--
INVEST 检查清单:
- [ ] Independent: 不直接交付；共享契约由 US-306a / US-306b / US-306c 分段实现
- [x] Negotiable: 核心 DTO 字段和事件名可在 plan 阶段冻结；三框架入口 `useWorkingTree()` 已由 US-306c 固定
- [x] Valuable: 用户第一次能选择性提交，并在刷新后接着上次干
- [x] Estimable: 状态集合、操作契约与 bench fixture 已列出
- [ ] Small: **不成立，已于 2026-08-15 拆分**。原故事同时覆盖全部业务写入口、六类本地后端、
      working-tree/index 状态机、三框架、E2E 与 benchmark，不能在一个迭代内独立验收
- [x] Testable: 「改 → stage → 刷新 → commit → 查 status」可独立验收
-->

# 用户故事：工作树、缓存区与提交操作

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> commit 图与 HEAD 的存储契约见 [US-305](./US-305-commit-graph-head.md)。
> 本文件自 2026-08-15 起是父故事/共享契约，不直接交付；实现与状态关闭由 US-306a / US-306b / US-306c 承担。

## 作为/我想要/以便

**作为** 需要控制发布边界的开发者
**我想要** 先在工作树里改，再选择一部分变更进入缓存区，然后用消息提交
**以便** 一次编辑可以拆成多个有意义的版本，且刷新后不必重新判断上次做到哪一步

## 术语与状态模型

| 概念                    | 含义                                                                | 持久化要求                     |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------ |
| 工作树（`WorkingTree`） | 当前分支 HEAD 叠加未提交 `WorkingTreeEntry` 后的逻辑状态            | 按分支持久化；刷新/切回后恢复  |
| 缓存区（`Index`）       | 用户明确选择、准备放入下一次 commit 的变更集合                      | 按分支持久化；与工作树分离     |
| 工作树状态              | `clean`、`modified`、`staged`、`conflicted`、`restoring` 等可见状态 | `conflicted` 只由 durable restore session 派生；状态不依赖内存栈 |

变更选择粒度为「实体操作或完整事务」，同一事务不可拆到不同 commit。
工作树、index 和 HEAD 的唯一真相源及 revision 关系见 Epic 的
[v1 状态模型](../../epics/epic-006-working-tree-commits.md#v1-状态模型唯一真相源)。

业务实体表只是当前激活分支的物化投影。每次普通 CRUD 必须在同一事务内写入或合并该分支的
`WorkingTreeEntry` 并递增 `workingTreeRevision`；离开分支后，目标状态只能由 HEAD 与这些条目重建。
实现可以复用 `RxDBChange`，但不能只存计数、内存 dirty set 或最后一次切换时的业务表内容。

### 状态关系

```text
                    stage / unstage
工作树（当前数据） ─────────────────────► 缓存区（下一次 commit）
       │                                      │
       │ discard / reset to HEAD              │ commit（原子）
       ▼                                      ▼
     HEAD 状态                            新 commit ───► 分支 HEAD
```

## 子故事与交付边界

| 子故事 | 独立闭环 | 主要承接 |
| ------ | -------- | -------- |
| [US-306a](./US-306a-working-tree-capture.md) | CRUD / sync 写入 → 刷新 → 工作树重建 | 写入口矩阵、active token、working-tree revision、加密与后端 conformance |
| [US-306b](./US-306b-index-commit-state-machine.md) | stage → 刷新 → commit → status/diff | index 独立重放、关系依赖闭包、commit residual rebase、discard 与冲突状态口径 |
| [US-306c](./US-306c-cross-framework-working-tree.md) | 三端操作 → 刷新 → 同语义读回 | Angular/React/Vue 公开 API、异步状态、a11y、E2E 与 benchmark |

固定顺序为 **US-305 → US-306a → US-306b → (US-306c ∥ US-307 ∥ US-308)**。父故事的 AC/FR
是共享追踪表；子故事必须把自己承接的条目写成独立可运行的验收场景，不能只引用编号后宣布完成。

## 范围边界

### In Scope

- 工作树与缓存区状态的持久化与刷新后重建
- 普通 CRUD、`WorkingTreeEntry` 与 `workingTreeRevision` 的原子双写；active branch token 校验遵守 Epic 矩阵
- `pull` / autoSync / repository sync / bulk sync、merge、undo/redo 等全部业务表写入口遵守 Epic 写入口矩阵
- `workingTreeRevision` / `indexRevision` 的事务内 CAS；跨 realm 的数据安全原语在本故事完成，不推迟到 US-308
- `status()`：至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中、冲突
- `diff(scope?)`：分别比较 `HEAD ↔ 工作树` 与 `HEAD ↔ 缓存区`
- `stage` / `unstage` / stage all / `clearIndex`
- `commit(message, options)`：`authorId`、`operationId` 必填，只提交缓存区内容，保留未暂存修改
- `discardWorkingTree()`：回到当前 HEAD
- stage 后再次编辑时保留 staged 快照，新增部分标记为 unstaged
- stage / unstage 对跨实体、跨事务依赖执行可独立从 HEAD 重放的递归闭包，并返回实际选择列表
- Angular / React / Vue 三端对称 API 与演示
- `pnpm nx run benchmarks:bench-working-tree` 中 status / diff / stage 的性能基线

### Out of Scope

- commit 图、HEAD、分支引用的存储布局与迁移 —— 属 [US-305](./US-305-commit-graph-head.md)
- 历史恢复会话 —— 属 [US-307](./US-307-restore-session.md)（本故事只需让 `status()` 能表达 `restoring`）
- 分支切换入口、冲突记录和三端冲突提示 —— 属 [US-308](./US-308-branch-isolation-conflict.md)；底层 revision CAS 不在其范围
- 字段级或代码行级的部分暂存
- 自动 stash / stash pop

## 用户场景与验收标准

### User Story 1 - 刷新后继续未提交工作（Priority: P1）

**独立测试**：创建、修改、删除若干实体，stage 一部分，刷新或关闭并重新打开；只依赖本地存储即可验证。

**验收场景**：

1. **Given** 当前分支有一个已提交的 HEAD，**When** 用户修改实体但不 commit 后刷新，**Then** 工作树数据、未暂存标记和对应 diff 与刷新前一致。
2. **Given** 缓存区已有实体变更，**When** 用户刷新或重新打开应用，**Then** 缓存区选择、变更顺序和事务边界保持不变。
3. **Given** Workspace 插件中只有 NEW 草稿，**When** 应用启动，**Then** 草稿仍按 Workspace 插件规则恢复，不出现在 SQL/PGlite 工作树或 baseline 中；草稿 `save()` 后才作为普通 INSERT 进入工作树。
4. **Given** A 分支存在未暂存 INSERT/UPDATE/DELETE，**When** 用户切到 B、关闭应用、重新打开并切回 A，**Then** A 的业务数据可仅凭 HEAD 与持久化 `WorkingTreeEntry` 完整重建，变更单元身份和 diff 不变。

### User Story 2 - 暂存并提交一组变更（Priority: P1）

**独立测试**：对两个实体做不同修改，只 stage 其中一个并提交，检查 HEAD、日志和另一个实体的工作树状态。

**验收场景**：

1. **Given** 工作树包含两个实体的修改，**When** 用户只 stage 其中一个并 commit，**Then** 新 commit 只包含被 stage 的变更，另一个修改仍在工作树且未进入该 commit。
2. **Given** 缓存区为空，**When** 用户提交，**Then** 操作被拒绝，不创建空 commit，工作树和 HEAD 均不改变。
3. **Given** stage 后实体再次修改，**When** 用户查看 status/diff，**Then** 系统分别展示「已暂存版本」和「未暂存版本」，不会把新修改静默并入旧 stage。
4. **Given** stage 集合包含一个多实体事务，**When** 用户 commit，**Then** 该事务作为一个不可拆分的变更单元写入 commit。
5. **Given** 删除实体后 stage，**When** 查看 diff，**Then** 必须显示删除，而不是显示为空或消失。
6. **Given** commit 成功，**When** 查看工作树，**Then** 只清除已提交的缓存区条目，未暂存变更继续留在工作树并显示准确 diff。
7. **Given** 空事务、重复 stage、重复 discard，**When** 反复执行，**Then** 幂等，不产生额外 commit 或错误历史。
8. **Given** stage 后任意 realm 又编辑同一实体，**When** 用户查看 status 或提交原 stage，**Then** staged snapshot 保持不变，后续编辑统一显示为 unstaged；提交不得覆盖或丢弃后续编辑。
9. **Given** 两个 realm 从相同 index/head revision 开始 stage 或 commit，**When** 它们竞争同一分支，**Then** 条件更新只允许一个操作成功；失败方不留下半成品 index/commit，并返回 expected/actual revision。
10. **Given** 已 stage 的实体后来又被编辑，**When** 用户再次 stage 同一选择，**Then** staged snapshot 原子替换为当前工作树版本，新增编辑不再显示为 unstaged；工作树未变化时重复 stage 是 no-op 且不递增 revision。
11. **Given** 用户只选择一个属于多实体事务的实体，**When** stage 或 unstage，**Then** 系统自动扩展到该 `transactionId` 的完整变更单元及其跨事务实体关系依赖，并返回实际选择列表，不允许把事务或可重放依赖拆进不同 commit。
12. **Given** 另一个 realm 在本次 stage 捕获 token 后修改工作树，**When** stage 尝试落盘，**Then** `workingTreeRevision` CAS 失败，index 零变化；调用方刷新后可重新选择。
13. **Given** 普通提交缺少 `authorId`、缺少 `operationId` 或 message trim 后为空，**When** 调用 commit，**Then** 在任何持久状态变化前返回类型化校验错误。
14. **Given** 实体含 `encrypted: true` 字段，**When** CRUD、stage、刷新并 commit，**Then** 原始 WorkingTreeEntry 与 IndexEntry dump 中明文哨兵零命中，解锁后的 status/diff/commit 语义与未加密字段一致。
15. **Given** T1 插入 A/B、T2 随后更新 A，且 HEAD 中不存在 A/B，**When** 用户只选择 T2 stage，**Then** 系统递归扩展为 T1+T2 并返回实际单元列表；生成的 index 可仅凭 HEAD 完整重放。unstage T1 时必须同时移除依赖它的 T2，任何一步失败 index 零变化。
16. **Given** T1 插入 Parent P、T2 插入引用 P 的 Child C，且 HEAD 中均不存在，**When** 用户只选择 T2 stage，**Then** 关系闭包必须包含 T1 并按 Parent→Child 重放；反向 unstage T1 必须移除 T2。父子 DELETE、关系键 UPDATE 与关系环各有稳定拓扑或类型化拒绝结果。
17. **Given** full/filter 同步通过 `disableTriggers=true` 应用远端实体变更，**When** pull/autoSync/repository sync/bulk sync 提交，**Then** 同一事务写入 `origin=remote_sync` 的未暂存 WorkingTreeEntry，不生成可 push 的本地 `RxDBChange`；刷新及切出/切回后 status、diff 与业务值保持一致。
18. **Given** 同步只回填 remoteId、推进水位或更新时间而没有业务实体变化，**When** 事务提交，**Then** 不创建 WorkingTreeEntry、不递增 working-tree revision。
19. **Given** 实体使用 QueryCache 同步类型，**When** cache upsert/delete/过期清理发生，**Then** 该实体不进入 baseline、status、diff、stage 或 commit；若一个 callback transaction 先后写入 QueryCache 与版本化实体，检测到混用时以 `mixed_versioned_cache_transaction` 终止并回滚整个事务，提交后两类数据均零变化。

### User Story 3 - 丢弃与清空（Priority: P2）

**验收场景**：

1. **Given** 工作树有未提交修改，**When** 用户 `discardWorkingTree()`，**Then** 工作树回到当前 HEAD，未提交 stage 一并清除，历史 commit 不变。
2. **Given** 缓存区有条目，**When** 用户 `clearIndex()`，**Then** 只清除暂存选择，工作树数据不变。
3. **Given** 同一事务跨多个实体且含外键依赖，**When** discard，**Then** 在事务边界内整体回滚，不留下部分实体的中间态。

## 功能需求

- **FR-004**：系统 MUST 提供工作树 status，至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中和冲突状态。普通命令 CAS 失败只返回一次性 `CommitConflict`，不得形成 durable conflicted；v1 的 conflicted 只由仍存在且 revision 已分叉的 `WorkingTreeRestoreSession` 重建。
- **FR-005**：系统 MUST 提供面向实体或完整事务的 diff，能够分别比较 `HEAD ↔ 工作树` 和 `HEAD ↔ 缓存区`。
- **FR-006**：系统 MUST 支持 stage、unstage、stage all 和 clear index；这些操作不得修改已有 commit，也不得丢弃未选择的工作树变更。
- **FR-007**：系统 MUST 在 stage 后再次发生编辑时保留 staged 快照，并把新增部分标记为 unstaged；禁止隐式扩大 stage 范围。
- **FR-011**：系统 MUST 在 commit 成功后只清除已提交的缓存区变更；未暂存变更继续留在工作树并显示准确 diff。
- **FR-016**：系统 MUST 支持 discard working tree 和 clear index，且两者操作范围明确：前者回到当前 HEAD，后者只清除暂存选择。
- **FR-023**：系统 MUST 为异步命令提供 loading、success、error，为查询额外提供 empty；错误必须说明操作、对象和恢复建议。
- **FR-026**（已改口径）：`bench-working-tree` MUST 在 Node + PGlite memory、10,000 条实体 / 100 个 commit、100 个 unstaged / 50 个 staged 单元的固定 fixture 下，以 5 次 warmup、50 次采样测完整 status、完整 diff 和批量 stage 50 个单元并输出 p50/p95、runner profile 与 JSON。普通 CI 以归一化 ratio 不超过已签入 reference median 的 110% 为硬门禁；三项 promise resolve 的 p95 不高于 100 ms 只在 `runnerProfileHash` 匹配 reference 的固定性能 runner 上作为发布硬门禁。浏览器 OPFS / IDB 不承诺相同绝对数字。
- **FR-031**：所有操作 MUST 遵守 Epic revision 矩阵：stage/re-stage 同时校验 expected working-tree 与 index revision；unstage/clear index 校验 index revision；commit 校验 active branch token、head 与 index revision，并在同一事务读取当前工作树完成 residual rebase。commit 不得仅因 stage 后普通编辑改变 working-tree revision 而拒绝，也不得覆盖该编辑。CAS 失败时操作全量回滚。
- **FR-032**：stage 后发生的实体编辑不按 writer 身份分叉处理；无论来自当前 realm 还是其他 realm，都 MUST 保留为相对 staged snapshot 的 unstaged 变更。writer 身份不得成为提交正确性的必要条件。
- **FR-039**：每次普通 CRUD MUST 在同一事务内校验 active branch token、写入业务实体、写入或合并完整 `WorkingTreeEntry` 并递增 `workingTreeRevision`。任一步失败全部回滚；禁止只靠内存 dirty set 重建。
- **FR-040**：stage/re-stage MUST 同时校验 expected working-tree 与 index revision；已暂存选择在工作树变化后再次 stage 时替换为当前快照，未变化的重复调用是 no-op。实体选择命中多实体事务时 MUST 自动扩展整个事务，stage 与 unstage 规则对称。
- **FR-041**：普通提交 MUST 接收 trim 后非空 message 与必填 `CommitOptions.authorId`、`CommitOptions.operationId`；调用方 metadata 只能放扩展审计字段，不得覆盖 parent、时间、作者、operation ID、schema/codec manifest 或变更数量。
- **FR-045**：WorkingTreeEntry 与 IndexEntry MUST 延续字段加密 at-rest 契约；读取可在解锁后返回明文业务值，但任何持久化 dump、错误和摘要不得出现加密字段明文。
- **FR-046**：所有业务实体写入口 MUST 遵守 Epic 写入口矩阵。full/filter 远端实体应用即使关闭 `RxDBChange` trigger，也 MUST 在同一事务写入 `origin=remote_sync` 的未暂存单元且不得形成 push echo；纯同步元数据更新不改变工作树。QueryCache 实体 MUST 完整排除；callback transaction 在任意时点检测到 QueryCache/版本化实体混用时 MUST 抛 `mixed_versioned_cache_transaction` 并回滚整个事务，不能要求事务系统预知回调未来操作。raw/未知绕过路径 MUST fail-fast。
- **FR-047**：Index MUST 在任何 revision 下都能仅凭当前 HEAD 与自身条目重放。stage 选择 MUST 向前扩展同实体前置单元，并按完整事务、schema relation graph 与实际行引用递归包含跨实体/跨事务依赖；unstage 前置单元 MUST 向后移除失去实体、事务或关系依赖的 staged 单元。闭包按依赖拓扑稳定排序；不能拆分的关系环纳入同一原子单元，无法形成闭包时返回 `index_dependency_cycle`。计算失败或 CAS 失败时 index 零变化。

> FR-026 保留原 100 ms 产品预算，但把环境、数据分布、完成时点、采样数和 p95 口径固定下来；相对门禁使用
> 同次 control CRUD 归一化与 Epic 冻结的 reference，不照搬 hot-path bench 的 2%。浏览器首次可见状态由三端 E2E 单独记录。

## 关键实体

- **WorkingTreeState**：数据库/分支级工作树状态；基于哪个 HEAD、是否恢复中、未提交变更计数、`workingTreeRevision`。
- **WorkingTreeEntry**：数据库/分支级未提交变更单元；实体或完整事务身份、操作、patch/inverse patch 或等价快照、当前指纹、来源 change ID、`local | remote_sync | merge | undo_redo | restore` 来源。
- **IndexState**：数据库/分支级 index 水位；`indexRevision`、基线 HEAD、条目计数。
- **IndexEntry**：分支级缓存区条目；变更单元 ID、基线 commit、暂存快照、stage 时工作树 revision、依赖单元 ID、stage 时间。
- **CommitOptions**：普通提交选项；必填 `authorId`、`operationId`，可选 `metadata`。保留审计字段不能由 metadata 覆盖。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 设计展开

### 操作契约

内部 DTO 字段布局在 plan 阶段冻结；核心操作名与语义保持以下边界，公开共享类型和三框架映射见 US-306c：

| 操作                       | 语义                                                      | 是否创建 commit |
| -------------------------- | --------------------------------------------------------- | :-------------: |
| `status()`                 | 返回工作树、缓存区、HEAD 和冲突摘要                       |       否        |
| `diff(scope?)`             | 比较 HEAD、缓存区、工作树的变更                           |       否        |
| `stage(selection)`         | 将实体或完整事务的当前版本复制进缓存区；re-stage 刷新快照 |       否        |
| `unstage(selection)`       | 从缓存区移除实体所属的完整事务单元，工作树不变            |       否        |
| `commit(message, options)` | 以必填 author/operation ID 原子写入 commit 并移动 HEAD    |       是        |
| `discardWorkingTree()`     | 丢弃工作树未提交变更并回到 HEAD                           |       否        |
| `clearIndex()`             | 清空暂存选择                                              |       否        |

所有修改操作按 Epic 的 revision 矩阵接收或内部捕获 expected revision，并在事务内做条件更新。公开 API 是否显式
暴露 expected revision 在 plan 阶段冻结，但 active branch token 必须随实体/realm 上下文传入写路径，不能在事务开始后
重新读取新分支来掩盖 stale writer；冲突错误必须返回 expected/actual，调用方不能靠字符串解析。

### 边界情况

- stage 后实体被任意 realm 删除或更新：不改写 staged snapshot，变化作为 unstaged 保留；只有 head/index/worktree revision CAS 失败才返回并发冲突。
- commit staged snapshot 时读取当前 `WorkingTreeEntry` 并原子 rebase：与 staged snapshot 相同的部分删除，后续编辑形成的差量保留；不得用 staged snapshot 覆盖业务表。
- stage/unstage 的实体选择命中 transactionId 时统一扩展完整事务；错误和返回值列出实际受影响的全部实体。
- 闭包不仅扩展当前 transactionId：同一实体被多个未提交单元顺序修改时，stage 向前包含重放所需前置单元，
  unstage 向后移除失去前置的 staged 单元；递归跨过事务成员、schema relation 与实际行引用直到 index 自包含。
- 远端实体应用继续关闭本地 change trigger 以避免 push echo，但关闭 trigger 不等于关闭工作树记录；远端 action、
  WorkingTreeEntry 和同步水位必须共享一个事务，任一步失败全部回滚。
- QueryCache 是可丢弃投影，不参与版本历史。callback transaction 无法预知回调未来操作；一旦检测到 QueryCache 与
  版本化实体混用就抛错并回滚整个事务，保证提交边界外零变化，不伪造“首笔 SQL 前即可预知”的能力。
- 存储配额不足、浏览器禁用持久化或 schema 升级失败：明确报告持久化不可用，禁止把状态伪装成已保存。
- undo/redo 与 commit 同时触发时按调用顺序串行化；redo 仍是会话级能力，不能被误报为 durable commit。

## 测试要求

- 核心包按 TDD 先写刷新恢复的失败用例，再实现；覆盖率不低于 90%。
- PGlite、四个 SQLite 浏览器适配器与 desktop SQLite host 复用同一套 revision CAS / 崩溃恢复 conformance fixture。
- 共享 fixture 必须覆盖“CRUD 写入业务表后、写 WorkingTreeEntry 前失败”的回滚，以及旧 active branch token 写入被拒绝。
- 共享 fixture 必须逐项覆盖 pull、autoSync、pullRepository、sync、bulkSync、mergeBranch、undo/redo；断言业务表变化必有对应工作树变化，纯 remoteId/watermark 更新无工作树变化，远端应用不产生 push echo。
- 必须有跨事务 stage 依赖闭包 fixture，至少覆盖 INSERT→UPDATE、UPDATE→DELETE、多实体事务、Parent INSERT→Child INSERT、Child DELETE→Parent DELETE、关系键 UPDATE 与关系环，并验证任意成功 index 都可从 HEAD 独立重放。
- QueryCache fixture 必须证明 cache 刷新/淘汰不污染 status，混合事务在持久化前失败。
- 支持字段加密的后端必须扫描 WorkingTreeEntry 与 IndexEntry 原始 dump，断言明文哨兵零命中。
- 三端各有等价的单元/组件测试，并用跨框架 E2E 验证 status → stage → commit → refresh 流程。
- 失败、空状态、键盘可达性和屏幕阅读器名称必须有 UI 回归测试；测试文件使用 `*.spec.ts`，不依赖固定延时。
- `pnpm nx run benchmarks:bench-working-tree` 按 Epic 固定的 100 dirty / 50 staged fixture、50 次采样与冻结 reference ratio 纳入普通 CI；固定性能 runner 额外执行绝对 p95 发布门禁，报告都写入 `benchmarks/reports/`。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 工作树与缓存区状态机、diff
- `packages/rxdb/src/system/` — 工作树/缓存区元数据表
- `packages/rxdb-{angular,react,vue}/` — 对称的 hooks / composables / signals
- `apps/dev-rxdb-{angular,react,vue}/` — 三端工作树演示
- `benchmarks/working-tree.bench.ts` — FR-026 的判定依据（新增）
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md)
- [US-307 历史恢复会话](./US-307-restore-session.md)
- [US-308 分支隔离与跨 realm 冲突检测](./US-308-branch-isolation-conflict.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md)
- [Workspace 插件文档](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
