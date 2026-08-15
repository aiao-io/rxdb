# Contract: 核心包公开 API（`@aiao/rxdb`）

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
  enabled: boolean            // 该数据库是否已启用
  systemSchemaVersion: number // 实际系统 schema 版本
  supported: boolean          // 当前写入方是否支持该版本
}

rxdb.commits.capability(): Promise<CommitCapability>
```

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
  operationId?: string       // 幂等键；同键同内容重试返回原提交
  allowEmpty?: false         // 类型上钉死为 false —— 空提交不被支持（FR-006）
}

CommitSummary {
  commitId: string
  parentId: string
  unitCount: number
  reused: boolean            // true = 幂等命中，HEAD 未推进
  revisions: WorkingTreeRevisions
}
```

## 6. 提交历史

```
rxdb.commits: CommitApi

CommitApi {
  capability(): Promise<CommitCapability>
  head(branchId?: string): Promise<CommitRef>
  list(query: CommitHistoryQuery): Promise<CommitHistoryPage>
  changeSet(commitId: string): Promise<CommitChangeSetUnit[]>
}

CommitHistoryQuery {
  branchId?: string                                   // 缺省 = 当前激活分支
  entity?: { entity: string; entityId: string }       // 按实体过滤
  cursor?: string                                     // UUID v7 游标
  limit?: number
}

CommitHistoryPage {
  items: CommitRef[]
  nextCursor: string | null
}
```

排序：拓扑序为主、`createdAt` 为次级、提交内 `sequence` 为再次级（FR-007）。未物化分支 → `branch_not_materialized`。

## 7. 恢复（US5）

```
rxdb.workingTree.restore(options: RestoreOptions): Promise<RestoreSummary>

RestoreOptions {
  targetCommitId: string
  scope: { kind: 'wholeTree' } | { kind: 'entitySubset'; refs: Array<{entity: string; entityId: string}> }
  operationId?: string
  expect: WorkingTreeRevisions
}

RestoreSummary {
  commitId: string        // 恢复以新提交表达，历史不被改写（FR-043）
  restoredUnitCount: number
  reused: boolean
}
```

## 8. 分支隔离与切换（US6）

```
WorkingTreeSwitchBranchOptions {
  branchId: string
  expect: WorkingTreeRevisions
  onDirty: 'reject' | 'carryOver'   // 缺省 'reject'
}

rxdb.workingTree.switchBranch(options: WorkingTreeSwitchBranchOptions): Promise<WorkingTreeStatus>
```

- 缺省拒绝带脏工作树切换（保守默认；spec 已裁定的兼容口径）。
- 未物化目标分支 → `branch_not_materialized`。
- 切换后工作树与缓存区严格按分支隔离，互不可见（FR-048..FR-053）。

## 9. 错误契约

统一基类 `WorkingTreeCommandError`（含 `code`、`operation`、`subject`、`recovery`），子类按 code 分派：

| code | 触发条件 | 恢复建议方向 |
| --- | --- | --- |
| `commit_capability_mismatch` | 写入方不支持该库的系统 schema 版本 | 升级写入方 |
| `ambiguous_active_branch` | 检测到多个激活分支 | 人工裁定后重跑迁移 |
| `stale_active_branch` | `activationRevision` 不匹配 | 刷新后重试 |
| `idempotency_key_reused` | 同键不同内容 | 换 `operationId` |
| `index_dependency_cycle` | 无法形成合法闭包 | 扩大选择范围或整事务暂存 |
| `mixed_versioned_cache_transaction` | 同事务混写查询缓存与版本化实体 | 拆分事务 |
| `incompatible_schema` | 目标提交的 schema 与当前不兼容 | 先迁移 |
| `branch_not_materialized` | 目标分支未物化 | 先物化分支 |
| `commit_graph_corrupted` | DAG 不变式被破坏 | 进入只读诊断 |
| `corrupted_read_only` | 检出损坏后降级 | 导出诊断信息 |
| `writer_fenced` | 迁移 epoch 落后 | 重连 |
| `benchmark_environment_mismatch` | runner profile 与参考不符 | 换固定 runner |

所有错误 MUST 携带**操作、对象、恢复建议**三要素（FR-039、US-306c AC3）。

## 10. 内部契约变更（不进公开基线）

[`TransactionExecutor.mergeChanges`](../../../packages/rxdb/src/transaction/transaction-executor.interface.ts) 第三形参 `disableTriggers?: boolean` → `intent: RxDBWriteIntent`：

```
enum RxDBWriteIntent {
  local, remoteSync, merge, undoRedo, restore,
  branchMaterialization, baselineMaterialization, expiredCleanup
}
```

8 个受信调用点见 [contracts/adapter-contract.md §4](./adapter-contract.md#4-写入口受信登记)。
