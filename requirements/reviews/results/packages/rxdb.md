---
kind: review-execution
object: rxdb
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb：实际代码评审记录

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

本批已动态验证公开 isEntityMatchWhere 与实际数据库的查询语义；事务/生命周期仅阅读相关片段，不算 C1/C4 完成。公开 Repository 的完整事件链与三框架补证仍未完成。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb/src/RxDB.ts`](../../../../packages/rxdb/src/RxDB.ts)
- [`packages/rxdb/src/rxdb.transaction.ts`](../../../../packages/rxdb/src/rxdb.transaction.ts)
- [`packages/rxdb/src/capture/raw-write-gate.ts`](../../../../packages/rxdb/src/capture/raw-write-gate.ts)
- [`packages/rxdb/src/repository/Repository.ts`](../../../../packages/rxdb/src/repository/Repository.ts)
- [`packages/rxdb/src/repository/QueryManager.ts`](../../../../packages/rxdb/src/repository/QueryManager.ts)
- [`packages/rxdb/src/repository/QueryTask.ts`](../../../../packages/rxdb/src/repository/QueryTask.ts)
- [`packages/rxdb/src/query/query-matching.utils.ts`](../../../../packages/rxdb/src/query/query-matching.utils.ts)
- [`packages/rxdb/src/query/query-rules-builder.ts`](../../../../packages/rxdb/src/query/query-rules-builder.ts)
- [`packages/rxdb/src/query/merge_create.ts`](../../../../packages/rxdb/src/query/merge_create.ts)
- [`packages/rxdb/src/query/need_refresh_create.ts`](../../../../packages/rxdb/src/query/need_refresh_create.ts)
- [`packages/rxdb/src/rxdb-utils.ts`](../../../../packages/rxdb/src/rxdb-utils.ts)

## 2. 评审意见

- RV-027：PGlite keyValue contains 与核心/SQLite 查询语义不一致（已修复，见 README 2026-10-05 清理记录）
- RV-028：keyValue 缺失键被 JS 转成字符串，违反 SQLite NULL 语义（已修复，见 README 2026-10-05 清理记录）
- RV-029：空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致（已修复，见 README 2026-10-05 清理记录）

## 3. 动态证据与复验

[SQL/JS 两后端的真实一致性断言日志](../../evidence/2026-10-03/query-probes-round2.txt)

业务源码基线 `58b4bbb61efa71d4591cafab6a4c92955a7760dd`。SQL 复验明确关闭覆盖率；测试失败是预期的缺陷红灯，非 worker/service stopped 并发假失败。覆盖率未测量，也没有执行修复。

## 4. 尚未完成

- [ ] 原计划其余源码、C 项及真实运行环境补证。
- [ ] 针对确认问题先保持红测试，再最小修复、绿、重构。
- [ ] 适用的三框架/真实宿主及公开 API 兼容回归。
- [ ] 四项覆盖率、整包门禁与实际应用/E2E 链路。

原计划：[对应对象评审计划](../../packages/rxdb.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

本地优先数据层的核心契约：实体、查询、事务、插件生命周期、系统迁移、备份与可信写入。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb/src/RxDB.ts`](../../../../packages/rxdb/src/RxDB.ts)
- [`packages/rxdb/src/rxdb-adapter.ts`](../../../../packages/rxdb/src/rxdb-adapter.ts)
- [`packages/rxdb/src/rxdb.transaction.ts`](../../../../packages/rxdb/src/rxdb.transaction.ts)
- [`packages/rxdb/src/entity/entity-manager.ts`](../../../../packages/rxdb/src/entity/entity-manager.ts)
- [`packages/rxdb/src/repository/QueryManager.ts`](../../../../packages/rxdb/src/repository/QueryManager.ts)
- [`packages/rxdb/src/capture/raw-write-gate.ts`](../../../../packages/rxdb/src/capture/raw-write-gate.ts)
- [`packages/rxdb/src/backup/backup-archive.ts`](../../../../packages/rxdb/src/backup/backup-archive.ts)
- [`packages/rxdb/package.json`](../../../../packages/rxdb/package.json)
- [`packages/rxdb/project.json`](../../../../packages/rxdb/project.json)
- [`packages/rxdb/src/index.ts`](../../../../packages/rxdb/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：[RV-038](../../RV-038-backup-queue-synchronous-throw-hang.md)、[RV-039](../../RV-039-repository-dispose-aborts-database-teardown.md)、RV-027/028/029/034（已修复，见 README 2026-10-05 清理记录）

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 连接与插件生命周期：沿 connect / disconnect、插件依赖安装和销毁顺序画状态机；核查失败后资源归属，避免以 fallback 隐藏初始化失败。
- [ ] C2 实体身份与写入口：逐项核查 metadata 校验、identity cache、字段格式、关系、级联与操作权限；实例 save/remove 与批量 mutations 都要追到适配器。
- [ ] C3 查询与响应式增量：对比查询初始快照、merge_create/update/remove 与实际 SQL 结果；检查计数、排序、关联失效和游标边界。
- [ ] C4 事务与可信写入：追踪事务上下文、提交/回滚与事件发出时点；检查 TrustedWriteIntent、raw-write gate 和捕获挂载口，不扩大公开写权限。
- [ ] C5 迁移与能力水位：枚举系统迁移和 schema 指纹；检查旧客户端遇到已启用的新能力时如何拒绝，而非直接修改当前数据库。
- [ ] C6 备份与恢复边界：核查 archive / manifest / queue / lock 协作、版本和 schema 验证、数据库备份与文件存储的边界。
- [ ] C7 公共 API 与核心边界：逐项对照根入口、适配器接口、插件接口和生成客户端；核查内部实体函数、测试工具及可选插件是否越过公开边界。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [核心四指标 ≥90%](../../evidence/2026-10-03/full-run/core-coverage-gate.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 续执行：2026-10-03 边界取证

### 新确认意见

- 🔴 [RV-039：仓储销毁错误中断全库拆卸](../../RV-039-repository-dispose-aborts-database-teardown.md)，C1 / C2 的故障释放边界：两个红复验、一个正常对照。
- 🔴 [RV-038：备份队列同步抛错挂起](../../RV-038-backup-queue-synchronous-throw-hang.md)，C6 的公开 helper 边界：一个红复验、两个正常对照。SQLite/PGlite 当前 async snapshot 未复现同类常规备份故障。

### 已执行的生命周期/事务对照

人工追到 connect epoch、disconnectAll→shutdown→EntityManager.destroy、仓储关闭、事务事件排空和 trusted-write scope。原有五个相关 spec **52 passed**：[日志](../../evidence/2026-10-03/follow-up/core-lifecycle-transaction.txt)。这只证明这些对照，不覆盖新发现的 teardown 错误；新增复验分别仍 [2 failed / 1 passed](../../evidence/2026-10-03/follow-up/repository-teardown.txt) 和 [1 failed / 2 passed](../../evidence/2026-10-03/follow-up/backup-queue-sync-throw.txt)。

C1 / C6 部分执行，不勾完整核查：真实宿主资源释放、全备份恢复边界仍待验证。旧核心 coverage 数值和启动批绿色 test 不能覆盖新增红测试。
