---
kind: review-execution
object: rxdb-adapter-wa-sqlite
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-wa-sqlite：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

wa-sqlite 浏览器适配器及 client/loader，共享 SQLite 核心语义。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts)
- [`packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts)
- [`packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts)
- [`packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts)
- [`packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts)
- [`packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts)
- [`packages/rxdb-adapter-wa-sqlite/package.json`](../../../../packages/rxdb-adapter-wa-sqlite/package.json)
- [`packages/rxdb-adapter-wa-sqlite/project.json`](../../../../packages/rxdb-adapter-wa-sqlite/project.json)
- [`packages/rxdb-adapter-wa-sqlite/src/index.ts`](../../../../packages/rxdb-adapter-wa-sqlite/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 装载与档位：核查 WASM/glue 来源、VFS/Worker/SharedWorker 选择与配置校验；显式区分支持矩阵。
- [ ] C2 异步语句生命周期：检查 execute helper、statement finalize、参数/结果映射和异步回调边界。
- [ ] C3 多 realm 与隔离：核查远程 client、广播/锁的数据库命名隔离与关闭顺序，不增加已移除 writer lease。
- [ ] C4 共用契约与加密：对照 sqlite-core conformance 与 encrypted 测试调用点，检查业务层是否依赖后端特例。
- [ ] C5 备份传输与持久化：核查备份读取、Worker 传输、恢复目标、刷新后的数据归属。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** Chromium/真实 Wasm/MemoryAsyncVFS，async/no-worker，验证 namespace 冷缓存与物理表正向对照。应用刷新路径另测，不冒充本包 OPFS/多写者验收。

确认意见：[RV-061](../../RV-061-querycache-sqlite-nonpublic-namespace-target.md)。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/5。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 858 passed | 14 skipped (872)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:826）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**未新增确认问题；不是整对象通过**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                 | 当前结论/可证反证                                                                                                                                  | 原 C 核销 | 剩余必要验证                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:67–68,193–241,257–297`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/create_sqlite_client.ts:25–60`               | 默认IDBBatchAtomicVFS；async模式来自同一次解析，已知sync/asyncify文件名错配加载前拒绝；函数型远程选项拒绝，能力表冻结，不偷偷换存储档位。          | 未核销    | 所有VFS/安全上下文/glue404/WASM版本/真实Worker与SharedWorker组合；vfs_register前后资源失败全部边界。         |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts:75–88,104–161`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:204–246`                          | 有界SQLITE_BUSY重试；绑定语句的收集/执行被finally覆盖，非绑定也逐条手工finalize，与LA-01形成反证。当前858pass/14skip不能证明每种清理错误都处理完。 | 未核销    | 第一个finalize失败仍清理剩余句柄、原始错误归属、取消/BigInt/binary/空结果与真实VFS statement泄漏验证。       |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:89–110,190–201,249–267,335–361`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:153–201` | 客户端identity冲突拒绝；初始化晚到会close迟到connection；关闭尝试数据库和VFS两种资源。Comlink同worker仅一租客，不表示不同realm的同库已证明隔离。   | 未核销    | 同/异数据库双标签、worker重启、关闭中事务和真实锁策略；关闭失败重复调用结果完整性尚未核销。                  |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-change-log.spec.ts:1–9`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1654–1712`        | 复用core事务/变更处理，加密log走persistent suite+readDatabaseFile；没有靠业务后端特例消掉不一致。                                                  | 未核销    | 完整conformance/分支物化/事务回滚/事件/tamper，逐一解释14skip；namespace已修历史状态不自动外推其它全部场景。 |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts:35–45`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,142–173`          | 备份仅主线程MemoryVFS/MemoryAsyncVFS/IDBBatchAtomicVFS；Worker/SharedWorker与其它VFS拒绝。这是声明支持面收缩，不能伪装全部OPFS持久化能力。         | 未核销    | 主线程IDB真实刷新/恢复坏档/失败原库/关闭后独占、二进制传输；Worker拒绝路径与部署资源/发布consumer闭合。      |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
