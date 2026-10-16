---
package: rxdb-plugin-querycache
baseline: main@94df0a04
reviewed: 2026-10-16
status: StaticReview
---

# rxdb-plugin-querycache 代码评审

**结论：🟡 首轮 P2 已修复并经二次评审复核；二次评审新确认 1 条 P2（`findById` 绕过作废代次检查）。**

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

### P2（已修复，二次评审复核）：README 要求的 history/sync peer 未写入 package.json

- 修复：`package.json` 的 `peerDependencies` 增加 `@aiao/rxdb-plugin-history` 与 `@aiao/rxdb-plugin-sync`（`workspace:^`）；`eslint.config.mjs` 加 `ignoredDependencies` 两项、`tsconfig.lib.json` 加两个 project reference、`pnpm-lock.yaml` 同步两个 importer。二次评审在 Node 26.7 下运行本包全量单测（`vitest run --browser.enabled=false`）：**205/205 通过**；typecheck 通过。原条目证据与影响见首轮记录（`git show 17368950:requirements/reviews/packages/rxdb-plugin-querycache.md`）。

### P2（二次评审新确认）：`findById` 绕过作废代次检查，确认写入后可能被过期远端响应回退本地缓存

- 证据：`src/QueryCacheEngine.ts:373-382` 的 `findByIds(...).pipe(switchMap(remoteData => this.localAdapter.upsertMany(...)))` 未捕获/校验 `#invalidationGeneration`；对照 `#pull`（`806-819`）与 `#evictOrphans`（`785-792`）都先取 `generation` 再 `#isCurrent` 守卫；`create/update/remove` 经 `invalidateInflight()` 递增代次（`query-cache-primary.ts:208、229、248`）。类文档（`174-188`）明言该代次正是为防「在途读晚到、回退已确认写入」而生。
- 触发：`engine.findById(id)` 在途（远端请求已发出）；随后 `repo.update(id)` 完成（远端与本地缓存已到 V2、代次 +1）；V1 的 findById 响应晚到并 `upsertMany` 覆写 V2 → 已确认的写入被静默回退，直到该行下次全量同步（SWR `localCacheFirst` 会先吐 V1）。
- 说明：当前仓库内没有 `QueryCacheEngine.findById` 的生产调用方（仅自身文档注释引用），属公开导出 API 的潜伏缺陷。
- 建议：`findById` 顶部捕获 `const generation = this.#invalidationGeneration`，`upsertMany` 前 `#isCurrent(generation)` 守卫（镜像 `#pull`），或把 `findById` 路由进 `#pull`。

## 风险与未覆盖

- 尝试执行 Nx 任务时，当前主机 Node 为 `v22.14.0`（仓库要求 `>=26`），且 Nx 返回 `Operation not permitted (os error 1)`；因此本次不能把 lint/typecheck/test/build 的运行结果写成通过。
- 浏览器、真实 SQLite/PGlite/桌面宿主、发布产物消费和跨标签页/跨进程场景未在本轮动态复验；源码与现有测试文件的存在不等于这些场景已覆盖。
- 三框架适配包已按入口/类型/生命周期做静态对照；React/Angular/Vue 的真实渲染与卸载竞态仍需在 Node 26、Chromium 和对应框架测试环境补证。

## 建议验证

在 Node 26+、pnpm 10 环境串行执行：

`pnpm nx run rxdb-plugin-querycache:lint --skipRemoteCache`（若项目提供该 target）、`pnpm nx run rxdb-plugin-querycache:typecheck --skipRemoteCache`、`pnpm nx run rxdb-plugin-querycache:test --skipRemoteCache`、`pnpm nx run rxdb-plugin-querycache:build --skipRemoteCache`；带浏览器/覆盖率的项目再执行其 `test-browser` 或 `coverage` target。优先补齐该包风险最高的真实后端/宿主场景后再把 🟡 结论升级为动态通过。
