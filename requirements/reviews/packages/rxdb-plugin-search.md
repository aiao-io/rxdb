---
package: rxdb-plugin-search
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-search 代码评审

**结论：🟡 二次评审确认 1 条 P3；动态门禁待真实宿主复跑。**

全文/模糊搜索、分页、后端接入与响应式状态机。 当前基线为 `main@94df0a04`（2026-10-16）。本报告只记录本次检查结果，不替代修复单。

## 检查范围

- `packages/rxdb-plugin-search/src`：74 个受控源/测试文件，源码入口、生命周期、错误路径、公开类型和资源释放。
- `packages/rxdb-plugin-search/README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`（Angular 包另含 `ng-package.json`）。
- 测试入口（按当前文件名盘点，共 46 个）：
- [`packages/rxdb-plugin-search/src/__tests__/aggregator.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/backend-registry.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/pg-backend-integration.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/pg-fts-contract.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/pg-query-compiler.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/pg-search-sql.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/backend/pg-statements.spec.ts`]
- [`packages/rxdb-plugin-search/src/__tests__/core/options-equality.spec.ts`]

关键源码锚点：
- [`src/plugin.ts:1-776`](../../../packages/rxdb-plugin-search/src/plugin.ts#L1)
- [`src/core/search-handle.ts:1-420`](../../../packages/rxdb-plugin-search/src/core/search-handle.ts#L1)
- [`src/index.ts:1-70`](../../../packages/rxdb-plugin-search/src/index.ts#L1)

## 发现

### P3：success 订阅内重入 `loadMore()` 会顶掉已排队的 page-0 数据变更刷新

- 证据：`src/core/search-handle.ts:164-171` `enqueueQuery` 无条件替换 `pendingQuery`；`253-257` `loadMore` 在状态为 success 时入队 `currentPage+1`；`197-199` 数据变更刷新入队 page 0。`173-176` 的注释自己记录了「success 订阅内 loadMore 紧随 clear/destroy」这类同步重入场景。
- 触发：慢查询执行中（状态 loading）数据变更触发，其 page-0 刷新进 `pendingQuery`；随后在途查询完成、`results$` 同步发出，订阅者立刻调 `loadMore()`——此刻状态快照已是 success → 入队的 page-1 请求**替换**了待执行的 page-0 刷新（原请求的 waiter 被并入新请求，只 resolve 不执行）。泵只跑 page-1，把新一页追加到已过期的结果上；刷新被静默丢弃，陈旧结果要等下一次数据变更或 setQuery 才自愈。
- 建议：`enqueueQuery` 收到 page>0 请求且待执行的是 page-0 刷新时，保留 page-0（如在 loadMore 结算后重入队刷新，或先跑 pending page-0）。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-search:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-search:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-search:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-search:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
