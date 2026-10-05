---
kind: review-execution
object: rxdb-adapter-sqlite
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-sqlite：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

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

🔴 树 where 拓扑与增量的真实跨层对照确认 RV-046（已修复，见 README 2026-10-05 清理记录）。本后端的标量字段 alias 正常，实际 SQL 按 where 截断 hidden-parent；公开 query task 却将叶子错误增入。官方 SQLite-WASM / Chromium，实际 ORM save 与原生树查询 **1 failed /1 passed**：[日志](../../evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt)。

新增 spec 直接用 tree workspace 包。首次 0 tests 为该 consumer 未声明直接 devDependency，已按 link-workspace-packages 用 pnpm --save-dev/workspace:* 正式链接，没有补假 tsconfig paths：[链接日志](../../evidence/2026-10-04/tree-devtools/sqlite-test-dependency-link.txt) / [lock 语义范围](../../evidence/2026-10-04/tree-devtools/dependency-link-scope.json)。pnpm 顺便重算 website 两个 Docusaurus 的 debug peer key；版本 key 集合未新增/删除，不能谎称 lock 文本只改一条。未运行 approve-builds 或其它 lifecycle。

该测试的类型导入初次写错类文件/导出名已修正测试本身，未把这类取证错误算产品缺陷。其它 C 项和所有宿主未完成。

这次树查询是额外跨包联审，不据此核销本包 C3 的全部类型/事务最低场景。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/5。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 734 passed | 13 skipped (747)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:1231）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**共享core LA-02/LA-03；不是本包suite红**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                            | 当前结论/可证反证                                                                                                                                                            | 原 C 核销 | 剩余必要验证                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts:43–76`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts:26–51`                       | 加载资源fingerprint一致才复用，global load lock二次检查；factory init失败释放Comlink proxy，不静默忽略函数型远程选项。LA-03 是共享oo1初始化关闭窗口，不能用工厂catch来反证。 | 未核销    | 下载失败/能力不足/并发init/重复关闭完整生命周期；late oo1回归与真实 OPFS；错误资源和fallback配置全边界。           |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–235,265–305`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/execute_oo1_helper.ts:72–127`         | 同步oo1通过Promise入口执行；prepare读路径和exec路径责任不同。LA-03轻量回归确认在途load关闭后仍开库/ready。                                                                   | 未核销    | prepare/step/finalize失败、关闭中调用、无行返回与完整Promise错误归属；不同dbName重复init的契约与真实模块生命周期。 |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts:66–79`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1654–1712`                 | 类型/事务不是本包复制实现，而委托共享core；当前734 pass/13 skip只按配置宿主记账。旧树问题修复状态不反转。                                                                    | 未核销    | BigInt/binary/null/批写/分支过滤/提交事件同 fixture跨后端；13 skip逐项说明，提交时点与rollback完整边界。           |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,142–172`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:646–724` | 实际行拒绝坏信封；恢复要求同引擎blank描述与断开/独占锁。共享逻辑有守卫不等于官方OPFS恢复已经实测。                                                                           | 未核销    | 坏envelope/备份失败/非空目标/失败原库/页面刷新/持久化恢复；各transport的实际支持档位和版本资源。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/sqlite-official-load.utils.ts:62–76`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite/src/create_sqlite_client.ts:27–39`                       | WASM/proxy URL配置被传入实际模块加载并参与缓存identity。未读取全部打包文件/pack consumer，所以不宣称exports与资源闭合。                                                      | 未核销    | 发布后消费、独立类型、浏览器导入、离线与错资源部署；pack/部署与共享worker构建链路未当前执行。                      |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
