---
kind: review-execution
object: rxdb-adapter-sqlite
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-sqlite：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

官方 SQLite WASM 的 adapter、oo1 client 与装载边界。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-sqlite/src/RxDBAdapterSqliteOfficial.ts`](../../../../packages/rxdb-adapter-sqlite/src/RxDBAdapterSqliteOfficial.ts)
- [`packages/rxdb-adapter-sqlite/src/SqliteOfficialClient.ts`](../../../../packages/rxdb-adapter-sqlite/src/SqliteOfficialClient.ts)
- [`packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts`](../../../../packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts)
- [`packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts`](../../../../packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts)
- [`packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts`](../../../../packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts)
- [`packages/rxdb-adapter-sqlite/package.json`](../../../../packages/rxdb-adapter-sqlite/package.json)
- [`packages/rxdb-adapter-sqlite/project.json`](../../../../packages/rxdb-adapter-sqlite/project.json)
- [`packages/rxdb-adapter-sqlite/src/index.ts`](../../../../packages/rxdb-adapter-sqlite/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 官方 WASM 装载：审查 factory 的 options、资源路径、宿主检测和初始化失败的释放。
- [ ] C2 oo1 与异步契约：核查同步 SQLite API 向上层异步接口的转交、statement 生命周期和错误归属。
- [ ] C3 类型与事务：对照 core SQL/类型映射和本包执行用例，确认引擎差异没有泄露给消费者。
- [ ] C4 加密与恢复：追踪 keyring、加密 CRUD/tamper 与官方 SQLite 备份入口。
- [ ] C5 发布资源闭合：核查 exports、WASM 外部资源和构建后的 consumer，不仅检查工作区 alias。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 续执行：2026-10-03 边界取证

### 真实工作树公开提交链路

使用实际官方 SQLite-WASM / Chromium，沿 shared conformance 的库工厂、插件安装、enable、实体 save 和公开 commit 复验。原共享套件 **53 passed**，新增公共 API 原请求重试断言后 **1 failed / 53 passed**：[日志](../../evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-public-retry-built.txt)。根因是公共插件命令顺序，不重复建立后端 SQL 缺陷，统一记 RV-041（已修复，记录已删除）。

该配置实际读取 built testing 子路径。新源码第一次未重建时未收集 probe；已 [登记该绿结果的限制](../../evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-public-retry-status.json)，重建后失败栈落到新产物断言。证明“无 Nx 缓存”仍不自动证明输入产物足够新。

这是 Chromium / 当前 WASM 路径，不外推其它 VFS、平台或全部适配器行为；完整专项继续待核销。

## 2026-10-04：树查询与 DevTools 第三批深审

🔴 树 where 拓扑与增量的真实跨层对照确认 [RV-046](../../RV-046-tree-filtered-ancestor-incremental-drift.md)。本后端的标量字段 alias 正常，实际 SQL 按 where 截断 hidden-parent；公开 query task 却将叶子错误增入。官方 SQLite-WASM / Chromium，实际 ORM save 与原生树查询 **1 failed /1 passed**：[日志](../../evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt)。

新增 spec 直接用 tree workspace 包。首次 0 tests 为该 consumer 未声明直接 devDependency，已按 link-workspace-packages 用 pnpm --save-dev/workspace:* 正式链接，没有补假 tsconfig paths：[链接日志](../../evidence/2026-10-04/tree-devtools/sqlite-test-dependency-link.txt) / [lock 语义范围](../../evidence/2026-10-04/tree-devtools/dependency-link-scope.json)。pnpm 顺便重算 website 两个 Docusaurus 的 debug peer key；版本 key 集合未新增/删除，不能谎称 lock 文本只改一条。未运行 approve-builds 或其它 lifecycle。

该测试的类型导入初次写错类文件/导出名已修正测试本身，未把这类取证错误算产品缺陷。其它 C 项和所有宿主未完成。

这次树查询是额外跨包联审，不据此核销本包 C3 的全部类型/事务最低场景。
