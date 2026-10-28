# rxdb-plugin-working-tree 深度评审

- 包：`@aiao/rxdb-plugin-working-tree`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

按工作树凭据与提交CAS、恢复会话、捕获修订号、写入口范围、检出位锁和回收六条主线审查；实际深入 writeCommit、runCommitWorkingTree、restore/discard、capture-runtime、WorkingTreeManager、WorktreeManager 与框架共用命令层。

## 核查结果

- [`writeCommit`](../../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts) 在保存 commit/changeSets 前通过 generation+headRevision+status 的 SQL CAS 推进 HEAD；operationId 重放要核对内容指纹。
- [`runCommitWorkingTree`](../../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts) 先校验 activation/head/workingTree 凭据，再读条目和提交；发布 commit 事件在门面事务成功之后。
- [`restoreWorkingTree`](../../../packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts) 对 dirty、不可达、schema不兼容、CAS冲突给出不同结果；restore 会话与工作树条目在同一执行器中落盘。
- [`createWorkingTreeCaptureBatch`](../../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts) 顺序折叠每条变更，批末统一写修订号和 entryCount，避免多个独立快照相互覆盖。
- [`WorktreeManager.#mount`](../../../packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts) 使用持有键、结构指纹与 Web Lock 校验可写检出位；释放当前检出位先挂回主表集。
- [`WorktreeManager.#view`](../../../packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts) refresh 先成功创建新快照再结算旧视图，旧视图收尾失败会关闭新快照。
- [`createLatestOnlyPatch`](../../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts) 按状态格独立 generation 抑制同一格旧命令的迟到结果；方法执行本身不因 UI 过期而取消。

- [`restoreWorkingTree`](../../../packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts) 与 [`readWorkingTreeStatus`](../../../packages/rxdb-plugin-working-tree/src/working-tree/status.ts) 分别核对凭据、entryCount 与恢复会话版本；[`createWorktreeCommands`](../../../packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts) 的状态过期只影响 UI，不静默取消用户数据库命令。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 跨包交互

草稿换挂期间的丢失发生在 workspace 的无分区排队结构，计入 [WORKSPACE-001](rxdb-plugin-workspace.md)；本包的表集通知是触发条件，不重复计数。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 82 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-working-tree:test`：1285 passed (1285)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 本次是对约 2.4 万行实现的高风险调用链深审，不宣称逐行覆盖全部87个实现/支撑文件。未用六个真实后端重放全部捕获挂载点、并发标签页、进程崩溃与孤儿快照回收。
