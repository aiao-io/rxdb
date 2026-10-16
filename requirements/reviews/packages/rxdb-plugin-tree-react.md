---
package: rxdb-plugin-tree-react
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-tree-react 代码评审

**结论：🟡 静态检查未确认 P0/P1/P2/P3 缺陷；动态门禁待在受支持环境复跑。**

React 树查询状态适配层。 当前基线为 `main@94df0a04`（2026-10-16）。本报告只记录本次检查结果，不替代修复单。

## 检查范围

- `packages/rxdb-plugin-tree-react/src`：6 个受控源/测试文件，源码入口、生命周期、错误路径、公开类型和资源释放。
- `packages/rxdb-plugin-tree-react/README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`（Angular 包另含 `ng-package.json`）。
- 测试入口（按当前文件名盘点，共 4 个）：
- [`packages/rxdb-plugin-tree-react/src/__tests__/index.spec.ts`]
- [`packages/rxdb-plugin-tree-react/src/__tests__/review-round2-lifecycle.spec.ts`]
- [`packages/rxdb-plugin-tree-react/src/__tests__/tri-framework-generics.spec.ts`]
- [`packages/rxdb-plugin-tree-react/src/__tests__/use-tree.spec.ts`]

关键源码锚点：

- [`src/use-tree.ts:1-220`](../../../packages/rxdb-plugin-tree-react/src/use-tree.ts#L1)
- [`src/index.ts:1-15`](../../../packages/rxdb-plugin-tree-react/src/index.ts#L1)

## 发现

### 无已确认问题

逐项检查导出面、依赖声明、配置入口与 README 示例；未发现能够在当前源码中直接定位并复现、达到 P0–P3 登记门槛的问题。历史评审中已修复的条目未重复登记。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-tree-react:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-tree-react:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-tree-react:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-tree-react:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
