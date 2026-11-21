# Contract: admin Edge Function

## Endpoint

`POST /functions/v1/admin-api`

## Authentication

- `Authorization: Bearer <Supabase access token>` 必须存在。
- Function 验证 JWT、账号状态和管理员 membership。
- 浏览器只能使用 publishable/anon 兼容 key；Function 内部才可读取 secret/service role。

## Request

```json
{
  "operation": "list-users | ban-user | unban-user | privileged-action",
  "payload": {},
  "requestId": "uuid",
  "targetUserId": "uuid"
}
```

`requestId` 对所有写操作必填。`targetUserId` 不能作为操作者身份来源。

## Response

成功：

```json
{
  "ok": true,
  "operationId": "uuid",
  "result": {}
}
```

失败：

```json
{
  "code": "AUTH_REQUIRED | ADMIN_REQUIRED | ACCOUNT_DISABLED | CONFLICT | INVALID_REQUEST",
  "message": "可向管理员展示的错误信息",
  "ok": false
}
```

## Security contract

- 未登录返回 401。
- 非管理员、已撤权管理员或被封禁账号返回 403。
- Auth Admin API 和 service role 调用不出现在浏览器网络请求中。
- 每个特权写操作产生不可变审计事件。
