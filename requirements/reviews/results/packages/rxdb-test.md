---
kind: review-execution
object: rxdb-test
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-test：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

实体与跨框架 fixtures、适配器契约共享套件及测试基础设施；这是后续证据的可信根之一。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-test/src/index.ts`](../../../../packages/rxdb-test/src/index.ts)
- [`packages/rxdb-test/src/testing/index.ts`](../../../../packages/rxdb-test/src/testing/index.ts)
- [`packages/rxdb-test/src/cross-framework-fixtures/index.ts`](../../../../packages/rxdb-test/src/cross-framework-fixtures/index.ts)
- [`packages/rxdb-test/public-contract/consumer.ts`](../../../../packages/rxdb-test/public-contract/consumer.ts)
- [`packages/rxdb-test/entities/Todo.ts`](../../../../packages/rxdb-test/entities/Todo.ts)
- [`packages/rxdb-test/package.json`](../../../../packages/rxdb-test/package.json)
- [`packages/rxdb-test/project.json`](../../../../packages/rxdb-test/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 套件本身的判别力：逐套件核查断言是否能区分错误实现；用故意破坏的测试替身检验失败路径，不仅看正确实现通过。
- [ ] C2 factory 与环境隔离：审查 adapter factory、清库、临时建表和关闭路径，检查动态表/触发器是否被正常回收。
- [ ] C3 共享套件调用闭合：对照所有适配器入口与 Tauri conformance 调用点，核对参数、跳过条件和删除后的引用。
- [ ] C4 三框架 fixtures：对照 cross-framework fixtures、公共 consumer 和生成实体，检查状态、字段 descriptor、查询泛型与异常断言。
- [ ] C5 覆盖率合并可信度：审查 coverage-acceptance 的多段运行、合并路径、源文件分母和产物代次；共享套件不能虚增生产覆盖率。
- [ ] C6 发布与依赖方向：核查 fixtures/testing 子入口、生成实体和依赖关系，确保生产消费者不会被迫安装整套测试宿主。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 专项任务核销

- [专用合并验收通过](../../evidence/2026-10-03/full-run/coverage-acceptance.txt)。

上述只是对应任务/平台的证据，专项 C 项/其它宿主未自动完成。

## 2026-10-05：parallel/core 实审交付

**execution: partial。原计划完整 C 核销为 0；下表“部分核销”只核销已实审子面，不勾原 C，也不等于业务修复/发布就绪。** 未读/必要未测明确保留，覆盖率和当前门禁通过不覆盖未审正文。

本轮基线 `44de1138b4d396fc45d6e76ab60476c40fef2223` + 当前工作区，2026-10-05（Asia/Shanghai）。scope 受控 114 文件；有正文审读记录 18 文件（全文 16、分段 2），不是整对象全文清单。新生成spec另记，不计作已审生产代码。逐区间/版本见 [实际文件审读登记](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/file-inspection.json)。

### 当前验证（只限其日期、输入与测量面）

- 2026-10-05 统一 strict lint、typecheck 均通过，缓存禁用、主控串行；typecheck包含51依赖任务。输入清单**不含本子任务晚加的4个spec**，不外推这些新文件门禁已绿。[lint状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json)；[typecheck状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json)。
- 本轮主控普通test：Test Files 21 passed (21)；Tests 210 passed (210)。[原始执行日志](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)。整批退出1不等于本对象全部失败，也不把失败测试算通过。
- 当前原配置四指标 **91.12/91.92/83.22/92.27%**（S/B/F/L），阈值 80% 达标；这是普通src测量面，不是本包coverage-acceptance。[保留的summary](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-test/coverage-summary.json)。
- 2026-10-03/04 原日志、原SHA、原pass/skip继续保留为历史；不称作本轮。晚加 clone-array/teardown spec 的最终结果由主控 supplement 追加，本次写作未取得，不等队列空转。

### C 证据 / 结论表

| C   | 本轮实际审查所得 / 源码锚点                                                                                                                                                                                                                    | 验证面                                                                                                                      | 核销结论                                               | 必要待证 / 下一批动作                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `packages/rxdb-test/src/transaction/bootstrap.suite.ts:56-90`：查物理 migration 水位而非内存VFS重连假绿；回滚负例故意提供未建表实体，断言业务表和迁移表都不存在。三套事务 afterEach 吞 dispose 拒绝（候选3），不是持久化后端问题的动态证明。   | bootstrap/readiness及 isolation 前段已读；新增故障替身测试捕获实际注册 hook，3边界+3正常，待 supplement。                   | 部分核销：引导判别器、关闭失败判别缺口。               | encrypted/sortable/tree/query-cache 全部套件和错误替身未读完；不能仅用正确实现 pass 核销完整 C1。                                                          |
| C2  | `packages/rxdb-test/src/testing/sqlite.ts:120-169,179-238`：精确影子表后缀、identifier 转义、删除前检查 main 分支恢复前提；事务关闭日志，初始能力行在触发器恢复前补回，finally 再清缓存。seed-lock 对同 key 串行且前次拒绝不拖死后续。         | 清库/seed-lock/事务factory协议全文已读；本轮主套使用替身，不能声称真实SQLite两轮隔离已证。                                  | 部分核销：清库顺序与前置拒绝；候选3待复验。            | 多连接、失败 teardown、清库两轮和真实动态触发器回收还缺对应宿主证据；已开的 probe.dispose 正常 finally 不与吞错混淆。                                      |
| C3  | `packages/rxdb-test/src/transaction/types.ts:23-102`：executor 身份/终态与队列外 query 的协议明确；无具体 adapter import，factory 为结构类型。                                                                                                 | 类型/构建本轮通过；没有将协议声明本身当所有后端执行通过。                                                                   | 部分核销：共享事务接口与依赖方向。                     | 所有 adapter/Tauri 调用入口和删 rowsAffectedConformanceSuite 后引用未在本子任务逐一核查；真实后端重跑归主控，未核销。                                      |
| C4  | `packages/rxdb-test/src/index.ts:19-26` 根重导出同一 cross-framework-fixtures；当前普通覆盖报告列出了 descriptor/live-cursor/search/sync-override 文件，证明其属于当前测量面，不证明三端真实行为一致。                                         | 普通 test本轮通过；统一typecheck含三端，但本轮未人工逐行审四个fixture/三端调用测试。                                        | 部分：仅入口/测量面核对，语义未核销。                  | 四个fixture和实际Angular/React/Vue同数据失败序列仍待逐行联审；不能据共享导出或框架整包绿打勾。                                                             |
| C5  | `packages/rxdb-test/scripts/run-coverage-acceptance.mjs:14-23,54-95,150-166`：临时根代次隔离、失败清最终输出、canonical source去重、expected/actual双向相等、四指标≥80；merge分母为src+entities+shop，suite排除。                              | runner/merge/unit配置已读；本轮普通覆盖33键/验收预期59受控生产键，缺26键，详见 validation-reconciliation.json。             | 部分核销：合并/分母/失败清理静态边界；普通覆盖面达标。 | coverage-acceptance 当前未执行，缺真实合并与故障段/陈旧blob/重复计入负例；普通91.12/91.92/83.22/92.27不能替代验收。runner快照检查需避开并行新增/删除文件。 |
| C6  | `packages/rxdb-test/scripts/verify-public-contract.mjs:24-89`：8入口与package exports集合精确对应、增删/改种类均报错，root版本/实体数量一致；root导出工具与fixture，suite在独立子路径。package把vitest声明为直接依赖，不能宣称安装无宿主负担。 | 本轮build日志明确 Public contract OK: 97 exports across 8 entries；NodeNext consumer由build/typecheck执行，但其正文未全审。 | 部分核销：8子入口运行时形状与现有构建契约。            | 发布pack清单、无vitest业务安装/消费、全部generated entity/consumer正文未完整审；不得拿同仓dist导入冒充隔离安装。                                           |

### 已闭环子面与仍未完成

下表不是再排一次计划：它记录已读实现、正常路径/反证、当前测试结果与确切缺口。**已闭环的是对应子面和门禁事实，不是未读的整 C。** 全对象收尾数仍为0；未完成条件主要是受控正文未全审、必要动态/真实消费或本包验收缺口。

候选问题及最小修法/回归见 [4个待主控去重编号候选](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/findings.pending.md)；不自分RV、不改现有报告。请求与已完成/待补测边界见 [原验证请求](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-requests.json)、[当前验证核对](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/core/validation-reconciliation.json)。

## R3-05 · 2026-10-05 · cleanup verdict 有界补证结算

- **补证冻结，不扩事务 suite/harness 组。** 最小成功 connect/query body 使用同一工厂：直接 afterEach await dispose 拒绝→失败；原 readiness 对应 body 成功、adapter.disconnect 与 factory.dispose 明确拒绝→仍通过。真实共享 runner exit 0，已补上旧 connect 故意失败 harness 无法证明的缺口。
- 已执行：direct **1 pass / 1 fail，exit 1**；三个原共享 suite 正常/拒绝关闭对照 **22 pass / 0 fail，exit 0**，10 个 opened 数据库拒绝关闭；bootstrap probe **2 pass / 1 fail，exit 1**，finally 直接 await 不吞错误。所有 pending/todo=0，无 Vitest 注册 mock、无手工回调重放、无 skip/only/name 过滤。
- **结算轴分开**：有界补证缺口闭合 1；只补强既有 CORE-PENDING-3，新增独立候选 0、主 RV 确认 0。三共享 hook 明确 best-effort，原 adapter 工厂还自行 catch disconnectAll；公开 C1/C2/C3 声明未明确要求 cleanup 失败令 conformance 红。是否违反 cleanup 契约交主控，不自编号。不能把成功体/失败关闭的实际假绿外推为真实后端泄漏或业务事务实现错误。
- 边界仅三原 suite 的 opened 数据库 afterEach；不含 bootstrap probe finally，不核销整组、完整 C1/C2、覆盖率或全适配器收尾。不等待平台或全量门禁，无待跑测试。
- 原 115 包文件 sourcehash 无变化。仅新增独占 spec / 证据、追加本节；新 spec strict 与 ESLint 零警告通过。全部测量使用指定共享锁，1 worker、CI、daemon false、skipRemoteCache/skipNxCache、排除任务依赖；不暂存提交。
- [最小对照与 raw output 索引](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/settlement.md)；[冻结四用例和 trace](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/minimal-control.frozen.json)；[机器核对与测量状态](/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round3/cleanup-verdict/comparison.json)。
