---
kind: review-execution
object: rxdb-adapter-pglite
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
---

# rxdb-adapter-pglite：实际代码评审记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

调用当前源码 SQL 构建器，在真实 Node PGlite 内存库执行 JSONB/NULL 查询。3 个一致性断言均失败；一轮配套的[现有系统迁移 test-node 日志](../../evidence/2026-10-03/pglite-migration-baseline.txt)记录为 10 passed，但不等于本包完整迁移/浏览器/OPFS 已验证。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-pglite/src/query/query_sql.ts`](../../../../packages/rxdb-adapter-pglite/src/query/query_sql.ts)
- [`packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts`](../../../../packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.utils.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.utils.spec.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.residual.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/query_sql.residual.spec.ts)
- [`packages/rxdb-adapter-pglite/src/__tests__/query/json-numeric-compare.spec.ts`](../../../../packages/rxdb-adapter-pglite/src/__tests__/query/json-numeric-compare.spec.ts)
- [`packages/rxdb-adapter-pglite/vite.config.mts`](../../../../packages/rxdb-adapter-pglite/vite.config.mts)

## 2. 评审意见

- RV-027：PGlite keyValue contains 与核心/SQLite 查询语义不一致（已修复，见 README 2026-10-05 清理记录）
- RV-029：空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致（已修复，见 README 2026-10-05 清理记录）

## 3. 动态证据与复验

[SQL/JS 两后端的真实一致性断言日志](../../evidence/2026-10-03/query-probes-round2.txt)

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
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：RV-027/029/034（已修复，见 README 2026-10-05 清理记录）

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

## 续执行：2026-10-03 边界取证

### 真实工作树公开提交链路

实际 PGlite / Chromium / memory store，使用同一共享 conformance。原 **53 passed**；新增公共 commit 原请求重放断言后 **1 failed / 53 passed**：[日志](../../evidence/2026-10-03/follow-up/rxdb-adapter-pglite-public-retry.txt)。两端同样被过期 HEAD 凭据挡住，统一记 RV-041（已修复，记录已删除），不重复报成两个 SQL 编译器问题。

本次配置的 testing 与门面走源码入口；与 SQLite 的构建输入不同。真实事务对照不证明本轮持久化 store、恢复/加密/全部并发边界已经通过（原 RV-027 / RV-029 / RV-034 查询红测试已于 2026-10-05 修复，见 README 清理记录）。

## 2026-10-04：第二批实际深审

### C5：备份恢复独占与失败清理

人工阅读 restoreLocked 独占锁/目标非空检查、RestoreMemoryFs / RestoreIdbFs 的提交前禁止 syncToFs、引擎/schema/codec 验证、marker 生命周期、失败关闭/删除目标与 cleanup_pending。本专题未发现新增确认缺陷。

failure / memory / concurrency / roundtrip 四个 spec **50 passed**：[日志](../../evidence/2026-10-04/pglite-backup-boundaries.txt)。真实 PGlite / Chromium 的 memory + IndexedDB 路径，包含同目标两个恢复者、stage 期间拒绝连接、非空/忙/不兼容/损坏/取消、失败后清理与显式重试。不是所有 Worker/目录/桌面/强杀场景（原 RV-027/029/034 已于 2026-10-05 修复，见 README 清理记录）。

C5 仍部分核销；其它宿主和完整加密/强杀矩阵继续执行，不给全对象通过评级。

## 2026-10-04：树查询与 DevTools 第三批深审

🔴 树普通字段筛选确认 RV-045（已修复，见 README 2026-10-05 清理记录）。PGlite alias 只处理 children.field，标准 title 条件在递归 self join 里未限定，四方法真实 SQL 报 42702。新增 **4 failed /2 passed**：[日志](../../evidence/2026-10-04/tree-devtools/tree-scalar-filter-pglite.txt)，无筛选的两个对照正常。

最初尝试订阅增量时初次快照已失败，日志有未处理 SQL error；它不是 RV-046 的 PGlite 漂移证据。后续改成直接 await repository 的六个明确断言，保留源探针快照和初次日志，不隐藏收集/前置错误。业务实现未修，已有 query/array/backup/commit 记录不覆盖这个新问题。

## 2026-10-05：加密初始化取消联审

C2 与加密生命周期联审：Chromium 的原 PGlite memory adapter/storage/encryption facade 真实执行，keyring 表 COUNT 证实被取消 A 仍初始化，B 被旧 verifier 拦住；**2 failed /1 passed**，统一 RV-058（已修复，见 README 2026-10-05 清理记录）。初版误假设 facade 有 isInitialized，已改原表查询；不为满足复验添加不存在的 API。memory 测量不外推磁盘崩溃/关闭恢复；本包原查询红仍保留。

[本轮源码/命令与未完成项](../../execution-2026-10-05-encrypted.md) · [最终状态观测](../../evidence/2026-10-05/encrypted/final-observations.json)。encrypted/Electron/PGlite 严格 lint/typecheck 通过，业务未改；sqlite-core 没有伪造本轮独立 lint/整包通过。coverage 关闭，不自动核销 C 专题。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/7。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 10 passed (10)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:263）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**未新增确认问题；不是整对象通过**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                               | 当前结论/可证反证                                                                                                                                                 | 原 C 核销 | 剩余必要验证                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/query/query_sql.ts:140–153`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/query/query_tree_sql.ts:80–118`                                  | NULL 排序按 SQLite 的最小值口径；树递归 where 已明确 children 表别名，RV-045 旧歧义不再报告。                                                                     | 未核销    | 完整 quoting/类型/JSON/空批次/重复键/关系/cursor 同 fixture 方言比较；本批只见 test-node 10 pass，不能代替浏览器全部查询。               |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:100–136,140–181`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/change-pipeline.ts:23–63,67–108`             | NOTIFY按 type/table/id 去重，容量和 max-wait 同步判定；handler 同表串行、异表并行，错误走 changeErrors，flush 有 deadline。事件窗口容量不是慢消费者任务总量上界。 | 未核销    | 突发/慢消费/乱序/取消/重连/回滚/不活跃分支完整行为及最后状态验证；本轮不追加新候选。                                                     |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts:96–128,183–210,213–294`                                                                                                          | 水位/约束/触发器在事务内处理，NOWAIT锁失败 typed error；activeKey补列/唯一约束按 PG 顺序；storage-peer 不冒充已迁移。                                             | 未核销    | 独立 test-node 的 10 pass 只证 Node migration；旧 schema/多 active/失败原子性/切分支后建表还须 browser/current source 全边界。           |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/PGliteClient.ts:60–74,90–133,154–185,403–415,548–647`                                                                                                            | memory 与 idb 默认区分，只有 opfs-ahp 才造 Worker；初始化失败终止 Worker/释放资源；disconnect 先 durability flush，失败仍清理并报 DURABILITY_LOST。               | 未核销    | worker 中断、并发打开/重试/取消与持久化刷新；生命周期公开参数不同而并发共用 init 的完整契约尚未核销。                                    |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/PGliteClient.ts:471–486`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/backup/pglite-exclusive.ts:23–38`                                   | 快照要求同线程真实 runtime 及内部查询/事务锁；独占区检查 sole holder，非支持档位明确拒绝。内部锁仅保护该 runtime，不宣称跨实例一致。                              | 未核销    | restore-lock/marker/数据目录清理全边界未读完；跨实例/标签页恢复冲突、损坏/取消/半途失败与旧库可用性须当前动态证据；历史 50 pass 不继承。 |
| C6  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/fts/create-fts-table.ts:26–38`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts:83–116`                             | PG tsvector/GIN 与 FTS5 机制不同；触发函数按 schema qualify，regconfig先校验。公开 peer/子入口不能从本段 DDL 直接核销。                                           | 未核销    | 中英文搜索同 fixture、索引更新、缺可选 Tree peer、keyring/打包 consumer/全部公开入口与资源审查。                                         |
| C7  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-pglite/src/PGliteClient.ts:86–87,102–133`；`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:248–263` | 当轮已结算 test-node 10 pass。未把 Node 迁移/mock residual 当 browser conformance；本次快照未汇入 PG 全浏览器目标结算/summary/final。                             | 未核销    | 主控后续 browser 全套与四指标同代性/配置排除/skip/真实 idb/OPFS 独立记录；剩余大包结果不预判。                                           |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。

## 2026-10-05 R3：真实空树计数复验

**🟡 已确认P2 RV-079。** 对不存在/已删除锚点，真实PGlite仓储countDescendants/countAncestors均返回-1，行查询为空；存在锚点对照各1正确。生成器非根分支count(*)-1无条件减锚点，SQLite同契约已处理空集，仅作源码对照。numeric0/string三端各六公开资源也发布成功的-1，归适配器SQL，不在三个wrapper重复登记。

[最小SQL原日志](../../evidence/2026-10-05/parallel-round3/tree-real/independent-count-anchor/20261005T153041127937.txt) · [本轮判定与tar来源](../../evidence/2026-10-05/parallel-round3/tree-real/settlement.json)。没有修改业务、没有宣布整包已审完/发布就绪。
