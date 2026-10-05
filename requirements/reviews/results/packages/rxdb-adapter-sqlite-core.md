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
