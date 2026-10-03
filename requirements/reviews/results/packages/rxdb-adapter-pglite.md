---
kind: review-execution
object: rxdb-adapter-pglite
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb-adapter-pglite：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

调用当前源码 SQL 构建器，在真实 Node PGlite 内存库执行 JSONB/NULL 查询。3 个一致性断言均失败；一轮配套的[现有系统迁移 test-node 日志](../../evidence/2026-10-03/pglite-migration-baseline.log)记录为 10 passed，但不等于本包完整迁移/浏览器/OPFS 已验证。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-pglite/src/query/query_sql.ts`](../../../../packages/rxdb-adapter-pglite/src/query/query_sql.ts)
- [`packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts`](../../../../packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.utils.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.utils.spec.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.residual.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.residual.spec.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/json-numeric-compare.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/json-numeric-compare.spec.ts)
- [`packages/rxdb-adapter-pglite/vite.config.mts`](../../../../packages/rxdb-adapter-pglite/vite.config.mts)

## 2. 评审意见

- [RV-027：PGlite keyValue contains 与核心/SQLite 查询语义不一致](../../RV-027-pglite-keyvalue-query-semantics.md)
- [RV-029：空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致](../../RV-029-core-empty-notin-null.md)

## 3. 动态证据与复验

[SQL/JS 两后端的真实一致性断言日志](../../evidence/2026-10-03/query-probes-round2.log)

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../packages/rxdb-adapter-pglite.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

浏览器本地 PostgreSQL 适配器，含 Worker、通知、FTS、系统迁移与备份恢复。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts`](../../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)
- [`packages/rxdb-adapter-pglite/src/PGliteClient.ts`](../../../../packages/rxdb-adapter-pglite/src/PGliteClient.ts)
- [`packages/rxdb-adapter-pglite/src/change-pipeline.ts`](../../../../packages/rxdb-adapter-pglite/src/change-pipeline.ts)
- [`packages/rxdb-adapter-pglite/src/pglite.browser.worker.ts`](../../../../packages/rxdb-adapter-pglite/src/pglite.browser.worker.ts)
- [`packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts`](../../../../packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts)
- [`packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts`](../../../../packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts)
- [`packages/rxdb-adapter-pglite/package.json`](../../../../packages/rxdb-adapter-pglite/package.json)
- [`packages/rxdb-adapter-pglite/project.json`](../../../../packages/rxdb-adapter-pglite/project.json)
- [`packages/rxdb-adapter-pglite/src/index.ts`](../../../../packages/rxdb-adapter-pglite/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.log)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.log) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.log)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.log)     |

当前确认意见：[RV-027](../../RV-027-pglite-keyvalue-query-semantics.md)、[RV-029](../../RV-029-core-empty-notin-null.md)、[RV-034](../../RV-034-pglite-array-membership-semantics.md)

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 SQLite / PG 语义对齐：逐个查询和写入操作对比两种方言的 quoting、参数、排序、NULL、类型和返回值。
- [ ] C2 通知与反压：追踪 change-pipeline 与 PGliteClient 的通知批处理、乱序、订阅取消和事务提交时点。
- [ ] C3 迁移、触发器与分支：核查 createTables、系统版本水位、分支约束与重挂触发器；区分 Node 模式迁移与浏览器真实执行。
- [ ] C4 Worker 与存储生命周期：审查 client factory、worker RPC、数据目录、初始化和关闭；确认具体存储档位而非假设全为 OPFS。
- [ ] C5 备份恢复独占：检查 backup/data-dir/exclusive/restore-lock 协作与桌面 PGlite 复用边界。
- [ ] C6 搜索与公开入口：核查 PG FTS backend、可选 Tree peer、keyring 和公开导出；未装插件不产生隐藏运行时依赖。
- [ ] C7 真实测试证据：区分 mock residual、Node migration 和 browser conformance，检查覆盖率开启方式及 summary/final 同代性。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。
