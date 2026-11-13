# Aiao Media API

- 本目录是 Aiao Media 的 Cloudflare Worker 应用；Worker 代码只能依赖 `@aiao-media/api-contracts` 和 `@aiao-media/domain` 等共享包，不能依赖 web/admin 的 `src/*`。
- 浏览器产物永远不能包含 service role key、供应商 API Key、账号会话或 `.env` 内容。
- Durable Object、R2、Supabase 管理接口和代理路由在这里维护；部署配置为本目录的 `wrangler.json`。
- 运行任务使用 `pnpm nx run aiao-media-api:<target>`。
