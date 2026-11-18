# 当前分支相对 `main` 的代码审查

审查日期：2026-11-18  
基线：`main` (`b2e746fa16ebdd2d7cc2be0dfd73c3669415b126`)  
当前分支：`admin-template` (`121bbf212`)  
审查范围：

- `packages/rxdb-plugin-working-tree`
- `packages/rxdb-plugin-replay`
- `packages/rxdb-plugin-history`
- `packages/rxdb/src/trusted-write`
- 上述范围内及其直接相关测试

审查包含 `main...HEAD` 的 tracked 差异，以及审查时工作区的 staged、unstaged、untracked 状态。目标范围内没有额外 staged/unstaged/untracked 文件；工作区另有若干位于 `rxdb-admin-template/` 子目录的范围外改动，未纳入本报告。

## P1

### P1-1：`HEAD = null` 时跳过空业务表检查，导入会留下未纳入历史的数据

- **文件：** `packages/rxdb-plugin-working-tree/src/working-tree/import-command.ts:486-492`
- **复现条件：** 当前 active branch 的 `headCommitId === null`，tracked 业务表已有数据，然后导入一批从根节点开始的新提交。
- **原因：** `planFastForward()` 在 `walk.end === 'head'` 时直接返回 `advance`。只有 `currentHead !== null` 且 `walk.end === 'root'` 时才调用 `isEmptyBranch()`。因此空 HEAD 分支不会验证 tracked 表是否真的为空。
- **影响：** 导入会推进 HEAD 和工作树基线，但已有业务行没有对应 ChangeSet，形成业务投影与历史图不一致，后续恢复、差异和撤销无法完整覆盖这些行。
- **建议：** 对 `currentHead === null` 同样执行 tracked entity 空表检查；拒绝时保证零写入，并增加“空 HEAD + 已有 tracked 数据”的回归测试。

### P1-2：合并 DAG 导出结果不是可靠的拓扑序，合法历史可能生成无法导入的批次

- **文件：** `packages/rxdb-plugin-working-tree/src/commit/commit-exchange.ts:235-239`
- **复现条件：** 构造合法提交图：`A.parentIds = [C]`、`D.parentIds = [C]`、`B.parentIds = [D]`、`M.parentIds = [A, B]`，对 `M` 调用 `readCommitExportPage()`。
- **原因：** 实现对 `listReachableCommits()` 返回的遍历结果直接 `.reverse()`，把遍历顺序当作父优先拓扑序。对于不等深、共享祖先的合并图，可能得到 `[D, C, B, A, M]`，其中 `D` 的父 `C` 排在 `D` 后面。
- **影响：** 导出结果交给 `checkCommitExchangeBatch()` 或 `importCommits()` 时会被 `not_topological` 拒绝；合法的合并历史无法通过交换链路恢复。
- **建议：** 导出后执行显式父优先拓扑排序，不能依赖 BFS 结果反转；同时对导出结果调用 `checkCommitExchangeBatch()` 做内部一致性断言，并补充不等深共享祖先 DAG 的导出/再导入测试。

### P1-3：导入最终只校验 HEAD CAS，未原子校验 `workingTreeRevision`，存在恢复/丢弃并发竞态

- **文件：** `packages/rxdb-plugin-working-tree/src/working-tree/import-command.ts:704-725, 769-806`
- **复现条件：**
  1. 导入读取到 `headRevision = N`、`workingTreeRevision = M`，且工作树条目为空；
  2. 在 `verifyContent()` 或 `planFastForward()` 执行期间，另一事务执行 `restore()` 或 `discard()`，改变工作树 revision，但不改变 HEAD；
  3. 导入继续执行并进入 `writeImport()`。
- **原因：** `buildAdvanceHeadCas()` 只使用 branch generation 和 `expectedHeadRevision`（`import-command.ts:704-709`）。之后的 `buildWorkingTreeImportTransitionSql()` 无条件推进工作树基线，没有把此前读取的 `workingTreeRevision` 纳入同一个原子 CAS。
- **影响：** 并发工作树变化可能被导入覆盖，或与新 HEAD 组合，导致业务投影、恢复会话、工作树条目和历史基线不一致。
- **建议：** 将 `workingTreeRevision` 与 HEAD revision 一起纳入原子 CAS；任一 revision 变化都返回 `conflict`，并保证导入写入全部为零。

## P2

### P2-1：受信调用点登记的 `verifiedAtLine` 已漂移，但 40 行容差仍让审计门禁通过

- **文件：**
  - `packages/rxdb/src/trusted-write/trusted-write-intent.ts:302-315`
  - `packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:415-420`
  - `packages/rxdb-plugin-working-tree/src/working-tree/import-command.ts:606-614`
  - `scripts/audit/working-tree-callsite-drift.mjs:767-774`
- **复现条件：** 登记表 #14 记录 `verifiedAtLine: 395`，但当前 `restore-command.ts` 中真实的 `declareTrustedWrite()` 位于第 415 行；登记表 #15 记录 `verifiedAtLine: 620`，但当前 `import-command.ts` 中真实位置位于第 608 行。
- **原因：** 漂移审计只在真实行号与登记行号相差超过 `LINE_DRIFT_TOLERANCE` 时失败，当前容差为 40 行，因此 20 行和 12 行的错误仍会放行。`trusted-callsite-registry.spec.ts` 只验证 registry 与 epic 文档互相一致，没有扫描兄弟插件源码确认登记行号确实指向声明。
- **影响：** 不影响运行时写入，但削弱了受信调用点门禁；登记表声称已核对的代码位置并不是当前真实声明位置，后续继续漂移仍可能不报警。
- **建议：** 将 #14/#15 的登记行号和 epic 文档同步更新为当前真实位置 `415` / `608`；补充跨包审计测试，验证 registry 行号与插件源码中的 `declareTrustedWrite()` 实际声明绑定，而不是只验证两份登记数据彼此一致。

## 未确认缺陷

### replay/history

对 `packages/rxdb-plugin-replay` 和 `packages/rxdb-plugin-history` 的本次差异未确认出可稳定复现的 P0/P1/P2/P3 功能、数据一致性、并发或安全缺陷。新增的 `side_branch_target` 结果类型与恢复提示保持一致；`HistoryManager` 的可推仓库门控未发现会改变实际计数结果的证据。

## 测试结果与缺口

### 已执行

- `pnpm nx run-many -t test -p rxdb-plugin-working-tree rxdb-plugin-replay rxdb-plugin-history rxdb --parallel=3 --skipNxCache`
  - Nx 结果：16 个任务成功。
  - Nx 额外标记 `rxdb:build`、`rxdb-test:build` 为已知 flaky build；没有测试失败。
- `git diff --check main -- packages/rxdb-plugin-working-tree`：通过。
- 目标范围的 staged/unstaged/untracked 检查：没有发现范围内额外工作区改动。

### 仍需补齐

- 空 HEAD 且 tracked 表已有数据时，导入应拒绝并保持零写入。
- 不等深共享祖先的合并 DAG 导出、校验和再导入。
- `restore()` / `discard()` 与 `importCommits()` 交错执行时的 `workingTreeRevision` CAS 冲突。
- `trusted-write` 登记表与 working-tree 插件源码实际声明位置的跨包绑定测试。
- `HistoryManager` 在存在同步实体但所有同步记录均为 `enabled: false` 时的门控测试。
- replay `restoreToCommit()` 对 `side_branch_target` 拒绝结果的直接透传测试。

另有一次子任务尝试单独运行 history 测试时因当前环境禁止 Vitest 监听本地端口而在收集前退出；这不改变主线程四项目 Nx 测试已成功的结果，但不应把该次单独运行视为业务测试通过。
