---
id: MEDIA-US-208
product: aiao-media
title: Supabase 后台直连与特权 Edge Function 边界
status: In Progress
priority: High
epic: MEDIA-EPIC-003
created: 2026-11-15
updated: 2026-11-21
dependsOn: [MEDIA-US-201, MEDIA-US-203]
tags: [supabase, auth, admin, edge-function, rls]
---

# 用户故事：Supabase 后台直连与特权 Edge Function 边界

## 作为/我想要/以便

**作为** 平台管理员

**我想要** 后台普通业务数据直接调用 Supabase，涉及 Auth Admin、封禁用户和 service role 的操作经过 Edge Function

**以便** 减少 Cloudflare 代理层，同时保证浏览器拿不到平台级特权

## 范围边界

### In Scope

- Admin 使用 Supabase Auth 登录、刷新、退出和会话恢复。
- 模板、策略、任务、用量、积分等普通业务查询通过 PostgREST、受保护 view 或普通 RPC 直连 Supabase。
- 普通 RPC 从 `auth.uid()` 和管理员 membership 判断操作者，不信任浏览器传入的 `userId`、`p_actor` 或角色字段。
- 用户列表、封禁/解禁、Auth Admin API、修改 `auth.users` 和其他 service role 操作由 Supabase Edge Function 提供。
- Edge Function 验证请求用户 JWT、管理员权限和账号状态，并在函数内部使用 secret/service role。
- 管理员写操作保留 `request_id` 幂等、revision/CAS 和审计记录。
- 迁移期间保留旧 `/api/admin/*` 兼容路径，直到所有调用方切换完成。

### Out of Scope

- 浏览器持有 secret/service role。
- 通过 Edge Function 代理所有普通业务查询。
- 重新设计积分账本、图片 Storage 或生成任务业务规则。
- 让普通 RPC 直接修改 `auth.users`。

## 验收标准

| #   | 前置条件                                      | 操作                                   | 预期结果                                                                         | 状态 |
| --- | --------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| 1   | Admin 使用有效 Supabase 账号                  | 登录、刷新页面、退出并重新登录         | 全流程由 Supabase Auth 完成；不再调用 `/api/admin/login` 交换密码                | ✅   |
| 2   | 管理员已登录                                  | 查询模板、策略、任务、用量或积分业务表 | 请求直接访问 PostgREST/RPC；响应受 RLS 和管理员授权约束                          | ⚠️   |
| 3   | 普通用户或匿名用户调用管理员 RPC              | 伪造 `p_actor`、`userId` 或管理员字段  | RPC 使用 `auth.uid()` 和数据库权限判断，伪造字段不能提升权限                     | ✅   |
| 4   | 有效管理员调用 Edge Function                  | 查询 Auth 用户或封禁/解禁用户          | Edge Function 验证 JWT 和管理员 membership 后执行；Auth Admin API 不暴露给浏览器 | ✅   |
| 5   | 匿名、普通用户、已撤权管理员调用特权 Function | 请求用户列表、封禁或 service role 操作 | 返回明确的 401/403；不执行任何特权写入                                           | ✅   |
| 6   | 管理员重复提交同一写操作                      | 使用相同 `request_id` 重放请求         | 业务结果只生效一次，审计记录不重复                                               | ✅   |
| 7   | 构建 Admin 生产包                             | 搜索浏览器 bundle 和网络请求           | 不包含 secret/service role；浏览器只使用 publishable/anon 兼容 key 和用户 JWT    | ⚠️   |
| 8   | 迁移切换期间旧 Admin 仍在线                   | 同时使用旧路径和新直连路径             | 旧路径可按兼容策略工作；新路径结果与旧路径一致，切换完成后旧路径可删除           | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

验收证据：AC1 使用 `aiao-media-admin` 测试验证；AC2–AC6 使用 Admin、Edge Function 与 migration contract tests 验证。当前 `aiao-media/apps/admin` 没有 `/api/admin/*` 调用方，Admin 已使用 Supabase Auth、PostgREST/RPC 和 `admin-api` Edge Function；旧 Worker 兼容入口与旧 Web `ProductClient` 仍由测试覆盖并保留，不能据此删除。AC7 的正式 bundle 扫描、AC8 的切换对照和正式 Supabase 验收仍待完成。

## 交付阶段

| 阶段 | 范围                            | 关闭条件                                  |
| ---- | ------------------------------- | ----------------------------------------- |
| A    | Admin Auth 统一和普通数据直连   | AC1–3 通过；旧登录代理无新调用方          |
| B    | Auth Admin 与封禁 Edge Function | AC4–5、AC7 通过；特权 key 仅存在服务端    |
| C    | 幂等、审计和兼容路径下线        | AC6、AC8 通过；旧 `/api/admin/*` 无调用方 |

## 技术笔记

Admin 已通过 [app.ts](../../../apps/admin/src/app/app.ts) 和 [admin-auth.ts](../../../apps/admin/src/app/admin-auth.ts) 直连 Supabase Auth；[product-client.ts](../../../apps/admin/src/app/product-client.ts) 将普通 PostgREST/RPC 与 `admin-api` Edge Function 分流。旧 Worker 入口仍保留兼容窗口。普通 RPC 必须使用 `auth.uid()`、RLS 或等价的调用者身份检查；Edge Function 才能使用 secret/service role。

## 当前实现证据

- Admin Auth、ProductClient、Edge Function 相关测试：`pnpm nx run aiao-media-admin:test` 与 `pnpm nx run aiao-media-supabase-functions:test` 已通过；本轮 Admin 回归为 195/195。
- 迁移与 RLS 契约：`pnpm nx run aiao-media:production-bundle-test`（15/15），覆盖 16 → 20 升级、幂等、parent、revision、部分回滚和跨 workspace 拒绝。
- 旧 `/api/admin/*` 在当前 Admin 产品没有调用方，但 API 兼容入口和旧 Web 客户端仍存在。正式 Supabase 项目登录、生产 bundle 扫描、旧路径切换对照和双区域验收仍是关闭本故事前的待办。

## 实现文件

- `aiao-media/apps/admin/src/app/app.ts` — Admin Auth 会话接线。
- `aiao-media/apps/admin/src/app/product-client.ts` — 普通业务直连和 Edge Function 调用切换。
- `aiao-media/apps/api/src/admin-api.ts` — 迁移期间旧 Worker 兼容入口。
- `aiao-media/infra/supabase/migrations/` — RLS、管理员 membership、RPC 和审计迁移。
- `aiao-media/infra/supabase/functions/admin-api/` — 目标特权 Edge Function。

## References

- [架构评审](../../plans/supabase-first-architecture-review-20261115.md#4-后台直接调用-supabase但特权操作必须经过-edge-function)
- [MEDIA-US-201 Supabase 账号与资源授权](MEDIA-US-201-sessions.md)
- [MEDIA-US-203 跨用户业务后台管理](MEDIA-US-203-business-admin.md)
- [需求约定](../../CONVENTIONS.md)
