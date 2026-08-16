# Phase 1 Data Model: 本地工作树与提交历史

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md) | **Date**: 2026-08-15

本文件把 spec.md 的 13 个 Key Entities 落成具体的系统表、字段、关系、约束与状态迁移。全部实体位于 `namespace: 'rxdb'`，`log: false`（系统表自身不进变更日志），随 `RXDB_SYSTEM_SCHEMA_VERSION = 4` 建立，且**仅在数据库启用提交能力时存在**（[R-004](./research.md#r-004-系统-schema-版本与启用迁移)）。

---

## 1. 实体总览

| #   | 实体                                     | 表名                                         | 基数                 | 归属故事                               |
| --- | ---------------------------------------- | -------------------------------------------- | -------------------- | -------------------------------------- |
| 1   | `RxDBCommit`                             | `rxdb_commit`                                | 每提交一行           | US1                                    |
| 2   | `RxDBCommitChangeSet`                    | `rxdb_commit_change_set`                     | 每变更单元一行       | US1                                    |
| 3   | `RxDBCommitBranchRef`                    | `rxdb_commit_branch_ref`                     | **每已物化分支**一行 | US1 / US6                              |
| 4   | `RxDBCommitCapabilityState`              | `rxdb_commit_capability_state`               | **全库单行**         | US1                                    |
| 5   | `RxDBWorkingTreeActivationState`         | `rxdb_working_tree_activation_state`         | **全库单行**         | US1                                    |
| 6   | `RxDBWorkingTreeEntry`                   | `rxdb_working_tree_entry`                    | 每未提交单元一行     | US2                                    |
| 7   | `RxDBWorkingTreeState`                   | `rxdb_working_tree_state`                    | 每分支一行           | US2                                    |
| 8   | `RxDBIndexState`                         | `rxdb_index_state`                           | 每分支一行           | US3                                    |
| 9   | `RxDBIndexEntry`                         | `rxdb_index_entry`                           | 每已暂存单元一行     | US3                                    |
| 10  | `RxDBWorkingTreeRestoreSession`          | `rxdb_working_tree_restore_session`          | 每恢复会话一行       | **建表与迁移 US3**；创建与生命周期 US5 |
| 11  | `RxDBCommitBranchMaterializationAttempt` | `rxdb_commit_branch_materialization_attempt` | 每次首物化尝试一行   | US6                                    |
| 12  | `RxDBBranch`（既有，扩展）               | `rxdb_branch`                                | —                    | US1 / US6                              |

共 **11 张新表**。派生型（不落表，运行时计算）：`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、`CommitCapability`、`CommitConflict`。契约见 [contracts/core-api.md](./contracts/core-api.md)。

**归属纪律**：第 10 项的**建表与 schema 迁移随 US3（US-306 阶段 B）交付**——持久冲突状态（FR-033、FR-036）在 US3 就必须成立，其读路径要能从已存在的会话派生冲突；US5 只拥有会话的创建与生命周期语义。把建表推迟到 US5 会让 US3 的 `conflicted` 状态无处附着。

---

## 2. 提交图（US1）

### 2.1 `RxDBCommit` → `rxdb_commit`

| 字段                     | 类型           | 约束                            | 说明                                                                                                    |
| ------------------------ | -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid           | PK                              | `normal` 用 UUID v7；两类系统根节点用**确定性派生 id**（[R-008](./research.md#r-008-提交标识与幂等键)） |
| `parentId`               | uuid \| null   | FK → `rxdb_commit.id`，index    | `null` 仅出现在 `baseline` / `branch_baseline`                                                          |
| `kind`                   | enum           | not null                        | `baseline` \| `branch_baseline` \| `normal`                                                             |
| `originBranchId`         | uuid           | FK → `rxdb_branch.id`，index    | **仅审计**：提交被创建时所在的分支                                                                      |
| `originBranchGeneration` | number         | not null                        | 创建时的分支代次，参与幂等键                                                                            |
| `authorId`               | string \| null | not null when `kind = 'normal'` | 调用方提供，禁止从空值/设备名/写入方标识伪造（FR-004）                                                  |
| `message`                | string         | not null                        | `normal` 要求 trim 后非空；两类根节点为固定系统文案                                                     |
| `unitCount`              | number         | not null                        | 变更单元数，供列表页免 join 计数                                                                        |
| `changeCodecVersion`     | number         | not null                        | 变更编解码版本，US5 兼容性预检读它（FR-044）                                                            |
| `schemaFingerprints`     | json           | not null                        | `{ "<namespace>.<entity>": "<fingerprint>" }`，覆盖本提交涉及的全部实体                                 |
| `operationId`            | string \| null | 见 §2.5                         | 幂等键；`normal` 必填                                                                                   |
| `createdAt`              | number         | not null，index                 | **取数据库时钟**，不信任 realm 本地时钟（spec Assumptions）                                             |
| `updatedAt`              | number         | not null                        |                                                                                                         |

**规则**:

- FR-002 / INV-2：每个已启用数据库的每个**已物化**分支恰好有一条 `parentId IS NULL` 的根提交（迁移产生 `baseline`，`createBranch(branchId, fromChangeId)` 与远端分支首物化产生 `branch_baseline`）。
- FR-004：`parentId` 构成有向无环图；写入前校验祖先可达，不可达则 `commit_graph_corrupted`。
- FR-004：`normal` 提交在**任何持久状态变化前**校验三件事——`message.trim()` 非空、`authorId` 非空、`operationId` 非空；任一不满足即拒绝且 HEAD 不变。
- FR-005：空提交被拒绝——`unitCount = 0` 的 `normal` 提交不允许写入。零实体的**本地分支** `baseline` 是仅有的例外（US2-AC8）；仅有元数据的远端分支**不得**据此建立空基线（FR-013）。
- FR-007：`originBranchId` **MUST NOT** 用于历史查询过滤。`log({ branchId })` 只能从 `rxdb_commit_branch_ref.headCommitId` 沿 `parentId` 遍历可达父链；按 `originBranchId = branchId` 过滤会截断继承来的历史，是本表最容易被误用的字段。

### 2.2 `RxDBCommitChangeSet` → `rxdb_commit_change_set`

| 字段              | 类型           | 约束                                      | 说明                                      |
| ----------------- | -------------- | ----------------------------------------- | ----------------------------------------- |
| `id`              | uuid           | PK                                        |                                           |
| `commitId`        | uuid           | FK → `rxdb_commit.id`，index              |                                           |
| `transactionId`   | uuid           | index                                     | 原始事务分组，供依赖闭包回溯              |
| `sequence`        | number         | not null                                  | 提交内稳定顺序（拓扑序结果）              |
| `type`            | enum           | not null                                  | `insert` \| `update` \| `delete`          |
| `namespace`       | string         | not null                                  |                                           |
| `entity`          | string         | not null，复合 index `(entity, entityId)` |                                           |
| `entityId`        | string         | not null                                  |                                           |
| `baselineVersion` | string \| null |                                           | 变更前的版本指纹（FR-003）                |
| `currentVersion`  | string         | not null                                  | 变更后的版本指纹（FR-003）                |
| `patch`           | json           | not null，**经信封**                      | [R-009](./research.md#r-009-加密信封复用) |
| `inversePatch`    | json           | not null，**经信封**                      | 支撑 US5 恢复的逆向重放                   |
| `createdAt`       | number         | not null                                  |                                           |

**规则**:

- FR-003：内容整体复制，不引用 `rxdb_change`；压缩/删分支/回滚标记不得影响本表。每条保留实体身份、操作类型、基线版本与当前版本指纹。
- FR-003：同一 `transactionId` 的全部单元 **MUST NOT** 被拆进不同提交。
- FR-007：按实体查历史走 `(entity, entityId)` 复合索引；排序主键为提交拓扑序，次级为 `createdAt`，再次级为 `sequence`。
- FR-044：US5 的兼容性预检在选定物化路径后逐个读取路径上每个 change set 的 `currentVersion` 与所属提交的 `schemaFingerprints` / `changeCodecVersion`，**不解码** `patch`。

### 2.3 `RxDBCommitBranchRef` → `rxdb_commit_branch_ref`

| 字段               | 类型   | 约束                              | 说明                                                                           |
| ------------------ | ------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `id`               | uuid   | PK                                |                                                                                |
| `branchId`         | uuid   | FK → `rxdb_branch.id`，**unique** | 一分支一行                                                                     |
| `generation`       | number | not null                          | 不可变代次，参与幂等键                                                         |
| `headCommitId`     | uuid   | FK → `rxdb_commit.id`，not null   | **HEAD 的唯一真相源**（FR-001）                                                |
| `baselineCommitId` | uuid   | FK → `rxdb_commit.id`，immutable  | 根提交                                                                         |
| `headRevision`     | number | not null                          | HEAD 推进的 CAS 版本（[R-005](./research.md#r-005-revision-的实现与两类校验)） |
| `origin`           | enum   | not null                          | `migration` \| `createBranch` \| `remoteMaterialization`                       |
| `updatedAt`        | number | not null                          |                                                                                |

**规则**:

- FR-001 / FR-015：**不**存「当前分支 id」。当前分支恒由 `RxDBBranch.activated` 表达。
- FR-013 / FR-052：**行的存在 ⟺ 分支已物化**。仅有元数据、本地没有提交图的远端分支**不建行**；`headCommitId` **MUST NOT** 可空，也 **MUST NOT** 引入 `materialized: boolean` 之类的第二种引用状态——那正是 FR-013 所说的「被解释为空 HEAD」。查询无行的分支返回 `branch_not_materialized`。
- FR-005：HEAD 只能推进到自身子孙提交；否则 `commit_graph_corrupted`。
- FR-014：可达父链上检出损坏时**该行保持原样**，损坏态记在 §2.4 的能力状态之外、按分支派生（见 §7 INV-3 与 [adapter-contract §7](./contracts/adapter-contract.md#7-损坏检测与降级)）——不自动改指针、不删记录。

### 2.4 `RxDBCommitCapabilityState` → `rxdb_commit_capability_state`

**全库单行**，由首次启用迁移在同一事务内建立（FR-011）。

| 字段                    | 类型    | 约束                       | 说明                                     |
| ----------------------- | ------- | -------------------------- | ---------------------------------------- |
| `id`                    | string  | PK，固定常量 `'singleton'` | 基数由主键保证                           |
| `enabled`               | boolean | not null                   | 单向：一旦 `true` 不可回退               |
| `commitProtocolVersion` | number  | not null                   | 写入方连接时协商的协议版本               |
| `systemSchemaVersion`   | number  | not null                   | 落库时的 `RXDB_SYSTEM_SCHEMA_VERSION`    |
| `changeCodecVersion`    | number  | not null                   | 变更编解码版本                           |
| `enableMigrationId`     | string  | not null                   | 启用迁移的标识，参与确定性根提交 id 派生 |
| `enabledAt`             | number  | not null                   | 数据库时钟                               |

**规则**:

- FR-011：未启用的数据库**不创建本行、不创建本表**（INV-10）。已启用库被未声明能力或协议不匹配的写入方打开时，在**首笔业务写入前** `commit_capability_mismatch` 或进入调用方明确请求的只读模式，MUST NOT 继续裸写业务表。

### 2.5 幂等约束

唯一索引 `rxdb_commit_idempotency`：`UNIQUE (originBranchId, originBranchGeneration, operationId) WHERE operationId IS NOT NULL`。

- 命中且内容一致 → 返回原提交，HEAD 不推进（FR-009）。
- 命中且内容不一致 → `idempotency_key_reused`，原记录不被覆盖。
- 同名分支重建后 `generation` 递增，旧键不再碰撞。

---

## 3. 分支激活（US1 / US6）

### 3.1 `RxDBBranch` 索引扩展

对既有 [`RxDBBranch`](../../packages/rxdb/src/system/branch.ts) 追加一条部分唯一索引（[R-003](./research.md#r-003-head-的唯一真相源与激活分支基数约束)）：

```text
{ name: 'rxdb_branch_single_activated', properties: ['activated'], unique: true,
  where: { property: 'activated', equals: true } }
```

生成 `CREATE UNIQUE INDEX rxdb_branch_single_activated ON rxdb_branch (activated) WHERE activated = TRUE`，在 PGlite 与四个 SQLite 后端语义一致。

**规则**:

- FR-012：迁移建索引前若存在多行 `activated = TRUE`，整个迁移失败并返回 `ambiguous_active_branch`，**不**按查询顺序任选。
- FR-012：迁移前**零**激活分支时，沿用既有 [`resolve_current_branch`](../../packages/rxdb/src/version/) 语义——优先激活 `main`，没有 `main` 时创建它——再建立基线，而不是失败。
- FR-012：数据库约束保证**至多一个**；每次连接额外验证**至少一个**，零激活时按上一条恢复。

### 3.2 `RxDBWorkingTreeActivationState` → `rxdb_working_tree_activation_state`

**全库单行**，由首次启用迁移在同一事务内建立，`activationRevision` 初始化为 `0`（FR-015）。

| 字段                 | 类型   | 约束                       | 说明                                         |
| -------------------- | ------ | -------------------------- | -------------------------------------------- |
| `id`                 | string | PK，固定常量 `'singleton'` | 基数由主键保证                               |
| `activationRevision` | number | not null，初始 `0`         | 调用方捕获型；不匹配 → `stale_active_branch` |
| `updatedAt`          | number | not null                   |                                              |

**规则**:

- FR-015：本表 **MUST NOT** 复制第二份激活分支标识——只有 revision，没有 branchId。当前分支恒由 `RxDBBranch.activated` 表达。
- FR-015：未启用的数据库 **MUST NOT** 创建本行。
- FR-025 / FR-053：所有调用方捕获型写操作（stage / unstage / commit / restore / discard / switchBranch）一律校验 `activationRevision`。
- FR-049：分支切换只递增 `activationRevision`；物化目标分支投影**不得平白递增** `workingTreeRevision`。

---

## 4. 工作树（US2）

### 4.1 `RxDBWorkingTreeEntry` → `rxdb_working_tree_entry`

| 字段                                | 类型         | 约束                                                   | 说明                                                            |
| ----------------------------------- | ------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| `id`                                | uuid         | PK                                                     |                                                                 |
| `branchId`                          | uuid         | FK → `rxdb_branch.id`，复合 index `(branchId, staged)` | 按分支隔离                                                      |
| `transactionId`                     | uuid         | index                                                  | 与业务写同一事务内落库                                          |
| `sequence`                          | number       | not null                                               | 分支内单调序，决定重放顺序                                      |
| `origin`                            | enum         | not null                                               | `local` \| `remote_sync` \| `merge` \| `undo_redo` \| `restore` |
| `sourceChangeId`                    | uuid \| null |                                                        | 来源变更标识，**仅审计**（本表不依赖它重放）                    |
| `type`                              | enum         | not null                                               | `insert` \| `update` \| `delete`                                |
| `namespace` / `entity` / `entityId` | string       | 复合 index `(entity, entityId)`                        |                                                                 |
| `currentVersion`                    | string       | not null                                               | 当前指纹                                                        |
| `patch` / `inversePatch`            | json         | **经信封**                                             | 完整快照，不引用 `rxdb_change`                                  |
| `staged`                            | boolean      | not null，default `false`                              | `true` ⇒ `rxdb_index_entry` 存在对应行                          |
| `createdAt`                         | number       | not null                                               |                                                                 |

**规则**:

- **`origin` 不是 `RxDBWriteIntent`**：前者是**持久化的来源分类**（5 个值，用户可见、进 diff 与状态），后者是**写路径上的调用方意图枚举**（9 个值，仅内部契约，见 [R-006](./research.md#r-006-写入意图枚举与受信登记)）。映射是多对一且不满射：`expiredCleanup → remote_sync`；`branchMaterialization` / `baselineMaterialization` / `metadataOnly` **不产生条目**因而不落任何 `origin`。两者 MUST NOT 合并成一列。
- FR-018：条目与业务数据写入**同一事务**；事务回滚 ⇒ 两者同时不存在（半状态率 0，SC-002）。
- FR-020：只更新远端 ID / 同步水位 / 审计时间的写入不产生条目，也不递增 `workingTreeRevision`。
- FR-021：`sync.type === SyncType.QueryCache` 的实体完全不产生条目（[R-010](./research.md#r-010-查询缓存实体的排除判定)）。
- FR-023：任意时刻「HEAD 提交链 + 本表按 `sequence` 重放」= 当前业务数据（冷重放不变式）。
- FR-024：草稿缓存的 NEW 草稿不进本表、不递增 `workingTreeRevision`；`save()` 之后才作为一次普通 `insert` 进入。

### 4.2 `RxDBWorkingTreeState` → `rxdb_working_tree_state`

| 字段                  | 类型    | 约束                              | 说明                                                |
| --------------------- | ------- | --------------------------------- | --------------------------------------------------- |
| `id`                  | uuid    | PK                                |                                                     |
| `branchId`            | uuid    | FK → `rxdb_branch.id`，**unique** |                                                     |
| `baseHeadCommitId`    | uuid    | FK → `rxdb_commit.id`，not null   | 本工作树基于哪个 HEAD（FR-023、残量 rebase 的基准） |
| `workingTreeRevision` | number  | not null                          | **事务内读改写型**（并发不失败）                    |
| `restoring`           | boolean | not null，default `false`         | 是否处于恢复会话中                                  |
| `unstagedCount`       | number  | not null                          | 未提交单元计数                                      |
| `updatedAt`           | number  | not null                          |                                                     |

**规则**:

- FR-032：`workingTreeRevision` **MUST NOT** 采用调用方捕获型校验——普通 CRUD 会因此在多标签页下随机失败。
- FR-035 / SC-007：语义无操作（stage 空集、unstage 不存在项、discard 已 clean、内容相同的恢复）**不**递增任何 revision。
- FR-031：提交后未暂存残量按新 HEAD 重新基线化，`baseHeadCommitId` 随之推进；提交 **MUST NOT** 仅因暂存后发生普通编辑而失败，也 MUST NOT 用已暂存快照覆盖该编辑。
- `phase`（`clean` / `modified` / `staged` / `restoring` / `conflicted`）是**派生值**，不落列：由本表的 `unstagedCount` / `restoring`、`rxdb_index_state.entryCount` 与恢复会话的 `status` 共同计算（§4.3）。避免第二份会漂移的状态。

### 4.3 状态迁移（派生，非持久列）

```text
                 ┌──────────── discard ────────────┐
                 v                                  │
  clean ──write──> modified ──stage──> staged ──commit──> clean
    ^                 ^                   │
    │                 └──── unstage ──────┘
    │
    └── restore 提交/丢弃 ── restoring ←── restore 开始（仅自 clean）
                            │
                            └── 会话 expected 与当前分叉 ──> conflicted ──解决/删除会话──> modified
```

- `restoring` 是持久事实（`rxdb_working_tree_state.restoring` + 存在 `status = 'active'` 的会话），跨重启可见（FR-042）。
- `conflicted` **只**由「仍存在且 revision 已分叉的恢复会话」派生（FR-033）。一次普通的条件更新失败 **MUST NOT** 形成持久冲突态，刷新后状态按最新持久数据重建（US3-AC8）。
- FR-043：恢复只能自 **clean** 进入——工作树非空或缓存区非空都拒绝，且「仅已暂存」**MUST NOT** 被误报为 clean。

---

## 5. 缓存区（US3）

### 5.1 `RxDBIndexState` → `rxdb_index_state`

| 字段               | 类型   | 约束                              | 说明                             |
| ------------------ | ------ | --------------------------------- | -------------------------------- |
| `id`               | uuid   | PK                                |                                  |
| `branchId`         | uuid   | FK → `rxdb_branch.id`，**unique** |                                  |
| `indexRevision`    | number | not null                          | **调用方捕获型**（可因并发失败） |
| `baseHeadCommitId` | uuid   | FK → `rxdb_commit.id`，not null   | 缓存区自包含性所参照的 HEAD      |
| `entryCount`       | number | not null                          | 已暂存单元计数                   |
| `updatedAt`        | number | not null                          |                                  |

`indexRevision` 与 `workingTreeRevision` 分表存放：二者的校验类别不同（前者调用方捕获型、后者事务内读改写型），合表会让「clearIndex 只动 `indexRevision`」这条断言（FR-034）失去物理隔离。

### 5.2 `RxDBIndexEntry` → `rxdb_index_entry`

| 字段                                | 类型   | 约束                                          | 说明                                                    |
| ----------------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------- |
| `id`                                | uuid   | PK                                            |                                                         |
| `branchId`                          | uuid   | FK，复合 index `(branchId, sequence)`         |                                                         |
| `workingTreeEntryId`                | uuid   | FK → `rxdb_working_tree_entry.id`，**unique** | 一对一（仅溯源）                                        |
| `baselineCommitId`                  | uuid   | FK → `rxdb_commit.id`，not null               | 暂存时的基线提交                                        |
| `sequence`                          | number | not null                                      | 稳定拓扑序（[R-007](./research.md#r-007-依赖闭包算法)） |
| `type`                              | enum   | not null                                      | `insert` \| `update` \| `delete`                        |
| `namespace` / `entity` / `entityId` | string | 复合 index `(entity, entityId)`               |                                                         |
| `patch` / `inversePatch`            | json   | not null，**经信封**                          | **完整已暂存快照**（见下方规则）                        |
| `currentVersion`                    | string | not null                                      | 暂存时的版本指纹                                        |
| `stagedAtWorkingTreeRevision`       | number | not null                                      | 暂存时的工作树 revision                                 |
| `dependencyUnitIds`                 | json   | not null                                      | 闭包内的依赖单元 id 列表                                |
| `stagedAt`                          | number | not null                                      | 数据库时钟                                              |

**规则**:

- **完整复制，不只引用**（epic 状态模型、FR-030）：本表 **MUST** 复制不可变的恢复数据，**MUST NOT** 只持有 `workingTreeEntryId` 外键——工作树条目可能被 undo、清理或删分支删除，只引用会让「已暂存快照保持不变」（FR-029）在这些路径下静默失效。`workingTreeEntryId` 只用于溯源与 `staged` 标志的一致性校验。
- FR-029：暂存后同一实体再被编辑时，本表的快照**保持不变**，后续编辑一律显示为未暂存；再次暂存才**原子替换**快照。工作树未变化时的重复暂存是无操作且不递增 revision。后续编辑 MUST NOT 按写入方身份分叉处理。
- FR-030（自包含不变式）：缓存区内每一条目的前置依赖要么已在 `baselineCommitId` 可达的 HEAD 链上，要么也在缓存区内。stage 正向扩展闭包、unstage 反向移除依赖者，两者都必须维持该不变式。
- FR-030：不可拆分的关系环整体纳入为一个原子单元；无法形成合法闭包 → `index_dependency_cycle`，缓存区**零变化**。
- FR-034：`clearIndex()` **只**删除本表行并递增 `indexRevision`；业务投影、`rxdb_working_tree_entry` 与 `workingTreeRevision` **逐字段不变**。
- FR-031：提交后本表对应行删除，`rxdb_working_tree_entry` 中已提交行删除，**未暂存的残量按新 HEAD 重新基线化**（residual rebase）而非丢弃。

---

## 6. 恢复会话与分支物化暂存

### 6.1 `RxDBWorkingTreeRestoreSession` → `rxdb_working_tree_restore_session`

**建表与 schema 迁移随 US3 交付**（FR-036）；创建与生命周期语义归 US5（FR-042..FR-047）。

| 字段                          | 类型           | 约束                   | 说明                                            |
| ----------------------------- | -------------- | ---------------------- | ----------------------------------------------- |
| `id`                          | uuid           | PK                     |                                                 |
| `branchId`                    | uuid           | FK，index              |                                                 |
| `targetCommitId`              | uuid           | FK → `rxdb_commit.id`  | 恢复目标                                        |
| `preRestoreHeadCommitId`      | uuid           | FK → `rxdb_commit.id`  | 恢复前 HEAD                                     |
| `expectedHeadRevision`        | number         | not null               | 建立会话时捕获                                  |
| `expectedIndexRevision`       | number         | not null               | 建立会话时捕获                                  |
| `expectedActivationRevision`  | number         | not null               | 建立会话时捕获                                  |
| `producedWorkingTreeRevision` | number         | not null               | 恢复产生的工作树 revision                       |
| `replayDirection`             | enum           | not null               | `forward`（基线→目标）\| `reverse`（HEAD→目标） |
| `targetManifest`              | json           | not null               | 目标 schema 指纹 + 编解码版本                   |
| `scope`                       | enum           | not null               | `wholeTree` \| `entitySubset`                   |
| `scopeKeys`                   | json \| null   |                        | `entitySubset` 时的实体键集合                   |
| `status`                      | enum           | not null               | `active` \| `conflicted` \| `committed`         |
| `appliedUnitCount`            | number         | not null               | 断点续做游标                                    |
| `totalUnitCount`              | number         | not null               |                                                 |
| `operationId`                 | string \| null | unique（同 §2.5 形态） | 重复触发幂等                                    |
| `createdAt` / `updatedAt`     | number         | not null               | 数据库时钟                                      |

**规则**:

- **生命周期只有三态**：`active`（恢复结果在工作树中、未提交）、`conflicted`（expected 与当前值已分叉，由读路径派生并持久标记）、`committed`（已生成新提交）。用户**丢弃**时会话行被**删除**而非置为某个终态——留一行「已丢弃」会让 `conflicted` 的派生条件（FR-033「仍存在且已分叉的会话」）失真。
- FR-042：恢复以**新提交**表达（不改写历史）；`status = 'committed'` 时必然存在一条对应的 `rxdb_commit`，且该转换与新提交**在同一事务内**（FR-042「与会话状态转换原子提交」）。
- FR-045（CAS 非对称）：**初次恢复**条件更新失败 → 全量回滚且 **MUST NOT 创建会话**；只有**已成功存在**的会话在后续提交/丢弃冲突时才保留会话与工作树并派生 `conflicted`。
- FR-045：初次恢复要求缓存区为空，成功**只**递增 `workingTreeRevision`，**不**触碰 `indexRevision`；丢弃**仅在**用户后来暂存过恢复结果时才清空缓存区并递增 `indexRevision`。
- FR-046：完整差异为空 → 类型化无操作，**不创建本行**、不产生工作树/缓存区条目、不递增任何 revision。
- FR-044：`replayDirection` 与 `targetManifest` 在**任何持久写入前**确定；兼容性预检覆盖该路径上**每个**变更集，拒绝时返回首个不兼容提交 id + 重放方向 + 双方 manifest，且检查期间不解码或写入后续变更集。

### 6.2 `RxDBCommitBranchMaterializationAttempt` → `rxdb_commit_branch_materialization_attempt`

仅元数据远端分支首次切换时的**内部持久暂存**（FR-052，US6）。

| 字段                      | 类型           | 约束                         | 说明                                    |
| ------------------------- | -------------- | ---------------------------- | --------------------------------------- |
| `id`                      | uuid           | PK                           | 尝试标识；失败后按此 id 清理            |
| `targetBranchId`          | uuid           | FK → `rxdb_branch.id`，index |                                         |
| `targetBranchIdentity`    | json           | not null                     | 冻结的目标身份（远端分支标识 + 代次）   |
| `frozenTerminalWatermark` | string         | not null                     | 开始时冻结的远端终止水位                |
| `scopeManifest`           | json           | not null                     | 冻结的同步范围                          |
| `committedPageWatermark`  | string \| null |                              | **已提交**的分页水位，崩溃后据此续传    |
| `payloadFingerprint`      | string         | not null                     | 内容指纹，提交屏障处复核                |
| `status`                  | enum           | not null                     | `staging` \| `converged` \| `abandoned` |
| `createdAt` / `updatedAt` | number         | not null                     | 数据库时钟                              |

**规则**:

- FR-052：暂存期间**当前业务投影、激活标记、当前分支同步水位、工作树全部不变**；MUST NOT 先激活空分支再等后续同步修补。
- FR-052：完整收敛后由**单一事务的提交屏障**复核激活令牌、目标身份、终止水位、范围与指纹，一次性物化、建立 `branch_baseline` 与 `rxdb_commit_branch_ref` 行、激活目标、递增 `activationRevision`，并**原子删除本行**（INV-12）。
- FR-052：分页崩溃后从 `committedPageWatermark` 续传，不重复应用、不跳过；目标身份或同步范围已变化时置 `abandoned` 并从新冻结水位重建。
- FR-052：依据不足、网络失败、范围漂移、配额不足或不收敛 → `branch_not_materialized`，全量回滚，只留可安全续传或按 `id` 清理的本行。
- FR-051：`removeBranch()` 在同一事务内一并删除该分支的本表行。

---

## 7. 跨实体不变式（可测清单）

| ID     | 不变式                                                                                            | 违反时                                                  |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| INV-1  | 至多一行 `rxdb_branch.activated = TRUE`；每次连接至少一行                                         | `ambiguous_active_branch`                               |
| INV-2  | 每**已物化**分支恰好一条根提交（`baseline` 或 `branch_baseline`）且 `parentId IS NULL`            | `commit_graph_corrupted`                                |
| INV-3  | `headCommitId` 可达 `baselineCommitId`；损坏按**分支**隔离，其他健康分支照常可用                  | `commit_graph_corrupted` → 该分支 `corrupted_read_only` |
| INV-4  | HEAD 链 + 工作树条目 = 当前业务数据                                                               | 冷重放断言失败（SC-002）                                |
| INV-5  | 缓存区自包含（依赖闭包完整）                                                                      | `index_dependency_cycle`                                |
| INV-6  | `rxdb_index_entry.workingTreeEntryId` 一一对应且对应条目 `staged = TRUE`                          | 一致性断言失败                                          |
| INV-7  | 幂等键 `(originBranchId, originBranchGeneration, operationId)` 唯一                               | `idempotency_key_reused`                                |
| INV-8  | 所有 `patch` / `inversePatch` 列在启用加密时无明文哨兵                                            | SC-009 失败                                             |
| INV-9  | 查询缓存实体在 11 张新表中出现次数为 0                                                            | FR-021 失败                                             |
| INV-10 | 未启用数据库中上述新表数量为 0                                                                    | SC-008 失败                                             |
| INV-11 | `rxdb_commit_capability_state` 与 `rxdb_working_tree_activation_state` 各恰好一行（主键常量保证） | 迁移断言失败                                            |
| INV-12 | 分支物化成功后 `rxdb_commit_branch_materialization_attempt` 无残留行                              | FR-052 失败                                             |
| INV-13 | `rxdb_commit_branch_ref` 行的存在 ⟺ 分支已物化（不存在 `headCommitId IS NULL` 的行）              | FR-013 失败                                             |

INV-1..INV-13 全部落成两套一致性套件的断言（见 [contracts/conformance-suites.md](./contracts/conformance-suites.md)），在 6 个 v1 后端上逐一执行。

---

## 8. 迁移影响

| 变更                                        | 类型                    | 说明                                                          |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `RXDB_SYSTEM_SCHEMA_VERSION` 3 → 4          | 破坏性（需 bridge tag） | [R-015](./research.md#r-015-bridge-tag-前置条件) 为前置阻塞项 |
| 新增 **11** 张表                            | 仅启用时                | 未启用 = 零表零行为差异（INV-10）                             |
| `rxdb_branch` 增加部分唯一索引              | 就地                    | 迁移前校验 INV-1                                              |
| `EntityIndexMetadataOptions.where`          | 新增可选字段            | 向后兼容，既有声明不受影响                                    |
| `TransactionExecutor.mergeChanges` 第三形参 | 内部契约破坏性          | 不在公开 API 基线内                                           |
| `SwitchBranchOptions` 追加必填 `intent`     | 内部契约破坏性          | 同上；公开侧的 `WorkingTreeSwitchBranchOptions` 是另一回事    |

上述两处内部契约变更合计 **11 个受信调用点**同批改（[R-006](./research.md#r-006-写入意图枚举与受信登记)、[adapter-contract §4](./contracts/adapter-contract.md#4-写入口受信登记)）。

**迁移期的额外判据**:

- 任一**本地分支**无法完整物化 ⇒ **整个迁移失败**、零变化，不留部分启用状态（FR-013）。仅有元数据的远端分支是唯一例外，跳过而不建行。
- 草稿缓存中的 NEW 草稿既不进基线也不被删除（FR-024）。
- 既有变更记录、当前激活分支与业务数据零改变；重复启动幂等（FR-010）。
