# Contract: 核心公开 API

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

本文件冻结对外暴露的**形状与语义**，不含实现。类型签名用 TypeScript 表达，因为它**就是**本库的用户契约。

> **导出位置**：epic-006 拆分后，§2~§5 的类型由 `@aiao/rxdb-plugin-working-tree` 导出，§1 的 `RxDB.workingTree` 是该包对 `@aiao/rxdb` 的模块增强（`plugin.ts` 的 `declare module`）；§6 的 `RxDBBranchSwitchPreconditions` 留在 `@aiao/rxdb` 核心。§0 的命名门禁两边都管。

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
    /** 提交能力未在本数据库启用时，除 enable() / enableIfEmpty() 外的成员一律以 commit_capability_disabled 拒绝 */
    readonly workingTree: WorkingTreeManager;
  }
}
```

`workingTree` **恒存在**（避免 `?.` 蔓延），但在未启用的数据库上除 `enable()` / `enableIfEmpty()` / `isEnabled()` 外一律拒绝——**不是**静默返回空结果。这与 FR-046「未启用 = 零行为差异」不冲突：不调用它就什么都没发生。

## 2. 能力启用（US-305）

```ts
interface WorkingTreeManager {
  isEnabled(): Promise<boolean>;
  /** 数据库级一次性启用。重复调用幂等命中，不报错、不重置版本。 */
  enable(): Promise<CommitCapabilityInfo>;

  /** 空库自动启用（应用启动时的自动初始化入口）；库里有内容时一行不写，返回 not_empty。 */
  enableIfEmpty(): Promise<WorkingTreeEnableIfEmptyResult>;
}

type WorkingTreeEnableIfEmptyResult =
  | { readonly kind: 'enabled'; readonly capability: CommitCapabilityInfo }
  | { readonly kind: 'already_enabled'; readonly capability: CommitCapabilityInfo }
  | { readonly kind: 'not_empty' };

interface CommitCapabilityInfo {
  readonly enabled: boolean;
  readonly protocolVersion: number;
  readonly schemaVersion: number;
  readonly codecVersion: number;
  readonly enabledAt: Date | null;
}
```

「空」的判据是 `rxdb_change` 行数为零（本地每一次实体写入都会追加一条变更，sync pull 走 disableTriggers 不产生行）。判空、翻能力位、补 baseline 在**同一个事务**里；`not_empty` 返回时能力位仍是关的，手动 `enable()` 面对的是同一个起点。

## 3. 工作树查询（US-306 阶段 B）

> `WorkingTreeManager` 的实现是一个 **class**（`working-tree/working-tree-facade.ts`）。本文件按小节拆成若干 `interface` 片段只为对照阅读；公开面恰好十一个成员——`isEnabled` / `enable` / `enableIfEmpty`（§2）、`status` / `diff`（§3）、`commit` / `discard`（§4）、`listCommits` / `commitChanges` / `restore` / `restoreSession`（§5）。**没有 `status$()`**：响应式那一层由三框架绑定各自提供（见 `contracts/tri-framework-api.md`），核心面上只有一次性读取。

```ts
interface WorkingTreeManager {
  status(): Promise<WorkingTreeStatus>;

  /** 唯一一条 diff 轴：HEAD ↔ 工作树。没有第二个参数，也没有 revision range。 */
  diff(options?: WorkingTreeDiffOptions): Promise<WorkingTreeDiff>;
}

interface WorkingTreeStatus {
  /** 当前 active 分支 id */
  readonly branchId: string;

  /** 未提交条目数，取自冗余列 */
  readonly entryCount: number;

  /** 没有未提交条目 */
  readonly clean: boolean;

  /** 有未结束的恢复会话，且它捕获的两个 revision 仍然对得上 */
  readonly restoring: boolean;

  /** 有未结束的恢复会话，但它捕获的 revision 已经分叉。CommitConflict 不会让它变真。 */
  readonly conflicted: boolean;

  /** 未提交条目按来源的分布 */
  readonly byOrigin: WorkingTreeOriginBreakdown;

  /** 捕获位之一：分支激活 revision */
  readonly activationRevision: number;

  /** 捕获位之一：HEAD 推进 revision */
  readonly headRevision: number;

  /** 捕获位之一：工作树 revision */
  readonly workingTreeRevision: number;
}

/** 键集跟着 `WriteEntryOrigin` 走，不手写两个字段：来源取值域增补时漏改会让新来源凭空消失。 */
type WorkingTreeOriginBreakdown = Readonly<Record<WriteEntryOrigin, number>>;

type WriteEntryOrigin = 'local' | 'remote_sync';

/** 摊开的粒度：一条单元一行，或按事务收成组。 */
type WorkingTreeDiffGranularity = 'entity' | 'transaction';

interface WorkingTreeDiffOptions {
  /** 摊开的粒度，默认 `'entity'` */
  readonly granularity?: WorkingTreeDiffGranularity;

  /** 只看这些实体名；给空数组即「一个都不看」，不当成「不过滤」 */
  readonly entities?: readonly string[];

  /** 本页最多给几行；不给即一次给全。**只在 `granularity: 'entity'` 下可用** */
  readonly limit?: number;

  /** 上一页的 `nextCursor`；从它之后接着读。**只在 `granularity: 'entity'` 下可用** */
  readonly cursor?: string;
}
```

**分页只对实体粒度开放。** `granularity: 'transaction'` 搭 `limit` 或 `cursor` 一律抛
`RxDBError`，不静默忽略。游标走的是 `WorkingTreeEntry.id`，而同一个事务的若干行在这个序上
**不相邻**——`id` 是建行那一刻取的随机 uuid，命中既有行时走原地 UPDATE（`transactionId` 换人、
`id` 不动）。截断一页再分组，切出来的每一组都可能缺实体，而它自报「这次事务改了 N 条」，
N 是错的；下一页还会冒出同一个 `transactionId` 的第二组。调用方从返回值里看不出自己被截断过，
所以这里给错误而不是给一个看起来能用的答案。要分页就用实体粒度，由调用方自己按
`transactionId` 收组。

```ts
interface WorkingTreeDiff {
  /** 摊开的是哪条分支 */
  readonly branchId: string;

  /** 比较的左端：工作树基于的那个 commit；分支还没有任何提交时为 `null` */
  readonly baseHeadCommitId: string | null;

  /** 比较的右端：当前工作树 revision */
  readonly workingTreeRevision: number;

  /** 本次实际使用的粒度 */
  readonly granularity: WorkingTreeDiffGranularity;

  /** 实体粒度的行；事务粒度下恒为空数组 */
  readonly entries: readonly WorkingTreeDiffEntry[];

  /** 事务粒度的组；实体粒度下恒为空数组 */
  readonly transactions: readonly WorkingTreeDiffTransaction[];

  /** 续读游标；本页已到末尾时为 `null` */
  readonly nextCursor: string | null;
}

interface WorkingTreeDiffTransaction {
  /** 这一组的事务 id；`null` 表示这一组只有一次独立的写，两次无事务的写**各自成组** */
  readonly transactionId: string | null;

  /** 组内单元，保持读出的顺序 */
  readonly entries: readonly WorkingTreeDiffEntry[];
}

interface WorkingTreeDiffEntry {
  /** 变更单元 id；完整事务的全部实体共享同一个 */
  readonly unitId: string;

  /** 所属事务 id；单次 `save()` 为 `null` */
  readonly transactionId: string | null;

  readonly namespace: string;
  readonly entity: string;
  readonly entityId: string;
  readonly operation: 'insert' | 'update' | 'delete';

  /** 正向补丁；`null` 即「这一侧没有值」（delete 的正向） */
  readonly patch: Record<string, unknown> | null;

  /** 逆向补丁；`null` 即「这一侧没有值」（insert 的逆） */
  readonly inversePatch: Record<string, unknown> | null;

  readonly origin: WriteEntryOrigin;
}
```

**三个 revision 字段缺一不可。** `activationRevision` / `headRevision` / `workingTreeRevision` 恰好是 `commit()` / `discard()` / `restore()` 要求调用方捕获的那三个位（§4 的 `WorkingTreeCredentials`）。少给一个，调用方就永远构造不出一次不会撞 `CommitConflict` 的提交——所以 `status()` 一次给全，而不是让调用方分几次读。

`WorkingTreeDiffEntry` 的九个字段与 `CommitChangeSet` 的九列逐一对齐：提交时这批单元原样变成变更集，两边字段集对不上就意味着「我看到的」与「我提交的」不是同一批数据。**不带** `sourceChangeId` / `id` / `fingerprint`——前者指向的 `rxdb_change` 行会被删分支级联与压缩合并带走，后两者分别是分页游标的内部载体与折叠判定用的。

**`status()` / `diff()` 展示全部 origin**，不按来源豁免 `remote_sync`（硬裁决 6）。

## 4. 提交 / 丢弃（US-306 阶段 B）

```ts
interface WorkingTreeManager {
  /**
   * 提交当前分支工作树的【全部】未提交单元。
   * 没有 selection 入参 —— 这是 v1 硬裁决，不是签名未完成。
   */
  commit(message: string, options: CommitOptions): Promise<CommitResult>;

  discard(options: WorkingTreeDiscardOptions): Promise<WorkingTreeDiscardResult>;
}

/** 调用方在一次 `status()` 里捕获的三个位（FR-020/FR-031）；commit / discard / restore 共用。 */
interface WorkingTreeCredentials {
  /** 捕获时的 active 分支身份 */
  readonly expectedBranch: ActiveBranchToken;

  /** 捕获时的 HEAD 推进 revision */
  readonly expectedHeadRevision: number;

  /** 捕获时的工作树 revision */
  readonly expectedWorkingTreeRevision: number;
}

interface ActiveBranchToken {
  /** 捕获时的 active 分支 ID */
  readonly branchId: string;

  /** 捕获时的 activation revision；每次切换分支 +1 */
  readonly activationRevision: number;
}

interface CommitOptions extends WorkingTreeCredentials {
  /** 提交作者；落进不可变历史的 `Commit.author` */
  readonly authorId: string;

  /** 幂等键。同一次逻辑提交的重试必须带同一个值；重放命中既有 commit 节点，不产生第二个。 */
  readonly operationId: string;
}

type WorkingTreeDiscardOptions = WorkingTreeCredentials;

type CommitResult =
  | { readonly ok: true; readonly commitId: string; readonly changeSetCount: number; readonly headRevision: number }
  | { readonly ok: false; readonly conflict: CommitConflict };

type WorkingTreeDiscardResult =
  | { readonly ok: true; readonly discardedCount: number; readonly workingTreeRevision: number }
  | { readonly ok: false; readonly conflict: CommitConflict };
```

**五个字段全部必填，一个默认值都不给。** 给 `expected*` 任何一位默认值，等于让调用方跳过某一次比较——而跳过哪一次都会落回「提交我没看过的东西」。`authorId` 可选的话，一条历史里会同时存在有作者与无作者的 commit，后者在多设备场景里永远说不清是谁提交的；`operationId` 可选的话，幂等键只能由内容合成，于是「同样内容的两次提交」会被判成同一次。`commit()` 的 `options` 因此也是**必填形参**。

`expectedBranch` 是 `{ branchId, activationRevision }` 两件一起而不是单个 `branchId`：只认分支 id 的话，`main → feature → main` 一个来回之后 token 又「对上了」，而这中间工作树已经换过两轮。

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
  restore(target: WorkingTreeRestoreTarget, options: WorkingTreeRestoreOptions): Promise<WorkingTreeRestoreResult>;
  restoreSession(): Promise<WorkingTreeRestoreSessionInfo | null>;
}

/** 与 `discard()` 同一组凭据：恢复也是一次会改写工作树的命令，三个捕获位一样必填。 */
type WorkingTreeRestoreOptions = WorkingTreeCredentials;

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
