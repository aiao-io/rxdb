---
package: rxdb-plugin-querycache
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-querycache 代码评审

**结论：🟡 发现 1 条 P2 包元数据问题；动态门禁待在受支持环境复跑。**

本地/远程查询缓存、SWR 与离线回落、写回路径。 当前基线为 `main@94df0a04`（2026-10-16）。本报告只记录本次检查结果，不替代修复单。

## 检查范围

- `packages/rxdb-plugin-querycache/src`：25 个受控源/测试文件，源码入口、生命周期、错误路径、公开类型和资源释放。
- `packages/rxdb-plugin-querycache/README.md`、`package.json`、`project.json`、`tsconfig*.json`、`vite.config.mts`（Angular 包另含 `ng-package.json`）。
- 测试入口（按当前文件名盘点，共 19 个）：
- [`packages/rxdb-plugin-querycache/src/__tests__/QueryCacheEngine.cache-quality.spec.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/QueryCacheEngine.spec.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/Repository.querycache.spec.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/Repository.remote-invalidation.spec.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/entity-manager.querycache.spec.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/fixtures/pending-writes.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/fixtures/private-symbols.ts`]
- [`packages/rxdb-plugin-querycache/src/__tests__/fixtures/reachability.ts`]

关键源码锚点：
- [`src/plugin.ts:1-50`](../../../packages/rxdb-plugin-querycache/src/plugin.ts#L1)
- [`src/QueryCacheEngine.ts:1-849`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts#L1)
- [`src/query-cache-engine.factory.ts:1-180`](../../../packages/rxdb-plugin-querycache/src/query-cache-engine.factory.ts#L1)
- [`src/index.ts:1-41`](../../../packages/rxdb-plugin-querycache/src/index.ts#L1)

## 发现

### P2：README 要求的 history/sync peer 未写入 package.json

- **证据**：README 安装与运行约束明确要求同时安装 `@aiao/rxdb-plugin-history`、`@aiao/rxdb-plugin-sync`，且缺任一插件 `connect()` 就抛错（`packages/rxdb-plugin-querycache/README.md:12-16,42-47`）；插件运行期确实依赖 core 的 QueryCache 出站队列与 history 注入顺序（`packages/rxdb-plugin-querycache/src/plugin.ts:18-29`、`packages/rxdb-plugin-sync/src/plugin.ts:21-56`）。但 `package.json:53-59` 只声明 `@aiao/rxdb` peer，没有 history/sync peer 或 peerDependenciesMeta。
- **影响**：npm/pnpm 消费者安装 QueryCache 包时不会得到缺失插件的 peer 警告；在 `connect()` 才收到 `RxDBMissingPluginError`，部署/锁文件审计无法表达这条硬依赖，容易把可提前发现的配置错误推迟到运行期。
- **建议**：在 `peerDependencies` 增加 `@aiao/rxdb-plugin-history` 与 `@aiao/rxdb-plugin-sync`，使用与仓库一致的 `workspace:^` 发布替换规则；补一个发布 manifest 检查，确认两项在独立消费包的 peer 元数据中存在且版本范围与当前 release 对齐。不要通过 `inject` 绑定 QueryCache 插件自身，以免破坏 `connect()` 前的引擎护栏。
- **验证**：构建 dist 后执行 `pnpm pack`，在临时消费者执行 `pnpm install ./aiao-rxdb-plugin-querycache-*.tgz`，检查 peer warning/manifest；随后分别只装缺 history 或 sync 的矩阵用例，确认安装阶段可见提示且连接阶段仍保留精确运行时错误。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-querycache:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-querycache:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-querycache:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-querycache:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
