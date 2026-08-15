# Phase 1 Data Model: 本地工作树与提交历史

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md) | **Date**: 2026-08-15

本文件把 spec.md 的 13 个 Key Entities 落成具体的系统表、字段、关系、约束与状态迁移。全部实体位于 `namespace: 'rxdb'`，`log: false`（系统表自身不进变更日志），随 `RXDB_SYSTEM_SCHEMA_VERSION = 4` 建立，且**仅在数据库启用提交能力时存在**（[R-004](./research.md#r-004-系统-schema-版本与启用迁移)）。

---

## 1. 实体总览

| # | 实体 | 表名 | 基数 | 归属故事 |
| --- | --- | --- | --- | --- |
| 1 | `RxDBCommit` | `rxdb_commit` | 每提交一行 | US1 |
| 2 | `RxDBCommitChangeSet` | `rxdb_commit_change_set` | 每变更单元一行 | US1 |
| 3 | `RxDBCommitBranchRef` | `rxdb_commit_branch_ref` | 每分支一行 | US1 / US6 |
| 4 | `RxDBWorkingTreeEntry` | `rxdb_working_tree_entry` | 每未提交单元一行 | US2 |
| 5 | `RxDBWorkingTreeState` | `rxdb_working_tree_state` | 每分支一行 | US2 / US3 |
| 6 | `RxDBIndexEntry` | `rxdb_index_entry` | 每已暂存单元一行 | US3 |
| 7 | `RxDBRestoreSession` | `rxdb_restore_session` | 每恢复会话一行 | US5 |
| 8 | `RxDBBranch`（既有，扩展） | `rxdb_branch` | — | US1 / US6 |

派生型（不落表，运行时计算）：`WorkingTreeStatus`、`WorkingTreeDiff`、`WorkingTreeSelection`、`WorkingTreeStageResult`、`CommitCapability`。契约见 [contracts/core-api.md](./contracts/core-api.md)。

---

## 2. 提交图（US1）

### 2.1 `RxDBCommit` → `rxdb_commit`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | UUID v7，时间有序（[R-008](./research.md#r-008-提交标识与幂等键)） |
| `parentId` | uuid \| null | FK → `rxdb_commit.id`，index | `null` 仅出现在基线提交 |
| `branchId` | uuid | FK → `rxdb_branch.id`，index | 提交归属分支 |
| `branchGeneration` | number | not null | 分支代次，随同名分支重建递增 |
| `kind` | enum | not null | `baseline` \| `normal` |
| `message` | string | not null | 基线提交为固定系统文案 |
| `unitCount` | number | not null | 变更单元数，供列表页免 join 计数 |
| `operationId` | string \| null | 见 §2.4 | 幂等键 |
| `createdAt` | number | not null，index | |
| `updatedAt` | number | not null | |

**规则**

- FR-002：每个已启用数据库的每个分支恰好有一条 `kind = 'baseline'` 且 `parentId IS NULL` 的提交。
- FR-004：`parentId` 构成有向无环图；写入前校验祖先可达，不可达则 `commit_graph_corrupted`。
- FR-006：空提交被拒绝——`unitCount = 0` 的 `normal` 提交不允许写入（基线提交豁免）。

### 2.2 `RxDBCommitChangeSet` → `rxdb_commit_change_set`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `commitId` | uuid | FK → `rxdb_commit.id`，index | |
| `transactionId` | uuid | index | 原始事务分组，供依赖闭包回溯 |
| `sequence` | number | not null | 提交内稳定顺序（拓扑序结果） |
| `type` | enum | not null | `insert` \| `update` \| `delete` |
| `namespace` | string | not null | |
| `entity` | string | not null，复合 index `(entity, entityId)` | |
| `entityId` | string | not null | |
| `patch` | json | not null，**经信封** | [R-009](./research.md#r-009-加密信封复用) |
| `inversePatch` | json | not null，**经信封** | 支撑 US5 恢复 |
| `createdAt` | number | not null | |

**规则**

- FR-003：内容整体复制，不引用 `rxdb_change`；压缩/删分支/回滚标记不得影响本表。
- FR-007：按实体查历史走 `(entity, entityId)` 复合索引；排序主键为提交拓扑序，次级为 `createdAt`，再次级为 `sequence`。

### 2.3 `RxDBCommitBranchRef` → `rxdb_commit_branch_ref`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `branchId` | uuid | FK → `rxdb_branch.id`，**unique** | 一分支一行 |
| `generation` | number | not null | 不可变代次，参与幂等键 |
| `headCommitId` | uuid | FK → `rxdb_commit.id` | **HEAD 的唯一真相源**（FR-001） |
| `baselineCommitId` | uuid | FK → `rxdb_commit.id`，immutable | |
| `materialized` | boolean | not null | `false` → 读取该分支历史返回 `branch_not_materialized` |
| `revision` | number | not null | HEAD 推进的 CAS 版本（[R-005](./research.md#r-005-revision-的实现与两类校验)） |
| `updatedAt` | number | not null | |

**规则**

- FR-001 / FR-015：**不**存「当前分支 id」。当前分支恒由 `RxDBBranch.activated` 表达。
- FR-005：HEAD 只能推进到自身子孙提交；否则 `commit_graph_corrupted`。

### 2.4 幂等约束

唯一索引 `rxdb_commit_idempotency`：`UNIQUE (branchId, branchGeneration, operationId) WHERE operationId IS NOT NULL`。

- 命中且内容一致 → 返回原提交，HEAD 不推进（FR-009）。
- 命中且内容不一致 → `idempotency_key_reused`，原记录不被覆盖。
- 同名分支重建后 `generation` 递增，旧键不再碰撞。

---

## 3. 分支激活（US1 / US6）

对既有 [`RxDBBranch`](../../packages/rxdb/src/system/branch.ts) 追加一条部分唯一索引（[R-003](./research.md#r-003-head-的唯一真相源与激活分支基数约束)）：

```
{ name: 'rxdb_branch_single_activated', properties: ['activated'], unique: true,
  where: { property: 'activated', equals: true } }
```

生成 `CREATE UNIQUE INDEX rxdb_branch_single_activated ON rxdb_branch (activated) WHERE activated = TRUE`，在 PGlite 与四个 SQLite 后端语义一致。

**规则**

- FR-012：迁移建索引前若存在多行 `activated = TRUE`，整个迁移失败并返回 `ambiguous_active_branch`，**不**按查询顺序任选。
- `activationRevision` 存于 `rxdb_working_tree_state`（§4.2），所有捕获型写操作一律校验（FR-053）。

---

## 4. 工作树（US2）

### 4.1 `RxDBWorkingTreeEntry` → `rxdb_working_tree_entry`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `branchId` | uuid | FK → `rxdb_branch.id`，复合 index `(branchId, staged)` | |
| `transactionId` | uuid | index | 与业务写同一事务内落库 |
| `sequence` | number | not null | 分支内单调序，决定重放顺序 |
| `intent` | enum | not null | `RxDBWriteIntent`（[R-006](./research.md#r-006-写入意图枚举与受信登记)） |
| `type` | enum | not null | `insert` \| `update` \| `delete` |
| `namespace` / `entity` / `entityId` | string | 复合 index `(entity, entityId)` | |
| `patch` / `inversePatch` | json | **经信封** | |
| `staged` | boolean | not null，default `false` | `true` ⇒ `rxdb_index_entry` 存在对应行 |
| `createdAt` | number | not null | |

**规则**

- FR-018：条目与业务数据写入**同一事务**；事务回滚 ⇒ 两者同时不存在（半状态率 0，SC-002）。
- FR-020：`intent ∈ {branchMaterialization, baselineMaterialization}` 的写入**不**产生条目。
- FR-021：`sync.type === SyncType.QueryCache` 的实体完全不产生条目（[R-010](./research.md#r-010-查询缓存实体的排除判定)）。
- FR-023：任意时刻「HEAD 提交链 + 本表按 `sequence` 重放」= 当前业务数据（冷重放不变式）。

### 4.2 `RxDBWorkingTreeState` → `rxdb_working_tree_state`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `branchId` | uuid | FK → `rxdb_branch.id`，**unique** | |
| `workingTreeRevision` | number | not null | 事务内读改写型（并发不失败） |
| `indexRevision` | number | not null | 调用方捕获型（可因并发失败） |
| `activationRevision` | number | not null | 调用方捕获型；不匹配 → `stale_active_branch` |
| `phase` | enum | not null | `clean` \| `modified` \| `staged` \| `restoring` \| `conflicted` |
| `updatedAt` | number | not null | |

**规则**

- FR-035 / SC-007：语义无操作（stage 空集、unstage 不存在项、discard 已 clean）**不**递增任何 revision。
- 三个 revision 相互独立递增；一次命令可能只动其中一个。

### 4.3 状态迁移

```
                 ┌──────────── discard ────────────┐
                 v                                  │
  clean ──write──> modified ──stage──> staged ──commit──> clean
    ^                 ^                   │
    │                 └──── unstage ──────┘
    │
    └── restore 完成 ── restoring ←── restore 开始（自 clean/modified/staged）
                            │
                            └── 检出冲突 ──> conflicted ──解决──> modified
```

- `restoring` 是持久状态，跨重启可见（FR-042）；重连后据 `rxdb_restore_session` 恢复或回滚，不停留在半状态。
- `conflicted` 由 US6 的分支切换与冲突路径产生；解决后回到 `modified`。

---

## 5. 缓存区（US3）

### `RxDBIndexEntry` → `rxdb_index_entry`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `branchId` | uuid | FK，复合 index `(branchId, sequence)` | |
| `workingTreeEntryId` | uuid | FK → `rxdb_working_tree_entry.id`，**unique** | 一对一 |
| `sequence` | number | not null | 稳定拓扑序（[R-007](./research.md#r-007-依赖闭包算法)） |
| `stagedAt` | number | not null | |

**规则**

- FR-030（自包含不变式）：缓存区内每一条目的前置依赖要么已在 HEAD，要么也在缓存区内。stage 正向扩展闭包、unstage 反向移除依赖者，两者都必须维持该不变式。
- FR-031：不可拆分的关系环整体纳入为一个原子单元；无法形成合法闭包 → `index_dependency_cycle`，缓存区**零变化**。
- 提交后：本表对应行删除，`rxdb_working_tree_entry` 中已提交行删除，**未暂存的残量按新 HEAD 重新基线化**（residual rebase）而非丢弃（FR-033）。

---

## 6. 恢复会话（US5）

### `RxDBRestoreSession` → `rxdb_restore_session`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid | PK | |
| `branchId` | uuid | FK，index | |
| `targetCommitId` | uuid | FK → `rxdb_commit.id` | 恢复目标 |
| `scope` | enum | not null | `wholeTree` \| `entitySubset` |
| `scopeKeys` | json \| null | | `entitySubset` 时的实体键集合 |
| `status` | enum | not null | `pending` \| `applying` \| `completed` \| `rolledBack` |
| `appliedUnitCount` | number | not null | 断点续做游标 |
| `totalUnitCount` | number | not null | |
| `operationId` | string \| null | unique（同 §2.4 形态） | 重复触发幂等 |
| `createdAt` / `updatedAt` | number | not null | |

**规则**

- FR-043：恢复以**新提交**表达（不改写历史）；`status = completed` 时必然存在一条对应的 `rxdb_commit`。
- FR-045：中途崩溃 ⇒ 重连后据 `status` + `appliedUnitCount` 续做或整体回滚，两种终态都不留半状态。
- 恢复期间 `RxDBWorkingTreeState.phase = 'restoring'`。

---

## 7. 跨实体不变式（可测清单）

| ID | 不变式 | 违反时 |
| --- | --- | --- |
| INV-1 | 至多一行 `rxdb_branch.activated = TRUE` | `ambiguous_active_branch` |
| INV-2 | 每分支恰好一条基线提交，且 `parentId IS NULL` | `commit_graph_corrupted` |
| INV-3 | `headCommitId` 可达 `baselineCommitId` | `commit_graph_corrupted` |
| INV-4 | HEAD 链 + 工作树条目 = 当前业务数据 | 冷重放断言失败（SC-002） |
| INV-5 | 缓存区自包含（依赖闭包完整） | `index_dependency_cycle` |
| INV-6 | `rxdb_index_entry.workingTreeEntryId` 一一对应且 `staged = TRUE` | 一致性断言失败 |
| INV-7 | 幂等键 `(branchId, generation, operationId)` 唯一 | `idempotency_key_reused` |
| INV-8 | 所有 `patch` / `inversePatch` 列在启用加密时无明文哨兵 | SC-009 失败 |
| INV-9 | 查询缓存实体在 5 张新表中出现次数为 0 | FR-021 失败 |
| INV-10 | 未启用数据库中上述新表数量为 0 | SC-008 失败 |

INV-1..INV-10 全部落成两套一致性套件的断言（见 [contracts/conformance-suites.md](./contracts/conformance-suites.md)），在 6 个 v1 后端上逐一执行。

---

## 8. 迁移影响

| 变更 | 类型 | 说明 |
| --- | --- | --- |
| `RXDB_SYSTEM_SCHEMA_VERSION` 3 → 4 | 破坏性（需 bridge tag） | [R-015](./research.md#r-015-bridge-tag-前置条件) 为前置阻塞项 |
| 新增 7 张表 | 仅启用时 | 未启用 = 零表零行为差异 |
| `rxdb_branch` 增加部分唯一索引 | 就地 | 迁移前校验 INV-1 |
| `EntityIndexMetadataOptions.where` | 新增可选字段 | 向后兼容，既有声明不受影响 |
| `TransactionExecutor.mergeChanges` 第三形参 | 内部契约破坏性 | 不在公开 API 基线内；8 个调用点同批改（[R-006](./research.md#r-006-写入意图枚举与受信登记)） |
