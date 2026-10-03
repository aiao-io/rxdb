---
kind: review-execution
object: rxdb-adapter-sqlite-core
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb-adapter-sqlite-core：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

调用当前源码 SQL 构建器，在 Node 26 DatabaseSync 内存库执行 JSON1/NULL 查询。3 个一致性断言均失败；没有运行 browser/Worker/WASM/桌面宿主、事务/备份/迁移或整包覆盖率门禁。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts)
- [`packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts)
- [`packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.utils.spec.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.utils.spec.ts)
- [`packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.spec.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.spec.ts)

## 2. 评审意见

- [RV-028：keyValue 缺失键被 JS 转成字符串，违反 SQLite NULL 语义](../../RV-028-core-keyvalue-missing-key-null.md)
- [RV-029：空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致](../../RV-029-core-empty-notin-null.md)

## 3. 动态证据与复验

[SQL/JS 两后端的真实一致性断言日志](../../evidence/2026-10-03/query-probes-round2.log)

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../packages/rxdb-adapter-sqlite-core.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。
