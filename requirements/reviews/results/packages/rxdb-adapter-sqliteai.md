---
kind: review-execution
object: rxdb-adapter-sqliteai
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-sqliteai：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

SQLiteAI 运行时的 adapter、client 和资源装载，复用 SQLite 数据层。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts`](../../../../packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts)
- [`packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts`](../../../../packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts)
- [`packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts`](../../../../packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts)
- [`packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts`](../../../../packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts)
- [`packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts`](../../../../packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts)
- [`packages/rxdb-adapter-sqliteai/package.json`](../../../../packages/rxdb-adapter-sqliteai/package.json)
- [`packages/rxdb-adapter-sqliteai/project.json`](../../../../packages/rxdb-adapter-sqliteai/project.json)
- [`packages/rxdb-adapter-sqliteai/src/index.ts`](../../../../packages/rxdb-adapter-sqliteai/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 运行时装载与版本：核查 SQLiteAI 模块/WASM 配对、options 和初始化状态，不从包名推断所有 AI API 已公开。
- [ ] C2 扩展能力边界：对照公开接口、README 和实际引擎 capability，列明支持与不支持的扩展功能。
- [ ] C3 SQL / client 共用语义：逐项审查同步/异步助手、参数、结果与事务委托。
- [ ] C4 加密、搜索与备份：核查已接入的 encrypted/conformance suite 与备份实现；搜索支持按实际 capability 判定。
- [ ] C5 应用接线与发布：对照 Angular 演示的初始化入口、公开 exports 和资源复制规则。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/5。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 743 passed | 10 skipped (753)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt:1790）。
- 四指标 S/B/F/L = 95.65/100/100/95.45%；summary/final：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-adapter-sqliteai/coverage-summary.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-adapter-sqliteai/coverage-final.json`。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**共享core LA-02/LA-03；本包743pass不反证共享层窗口**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                            | 当前结论/可证反证                                                                                                                             | 原 C 核销 | 剩余必要验证                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts:46–78`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/create_sqlite_client.ts:26–49`                                                                                                                                          | 加载fingerprint/global lock/assertOo1Static与官方路径同契约；错误不换其它引擎。当前模块构造成功只证明oo1结构，不证明AI所有扩展。              | 未核销    | 网络/资源配对/能力不足/初始化失败重试，以及LA-03共享oo1关闭屏障；不同配置/模块版本实际部署。                       |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/index.ts:1–18`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:13–20`                                                                                                                                                               | 公开入口暴露adapter/client/loader及core通用SQL接口，没有专门AI向量/记忆方法承诺；不能从包名推断能力。                                         | 未核销    | 真实引擎各扩展capability探针、版本差异/缺扩展拒绝；现有suite中的能力skip需要单列，而不是仅构造绿。                 |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:13–20`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–235,265–305`                                                                                                                                 | 同步/异步/类型/事件均委托Oo1ClientBase；LA-03已在共享层轻量回归证实。本包743pass/10skip与共享层生命周期红并不矛盾。                           | 未核销    | BigInt/binary/null批写回滚/重开跨后端同fixture、statement各失败阶段、真实OPFS关闭；10skip逐项核销。                |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:142–173`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts:18–32` | 加密类型suite有实际接线；恢复blank按同引擎初始对象描述，不能用“没有任何表”的假设排除sqliteai自建表。搜索必须按capability而非SQL生成存在判断。 | 未核销    | 加密log字节/tamper、搜索真实扩展与索引、损坏备份/失败清理/持久化恢复全场景；未执行部分明确记录。                   |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/index.ts:13–18`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/sqliteai-load.utils.ts:65–78`                                                                                                                                                         | loader资源配置实际被传入；包公开API边界可见。本次四指标95.65/100/100/95.45只衡量本包配置源码，不覆盖共享core/全部WASM宿主。                   | 未核销    | Angular真实页面初始化、exports/WASM资源复制及pack后consumer、独立types、离线部署错误未当前验证；不能整对象closed。 |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
