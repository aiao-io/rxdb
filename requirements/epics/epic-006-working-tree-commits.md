---
id: epic-006-working-tree-commits
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 本地工作树与提交历史

## 愿景

把 RxDB 的本地变更组织成 Git 式工作流：用户刷新页面、重启应用或意外关闭后，工作树、当前提交和历史恢复结果仍然存在且语义一致，且不引入 Git 的远程仓库、权限与代码评审。

**v1 不做暂存区（2026-08-22 裁决）。** 隔离一条工作线用**分支**——要就 `mergeBranch()`，不要就 `removeBranch()`；
`commit(message)` 把 HEAD 之后的**全部**工作树变更打成一个提交点，不提供「只提交其中一部分」。
理由与代价见「非目标」的对应条目，那里是唯一可以改这个结论的地方。

## 为什么是 Epic 而不是一个 Story

拆分前的 US-305（**历史快照，以 git 历史为准；当前文件已是拆分后的形态**）单个故事持有 4 个用户故事、28 条 FR、7 个关键实体，横跨 `packages/rxdb/src/version/`、`packages/rxdb/src/system/`、`rxdb-plugin-workspace`、三个框架包和三个 demo。它的 INVEST 里 `Small` 打了勾，但没有任何一条 FR 可以在不落地存储布局的前提下单独验收——即"要么全做要么全不做"，这正是 Small 不成立的定义。拆分后的 [US-306](../stories/collaboration/US-306-working-tree-commits.md) 仍同时覆盖全部写入口、提交状态机、三框架和 benchmark，因此在文件内再切成「交付阶段 A/B/C」。现在每个阶段都能独立跑通「写入 → 刷新 → 读回」这条最小闭环。

## 目标

用户视角的最终能力，每条标注归属故事；**没有归属的条目就是本 Epic 的缺口**，不得靠"发布前统一补"消化。

- [ ] 提交历史与 HEAD 在刷新、重启、崩溃后完整可查（[US-305](../stories/collaboration/US-305-commit-graph-head.md)）
- [ ] 已在用的数据库能一次性、可重试地打开 commit 能力而不丢数据（[US-305](../stories/collaboration/US-305-commit-graph-head.md)）
- [ ] 任何入口写入的业务变更都被工作树捕获，刷新后可仅凭 HEAD + 工作树重放（[US-306 阶段 A](../stories/collaboration/US-306-working-tree-commits.md)）
- [ ] 用户能查看 status/diff 并把当前工作树的全部变更带消息提交成一个提交点（[US-306 阶段 B](../stories/collaboration/US-306-working-tree-commits.md)）
- [ ] Angular / React / Vue 三端以对称 API 完成上述操作，且 UI 达到 WCAG 2.1 AA（[US-306 阶段 C](../stories/collaboration/US-306-working-tree-commits.md)）
- [ ] 用户能把数据恢复到任意可达 commit，且不改写历史、不移动 HEAD（[US-307](../stories/collaboration/US-307-restore-session.md)）
- [ ] 每个分支拥有独立的 HEAD 与工作树，跨标签页并发不静默覆盖（[US-308](../stories/collaboration/US-308-branch-isolation-conflict.md)）
- [ ] 公开文档讲清启用方式、工作树与草稿缓存的区别、恢复语义、历史保留旧值的风险、加密边界、
      不改写历史的承诺，并明示远端同步会产生 `origin=remote_sync` 的未提交变化
      （[US-306 阶段 C](../stories/collaboration/US-306-working-tree-commits.md)，对应发布门禁 9）
- [ ] status / diff / commit / restore 的性能可被冻结基准复核，环境不匹配时不产出绿色发布结论
      （[US-306 阶段 C](../stories/collaboration/US-306-working-tree-commits.md) 与 [US-307](../stories/collaboration/US-307-restore-session.md)，
      对应发布门禁 7 与「性能预算的口径」）

## 术语（与既有 Workspace 插件的命名冲突处置）

`Workspace` 前缀**已经被占用**：`@aiao/rxdb-plugin-workspace` 的 NEW 草稿缓存在 api-baseline 中导出了 `WorkspaceCacheEntry`、`WorkspaceCacheId`、`WorkspaceCorruptedEntry`、`WorkspaceFlushError`（见 [rxdb-plugin-workspace.json](../api-baseline/rxdb-plugin-workspace.json)）。原 US-305 又把 Git working tree 也叫 workspace，并计划导出 `WorkspaceState` / `WorkspaceConflict`——同一个前缀、两个毫不相干的概念。原 FR-028 只禁止了「与已删除导出同名同签名」，没禁止「同前缀不同义」，而后者才是真正会让读者读错代码的部分。

本 Epic 定死：

| 概念               | 中文     | 导出前缀       | 归属                               |
| ------------------ | -------- | -------------- | ---------------------------------- |
| Git working tree   | 工作树   | `WorkingTree*` | 本 Epic 新契约                     |
| commit / commit 图 | 提交     | `Commit*`      | 本 Epic 新契约                     |
| NEW 草稿本地缓存   | 草稿缓存 | `Workspace*`   | 既有 `@aiao/rxdb-plugin-workspace` |

新契约里**不得**出现 `Workspace` 前缀的新导出；文档与 story 正文中"工作区"一词只指草稿缓存。
需要指代**文件系统上的本地工作目录**（如 `dist/`、git working copy）时固定写"本地工作副本"，
不复用"工作区"，也不与 Git 语义的"工作树"混用。引用历史原文时保留原字并加译注，不改引文。

### 三层分层对照（读本 Epic 前必须先对齐）

上表解决的是**前缀撞车**，但真正会让人反复读错的是**分层撞车**：Git 的 working directory 不是
「编辑器里还没保存的内容」，而是「磁盘上编译器真的能读到的内容」。在编辑器里改了没按 Ctrl+S，
`git status` 看不见它——git 只看磁盘。

对照到 RxDB，「查询真的能读到的内容」是**主库业务表**，因为 `db.find()` 读的是它；
`@aiao/rxdb-plugin-workspace` 的 IndexedDB 草稿对应的是**编辑器未保存 buffer**，Git 从来不管这一层。
因此本 Epic 的分层是：

| Git 概念            | 对照物               | 存放位置             | 归属                               |
| ------------------- | -------------------- | -------------------- | ---------------------------------- |
| 编辑器未保存 buffer | 草稿缓存（NEW 草稿） | 插件独立 IndexedDB   | 既有 `@aiao/rxdb-plugin-workspace` |
| working directory   | 工作树               | **主库业务表当前值** | 本 Epic `WorkingTree*`             |
| commit              | 提交                 | 主库 commit 图       | 本 Epic `Commit*`                  |
| `.gitignore`        | 未版本化实体域       | —                    | 见「版本化域」                     |

**Git 的 index 这一层本 Epic 没有对照物**——它是被显式裁掉的，不是遗漏，见「非目标」。
隔离一条工作线用分支：`createBranch()` → 改 → `mergeBranch()` 或 `removeBranch()`。

把草稿缓存当成工作树会同时踩三个坑，因此**草稿缓存与工作树不能合并成一层**：

1. **查询语义会反过来**。工作树若在 IndexedDB，`db.find()` 读到的就是 HEAD，等于「编辑器里改了文件，
   但编译器读的还是上次 commit 的版本」——与 Git 心智完全相反
2. **草稿层表达不了 modified / deleted**。插件范围是**只覆盖 NEW 草稿**，已存在实体的未保存 UPDATE、
   回滚到编辑前状态与 DELETE 撤销都不在其内；而工作树必须能表达这三种。要在 IndexedDB 层补齐，
   等于在主库之外重造一个带外键与关系查询的事务型数据库
3. **跨不了事务边界**。IndexedDB 与 SQL 主库是两个独立一致性边界，无法在同一事务内原子提交；
   工作树条目必须与业务 CRUD 同事务写入，否则崩溃会留下「业务数据变了但工作树没记」的半状态

由此得到一条贯穿全文的口径：**`entity.save()` 等价于 Ctrl+S，不等价于 commit。**
`save()` 让变更进入工作树并对全部查询立即可见，commit 只是给这一刻打点存档；
「未提交的东西不生效」不是本 Epic 的语义，见「非目标」。

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
| branch materialization stage | database + attempt       | 目标分支、冻结远端水位、scope manifest、分页 payload、fingerprint         | 只落盘目标分支快照，不写当前业务投影；成功 switch 后删除    |

### 状态归属（哪个故事负责建表）

状态表本身的创建/迁移与使用它的语义分属不同故事，避免出现「后置故事建表、前置故事使用」的倒挂：

| 状态                                    | 建表与首次迁移    | 语义与 CAS 归属                                                            |
| --------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `CommitCapabilityState`                 | US-305            | US-305                                                                     |
| `CommitBranchRef`                       | US-305            | US-305（head CAS）、US-308（分支生命周期）                                 |
| `WorkingTreeActivationState`            | **US-305**        | US-306 阶段 A（写路径 token 校验）、US-308（switch CAS 与 `requireClean`） |
| `WorkingTreeState` / `WorkingTreeEntry` | US-306 阶段 A     | US-306 阶段 A                                                              |
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

`WorkingTreeEntry` 在本 Epic 层面是**逻辑契约**，本表只约束它必须持久化什么、按什么粒度隔离。
**物理落法已由 plan 阶段行使并冻结**：见 [data-model.md](../../specs/001-working-tree-commits/data-model.md)
（`RxDBWorkingTreeEntry` → `rxdb_working_tree_entry`，共 11 张新表）。物理表名、字段、索引、FK、加密 envelope
与迁移版本以该文件为唯一真相源，本节不再保留「复用 `RxDBChange` 或派生表」的选择空间；要改回复用，
必须先回改 data-model、adapter contract 与迁移，不能只改本节。
但 `WorkingTreeState` 只存计数和 revision 不算完成：必须有可枚举、可重放、按分支隔离的未提交变更单元。
`CommitChangeSet` 必须复制完整的不可变恢复数据，不能只引用可能被 undo、清理或删分支删除的
`RxDBChange` 行。

### commit 取整棵工作树（无暂存区的直接推论）

`commit(message, options)` 提交的是**当前分支工作树的全部未提交变更单元**，没有子集选择。
由此**不存在**依赖闭包问题：整棵工作树天然自包含——它就是从 HEAD 一路写到现在的完整序列，
按 `sequence` 重放必然可应用。Git 需要闭包式的 `git add` 语义是因为它只有一个工作目录且文件间没有引用完整性；
关系模型里选择性提交要算外键闭包，成本恰好最高，而分支把同一件事做得更便宜。

三条随之消失的复杂度，登记在此以免日后被当成遗漏补回来：

- **依赖闭包与 `index_dependency_cycle`**：无子集选择即无闭包，无闭包即无环
- **commit 后的 residual rebase**：commit 取走全部，工作树随之清空并以新 HEAD 为基线，没有「未暂存残量」
- **staged snapshot 冻结**：不需要在 stage 时刻冻结内容再与后续编辑分叉

**代价（已知并接受）**：commit 采用调用方捕获型 `workingTreeRevision` CAS，因此另一个 Tab 在你
读到 status 之后、commit 之前的任何一次 `save()` 都会让本次 commit 失败并返回 `CommitConflict`。
这是刻意的：没有暂存区就没有冻结快照，不校验就等于把用户没看过的变更也提交进去。
失败可由刷新后重试恢复，不产生持久 conflicted 状态。

跨 realm 正确性由数据库事务内的 `headRevision` / `workingTreeRevision` 条件更新保证。
revision CAS 是领域数据完整性，不是跨 realm 协调协议；本 Epic 不引入 writer lease 或迁移 epoch fencing。

每个 realm 在读取/实例化实体时捕获 `{ branchId, activationRevision }`。普通 CRUD、commit、restore、
discard 与分支操作都必须在实际写事务内验证该 token；另一个 realm 已切换分支时，旧 token 的写入返回稳定的
`stale_active_branch`，不得把旧分支实体写进新分支。`BroadcastChannel`、响应式通知和内存缓存只能用于刷新 UI，
不能承担该正确性。

分支切换时恢复目标分支自己的 `HEAD + WorkingTreeEntry`；只有目标分支没有未提交条目时，才只物化
目标 HEAD。物化投影本身不改变目标分支的逻辑工作树，因此只递增 `activationRevision`，不得平白递增
`workingTreeRevision`。不得把“切到分支”实现成无条件 reset 到 HEAD。

### revision 校验矩阵

revision 校验分两类，**不可混为一谈**：

- **调用方捕获型**：调用方在事务开始前读到某个 revision，事务内以它做条件更新，失败即冲突。适用于
  commit、restore、discard、switch branch——它们都由用户显式发起，且失败后用户可以刷新重试。
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
| commit                    | active branch token、expected head + working-tree revision             | head、working-tree revision                   |
| restore                   | active branch token、expected head + working-tree revision             | working-tree revision                         |
| discard                   | active branch token、expected head + working-tree revision             | working-tree revision                         |
| switch branch             | expected activation revision、来源/目标分支状态或物化快照              | activation revision                           |
| create branch             | active branch token、来源 head + working-tree revision                 | 新 ref/state 从 revision 0 开始；来源状态不变 |
| remove branch             | expected activation revision、目标 ref/state revision、非 active       | 原子删除目标可变状态；revision 不复用         |

commit 成功后工作树清空并以新 HEAD 为基线，不存在需要 rebase 的残量。
**commit 会因并发编辑而失败**：它捕获 `workingTreeRevision`，另一个 Tab 的 `save()` 推进该值即返回
`CommitConflict`——见上方「commit 取整棵工作树」对这一代价的说明。任何语义 no-op 都不递增 revision。

`CommitConflict` 是一次失败命令的类型化诊断值，不是持久状态。普通 commit/switch CAS 失败只返回该值，
不得把 `status()` 永久标成 conflicted；刷新后状态按最新持久 revision 重建。`status().conflicted` 只允许由仍存在的
durable domain session 派生，v1 唯一来源是 `WorkingTreeRestoreSession` 的 expected revision 与当前 revision 不一致。
`requireClean` 同样只检查这种可重建冲突，不得把历史上发生过的一次 CAS 失败当成未解决状态。

### 版本化域（tracked / untracked）

「一切都是 entity，就像 Git 的文件」是本 Epic 的出发点，但它需要一个 `.gitignore` 的对照物：**不是每个
被写进数据库的字节都进版本控制**。这些排除当前散在下面的写入口矩阵里，只能从个别行反推；本节把它提成
一条正面规则——新增实体类型或新增字段时按此归类，不靠读矩阵猜。

**tracked（版本化实体）**：参与 baseline、status、diff、commit 与 restore 的业务实体。
判据是「它的净变化必须能由 HEAD + `WorkingTreeEntry` 重放」（发布门禁 10）。**默认全部实体都是 tracked。**

**untracked（未版本化）**：只允许以下两类，**新增第三类必须先改本节**，不得直接在写入口矩阵里加行：

| untracked 对象                            | 为什么不进版本控制                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| QueryCache 同步类型的实体                 | 可从远端重建的缓存，不是用户编辑的结果；混进 commit 会让一次缓存刷新把工作树永久标成 dirty |
| 实体行上的 `remoteId`、同步水位、审计时间 | 同步机制自身的簿记字段，不表达用户意图；回填它们是对实体行的 UPDATE，但不构成业务净变化    |

草稿缓存不在本表内——它**根本没进主库**，属于上一节四层对照里的 buffer 层，不需要 untracked 豁免。

两条不变量：

- untracked 与 tracked **不得混进同一个事务单元**。callback transaction 检测到混用时以
  `mixed_versioned_cache_transaction` 终止并回滚整个事务
- untracked 的判定是**按实体类型或字段**的静态属性，不按调用方、意图或时机。同一个实体不得在一条写入口上
  tracked、在另一条上 untracked——那会让「任何业务表净变化都能重放」在个别路径上悄悄失效，
  而这正是发布门禁 10 想挡住的事

远端来源（`origin=remote_sync`）**不是** untracked 的一种：它是 tracked 实体的一次净变化，只是作者不是本地用户，
见「工作树包含远端来源的净变化」。

### 写入口语义矩阵

`HEAD + WorkingTreeEntry` 要成为真相源，不能只拦截 Repository 的普通 CRUD。所有会改业务实体表的入口必须在
同一数据库事务内落入下表之一；未知入口默认拒绝，不能先改业务表再靠事件补记。

| 写入口                                                                    | commit 能力启用后的语义                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通 CRUD、显式事务、Workspace 草稿 `save()`                              | 写入/合并本地 `WorkingTreeEntry`，来源为 `local`，递增 working-tree revision                                                                                                                                                                                                                                                                          |
| `mergeBranch()`、undo/redo、restore/discard                               | 按各自原子边界写入或重算本地工作树；不得绕过 active token 与 revision CAS                                                                                                                                                                                                                                                                             |
| `pull()`、autoSync、`pullRepository()`、`sync()`、`bulkSync()` 的实体应用 | 即使为防回推而关闭 `RxDBChange` trigger，也必须写入来源为 `remote_sync` 的工作树单元；不生成可 push 的本地 change。冲突裁决（`KEEP_LOCAL` / `KEEP_REMOTE` / 无净变化）对工作树与缓存区的影响见 [data-model §4.4](../../specs/001-working-tree-commits/data-model.md#44-远端冲突裁决--工作树净差重算已裁决)                                            |
| 只更新 remoteId、同步水位或审计时间                                       | **不构成业务实体净变化**（remoteId 回填本身是对实体行的 UPDATE），不创建工作树单元，不递增 working-tree revision                                                                                                                                                                                                                                      |
| `VersionManager.cleanupExpired()` 的过期删除                              | 与 `pull` 同类：写入来源为 `remote_sync` 的 DELETE 工作树单元，递增 working-tree revision；不生成可 push 的本地 change                                                                                                                                                                                                                                |
| branch switch、baseline/restore 物化、commit 后的工作树清空               | 由对应领域操作显式维护工作树；底层投影重写不得被 trigger 二次记录                                                                                                                                                                                                                                                                                     |
| metadata-only 目标分支的远端预取                                          | 只写 branch materialization staging 与独立水位，不得更新当前分支 `RxDBSync` 或业务表                                                                                                                                                                                                                                                                  |
| QueryCache 的 upsert/delete（orphan 当前**只计数不删除**，见下注）        | QueryCache 实体不进入 baseline、status、diff 或 commit；它仍是可重建缓存，不能与版本化实体混在同一事务单元中                                                                                                                                                                                                                                          |
| raw SQL、adapter 直写或其他 trigger bypass                                | 业务表写入前以 `commit_capability_mismatch` 拒绝；只有同时持有内部事务能力并原子维护工作树的受信路径可以关闭 trigger。判定机制（**按目标表**判定 + 受信 intent 豁免，非「rawQuery 整体只读」）与其能力边界见 [adapter-contract §4.6](../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决) |
| `upsertMany()` / `deleteByIds()` 等 adapter 公开批量写方法                | 与上一行同判定：目标是版本化业务实体表即拒绝，目标是 QueryCache 实体表即放行。**这两个方法不经 `rawQuery`**，US-306 阶段 A 必须显式把门禁挂到它们上，见下注                                                                                                                                                                                           |

**`upsertMany` / `deleteByIds` 是门禁的结构性缺口，阶段 A 必须显式补上。** [adapter-contract §4.6](../../specs/001-working-tree-commits/contracts/adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决)
的五步判定只覆盖 `rawQuery`，并声明「绕过 adapter 的外部数据库句柄不在 v1 承诺内」。但
[`upsertMany`](../../packages/rxdb/src/rxdb-adapter.ts) 是 `RxDBAdapterLocalBase` 上的**公开抽象写方法**，
既不是 `rawQuery` 也不是外部句柄——它落在那条能力边界声明的空隙里：实现走
`transaction(executor => executor.query(...))`（见 [RxDBAdapterPGlite.ts](../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)），
门禁结构上够不到。今天唯一的调用方 `QueryCacheRepository` 只写 QueryCache 实体，按 §4.6 第 5 步本来就该放行，
所以缺口暂时不可见；但方法签名 `upsertMany(entityName, data)` 不带意图，**任何调用方传一个 Full/Filter 实体名
就能写版本化业务表且不产生工作树单元、也不被任何门禁拦下**，直接违反 INV-4 与发布门禁 10。
阶段 A 的判定必须按 `entityName` 解析出的 `sync.type` 走**同一份**版本化实体表清单（§4.6 明令不得另建第二份），
而不是给这两个方法单独写一套。**这条不影响 §4.6 的裁决结论，只是把它的覆盖面补到裁决本来就想覆盖的范围。**

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
变成噪音源。符号取**实际发起该次批量重写的最内层具名函数**，不是把调用委托出去的公开门面方法——门面方法
本身不出现在扫描结果里，用它当键会让漂移门禁永远匹配不上。下表按符号登记，与代码实际调用点一一对应：

| 登记键（文件 + 符号 + 意图）                                                                                             | 传输层                          | 本表归属                                |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------------- |
| [VersionManager.ts](../../packages/rxdb/src/version/VersionManager.ts) · `switchBranch` · 分支物化                       | `adapter.switchBranch`          | 受信物化：**不**产生工作树单元          |
| [restore-entity.ts](../../packages/rxdb/src/version/restore-entity.ts) · `restore_entity` · 单条 change 恢复             | `adapter.switchBranch`          | restore：**必须**产生                   |
| [HistoryManager.ts](../../packages/rxdb/src/version/HistoryManager.ts) · `invalidateRedoStack` · 失效 redo 栈            | `adapter.switchBranch`          | 只写 `redoInvalidatedAt` 元数据：不产生 |
| [HistoryManager.ts](../../packages/rxdb/src/version/HistoryManager.ts) · `#apply_undo_redo_histories` · undo/redo 应用   | `adapter.switchBranch`          | undo/redo：**必须**产生                 |
| [merge-branch.ts](../../packages/rxdb/src/version/merge-branch.ts) · `merge_branch` · per-change `executor.mergeChanges` | `mergeChanges`（trigger 开启）  | mergeBranch：必须产生                   |
| [merge-branch.ts](../../packages/rxdb/src/version/merge-branch.ts) · `merge_branch` · squash `adapter.mergeChanges`      | `mergeChanges`（trigger 开启）  | mergeBranch：必须产生                   |
| [pull-batch.ts](../../packages/rxdb/src/version/pull-batch.ts) · `pullBatchOnce` · 远端分批应用                          | `mergeChanges(disableTriggers)` | remote apply：`origin=remote_sync`      |
| [pull-repository.ts](../../packages/rxdb/src/version/pull-repository.ts) · `pullSingleRepository` · 远端仓库应用         | `mergeChanges(disableTriggers)` | remote apply：`origin=remote_sync`      |
| [cleanup-expired.ts](../../packages/rxdb/src/version/cleanup-expired.ts) · `cleanupExpired` · 过期删除                   | `mergeChanges(disableTriggers)` | 过期删除：`origin=remote_sync`          |

`merge-branch.ts` **两个策略分支各是一个独立调用点**（per-change 走 `executor`、squash 走 `adapter`），
必须各占一行；只登记其中一个会让漂移测试在落地当天就红。同理 `pull-batch.ts` 与 `pull-repository.ts`
是两个不同文件里的两个独立调用点，不得合并成一行。

**restore 那一行的文件是 `restore-entity.ts` 而不是 `VersionManager.ts`**：`VersionManager.restoreEntity()`
只是把调用委托给 `restore_entity()`，真正的 `adapter.switchBranch` 发生在后者。这正是上面「符号取最内层
具名函数」那条规则要防的错误——按门面方法登记会让漂移扫描报「登记了但不存在」。

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
- SQL/PGlite 主库是 commit 与工作树元数据的唯一一致性边界。
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
  - `workingTreeCaptureConformanceSuite` —— 归 [US-306 阶段 A](../stories/collaboration/US-306-working-tree-commits.md)，
    覆盖写入口捕获、事务原子性与工作树重放
  - `workingTreeCommitConformanceSuite` —— 归 [US-306 阶段 B](../stories/collaboration/US-306-working-tree-commits.md)，
    覆盖 head/working-tree revision CAS、commit 后的工作树清空与崩溃恢复
  - US-305 的 commit 图/迁移断言并入 `workingTreeCommitConformanceSuite`，由 US-306 阶段 B 收口整套；US-305 自身先落地
    commit 图部分的用例，不另起第三个套件名

## 横切约束（按故事适用，不单独成故事）

拆分前的 US-305 把三框架对称、a11y、异步状态和禁止复活旧导出各写成一条 FR，读起来像"最后统一补"。
其中只有异步状态保留了编号（FR-023，已迁入 [US-306](../stories/collaboration/US-306-working-tree-commits.md)）；
**三框架对称、a11y、禁止复活旧导出的原编号 FR-024 / FR-025 / FR-028 一律作废**，不在任何故事中承接，
也不得被新条目复用——它们已整体转为下列横切约束，按故事适用：

1. **三框架对称**：US-306 阶段 C、US-307、US-308 的用户操作面必须在 Angular / React / Vue 提供语义对称的 API；US-305 与 US-306 阶段 A/B 是无 UI 的核心底座，只要求核心公开类型、TSDoc 和类型契约测试。
2. **异步状态**：命令暴露 loading / success / error，查询在无结果时额外暴露 empty；错误说明操作、对象与恢复建议，不给无 empty 语义的命令伪造 empty 状态。
3. **可访问性**：US-306 阶段 C、US-307、US-308 的 UI 键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；US-305 与 US-306 阶段 A/B 不适用 UI a11y。
4. **不复活旧导出**：`stagedChange()`、`unstageChange()`、`commit()`、`stagedCount`、`WorkspaceCacheEntry.staged` 在可复核的 `v0.0.24` 公开表面中已不存在；新导出不得与它们同名同签名，也不得使用 `Workspace` 前缀（见上表）。
5. **加密不降级**：支持后端叠加字段加密时，commit、working-tree、restore session 中的加密字段仍以
   versioned envelope 落盘；错误、摘要和 benchmark 报告不得带明文。历史保留风险提示不能代替 at-rest 加密。

## 依赖顺序

1. 当前发布主线先产生新的非迁移 bridge tag；历史 `v0.0.25` 不在当前 ancestry，不能供下一步引用。
   [migration-release.json](../migration-release.json) 的 `bridge.tag` / `bridge.version` 仍为 `null`，
   而 `release.version` 仍写着已脱链的 `0.0.25`。

   **这一步是排在 US-305 之前的独立发布事项，不是 US-305 的交付物**（见
   [plan.md](../../specs/001-working-tree-commits/plan.md) 交付顺序的阶段 0 与
   [release-plan](../release-plan.md) 的四段顺序）。理由是发布门禁本身：bridge 版本**不得抬升系统版本常量**，
   而 US-305 的范围含「已有数据库的一次性初始化」，必然是 `kind=migration`；把 bridge 塞进 US-305
   会让 migration 依赖一个尚不存在的 bridge tag，形成自我死锁。桥接锚点必须由一条**不动
   `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 的纯功能/适配器路径**先行落成并打 tag。

   US-305 在此只承接**门禁侧**（FR-030 + AC US2-14）：读取 manifest、校验 `bridge.tag` 是候选发布提交的
   真实祖先 tag、不满足时以门禁失败挡住迁移发布。manifest 的回填只能发生在真实 tag 产生之后，
   US-305 不得在「bridge 将会存在」的假设上开工

2. [US-305](../stories/collaboration/US-305-commit-graph-head.md) 建立 commit 图、branch ref、`headRevision` CAS、存储布局与每分支基线迁移，
   并一并建立 `WorkingTreeActivationState`（见「状态归属」）
3. [US-306 阶段 A](../stories/collaboration/US-306-working-tree-commits.md) 完成全部写入口的持久工作树捕获。
   它只用 US-305 提供的 activation state 做**写路径 token 校验**，不实现 switch 语义；凡需要真正切换分支才能观察的
   断言一律留给 US-308，阶段 A 用持久层重放断言等价覆盖
4. [US-306 阶段 B](../stories/collaboration/US-306-working-tree-commits.md) 在其上实现 revision CAS 与 status/diff/commit
   ——**没有暂存区，也没有随之而来的关系依赖闭包**，见「非目标」的对应裁决
5. [US-306 阶段 C](../stories/collaboration/US-306-working-tree-commits.md) 依赖 US-306 阶段 B，交付
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
- [US-306 工作树与提交操作](../stories/collaboration/US-306-working-tree-commits.md) (High) — 单文件三阶段：
  - 阶段 A 工作树写入捕获与持久化
  - 阶段 B 提交状态机（status / diff / commit / discard，无暂存区）
  - 阶段 C 三框架工作树交互面与性能门禁
- [US-307 历史恢复会话](../stories/collaboration/US-307-restore-session.md) (Medium)
- [US-308 分支隔离与跨 realm 冲突检测](../stories/collaboration/US-308-branch-isolation-conflict.md) (Medium)

## 性能预算的口径

原 FR-026 写「status/diff/commit 用户可见响应 100 ms 内、恢复最近 commit 1 s 内，覆盖 10,000 条实体 / 100 个 commit」。这三个数字当前**不可验收**：没有指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、没有定义"用户可见响应"是 promise resolve 还是首次绘制、没有统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。

仓库已有 `WARMUP = 5`、定量采样、p50/p95 和 JSON 报告的组织方式，可以复用报告结构；但
`non-encrypted-hot-path.bench.ts` 的 2% 是同一进程内 plain / encryption 对照，`encryption.bench.ts` 只归档报告，
都不能直接证明跨提交的 working-tree 性能可接受。本 Epic 采用双门禁：

- 新增 `pnpm nx run benchmarks:bench-working-tree`，输出格式与 `benchmarks/reports/` 一致
- 固定基准环境为 Node + PGlite memory；API promise resolve 定义为操作完成，不把 React/Angular/Vue 首次绘制混入核心 benchmark
- 固定 `WARMUP = 5`、`SAMPLES = 50`。每个 sample 前在计时外恢复同一 fixture：10,000 条实体、100 个 commit，
  每个 commit 100 个完整变更单元；当前工作树 100 个未提交单元
- status 测完整摘要，diff 测无 scope 的完整 `HEAD ↔ working tree`，commit 测把这 100 个单元一次提交；
  restore 测 clean HEAD 恢复含 100 个变更单元的 `HEAD~1`。fixture 内容与 hash 必须写入 JSON，禁止只固定总行数
- benchmark JSON 必须记录 Node/PGlite 版本、OS、CPU 型号、逻辑核数、内存、runner ID 与并发度并计算
  `runnerProfileHash`；profile 不匹配 reference 时返回 `benchmark_environment_mismatch`，不得把它伪装成性能回归
- 普通 PR CI 只把归一化 ratio 作为硬门禁，绝对 p95 仅记录趋势；发布门禁必须在与 reference
  `runnerProfileHash` 相同的固定性能 runner 上执行，届时绝对预算才作为硬门禁：status / diff 不高于 100 ms，
  restore 不高于 1 s。**commit 没有沿用原 stage 的 100 ms**——原数字是按「标记 50 个单元」的元数据写入定的，
  而 commit 要把 100 个单元整体落盘并清空工作树，量级不同；它的绝对预算由首个绿色实现的 reference 中位数冻结，
  与相对门禁同批签入，不在此凭空指定
- 每项 control CRUD 使用相同实体数量和事务边界；相对门禁比较“被测操作 p95 / 同次 control CRUD p95”。
  首个绿色实现先归档 reference commit 的 10 次独立运行并冻结各项 median ratio，候选版本不得超过该 ratio 的 110%；
  reference JSON 与阈值必须先于发布候选签入，不能在失败后重算基线
- 浏览器 OPFS / IDB 不承诺相同绝对数字，但三端 E2E 必须记录首次可见状态耗时，防止核心 promise 很快而 UI 长时间无反馈

具体归属：status / diff / commit 的预算在 US-306 阶段 C，restore 的预算在 US-307。

## 发布门禁

1. [migration-release.json](../migration-release.json) 的 `bridge.tag` 指向一个满足
   `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的真实 tag，且不是 `v0.0.25`
2. US-305 / US-306（阶段 A / B / C 全部关闭）/ US-307 / US-308 全部 Done；US-306 的
   [交付阶段与边界表](../stories/collaboration/US-306-working-tree-commits.md#交付阶段与边界) 逐条有归属且对应阶段已关闭，
   US-306 阶段 C / US-307 / US-308 的三框架对称与 a11y 条件满足
3. 崩溃与刷新恢复 fixture 全绿：不出现半个 commit、半个事务或半清空的工作树
4. 上述 6 个 v1 后端的 `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite` 双双全绿
   （Tauri Rust host 不计入 v1 门禁，见「启用与存储边界」）
5. 跨 realm fixture 覆盖 switch 与旧实体 CRUD 竞争、启用/未启用 writer 混用、HEAD/working-tree CAS，
   并**必须包含一条「另一个 Tab 在 status 与 commit 之间 `save()`」的用例**，断言返回 `CommitConflict`
   而非静默提交——这是砍掉暂存区后新增的失败面，见「commit 取整棵工作树」
6. 支持字段加密的后端通过 commit/working-tree/restore 持久化 dump 明文哨兵零命中
7. `pnpm nx run benchmarks:bench-working-tree` 在普通 CI 通过冻结的归一化相对回归门禁，并在 profile 匹配的固定性能
   runner 上同时通过绝对 p95；环境不匹配不得产出绿色发布结论
8. 命名门禁分两层，**正向前缀只约束核心共享契约**：
   - `@aiao/rxdb` 的 [api-baseline](../api-baseline/rxdb.json) 新增导出（共享类型、选项、错误码）全部使用
     `Commit*` / `WorkingTree*` 前缀（`Index*` 已随暂存区一同裁掉，**不得新增该前缀的导出**）
   - 三个框架包（`rxdb-angular` / `rxdb-react` / `rxdb-vue`）的 api-baseline 只适用**负向**规则：
     无 `Workspace*` 新导出、不复用既有 `SwitchBranchOptions`。框架侧运行时入口沿用仓库既有的 `use*` 约定
     （`useRxDB` / `useFind` / …），因此 `useWorkingTree()` 合规——**不得**用正向前缀规则去拦它，
     那会拦下本 Epic 自己的核心交付物
   - 两层都适用横切约束 4（不复活旧导出）
9. 公开文档说明**这 6 项**：数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、
   加密边界、不改写历史的承诺；并**明示远端同步会产生 `origin=remote_sync` 的未提交变化**
   （承接 [US-306 US4-AC8](../stories/collaboration/US-306-working-tree-commits.md)）。
   **该交付项归 [US-306 阶段 C](../stories/collaboration/US-306-working-tree-commits.md)**，
   随 `useWorkingTree()` 的公开契约一并交付，不是无主的发布前补丁
10. 写入口 conformance 覆盖普通 CRUD、merge、undo/redo、full/filter pull/autoSync/repository sync/bulkSync、
    `cleanupExpired()` 过期删除、QueryCache 排除与 raw bypass 拒绝；任何业务表净变化都能由
    HEAD + WorkingTreeEntry 重放。意图标记登记表与代码实际调用点一致——存在未登记的
    `adapter.switchBranch` / `mergeChanges(disableTriggers)` / `upsertMany` / `deleteByIds`
    调用点即门禁失败。后两个方法的登记项以**目标实体的 `sync.type`** 为准：QueryCache 实体登记为放行，
    版本化实体登记为拒绝；漂移扫描 MUST 能报出「调用 `upsertMany` 但目标实体不是 QueryCache」的新增调用点
11. active 分支基数、metadata-only 远端分支首次物化和完整 restore 路径预检 fixture 全绿

## 与既有 Epic 的边界

| 相邻 Epic                                                  | 边界                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [epic-007 公开 API 门禁](./epic-007-public-api-gates.md)   | 发布门禁 8（核心包正向前缀、框架包负向规则）与横切约束 4（不复活旧导出）**只约束本 Epic 新增的导出**，是新功能自带的命名约束；**不扩大 epic-007 的门禁覆盖面范围**，也不改动其既有检查项与阈值。bridge 血统门禁的接缝另见下方说明 |
| [epic-004 桌面与适配器](./epic-004-future-features.md)     | 本 Epic 只**消费** adapter 的事务与 trigger 能力并声明 v1 支持矩阵；host 本身的正确性、打包与 flake 收敛归 US-207 / US-210，矩阵变动按「启用与存储边界」的宿主能力判据重新裁决                                                    |
| [epic-008 生命周期与作用域](./epic-008-lifecycle-scope.md) | 已由 epic-008 单方面声明；本 Epic 不引入新的 scope 原语，工作树状态的持有与释放沿用其结论                                                                                                                                         |

### bridge 血统门禁的接缝（发布门禁 1）

同一道门禁的「逻辑实现」与「CI 接线」分属两个 Epic，边界必须按**交付物**而不只按覆盖面划：

- **门禁逻辑归 US-305**（FR-030 / AC US2-14）：读取 manifest、校验 `bridge.tag` 为真实祖先 tag、不满足即失败。
  它 MUST 在**发布流程**中可执行——这是发布门禁 1 的最低保证，不依赖 PR CI 是否接线
- **钩子接进 PR CI 归 epic-007**：`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`
  三个钩子「不只在打 tag 时跑」是 [epic-007 的目标](./epic-007-public-api-gates.md)且**当前尚无故事认领**，
  **不属本 Epic 交付范围**
- **两边都不得在对方未落地的假设上开工**：US-305 不得因「epic-007 将接进 PR CI」而省略发布流程侧的可执行门禁；
  epic-007 的认领故事也不得重复实现门禁逻辑，只做接线

## 非目标

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为（见 US-308）
- **未提交变更对查询不可见**的长事务 / 预览语义（已裁决）：`save()` 后数据立即对全部查询生效，
  commit 只是存档打点。「未提交的东西攒够了再一起生效」需要读时按 HEAD 过滤或影子表，是数量级的成本上升
  且会波及全部既有查询路径。它在 Git 里的对照物不是 commit，而是「在分支上工作」，应走分支而非 commit
- **detached HEAD、`checkout` 到历史 commit 与只读历史浏览**（已裁决）：v1 只提供 [US-307](../stories/collaboration/US-307-restore-session.md)
  的 **restore**——把旧版本内容作为**新的未提交变更**写回当前工作树，不移动 HEAD、不改写历史。
  「切过去看一眼再切回来」需要先解禁上面的「自动 stash / 跨分支携带脏工作树」，两条一起解才有意义，
  不在本 Epic 内夹带
- **暂存区（index / staging area）与任何形式的选择性提交**（已裁决）：v1 没有 stage / unstage，
  `commit(message)` 只能提交当前分支工作树的**全部**未提交变更，没有子集、没有字段级或行级部分暂存。
  隔离一条工作线的唯一手段是**分支**：`createBranch()` → 改 → 要就 `mergeBranch()`、不要就 `removeBranch()`。
  理由是 RxDB 已有的分支能力覆盖了绝大多数「先隔离再决定」的场景，而暂存区要额外背上
  依赖闭包与环检测、staged snapshot 冻结、commit 后的 residual rebase、`HEAD ↔ index` 第二条 diff 轴
  以及第三个 revision——这些复杂度全部为「一次只提交一部分」这一个能力服务，性价比不成立。
  **已知代价**：commit 因此对并发编辑敏感，另一个 Tab 在 status 与 commit 之间 `save()` 会让本次 commit
  返回 `CommitConflict`（见「commit 取整棵工作树」）。这条代价是被接受的，**不构成重新引入暂存区的理由**

> 上面三条是 2026-08-22 的显式裁决，不是遗漏。它们直接对应三个反复被提起的直觉——
> 「commit 应该像事务提交一样让一批变更一起生效」「应该能像 `git checkout` 一样切到历史版本」
> 和「应该能只提交改动的一部分」。本 Epic 的答案分别是「那是分支，不是 commit」
> 「那是 restore，不是 checkout」和「那是分支，不是暂存区」；
> 要改结论必须先改本节，不能靠在某条 story 里追加 AC 悄悄扩范围。
