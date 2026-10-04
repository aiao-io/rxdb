---
kind: review-execution
object: rxdb-plugin-search
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-search：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

FTS5/PG 搜索 backend、scope、索引安装与响应式 SearchHandle 状态机。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-search/src/core/search-engine.ts`](../../../../packages/rxdb-plugin-search/src/core/search-engine.ts)
- [`packages/rxdb-plugin-search/src/core/search-handle.ts`](../../../../packages/rxdb-plugin-search/src/core/search-handle.ts)
- [`packages/rxdb-plugin-search/src/core/scope-resolver.ts`](../../../../packages/rxdb-plugin-search/src/core/scope-resolver.ts)
- [`packages/rxdb-plugin-search/src/core/query-compiler.ts`](../../../../packages/rxdb-plugin-search/src/core/query-compiler.ts)
- [`packages/rxdb-plugin-search/src/backend/backend-registry.ts`](../../../../packages/rxdb-plugin-search/src/backend/backend-registry.ts)
- [`packages/rxdb-plugin-search/src/core/fts5-installer.ts`](../../../../packages/rxdb-plugin-search/src/core/fts5-installer.ts)
- [`packages/rxdb-plugin-search/package.json`](../../../../packages/rxdb-plugin-search/package.json)
- [`packages/rxdb-plugin-search/project.json`](../../../../packages/rxdb-plugin-search/project.json)
- [`packages/rxdb-plugin-search/src/index.ts`](../../../../packages/rxdb-plugin-search/src/index.ts)

| target         | 当前证据                      | 日志                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `lint`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)         |
| `typecheck`    | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt)    |
| `test`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)         |
| `build`        | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)        |
| `test-browser` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test-browser.txt) |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 能力与索引安装：核查 backend registry、adapter guard、schema validator、FTS 安装与 plugin inject。
- [ ] C2 查询编译与安全：审查 FTS5/PG 语法、参数绑定、复杂输入与 snippet；搜索词不能改变 SQL 结构。
- [ ] C3 scope 与 branch 隔离：追踪 collection/entity/branch 与选项 identity，跨数据库 handle 不得共用结果。
- [ ] C4 响应式竞态与分页：检查 debounce、异步请求取消、state/error/hasMore、loadMore/clear 和过期响应。
- [ ] C5 跨 backend 排名契约：对照 FTS5 与 PG 的结果映射、aggregator、tie-break 和已有语义差异。
- [ ] C6 三端与可访问性：对照三端 search wrappers 与应用 shared parity/a11y 测试。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

四指标合并后已通过 80% 门禁，见 [合并门禁](../../evidence/2026-10-03/full-run/merged-coverage-gate.txt)；不代表全部 C 项完成。
