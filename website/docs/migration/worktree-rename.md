# 工作树插件改名：`rxdb-plugin-working-tree` → `rxdb-plugin-worktree`

`@aiao/rxdb-plugin-working-tree` 与三个框架绑定包改名为 `rxdb-plugin-worktree`，**下一个发布版本起**生效：

| 旧                                       | 新                                   |
| ---------------------------------------- | ------------------------------------ |
| `@aiao/rxdb-plugin-working-tree`         | `@aiao/rxdb-plugin-worktree`         |
| `@aiao/rxdb-plugin-working-tree-angular` | `@aiao/rxdb-plugin-worktree-angular` |
| `@aiao/rxdb-plugin-working-tree-react`   | `@aiao/rxdb-plugin-worktree-react`   |
| `@aiao/rxdb-plugin-working-tree-vue`     | `@aiao/rxdb-plugin-worktree-vue`     |

**旧包名从未发布到 npm**（改名之前本包只在 workspace 内流转），registry 上没有任何版本，因此不存在旧包弃用或回撤问题，也不需要 `deprecated` 标记——跟着 `main` 开发的下游改一下 import 即可。按[版本与 API 稳定性策略](../versioning.md)，0.x 期间次版本即可包含破坏性变更。

**不涉及数据迁移。** 库文件、能力水位行（`__rxdb_capability__:workingTree:1:…`）、十张系统表名、迁移名（`0004-working-tree-commits`）、未提交改动与提交历史——一样都没动。旧客户端与新客户端对同一个库双向兼容：能力守卫按**能力名**（`workingTree`）认领，不比对包名（见下「不改的东西」）。要改的只有包名与公开符号名。

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
| `WorkingTreeDirtyError`                                                                         | `WorktreeDirtyError`                                                 |
| `WorkingTreeRestoreSessionInfo` / `WorkingTreeDiscardResult` 等其余 `WorkingTree*`              | 对应 `Worktree*`                                                     |
| `WORKING_TREE_CAPABILITY_VERSION`                                                               | `WORKTREE_CAPABILITY_VERSION`                                        |
| `WORKING_TREE_INITIAL_ASYNC_STATES`                                                             | `WORKTREE_INITIAL_ASYNC_STATES`                                      |
| `workingTreeCaptureConformanceSuite` / `workingTreeCommitConformanceSuite`（`/testing` 子路径） | `worktreeCaptureConformanceSuite` / `worktreeCommitConformanceSuite` |
| `WORKING_TREE_CONFORMANCE_ENTITIES` / `LOCAL_ADAPTER` / `REMOTE_ADAPTER` / `USER_ID`            | `WORKTREE_CONFORMANCE_*` 同后缀                                      |

一次性机械替换（顺序执行；`WorkingTree` → `Worktree` 一步已覆盖上表大部分条目）：

```bash
grep -rl 'rxdb-plugin-working-tree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/rxdb-plugin-working-tree/rxdb-plugin-worktree/g'
grep -rl 'WorkingTree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/WorkingTree/Worktree/g'
grep -rl 'useWorkingTree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/useWorkingTree/useWorktree/g'
grep -rl 'db\.workingTree' . --exclude-dir=node_modules --exclude-dir=.git | xargs perl -pi -e 's/db\.workingTree/db.worktree/g'
```

## 3. 不改的东西（替换时别动这些）

- **能力名 `workingTree`**：能力水位行 `__rxdb_capability__:workingTree:1:…` 按能力名认领，守卫不比对这个包名字段（`packages/rxdb/src/system/capability-watermark.ts`）。改能力名 = 守卫意义上的新能力，旧客户端会被拒。旧库里旧包名与新包名的两条水位行并存、互相放行。
- **表名与迁移名**：`rxdb_working_tree_*` 十张系统表、迁移名 `0004-working-tree-commits` 是持久化元数据，发布后不可改。
- **核心的捕获挂点**：`@aiao/rxdb` 的 `WorkingTreeCaptureHook` / `WorkingTreeCaptureMountPoint` / `setWorkingTreeCaptureHook` / `workingTreeCaptureHook` / `workingTreeRawWriteContext` 等随核心走，本次不改。
- **插件内部路径**：`rxdb-plugin-worktree/src/working-tree/**` 目录与实体类（`WorkingTreeState` 等）是包内实现，名字不动。
- **未提交改动与提交历史**：库里的 WIP、提交图、恢复会话原样有效。

## 4. 校验

- 全仓 grep `WorkingTree|working-tree|workingTree` 的合法残留只有：能力值 `'workingTree'`、表名/迁移名、核心捕获挂点、`src/working-tree/` 内部路径与历史文档引用。
- `pnpm audit:api-surface` 的四个基线文件已改名并在同一次提交里自更新；CI 的 `audit:suite-callsites` / `audit:callsite-drift` 硬编码路径已同步。
