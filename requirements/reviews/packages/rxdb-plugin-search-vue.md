---
package: rxdb-plugin-search-vue
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-plugin-search-vue 增量代码评审

## 结论

🟡 待处理：1 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`c425f414 chore(deps): safely upgrade workspace dependencies`；`967aa658 12313`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：桥接流的 error 未挂处理器，流损坏时走 RxJS `reportUnhandledError` 直接崩应用（三端不对称）

- 证据：`src/use-search.ts:164-167` 对 `results$` / `state$` / `error$` / `hasMore$` 四个订阅都只传 next 回调；Angular 端 `packages/rxdb-plugin-search-angular/src/inject-search.ts:183-191` 的 `reportStreamFailure`（SRA-004）明确注释：任一兼容 `SearchSourceLike` 实现都可能让任一流进入 error，无 error 处理器时 RxJS 走 `reportUnhandledError`，Angular 的 `ErrorHandler` 与 error signal 都收不到，进程/应用可能直接崩溃。React 端同形（`packages/rxdb-plugin-search-react/src/use-search.ts:124-127`）。
- 触发：任何结构兼容的 source 其 handle 的任一流 error → Vue/React 端未捕获异步异常（window `error` / 崩溃），UI 冻结在最后状态，`error` 状态不更新；Angular 端则路由 ErrorHandler 并完成清理。
- 建议：两端镜像 Angular 的 `reportStreamFailure`（退订全部 + 路由到框架合适的处理），至少给四个订阅挂 error 回调统一退订与上报策略。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
