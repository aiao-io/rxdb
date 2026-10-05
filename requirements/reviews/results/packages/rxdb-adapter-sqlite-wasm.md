---
kind: review-execution
object: rxdb-adapter-sqlite-wasm
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-sqlite-wasm：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

sqlite-wasm 浏览器持久化适配器，含远程 client 与 VFS 按需装载。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts)
- [`packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts)
- [`packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts)
- [`packages/rxdb-adapter-sqlite-wasm/src/vfs-storage-loaders.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/vfs-storage-loaders.ts)
- [`packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts)
- [`packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts)
- [`packages/rxdb-adapter-sqlite-wasm/package.json`](../../../../packages/rxdb-adapter-sqlite-wasm/package.json)
- [`packages/rxdb-adapter-sqlite-wasm/project.json`](../../../../packages/rxdb-adapter-sqlite-wasm/project.json)
- [`packages/rxdb-adapter-sqlite-wasm/src/index.ts`](../../../../packages/rxdb-adapter-sqlite-wasm/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 VFS 与运行档位：核查 VFS loader、依赖按需导入、配置拒绝与数据库名；不能把不同 VFS 的持久性互相替代。
- [ ] C2 远程 client / Comlink：追踪请求与响应、对象/二进制传递、取消和 worker 释放；对照主线程 client 语义。
- [ ] C3 SQLite 事务与语句：核查执行助手和 core 委托，特别是 async callback、失败 cleanup 与提交后通知。
- [ ] C4 多标签页与分支：审查 SharedWorker/广播档位、branch materialization 与数据库生命周期。
- [ ] C5 加密与备份传输：核查 encrypted suite 接线、备份传输边界、恢复目标验证和版本资源闭合。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/5。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 1 failed | 871 passed | 13 skipped (885)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt:2205）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**LA-01（轻量回归确认）**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                           | 当前结论/可证反证                                                                                                                                                      | 原 C 核销 | 剩余必要验证                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts:76–121,127–177`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/vfs-storage-loaders.ts:23–38`                                                                                                                             | 冻结能力表按实际WorkerGlobalScope检查；OPFS主线程拒绝、fs-handle缺root拒绝，不降级。VFS聚合模块一次lazy import加载各预设，不是每个VFS独立懒加载。                      | 未核销    | 各VFS资源/OPFS不可用/无安全上下文与失败清理完整矩阵；工厂与发布资源consume、声明数据库名称边界。             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/create_sqlite_client.ts:65–77`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:159–201,232–241`                                                                                                                        | 每连接租独立Comlink端口、同Worker只能一个租客，caller/client所有权有区分；init失败释放代理。没有从这些正常释放路径推断worker崩溃能结算在途RPC。                        | 未核销    | Worker死亡/取消后的晚到结果/BigInt/binary异常序列化、订阅释放；明确当前没有已核销的cancel/崩溃完整证据。     |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts:108–136`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:182–212,225–262`                                                                                                                                    | LA-01当前回归红：第二prepare失败时首条unscoped statement finalize实际0次；WA相应段用整段finally，不可用另一后端绿抵消。本client队列串行、初始化失败有close/aggregate。 | 未核销    | 真实WASM busy/可关库后果；所有prepare/step/finalize、并发/回滚/提交通知/已关闭调用；13 skip不能作通过。      |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:243–250,273–335`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts:153–201`                                                                                                                              | update_hook事件按type/db/table聚合，batch debounce+max timer；Worker端口只租一个client，没有恢复已删writer lease。按数据库分组不自动保证active branch和跨标签可见性。  | 未核销    | 真正多标签不同库/同库、分支切换/物化、删除重建、重开与Worker重启；事件branch隔离仍须联审。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts:34–44`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:142–173` | 当前备份只交付主线程memory/idb；Worker/SharedWorker显式unsupported，不是“远程备份已经通过”。其它VFS也拒绝。加密suite接线存在不替代tamper/字节扫描。                    | 未核销    | 主线程idb刷新/备份传输完整性/坏归档/原库与tamper；worker备份为当前不支持，但拒绝及发布版本资源仍须完整核查。 |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
