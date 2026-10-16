---
package: rxdb-plugin-search-react
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-search-react 代码评审

**结论：🟡 二次评审确认 1 条 P2（与 Vue 端同源）；动态门禁待真实宿主复跑。**

React `useSearch` 适配层。 当前基线为 `main@94df0a04`（2026-10-16）。本报告只记录本次检查结果，不替代修复单。

## 检查范围

- `packages/rxdb-plugin-search-react/src`：7 个受控源/测试文件，源码入口、生命周期、错误路径、公开类型和资源释放。
- `packages/rxdb-plugin-search-react/README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`（Angular 包另含 `ng-package.json`）。
- 测试入口（按当前文件名盘点，共 5 个）：
- [`packages/rxdb-plugin-search-react/src/__tests__/index.spec.ts`]
- [`packages/rxdb-plugin-search-react/src/__tests__/readme-consumer.spec.tsx`]
- [`packages/rxdb-plugin-search-react/src/__tests__/review-parallel-real-handle.spec.ts`]
- [`packages/rxdb-plugin-search-react/src/__tests__/review-round2-lifecycle.spec.ts`]
- [`packages/rxdb-plugin-search-react/src/__tests__/use-search.spec.ts`]

关键源码锚点：
- [`src/use-search.ts:1-190`](../../../packages/rxdb-plugin-search-react/src/use-search.ts#L1)
- [`src/index.ts:1-17`](../../../packages/rxdb-plugin-search-react/src/index.ts#L1)

## 发现

### P2：桥接流的 error 未挂处理器，流损坏时走 RxJS `reportUnhandledError` 直接崩应用（三端不对称）

- 证据：`src/use-search.ts:124-127` 对 `results$` / `state$` / `error$` / `hasMore$` 四个订阅都只传 next 回调；Angular 端 `packages/rxdb-plugin-search-angular/src/inject-search.ts:183-191` 的 `reportStreamFailure`（SRA-004）明确注释：任一兼容 `SearchSourceLike` 实现都可能让任一流进入 error，无 error 处理器时 RxJS 走 `reportUnhandledError`，Angular 的 `ErrorHandler` 与 error signal 都收不到，进程/应用可能直接崩溃。Vue 端同形（`packages/rxdb-plugin-search-vue/src/use-search.ts:164-167`）。
- 触发：任何结构兼容的 source 其 handle 的任一流 error → React/Vue 端未捕获异步异常（window `error` / 崩溃），UI 冻结在最后状态，`error` 状态不更新；Angular 端则路由 ErrorHandler 并完成清理。
- 建议：两端镜像 Angular 的 `reportStreamFailure`（退订全部 + 路由到框架合适的处理），至少给四个订阅挂 error 回调统一退订与上报策略。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-search-react:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-search-react:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-search-react:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-search-react:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
