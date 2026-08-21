---
id: epic-006-working-tree-commits
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 本地工作树与提交历史

## 愿景

把 RxDB 的本地变更组织成 Git 式工作流：用户刷新页面、重启应用或意外关闭后，工作树、暂存区、当前提交和历史恢复结果仍然存在且语义一致，且不引入 Git 的远程仓库、权限与代码评审。

## 为什么是 Epic 而不是一个 Story

拆分前的 US-305（**历史快照，以 git 历史为准；当前文件已是拆分后的形态**）单个故事持有 4 个用户故事、28 条 FR、7 个关键实体，横跨 `packages/rxdb/src/version/`、`packages/rxdb/src/system/`、`rxdb-plugin-workspace`、三个框架包和三个 demo。它的 INVEST 里 `Small` 打了勾，但没有任何一条 FR 可以在不落地存储布局的前提下单独验收——即"要么全做要么全不做"，这正是 Small 不成立的定义。拆分后的 [US-306](../stories/collaboration/US-306-working-tree-index.md) 仍同时覆盖全部写入口、Index、三框架和 benchmark，因此在文件内再切成「交付阶段 A/B/C」。现在每个阶段都能独立跑通「写入 → 刷新 → 读回」这条最小闭环。

## 目标

用户视角的最终能力，每条标注归属故事；**没有归属的条目就是本 Epic 的缺口**，不得靠"发布前统一补"消化。

- [ ] 提交历史与 HEAD 在刷新、重启、崩溃后完整可查（[US-305](../stories/collaboration/US-305-commit-graph-head.md)）
- [ ] 已在用的数据库能一次性、可重试地打开 commit 能力而不丢数据（[US-305](../stories/collaboration/US-305-commit-graph-head.md)）
- [ ] 任何入口写入的业务变更都被工作树捕获，刷新后可仅凭 HEAD + 工作树重放（[US-306 阶段 A](../stories/collaboration/US-306-working-tree-index.md)）
- [ ] 用户能查看 status/diff、选择一部分变更进暂存区并带消息提交，未暂存修改保留（[US-306 阶段 B](../stories/collaboration/US-306-working-tree-index.md)）
- [ ] Angular / React / Vue 三端以对称 API 完成上述操作，且 UI 达到 WCAG 2.1 AA（[US-306 阶段 C](../stories/collaboration/US-306-working-tree-index.md)）
- [ ] 用户能把数据恢复到任意可达 commit，且不改写历史、不移动 HEAD（[US-307](../stories/collaboration/US-307-restore-session.md)）
- [ ] 每个分支拥有独立的 HEAD、工作树与暂存区，跨标签页并发不静默覆盖（[US-308](../stories/collaboration/US-308-branch-isolation-conflict.md)）
- [ ] 公开文档讲清启用方式、工作树与草稿缓存的区别、恢复语义、历史保留旧值的风险与加密边界
      （[US-306 阶段 C](../stories/collaboration/US-306-working-tree-index.md)，对应发布门禁 9）

## 术语（与既有 Workspace 插件的命名冲突处置）

`Workspace` 前缀**已经被占用**：`@aiao/rxdb-plugin-workspace` 的 NEW 草稿缓存在 api-baseline 中导出了 `WorkspaceCacheEntry`、`WorkspaceCacheId`、`WorkspaceCorruptedEntry`、`WorkspaceFlushError`（见 [rxdb-plugin-workspace.json](../api-baseline/rxdb-plugin-workspace.json)）。原 US-305 又把 Git working tree 也叫 workspace，并计划导出 `WorkspaceState` / `WorkspaceConflict`——同一个前缀、两个毫不相干的概念。原 FR-028 只禁止了「与已删除导出同名同签名」，没禁止「同前缀不同义」，而后者才是真正会让读者读错代码的部分。

本 Epic 定死：

| 概念               | 中文     | 导出前缀       | 归属                               |
| ------------------ | -------- | -------------- | ---------------------------------- |
| Git working tree   | 工作树   | `WorkingTree*` | 本 Epic 新契约                     |
| index / staging    | 暂存区   | `Index*`       | 本 Epic 新契约                     |
| commit / commit 图 | 提交     | `Commit*`      | 本 Epic 新契约                     |
| NEW 草稿本地缓存   | 草稿缓存 | `Workspace*`   | 既有 `@aiao/rxdb-plugin-workspace` |

新契约里**不得**出现 `Workspace` 前缀的新导出；文档与 story 正文中"工作区"一词只指草稿缓存。
需要指代**文件系统上的本地工作目录**（如 `dist/`、git working copy）时固定写"本地工作副本"，
不复用"工作区"，也不与 Git 语义的"工作树"混用。引用历史原文时保留原字并加译注，不改引文。

恢复会话属于工作树状态，公开名使用 `WorkingTreeRestore*`；分支引用和并发冲突属于提交图，公开名使用
`CommitBranch*` / `CommitConflict*`。既有适配器契约已经导出 `SwitchBranchOptions`，本 Epic 不复用该名字；
面向 `VersionManager.switchBranch()` 的新选项固定使用 `WorkingTreeSwitchBranchOptions`。

## v1 状态模型（唯一真相源）

v1 不持久化第二份独立 `HEAD`。当前分支仍由既有 `RxDBBranch.activated` 表示，当前 HEAD 从该分支的
`CommitBranchRef.headCommitId` 派生。业务实体表只保存**当前激活分支的物化投影**，不是所有分支工作树的
唯一持久化副本；非激活分支必须能仅凭 HEAD 与自己的未提交变更单元恢复，不得依赖离开分支时残留在业务表里的值。

启用 commit 能力后，`RxDBBranch.activated` 必须满足“恰好一行是 true”。首次迁移发现零个 active 时沿用既有
`resolve_current_branch` 语义：优先激活 `main`，没有 `main` 时创建它；发现多个 active 时以
`ambiguous_active_branch` 整体拒绝迁移，不按查询顺序猜一个。系统 schema 必须用数据库约束保证至多一个 active，
并在每次连接时验证至少一个；`activationRevision` 只防并发切换，不能替代该基数不变量。

| 状态                         | 主键                     | 必须持久化的版本/内容                                                     | 写入规则                                                    |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CommitCapabilityState`      | database                 | enabled、protocol/schema/codec version                                    | 首次启用后数据库级生效；所有 writer 连接时协商              |
| `WorkingTreeActivationState` | database                 | `activationRevision`                                                      | switch branch CAS 成功后递增；不复制第二份 active branch ID |
| `CommitBranchRef`            | database + branch        | 不可变 `generation`、`headCommitId`、`headRevision`                       | commit 在同一事务内以 generation + revision 做 CAS 后推进   |
| `WorkingTreeState`           | database + branch        | `baseHeadCommitId`、`workingTreeRevision`、未提交条目数                   | CRUD、commit rebase、restore、discard 改变逻辑工作树时递增  |
| `WorkingTreeEntry`           | database + branch + unit | 实体/事务身份、操作、patch/inverse patch 或快照、当前指纹、来源 change ID | 与业务 CRUD 同一事务写入；完整事务共享同一 unit             |
| `IndexState` / `IndexEntry`  | database + branch        | `indexRevision`、完整 staged snapshot、来源 working-tree revision         | stage / unstage / commit 以 `indexRevision` 做 CAS          |
| branch materialization stage | database + attempt       | 目标分支、冻结远端水位、scope manifest、分页 payload、fingerprint         | 只暂存目标分支快照，不写当前业务投影；成功 switch 后删除    |

### 状态归属（哪个故事负责建表）

状态表本身的创建/迁移与使用它的语义分属不同故事，避免出现「后置故事建表、前置故事使用」的倒挂：

| 状态                                    | 建表与首次迁移    | 语义与 CAS 归属                                                            |
| --------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `CommitCapabilityState`                 | US-305            | US-305                                                                     |
| `CommitBranchRef`                       | US-305            | US-305（head CAS）、US-308（分支生命周期）                                 |
| `WorkingTreeActivationState`            | **US-305**        | US-306 阶段 A（写路径 token 校验）、US-308（switch CAS 与 `requireClean`） |
| `WorkingTreeState` / `WorkingTreeEntry` | US-306 阶段 A     | US-306 阶段 A                                                              |
| `IndexState` / `IndexEntry`             | US-306 阶段 B     | US-306 阶段 B                                                              |
| `WorkingTreeRestoreSession`             | **US-306 阶段 B** | US-307                                                                     |
| branch materialization stage            | US-308            | US-308                                                                     |

`WorkingTreeActivationState` 由 US-305 随 system schema 首次迁移一并建立并初始化为 revision 0：
US-306 阶段 A 的普通 CRUD 必须校验 active branch token，而它排在 US-308 之前，表不能等到 US-308 才存在。
US-305 只负责建表与初始化，不实现 switch 语义。

`WorkingTreeRestoreSession` 适用同一条规则，因此建表归 **US-306 阶段 B** 而不是 US-307：`status()` 的 `conflicted`
是 US-306 阶段 B 交付的状态集合的一部分，而 v1 唯一的 durable 来源就是该 session，表不能等到排在其后的 US-307 才存在。
US-306 阶段 B 只负责建表与「从已存在的 session 派生 conflicted」，其 fixture 直接写入 session 行来构造分叉
（与 US-306 阶段 A 直接推进 `activationRevision`、不经 `switchBranch` 入口的做法同源）；`restore()` / `discard` 的会话
创建、`active | conflicted | committed` 生命周期、no-op 与兼容预检全部归 US-307。同理，类型化诊断值
`CommitConflict` 的定义、TSDoc 与 api-baseline 登记归**首个使用者 US-306 阶段 B**，US-308 只做 activation 维度的扩展。

`WorkingTreeEntry` 是逻辑契约，不强制新增物理表；plan 可以证明复用 `RxDBChange` 或不可变派生表满足同一契约。
但 `WorkingTreeState` 只存计数和 revision 不算完成：必须有可枚举、可重放、按分支隔离的未提交变更单元。
`CommitChangeSet` 与 `IndexEntry` 必须复制完整的不可变恢复数据，不能只引用可能被 undo、清理或删分支删除的
`RxDBChange` 行。

index 必须满足**独立可重放不变量**：任意时刻，全部 `IndexEntry` 只依赖当前 HEAD 与 index 内其他条目，不能依赖
仍留在工作树但未 stage 的前置操作。选择一个单元时，系统先向前扩展所有触及同一实体的未提交前置单元，再按事务成员
与实体关系递归闭包：被选行引用、但 HEAD 中不存在或版本不足的父行操作必须纳入；父 DELETE 依赖的子 DELETE、关系键更新
及跨事务外键前置同样必须纳入。unstage 一个前置单元时反向移除所有失去实体、事务或关系依赖的 staged 单元。
闭包使用 schema relation graph 与实际行身份计算，并按依赖拓扑稳定排序；循环不能拆开时纳入同一原子单元，无法形成
可重放闭包时返回 `index_dependency_cycle`。stage / unstage 都返回实际扩展后的稳定单元列表。
例如 T1 插入 Parent P、T2 插入引用 P 的 Child C，stage T2 必须同时 stage T1；T1 插入 A/B、T2 更新 A 时
stage T2 也必须包含 T1。不得提交无法应用到 HEAD 的 INSERT/UPDATE/DELETE，也不得静默把前置效果塞进后续单元。
闭包计算或 CAS 失败时 index 零变化。

跨 realm 正确性由数据库事务内的 `headRevision` / `workingTreeRevision` / `indexRevision` 条件更新保证。
revision CAS 是领域数据完整性，不是跨 realm 协调协议；本 Epic 不引入 writer lease 或迁移 epoch fencing。

每个 realm 在读取/实例化实体时捕获 `{ branchId, activationRevision }`。普通 CRUD、stage、commit、restore、
discard 与分支操作都必须在实际写事务内验证该 token；另一个 realm 已切换分支时，旧 token 的写入返回稳定的
`stale_active_branch`，不得把旧分支实体写进新分支。`BroadcastChannel`、响应式通知和内存缓存只能用于刷新 UI，
不能承担该正确性。

分支切换时恢复目标分支自己的 `HEAD + WorkingTreeEntry` 和 index；只有目标分支没有未提交条目时，才只物化
目标 HEAD。物化投影本身不改变目标分支的逻辑工作树，因此只递增 `activationRevision`，不得平白递增
`workingTreeRevision`。不得把“切到分支”实现成无条件 reset 到 HEAD。

### revision 校验矩阵

revision 校验分两类，**不可混为一谈**：

- **调用方捕获型**：调用方在事务开始前读到某个 revision，事务内以它做条件更新，失败即冲突。适用于 stage、
  unstage、commit、restore、discard、switch branch——它们都由用户显式发起，且失败后用户可以刷新重选。
- **事务内读改写型**：事务内读当前值、写业务数据、写 +1，全程不接收调用方 expected 值，因此**不会因并发而失败**。
  适用于普通 CRUD 与 remote entity apply。

普通 CRUD **不得**采用调用方捕获型：另一个 Tab 的任何一次写入都会推进同分支的 `workingTreeRevision`，若把它当成
CRUD 的前置条件，多标签页下所有在途 `save()` 都会失败，与 FR-032「writer 身份不得成为提交正确性的必要条件」和
US-306 US2-AC8（其他 realm 编辑同一实体属正常行为）直接冲突。`activationRevision` 则相反：它是调用方捕获型，
因为「实体属于哪个分支」必须以读取时的分支为准，这正是 `stale_active_branch` 的判据。

| 操作                      | 同一事务必须校验                                                       | 成功后递增                                    |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| 普通 INSERT/UPDATE/DELETE | active branch token（捕获型）；working-tree revision 读改写            | working-tree revision                         |
| remote entity apply       | active branch token（捕获型）、sync 水位；working-tree revision 读改写 | 有实体净变化时递增 working-tree revision      |
| merge / undo / redo       | active branch token、expected working-tree + 操作自身 revision         | 有逻辑工作树变化时递增 working-tree revision  |
| stage / re-stage          | active branch token、expected working-tree + index revision            | index revision；工作树未变                    |
| unstage / clear index     | active branch token、expected index revision                           | index revision                                |
| commit                    | active branch token、expected head + index revision                    | head、index、working-tree revision            |
| restore                   | active branch token、expected head + working-tree + empty index        | working-tree revision；index 不变             |
| discard                   | active branch token、expected head + working-tree + index              | working-tree；index 非空时递增 index revision |
| switch branch             | expected activation revision、来源/目标分支状态或物化快照              | activation revision                           |
| create branch             | active branch token、来源 head + working-tree revision                 | 新 ref/state 从 revision 0 开始；来源状态不变 |
| remove branch             | expected activation revision、目标 ref/state revision、非 active       | 原子删除目标可变状态；revision 不复用         |

commit 不因 stage 后的普通编辑单独失败：staged snapshot 已冻结，commit 在事务内把已提交部分从当前
`WorkingTreeEntry` 中扣除或 rebase，后续编辑仍作为 unstaged 保留。任何语义 no-op 都不递增 revision。

`CommitConflict` 是一次失败命令的类型化诊断值，不是持久状态。普通 stage/commit/switch CAS 失败只返回该值，
不得把 `status()` 永久标成 conflicted；刷新后状态按最新持久 revision 重建。`status().conflicted` 只允许由仍存在的
durable domain session 派生，v1 唯一来源是 `WorkingTreeRestoreSession` 的 expected revision 与当前 revision 不一致。
`requireClean` 同样只检查这种可重建冲突，不得把历史上发生过的一次 CAS 失败当成未解决状态。

### 写入口语义矩阵

`HEAD + WorkingTreeEntry` 要成为真相源，不能只拦截 Repository 的普通 CRUD。所有会改业务实体表的入口必须在
同一数据库事务内落入下表之一；未知入口默认拒绝，不能先改业务表再靠事件补记。

| 写入口                                                                    | commit 能力启用后的语义                                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 普通 CRUD、显式事务、Workspace 草稿 `save()`                              | 写入/合并本地 `WorkingTreeEntry`，来源为 `local`，递增 working-tree revision                                           |
| `mergeBranch()`、undo/redo、restore/discard                               | 按各自原子边界写入或重算本地工作树；不得绕过 active token 与 revision CAS                                              |
| `pull()`、autoSync、`pullRepository()`、`sync()`、`bulkSync()` 的实体应用 | 即使为防回推而关闭 `RxDBChange` trigger，也必须写入来源为 `remote_sync` 的未暂存单元；不生成可 push 的本地 change      |
| 只更新 remoteId、同步水位或审计时间                                       | 不改变业务表，不创建工作树单元，不递增 working-tree revision                                                           |
| `VersionManager.cleanupExpired()` 的过期删除                              | 与 `pull` 同类：写入来源为 `remote_sync` 的未暂存 DELETE 单元，递增 working-tree revision；不生成可 push 的本地 change |
| branch switch、baseline/restore 物化、commit residual rebase              | 由对应领域操作显式维护工作树；底层投影重写不得被 trigger 二次记录                                                      |
| metadata-only 目标分支的远端预取                                          | 只写 branch materialization staging 与独立水位，不得更新当前分支 `RxDBSync` 或业务表                                   |
| QueryCache 的 upsert/delete（orphan 当前**只计数不删除**，见下注）        | QueryCache 实体不进入 baseline、status、diff、stage 或 commit；它仍是可重建缓存，不能与版本化实体混在同一事务单元中    |
| raw SQL、adapter 直写或其他 trigger bypass                                | 业务表写入前以 `commit_capability_mismatch` 拒绝；只有同时持有内部事务能力并原子维护工作树的受信路径可以关闭 trigger   |

**受信路径必须与 bypass 门禁同批交付。** 表最后一行的拒绝门禁一旦启用，既有的批量投影重写路径就会撞上它——
最典型的是 [VersionManager.ts](../../packages/rxdb/src/version/VersionManager.ts) 的 `switchBranch()` 经
`adapter.switchBranch({ branchId, actions })` 做的整表重写。因此 **US-306 阶段 A 在落地拒绝门禁的同一个阶段内**，
必须把既有 switch / baseline 物化路径登记为受信路径（关 trigger + 不产生工作树条目 + 不递增 working-tree revision），
否则阶段 A 合并后到 US-308 合并前，`switchBranch` 会被自己的门禁拒掉或静默绕过工作树。登记的是「路径可信」这一
机制，切换分支的**工作树恢复语义**仍归 US-308。

**登记必须以调用方意图为键，不得以传输层函数为键。** `adapter.switchBranch()` 与
`executor.mergeChanges(..., disableTriggers)` 都是被多个语义不同的调用方复用的批量重写传输层；
把「受信」挂在这两个函数上，等于让本表的不同行共用同一个判定，必然出错。当前调用方与各自应落的行如下：

**登记键固定为「文件 + 符号 + 意图」，不是行号。** 行号会随任何一次无关编辑漂移，把它当键会让漂移测试
变成噪音源。下表按符号登记，与代码实际调用点一一对应：

| 登记键（文件 + 符号）                                                                                                                     | 传输层                          | 本表归属                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| [VersionManager.ts](../../packages/rxdb/src/version/VersionManager.ts) · `switchBranch()`                                                 | `adapter.switchBranch`          | 受信物化：**不**产生工作树单元          |
| [VersionManager.ts](../../packages/rxdb/src/version/VersionManager.ts) · `restoreEntity()`                                                | `adapter.switchBranch`          | restore：**必须**产生                   |
| [HistoryManager.ts](../../packages/rxdb/src/version/HistoryManager.ts) · 失效 redo 栈                                                     | `adapter.switchBranch`          | 只写 `redoInvalidatedAt` 元数据：不产生 |
| [HistoryManager.ts](../../packages/rxdb/src/version/HistoryManager.ts) · undo/redo 应用                                                   | `adapter.switchBranch`          | undo/redo：**必须**产生                 |
| [merge-branch.ts](../../packages/rxdb/src/version/merge-branch.ts) · per-change 分支 `executor.mergeChanges`                              | `mergeChanges`（trigger 开启）  | mergeBranch：必须产生                   |
| [merge-branch.ts](../../packages/rxdb/src/version/merge-branch.ts) · squash 分支 `adapter.mergeChanges`                                   | `mergeChanges`（trigger 开启）  | mergeBranch：必须产生                   |
| [pull-batch.ts](../../packages/rxdb/src/version/pull-batch.ts) / [pull-repository.ts](../../packages/rxdb/src/version/pull-repository.ts) | `mergeChanges(disableTriggers)` | remote apply：`origin=remote_sync`      |
| [cleanup-expired.ts](../../packages/rxdb/src/version/cleanup-expired.ts)                                                                  | `mergeChanges(disableTriggers)` | 过期删除：`origin=remote_sync`          |

`merge-branch.ts` **两个策略分支各是一个独立调用点**（per-change 走 `executor`、squash 走 `adapter`），
必须各占一行；只登记其中一个会让漂移测试在落地当天就红。

**`mergeChanges` 是被重载的名字，扫描必须按签名区分**，否则本表会收进与本地业务表无关的调用：

| 重载                                                                                                     | 语义                                       | 是否属本表 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | :--------: |
| 本地 [`mergeChanges(actions, localChanges?, disableTriggers?)`](../../packages/rxdb/src/rxdb-adapter.ts) | 重写本地业务投影                           |     是     |
| 远端 [`mergeChanges(actions, branchId?, changes?)`](../../packages/rxdb/src/rxdb-adapter.ts)             | 推送到远端（`push-repository` / Supabase） |     否     |

远端重载的第三个参数是 `changes` 而不是 `disableTriggers`，它不写本地业务表，MUST NOT 计入本表；
静态扫描 MUST 同时排除 `dist/`（构建产物虽已 gitignore，但在本地工作副本中常驻，按文本 grep 会命中 `.d.ts` 声明）。

因此写路径必须携带**显式意图标记**（枚举值，plan 阶段冻结名称），由发起领域操作的调用方传入并透传到事务内；
未携带标记的批量重写一律按未知入口拒绝。新增任何一个本地 `disableTriggers` 调用点都必须先在本表登记，
否则视为未知入口——这条同时是防止表随代码漂移的护栏。

> `cleanupExpired()` 归到 `remote_sync` 而非 QueryCache 排除或受信物化，理由：它删除的是**版本化实体**
> （Filter 同步的业务表行，会进 baseline 与 commit），排除它会让「任何业务表净变化都能由 HEAD + WorkingTreeEntry
> 重放」（发布门禁 10）失效；而它删除的又是远端仍然存在、只是不再落入本地 sync scope 的行，与 `pull` 造成的
> 本地投影变化同类，因此复用同一条语义而不是新造第八种。它已在实现里跳过仍有未推送变更的候选，
> 不会与本地未提交编辑打架。

QueryCache 那一行按**当前代码实际存在的路径**写：[QueryCacheRepository.ts](../../packages/rxdb/src/repository/QueryCacheRepository.ts)
是 `@experimental` 且没有生产实例化路径，它「计算出 orphan 却不删除」，orphan 只进统计。因此本表登记的是
upsert/delete；若将来接入真实清理路径，按同一条排除规则登记即可，**排除结论不变**。

远端数据进入工作树不等于 remote commit push/pull：v1 只记录本地可审计的未提交结果，不伪造远端作者、消息或远端 commit。
支持 full/filter 同步的实体必须覆盖“pull → refresh → switch away/back → status/diff”这条完整链路，但它**跨三个故事**，
不能整条压在任何单一故事上：US-306 阶段 A 验 `pull → refresh → 仅凭 HEAD + WorkingTreeEntry 重放`（持久层断言，不经
`switchBranch` 入口），US-306 阶段 B 接上 `status/diff`，US-308 接上 `switch away/back`。三段各自可独立跑；完整链路作为
US-308 的集成 fixture 收口。因此 US-306 US2-AC17 只承接**重放半边**，其 Then 中"切出/切回后仍一致"的半边由
US-308 的集成 fixture 收口，两侧在故事文件中各自标注半边归属，审计时不得视为无人承接。
QueryCache 另测其排除边界，避免一次缓存刷新把工作树永久标成 dirty。

### 工作树包含远端来源的净变化（已裁决）

`pull` / `autoSync` / `cleanupExpired()` 写入 `origin=remote_sync` 单元的直接后果是：**一次后台同步就会让
`status()` 出现未提交变化，用户随后的 commit 会把自己的编辑与远端同步结果打包进同一个本地 commit。**
这与 Git 的心智模型不同——Git 的 `fetch` 不会弄脏工作区。本 Epic **明示接受**这个取舍，理由与口径如下：

- 工作树的定义就是"HEAD 之后的一切净变化"，**不按来源豁免**。豁免 `remote_sync` 会让发布门禁 10 的
  「任何业务表净变化都能由 HEAD + WorkingTreeEntry 重放」直接失效，也会让远端下发的数据变成不可审计的暗改
- `status()` / `diff()` **展示全部 origin**，不按来源过滤；`WorkingTreeEntry` 持有来源字段，UI 可据此分组或标注，
  但默认视图不隐藏任何一类
- v1 **不提供** auto-baseline（同步后自动把远端变化并入 HEAD）。它会引入"谁在什么时刻替用户提交了什么"的
  隐式历史，与"不伪造远端作者"和"不改写历史"两条承诺冲突；若产品后续不接受"同步即变脏"，另起讨论，不在本 Epic 夹带

## 启用与存储边界

- US-305 的 system schema migration 进入发布分支前，必须存在当前候选发布提交的真实 bridge ancestor。
  历史 `v0.0.25` 因后续 squash 已脱离当前主线，只保留审计意义，不得移动、重打或继续引用；发布流程须先从
  当前主线产出新的 `kind=bridge` 非迁移版本，再由 migration manifest 读取实际 tag/version。
- commit 能力在从未启用的数据库上默认零副作用；开发者显式启用后创建系统表并执行首次基线迁移，具体配置名在 plan 阶段冻结。
- 启用是**数据库级且单向**的协议状态。数据库已经启用后，未声明该能力、协议版本不匹配或试图绕过
  working-tree trigger 的 writer 必须在业务写入前以 `commit_capability_mismatch` fail-fast 或进入显式只读模式；
  不允许一个 realm 维护 revision、另一个 realm 继续裸写。旧 bundle 由 US-305 的 migration gate 拦截。
- SQL/PGlite 主库是 commit、工作树元数据和 index 的唯一一致性边界。
- Workspace 插件的 NEW 草稿仍留在独立 IndexedDB 中，不参与系统 schema 事务，也不进入 baseline commit。
  草稿调用 `save()` 落入主表后，才作为普通 INSERT 进入工作树。
- 首次迁移只为能仅凭本地主库与旧 `RxDBChange` 完整物化的分支生成 baseline。`local=false, remote=true` 且本地内容
  尚不可完整物化的 metadata-only 分支暂不创建 `CommitBranchRef`，也不得伪造空 baseline；它在 US-308 的首次成功
  物化事务内原子建立 `kind=branch_baseline` 与 branch ref。其他本地分支无法物化时迁移整体失败，不留下部分启用状态。
- metadata-only 分支预取必须使用独立、可恢复的 staging。开始时冻结目标分支身份、配置 sync scope 与远端终止水位；
  每页 payload、水位和 fingerprint 原子落盘，崩溃后从 staging 续传。预取期间当前业务投影、active 标记、当前分支
  `RxDBSync` 与工作树全部不变。最终 switch 事务复核完整 scope、终止水位、fingerprint 与 active token 后一次性物化；
  网络失败、scope 漂移、配额不足或不收敛只留下可安全重试/清理的 staging，不得留下部分目标投影。
- v1 支持矩阵为 **6 个后端**：PGlite、四个 SQLite 浏览器适配器（wa-sqlite / sqlite-wasm / sqlite / sqliteai）、
  以及 `@aiao/rxdb-adapter-electron` 的 **Electron `node:sqlite` host**。实验性的 miniprogram 适配器不承诺崩溃恢复，
  不在矩阵内。
- **入矩阵的判据是宿主能力，不是它所属 story 的 status**。承诺一个后端的前提固定为两条：该 host 已在既有
  跨后端共享套件上全绿，且**没有已知的非确定性失败**。这两条都是可复跑的宿主事实，因此本节**只引宿主能力证据，
  不引任何 story 的 status 或 AC 进度**——后者会随排期变动，把它写进论证等于让本节从写下的那天起就开始过期。
  Electron `node:sqlite` host 计入 v1 的依据是：它在 `@aiao/rxdb-test` 的共享套件上全绿
  （当前快照 931 passed / 18 files / 0 skipped，快照数字见 [US-207 的证据栏](../stories/adapter/US-207-desktop-local-database.md)，
  以该处为准，本节不复制），且在同等 CPU 争抢条件下**没有已复现的非确定性失败**。
- **Tauri 的 Rust `rusqlite` host 是第 7 个后端，v1 暂不承诺**。它与 Electron host 同属 `rxdb-adapter-desktop`，
  但宿主实现完全不同（进程外 `rusqlite` vs 进程内 `node:sqlite`），且按上条第二款未达标：**在 stdio 测试宿主上
  存在可复现的非确定性失败**——CPU 打满或与 `cargo-*` target 并行时随机挂 1–4 条，全落在「改完立刻读到旧值」
  同一族；把通知 `batchTimeout` 调成 0 更糟（空闲机器上稳定挂 10–12 条），因为套件本身依赖那个 16ms 合并窗口。
  同条件下 in-process 的 Node 宿主 3 次全绿，所以这是**跨进程管道的调度时序特征**，不是 Tauri 路径本身的缺陷；
  用真 IPC 的打包 e2e 也确实跑绿了。但判据要的是「没有已知的非确定性失败」，而共享套件上的这一族失败仍可复现，
  收敛条件（不与其他 target 争抢 CPU）也不是 CI 可依赖的前提，因此暂不入矩阵。
  该族 flake 收敛、共享套件在争抢条件下稳定全绿后，按同一套件补入矩阵并同步更新本节与发布门禁 4，不在本 Epic 内夹带。
  证据与复现条件见 [US-210](../stories/adapter/US-210-tauri-sqlite-local-database.md)。
- 跨后端 conformance 拆成**两套具名套件**，各有唯一归属故事，避免出现「门禁点名、无人认领」：
  - `workingTreeCaptureConformanceSuite` —— 归 [US-306 阶段 A](../stories/collaboration/US-306-working-tree-index.md)，
    覆盖写入口捕获、事务原子性与工作树重放
  - `workingTreeCommitConformanceSuite` —— 归 [US-306 阶段 B](../stories/collaboration/US-306-working-tree-index.md)，
    覆盖 index/head/working-tree revision CAS、residual rebase 与崩溃恢复
  - US-305 的 commit 图/迁移断言并入 `workingTreeCommitConformanceSuite`，由 US-306 阶段 B 收口整套；US-305 自身先落地
    commit 图部分的用例，不另起第三个套件名

## 横切约束（按故事适用，不单独成故事）

拆分前的 US-305 把三框架对称、a11y、异步状态和禁止复活旧导出各写成一条 FR，读起来像"最后统一补"。
其中只有异步状态保留了编号（FR-023，已迁入 [US-306](../stories/collaboration/US-306-working-tree-index.md)）；
**三框架对称、a11y、禁止复活旧导出的原编号 FR-024 / FR-025 / FR-028 一律作废**，不在任何故事中承接，
也不得被新条目复用——它们已整体转为下列横切约束，按故事适用：

1. **三框架对称**：US-306 阶段 C、US-307、US-308 的用户操作面必须在 Angular / React / Vue 提供语义对称的 API；US-305 与 US-306 阶段 A/B 是无 UI 的核心底座，只要求核心公开类型、TSDoc 和类型契约测试。
2. **异步状态**：命令暴露 loading / success / error，查询在无结果时额外暴露 empty；错误说明操作、对象与恢复建议，不给无 empty 语义的命令伪造 empty 状态。
3. **可访问性**：US-306 阶段 C、US-307、US-308 的 UI 键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；US-305 与 US-306 阶段 A/B 不适用 UI a11y。
4. **不复活旧导出**：`stagedChange()`、`unstageChange()`、`commit()`、`stagedCount`、`WorkspaceCacheEntry.staged` 在可复核的 `v0.0.24` 公开表面中已不存在；新导出不得与它们同名同签名，也不得使用 `Workspace` 前缀（见上表）。
5. **加密不降级**：支持后端叠加字段加密时，commit、working-tree、index、restore session 中的加密字段仍以
   versioned envelope 落盘；错误、摘要和 benchmark 报告不得带明文。历史保留风险提示不能代替 at-rest 加密。

## 依赖顺序

1. 当前发布主线先产生新的非迁移 bridge tag；历史 `v0.0.25` 不在当前 ancestry，不能供下一步引用。
   **这一步由 US-305 自身承接**（FR-030 + AC US2-14），不是无主的流程约定：
   [migration-release.json](../migration-release.json) 的 `bridge.tag` / `bridge.version` 仍为 `null`，
   而 `release.version` 仍写着已脱链的 `0.0.25`。US-305 的第一个可交付物就是产出新 bridge tag 并修正该 manifest，
   在此之前 system schema 迁移不得进入发布分支
2. [US-305](../stories/collaboration/US-305-commit-graph-head.md) 建立 commit 图、branch ref、`headRevision` CAS、存储布局与每分支基线迁移，
   并一并建立 `WorkingTreeActivationState`（见「状态归属」）
3. [US-306 阶段 A](../stories/collaboration/US-306-working-tree-index.md) 完成全部写入口的持久工作树捕获。
   它只用 US-305 提供的 activation state 做**写路径 token 校验**，不实现 switch 语义；凡需要真正切换分支才能观察的
   断言一律留给 US-308，阶段 A 用持久层重放断言等价覆盖
4. [US-306 阶段 B](../stories/collaboration/US-306-working-tree-index.md) 在其上实现 index、关系依赖闭包、revision CAS、status/diff/stage/commit
5. [US-306 阶段 C](../stories/collaboration/US-306-working-tree-index.md) 依赖 US-306 阶段 B，交付
   `useWorkingTree()` 的三端契约、扩展点协议与 `bench-working-tree` target 本身
6. [US-307](../stories/collaboration/US-307-restore-session.md) 与 [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md)
   依赖 US-306 阶段 B，两者之间互相独立可并行。但它们**不能整体与 US-306 阶段 C 并行**：US-307 的 `restore` / `restoreState`、
   US-308 的分支切换与冲突提示都按 US-306 阶段 C 冻结的扩展点协议追加键；US-307 的 FR-026b 还要向 US-306 阶段 C 拥有的
   bench target 追加 restore 采样场景（**benchmark 追加只涉及 US-307，US-308 没有 benchmark 交付项**）。
   因此二者的**核心持久层语义可与 US-306 阶段 C 并行开工，三框架入口必须排在 US-306 阶段 C 之后；
   US-307 的 benchmark 追加同样排在其后**

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-305 提交图与 HEAD 持久化](../stories/collaboration/US-305-commit-graph-head.md) (High)
- [US-306 工作树、暂存区与提交操作](../stories/collaboration/US-306-working-tree-index.md) (High) — 单文件三阶段：
  - 阶段 A 工作树写入捕获与持久化
  - 阶段 B 暂存区与提交状态机
  - 阶段 C 三框架工作树交互面与性能门禁
- [US-307 历史恢复会话](../stories/collaboration/US-307-restore-session.md) (Medium)
- [US-308 分支隔离与跨 realm 冲突检测](../stories/collaboration/US-308-branch-isolation-conflict.md) (Medium)

## 性能预算的口径

原 FR-026 写「status/diff/stage 用户可见响应 100 ms 内、恢复最近 commit 1 s 内，覆盖 10,000 条实体 / 100 个 commit」。这三个数字当前**不可验收**：没有指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、没有定义"用户可见响应"是 promise resolve 还是首次绘制、没有统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。

仓库已有 `WARMUP = 5`、定量采样、p50/p95 和 JSON 报告的组织方式，可以复用报告结构；但
`non-encrypted-hot-path.bench.ts` 的 2% 是同一进程内 plain / encryption 对照，`encryption.bench.ts` 只归档报告，
都不能直接证明跨提交的 working-tree 性能可接受。本 Epic 采用双门禁：

- 新增 `pnpm nx run benchmarks:bench-working-tree`，输出格式与 `benchmarks/reports/` 一致
- 固定基准环境为 Node + PGlite memory；API promise resolve 定义为操作完成，不把 React/Angular/Vue 首次绘制混入核心 benchmark
- 固定 `WARMUP = 5`、`SAMPLES = 50`。每个 sample 前在计时外恢复同一 fixture：10,000 条实体、100 个 commit，
  每个 commit 100 个完整变更单元；当前工作树 100 个 unstaged 单元、index 50 个 staged 单元
- status 测完整摘要，diff 测无 scope 的完整 `HEAD ↔ working tree` 与 `HEAD ↔ index`，stage 测 50 个完整变更单元；
  restore 测 clean HEAD 恢复含 100 个变更单元的 `HEAD~1`。fixture 内容与 hash 必须写入 JSON，禁止只固定总行数
- benchmark JSON 必须记录 Node/PGlite 版本、OS、CPU 型号、逻辑核数、内存、runner ID 与并发度并计算
  `runnerProfileHash`；profile 不匹配 reference 时返回 `benchmark_environment_mismatch`，不得把它伪装成性能回归
- 普通 PR CI 只把归一化 ratio 作为硬门禁，绝对 p95 仅记录趋势；发布门禁必须在与 reference
  `runnerProfileHash` 相同的固定性能 runner 上执行，届时绝对预算才作为硬门禁：status / diff / stage 不高于 100 ms，
  restore 不高于 1 s
- 每项 control CRUD 使用相同实体数量和事务边界；相对门禁比较“被测操作 p95 / 同次 control CRUD p95”。
  首个绿色实现先归档 reference commit 的 10 次独立运行并冻结各项 median ratio，候选版本不得超过该 ratio 的 110%；
  reference JSON 与阈值必须先于发布候选签入，不能在失败后重算基线
- 浏览器 OPFS / IDB 不承诺相同绝对数字，但三端 E2E 必须记录首次可见状态耗时，防止核心 promise 很快而 UI 长时间无反馈

具体归属：status / diff / stage 的预算在 US-306 阶段 C，restore 的预算在 US-307。

## 发布门禁

1. [migration-release.json](../migration-release.json) 的 `bridge.tag` 指向一个满足
   `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的真实 tag，且不是 `v0.0.25`
2. US-305 / US-306（阶段 A / B / C 全部关闭）/ US-307 / US-308 全部 Done；US-306 的
   [交付阶段与边界表](../stories/collaboration/US-306-working-tree-index.md#交付阶段与边界) 逐条有归属且对应阶段已关闭，
   US-306 阶段 C / US-307 / US-308 的三框架对称与 a11y 条件满足
3. 崩溃与刷新恢复 fixture 全绿：不出现半个 commit、半个事务或半成品 index
4. 上述 6 个 v1 后端的 `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite` 双双全绿
   （Tauri Rust host 不计入 v1 门禁，见「启用与存储边界」）
5. 跨 realm fixture 覆盖 switch 与旧实体 CRUD 竞争、启用/未启用 writer 混用、HEAD/index/working-tree CAS
6. 支持字段加密的后端通过 commit/index/working-tree/restore 持久化 dump 明文哨兵零命中
7. `pnpm nx run benchmarks:bench-working-tree` 在普通 CI 通过冻结的归一化相对回归门禁，并在 profile 匹配的固定性能
   runner 上同时通过绝对 p95；环境不匹配不得产出绿色发布结论
8. api-baseline 新增导出全部使用 `Commit*` / `WorkingTree*` / `Index*` 前缀，无 `Workspace*` 新导出，也不复用既有 `SwitchBranchOptions`
9. 公开文档说明数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、
   加密边界与不改写历史的承诺。**该交付项归 [US-306 阶段 C](../stories/collaboration/US-306-working-tree-index.md)**，
   随 `useWorkingTree()` 的公开契约一并交付，不是无主的发布前补丁
10. 写入口 conformance 覆盖普通 CRUD、merge、undo/redo、full/filter pull/autoSync/repository sync/bulkSync、
    `cleanupExpired()` 过期删除、QueryCache 排除与 raw bypass 拒绝；任何业务表净变化都能由
    HEAD + WorkingTreeEntry 重放。意图标记登记表与代码实际调用点一致——存在未登记的
    `adapter.switchBranch` / `mergeChanges(disableTriggers)` 调用点即门禁失败
11. index 依赖闭包、active 分支基数、metadata-only 远端分支首次物化和完整 restore 路径预检 fixture 全绿

## 与既有 Epic 的边界

| 相邻 Epic                                                  | 边界                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [epic-007 公开 API 门禁](./epic-007-public-api-gates.md)   | 发布门禁 8（`Commit*` / `WorkingTree*` / `Index*` 前缀、无 `Workspace*` 新导出）与横切约束 4（不复活旧导出）**只约束本 Epic 新增的导出**，是新功能自带的命名约束；**不扩大 epic-007 的门禁覆盖面范围**，也不改动其既有检查项与阈值 |
| [epic-004 桌面与适配器](./epic-004-future-features.md)     | 本 Epic 只**消费** adapter 的事务与 trigger 能力并声明 v1 支持矩阵；host 本身的正确性、打包与 flake 收敛归 US-207 / US-210，矩阵变动按「启用与存储边界」的宿主能力判据重新裁决                                                     |
| [epic-008 生命周期与作用域](./epic-008-lifecycle-scope.md) | 已由 epic-008 单方面声明；本 Epic 不引入新的 scope 原语，工作树状态的持有与释放沿用其结论                                                                                                                                          |

## 非目标

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 字段级或代码行级的部分暂存
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为（见 US-308）
