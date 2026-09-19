# Feature Specification: 本地工作树与提交历史

**Feature Branch**: `next-0912`

**Created**: 2026-09-12

**Status**: Draft

**Input**: 重生成 [epic-006 本地工作树与提交历史](../../requirements/epics/epic-006-working-tree-commits.md) 的规格。这是对既有 `specs/001-working-tree-commits/` 的**就地重生成**：原目录按已作废的「工作树 → 缓存区 → 提交」三层写成，整体改写为 v1 的**无暂存区**模型。

> **权威来源**。本规格不自行发明结论，全部条目回溯到下列文件；两者冲突时以下列文件为准：
>
> - [epic-006 本地工作树与提交历史](../../requirements/epics/epic-006-working-tree-commits.md)
> - [US-305 提交图与 HEAD 持久化](../../requirements/stories/collaboration/US-305-commit-graph-head.md)
> - [US-306 工作树与提交操作](../../requirements/stories/collaboration/US-306-working-tree-commits.md)
> - [US-307 历史恢复会话](../../requirements/stories/collaboration/US-307-restore-session.md)
> - [US-308 分支隔离与跨 realm 冲突检测](../../requirements/stories/collaboration/US-308-branch-isolation-conflict.md)

## 核心能力

把 RxDB 的本地变更组织成 Git 式工作流：提交图与 HEAD 持久化、工作树捕获全部业务写入口、status / diff / commit、历史恢复（restore）、分支隔离与跨 realm 冲突检测；刷新、重启与崩溃后语义一致。不引入远程仓库、权限与代码评审。

### v1 硬裁决（不得被稀释）

这六条是 epic-006 的显式裁决，不是遗漏。**要改结论必须先改 epic-006「非目标」一节**，不得靠在本规格或某条 story 里追加条目悄悄扩范围。

1. **没有暂存区（index / staging area）**，没有 stage / unstage / 部分提交。`commit(message)` 恒提交当前分支工作树的**全部**未提交变更单元，**没有 selection 入参**。隔离一条工作线的唯一手段是分支：`createBranch()` → 改 → `mergeBranch()` 或 `removeBranch()`。
2. 因此**不存在**依赖闭包、环检测（`index_dependency_cycle`）、staged snapshot 冻结、commit 后 residual rebase，也**不存在** `HEAD ↔ index` 第二条 diff 轴。**只有一条 diff 轴：`HEAD ↔ 工作树`**。
3. **已知并接受的代价**：commit 采用**调用方捕获型** `workingTreeRevision` CAS。另一个 Tab 在 status 与 commit 之间 `save()` 会让本次 commit 返回 `CommitConflict`。这是刻意的——没有暂存区就没有冻结快照，不校验等于提交调用方没有看过的变更。**该代价不构成重新引入暂存区的理由。**
4. **`entity.save()` 等价于 Ctrl+S，不等价于 commit**。未提交变更对**全部查询立即可见**；v1 不做长事务 / 预览语义（「未提交的东西攒够了再一起生效」在 Git 里的对照物是分支，不是 commit）。
5. **不做 detached HEAD / checkout 到历史 commit**。v1 只做 **restore**——把旧版本内容作为**新的未提交变更**写回当前工作树，不移动 HEAD、不改写历史。
6. **远端同步会弄脏工作树**。`pull()` / `autoSync` / `pullRepository()` / `cleanupExpired()` 产生 `origin=remote_sync` 的未提交变化；工作树**不按来源豁免**，`status()` / `diff()` 展示全部 origin。

### 命名裁决

| 概念               | 中文     | 前缀           | 归属                               |
| ------------------ | -------- | -------------- | ---------------------------------- |
| Git working tree   | 工作树   | `WorkingTree*` | 本特性新契约                       |
| commit / commit 图 | 提交     | `Commit*`      | 本特性新契约                       |
| NEW 草稿本地缓存   | 草稿缓存 | `Workspace*`   | 既有 `@aiao/rxdb-plugin-workspace` |

- 新导出只用 `Commit*` / `WorkingTree*` 前缀。
- **禁止 `Workspace*` 前缀**——它已被 `@aiao/rxdb-plugin-workspace` 的草稿缓存占用（`WorkspaceCacheEntry` / `WorkspaceCacheId` / `WorkspaceCorruptedEntry` / `WorkspaceFlushError`）。禁止范围不止「同名同签名」，还包括「同前缀不同义」。
- **禁止任何 `Index*` 前缀导出**——随暂存区一并裁掉。
- **不得复活** `stagedChange()` / `unstageChange()` / `stagedCount` / `WorkspaceCacheEntry.staged`。
- `switchBranch` 的新选项固定用 `WorkingTreeSwitchBranchOptions`，**不复用**既有 `SwitchBranchOptions`。
- 三个框架包只适用**负向**规则（无 `Workspace*` 新导出、不复用 `SwitchBranchOptions`）；运行时入口沿用仓库既有 `use*` 约定，`useWorkingTree()` 合规。

### 四层分层对照（读本规格前必须先对齐）

| Git 概念            | 对照物               | 存放位置             | 归属                               |
| ------------------- | -------------------- | -------------------- | ---------------------------------- |
| 编辑器未保存 buffer | 草稿缓存（NEW 草稿） | 插件独立 IndexedDB   | 既有 `@aiao/rxdb-plugin-workspace` |
| working directory   | 工作树               | **主库业务表当前值** | 本特性 `WorkingTree*`              |
| commit              | 提交                 | 主库 commit 图       | 本特性 `Commit*`                   |
| `.gitignore`        | 未版本化实体域       | —                    | 见「版本化域」                     |

**Git 的 index 这一层没有对照物**——被显式裁掉。草稿缓存与工作树**不能合并成一层**（合并会让查询语义反转、表达不了 modified/deleted、且跨不了事务边界）。

## User Scenarios & Testing _(mandatory)_

四条用户故事按交付顺序排列。整体固定顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**；US-307 / US-308 的核心持久层语义可与阶段 C 并行开工，但它们的三框架入口必须排在阶段 C 之后。

---

### User Story 1 - 提交图与 HEAD 持久化（US-305，Priority: P1）

**作为**使用 RxDB 管理本地数据的开发者，**我想要**把一组变更写成不可变 commit，并让 HEAD 与 commit 图在刷新后仍然可查询，**以便**我有一个跨会话稳定、可审计、可被后续恢复引用的版本锚点。

本故事只做**底座**：commit 图、HEAD、分支引用的原子一致性、存储布局，以及已有数据库的一次性启用迁移。工作树与提交状态机在 User Story 2。

**Why this priority**：没有持久 commit 图与 HEAD，后面三条故事全部没有落脚点。它同时是首个真实**系统迁移发布**，迁移安全边界必须最先立住。

**Independent Test**：最小闭环「写 commit → 刷新 → 读回 log / show」可独立验收，不需要工作树 UI、不需要 status/diff、不需要 restore、不需要分支切换改动。

**Acceptance Scenarios**：

1. **Given** 一个已启用提交能力的数据库与一组变更单元，**When** 以非空消息、`authorId` 与 `operationId` 提交，**Then** 变更集合、父 commit、数据库时间、摘要与新的分支 HEAD 在**一次原子操作**内写入；刷新、重启与正常关闭后都能读回。
2. **Given** 当前工作树没有任何变更单元，**When** 发起普通 commit，**Then** 提交失败且**不产生空节点**；实体数为零的 `kind=baseline | branch_baseline` 是仅有的空 ChangeSet 例外。
3. **Given** commit 写入过程中任意一步失败，**When** 事务结束，**Then** 恢复到提交前状态，不出现可见半状态。
4. **Given** 同一 `operationId` 的提交请求被重试，**When** 再次提交，**Then** 幂等命中并返回**原 commit**；相同 key 但 message / author / parent / ChangeSet 指纹不同时返回稳定错误，**不覆盖**原记录。
5. **Given** 一个分支被删除后同名重建，**When** 用旧 `operationId` 提交，**Then** 使用**新 generation**，不与旧幂等键碰撞。
6. **Given** 另一个 realm 已推进了同一分支的 head，**When** 本次 commit 以过期的 expected `headRevision` 落盘，**Then** CAS 失败，commit、ChangeSet 与 branch ref **全部不可见**。
7. **Given** 一个已有数据（旧 `RxDBChange` 历史）的数据库，**When** 开发者**显式启用**提交能力，**Then** 为每个本地可完整物化的分支生成 baseline、保留旧 change 记录、保持激活分支与业务实体状态，并支持失败后重试。
8. **Given** 迁移时发现某个本地分支无法沿 `RxDBChange` 链无缺口物化，**When** 执行迁移，**Then** 迁移**整体失败**并返回 `branch_not_materializable`，不留下部分启用状态。metadata-only 远端分支是唯一例外，它此时不创建 baseline 或 `CommitBranchRef`。
9. **Given** 迁移时 `RxDBBranch.activated` 为零行，**When** 执行迁移，**Then** 沿用既有 `resolve_current_branch` 语义（优先激活 `main`，没有则创建）；发现多行 active 时以 `ambiguous_active_branch` 整体回滚，**不按查询顺序猜一个**。
10. **Given** 某个 commit 记录损坏，**When** 遍历该分支 branch ref 的完整可达父链，**Then** 不可达的孤立损坏可单独隔离且其他分支照常可用；HEAD 或可达祖先损坏时该分支 fail-closed 为 `corrupted_read_only`，保留原始 ref 与记录，**不得**自动回退到较早 commit、空工作树或内存模式。
11. **Given** 提交能力已在数据库级启用，**When** 一个未声明该能力或协议版本不匹配的 writer 连接，**Then** 它在业务写入前 fail-fast，不得继续裸写业务表。
12. **Given** 数据库启用了字段加密，**When** 写入 commit、ChangeSet 与 baseline，**Then** 持久化路径不先解密再把明文写进新系统表；日志、错误与摘要不含加密字段值。
13. **Given** 实现进入发布分支之前，**When** 发布负责人准备本故事的**系统迁移发布**，**Then** 迁移锚点取自最近一次已验证、且满足 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的 bridge manifest，`bridge.version` **严格新于** `LAST_INELIGIBLE_BRIDGE_VERSION`，且 bridge tag 上的版本常量与本次升级位吻合。既有门禁脚本**不得重写**，本故事只在真实 tag 与真实清单上复验。
14. **Given** 首次启用提交能力，**When** 迁移事务提交，**Then** 同一事务内建立数据库级单行 `WorkingTreeActivationState` 且 `activationRevision` 初始化为 0；未启用提交能力的数据库**不创建**该状态。

---

### User Story 2 - 工作树捕获与提交操作（US-306，Priority: P1）

**作为**需要控制发布边界的开发者，**我想要**在工作树里改完之后，用一条消息把当前分支的**全部**未提交变更提交成一个版本点，**以便**一段工作可以留下有意义的存档点，且刷新后不必重新判断上次做到哪一步。

本故事分**三个阶段**，顺序是硬约束，阶段之间不可并行，每个阶段有独立可运行的验收场景区段：

| 阶段 | 交付闭环                             | 主要内容                                                                                          |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| A    | CRUD / sync 写入 → 刷新 → 工作树重建 | 写入口矩阵、active token、working-tree revision、受信意图登记、加密与后端 conformance             |
| B    | 改 → 刷新 → commit → status/diff     | 提交状态机、CAS、commit 后工作树清空、discard 与冲突状态口径（含 restore session 建表与冲突类型） |
| C    | 三端操作 → 刷新 → 同语义读回         | Angular / React / Vue 公开 API、异步状态、a11y、E2E、benchmark 与公开文档                         |

**Why this priority**：这是用户第一次能给本地变更打点存档的能力，也是 User Story 3 / 4 的直接依赖。阶段 A 的写入口捕获决定了「HEAD + 工作树条目是不是真相源」这一条根本前提。

**Independent Test**：阶段 A 可用**持久层重放断言**独立验收（清掉进程内状态、只喂 HEAD + 工作树条目，验证能重建出相同结果），不需要真的切一次分支；阶段 B 用「改 → 刷新 → commit → 查 status」独立验收；阶段 C 用三端同语义读回独立验收。

**Acceptance Scenarios（阶段 A — 写入口捕获）**：

1. **Given** 提交能力已启用，**When** 发生任意一次普通 CRUD，**Then** 在**同一事务内**校验 active branch token、写入业务实体、写入或合并完整工作树条目并递增 `workingTreeRevision`；任一步失败全部回滚。**禁止只靠内存 dirty set 重建。**
2. **Given** 一次 full / filter 远端实体应用为防回推而关闭了 change trigger，**When** 应用远端实体，**Then** 仍在同一事务写入 `origin=remote_sync` 的工作树单元，且**不形成 push echo**。
3. **Given** 一次同步只回填 `remoteId`、同步水位或审计时间，**When** 该 UPDATE 落盘，**Then** **不构成业务实体净变化**：不创建工作树单元、不递增 `workingTreeRevision`。
4. **Given** 一次远端冲突裁决，**When** 结果为 `KEEP_LOCAL` 或无净变化，**Then** 业务表与工作树条目零变化且不递增 revision；**When** 结果为 `KEEP_REMOTE`，**Then** 在同一事务、实体应用**之后**就地重算该单元（patch / inverse patch 换成新的完整快照、`origin` 一律记 `remote_sync`、`sequence` 取该分支**新的最大值**），净差为空时删除该行。
5. **Given** `cleanupExpired()` 删除了版本化实体，**When** 删除落盘，**Then** 与 `pull` 同类：写入 `origin=remote_sync` 的 DELETE 单元并递增 revision，不生成可 push 的本地 change。
6. **Given** QueryCache 同步类型的实体，**When** 发生任何 upsert / delete / 孤儿清理 / 离线出站重放，**Then** 它们**完整排除**在 baseline、status、diff、commit 之外；一次缓存刷新不得把工作树永久标成 dirty。
7. **Given** 一个 callback transaction 在任意时点混用 QueryCache 实体与版本化实体，**When** 检测到混用，**Then** 抛 `mixed_versioned_cache_transaction` 并**回滚整个事务**（不要求事务系统预知回调未来的操作）。
8. **Given** 提交能力已启用，**When** 经 adapter 的 raw 写语句命中版本化业务实体表**且**被写列集不是 untracked 字段域的子集，**Then** 在**语句执行前**以 `commit_capability_mismatch` 拒绝，业务表**零变化**（不是写完回滚）；目标表或列集无法确定时按拒绝处理（fail-closed）。
9. **Given** 全文检索插件在 SQLite 侧写虚拟表 / 影子表、在 PG 侧写业务表的派生索引列与空更新回填，**When** 这些语句下发，**Then** 一律放行且不产生工作树单元、不递增 revision；同一语句里同时写派生索引列与一个 tracked 字段时则拒绝。
10. **Given** adapter 的公开批量写方法（`upsertMany()` / `deleteByIds()`），**When** 目标实体是版本化实体，**Then** 拒绝；目标是 QueryCache 实体则放行。这两个方法**不经 raw 查询路径**，阶段 A 必须显式把门禁挂到它们上。
11. **Given** 既有的批量投影重写路径（分支物化、baseline/restore 物化、commit 后清空），**When** 阶段 A 的拒绝门禁启用，**Then** 这些路径**在同一阶段内**被登记为受信路径，按各自意图落入正确的语义行；登记键固定为「**文件 + 符号 + 意图**」，符号取**实际发起该次批量重写的最内层具名函数**，不是委托门面方法，也不是行号。
12. **Given** 写路径没有携带显式意图标记，**When** 发生批量重写，**Then** 一律按未知入口拒绝。
13. **Given** 提交能力**未**启用，**When** 发生以上任何一种写入，**Then** 一律放行，**零行为差异**。
14. **Given** 一次 `pull` 之后刷新页面，**When** 清掉全部进程内状态并只喂 HEAD + 工作树条目，**Then** 能重放出相同的业务实体状态（切出 / 切回的另一半边由 User Story 4 收口）。
15. **Given** 数据库启用了字段加密，**When** 工作树条目落盘，**Then** 延续 at-rest envelope 契约；读取可在解锁后返回明文业务值，但持久化 dump、错误与摘要不得出现明文。

**Acceptance Scenarios（阶段 B — 提交状态机）**：

16. **Given** 当前分支工作树，**When** 查询 status，**Then** 至少区分 clean、有未提交变更、恢复中与冲突四种状态。
17. **Given** 当前分支有未提交变更，**When** 查询 diff，**Then** 返回面向实体或完整事务的 `HEAD ↔ 工作树` 比较；**只有这一条 diff 轴**。
18. **Given** 调用方读到 status 之后、commit 落盘之前，另一个 realm 写入了工作树，**When** 本次 commit 落盘，**Then** 返回 `CommitConflict`——**不得**为提高成功率而放宽为只校验 head，那等于提交调用方没有看过的变更。
19. **Given** 一次成功的 commit，**When** 事务提交，**Then** **全部**已提交的工作树单元被清除，工作树回到 clean 并以新 commit 为基线；**不存在**提交后的残量与 rebase。
20. **Given** 一次 commit 调用，**When** 调用方尝试传入变更选择参数，**Then** 该入参**不存在**：提交范围恒为当前分支工作树的全部未提交单元。调用方 metadata 只能放扩展审计字段，不得覆盖 parent、时间、作者、operation ID、版本 manifest 或变更数量。
21. **Given** 当前分支工作树有未提交变更，**When** 调用 `discardWorkingTree()`，**Then** 工作树整体回到当前 HEAD；已 clean 时是 no-op。discard 同样校验 active token 与 expected working-tree revision。
22. **Given** 同一实体被当前 realm 与其他 realm 先后编辑，**When** 两次写入都落盘，**Then** 二者**平等地**成为同一份工作树的未提交变更；writer 身份**不是**提交正确性的必要条件，并发保护只由 revision CAS 提供。
23. **Given** 一次普通命令的 CAS 失败，**When** 刷新页面，**Then** 状态按最新持久 revision 重建，**不留下** durable conflicted；`status().conflicted` 与 `requireClean` 只读取仍存在的 durable domain session。
24. **Given** 分支 HEAD 或其可达祖先损坏，**When** 调用 commit，**Then** 复用 User Story 1 提供的**同一份**守卫返回 `commit_graph_corrupted`，不改指针、不删记录。

**Acceptance Scenarios（阶段 C — 三框架与门禁）**：

25. **Given** Angular / React / Vue 三端，**When** 使用工作树入口，**Then** 命名、行为、状态处理语义对称；单端缺失即未完成。
26. **Given** 一个异步命令，**When** 执行，**Then** 暴露 loading / success / error；查询在无结果时额外暴露 empty；错误说明操作、对象与恢复建议，且不给无 empty 语义的命令伪造 empty。
27. **Given** 三端 UI，**When** 用键盘操作，**Then** 键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA。
28. **Given** 一次 undo/redo 因另一个 Tab 的 `save()` 而 CAS 失败，**When** 三端入口收到该失败，**Then** 呈现为**可重试**的提示，**不得静默吞掉**。
29. **Given** 公开文档，**When** 交付阶段 C，**Then** 文档说明六项：数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、加密边界、不改写历史的承诺，并**明示远端同步会产生 `origin=remote_sync` 的未提交变化**。
30. **Given** 固定基准环境，**When** 运行工作树 benchmark，**Then** 按 Success Criteria 的口径同时产出归一化 ratio 与绝对 p95，并记录 runner profile。

---

### User Story 3 - 历史恢复会话（US-307，Priority: P2）

**作为**想纠正错误的用户，**我想要**浏览 commit 历史并把某个版本恢复到工作树，且刷新后恢复结果仍在，**以便**我可以先检查结果，再决定是否以新 commit 保存，而不必担心恢复被静默当成历史改写。

**Why this priority**：它建立在 User Story 1 的 commit 图与 User Story 2 阶段 B 的状态机之上，是「有了历史之后才有意义」的能力，因此排在 P1 之后。只有 restore 一条主路径加它的拒绝分支，范围可控。

**Independent Test**：「restore → 刷新 → 仍显示且标记未提交 → commit」可独立验收。

**Acceptance Scenarios**：

1. **Given** 一个当前分支 HEAD 沿父链可达的 commit，**When** 调用 restore，**Then** 目标内容物化到当前工作树，**不移动 HEAD**、不删除历史，并把恢复会话持久化；刷新后据其重建「恢复后未提交」标记。
2. **Given** 工作树 dirty，**When** 未显式处理未提交变更就调用 restore，**Then** 操作**拒绝并保持原状**。判定口径只有 clean / dirty 两态。
3. **Given** 一次成功的 restore，**When** 检查产出，**Then** 恢复结果是**普通的工作树条目**——与用户手写的变更同形、同表、同 revision 轴，**不存在**「已恢复但未暂存」这一额外状态。
4. **Given** 一个恢复会话处于 active，**When** 用户随后 `commit(message)`，**Then** 当前工作树整体落成新 commit，且新 commit **不改写**被恢复的历史节点，并与会话的 `committed` 转换**原子提交**；`commit()` **不接受**任何只提交恢复结果子集的参数。
5. **Given** restore 目标内容与当前 HEAD 相同（完整 diff 为空），**When** 调用 restore，**Then** 返回 no-op：不创建恢复会话、不创建工作树条目、不递增任何 revision。
6. **Given** 恢复路径上某个 commit 的 schema fingerprint manifest 或 change codec version 与当前客户端不等，**When** 做兼容预检，**Then** 在**任何持久写入前**拒绝，所有持久状态**零变化**，并稳定返回首个不兼容 commit ID、重放方向、实体与版本 manifest；检查期间**不解码或写入**后续 ChangeSet。v1 不提供跨 schema / codec patch 转换。
7. **Given** 兼容性判断，**When** 执行，**Then** 覆盖**实际读取 / 应用的完整 commit 路径**，而不只是目标节点；系统在任何持久写入前先选定确定性的物化路径。
8. **Given** 初次 restore 的 CAS 失败，**When** 事务结束，**Then** 全部回滚且**不创建会话**；**Given** 已有会话的 commit / discard CAS 失败，**When** 事务结束，**Then** 保留工作树与会话，并由 expected / actual revision 派生 conflicted，**不得自动选择任一 writer 的状态**。
9. **Given** 恢复会话上的 commit，**When** 其他 realm 在 restore 之后、commit 之前写入工作树，**Then** 返回 `CommitConflict`——**不得**为了让恢复结果顺利落盘而放宽该校验。
10. **Given** 数据库启用了字段加密，**When** restore 物化与会话持久化，**Then** 保持 envelope 契约；任何错误、摘要与会话诊断不含加密字段明文。
11. **Given** 分支 HEAD 或其可达祖先损坏，**When** 调用 restore，**Then** 复用同一份守卫返回 `commit_graph_corrupted`。

---

### User Story 4 - 分支隔离与跨 realm 冲突检测（US-308，Priority: P2）

**作为**在多个实验分支或标签页中工作的开发者，**我想要**每个分支拥有自己的 HEAD 和工作树，并能发现并发冲突，**以便**切换和协作时不会静默覆盖本地修改。

**Why this priority**：它不改 commit 存储、不改 restore 语义，是在前三条之上收口「真的切一次分支才能观察」的那类行为，并把 activation 维度接进冲突诊断。

**Independent Test**：双 realm fixture 可判定「后到的提交被拒绝且无数据丢失」；切出 / 切回往返可独立验收。

**Acceptance Scenarios**：

1. **Given** 当前分支有未提交变更，**When** 切到另一分支再切回，**Then** 恢复本分支自己的 `HEAD + 工作树条目`；分支间**不共享**可变 HEAD 或工作树。
2. **Given** 目标分支**没有**未提交条目，**When** 切换过去，**Then** 只物化目标 HEAD；物化投影本身不改变目标分支的逻辑工作树，因此只递增 `activationRevision`，**不得平白递增** `workingTreeRevision`。**不得**把「切到分支」实现成无条件 reset 到 HEAD。
3. **Given** `createBranch(branchId)`，**When** 从当前物化状态创建，**Then** 保留既有行为，复制独立 working-tree snapshot 并共享当前 HEAD；`createBranch(branchId, fromChangeId)` 保留历史 change 状态并以 `kind=branch_baseline` 锚定。
4. **Given** 调用方显式提供 `WorkingTreeSwitchBranchOptions.requireClean`，**When** 工作树 dirty，**Then** 切换被拒；**不带该选项时仍无条件切换**（`switchBranch()` 的现有默认行为不变）。
5. **Given** 一个 realm 在读取 / 实例化实体时捕获了 `{ branchId, activationRevision }`，**When** 另一个 realm 已切换分支后它才写入，**Then** 返回稳定的 `stale_active_branch`；**不得**在事务中重新读取新 active branch 后把旧实体归到新分支，也**不得**只依赖 `BroadcastChannel` 或内存状态承担该正确性。
6. **Given** 一次 CAS 失败，**When** 构造诊断，**Then** `CommitConflict` 从失败操作、对象 ID、expected / actual 的 activation / head / working-tree revision 与建议动作派生；**不建立**第二张可与真实 revision 漂移的冲突状态表。该类型本身由 User Story 2 阶段 B 定义并登记 api-baseline，本故事**只扩展 activation 维度**。
7. **Given** 一个分支被移除，**When** `removeBranch()` 提交，**Then** 原子删除该分支全部可变状态与物化 attempt，但**保留不可变 commit**；同名重建使用**新 generation**。
8. **Given** `syncBranches()` 只同步了 metadata，**When** 同步完成，**Then** **不得提前伪造** baseline / ref；没有 `CommitBranchRef` 的 metadata-only 远端分支**不是空 HEAD**。
9. **Given** 一个 metadata-only 远端分支首次被切换过去，**When** 执行首次物化，**Then** 使用**独立 durable staging** 冻结目标分支身份、终止水位与完整配置 sync scope，逐页持久化 payload / fingerprint 且**不触碰当前投影**；最终把「复核 active token、目标身份、水位/scope/fingerprint、完整物化、创建 `kind=branch_baseline`、创建 ref、切换 active、递增 activation revision、删除 staging」放进**同一提交屏障**。
10. **Given** 物化依据不足（网络失败、scope 漂移、配额不足或不收敛），**When** 首次物化结束，**Then** 以 `branch_not_materialized` 全量回滚，来源分支保持 active，只留下可安全重试 / 清理的 staging，**不留下部分目标投影**。
11. **Given** 分页物化过程中进程崩溃，**When** 重新连接，**Then** 可从 staging 续传；staging 可按 attempt 清理。
12. **Given** 一个 `origin=remote_sync` 的工作树单元，**When** 切出再切回，**Then** 该单元仍一致（收口 User Story 2 阶段 A 的重放半边）。
13. **Given** 分支 HEAD 或其可达祖先损坏，**When** 切换到该分支，**Then** 复用同一份守卫返回 `commit_graph_corrupted`；「切离」该分支不受影响。

---

### Edge Cases

- **另一个 Tab 在 status 与 commit 之间 `save()`** → 本次 commit 返回 `CommitConflict` 而非静默提交。这是砍掉暂存区后**新增的失败面**，必须有专门用例（发布门禁 5）。
- **另一个 Tab 的 `save()` 撞上 undo/redo** → undo/redo 同样是调用方捕获型，返回冲突。这比 commit 的失败更高频，**该代价也是被接受的**；替代方案（读改写型 undo）意味着在别人改过的状态上盲目应用 inverse patch，会产出用户没有审阅过的结果。
- **普通 CRUD 不得采用调用方捕获型 CAS** → 否则另一个 Tab 的任何一次写入都会让多标签页下所有在途 `save()` 失败，与「writer 身份不得成为提交正确性的必要条件」直接冲突。
- **空 commit** → 拒绝；`kind=baseline | branch_baseline` 是仅有的空 ChangeSet 例外。
- **孤立损坏 vs 可达损坏** → 前者单独隔离、其他分支照常可用；后者使该分支 `corrupted_read_only`，且 commit / restore / switch-to **三条入口各自**返回 `commit_graph_corrupted`。
- **零个 / 多个 active 分支** → 零个沿用既有 `main` 恢复语义；多个以 `ambiguous_active_branch` 全量回滚。schema 约束至多一个，每次连接验证至少一个；`activationRevision` 只防并发切换，**不能替代该基数不变量**。
- **未启用提交能力的数据库** → 零副作用、零行为差异。
- **不兼容 writer 混用** → 业务写入前 fail-fast，不允许「一个 realm 维护 revision、另一个 realm 继续裸写」。
- **`upsertMany()` / `deleteByIds()` 的结构性缺口** → 方法签名不带意图，任何调用方传一个 Full/Filter 实体名就能写版本化业务表且不产生工作树单元；必须显式挂门禁。
- **绕过 adapter 的外部数据库句柄**（另开 `sqlite3` 连接、直接打开 OPFS 文件、用 psql 连 PGlite）→ **拦不住，v1 也不承诺拦得住**；启用提交能力的数据库必须在文档中声明「业务表只能经 RxDB 写入」。
- **动态拼接 / 多语句串 / 方言不认识的构造** → fail-closed 按拒绝处理，宁可误伤不可放过。
- **重载函数名的静态扫描** → 本地与远端两个同名重载语义不同，必须**按签名区分**；扫描必须排除构建产物目录与测试夹具 / 共享测试套件，否则门禁在落地当天以与真实缺口无关的理由变红。
- **同一文件里的两个策略分支** → 各是一个独立调用点，必须各占一行登记；只登记其中一个会让漂移测试落地即红。
- **benchmark 环境不匹配** → 返回 `benchmark_environment_mismatch`，**不得伪装成性能回归**。
- **restore 目标与 HEAD 相同** → no-op，不创建会话、不递增 revision。
- **恢复路径中段不兼容** → 在任何持久写入前拒绝，稳定返回首个不兼容 commit ID，检查期间不解码后续 ChangeSet。

## Requirements _(mandatory)_

### Functional Requirements

编号沿用 epic-006 与四条 story 的既有 FR 编号，**一一对应，不重新编号**。已裁撤编号以墓碑形式保留，**不得复用**。

#### US-305 提交图与 HEAD 持久化（P1）

- **FR-001**：系统 MUST 为每个数据库/分支维护唯一 `CommitBranchRef`；HEAD MUST 从当前激活分支的 `headCommitId` 派生，不得持久化第二份可漂移的 HEAD 指针。
- **FR-002**：系统 MUST 持久化 commit 元数据、`CommitBranchRef.headCommitId` 与 `headRevision`；刷新、重启和正常关闭后可恢复。
- **FR-003**：系统 MUST 把 NEW、UPDATE、DELETE 和完整事务表示为可比较的变更单元，并为每条保留实体身份、操作类型、基线版本和当前版本指纹。
- **FR-008**：系统 MUST 要求普通 commit 包含 trim 后非空的消息、调用方提供的 `authorId` 与 `operationId`，并在一次原子操作中写入变更集合、父 commit、数据库时间、摘要和新的分支 HEAD；`kind=baseline | branch_baseline` 是仅有的无用户作者/消息系统根节点。
- **FR-009**：系统 MUST 保证普通 commit 不为空；无变更单元时提交失败且不产生空节点。实体数为零的 `kind=baseline | branch_baseline` 是仅有的空 ChangeSet 例外。
- **FR-010**：系统 MUST 保证 commit 创建失败时恢复提交前状态，不出现可见半状态。
- **FR-012**：系统 MUST 提供按 branch ref 父链可达性、实体和数据库时间查询的历史列表，以及单个 commit 的变更详情和父节点关系；`originBranchId` 只用于审计，不得用于截断继承历史。
- **FR-018**：系统 MUST 与现有 `RxDBChange`、历史 undo/redo 和 `restoreEntity` 保持兼容；已有 API 的行为不能因为 commit 功能而改变。
- **FR-019**：系统 MUST 明确区分 durable commit 历史与会话级 redo 栈；刷新后 redo 可清空，但 commit 与 HEAD 不得清空。
- **FR-021**：系统 MUST 在显式启用后为已有数据库提供一次性初始化：为每个本地可完整物化分支生成 baseline、保留旧 change 记录、保持激活分支与业务实体状态，并支持失败重试；Workspace 草稿不参与迁移，metadata-only 远端分支遵守 FR-049。
- **FR-022**：系统 MUST 对损坏或不兼容的 commit 记录进行隔离和诊断。不可达孤立记录可单独隔离；HEAD 或可达祖先损坏时该分支 MUST fail-closed 为 `corrupted_read_only`，保留原始 ref 与记录，不得自动回退到较早 commit、空工作树或内存模式。
- **FR-027**：commit 历史 MUST 可审计，至少记录稳定 commit ID、父节点、分支、作者标识、消息、创建时间、变更数量和 schema/数据版本；不得记录无法恢复的数据引用。
- **FR-029**：普通 commit MUST 在同一数据库事务内以 expected `headRevision` 条件更新 `CommitBranchRef`；CAS 失败时 commit、ChangeSet 与 branch ref 全部不可见。跨 realm 正确性由该 revision CAS 本身承担，不引入额外的协调协议。
- **FR-030**：本故事是首个真实系统迁移发布。实现进入发布分支前，发布负责人 MUST 从最近一次已验证、且满足 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的 bridge manifest 读取 `bridge.tag` / `bridge.version`，启用明确的 `oldBundlePolicy`，并通过真实 git tag 的 migration release gate。`v0.0.25` 虽是历史 bridge 发布，但当前主线经 squash 后不再包含其 tagged commit，MUST NOT 作为本故事的迁移锚点；不得重打、移动或伪造已发布 tag。若发布主线没有有效 bridge ancestor，必须先从该主线发布新的非迁移 bridge 版本，再开始本故事的 system schema 迁移发布。**锚点合法性不止于「是祖先」**：`v0.0.24` 及更早的 tag 也是祖先、也含系统迁移面的四个文件，却早于工作树桥接改造。因此 `bridge.version` MUST 严格新于 `LAST_INELIGIBLE_BRIDGE_VERSION`，且 bridge tag 上的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` MUST 与本次发布的升级位吻合（声明升级则严格更旧，未声明升级则完全相等）。这两条判据**已在 [check-migration-release-gate.mjs](../../scripts/check-migration-release-gate.mjs) 中实现并有单测**，本故事 MUST NOT 重写该脚本，只负责在真实 tag 与真实清单上复验。
- **FR-036**：普通 commit MUST 以 database + immutable branch generation + `operationId` 建立唯一幂等约束。相同请求重试返回原 commit；相同 key 的 message、author、parent 或 ChangeSet 指纹不同则返回稳定错误，不得覆盖原记录。删除并同名重建的分支使用新 generation，不与旧幂等键碰撞。
- **FR-037**：首次启用 MUST 持久化数据库级 capability/protocol 状态。此后所有 writer 在连接时协商；未启用或不兼容 writer 不得继续裸写业务表。
- **FR-038**：commit、ChangeSet 与 baseline MUST 保持既有字段加密 at-rest 契约；持久化路径不得先解密再把明文写入新系统表，日志、错误与摘要不得包含加密字段值。
- **FR-048**：commit 能力启用后 MUST 保证 `RxDBBranch.activated` 恰好一行是 true。首次迁移零 active 时沿用既有 main 恢复语义；多 active 时返回 `ambiguous_active_branch` 并全量回滚。系统 schema MUST 约束至多一个 active，每次连接 MUST 验证至少一个。
- **FR-049**：首次迁移 MUST 区分本地可完整物化分支与 metadata-only 远端分支。后者在没有完整本地状态时不得创建 baseline 或 `CommitBranchRef`；其首次 baseline/ref 创建由 US-308 与完整物化放在同一事务。除该明确例外外，任一本地分支无法物化都 MUST 使迁移整体失败并返回 `branch_not_materializable`。「可完整物化」的判定 MUST 复用既有分支物化路径：能从当前主库状态沿 `RxDBChange` 链无缺口地走到该分支 tip 即可物化；已被清理的 change、压缩掉的区间或无法配平的回滚标记都构成断链。MUST NOT 为迁移另写第二套重放引擎。
- **FR-051**：commit 图校验 MUST 从每个 branch ref 遍历完整可达父链并区分孤立损坏与可达损坏。可达损坏的分支只允许读取不依赖重放的当前投影、导出诊断和切离；commit、restore、switch-to 及任何历史重放 MUST 返回稳定的 `commit_graph_corrupted`。本故事 MUST 把该判定实现为**共享 guard**，供 commit / restore / switch-to 在各自写事务内调用；US-306 阶段 B、US-307、US-308 MUST 复用它，不得各写一份损坏判定。
- **FR-052**：首次启用 MUST 在同一迁移事务内建立数据库级单行 `WorkingTreeActivationState` 并把 `activationRevision` 初始化为 0。该状态 MUST NOT 复制第二份 active branch ID——当前分支仍由 `RxDBBranch.activated` 表示。本故事只负责建表、初始化与「连接时可读」；递增该 revision 的 switch 语义归 US-308，写路径的 token 校验归 US-306 阶段 A。未启用 commit 能力的数据库 MUST NOT 创建该表。

#### US-306 工作树与提交操作（P1）

阶段 A 承接 FR-039 / FR-046 / FR-045；阶段 B 承接 FR-004 / FR-005 / FR-011 / FR-016 / FR-031 / FR-032 / FR-041；阶段 C 承接 FR-023 / FR-026。

- **FR-004**（阶段 B）：系统 MUST 提供工作树 status，至少区分 clean、有未提交变更、恢复中和冲突状态。普通命令 CAS 失败只返回一次性 `CommitConflict`，不得形成 durable conflicted；v1 的 conflicted 只由仍存在且 revision 已分叉的 `WorkingTreeRestoreSession` 重建。
- **FR-005**（阶段 B）：系统 MUST 提供面向实体或完整事务的 diff，比较 `HEAD ↔ 工作树`。**只有这一条 diff 轴**——`HEAD ↔ index` 随暂存区一并裁撤。
- **FR-006**：_（已裁撤，编号不得复用。）_ 原条目要求 stage / unstage / stage all / clear index，暂存区已裁决不做。
- **FR-007**：_（已裁撤，编号不得复用。）_ 原条目要求保留 staged 快照并把后续编辑标为 unstaged，无暂存区即无快照。
- **FR-011**（阶段 B）：系统 MUST 在 commit 成功后清除**全部**已提交的工作树单元，使工作树回到 clean 并以新 commit 为基线；不存在提交后的残量与 rebase。
- **FR-016**（阶段 B）：系统 MUST 支持 `discardWorkingTree()`，范围是把当前分支工作树整体回到当前 HEAD；工作树已 clean 时是 no-op。
- **FR-023**（阶段 C）：系统 MUST 为异步命令提供 loading、success、error，为查询额外提供 empty；错误必须说明操作、对象和恢复建议。
- **FR-026**（阶段 C，口径见 Success Criteria）：`bench-working-tree` MUST 在 Node + PGlite memory、10,000 条实体 / 100 个 commit、当前工作树 100 个未提交单元的固定 fixture 下，以 5 次 warmup、50 次采样测完整 status、完整 diff 和一次提交 100 个单元的 commit 并输出 p50/p95、runner profile 与 JSON。普通 CI 以归一化 ratio 不超过已签入 reference median 的 110% 为硬门禁；绝对 p95 只在 `runnerProfileHash` 匹配 reference 的固定性能 runner 上作为发布硬门禁，其中 status / diff 为 100 ms，commit 的阈值由首个绿色实现的 reference 中位数冻结（不套用 status / diff 的 100 ms，量级不同）。浏览器 OPFS / IDB 不承诺相同绝对数字。
- **FR-031**（阶段 B）：所有操作 MUST 遵守 revision 矩阵：commit 校验 active branch token、expected head 与 expected working-tree revision，三者任一不匹配即全量回滚并返回 `CommitConflict`。`workingTreeRevision` 采用**调用方捕获型** CAS：调用方读到 status 之后、commit 落盘之前的任何一次工作树写入都 MUST 让本次 commit 失败，**不得**为了提高成功率而放宽为只校验 head——那等于提交调用方没有看过的变更。discard 同样校验 active token 与 expected working-tree revision。
- **FR-032**（阶段 B）：工作树中的实体编辑不按 writer 身份分叉处理；无论来自当前 realm 还是其他 realm，都 MUST 平等地成为同一份工作树的未提交变更。writer 身份不得成为提交正确性的必要条件；并发保护只由 FR-031 的 revision CAS 提供。
- **FR-039**（阶段 A）：每次普通 CRUD MUST 在同一事务内校验 active branch token、写入业务实体、写入或合并完整 `WorkingTreeEntry` 并递增 `workingTreeRevision`。任一步失败全部回滚；禁止只靠内存 dirty set 重建。
- **FR-040**：_（已裁撤，编号不得复用。）_ 原条目定义 stage/re-stage 的 CAS 与事务扩展规则，随暂存区一并作废；commit 的 CAS 见 FR-031。
- **FR-041**（阶段 B）：普通提交 MUST 接收 trim 后非空 message 与必填 `CommitOptions.authorId`、`CommitOptions.operationId`；调用方 metadata 只能放扩展审计字段，不得覆盖 parent、时间、作者、operation ID、schema/codec manifest 或变更数量。**`commit()` 不接受变更选择参数**——它没有 selection 入参，提交范围恒为当前分支工作树的全部未提交单元。
- **FR-045**（阶段 A）：`WorkingTreeEntry` MUST 延续字段加密 at-rest 契约；读取可在解锁后返回明文业务值，但任何持久化 dump、错误和摘要不得出现加密字段明文。
- **FR-046**（阶段 A）：所有业务实体写入口 MUST 遵守写入口语义矩阵。full/filter 远端实体应用即使关闭 `RxDBChange` trigger，也 MUST 在同一事务写入 `origin=remote_sync` 的工作树单元且不得形成 push echo；纯同步元数据更新不改变工作树。QueryCache 实体 MUST 完整排除；callback transaction 在任意时点检测到 QueryCache/版本化实体混用时 MUST 抛 `mixed_versioned_cache_transaction` 并回滚整个事务，不能要求事务系统预知回调未来操作。raw/未知绕过路径 MUST fail-fast，且门禁 MUST 覆盖 adapter 的公开批量写方法 `upsertMany()` / `deleteByIds()`——它们不经 `rawQuery`，五步 bypass 判定够不到，必须在阶段 A 显式挂载。
- **FR-047**：_（已裁撤，编号不得复用。）_ 原条目要求 index 自包含可重放及其依赖闭包与 `index_dependency_cycle`。

> **FR-024 / FR-025 / FR-028 三个编号同样已作废**，不在任何故事中承接，也不得被新条目复用——对应内容整体转为「横切约束」一节，按故事适用。

#### US-307 历史恢复会话（P2）

- **FR-013**：系统 MUST 支持将可达历史 commit 恢复到当前工作树；恢复默认不移动 HEAD、不删除历史，并将恢复会话持久化。
- **FR-014**：系统 MUST 在恢复前检测 dirty 工作树；未显式处理未提交变更时，恢复操作必须拒绝并保持原状。判定口径只有 clean / dirty 两态。
- **FR-015**：系统 MUST 把恢复结果写成普通的 `WorkingTreeEntry`，与用户手写的变更同形、同表、同 revision 轴，不存在「已恢复但未暂存」这一额外状态。用户随后用 `commit(message)` 把当前工作树整体落成新 commit；`commit()` MUST NOT 接受任何只提交恢复结果子集的参数。生成的新 commit 不得改写被恢复的历史节点，并须与 restore session 的 `committed` 转换原子提交。
- **FR-026b**（口径见 Success Criteria）：`bench-working-tree` MUST 在 Node + PGlite memory、10,000 条实体 / 100 个 commit 下，以 5 次 warmup、50 次采样恢复含 100 个完整变更单元的 `HEAD~1` 并记录 runner profile。普通 CI 以归一化 ratio 不超过 reference median 的 110% 为硬门禁；promise resolve 的 p95 不高于 1 s 只在 `runnerProfileHash` 匹配 reference 的固定性能 runner 上作为发布硬门禁。
- **FR-033**：v1 只允许恢复当前分支 HEAD 沿父链可达的 commit。系统 MUST 在任何持久写入前选定确定性的物化路径，并校验该路径每个 ChangeSet 涉及实体的 schema fingerprint manifest 与 change codec version 均与当前客户端完全相等；v1 不提供跨 schema/codec patch 转换。拒绝时所有持久状态 MUST 零变化。
- **FR-034**：restore / discard MUST 在同一数据库事务内校验 active branch token 与 expected head、working tree revision。初次 restore 要求工作树 clean，成功只递增 working-tree revision。初次 restore CAS 失败时全部回滚且不创建 session；已有 session 的 commit/discard CAS 失败时保留工作树和 session，并由 expected/actual revision 派生 conflicted，不得自动选择任一 writer 的状态。恢复会话上的 commit 与普通 commit 一样是**调用方捕获型** `workingTreeRevision` CAS（见 FR-031）：其他 realm 在 restore 之后、commit 之前写入工作树时返回 `CommitConflict`，MUST NOT 为了让恢复结果顺利落盘而放宽该校验。
- **FR-042**：restore 产生的完整 diff 为空时 MUST 返回 no-op，不创建 `WorkingTreeRestoreSession` 或 `WorkingTreeEntry`，也不递增任何 revision。
- **FR-043**：restore 物化与 session 持久化 MUST 保持字段加密 envelope；任何错误、摘要与 session 诊断不得包含加密字段明文。
- **FR-050**：restore 兼容性判断 MUST 覆盖实际读取/应用的完整 commit 路径，而不只是目标节点。错误 MUST 稳定返回首个不兼容 commit ID、重放方向、实体和版本 manifest；检查期间不得解码或写入后续 ChangeSet。

#### US-308 分支隔离与跨 realm 冲突检测（P2）

- **FR-017**：系统 MUST 与现有分支操作集成。`createBranch(branchId)` 保留从当前物化状态创建的行为，复制独立 working-tree snapshot 并共享当前 HEAD；`createBranch(branchId, fromChangeId)` 保留历史 change 状态并以 `kind=branch_baseline` 锚定。分支不得共享可变 HEAD / 工作树。切换恢复目标分支状态；clean 检查以 `WorkingTreeSwitchBranchOptions.requireClean` 显式提供，不带选项仍无条件切换。
- **FR-020**：系统 MUST 使用持久化 activation/head/working-tree revision CAS 阻止跨标签页静默覆盖。普通 CRUD MUST 校验实体/realm 捕获的 active branch token；不得在事务中重新读取新 active branch 后把旧实体归到新分支，也不得只依赖 `BroadcastChannel` 或内存状态。
- **FR-035**：`CommitConflict` MUST 从失败操作、对象 ID、expected/actual activation/head/working-tree revision 与建议动作派生，不得建立第二张可与真实 revision 漂移的冲突状态表。普通命令 CAS 失败只返回诊断值，不建立 durable conflict；`status().conflicted` 与 `requireClean` 只读取仍存在的 `WorkingTreeRestoreSession` 等 durable domain session。**该类型本身由首个使用者 US-306 阶段 B 定义、补 TSDoc 并登记 api-baseline**；本故事只把 activation 维度（activation expected/actual 与切换建议动作）扩展进去，不重新定义类型、不新建并行诊断类型。
- **FR-044**：`removeBranch()` MUST 原子删除该分支全部可变状态和 materialization attempt，但保留不可变 commit；同名重建 MUST 使用新 branch generation。`syncBranches()` 只同步 metadata 时不得提前伪造 baseline/ref；承接 FR-049，没有 `CommitBranchRef` 的 metadata-only 远端分支不是空 HEAD。其首次 switch MUST 使用独立 durable staging 冻结目标分支、终止水位和完整配置 sync scope，逐页持久化 payload/fingerprint 且不触碰当前投影；最终把「复核 active token、目标身份、水位/scope/fingerprint、完整物化、创建 `kind=branch_baseline`、创建 ref、切换 active、递增 activation revision、删除 staging」放进同一提交屏障。物化依据不足则以 `branch_not_materialized` 全量回滚，来源分支保持 active；分页崩溃可恢复，staging 可按 attempt 清理。旧签名、旧拒绝条件与 remote commit 非目标保持不变。

### 横切约束（按故事适用，不单独成 FR）

1. **三框架对称**：US-306 阶段 C、US-307、US-308 的用户操作面必须在 Angular / React / Vue 提供语义对称的 API；US-305 与 US-306 阶段 A/B 是无 UI 的核心底座，只要求核心公开类型、TSDoc 和类型契约测试。
2. **异步状态**：命令暴露 loading / success / error，查询在无结果时额外暴露 empty；错误说明操作、对象与恢复建议，不给无 empty 语义的命令伪造 empty 状态。
3. **可访问性**：US-306 阶段 C、US-307、US-308 的 UI 键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；US-305 与 US-306 阶段 A/B 不适用 UI a11y。
4. **不复活旧导出**：`stagedChange()`、`unstageChange()`、`commit()`、`stagedCount`、`WorkspaceCacheEntry.staged` 在可复核的 `v0.0.24` 公开表面中已不存在；新导出不得与它们同名同签名，也不得使用 `Workspace` 前缀，更不得使用 `Index*` 前缀。
5. **加密不降级**：支持后端叠加字段加密时，commit、working-tree、restore session 中的加密字段仍以 versioned envelope 落盘；错误、摘要和 benchmark 报告不得带明文。历史保留风险提示不能代替 at-rest 加密。
6. **损坏分支 fail-closed**：FR-022 / FR-051 建立 commit 图校验与 `corrupted_read_only` / `commit_graph_corrupted`，但**守卫必须落在每个入口上**：US-306 阶段 B 的 `commit()`、US-307 的 `restore()` / `restoreState()`、US-308 的 switch-to MUST 复用 US-305 提供的**同一份**守卫，命中可达损坏时拒绝、保留原 ref、不删记录。不依赖重放的当前投影读取、诊断导出与「切离」目标分支不受影响；孤立损坏只隔离记录，不影响任何入口。

### Key Entities _(include if data involved)_

本节是**逻辑契约**，只约束「必须持久化什么、按什么粒度隔离」。物理表名、字段、索引、外键、加密 envelope 与迁移版本在 plan 阶段冻结。

| 状态                         | 主键                     | 必须持久化的版本/内容                                                        | 写入规则                                                              | 建表归属      |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- |
| `CommitCapabilityState`      | database                 | enabled、protocol/schema/codec version                                       | 首次启用后数据库级生效；所有 writer 连接时协商                        | US-305        |
| `WorkingTreeActivationState` | database                 | `activationRevision`                                                         | switch branch CAS 成功后递增；不复制第二份 active branch ID           | US-305        |
| `Commit`                     | database + commit        | 不可变节点：父链、message、作者、时间、幂等 `operationId`                    | 只追加，永不改写或删除；同一 `operationId` 重复提交幂等命中现有节点   | US-305        |
| `CommitChangeSet`            | database + commit + unit | 该 commit 的变更单元：patch / inverse patch 或等价可恢复信息的完整不可变副本 | 与 `Commit` 节点同一事务写入；只追加，不引用可能被删除的 `RxDBChange` | US-305        |
| `CommitBranchRef`            | database + branch        | 不可变 `generation`、`headCommitId`、`headRevision`                          | commit 在同一事务内以 generation + revision 做 CAS 后推进             | US-305        |
| `WorkingTreeState`           | database + branch        | `baseHeadCommitId`、`workingTreeRevision`、未提交条目数                      | CRUD、restore、discard 改变逻辑工作树时递增                           | US-306 阶段 A |
| `WorkingTreeEntry`           | database + branch + unit | 实体/事务身份、操作、patch / inverse patch 或快照、当前指纹、来源 change ID  | 与业务 CRUD 同一事务写入；完整事务共享同一 unit                       | US-306 阶段 A |
| `WorkingTreeRestoreSession`  | database + branch        | 目标 commit、expected revision、`active \| conflicted \| committed` 生命周期 | 建表与「派生 conflicted」归阶段 B；会话创建与生命周期归 US-307        | US-306 阶段 B |
| branch materialization stage | database + attempt       | 目标分支、冻结远端水位、scope manifest、分页 payload、fingerprint            | 只落盘目标分支快照，不写当前业务投影；成功 switch 后删除              | US-308        |

两条不可让步的存储契约：

- `WorkingTreeEntry` 是**独立的**、完整复制 patch / inverse patch 的状态，**不复用 `RxDBChange`**、也不只存其外键——change 行会被「删分支级联删除 / 压缩合并 / 回滚标记 / 失效标记」四条既有路径删除或失效，只引用不复制会让冷重放缺项。
- `CommitChangeSet` 必须复制**完整的不可变恢复数据**，不能只引用可能被 undo、清理或删分支删除的 change 行。`WorkingTreeState` 只存计数和 revision **不算完成**：必须有可枚举、可重放、按分支隔离的未提交变更单元。

#### 版本化域（tracked / untracked）

**默认全部实体都是 tracked**。判据是「它的净变化必须能由 HEAD + `WorkingTreeEntry` 重放」。untracked 只允许以下三类，**新增第四类必须先改 epic-006 的该节**：

| untracked 对象                            | 为什么不进版本控制                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| QueryCache 同步类型的实体                 | 可从远端重建的缓存，不是用户编辑的结果；混进 commit 会让一次缓存刷新把工作树永久标成 dirty |
| 实体行上的 `remoteId`、同步水位、审计时间 | 同步机制自身的簿记字段，不表达用户意图；回填它们是对实体行的 UPDATE，但不构成业务净变化    |
| 插件在业务表上加装的**派生索引列**        | 由数据库 trigger 从 tracked 字段实时算出的冗余投影；列名 MUST 由插件静态声明并登记         |

- untracked 与 tracked **不得混进同一个事务单元**（违反即 `mixed_versioned_cache_transaction` 并回滚整个事务）。
- untracked 的判定是**按实体类型或字段的静态属性**，不按调用方、意图或时机。同一个实体不得在一条写入口上 tracked、在另一条上 untracked。
- `origin=remote_sync` **不是** untracked 的一种：它是 tracked 实体的一次净变化，只是作者不是本地用户。
- 草稿缓存不在本表内——它**根本没进主库**，属于 buffer 层，不需要 untracked 豁免。

#### revision 校验矩阵

分两类，**不可混为一谈**。**调用方捕获型**：调用方在事务开始前读到某个 revision，事务内以它做条件更新，失败即冲突。**事务内读改写型**：事务内读当前值、写业务数据、写 +1，不接收调用方 expected 值，因此**不会因并发而失败**。

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

**任何语义 no-op 都不递增 revision。** `CommitConflict` 是一次失败命令的**类型化诊断值，不是持久状态**；`status().conflicted` 只允许由仍存在的 durable domain session 派生，v1 唯一来源是 `WorkingTreeRestoreSession`。

#### 写入口语义矩阵

所有会改业务实体表的入口必须在同一数据库事务内落入下表之一；**未知入口默认拒绝**，不能先改业务表再靠事件补记。

| 写入口                                                         | 提交能力启用后的语义                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 普通 CRUD、显式事务、Workspace 草稿 `save()`                   | 写入/合并本地工作树单元，来源为 `local`，递增 working-tree revision                                                    |
| `mergeBranch()`、undo/redo、restore/discard                    | 按各自原子边界写入或重算本地工作树；不得绕过 active token 与 revision CAS                                              |
| `pull()` / autoSync / `pullRepository()` / `sync()` 的实体应用 | 即使关闭 change trigger，也必须写入 `origin=remote_sync` 的单元；不生成可 push 的本地 change                           |
| 只更新 `remoteId`、同步水位或审计时间                          | **不构成业务实体净变化**：不创建单元、不递增 revision                                                                  |
| `cleanupExpired()` 的过期删除                                  | 与 `pull` 同类：写入 `origin=remote_sync` 的 DELETE 单元并递增 revision                                                |
| branch switch、baseline/restore 物化、commit 后的工作树清空    | 由对应领域操作显式维护工作树；底层投影重写不得被 trigger 二次记录                                                      |
| metadata-only 目标分支的远端预取                               | 只写 staging 与独立水位，不得更新当前分支同步状态或业务表                                                              |
| QueryCache 的 upsert/delete/孤儿清理与离线出站重放             | 不进入 baseline、status、diff 或 commit；不能与版本化实体混在同一事务单元中                                            |
| raw SQL、adapter 直写或其他 trigger bypass                     | 业务表写入前以 `commit_capability_mismatch` 拒绝；只有同时持有内部事务能力并原子维护工作树的受信路径可以关闭 trigger   |
| `upsertMany()` / `deleteByIds()` 等 adapter 公开批量写方法     | 同上判定：目标是版本化业务实体表即拒绝，是 QueryCache 实体表即放行。**这两个方法不经 `rawQuery`**，阶段 A 必须显式挂载 |
| `EntityManager.notifyExternalUpdate()`                         | 对版本化实体 MUST 抛 `commit_capability_mismatch`，而不是发出没有工作树单元支撑的事件；对 QueryCache 实体行为不变      |

**受信路径登记键固定为「文件 + 符号 + 意图」**，符号取**实际发起该次批量重写的最内层具名函数**，不是委托门面方法，也不是行号。同一文件里语义不同的两个策略分支各占一行；被重载的传输层函数名必须按签名区分（写本地业务投影的重载属于本表，推送到远端的重载不属于）；静态扫描必须排除构建产物目录与测试夹具 / 共享测试套件。写路径必须携带显式意图枚举（内部契约，不进公开 api-baseline），未携带标记的批量重写一律按未知入口拒绝。

#### raw 写路径的 bypass 判定（按目标表 + 目标列 + 受信 intent 豁免）

每次 raw 调用在**语句执行前**按下列顺序判定：

1. 提交能力**未启用** → 原样放行，零行为差异。
2. 调用携带内部受信 `intent`（非公开参数，仅登记表内的路径可传）→ 放行。
3. 非写语句 → 放行。
4. 写目标表 ∩ **版本化业务实体表** ≠ ∅，**且**被写列集 ⊄ **untracked 字段域** → 抛 `commit_capability_mismatch`，**业务表零变化**（拒绝发生在执行前，不是写完回滚）。被写列集无法确定时按「不是子集」处理。
5. 其余写目标（全文检索虚拟表与影子表、系统表、查询缓存实体表、临时表），以及第 4 步中**只**触及 untracked 字段域的写入 → 放行；后者放行后同样不创建工作树单元、不递增 revision。

「版本化业务实体表」与「untracked 字段域」两个集合与「版本化域」引用**同一份清单**，**不得另建第二份**。`upsertMany()` / `deleteByIds()` 复用同一份清单与同一判定，但入参是**整行**而不是列集，因此对版本化实体一律落第 4 步。解析取保守口径（**fail-closed**）；大小写、引号标识符与 schema 限定在比对前归一化；6 个后端共用**同一份**判定实现，方言差异只体现在词法层。

**能力边界（写进公开文档，不假装拦得住）**：本门禁只覆盖**经 adapter 的 raw 写路径与 adapter 公开批量写方法**。绕过 adapter 的外部数据库句柄**拦不住**，v1 也不承诺拦得住；启用提交能力的数据库必须在文档中声明「业务表只能经 RxDB 写入」。

## Success Criteria _(mandatory)_

### 性能口径（先立口径，再谈数字）

裸墙钟数字**不可验收**：不指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、不定义「用户可见响应」是 promise resolve 还是首次绘制、不给统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。因此本特性采用**双门禁**，下列 SC 全部按此口径判定：

- **基准环境固定**为 Node + PGlite memory；「响应」定义为 **API promise resolve**（操作完成），不把三框架首次绘制混入核心 benchmark。
- **采样固定** `WARMUP = 5`、`SAMPLES = 50`。每个 sample 前在计时外恢复同一 fixture：**10,000 条实体、100 个 commit**（每个 commit 100 个完整变更单元），当前工作树 **100 个未提交单元**。fixture 内容与 hash 必须写入 JSON，**禁止只固定总行数**。
- **环境指纹**：benchmark JSON 必须记录运行时版本、OS、CPU 型号、逻辑核数、内存、runner ID 与并发度并计算 `runnerProfileHash`；profile 不匹配 reference 时返回 `benchmark_environment_mismatch`，**不得伪装成性能回归**。
- **相对门禁（普通 PR CI 的唯一硬门禁）**：每项 control CRUD 使用相同实体数量和事务边界，比较「被测操作 p95 / 同次 control CRUD p95」。首个绿色实现先归档 reference commit 的 **10 次独立运行**并冻结各项 median ratio；候选版本不得超过该 ratio 的 **110%**。reference JSON 与阈值必须**先于**发布候选签入，不能在失败后重算基线。
- **绝对门禁（仅发布）**：只在与 reference `runnerProfileHash` 相同的固定性能 runner 上作为硬门禁。

### Measurable Outcomes

- **SC-001**：在固定基准环境与 fixture 下，完整 status 摘要的归一化 ratio 不超过冻结 reference median 的 110%；在 profile 匹配的固定性能 runner 上，其 p95 不高于 **100 ms**。
- **SC-002**：无 scope 的完整 `HEAD ↔ 工作树` diff 满足与 SC-001 相同的两道门禁（相对 110%，绝对 p95 ≤ **100 ms**）。
- **SC-003**：一次提交 100 个单元的 commit 通过相对门禁（≤ reference median ratio 的 110%）；其**绝对预算由首个绿色实现的 reference 中位数冻结并与相对门禁同批签入**，**不套用 status / diff 的 100 ms**——它要把 100 个单元整体落盘并清空工作树，与只读摘要的操作量级不同。
- **SC-004**：从 clean HEAD 恢复含 100 个完整变更单元的 `HEAD~1` 通过相对门禁；在 profile 匹配的固定性能 runner 上，promise resolve 的 p95 不高于 **1 s**。
- **SC-005**：浏览器 OPFS / IDB **不承诺**相同绝对数字，但三端 E2E 必须记录**首次可见状态耗时**，防止核心 promise 很快而 UI 长时间无反馈。
- **SC-006**：**6 个 v1 后端**（PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai 四个 SQLite 浏览器适配器，以及 Electron `node:sqlite` host）的 `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite` **双双全绿**。
- **SC-007**：崩溃与刷新恢复 fixture 全绿——**不出现**半个 commit、半个事务或半清空的工作树。
- **SC-008**：跨 realm fixture 覆盖 switch 与旧实体 CRUD 竞争、启用/未启用 writer 混用、HEAD / working-tree CAS，并**必须包含一条「另一个 Tab 在 status 与 commit 之间 `save()`」的用例**，断言返回 `CommitConflict` 而非静默提交。
- **SC-009**：写入口 conformance 覆盖普通 CRUD、merge、undo/redo、full/filter pull / autoSync / repository sync / bulkSync、`cleanupExpired()` 过期删除、QueryCache 排除与 raw bypass 拒绝；**任何业务表净变化都能由 HEAD + `WorkingTreeEntry` 重放**。
- **SC-010**：意图标记登记表与代码实际调用点**一致**：存在未登记的分支物化调用点、未登记的**本地重载**批量合并调用点（两种接收者、`disableTriggers` 真假**都算**）、未登记的 `upsertMany` / `deleteByIds` 调用点即门禁失败。漂移扫描 MUST 能报出「调用 `upsertMany` 但目标实体不是 QueryCache」的新增调用点。
- **SC-011**：支持字段加密的后端，其 commit / working-tree / restore 持久化 dump 的**明文哨兵零命中**。
- **SC-012**：active 分支基数、metadata-only 远端分支首次物化和完整 restore 路径预检 fixture 全绿。
- **SC-013**：损坏隔离 fixture 全绿——孤立损坏可单独隔离且其他分支照常可用；HEAD 或可达祖先损坏时该分支进入 `corrupted_read_only`，`commit()` / `restore()` / switch-to **三条入口各自**返回 `commit_graph_corrupted` 且不改指针、不删记录。
- **SC-014**：命名门禁全绿——核心共享契约的新增导出全部使用 `Commit*` / `WorkingTree*` 前缀且**无 `Index*` 新导出**；三个框架包无 `Workspace*` 新导出、不复用既有 `SwitchBranchOptions`；`useWorkingTree()` 按框架侧**负向**规则合规。
- **SC-015**：公开文档说明**六项**：数据库级显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、加密边界、不改写历史的承诺，并**明示远端同步会产生 `origin=remote_sync` 的未提交变化**。
- **SC-016**：四条故事全部 Done（US-306 的阶段 A / B / C 全部关闭），交付阶段与边界表逐条有归属，跨故事的半边以收口故事的场景为准。
- **SC-017**：`bridge.tag` 指向一个满足 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 的**真实** tag，`bridge.version` **严格新于** `LAST_INELIGIBLE_BRIDGE_VERSION`，且 bridge tag 上的版本常量与升级位吻合。判据**已实现并有单测，不得重写脚本**；本特性只在真实 tag 与真实清单上复验。

## Assumptions

- **提交能力是数据库级、单向的显式启用**。从未启用的数据库零副作用、零行为差异；具体配置名在 plan 阶段冻结。
- **SQL / PGlite 主库是 commit 与工作树元数据的唯一一致性边界**。Workspace 插件的 NEW 草稿仍留在独立 IndexedDB 中，不参与系统 schema 事务，也不进入 baseline commit；草稿 `save()` 落入主表后才作为普通 INSERT 进入工作树。
- **v1 支持矩阵是 6 个后端**。入矩阵的判据是**宿主能力**（已在既有跨后端共享套件上全绿，且没有已知的非确定性失败），不是它所属 story 的 status。
- **Tauri 的 Rust host 是第 7 个后端，v1 暂不承诺**：它在 stdio 测试宿主上存在可复现的非确定性失败（CPU 争抢下随机挂 1–4 条，全落在「改完立刻读到旧值」同一族），属跨进程管道的调度时序特征。该族 flake 收敛后按同一套件补入矩阵，不在本特性内夹带。实验性的 miniprogram 适配器不承诺崩溃恢复，也不在矩阵内。
- **v1 变更单元粒度是「实体操作或完整事务」**。同一事务不能被拆到不同 commit；字段级、代码行级粒度属于后续扩展。
- **既有 `mergeBranch()` 不自动创建双父 commit**：它只把合并结果写成目标分支的普通工作树变更；用户随后提交时仍以目标分支原 HEAD 为唯一父节点。
- **跨后端 conformance 拆成两套具名套件**，各有唯一归属故事：捕获套件归 US-306 阶段 A，提交套件归 US-306 阶段 B；US-305 的 commit 图/迁移断言**并入提交套件**，不另起第三个套件名。
- **v1 不提供 auto-baseline**（同步后自动把远端变化并入 HEAD）——它会引入「谁在什么时刻替用户提交了什么」的隐式历史，与「不伪造远端作者」和「不改写历史」两条承诺冲突。
- **本特性不扩大相邻 epic 的门禁覆盖面**：命名门禁与「不复活旧导出」只约束本特性新增的导出；host 本身的正确性、打包与 flake 收敛归适配器故事；不引入新的 scope 原语。
- **数据库 trigger fail-closed 留作后续故事**：它是唯一能拦住外部句柄的方案，但受信标记的载体在 6 个后端不统一，且每张版本化表要挂 3 个 trigger，不在本特性范围内。

## 非目标

照抄 epic-006「非目标」全部条目：

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求**检测并阻止静默覆盖**）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为
- **未提交变更对查询不可见**的长事务 / 预览语义（已裁决）：`save()` 后数据立即对全部查询生效，commit 只是存档打点。「未提交的东西攒够了再一起生效」需要读时按 HEAD 过滤或影子表，是数量级的成本上升且会波及全部既有查询路径。它在 Git 里的对照物不是 commit，而是「在分支上工作」，应走分支而非 commit
- **detached HEAD、`checkout` 到历史 commit 与只读历史浏览**（已裁决）：v1 只提供 US-307 的 **restore**——把旧版本内容作为**新的未提交变更**写回当前工作树，不移动 HEAD、不改写历史。「切过去看一眼再切回来」需要先解禁「自动 stash / 跨分支携带脏工作树」，两条一起解才有意义
- **暂存区（index / staging area）与任何形式的选择性提交**（已裁决）：v1 没有 stage / unstage，`commit(message)` 只能提交当前分支工作树的**全部**未提交变更，没有子集、没有字段级或行级部分暂存。隔离一条工作线的唯一手段是**分支**。理由是 RxDB 已有的分支能力覆盖了绝大多数「先隔离再决定」的场景，而暂存区要额外背上依赖闭包与环检测、staged snapshot 冻结、commit 后的 residual rebase、`HEAD ↔ index` 第二条 diff 轴以及第三个 revision——这些复杂度全部为「一次只提交一部分」这一个能力服务，性价比不成立。**已知代价**：commit 因此对并发编辑敏感，另一个 Tab 在 status 与 commit 之间 `save()` 会让本次 commit 返回 `CommitConflict`。这条代价是被接受的，**不构成重新引入暂存区的理由**

> 上面三条是**显式裁决，不是遗漏**。它们直接对应三个反复被提起的直觉——「commit 应该像事务提交一样让一批变更一起生效」「应该能像 `git checkout` 一样切到历史版本」和「应该能只提交改动的一部分」。答案分别是「那是分支，不是 commit」「那是 restore，不是 checkout」和「那是分支，不是暂存区」；**要改结论必须先改 epic-006 的「非目标」一节**，不能靠在某条 story 或本规格里追加条目悄悄扩范围。
