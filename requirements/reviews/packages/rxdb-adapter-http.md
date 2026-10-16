# Review：rxdb-adapter-http

## 结论

🟢 未发现可定位的 P0/P1/P2/P3 问题。

## 检查范围

检查了 `package.json`、`project.json` 的 node Vitest/typecheck target、README/公开 API；走读 `src/transport.ts`、`config.ts`、`rest.ts`、`pagination.ts`、`chunking.ts`、`conditional-cache.ts`、`change-feed.ts`、`metadata.ts`、`handler-contract.ts`、`errors.ts` 与 `src/__tests__/**`/`tests/**`（请求序列化、URL/header 校验、超时/断开、ETag、分页分块、SSE 变更通道、REST 模板和 wire integration）。

## 发现

无。请求构造错误与网络错误分类分开，非 2xx 保留数字 status，条件缓存只作用于幂等读，REST `:id` 做 URI 编码，分页和 SSE 都有边界测试。

## 风险/未覆盖

真实代理、CORS、EventSource 实现由接入方提供；本轮未连接外部生产网关或浏览器跨源环境。

## 建议验证

执行 `pnpm nx run rxdb-adapter-http:typecheck`、`pnpm nx run rxdb-adapter-http:test`，并在浏览器跨源部署中验证 `Access-Control-Expose-Headers: ETag`、SSE 重连和代理 4xx/5xx 响应体读取。
