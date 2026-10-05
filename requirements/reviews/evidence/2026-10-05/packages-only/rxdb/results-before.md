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

当前确认意见：RV-038（已修复，记录已删除）、RV-039（已修复，记录已删除）、RV-027（已修复，见 README 2026-10-05 清理记录）、RV-028（已修复，见 README 2026-10-05 清理记录）、RV-029（已修复，见 README 2026-10-05 清理记录）、RV-034（已修复，见 README 2026-10-05 清理记录）

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

- 🟢 RV-039（已修复，记录已删除）：仓储销毁错误中断全库拆卸，C1 / C2 的故障释放边界：两个红复验、一个正常对照。
- 🟢 RV-038（已修复，记录已删除）：备份队列同步抛错挂起，C6 的公开 helper 边界：一个红复验、两个正常对照。SQLite/PGlite 当前 async snapshot 未复现同类常规备份故障。

### 已执行的生命周期/事务对照

人工追到 connect epoch、disconnectAll→shutdown→EntityManager.destroy、仓储关闭、事务事件排空和 trusted-write scope。原有五个相关 spec **52 passed**：[日志](../../evidence/2026-10-03/follow-up/core-lifecycle-transaction.txt)。这只证明这些对照，不覆盖新发现的 teardown 错误；新增复验分别仍 [2 failed / 1 passed](../../evidence/2026-10-03/follow-up/repository-teardown.txt) 和 [1 failed / 2 passed](../../evidence/2026-10-03/follow-up/backup-queue-sync-throw.txt)。

C1 / C6 部分执行，不勾完整核查：真实宿主资源释放、全备份恢复边界仍待验证。旧核心 coverage 数值和启动批绿色 test 不能覆盖新增红测试。

## 2026-10-05：parallel/core 实审交付

**execution: partial。原计划完整 C 核销为 0；下表“部分核销”只核销已实审子面，不勾原 C，也不等于业务修复/发布就绪。** 未读/必要未测明确保留，覆盖率和当前门禁通过不覆盖未审正文。

本轮基线 `44de1138b4d396fc45d6e76ab60476c40fef2223` + 当前工作区，2026-10-05（Asia/Shanghai）。scope 受控 292 文件；有正文审读记录 2 文件（全文 0、分段 2），不是整对象全文清单。新生成spec另记，不计作已审生产代码。逐区间/版本见 [实际文件审读登记](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/file-inspection.json)。

### 当前验证（只限其日期、输入与测量面）

- 2026-10-05 统一 strict lint、typecheck 均通过，缓存禁用、主控串行；typecheck包含51依赖任务。输入清单**不含本子任务晚加的4个spec**，不外推这些新文件门禁已绿。[lint状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json)；[typecheck状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json)。
- 本轮主控普通test：Test Files 135 passed (135)；Tests 2400 passed | 1 skipped (2401)。[原始执行日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)。整批退出1不等于本对象全部失败，也不把失败测试算通过。
- 当前原配置四指标 **95.55/93.16/95.38/96.11%**（S/B/F/L），阈值 90% 达标；只证明当前include/exclude分母，不证明完整真实链路。[保留的summary](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb/coverage-summary.json)。
- 2026-10-03/04 原日志、原SHA、原pass/skip继续保留为历史；不称作本轮。晚加 clone-array/teardown spec 的最终结果由主控 supplement 追加，本次写作未取得，不等队列空转。

### C 证据 / 结论表

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                                      | 验证面                                                                          | 核销结论                                       | 必要待证 / 下一批动作                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C1  | `packages/rxdb/src/RxDB.ts:584-610`：构造持有options副本，syncOverrides校验/快照早于实体绑定和写入；管理器、syncState生命周期不同。RV-039旧修复记录保留原日期，本轮尚未人工追完整shutdown。                                                                      | 本轮core:test整包通过，历史2026-10-03生命周期52passed仍仅历史证据。             | 部分：构造/配置边界已审，完整C1未核销。        | connect epoch/依赖调度/插件销毁/异常释放全状态机未逐条读完；不能用当前核心大套代替资源归属检查。                        |
| C2  | `packages/rxdb/src/RxDB.ts:594-603`：覆盖配置在manager创建前快照，解析器与冻结数组共享同一次快照；未把实体数组复用同一原options当已安全绑定证明。                                                                                                                | 配置入口已读；实体模型本轮编译/测试绿仅证明已有测量面。                         | 部分：配置身份入口已审，mutation链未核销。     | entity-manager/identity cache/权限/级联/实例与批量到adapter正文尚未本轮全审；留下一批从保存失败无部分写的真实路径核查。 |
| C3  | `packages/rxdb/src/repository/QueryManager.ts` 是后续正文锚点（本轮未读）；已核查当前核心普通suite与coverage，不能将历史isEntityMatchWhere查询复验移为当前Repository增量证据。                                                                                   | 当前test通过，含skip按原日志登记；当前108源文件的coverage不是全部场景等价证明。 | partial：只有当前门禁/測量面；查询语义未核销。 | snapshot与增量merge/计数/关系失效/游标真实SQL对照尚未人工深追，正常测试绿不作无漂移反证。                               |
| C4  | `packages/rxdb/src/rxdb.transaction.ts`、`packages/rxdb/src/trusted-write/trusted-write-scope.ts`、`packages/rxdb/src/capture/raw-write-gate.ts` 是待审正文锚点；已实审history restore将intent绑executor，以及rxdb-test executor结构合同，两者不能替代核心实现。 | 当前核心套件通过；跨对象真实事务/可信写实现正文未审。                           | 部分：调用端与协议边界审查；核心C4未核销。     | 核心提交排空/回滚/嵌套并发/raw-write拒绝与捕获安装顺序待成对精审，不以接口文档证明权限隔离。                            |
| C5  | `packages/rxdb/src/RxDB.ts:70-74` 已读迁移/水位入口依赖；`packages/rxdb-test/src/transaction/bootstrap.suite.ts:56-90` 的水位/失败回滚判别器已读。imports不是实际拒绝旧客户端的证明。                                                                            | 核心测试通过，bootstrap共享套件最低协议已核对；系统升级实现未全读。             | 部分：迁移入口及共享判别器已审。               | system/migration-runner、capability-watermark正文及整连接链旧schema/插件缺失拒绝尚待补证。                              |
| C6  | `packages/rxdb/src/backup/backup-queue.ts`、`packages/rxdb/src/backup/backup-archive.ts` 是本轮未进入正文的锚点；RV-038旧修复+2026-10-03 queue红/绿证据保持原基线，不称本轮修复复验。                                                                            | 核心当前test/coverage通过；原backup队列报告不能替代archive/restore故障边界。    | partial：保留历史事实，完整备份专题未核销。    | queue/lock/schema/manifest/restore全链及部分写入/取消/文件边界未深追，本轮无“完整备份无丢数据”结论。                    |
| C7  | `packages/rxdb/src/RxDB.ts:1-74,584-610` 与生成器的split augmentation/恢复事务调用端已读；公开consumer类型链本轮实际运行。根index、adapter/plugin出口全集仍未逐条比对。                                                                                          | 统一typecheck包含69对象及51依赖任务；核心/生成器/rxdb-test本轮build有执行证据。 | 部分：当前消费者编译和已读调用边界。           | 根API全集、内部symbol/testing出口、可选插件缺失连接和真实公开安装尚未完整核销，不能把baseline更新等同兼容证明。         |

### 已闭环子面与仍未完成

下表不是再排一次计划：它记录已读实现、正常路径/反证、当前测试结果与确切缺口。**已闭环的是对应子面和门禁事实，不是未读的整 C。** 全对象收尾数仍为0；未完成条件主要是受控正文未全审、必要动态/真实消费或本包验收缺口。

候选问题及最小修法/回归见 [4个待主控去重编号候选](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/findings.pending.md)；不自分RV、不改现有报告。请求与已完成/待补测边界见 [原验证请求](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-requests.json)、[当前验证核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-reconciliation.json)。
