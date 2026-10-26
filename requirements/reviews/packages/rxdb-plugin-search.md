---
package: rxdb-plugin-search
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-plugin-search 增量代码评审

## 结论

🟡 待处理：1 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 8 文件、测试/测试工具 10 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`9361d916 q`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：FTS 计划绑定到物理表/schema、表集 created/fingerprint 钩子、换挂后的句柄刷新/事件过滤与缓存、SQLite/PGlite 索引安装；旧 loadMore 重入路径未改。
- 实现锚点：`src/backend/fts5-backend.ts`、`src/backend/pg/pg-backend.ts`、`src/backend/pg/pg-fts-contract.ts`、`src/backend/pg/pg-runtime.ts`、`src/backend/search-backend.ts`、`src/core/fts5-installer.ts`、`src/core/fts5-runtime.ts` 等 8 个实现文件。

## 发现

### P3：success 订阅内重入 `loadMore()` 会顶掉已排队的 page-0 数据变更刷新

- 证据：`src/core/search-handle.ts:164-171` `enqueueQuery` 无条件替换 `pendingQuery`；`253-257` `loadMore` 在状态为 success 时入队 `currentPage+1`；`197-199` 数据变更刷新入队 page 0。`173-176` 的注释自己记录了「success 订阅内 loadMore 紧随 clear/destroy」这类同步重入场景。
- 触发：慢查询执行中（状态 loading）数据变更触发，其 page-0 刷新进 `pendingQuery`；随后在途查询完成、`results$` 同步发出，订阅者立刻调 `loadMore()`——此刻状态快照已是 success → 入队的 page-1 请求**替换**了待执行的 page-0 刷新（原请求的 waiter 被并入新请求，只 resolve 不执行）。泵只跑 page-1，把新一页追加到已过期的结果上；刷新被静默丢弃，陈旧结果要等下一次数据变更或 setQuery 才自愈。
- 建议：`enqueueQuery` 收到 page>0 请求且待执行的是 page-0 刷新时，保留 page-0（如在 loadMore 结算后重入队刷新，或先跑 pending page-0）。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
