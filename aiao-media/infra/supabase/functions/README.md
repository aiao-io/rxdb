# Supabase Edge Functions

`admin-api` 是 Admin 的特权边界。浏览器只携带 Supabase Auth 的普通 JWT，Edge Function 在函数内部使用 `SUPABASE_SERVICE_ROLE_KEY` 访问 Auth Admin API、封禁用户和需要绕过 RLS 的操作。

普通业务表、受保护 view 和普通 RPC 由 Admin 或后台 RxDB 节点直接访问 Supabase，不能把 service role key 放进浏览器或同步节点。

## 本地启动

```bash
cp .env.example .env
supabase functions serve admin-api --env-file .env
```

`.env` 只在本机使用，不提交。生产环境通过 Supabase Dashboard 或 CLI 配置同名 secrets：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

部署前运行：

```bash
supabase functions deploy admin-api --no-verify-jwt
```

函数自身会验证 `Authorization: Bearer <Supabase access token>`，因此部署入口关闭 Supabase CLI 的通用 JWT 检查不会放宽权限边界。所有特权调用仍必须通过管理员 membership 和账号状态校验。
