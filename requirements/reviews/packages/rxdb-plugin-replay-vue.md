---
package: rxdb-plugin-replay-vue
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-replay-vue 代码评审

**结论：🟡 发现 1 条 P2 组件命令契约问题；动态门禁待在受支持环境复跑。**

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

### P2：Vue `Replayer` 在挂载前调用 `seek()` 会丢失目标时刻

- **证据**：公开文档承诺 `seek(ms)` 在加载完成前会记下目标时刻（`packages/rxdb-plugin-replay-vue/README.md:54-63`），组件注释也重复该契约（`src/replayer.ts:9-10`）。但 `setup()` 暴露的实现只在已有句柄时转发 `handle?.seek(timeMs)`，未保存 pending seek（`src/replayer.ts:50-91`）；`onMounted()` 创建句柄后也没有补发逻辑（`src/replayer.ts:61-70`）。
- **影响**：父组件在同一挂载批次的 `onBeforeMount`/模板 ref 取到组件后调用 `seek(5000)` 时，Vue 端静默丢失目标，回放从默认位置开始；Angular/React 适配层已保存 pending 目标，三端行为不对称。
- **建议**：增加 `pendingSeek`，挂载成功后将最后一次目标交给 `handle.seek()`；卸载/重新挂载时保留语义与 React/Angular 对齐，并补真实 Vue mount + template ref 的挂载前调用测试，覆盖多次 seek、session/replay 更新和卸载竞态。
- **验证**：在现有 `replayer.spec.ts` 增加 deferred mount spy：挂载前调用 `seek(5000)`，断言首个句柄收到 5000；再调用 `seek(7000)` 断言只兑现最后目标，并在组件销毁/重新挂载后确认不会把旧会话目标误发给新会话。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-replay-vue:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-replay-vue:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-replay-vue:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-replay-vue:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
