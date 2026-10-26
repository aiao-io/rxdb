---
package: rxdb-adapter-http
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-http 增量代码评审

## 结论

🟡 待处理：1 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：写回执的 `updatedAt` 绕过 `ISO_8601_WITH_ZONE` 门禁，无时区串进入本地缓存后新鲜度比较依赖机器时区

- 证据：`src/RxDBAdapterHttp.ts:651-668` 的 create/update duck 只经 `assertHandlerRow`（`handler-contract.ts:42-51`，仅查「是普通对象」）即把原始 wire 行返回给 core；而读取路径 `src/metadata.ts:29-49` 对 `updatedAt` 强制带时区 ISO 8601（模块注释明言「缺时区标识的串按本机时区解析」）。写回执是唯一另一处服务端字符串越过 wire 边界进入本地缓存的位置，却没有同样的门禁。
- 触发：REST 后端（如 MySQL naive DATETIME 形态）返回 `updatedAt: '2026-08-23T10:00:00'`；`QueryCacheEngine.create/update` 把回执经 `localAdapter.upsertMany` 原样落缓存（`rxdb-plugin-querycache/src/QueryCacheEngine.ts:411-415、444-449`，sqlite 行契约只要求列存在、不归一化）。下一次同步把远端值归一成 `'…T10:00:00.000Z'`，`isRemoteNewer` 用 `Date.parse` 比较本地那个无时区串——UTC+8 机器上同一时刻被持续判为远端更新，行每轮同步都重拉（永不收敛）；UTC 负偏移机器上方向相反。机器相关、静默的错误新鲜度。
- 建议：create/update duck（或 `assertHandlerRow`）对回执 `updatedAt` 施加与 `metadata.ts` 相同的 `ISO_8601_WITH_ZONE` 校验/归一，至少拒绝无时区串，与读路径契约一致。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
