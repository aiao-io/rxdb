# Contract: 核心公开 API

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

本文件冻结 `@aiao/rxdb` 对外暴露的**形状与语义**，不含实现。类型签名用 TypeScript 表达，因为它**就是**本库的用户契约。

> 旧 core-api.md 的 `stage()` / `unstage()` / `stagedCount` / `commit(selection)` / `diff('HEAD..index')` 全部作废，不在本文件中承接。

## 0. 命名门禁（SC-014 的可执行形式）

| 规则                                                                                   | 适用范围                     | 门禁宿主                        |
| -------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| 新增导出前缀 ∈ {`Commit`, `WorkingTree`}                                               | `packages/rxdb` 核心共享契约 | `scripts/audit/api-surface.mjs` |
| **无** `Index*` 新增导出                                                               | 全部包                       | 同上                            |
| **无** `Workspace*` 新增导出                                                           | 全部包（含三框架包）         | 同上                            |
| 不复用 `SwitchBranchOptions`                                                           | 全部包（含三框架包）         | 同上                            |
| 不复活 `stagedChange` / `unstageChange` / `stagedCount` / `WorkspaceCacheEntry.staged` | 全部包                       | 同上                            |

比对基线是 `requirements/api-baseline/*.json`。扫描排除 `dist/`、`out-tsc/`、`**/__tests__/**`、`*.suite.ts`、`*.spec.ts`。

三框架包**只适用负向规则**；运行时入口沿用各自既有 `use*` / 服务约定，`useWorkingTree()` 合规。

**前缀规则的三项登记例外**（T126 定案）：`RxDBBranchRemovalContext` / `RxDBBranchSwitchContext` / `RxDBBranchSwitchPreconditions`。三者是 `rxdb-plugin-system.ts` 上的插件系统扩展点上下文，与早已在基线里的同族 `RxDBBranchCreationContext` 逐字同形；改叫 `WorkingTree*` 会让核心的插件系统看起来认识工作树，而它恰恰不认识——`RxDBBranchSwitchPreconditions` 的 TSDoc 把「核心搬运、插件解释」这条分工写死了，用户侧那个 `WorkingTree*` 的名字在能力插件里（`WorkingTreeSwitchBranchOptions` 是本别名的再导出）。例外**逐名登记**，不是放宽成 `RxDBBranch` 前缀：加前缀之后第四个同族名字会静默通过。

**正向规则读 diff，负向规则读当前全集。** 负向规则若也读 diff，失效路径是现成的：新增 `IndexHint` → 门禁红 → 有人跑 `--update` → 它进了基线 → 从此永远绿，而那个名字还在表面上。正向规则没有这条路可走（「哪些名字属于本特性」在全集里读不出来），代价是它只在名字**第一次出现**的那次运行里有效。`rxdb` 的 `SwitchBranchOptions` 与 `rxdb-plugin-workspace` 的四个 `Workspace*` 是本特性之前的既有导出，在门禁里逐名放行（名单封闭）。

## 1. 入口

```ts
declare module '@aiao/rxdb' {
  interface RxDB {
    /** 提交能力未在本数据库启用时，除 enable() 外的成员一律以 commit_capability_disabled 拒绝 */
    readonly workingTree: WorkingTreeManager;
  }
}
```

`workingTree` **恒存在**（避免 `?.` 蔓延），但在未启用的数据库上除 `enable()` / `isEnabled()` 外一律拒绝——**不是**静默返回空结果。这与 FR-046「未启用 = 零行为差异」不冲突：不调用它就什么都没发生。

## 2. 能力启用（US-305）

```ts
interface WorkingTreeManager {
  isEnabled(): Promise<boolean>;
  /** 数据库级一次性启用。重复调用幂等命中，不报错、不重置版本。 */
  enable(): Promise<CommitCapabilityInfo>;
}

interface CommitCapabilityInfo {
  readonly enabled: boolean;
  readonly protocolVersion: number;
  readonly schemaVersion: number;
  readonly codecVersion: number;
  readonly enabledAt: Date | null;
}
```

## 3. 工作树查询（US-306 阶段 B）

```ts
interface WorkingTreeManager {
  status(): Promise<WorkingTreeStatus>;
  status$(): Observable<WorkingTreeStatus>;

  /** 唯一一条 diff 轴：HEAD ↔ 工作树。没有第二个参数，也没有 revision range。 */
  diff(options?: WorkingTreeDiffOptions): Promise<WorkingTreeDiff>;
}

interface WorkingTreeStatus {
  readonly branchId: string;
  readonly headCommitId: string | null;
  /** 调用方必须原样回传给 commit()/restore()/discard() —— 捕获型 CAS 的凭据 */
  readonly workingTreeRevision: number;
  readonly headRevision: number;
  readonly entryCount: number;
  readonly byOrigin: Readonly<Record<WorkingTreeOrigin, number>>;
  /** 仅当存在未结束的 WorkingTreeRestoreSession 时为真。CommitConflict 不会让它变真。 */
  readonly conflicted: boolean;
  readonly branchStatus: 'ok' | 'corrupted_read_only';
}

type WorkingTreeOrigin = 'local' | 'remote_sync';

interface WorkingTreeDiffOptions {
  readonly entities?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
}

interface WorkingTreeDiff {
  readonly entries: readonly WorkingTreeDiffEntry[];
  readonly nextCursor: string | null;
  readonly workingTreeRevision: number;
}

interface WorkingTreeDiffEntry {
  readonly unitId: string;
  readonly namespace: string;
  readonly entity: string;
  readonly entityId: string;
  readonly operation: 'insert' | 'update' | 'delete';
  readonly origin: WorkingTreeOrigin;
  readonly patch: unknown;
  readonly inversePatch: unknown;
}
```

**`status()` / `diff()` 展示全部 origin**，不按来源豁免 `remote_sync`（硬裁决 6）。

## 4. 提交 / 丢弃（US-306 阶段 B）

```ts
interface WorkingTreeManager {
  /**
   * 提交当前分支工作树的【全部】未提交单元。
   * 没有 selection 入参 —— 这是 v1 硬裁决，不是签名未完成。
   */
  commit(message: string, options?: CommitOptions): Promise<CommitResult>;

  discard(options: WorkingTreeDiscardOptions): Promise<WorkingTreeDiscardResult>;
}

interface CommitOptions {
  /** 捕获型 CAS：取自先前 status()。缺省时由本次调用内部读取，等于放弃「提交我看过的东西」的保证。 */
  readonly expectedWorkingTreeRevision?: number;
  readonly expectedHeadRevision?: number;
  readonly author?: string;
  /** 幂等键。重放同一 operationId 命中既有 commit 节点，不产生第二个。 */
  readonly operationId?: string;
}

type CommitResult =
  | { readonly ok: true; readonly commitId: string; readonly changeSetCount: number; readonly headRevision: number }
  | { readonly ok: false; readonly conflict: CommitConflict };
```

### 4.1 `CommitConflict` 是诊断值，不是持久状态

```ts
interface CommitConflict {
  readonly kind: 'working_tree_revision' | 'head_revision' | 'activation_revision';
  readonly expected: number;
  readonly actual: number;
  readonly branchId: string;
}
```

- **不入库**、不在 `status()` 里留痕、不需要「清除冲突」的 API。
- 正确的恢复动作就是：重新 `status()` → 复核 → 重新 `commit()`。
- 这是无暂存区的**已知代价**（硬裁决 3）：另一个 Tab 在 `status()` 与 `commit()` 之间 `save()` 会触发它。**它不构成重新引入暂存区的理由**，也不允许被「自动重试一次」偷偷抹掉——自动重试等于提交调用方没看过的变更。

### 4.2 commit 的原子性

一个事务内完成：写 `Commit` 节点 → 写全部 `CommitChangeSet` → CAS 推进 branch ref → **清空工作树条目并把 `entryCount` 置零**。不存在「提交了但工作树还剩一半」的中间态（SC-007）。

## 5. 历史恢复（US-307）

```ts
interface WorkingTreeManager {
  listCommits(options?: CommitLogOptions): Promise<CommitLogPage>;
  /** 把目标 commit 的内容作为【新的未提交变更】写回当前工作树。不移动 HEAD、不改写历史。 */
  restore(target: WorkingTreeRestoreTarget, options?: WorkingTreeRestoreOptions): Promise<WorkingTreeRestoreResult>;
  restoreSession(): Promise<WorkingTreeRestoreSessionInfo | null>;
}

interface WorkingTreeRestoreTarget {
  readonly commitId: string;
  /** 缺省 = 整个 commit 的全部单元 */
  readonly entities?: readonly { namespace: string; entity: string; entityId: string }[];
}

interface WorkingTreeRestoreSessionInfo {
  readonly id: string;
  readonly branchId: string;
  readonly targetCommitId: string;
  readonly status: 'active' | 'conflicted' | 'committed';
}
```

**没有** `checkout()`、**没有** detached HEAD、**没有**回到历史 commit 的只读浏览态（硬裁决 5）。`listCommits()` 返回的是数据，不是可切换的位置。

## 6. 分支与激活（US-308）

```ts
// 形状声明在 `packages/rxdb` 核心（`RxDBBranchSwitchPreconditions`），
// `@aiao/rxdb-plugin-working-tree` 以 `WorkingTreeSwitchBranchOptions` 之名原样再导出——
// 同一个声明，两个名字：核心只做搬运，含义由能力插件给。
type WorkingTreeSwitchBranchOptions = {
  /** 缺省即当前行为：无条件切换，与今天逐字节一致 */
  readonly requireClean?: boolean;
  readonly expectedActivationRevision?: number;
};

interface VersionManager {
  /** 既有签名，新增【可选】第二形参。不传时行为不变。 */
  switchBranch(branchId: string, preconditions?: WorkingTreeSwitchBranchOptions): Promise<void>;
}
```

- 字段名是 `requireClean` 而非 `requireCleanWorkingTree`：类型名里已经有 `WorkingTree`，再缀一遍是冗余（与 spec.md FR-017 / 场景 4、research.md 一致）。
- **不复用** `SwitchBranchOptions`：后者是适配器入参 `{ branchId, actions }`（`packages/rxdb/src/rxdb-adapter.ts:55`），是另一层。把它漏进公开 API 等于让用户看见适配器的内部形状。
- `VersionManager.switchBranch` 当前**没有**第二形参（`packages/rxdb-plugin-history/src/VersionManager.ts:277`），因此新增可选参数是**纯扩展**，零行为变化（FR-017）。
- 判定不在 `rxdb-plugin-history` 里做：判据（`WorkingTreeState.entryCount`、提交图可达性）都是能力插件的表，而 history 反向 import 能力插件会成环。切换前的判定走系统贡献口子 `RxDBSystemContribution.assertBranchSwitchable()`，在 `adapter.switchBranch()` 之前的一个只读事务里逐个问过贡献方。

## 7. 错误码

| 码                                  | 抛出时机                                                       |
| ----------------------------------- | -------------------------------------------------------------- |
| `commit_capability_disabled`        | 未启用的数据库上调用除 `enable()` / `isEnabled()` 外的成员     |
| `commit_capability_mismatch`        | raw 写路径 / 批量写方法命中版本化业务实体表（见 adapter 契约） |
| `commit_graph_corrupted`            | `commit()` / `restore()` / switch-to 命中可达损坏              |
| `ambiguous_active_branch`           | `RxDBBranch.activated` 有多行为真（FR-048）                    |
| `no_active_branch`                  | 运行期一行 active 分支都没有（FR-048 的另一侧）                |
| `stale_active_branch`               | 写入时调用方捕获的 active branch token 已过期（FR-020）        |
| `branch_not_materializable`         | 启用迁移中某本地分支无法沿变更链无缺口物化（FR-049）           |
| `branch_not_materialized`           | metadata-only 远端分支首次切换时物化依据不足（FR-044）         |
| `mixed_versioned_cache_transaction` | tracked 与 untracked 混进同一事务单元                          |
| `benchmark_environment_mismatch`    | `runnerProfileHash` 不匹配却要求绝对门禁                       |

`CommitConflict` **不在**本表：它是返回值，不是异常。

`WorkingTreeDirtyError`（`switchBranch(id, { requireClean: true })` 撞上未提交改动）也**不在**本表：
它不铸新码，只是一个带 `branchId` / `entryCount` 的异常类——码是给跨进程、跨语言的判别用的，
而这一条的处置只发生在发起调用的那一层（先 `commit()` 还是先 `discard()`）。
`WorkingTreeEntryCountMismatchError` 是同一个形态的先例。
