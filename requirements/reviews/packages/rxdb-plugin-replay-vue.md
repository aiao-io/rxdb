---
package: rxdb-plugin-replay-vue
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-replay-vue 代码评审

**结论：🟢 首轮 P2 已修复并经二次评审复核；当前无剩余问题。**

Vue `Replayer` 适配层。 当前基线为 `main@94df0a04`（2026-10-16）。本报告只记录本次检查结果，不替代修复单。

## 检查范围

- `packages/rxdb-plugin-replay-vue/src`：4 个受控源/测试文件，源码入口、生命周期、错误路径、公开类型和资源释放。
- `packages/rxdb-plugin-replay-vue/README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`（Angular 包另含 `ng-package.json`）。
- 测试入口（按当前文件名盘点，共 1 个）：
- [`packages/rxdb-plugin-replay-vue/src/__tests__/replayer.spec.ts`]

关键源码锚点：
- [`src/replayer.ts:1-240`](../../../packages/rxdb-plugin-replay-vue/src/replayer.ts#L1)
- [`src/index.ts:1-12`](../../../packages/rxdb-plugin-replay-vue/src/index.ts#L1)

## 发现

### P2（已修复，二次评审复核）：Vue `Replayer` 在挂载前调用 `seek()` 会丢失目标时刻

- 修复：`src/replayer.ts:54` 增加 `pendingSeek`；`seek` 先记录目标再转发（`91-94`），`onMounted` 创建句柄后兑现（`71`）。语义与 Angular（`replay-angular/src/replayer.component.ts:59、83、117-120`）和 React（`replay-react/src/replayer.tsx:62、79、106-109`）一致：挂载前只记「最后一次意图」、挂载兑现、之后直通、都不清空（React 注释说明 StrictMode 双挂载需要保留）。二次评审在 Node 26.7 下运行本包测试：**11/11 通过**（含新增的挂载前模板 ref seek 用例）。原条目证据与影响见首轮记录（`git show 17368950:requirements/reviews/packages/rxdb-plugin-replay-vue.md`）。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-replay-vue:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-replay-vue:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-replay-vue:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-replay-vue:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
