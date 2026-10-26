---
package: rxdb-plugin-querycache
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-plugin-querycache 增量代码评审

## 结论

🟡 待处理：1 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 1 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`9361d916 q`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：`findById` 绕过作废代次检查，确认写入后可能被过期远端响应回退本地缓存

- 证据：`src/QueryCacheEngine.ts:373-382` 的 `findByIds(...).pipe(switchMap(remoteData => this.localAdapter.upsertMany(...)))` 未捕获/校验 `#invalidationGeneration`；对照 `#pull`（`806-819`）与 `#evictOrphans`（`785-792`）都先取 `generation` 再 `#isCurrent` 守卫；`create/update/remove` 经 `invalidateInflight()` 递增代次（`query-cache-primary.ts:208、229、248`）。类文档（`174-188`）明言该代次正是为防「在途读晚到、回退已确认写入」而生。
- 触发：`engine.findById(id)` 在途（远端请求已发出）；随后 `repo.update(id)` 完成（远端与本地缓存已到 V2、代次 +1）；V1 的 findById 响应晚到并 `upsertMany` 覆写 V2 → 已确认的写入被静默回退，直到该行下次全量同步（SWR `localCacheFirst` 会先吐 V1）。
- 说明：当前仓库内没有 `QueryCacheEngine.findById` 的生产调用方（仅自身文档注释引用），属公开导出 API 的潜伏缺陷。
- 建议：`findById` 顶部捕获 `const generation = this.#invalidationGeneration`，`upsertMany` 前 `#isCurrent(generation)` 守卫（镜像 `#pull`），或把 `findById` 路由进 `#pull`。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
