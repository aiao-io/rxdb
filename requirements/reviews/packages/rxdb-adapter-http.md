# Review：rxdb-adapter-http

## 结论

🟡 二次评审发现 1 条 P2：create/update 回执绕过 `updatedAt` 时区门禁，无时区串可进入本地缓存并持续污染新鲜度比较。

## 检查范围

检查了 `package.json`、`project.json` 的 node Vitest/typecheck target、README/公开 API；走读 `src/transport.ts`、`config.ts`、`rest.ts`、`pagination.ts`、`chunking.ts`、`conditional-cache.ts`、`change-feed.ts`、`metadata.ts`、`handler-contract.ts`、`errors.ts` 与 `src/__tests__/**`/`tests/**`（请求序列化、URL/header 校验、超时/断开、ETag、分页分块、SSE 变更通道、REST 模板和 wire integration）。

## 发现

### P2：写回执的 `updatedAt` 绕过 `ISO_8601_WITH_ZONE` 门禁，无时区串进入本地缓存后新鲜度比较依赖机器时区

- 证据：`src/RxDBAdapterHttp.ts:651-668` 的 create/update duck 只经 `assertHandlerRow`（`handler-contract.ts:42-51`，仅查「是普通对象」）即把原始 wire 行返回给 core；而读取路径 `src/metadata.ts:29-49` 对 `updatedAt` 强制带时区 ISO 8601（模块注释明言「缺时区标识的串按本机时区解析」）。写回执是唯一另一处服务端字符串越过 wire 边界进入本地缓存的位置，却没有同样的门禁。
- 触发：REST 后端（如 MySQL naive DATETIME 形态）返回 `updatedAt: '2026-08-23T10:00:00'`；`QueryCacheEngine.create/update` 把回执经 `localAdapter.upsertMany` 原样落缓存（`rxdb-plugin-querycache/src/QueryCacheEngine.ts:411-415、444-449`，sqlite 行契约只要求列存在、不归一化）。下一次同步把远端值归一成 `'…T10:00:00.000Z'`，`isRemoteNewer` 用 `Date.parse` 比较本地那个无时区串——UTC+8 机器上同一时刻被持续判为远端更新，行每轮同步都重拉（永不收敛）；UTC 负偏移机器上方向相反。机器相关、静默的错误新鲜度。
- 建议：create/update duck（或 `assertHandlerRow`）对回执 `updatedAt` 施加与 `metadata.ts` 相同的 `ISO_8601_WITH_ZONE` 校验/归一，至少拒绝无时区串，与读路径契约一致。

## 风险/未覆盖

真实代理、CORS、EventSource 实现由接入方提供；本轮未连接外部生产网关或浏览器跨源环境。

## 建议验证

执行 `pnpm nx run rxdb-adapter-http:typecheck`、`pnpm nx run rxdb-adapter-http:test`，并在浏览器跨源部署中验证 `Access-Control-Expose-Headers: ETag`、SSE 重连和代理 4xx/5xx 响应体读取。
