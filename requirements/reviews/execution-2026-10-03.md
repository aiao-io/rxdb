---
kind: review-execution
created: 2026-10-03
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
execution: in-progress
---

# 全范围代码评审：实际执行台账

## 当前结论

本轮已从“复核计划”转为**实际业务代码审查与动态复验**。共 70 个计划对象：此前首批 5 个对象部分执行；现已进入**全部 70 个对象的入口/门禁启动批，0 个全对象深度评审完成**。实际完成的只是本文件记录的阶段，不能把“全范围启动”写成“全范围深审完成”。不能将计划存在、依赖 build 成功或单个专题测试等同于全对象完成。

首批确认 5 个业务源码问题（1 P1＋4 P2）；启动批新增 Vue 搜索、队列 ID 复用、PGlite 数组语义、严格 lint 和 Supabase 环境隔离等 5 条意见。新增见 RV-032～RV-036，全部未修复；不要将质量门禁/环境问题冒充已验证业务数据破坏。

| 意见                                                | 等级 | 实际结论                                                     |
| --------------------------------------------------- | ---- | ------------------------------------------------------------ |
| [RV-027](RV-027-pglite-keyvalue-query-semantics.md) | P2   | PGlite keyValue contains 与核心/SQLite 查询语义不一致        |
| [RV-028](RV-028-core-keyvalue-missing-key-null.md)  | P2   | keyValue 缺失键被 JS 转成字符串，违反 SQLite NULL 语义       |
| [RV-029](RV-029-core-empty-notin-null.md)           | P2   | 空 notIn 集合在 NULL 行上的 JS 与两种 SQL 后端不一致         |
| [RV-030](RV-030-http-server-invalid-url-crash.md)   | P1   | 非法 HTTP 请求目标能让参考服务进程退出                       |
| [RV-031](RV-031-http-server-metadata-body-shape.md) | P2   | metadata 接口未验证 JSON 对象形状，null 返回 500、数组被接受 |

## 已执行验证

1. 当前源码的 SQL 构建器＋公开 JS 匹配器＋真实 Node SQLite JSON1 / PGlite 内存库：**6 个一致性断言均失败**（两后端各 3 个），提供可重复输入/SQL/参数/结果；不是合成 coverage 探针。
2. 串行、maxWorkers=1、关闭 Nx 本地/远端缓存；无 EPIPE/worker 崩溃，PGlite typecheck 记录 no errors。失败不能以并发抖动豁免。
3. 实际 Nx serve 启动 HTTP 应用，专用临时数据库/端口、production 禁用 control；有效 metadata 200、超限 body 413，null metadata 500、数组 metadata 200。
4. 原始 TCP 非法 request-target 导致真实 Node 服务退出，随后健康请求 ECONNREFUSED；日志/请求结果已保留。
5. [一次配套 PGlite test-node 日志](evidence/2026-10-03/pglite-migration-baseline.txt)记录现有系统迁移 10 passed，仅作为该配置/场景证据，不冒充整包或所有后端通过。

两后端 lint 已用 `--max-warnings=0` 实际执行并通过，见 [lint 日志](evidence/2026-10-03/review-spec-lint.txt)。这与一致性断言的红灯是两类结论，不能相互替代。

复验资料：[证据目录](evidence/2026-10-03)；[PGlite 红测试](../../packages/rxdb-adapter-pglite/src/__tests__/review-query-audit.spec.ts)、[SQLite 红测试](../../packages/rxdb-adapter-sqlite-core/src/__tests__/review-query-audit.spec.ts)。本次两份已暂存的复验 spec 保留，未重置/修改暂存区；业务实现未修复，因此这些用例预期仍红。

## 边界与排除

- Auth hook 换身份不进入 conditional fingerprint 是 HTTP adapter README 已明确的 disconnect/connect 契约，不作为未文档化漏洞重复登记。
- 单纯 SQL LIKE 的大小写/通配符问题已有字面量 SQL 构建与测试，不重复报告已修复项。
- 大 body 实际正确返回 413，不报告此前仅怀疑的 socket reset。
- 一次公开 Repository/keyValue 订阅尝试未观察到所预想的额外行，没有把错误测试前提或纯推断当成动态确认的订阅漂移。确认结论限定在报告中写明的 SQL/JS 语义差异；真实完整增量链路仍需补证。
- 上述限制是首批记录。后续全范围执行已取得部分覆盖率、微信 DevTools、桌面、Supabase 与三框架 E2E 证据，详见文末最新结果；仍不外推到未运行的平台/真实设备，也不将门禁代替 385 项人工深审。

## 按包、按应用的执行进度

| 对象与原计划                                                                                | 状态             | 实际评审记录                                                     | 确认问题                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/code-editor`](packages/code-editor.md)                                           | 已启动，部分执行 | [实际记录](results/packages/code-editor.md)                      | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/code-editor-angular`](packages/code-editor-angular.md)                           | 已启动，部分执行 | [实际记录](results/packages/code-editor-angular.md)              | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/code-editor-react`](packages/code-editor-react.md)                               | 已启动，部分执行 | [实际记录](results/packages/code-editor-react.md)                | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/code-editor-vue`](packages/code-editor-vue.md)                                   | 已启动，部分执行 | [实际记录](results/packages/code-editor-vue.md)                  | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb`](packages/rxdb.md)                                                         | 已启动，部分执行 | [实际记录](results/packages/rxdb.md)                             | [RV-027](RV-027-pglite-keyvalue-query-semantics.md)、[RV-028](RV-028-core-keyvalue-missing-key-null.md)、[RV-029](RV-029-core-empty-notin-null.md)、[RV-034](RV-034-pglite-array-membership-semantics.md) |
| [`packages/rxdb-adapter-desktop`](packages/rxdb-adapter-desktop.md)                         | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-desktop.md)             | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-electron`](packages/rxdb-adapter-electron.md)                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-electron.md)            | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-encrypted`](packages/rxdb-adapter-encrypted.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-encrypted.md)           | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-http`](packages/rxdb-adapter-http.md)                               | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-http.md)                | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-miniprogram`](packages/rxdb-adapter-miniprogram.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-miniprogram.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-pglite`](packages/rxdb-adapter-pglite.md)                           | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-pglite.md)              | [RV-027](RV-027-pglite-keyvalue-query-semantics.md)、[RV-029](RV-029-core-empty-notin-null.md)、[RV-034](RV-034-pglite-array-membership-semantics.md)                                                     |
| [`packages/rxdb-adapter-sqlite`](packages/rxdb-adapter-sqlite.md)                           | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-sqlite.md)              | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-sqlite-core`](packages/rxdb-adapter-sqlite-core.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-sqlite-core.md)         | [RV-028](RV-028-core-keyvalue-missing-key-null.md)、[RV-029](RV-029-core-empty-notin-null.md)                                                                                                             |
| [`packages/rxdb-adapter-sqlite-wasm`](packages/rxdb-adapter-sqlite-wasm.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-sqlite-wasm.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-sqliteai`](packages/rxdb-adapter-sqliteai.md)                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-sqliteai.md)            | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-supabase`](packages/rxdb-adapter-supabase.md)                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-supabase.md)            | [RV-036](RV-036-supabase-test-environment-cross-worktree.md)                                                                                                                                              |
| [`packages/rxdb-adapter-tauri`](packages/rxdb-adapter-tauri.md)                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-tauri.md)               | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-adapter-wa-sqlite`](packages/rxdb-adapter-wa-sqlite.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-adapter-wa-sqlite.md)           | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-angular`](packages/rxdb-angular.md)                                         | 已启动，部分执行 | [实际记录](results/packages/rxdb-angular.md)                     | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-client-generator`](packages/rxdb-client-generator.md)                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-client-generator.md)            | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-devtools`](packages/rxdb-devtools.md)                                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-devtools.md)                    | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-model`](packages/rxdb-model.md)                                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-model.md)                       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-model-angular`](packages/rxdb-model-angular.md)                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-model-angular.md)               | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-model-react`](packages/rxdb-model-react.md)                                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-model-react.md)                 | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-model-vue`](packages/rxdb-model-vue.md)                                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-model-vue.md)                   | [RV-035](RV-035-strict-lint-review-gate.md)                                                                                                                                                               |
| [`packages/rxdb-plugin-graph`](packages/rxdb-plugin-graph.md)                               | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-graph.md)                | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-history`](packages/rxdb-plugin-history.md)                           | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-history.md)              | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-querycache`](packages/rxdb-plugin-querycache.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-querycache.md)           | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-replay`](packages/rxdb-plugin-replay.md)                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-replay.md)               | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-replay-angular`](packages/rxdb-plugin-replay-angular.md)             | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-replay-angular.md)       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-replay-react`](packages/rxdb-plugin-replay-react.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-replay-react.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-replay-vue`](packages/rxdb-plugin-replay-vue.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-replay-vue.md)           | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-search`](packages/rxdb-plugin-search.md)                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-search.md)               | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-search-angular`](packages/rxdb-plugin-search-angular.md)             | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-search-angular.md)       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-search-react`](packages/rxdb-plugin-search-react.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-search-react.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-search-vue`](packages/rxdb-plugin-search-vue.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-search-vue.md)           | [RV-032](RV-032-vue-search-options-mutation.md)                                                                                                                                                           |
| [`packages/rxdb-plugin-storage`](packages/rxdb-plugin-storage.md)                           | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-storage.md)              | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-sync`](packages/rxdb-plugin-sync.md)                                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-sync.md)                 | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-tree`](packages/rxdb-plugin-tree.md)                                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-tree.md)                 | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-tree-angular`](packages/rxdb-plugin-tree-angular.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-tree-angular.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-tree-react`](packages/rxdb-plugin-tree-react.md)                     | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-tree-react.md)           | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-tree-vue`](packages/rxdb-plugin-tree-vue.md)                         | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-tree-vue.md)             | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-working-tree`](packages/rxdb-plugin-working-tree.md)                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-working-tree.md)         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-working-tree-angular`](packages/rxdb-plugin-working-tree-angular.md) | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-working-tree-angular.md) | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-working-tree-react`](packages/rxdb-plugin-working-tree-react.md)     | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-working-tree-react.md)   | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-working-tree-vue`](packages/rxdb-plugin-working-tree-vue.md)         | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-working-tree-vue.md)     | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-plugin-workspace`](packages/rxdb-plugin-workspace.md)                       | 已启动，部分执行 | [实际记录](results/packages/rxdb-plugin-workspace.md)            | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-react`](packages/rxdb-react.md)                                             | 已启动，部分执行 | [实际记录](results/packages/rxdb-react.md)                       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-test`](packages/rxdb-test.md)                                               | 已启动，部分执行 | [实际记录](results/packages/rxdb-test.md)                        | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/rxdb-vue`](packages/rxdb-vue.md)                                                 | 已启动，部分执行 | [实际记录](results/packages/rxdb-vue.md)                         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`packages/utils`](packages/utils.md)                                                       | 已启动，部分执行 | [实际记录](results/packages/utils.md)                            | [RV-033](RV-033-utils-queue-settlement-id-reuse.md)                                                                                                                                                       |
| [`apps/dev-rxdb-angular`](apps/dev-rxdb-angular.md)                                         | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-angular.md)                     | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-angular-e2e`](apps/dev-rxdb-angular-e2e.md)                                 | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-angular-e2e.md)                 | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-electron`](apps/dev-rxdb-electron.md)                                       | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-electron.md)                    | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-electron-e2e`](apps/dev-rxdb-electron-e2e.md)                               | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-electron-e2e.md)                | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-http`](apps/dev-rxdb-http.md)                                               | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-http.md)                        | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-http-e2e`](apps/dev-rxdb-http-e2e.md)                                       | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-http-e2e.md)                    | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-http-server`](apps/dev-rxdb-http-server.md)                                 | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-http-server.md)                 | [RV-030](RV-030-http-server-invalid-url-crash.md)、[RV-031](RV-031-http-server-metadata-body-shape.md)                                                                                                    |
| [`apps/dev-rxdb-miniprogram`](apps/dev-rxdb-miniprogram.md)                                 | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-miniprogram.md)                 | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-miniprogram-e2e`](apps/dev-rxdb-miniprogram-e2e.md)                         | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-miniprogram-e2e.md)             | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-react`](apps/dev-rxdb-react.md)                                             | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-react.md)                       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-react-e2e`](apps/dev-rxdb-react-e2e.md)                                     | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-react-e2e.md)                   | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-supabase`](apps/dev-rxdb-supabase.md)                                       | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-supabase.md)                    | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-supabase-e2e`](apps/dev-rxdb-supabase-e2e.md)                               | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-supabase-e2e.md)                | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-tauri`](apps/dev-rxdb-tauri.md)                                             | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-tauri.md)                       | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-tauri-e2e`](apps/dev-rxdb-tauri-e2e.md)                                     | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-tauri-e2e.md)                   | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-vue`](apps/dev-rxdb-vue.md)                                                 | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-vue.md)                         | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/dev-rxdb-vue-e2e`](apps/dev-rxdb-vue-e2e.md)                                         | 已启动，部分执行 | [实际记录](results/apps/dev-rxdb-vue-e2e.md)                     | [RV-035](RV-035-strict-lint-review-gate.md)                                                                                                                                                               |
| [`apps/rxdb-devtools-extension`](apps/rxdb-devtools-extension.md)                           | 已启动，部分执行 | [实际记录](results/apps/rxdb-devtools-extension.md)              | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |
| [`apps/rxdb-devtools-extension-e2e`](apps/rxdb-devtools-extension-e2e.md)                   | 已启动，部分执行 | [实际记录](results/apps/rxdb-devtools-extension-e2e.md)          | 基线阶段无新增确认项，不代表无缺陷                                                                                                                                                                        |

## 下一批执行范围

先完成核心 C3 与两个后端的共享查询契约/真实增量回归，再按 W0/W1/W2 继续生命周期、事务、捕获、迁移、备份与真实宿主；框架/App/E2E 通过实际场景补证。每批只更新真的执行过的对象，不批量打勾，不将“未发现新增问题”换写成“已通过”。

## 全范围启动批实测

- 69 个真实 Nx 项目全部执行 typecheck，69 通过；严格 lint 为 67 通过、2 失败（260＋2 warnings）。
- 普通测试：58 个项目串行完整执行，51 通过、7 失败；再加独立 Supabase 环境中的 adapter 测试通过，共 59 个有普通 test 的项目均已取得运行结果。普通测试阶段关闭覆盖率；后续独立 coverage 结果见最新核销，不把普通 test 通过当覆盖率达标。
- 7 个普通 test 失败项目：sqlite-core、PGlite、rxdb-angular、rxdb-model-angular、search-vue、dev-rxdb-angular、dev-rxdb-tauri。前两者包括已确认的红测试；其余要分辨产品缺陷、跨文件隔离与测试前提。
- Angular entity-change directive 单文件复跑 16 passed；整包运行该文件 16 failed（实际 getEntityStatus 对测试假对象抛错）。仅登记测试隔离/模块身份待定位，**没有宣称业务 directive 在真实实体上损坏**。
- 当前 Rust：Tauri adapter/app 的 cargo-check、cargo-clippy、cargo-test 六个任务通过；不代表 WebView、桌面权限和打包 smoke 已通过。
- 59 个 build、6 个 test-browser、4 个浏览器合并 coverage gate、7 个 e2e 与 Tauri smoke 已进入相应串行执行队列；状态以 [本轮快照](evidence/2026-10-03/full-run/execution-snapshot.json) 和对应 *-status.json/日志核销，不将运行中记成通过。
- 7 个已存在的三框架包族实际解析 export / export type / export *；直接透传的共享类型未发现缺端，组件/原生 Props 差异不直接当功能缺失。[实际导出清单](evidence/2026-10-03/full-run/api-surfaces.json) 只证明入口表面，运行语义仍需逐项核对。
- 小程序先只读检查 CLI/登录/服务端口，再实际执行当前仓库 demo 的 e2e-devtools：16 passed；没有修改 GUI 安全开关。DevTools 通过不外推到全部真机/其它小程序平台。
- Supabase 原有实例来自另一个 checkout；本轮独立 project/容器/端口验证后仅清理自己创建的资源，原容器未初始化/删除。
- 首批复验保持 Open，本轮新增红测试不排除。新意见：[RV-032](RV-032-vue-search-options-mutation.md)、[RV-033](RV-033-utils-queue-settlement-id-reuse.md)、[RV-034](RV-034-pglite-array-membership-semantics.md)、[RV-035](RV-035-strict-lint-review-gate.md)、[RV-036](RV-036-supabase-test-environment-cross-worktree.md)。

### 下一步核销

把长任务最终结果补入快照与每对象记录，再逐项人工审 C1～Cn；跨文件测试失败先最小串行复跑和真实实体对照。不得因启动了全部项目，就把 385 项专项检查批量标为完成。

## 已完成的启动批任务核销

| 阶段                     | 实际结果                                           | 限制                                                                         |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| lint                     | 67/69 通过，2 失败                                 | 零警告门禁；RV-035 未修                                                      |
| typecheck                | 69/69 通过                                         | 不代表逻辑正确                                                               |
| build                    | 59/59 通过                                         | 当前构建，不外推其它平台                                                     |
| 普通 test                | 52/59 通过，7 失败                                 | 包含独立 Supabase；已知红测试未剔除                                          |
| test-browser             | 6/6 通过                                           | 按实际浏览器配置，不代证全部宿主                                             |
| 四插件合并 coverage gate | replay/search/storage/tree 四指标均 ≥80%           | 合并后执行，不是 Node 单段假绿                                               |
| 核心 coverage gate       | rxdb/react/vue 四指标均 ≥90%                       | Angular test 仍失败，不能用残留 summary 验收                                 |
| coverage-acceptance      | rxdb-test 通过；sqlite-core 因红测试失败           | 不隐藏已确认缺陷                                                             |
| Rust                     | 两项目 cargo-check/clippy/test 六任务通过          | 不代替 WebView                                                               |
| Tauri conformance        | 通过                                               | 真实测试宿主，平台限定                                                       |
| 默认 e2e                 | 6/7 项目通过，React 项目 2 failed/138 passed       | 两条 OPFS 用例在上传后找不到文件，尚未到取消操作，不宣称“取消删除导致丢文件” |
| Tauri smoke              | desktop-smoke/devtools-smoke 均通过                | 当前 macOS 产物                                                              |
| 微信 DevTools e2e        | 16 passed                                          | 不是全部真机证明                                                             |
| 延迟 backend/凭证审计    | 两桌面 lazy-backend 和 Supabase secrets audit 通过 | 只证明当前规则扫描的产物                                                     |

证据汇总：[specialized-results.json](evidence/2026-10-03/full-run/specialized-results.json)；相关日志在同一目录。Supabase 原有容器 ID 未变，独立项目已删除：[归属核验](evidence/2026-10-03/full-run/supabase-preservation.json)。

**仍未完成：**各对象 C 项的全量人工深审、部分业务/测试失败根因、所有非核心包覆盖率、显式 Supabase e2e-remote 档位及所有 OS/设备矩阵。70 个对象均已进入执行，并非 70 个对象全部审完。

## 续执行：源码边界与失败归因（2026-10-03）

这批新增 **5 个确认问题（1 P1 / 4 P2）**，更新 11 个对象的实际记录，workspace C3 flush 专题核销。详见 [本批执行汇总](follow-up-2026-10-03.md)。

- [RV-037：React OPFS 导航中上传旧目录](RV-037-react-opfs-navigation-upload-race.md)——真实浏览器 1 red / 1 对照通过。
- [RV-038：备份任务同步抛错后挂起](RV-038-backup-queue-synchronous-throw-hang.md)——1 red / 2 对照通过。
- [RV-039：仓储销毁异常中断全库拆卸](RV-039-repository-dispose-aborts-database-teardown.md)——2 red / 1 对照通过。
- [RV-040：Angular 模型 fixture 共享 DB 泄漏](RV-040-angular-model-real-fixtures-leak-rxdb.md)——原合跑失败，临时副本显式 teardown 后 61 passed，原始测试未修。
- [RV-041：公开 commit 幂等重试被过期凭据挡住](RV-041-working-tree-public-commit-idempotency.md)——SQLite-WASM / PGlite 各 1 red / 53 原对照通过。

原生命周期/事务/trusted-write 52 passed；workspace 96 单元/20 真实浏览器 passed。rxdb-angular 265、Tauri 343 独立复跑通过；model-angular 全包和 dev-angular 仍失败，前者组合根因有 cleanup 对照，后者 TestBed 顺序/身份未完整归因。旧全范围任务结果是历史测量面，新增红测试不被这些旧绿色数字覆盖。

SQLite 第一次新 probe 运行没有重建 testing 产物，实际仍收集旧 53 条；已标注该证据不足，重建后收集 54 条得到红。无 Nx 缓存不等于输入产物一定新。

**证据交付补齐：**31 份被 `*.log` 忽略的日志导出为字节一致、可跟踪 `.txt`，引用已更新；[摘要清单](evidence/2026-10-03/follow-up/log-delivery-manifest.json) 保留 SHA-256，局部 `.gitattributes` 禁止换行规范化。未动暂存区。

**范围诚实：**70 对象已启动，仍为 0 个全对象人工深审完成。只核销本批明确取证的 workspace C3，其它 C 项仍逐项进行；当前业务实现未修、所有新 RV 保持 Open。

## 本批最终校验

续执行的最终校验：新增测试涉及的 4 个项目（rxdb / workspace / working-tree / React E2E）严格零警告 lint 与 typecheck 均通过；两个核心负向 spec 合跑仍 **3 failed / 3 passed**，没有剔除失败换绿。

[严格 lint](evidence/2026-10-03/follow-up/final-probes-lint.txt) · [类型校验](evidence/2026-10-03/follow-up/final-probes-typecheck.txt) · [核心红测试](evidence/2026-10-03/follow-up/final-core-red-probes.txt) · [本批状态汇总](evidence/2026-10-03/follow-up/round-results.json) · [输入版本/源码摘要](evidence/2026-10-03/follow-up/runtime-and-sources.json)。

## 后续批次索引

[2026-10-04 实际深审](execution-2026-10-04.md)：新增 RV-042/043/044（1 P1 / 2 P2），更新 7 个对象并核销 replay 的限定包级 C1；其它对象/专题继续，不改写本文件历史运行结果。
