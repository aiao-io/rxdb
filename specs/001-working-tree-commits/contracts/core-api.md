# Contract: 核心包公开 API（`@aiao/rxdb`）

> [!WARNING]
> **本文件已过期（2026-08-22）。** 上游 [epic-006](../../../requirements/epics/epic-006-working-tree-commits.md) 已裁决
> **不做暂存区（index / staging area）与任何形式的选择性提交**：没有 `stage` / `unstage` / `clearIndex`，
> `commit(message)` 只提交当前分支工作树的全部未提交变更，隔离工作线用分支。
> 本文件仍按「工作树 → 缓存区 → 提交」三层写成，其中所有 `Index*` / `RxDBIndexEntry` / `indexRevision` /
> `staged` 相关的表、契约、状态迁移、验收项与基准 fixture **均已作废，不得据此实现**。
> 真相源以 `requirements/` 为准；本目录需要用 `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` 重新生成。

**Feature**: [spec.md](../spec.md) | **Data Model**: [data-model.md](../data-model.md) | **Date**: 2026-08-15

本文件冻结 `@aiao/rxdb` 新增的公开导出。全部经由既有单一入口 `.` 导出（不新增 subpath）。**命名纪律（FR-054）**：新导出禁止使用 `Workspace*` 前缀（已被 [`@aiao/rxdb-plugin-workspace`](../../../packages/rxdb-plugin-workspace/src/index.ts) 占用）；切换分支选项固定为 `WorkingTreeSwitchBranchOptions`，**不得**复用既有 [`SwitchBranchOptions`](../../../packages/rxdb/src/rxdb-adapter.ts#L55)。

每个导出都 MUST 带 TSDoc（宪法 I）。签名以下列语义为准，实现时逐条对齐。

---

## 1. 启用配置

扩展 [`RxDBOptions`](../../../packages/rxdb/src/rxdb.interface.ts#L83)：

```
RxDBOptions {
  ...既有字段
  commits?: { enabled: boolean }
}
```

- 缺省 `undefined` ≡ 未启用 ≡ 零新表、零行为差异（FR-011、SC-008）。
- 启用是**数据库级、单向**的：一旦启用不可回退为未启用（FR-010）。
- 已启用数据库被未启用的写入方打开 → `commit_capability_mismatch`，拒绝写入而非静默降级。

## 2. 能力协商

```
CommitCapability {
  enabled: boolean               // 该数据库是否已启用
  commitProtocolVersion: number  // 库中持久化的提交协议版本
  systemSchemaVersion: number    // 实际系统 schema 版本
  changeCodecVersion: number     // 变更编解码版本
  supported: boolean             // 当前写入方是否支持上述三个版本
}

rxdb.commits.capability(): Promise<CommitCapability>
```

对应持久表 `rxdb_commit_capability_state`（[data-model §2.4](../data-model.md#24-rxdbcommitcapabilitystate--rxdb_commit_capability_state)，全库单行）。协商发生在**连接时**：`supported = false` 的写入方在**首笔业务写入前**得到 `commit_capability_mismatch`，或进入调用方明确请求的只读模式——不允许一个实例维护 revision 而另一个继续裸写（FR-011）。

## 3. 工作树入口

```
rxdb.workingTree: WorkingTreeApi

WorkingTreeApi {
  status(): Promise<WorkingTreeStatus>
  diff(selection?: WorkingTreeSelection): Promise<WorkingTreeDiff>
  stage(selection: WorkingTreeSelection, expect: WorkingTreeRevisions): Promise<WorkingTreeStageResult>
  unstage(selection: WorkingTreeSelection, expect: WorkingTreeRevisions): Promise<WorkingTreeStageResult>
  clearIndex(expect: WorkingTreeRevisions): Promise<WorkingTreeStageResult>
  discard(selection: WorkingTreeSelection, expect: WorkingTreeRevisions): Promise<void>
  commit(message: string, options: CommitOptions): Promise<CommitSummary>
  observe(): Observable<WorkingTreeStatus>
}
```

`expect: WorkingTreeRevisions` 是**调用方捕获型**校验的载体（[R-005](../research.md#r-005-revision-的实现与两类校验)）：

```
WorkingTreeRevisions {
  activationRevision: number   // 必填，一律校验；不匹配 → stale_active_branch
  indexRevision?: number       // stage/unstage/clearIndex/commit 必填
  workingTreeRevision?: number // discard 必填
}
```

普通 CRUD **不**接收 `expect` —— 其 `workingTreeRevision` 走事务内读改写，不因并发失败（FR-032）。

## 4. 状态与差异类型

```
WorkingTreeStatus {
  phase: 'clean' | 'modified' | 'staged' | 'restoring' | 'conflicted'
  revisions: WorkingTreeRevisions   // 三个 revision 全量
  branchId: string
  headCommitId: string
  unstagedCount: number
  stagedCount: number
}

WorkingTreeDiff {
  headToWorkingTree: WorkingTreeDiffUnit[]
  headToIndex: WorkingTreeDiffUnit[]
}

WorkingTreeDiffUnit {
  entryId: string
  type: 'insert' | 'update' | 'delete'
  namespace: string
  entity: string
  entityId: string
  staged: boolean
}

WorkingTreeSelection =
  | { kind: 'all' }
  | { kind: 'entries'; entryIds: string[] }
  | { kind: 'entities'; refs: Array<{ entity: string; entityId: string }> }

WorkingTreeStageResult {
  requested: string[]   // 调用方点名的 entryId
  closure: string[]     // 实际生效的依赖闭包（可能是 requested 的超集）
  added: string[]
  removed: string[]
  revisions: WorkingTreeRevisions  // 操作后的新值
}
```

`closure ⊇ requested` 且必须**显式回传**（FR-029）：调用方点名 3 项、实际暂存 7 项时，UI 要能如实展示这 7 项。

## 5. 提交

```
CommitOptions {
  authorId: string           // 必填。调用方提供；空串/纯空白即拒绝（FR-004）
  operationId: string        // 必填。幂等键；同键同内容重试返回原提交
  metadata?: Record<string, unknown>   // 仅扩展审计字段，见下方保留键约束
  allowEmpty?: false         // 类型上固定为 false —— 空提交不被支持（FR-005）
}

CommitSummary {
  commitId: string
  parentId: string
  unitCount: number
  reused: boolean            // true = 幂等命中，HEAD 未推进
  revisions: WorkingTreeRevisions
}
```

**提交前置校验**（FR-004，在**任何持久状态变化前**执行，失败时 HEAD 与工作树零变化）：

- `message.trim()` 非空 → 否则 `commit_message_empty`
- `authorId.trim()` 非空 → 否则 `commit_author_required`；**MUST NOT** 从空值、设备名或写入方标识伪造
- `operationId` 非空 → 否则 `commit_operation_id_required`
- 缓存区非空 → 否则 `commit_empty`

**`metadata` 保留键**（FR-004）：`metadata` 只能携带扩展审计字段，**MUST NOT** 覆盖 `parentId`、`createdAt`、`authorId`、`operationId`、`changeCodecVersion`、`schemaFingerprints`、`unitCount`。命中保留键 → `commit_metadata_reserved_key`。

系统根节点（`baseline` / `branch_baseline`）是仅有的无用户作者/消息节点，它们不经本入口创建，且该例外 **MUST NOT** 放宽普通提交的上述四条。

## 6. 提交历史

```
rxdb.commits: CommitApi

CommitApi {
  capability(): Promise<CommitCapability>
  head(branchId?: string): Promise<CommitRef>
  log(query?: CommitHistoryQuery): Promise<CommitHistoryPage>
  show(commitId: string): Promise<CommitDetail>
}

CommitHistoryQuery {
  branchId?: string                                   // 缺省 = 当前激活分支
  entity?: { entity: string; entityId: string }       // 按实体过滤
  since?: number                                      // 数据库时间下界
  cursor?: string                                     // UUID v7 游标
  limit?: number
}

CommitHistoryPage {
  items: CommitRef[]
  nextCursor: string | null
}

CommitDetail {
  commitId: string
  kind: 'baseline' | 'branch_baseline' | 'normal'
  message: string
  authorId: string | null       // 系统根节点为 null
  createdAt: number             // 数据库时钟
  parentId: string | null
  entityCount: number           // 涉及实体数量
  unitCount: number
  units: CommitChangeSetUnit[]  // 变更摘要
}
```

方法名沿用 US-305 的口径：`log()` / `show()`，不用 `list()` / `changeSet()`。

**可达性语义（FR-007，最易被实现错的一条）**：`log({ branchId })` MUST 从该分支的 `rxdb_commit_branch_ref.headCommitId` 沿 `parentId` 遍历**完整可达父链**。`rxdb_commit.originBranchId` 只是审计用的创建位置标记，**MUST NOT** 被用作过滤条件——按 `originBranchId = branchId` 过滤会把继承自父分支的历史截断掉。

排序：拓扑序为主、`createdAt`（**数据库时钟**）为次级、提交内 `sequence` 为再次级（FR-007）。未物化分支（无 `rxdb_commit_branch_ref` 行）→ `branch_not_materialized`。

## 7. 恢复（US5）

```
rxdb.workingTree.restore(options: RestoreOptions): Promise<RestoreSummary>

RestoreOptions {
  targetCommitId: string
  scope: { kind: 'wholeTree' } | { kind: 'entitySubset'; refs: Array<{entity: string; entityId: string}> }
  operationId?: string
  expect: WorkingTreeRevisions
}

RestoreResult =
  | { kind: 'noop' }                                  // 目标与 HEAD 物化内容相同（FR-046）
  | { kind: 'restored'; session: WorkingTreeRestoreSessionRef }

WorkingTreeRestoreSessionRef {
  sessionId: string
  targetCommitId: string
  replayDirection: 'forward' | 'reverse'
  restoredUnitCount: number
  status: 'active' | 'conflicted' | 'committed'
  revisions: WorkingTreeRevisions
}
```

**恢复不移动 HEAD、不产生提交**（FR-042）。它把目标数据物化为**普通、未暂存**的工作树条目并建立会话；用户显式暂存完整依赖闭包后，走普通 `commit()` 生成以**原 HEAD 为父节点**的新提交，会话在**同一事务内**转为 `committed`。未暂存时提交仍按空缓存区规则拒绝。

| 判据          | 要求                                                                                                                                                                       | 溯源   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 前置 clean    | 工作树非空或缓存区非空 → 拒绝；「仅已暂存」**不得**被误报为 clean                                                                                                          | FR-043 |
| 兼容性预检    | 先冻结确定性物化路径，再校验**该路径上每个** change set 的 schema 指纹与编解码版本；拒绝时返回**首个**不兼容提交 id、重放方向与双方 manifest，且不解码/写入后续 change set | FR-044 |
| 无操作        | 完整差异为空 → `{ kind: 'noop' }`：不创建会话、不产生条目、不递增任何 revision                                                                                             | FR-046 |
| CAS 非对称    | **初次恢复**失败 → 全量回滚且**不创建会话**；**已存在会话**的提交/丢弃失败 → 保留会话与工作树并派生 `conflicted`                                                           | FR-045 |
| revision 范围 | 初次恢复要求缓存区为空、**只**递增 `workingTreeRevision`；丢弃仅在用户后来暂存过时才清空缓存区并递增 `indexRevision`                                                       | FR-045 |
| 目标合法性    | 不存在 / 不可达 / 属于其他数据库 → 拒绝且工作树不变                                                                                                                        | FR-044 |

```
rxdb.workingTree.discardRestore(sessionId: string, expect: WorkingTreeRevisions): Promise<void>
```

丢弃使工作树回到当前 HEAD，**删除**会话行（而非置为某个终态），历史提交不变。

## 8. 分支隔离与切换（US6）

### 8.1 既有入口的默认行为**保持不变**

**FR-048 是本节的硬约束**，也是本契约里最容易被写错的一条。既有切换分支入口（[`VersionManager.switchBranch`](../../../packages/rxdb/src/version/VersionManager.ts)）：

- **默认无条件切换**，与本特性上线前逐字一致；
- **单参数签名 MUST 继续编译**：`switchBranch(branchId)` 不得成为编译错误；
- clean 检查 **MUST 作为显式选项提供**，不得成为缺省；
- 把默认改成拒绝 **MUST 走独立的破坏性变更故事**，不在本特性范围内。

```
switchBranch(branchId: string, options?: WorkingTreeSwitchBranchOptions): Promise<WorkingTreeStatus>

WorkingTreeSwitchBranchOptions {
  requireClean?: boolean          // 缺省 undefined ≡ false ≡ 既有无条件切换语义
  expect?: WorkingTreeRevisions   // 省略即不做调用方捕获型校验，与既有行为一致
}
```

**没有 `onDirty`，也没有 `carryOver`**：「自动 stash、stash pop 与跨分支携带脏工作树」是 spec 明列的**非目标**。脏工作树在切换后仍留在原分支，按分支隔离对新分支不可见——这不是「携带」，而是隔离的自然结果。

**类型兼容性测试（必需）**：`public-type-compatibility` 中断言 `switchBranch(branchId)` 单参调用仍通过类型检查，且适配器层 [`SwitchBranchOptions`](../../../packages/rxdb/src/rxdb-adapter.ts#L55) 的公开形态未被改动（其新增的 `intent` 是内部契约，见 §10）。

### 8.2 clean 的判定（`requireClean: true` 时）

工作树为空 **且** 缓存区为空 **且** 无活跃恢复会话 **且** 无由持久会话派生的未解决冲突。

- 「仅已暂存」**不是** clean；「恢复中」**不是** clean。
- 历史上一次普通条件更新失败 **MUST NOT** 构成非 clean 状态——失败的 CAS 不留痕。
- 非 clean 时返回 `working_tree_not_clean`，其 `recovery` **MUST 匹配真实成因**（未暂存改动 → 提交或丢弃；仅已暂存 → 提交或 `clearIndex()`；恢复会话 → 完成或 `discardRestore()`），不得给出与成因无关的通用建议。

### 8.3 其他约束

- 未物化目标分支 → `branch_not_materialized`。**唯一例外是 FR-052 的「仅有元数据的远端分支」**
  （`local=false, remote=true`、无 `rxdb_commit_branch_ref` 行、由 `syncBranches()` 拉到）：首次切换 MUST 走
  [§8.6 首次物化](#86-仅元数据远端分支的首次物化fr-052)，而不是直接拒绝。除该类分支外，切换 MUST NOT
  自动物化任何目标——本地分支缺 ref 属迁移未完成，直接 `branch_not_materialized`。
- 切换成功**只**递增 `activationRevision`，两个分支的 `workingTreeRevision` / `indexRevision` 变化量均为 **0**（FR-049）。
- 切换后工作树与缓存区严格按分支隔离，互不可见（FR-050）。
- 并发切换恰好 1 个成功，其余 `stale_active_branch`。

### 8.4 createBranch / removeBranch（FR-051）

既有分支入口在启用提交后追加以下语义，签名不变：

| 入口           | 追加语义                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `createBranch` | 见下方「一参 `createBranch` 的脏工作树语义」——**从当前物化状态创建**，复制源分支未提交工作树的独立快照，缓存区为空                     |
| `removeBranch` | 删除该分支的工作树条目、缓存区条目、状态行与 `rxdb_commit_branch_ref` 行；**MUST NOT** 删除提交行或 change set——其他分支可能仍可达它们 |

删除当前激活分支 → 拒绝；`removeBranch` 后遗留孤儿工作树/缓存区条目数量 MUST 为 **0**。

#### 一参 `createBranch` 的脏工作树语义（已裁决）

`createBranch(branchId)` 的既有用户可见语义是**从当前物化状态创建**——它把分叉点锚在当前分支的最后一笔
change 上，新分支切过去看到的就是「创建那一刻的全部数据」，其中自然包含启用提交能力后会被归类为
「未提交」的那部分。FR-048 / FR-051 把「既有公开签名与用户可见语义保持不变」定为硬约束，因此**裁决为
复制脏快照**，不是从 HEAD 创建：

| 维度                 | 规则                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `baseHeadCommitId`   | 与源分支当前 HEAD **相同**；新分支的 `branch_baseline` 根节点从该 HEAD 确定性派生                                              |
| 工作树条目           | **逐条复制**源分支全部未提交 `rxdb_working_tree_entry` 为新分支的独立行（新主键），来源与新分支 **MUST NOT** 共享可变条目      |
| 源分支已 staged 条目 | 在新分支**转为 unstaged**：`rxdb_index_entry` 不复制，新分支缓存区为空（FR-051「缓存区为空」）                                 |
| revision             | 新 `rxdb_commit_branch_ref` / `rxdb_working_tree_state` / `rxdb_index_state` 均从 **0** 起算；**源分支三个 revision 全部不变** |
| 原子性               | 复制与建 ref 在**同一事务**内完成；任一步失败则新分支与源分支均零变化                                                          |

**MUST NOT 实现成「新分支工作树与缓存区为空、不继承源分支未提交内容」**——那会让 `createBranch` 的用户可见
结果在启用提交能力前后不一致，直接违反 FR-048 / FR-051，也与 [US-308 US1-AC4](../../../requirements/stories/collaboration/US-308-branch-isolation-conflict.md)
相反。带历史标识的两参 `createBranch(branchId, fromChangeId)` 不适用本节：它按确定性分支基线锚定，
新分支工作树与缓存区**都为空**。

### 8.5 冲突描述类型

```
CommitConflict {
  operation: 'stage' | 'unstage' | 'clearIndex' | 'discard' | 'commit' | 'restore' | 'switchBranch'
  subject: { kind: 'branch' | 'entry' | 'session' | 'commit'; id: string }
  expected: WorkingTreeRevisions
  actual: WorkingTreeRevisions
  suggestedActions: Array<'refresh' | 'retry' | 'reselect' | 'discardRestore' | 'commitFirst'>
}
```

由**调用方捕获型**校验失败时派生（FR-032）。它是从操作、对象与 expected/actual revision 三元组算出来的**纯派生结构**——**MUST NOT** 为它新建第二张冲突表。三端 hook 原样透传该类型（[tri-framework-api §1](./tri-framework-api.md)）。

### 8.6 仅元数据远端分支的首次物化（FR-052）

§8.3 的「不自动物化」有且仅有这一个例外，此处把 §8.3 与 FR-052 的接缝写死，避免实现方在
「直接拒绝」与「自动物化」之间二选一。

**判定顺序**（`switchBranch` 事务开始前）：

1. 目标分支有 `rxdb_commit_branch_ref` 行 → 正常切换（§8.1–§8.3），不涉及本节。
2. 无 ref，且**不是** `local=false, remote=true` 的远端分支 → `branch_not_materialized`，**不物化**。
   本地分支缺 ref 属迁移未完成，自动物化会掩盖迁移缺陷。
3. 无 ref，且是 `syncBranches()` 拉到的 `local=false, remote=true` 分支 → 进入首次物化路径。

**首次物化路径**依 [data-model §6.2](../data-model.md#62-rxdbcommitbranchmaterializationattempt--rxdb_commit_branch_materialization_attempt)
的 `rxdb_commit_branch_materialization_attempt` 进行：冻结目标身份、sync scope 与远端终止水位 → 分页
落盘 payload/水位/fingerprint → 单一提交屏障复核后一次性物化。期间当前业务投影、激活标记、当前分支
`RxDBSync` 与工作树**全部不变**。

**仍返回 `branch_not_materialized` 的情形**（全量回滚，staging 可续传或按 attempt ID 清理）：依据不足、
缺父分支/远端 adapter/change、网络失败、scope 漂移、配额不足、不收敛。**MUST NOT** 先激活空分支再等后续同步修补。

**同步水位的落点**（补齐 §8.3 未定义的一环）：`RxDBSync` 按 `entity + branch` 保存水位，而 staging 冻结的是
**per-repository 的 scope manifest**。提交屏障 MUST 在同一事务内，按 scope manifest **逐实体**为目标分支
创建 `RxDBSync` 行并写入该实体冻结的终止水位——不得复制当前分支的水位，也不得留空等首次 `pull()` 补写
（留空会让目标分支的下一次 pull 从头重放）。目标分支已存在 `RxDBSync` 行时以冻结水位**原子覆盖**，
使「物化 → 立即 pull」不重复应用也不跳过远端 change。

## 9. 错误契约

统一基类 `WorkingTreeCommandError`（含 `code`、`operation`、`subject`、`recovery`），子类按 code 分派：

| code                                | 触发条件                                           | 恢复建议方向                                                          |
| ----------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `commit_capability_mismatch`        | 写入方不支持该库的系统 schema 版本                 | 升级写入方                                                            |
| `ambiguous_active_branch`           | 检测到多个激活分支                                 | 人工裁定后重跑迁移                                                    |
| `stale_active_branch`               | `activationRevision` 不匹配                        | 刷新后重试                                                            |
| `idempotency_key_reused`            | 同键不同内容                                       | 换 `operationId`                                                      |
| `commit_message_empty`              | 消息 trim 后为空                                   | 补写消息                                                              |
| `commit_author_required`            | 作者标识缺失或纯空白                               | 由调用方提供作者标识                                                  |
| `commit_operation_id_required`      | 幂等键缺失                                         | 提供 `operationId`                                                    |
| `commit_empty`                      | 缓存区为空                                         | 先暂存                                                                |
| `commit_metadata_reserved_key`      | `metadata` 命中保留键                              | 改用非保留键                                                          |
| `index_dependency_cycle`            | 无法形成合法闭包                                   | 扩大选择范围或整事务暂存                                              |
| `mixed_versioned_cache_transaction` | 同事务混写查询缓存与版本化实体                     | 拆分事务                                                              |
| `incompatible_schema`               | 恢复路径上某个提交的 schema/编解码版本与当前不兼容 | 先迁移；错误体携带**首个**不兼容提交 id 与双方 manifest               |
| `working_tree_not_clean`            | `requireClean: true` 且不满足 §8.2                 | 按**真实成因**分派：提交 / 丢弃 / `clearIndex()` / `discardRestore()` |
| `branch_not_materialized`           | 目标分支未物化                                     | 先物化分支                                                            |
| `commit_graph_corrupted`            | DAG 不变式被破坏                                   | 进入只读诊断                                                          |
| `corrupted_read_only`               | **该分支**检出损坏后降级                           | 导出诊断信息；切到其他健康分支                                        |
| `benchmark_environment_mismatch`    | runner profile 与参考不符                          | 换固定 runner                                                         |

所有错误 MUST 携带**操作、对象、恢复建议**三要素（FR-039、US-306 阶段 C AC3）。

**损坏是按分支隔离的**（FR-014）：`corrupted_read_only` / `commit_graph_corrupted` 只把**可达损坏的那条分支**置为只读损坏态——保留原引用与原始记录、不自动改指针、不删除任何行，阻止该分支的提交/恢复/切入，并返回首个损坏节点与修复建议；**其他健康分支照常可用**，不得整库降级。

`commit_metadata_reserved_key` 在 §5 四条前置校验**之后**、任何持久写入**之前**触发，同样保证 HEAD 与工作树零变化。

## 10. 内部契约变更（不进公开基线）

本特性改动**两处**内部契约，两处都不进公开 API 基线：

1. [`TransactionExecutor.mergeChanges`](../../../packages/rxdb/src/transaction/transaction-executor.interface.ts)（**本地重载**）第三形参 `disableTriggers?: boolean` → `intent: RxDBWriteIntent`。远端重载 `mergeChanges(actions, branchId?, changes?)` **不改**。
2. 适配器层 [`SwitchBranchOptions`](../../../packages/rxdb/src/rxdb-adapter.ts#L55) 追加内部字段 `intent?: RxDBWriteIntent`——用于区分 undo/redo、恢复、分支物化与仅元数据四类切换。

```
enum RxDBWriteIntent {
  local, remoteSync, merge, undoRedo, restore,
  branchMaterialization, baselineMaterialization, expiredCleanup, metadataOnly
}
```

**9 个枚举值**，与持久字段 `RxDBWorkingTreeEntry.origin` 的 **5 个值**是不同的东西：`intent` 是内部分派输入，`origin` 是落盘审计结果，多个 intent 收敛到同一 origin（[data-model §4.1](../data-model.md)）。二者 **MUST NOT** 合并为一个枚举。

**11 个受信调用点**（6 个 `mergeChanges` 本地重载 + 4 个 `switchBranch` + 1 个新增）见 [contracts/adapter-contract.md §4](./adapter-contract.md#4-写入口受信登记)。`push-repository.ts:534` 走远端重载，明确在范围外。
