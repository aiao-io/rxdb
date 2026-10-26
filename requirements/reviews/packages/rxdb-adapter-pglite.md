---
package: rxdb-adapter-pglite
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-pglite 增量代码评审

## 结论

🟡 待处理：1 条 P2。本轮新增问题见 INC 编号条目。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 40 文件、测试/测试工具 44 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`61e5a424 fix(rxdb-adapter-pglite): keep verified pglite release`；`967aa658 12313`；`9361d916 q`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：影子 schema 解析、播种/序列对齐、分支触发器与持有键、快照导入/只读封印、QueryCache 回填事件、公开仓库事务化及无日志删除通知。
- 实现锚点：`src/PGliteClient.ts`、`src/RxDBAdapterPGlite.ts`、`src/backup/pglite-backup-compat.ts`、`src/backup/pglite-restore-fs.ts`、`src/backup/pglite-restore-lock.ts`、`src/entity/delete_sql.ts`、`src/entity/deletes_sql.ts` 等 40 个实现文件。

## 发现

### P2：无日志实体的删除事件在事务提交前派发，回滚后仍通知应用删除（INC-002）

- 引入：`b109ba33`（PR #122）。同一问题同时影响 PGlite 与 sqlite-core，汇总只计一条。
- 证据：`packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts:97-98`、`packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:113-114`；两处均在 DELETE 语句返回后立即调用 `dispatchUnloggedRemovals` / `dispatch_unlogged_removals`。执行器的 `writeQuery` 直接复用外层事务，这时还没 COMMIT。
- 触发：实体声明 `log: false`；在 `adapter.transaction()` 中经 `executor.getRepository(Entity).remove(row)` 删除后，后续语句或业务逻辑抛错。事务回滚、行仍存在，但 `ENTITY_LOCAL_REMOVE` 已到达应用订阅者，不能随数据库回滚。
- 验证：本轮用真实内存 PGlite 执行临时回归；回滚后 `count() === 1`，预期零次删除通知，实际收到一次，断言失败。SQLite 侧按同源调用顺序静态确认，未把它写成真实 SQLite 已复现。
- 建议：把通知收集到所属事务，在提交成功后统一派发；回滚丢弃。补显式事务回滚、提交失败与正常删除的共享回归。

## 验证与限制

本轮 Node 模式真实 PGlite 的 worktree isolation/table-set/history-isolation/long-namespace/lifecycle-recovery **5 文件 / 53 例通过**。INC-002 临时回归按预期失败（行保留、删除事件已发）；复现后已移除临时文件。未跑本包全量测试。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
