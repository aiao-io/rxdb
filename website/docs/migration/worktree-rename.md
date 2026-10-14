# 工作树插件改名：`rxdb-plugin-working-tree` → `rxdb-plugin-worktree`

`@aiao/rxdb-plugin-working-tree` 与三个框架绑定包改名为 `rxdb-plugin-worktree`，**下一个发布版本起**生效：

| 旧                                       | 新                                   |
| ---------------------------------------- | ------------------------------------ |
| `@aiao/rxdb-plugin-working-tree`         | `@aiao/rxdb-plugin-worktree`         |
| `@aiao/rxdb-plugin-working-tree-angular` | `@aiao/rxdb-plugin-worktree-angular` |
| `@aiao/rxdb-plugin-working-tree-react`   | `@aiao/rxdb-plugin-worktree-react`   |
| `@aiao/rxdb-plugin-working-tree-vue`     | `@aiao/rxdb-plugin-worktree-vue`     |

**旧包名从未发布到 npm**（改名之前本包只在 workspace 内流转），registry 上没有任何版本，因此不存在旧包弃用或回撤问题，也不需要 `deprecated` 标记——跟着 `main` 开发的下游改一下 import 即可。按[版本与 API 稳定性策略](../versioning.md)，0.x 期间次版本即可包含破坏性变更。

**不涉及数据迁移。** 库文件、能力水位行（`__rxdb_capability__:workingTree:1:…`）、`rxdb_working_tree_*` 系统表的表名与列名、迁移名（`0004-working-tree-commits`）、未提交改动与提交历史——一样都没动。旧客户端与新客户端对同一个库双向兼容：能力守卫按**能力名**（`workingTree`）认领，不比对包名（见下「不改的东西」）。要改的只有包名与公开符号名。

## 为什么改

包名里的 `working-tree` 是 git 术语「工作区」（未提交改动），而插件下一步要新增的 `worktree` 能力对应 git 的 `git worktree`（多工作上下文）——两个词在 git 里是两件事，包名却只能挂一个。趁旧包名还没发出去，把包名与公开 API 一次性收敛到 `worktree`，避免「包叫 worktree、符号叫 WorkingTree」的永久分裂。

## 1. 换包

```bash
pnpm remove @aiao/rxdb-plugin-working-tree
pnpm add @aiao/rxdb-plugin-worktree

# 三端绑定同理（按你用的框架）
pnpm remove @aiao/rxdb-plugin-working-tree-angular
pnpm add @aiao/rxdb-plugin-worktree-angular
```

## 2. 公开符号映射

| 旧                                                                                              | 新                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `rxDBPluginWorkingTree`                                                                         | `rxDBPluginWorktree`                                                 |
| `RxDBPluginWorkingTree`                                                                         | `RxDBPluginWorktree`                                                 |
| `db.workingTree`                                                                                | `db.worktree`                                                        |
| `WorkingTreeManager`                                                                            | `WorktreeManager`                                                    |
| `useWorkingTree()`（三端绑定）                                                                  | `useWorktree()`                                                      |
| `WorkingTreeResource`                                                                           | `WorktreeResource`                                                   |
| `WorkingTreeStatus` / `WorkingTreeDiff` / `WorkingTreeDiffEntry`                                | `WorktreeStatus` / `WorktreeDiff` / `WorktreeDiffEntry`              |
| `WorkingTreeCredentials` / `WorkingTreeSwitchBranchOptions`                                     | `WorktreeCredentials` / `WorktreeSwitchBranchOptions`                |
| `WorktreeCredentials` 的字段 `expectedWorkingTreeRevision`                                      | `expectedWorktreeRevision`（`status().workingTreeRevision` 不改名）  |
| `WorkingTreeDirtyError`                                                                         | `WorktreeDirtyError`                                                 |
| `WorkingTreeRestoreSessionInfo` / `WorkingTreeDiscardResult` 等其余 `WorkingTree*`              | 对应 `Worktree*`                                                     |
| `WORKING_TREE_CAPABILITY_VERSION`                                                               | `WORKTREE_CAPABILITY_VERSION`                                        |
| `WORKING_TREE_INITIAL_ASYNC_STATES`                                                             | `WORKTREE_INITIAL_ASYNC_STATES`                                      |
| `workingTreeCaptureConformanceSuite` / `workingTreeCommitConformanceSuite`（`/testing` 子路径） | `worktreeCaptureConformanceSuite` / `worktreeCommitConformanceSuite` |
| `WORKING_TREE_CONFORMANCE_ENTITIES` / `LOCAL_ADAPTER` / `REMOTE_ADAPTER` / `USER_ID`            | `WORKTREE_CONFORMANCE_*` 同后缀                                      |

一次性替换（顺序执行）。**不要对全仓跑 `s/WorkingTree/Worktree/g`**：核心 `@aiao/rxdb` 的 `WorkingTreeCaptureHook` 等导出不改名，能力名 `'workingTree'`、列名这类持久化字符串更不能动，一条全局正则会把它们一起改坏。下面第 2 步只替换插件改过名的导出与字段——清单就是改名前后两份 API 基线之差：

```bash
# 1. 包名（三端绑定包的后缀照旧）
grep -rl 'rxdb-plugin-working-tree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/rxdb-plugin-working-tree/rxdb-plugin-worktree/g'

# 2. 插件改过名的导出与字段，逐名按词边界替换
names='
  assertWorkingTreeEntryCountIntact commitWorkingTree createWorkingTreeActivationRow
  createWorkingTreeCaptureBatch createWorkingTreeCapturePort createWorkingTreeCaptureRuntime
  createWorkingTreeCommands createWorkingTreeCommitsInitialRows createWorkingTreeHookStubs
  decodeWorkingTreePatch discardWorkingTree encodeWorkingTreePatch expectedWorkingTreeRevision
  isWorkingTreeDiffEmpty isWorkingTreeRestoreSessionEmpty isWorkingTreeStatusEmpty readWorkingTreeDiff
  readWorkingTreeStateRow readWorkingTreeStatus replayWorkingTree restoreWorkingTree RxDBPluginWorkingTree
  rxDBPluginWorkingTree trackWorkingTreeCommand trackWorkingTreeQuery UnknownWorkingTreePatchEntityError
  useWorkingTree WORKING_TREE_CAPABILITY_VERSION WORKING_TREE_CONFORMANCE_ENTITIES
  WORKING_TREE_CONFORMANCE_LOCAL_ADAPTER WORKING_TREE_CONFORMANCE_REMOTE_ADAPTER
  WORKING_TREE_CONFORMANCE_USER_ID WORKING_TREE_INITIAL_ASYNC_STATES WorkingTreeActivationInfo
  WorkingTreeAsyncStates WorkingTreeCapabilityDisabledError WorkingTreeCaptureBatch
  workingTreeCaptureConformanceSuite WorkingTreeCaptureHost WorkingTreeCapturePort WorkingTreeCaptureRuntime
  WorkingTreeCaptureRuntimeOptions WorkingTreeCommands WorkingTreeCommandState
  workingTreeCommitConformanceSuite WorkingTreeCommitEvent WorkingTreeConformanceSuiteContext
  WorkingTreeCredentials WorkingTreeDiff WorkingTreeDiffEntry WorkingTreeDiffGranularity WorkingTreeDiffOptions
  WorkingTreeDiffTransaction WorkingTreeDirtyError WorkingTreeDiscardOptions WorkingTreeDiscardResult
  WorkingTreeEmptyState WorkingTreeEnableIfEmptyResult WorkingTreeEntryCountMismatchError WorkingTreeEntryKey
  WorkingTreeEntryOperation WorkingTreeEntryRow WorkingTreeErrorState WorkingTreeHookStubs WorkingTreeIdleState
  WorkingTreeLoadingState WorkingTreeManager WorkingTreeManagerStub WorkingTreeOriginBreakdown WorkingTreePatch
  WorkingTreePatchCodecContext WorkingTreePatchTarget WorkingTreeQueryState WorkingTreeReplayCorruptionError
  WorkingTreeResource WorkingTreeRestoreEntityRef WorkingTreeRestoreFailureReason WorkingTreeRestoreOptions
  WorkingTreeRestoreResult WorkingTreeRestoreSessionInfo WorkingTreeRestoreTarget WorkingTreeRevisionSnapshot
  WorkingTreeStatePatch WorkingTreeStateSink WorkingTreeStatus WorkingTreeSuccessState
  WorkingTreeSwitchBranchOptions WorkingTreeWriteRejectedError
'
alt=$(echo $names | tr ' ' '|')
grep -rlE "$alt" . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/\b('"$alt"')\b/my $n = $1; $n =~ s{WorkingTree}{Worktree}g; $n =~ s{WORKING_TREE}{WORKTREE}g; $n =~ s{workingTree}{worktree}g; $n/ge'

# 3. 数据库实例上的入口：db.workingTree / rxdb.workingTree / this.database.workingTree …
grep -rl '\.workingTree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/\.workingTree\b/.worktree/g'
```

替换完跑一遍类型检查（`tsc --noEmit` / `vue-tsc` / `ng build`）：还报 `WorkingTree*` 找不到的，按上表对应改名即可。

## 3. 不改的东西（替换时别动这些）

- **能力名 `workingTree`**：能力水位行 `__rxdb_capability__:workingTree:1:…` 按能力名认领，守卫不比对这个包名字段（`packages/rxdb/src/system/capability-watermark.ts`）。改能力名 = 守卫意义上的新能力，旧客户端会被拒。旧库里旧包名与新包名的两条水位行并存、互相放行。
- **表名、列名与迁移名**：`rxdb_working_tree_*` 系统表、它们的列名（如 `workingTreeRevision`、恢复会话的 `expectedWorkingTreeRevision`——公开字段改名为 `expectedWorktreeRevision`，列名经 `columnName` 钉在旧名上）、迁移名 `0004-working-tree-commits` 与物化指纹的域前缀 `rxdb.working-tree.materialization.v1` 都是持久化元数据，发布后不可改，由插件的 `persisted-names.spec.ts` 钉住。
- **核心的捕获挂点**：`@aiao/rxdb` 的 `WorkingTreeCaptureHook` / `WorkingTreeCaptureMountPoint` / `setWorkingTreeCaptureHook` / `workingTreeCaptureHook` / `workingTreeRawWriteContext` 等随核心走，本次不改。
- **插件内部路径**：`rxdb-plugin-worktree/src/working-tree/**` 目录与实体类（`WorkingTreeState` 等）是包内实现，名字不动。
- **未提交改动与提交历史**：库里的 WIP、提交图、恢复会话原样有效。

## 4. 校验

- 全仓 grep `WorkingTree|working-tree|workingTree` 的合法残留只有：能力值 `'workingTree'`、表名/列名/迁移名、`status().workingTreeRevision` 字段、核心捕获挂点、`src/working-tree/` 内部路径与历史文档引用。
- `pnpm audit:api-surface` 的四个基线文件已改名并在同一次提交里自更新；CI 的 `audit:suite-callsites` / `audit:callsite-drift` 硬编码路径已同步。
