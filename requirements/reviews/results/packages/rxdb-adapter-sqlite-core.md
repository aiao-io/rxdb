---
kind: review-execution
object: rxdb-adapter-sqlite-core
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: partial
source-review: in-progress-original-scope
assessment-delivery: partial-checkpoint
scene-validation: focused-red-probes-only
release-validation: not-in-this-task
packages-only-evidence: requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core
---

# rxdb-adapter-sqlite-core：实际代码评审记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前源码阅读进度及新意见以文末「PKG-sqlite-core packages-only checkpoint」为准；local-adapters 与更早批次只作历史，不复报已修 RV。

**状态：部分执行。** 已确认问题见下文；未穷举全部受控文件，未完成本对象全部 C 项，不给全包 🟢。

## 1. 实际范围与取证方式

调用当前源码 SQL 构建器，在 Node 26 DatabaseSync 内存库执行 JSON1/NULL 查询。3 个一致性断言均失败；没有运行 browser/Worker/WASM/桌面宿主、事务/备份/迁移或整包覆盖率门禁。

以下是实际阅读/追踪的模块入口，包含专题片段，**不是声称逐行审完每个文件**：

- [`packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts)
- [`packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts)
- [`packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.utils.spec.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.utils.spec.ts)
- [`packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.spec.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/__tests__/query/query_sql.spec.ts)

## 2. 评审意见

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

原计划：[对应对象评审计划](../../packages/rxdb-adapter-sqlite-core.md)；进度：[全范围执行台账](../../execution-2026-10-03.md)。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

SQLite 适配器共同实现：SQL/映射、事务、迁移、FTS、备份及桌面线协议。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)
- [`packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts)
- [`packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts)
- [`packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts)
- [`packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts)
- [`packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts)
- [`packages/rxdb-adapter-sqlite-core/package.json`](../../../../packages/rxdb-adapter-sqlite-core/package.json)
- [`packages/rxdb-adapter-sqlite-core/project.json`](../../../../packages/rxdb-adapter-sqlite-core/project.json)
- [`packages/rxdb-adapter-sqlite-core/src/index.ts`](../../../../packages/rxdb-adapter-sqlite-core/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：RV-028/029（已修复，见 README 2026-10-05 清理记录）

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 适配器共同契约：沿 base adapter 与 Oo1 client 核查连接、查询、执行、关闭的责任边界；列出子适配器必须保证的能力。
- [ ] C2 事务、触发器与事件：检查 BEGIN/COMMIT/ROLLBACK、事务上下文、change trigger 与捕获安装顺序。
- [ ] C3 SQL 与类型映射：核查 identifier quoting、参数绑定、RuleGroup、排序/分页、批写与关系 SQL。
- [ ] C4 系统迁移与分支：逐项审查版本水位、系统表约束、分支过滤、active 分支唯一性与 schema 重挂。
- [ ] C5 FTS 与搜索约束：核查 FTS5 建表/触发器、CJK 处理和索引生命周期，检查所有子后端是否真实支持所声明能力。
- [ ] C6 备份与恢复：检查备份 SQL、恢复目标锁、blank database 校验、schema 与失败清理。
- [ ] C7 桌面协议与权限边界：审查 request/response、会话、能力协商、路径与恢复目标的严格校验；与 Electron/TS 和 Tauri/Rust 两端对照。
- [ ] C8 验收覆盖率与调用点：审查 coverage-acceptance 的运行/合并及 conformance 接线；一个共享套件变化必须核对所有后端。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：第二批实际深审

### C6：备份拒绝、回滚与恢复清理边界

人工追到 archive manifest/schema 校验→blank target 检查→marker→restore transaction→trailer/checksum→结构/版本验证→COMMIT→marker 删除→关闭；检查失败时 rollback/wipe/cleanup_pending 与独占锁 finally 释放。源码重点：[restore-sqlite-database.ts](../../../../packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts)、[schema SQL 限制](../../../../packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup-sql.ts)。本专题未发现新增确认缺陷。

四文件复验 **117 passed / 21 skipped**：[日志](../../evidence/2026-10-04/sqlite-backup-boundaries.txt)。运行面是 Chromium 的官方 SQLite-WASM oo1；“持久化”harness 用 memdb VFS 在同一 WASM 页面内保活，不是磁盘/OPFS 崩溃持久化证明。

21 skip 按实际 harness 能力：强杀 worker、跨进程、WAL 及不适用的 engine/unsupported 档位等，不能折算为通过。真实磁盘强杀、所有下游 adapter/加密/全恢复矩阵仍待补证，C6 仅部分核销；既有查询红测试未解除。

## 2026-10-04：树查询与 DevTools 第三批深审

树查询联审读取 generate_tree_sql 的 metadata property/FK alias、where 在递归项的位置与 level 条件。普通 scalar alias 已限定 children，PGlite 的歧义不重复记成 sqlite-core 错误；SQL 遍历与插件 JS 增量不一致统一 RV-046（已修复，见 README 2026-10-05 清理记录）。

真实 SQLite 后端结果/公开 query task 对照 **1 failed /1 passed**：[日志](../../evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt)。不能仅看共享 mock 断言或不传 where 的成功。本轮没有把递归保护常量删掉，也没有复验深度>1000/环形图全部行为，C3/C4 完整语义继续核查。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

C2 **部分执行**。原 upsertMany 的事务、触发器抑制、实体刷新和缓存事件真实运行，A/B 两条实际待推日志与裸缓存修复区分；旧修复提交覆盖 B 是 RV-055（已修复，见 README 2026-10-05 清理记录），旧 query 在 origin-down 下覆盖确认写是 RV-053（已修复，见 README 2026-10-05 清理记录）。串行 SQL 队列不等于跨网络窗口的实体意图保护。完整回滚/系统迁移/所有子后端矩阵没有核销。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：加密初始化取消联审

C2/C4 与加密 storage 生命周期联审：原 SqliteCoreKeyringStorage 的 ensure/read/INSERT OR FAIL、冲突分类，以及 base encryption facade 真实参与 Electron 复验。取消首次 provider 后仍提交 singleton 的根因统一 RV-058（已修复，见 README 2026-10-05 清理记录），不是 SQLite 违反事务/主键。native 文件档位 **2 failed /1 passed**，新 B 被 A verifier 拒绝。仍未完成各 browser backend/工作树/备份/崩溃矩阵；不恢复 writer lease，不重复登记四条后端缺陷。

[本轮源码/命令与未完成项](../../execution-2026-10-05-encrypted.md) · [最终状态观测](../../evidence/2026-10-05/encrypted/final-observations.json)。encrypted/Electron/PGlite 严格 lint/typecheck 通过，业务未改；sqlite-core 没有伪造本轮独立 lint/整包通过。coverage 关闭，不自动核销 C 专题。

## 2026-10-05：Supabase /真实 QueryCache 联审

**部分执行，未完成全对象深审。** 原 base adapter 的非 public QueryCache 目标解析失败，经实际 wa-sqlite 冷缓存复验；同表物理原语写入和读回成功。不外推其它宿主。

确认意见：[RV-061](../../RV-061-querycache-sqlite-nonpublic-namespace-target.md)。全批门禁、接缝和中间取证错误见 [本轮执行台账](../../execution-2026-10-05-supabase.md)；[源码指纹](../../evidence/2026-10-05/supabase/runtime-and-sources.json)、[最终计数](../../evidence/2026-10-05/supabase/final-counts.json) 与 [交付校验](../../evidence/2026-10-05/supabase/delivery-validation.json)。原始失败没有移除/skip；coverage 未执行，配置的 lib typecheck 不等于所有 spec 类型通过。

尚需核销原 C 项中的未覆盖边界，尤其认证/RLS、Realtime、跨宿主、覆盖率与打包消费；本轮没有新增完整 C 核销。助手未修改业务源码，不操作用户暂存区。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/8。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 2 failed | 1465 passed | 21 skipped (1488)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:443）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**LA-02/LA-03（轻量回归确认）**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                      | 当前结论/可证反证                                                                                                                                                                                | 原 C 核销 | 剩余必要验证                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:581–621,1484–1512,1716–1728`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–215,265–305`                                                                           | LA-02/03 两个独立关闭窗口已由主控轻量回归证实：工厂晚到仍缓存，oo1 模块晚到仍 ready。失败重试与普通关闭的已有实现不能反证这两个窗口。                                                            | 未核销    | 关闭并发/失败/reconnect/多个 client 完整边界；新回归的 late strict lint/typecheck；真实 Worker/OPFS 资源回收。             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1007–1065,1654–1712`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:38–67,115–127`                                                                     | 真实入口统一入队，executor facade 直发事务连接；COMMIT 后监听异常不误发 ROLLBACK，失败 rollback 会失效 client。这里只核实责任分层，不把 update_hook 的定时批处理等同提交屏障。                   | 未核销    | 触发器安装失败、并发事务、提交/回滚事件及主表/change/working-tree 同一事务的全部契约；当轮 21 skip 单独销项。              |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts:21–28,66–79`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts:17–54`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:409–456,646–724` | 插入值参数绑定，标识符用统一 quoting；加密在 SQL 前执行，结果拒绝非字符串信封、任一列解密失败作废整行。排序/关系 SQL 不由这些入口存在即可推断正确。                                              | 未核销    | RuleGroup/关系 JOIN 全支路、引号标识符/注入、NULL cursor、BigInt/binary/date、空批次与 PG 同 fixture 比较。                |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:787–894`                                                                                                                                                                                                                  | 独占迁移事务内读水位、按当前 active 分支重挂触发器、补唯一约束及水位；失败回滚不可用则丢弃连接。                                                                                                 | 未核销    | 多 active 行/旧库/重复迁移/迁移失败完整动态场景；远端分支物化和切分支源码全边界尚未读完。                                  |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/create-fts-table.ts:18–32`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts:49–50,69–86`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:243–250` | 建表固定 FTS5 external-content/rowid；更新守卫 NULL-safe，valueWrapper 只准裸函数名。引擎 capability 与中文查询端必须另证，不能把生成 DDL 当真实支持。                                           | 未核销    | 全部子后端 FTS 实际探针、CJK 短词、更新/删除/backfill、缺插件/缺 FTS 拒绝；trigger 尾部与查询端全量联审。                  |
| C6  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:93–105,114–173,190–194`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:1515–1560`                                                                             | 恢复前检查断开状态、独占存储锁、恢复 marker、同引擎 blank database 与必须能力；unsupported 明确报错。LA-02 的关闭窗口不能被“理论有锁”盖过去。                                                    | 未核销    | 归档全解析/限额与中途失败清理尚未完整重读；损坏/错目标/旧连接/重试/重连全部持久化门禁。历史 117 pass/21 skip 只属历史。    |
| C7  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/desktop/desktop-protocol-primitives.ts:31–47,65–85,122–126`                                                                                                                                                                                        | 已核对 UUID 与 SQL/blob/bindings 尺寸边界的公共零件；字符串形状校验不等于 host 签发会话存在或路径授权通过。                                                                                      | 未核销    | 915/941 行两协议、真实 TS host 与 Rust host 会话/路径/越界整数/大消息/未知 op 对照未全部阅读及执行，必须保留待证。         |
| C8  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/scripts/run-coverage-acceptance.mjs:15–27,52–69`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`                                                                               | 验收脚本列 core/wa-sqlite/sqlite/sqlite-wasm/sqliteai 五套、四浏览器 suite、四指标 80% 门槛；普通 test 不等于 acceptance 的 blob/合并验收。未重建 writer lease 或 rowsAffectedConformanceSuite。 | 未核销    | coverage-acceptance 未执行；合并/测量面完整重读与所有 conformance 调用点（含 Tauri）未穷举；不能用库存旧 coverage 过门槛。 |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。


## PKG-sqlite-core packages-only checkpoint（2026-10-05，非完成）

- 冻结原范围179文件 / 54,621行，包含全部测试/fixture/config/docs；`scope.json` 与 `resolved-project.json` 已存在并核对。旧盘点174文件为历史。
- 只审本包；新增 probe 仅在独占 evidence 内，没有改业务、原测试、index 或依赖，没有 Git 改写或派 agent。
- 当前实读进度见本包 `file-inspection.json`；明确旧 requested/truncated ranges 不作为已实读复用。哈希/目录盘点不是阅读。
- 新确认意见 SC-PKG-001（P1，加密 Id 后缀明文旁路）、SC-PKG-002（P2，事务终结事件内 executor 仍 active）见本包 `findings.md`；候选与未测分列，由主控最终去重 RV。RV066/067 已修不复报；非 public QueryCache 刷新/删除归已有 RV061。
- **source-review 仍 in-progress-original-scope；assessment-delivery 为 partial-checkpoint。** 不能据上述局部证据把179文件或原C1–C8记完成。场景/发布验证另列，不把后端全矩阵、真设备或发布门禁作为交付局部源码意见的先决条件。
