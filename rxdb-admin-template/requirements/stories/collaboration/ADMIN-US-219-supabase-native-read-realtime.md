---
id: ADMIN-US-219
title: 协作读取、实时与身份校验改用 Supabase 原生能力
status: Backlog
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-17
tags: [admin, collaboration, supabase, realtime, rls, auth]
dependsOn: [ADMIN-US-218]
capabilities: []
---

# 用户故事：协作读取、实时与身份校验改用 Supabase 原生能力

## 作为/我想要/以便

**作为** 协作模板的部署者与团队成员
**我想要** 读取直接走 Supabase 的 RLS 查询，变更通知与在线状态走 Realtime 的 Broadcast 与 Presence，身份由服务端本地校验 JWT
**以便** 少维护一层读 API，降低数据库与 Auth 的负载，在线人数增长时实时功能仍然可用。

## 范围边界

### In Scope

- public 下的 RLS 只读投影经 PostgREST 分页读取：工作区摘要、PR、提交元数据、共享记录、审计、当前用户的通知。
- 命令事务内用 `realtime.send()` 向私有频道发送失效通知，`realtime.messages` 上的 RLS 按团队与应用授权。
- 在线状态改用 Realtime Presence，删除 Presence 表与周期性 presence 命令。
- 启用非对称 JWT 签名密钥，命令入口本地校验令牌；邮箱验证只在接受邀请时确认。

### Out of Scope

- 命令入口迁移到 Edge Function，由 [ADMIN-US-220](ADMIN-US-220-supabase-only-deployment.md) 承接。
- 客户端直写任何业务表；写入仍只经命令入口与领域引擎。

## 验收标准

| #   | 前置条件                          | 操作                                      | 预期结果                                                                                                                          | 状态 |
| --- | --------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 成员已登录                        | 打开团队页、PR 列表、提交历史与审计并翻页 | 数据经 Supabase 查询读取并受 RLS 约束，不经自定义读 API；跨团队、跨应用读取返回空                                                 | ⬜   |
| 2   | 某条命令改变了工作区              | 观察实时通知                              | 只有该团队/应用可读成员的私有频道收到通知；载荷只含修订号、类别与 ID，不含业务内容；客户端据此只拉取变化部分                      | ⬜   |
| 3   | 多名成员在线                      | 进入、切换和离开 PR 与记录                | 在线状态经 Realtime Presence 显示，不写数据库、不周期性调用命令接口，也不授予任何操作权限                                         | ⬜   |
| 4   | 成员被撤权                        | 撤权生效                                  | 被撤成员在计划规定的时限内从他人在线列表消失，其客户端停止接收频道消息并锁定团队上下文（与 ADMIN-US-215、ADMIN-US-201 AC#7 一致） | ⬜   |
| 5   | 已登录成员连续发起命令            | 服务端校验身份                            | 稳态下每个请求不再访问 Auth 服务；成员关系与权限仍由每条命令在服务端判定                                                          | ⬜   |
| 6   | 用户接受邀请                      | 服务端核对邮箱                            | 仅此时向 Auth 确认邮箱已验证并与邀请匹配；access token 有效期与账号删除后的残留窗口写入运维文档                                   | ⬜   |
| 7   | Realtime 或 Supabase 查询暂不可用 | 继续使用已解锁任务                        | 本地可继续编辑与排队；恢复后补齐变化，不伪报同步成功（与 ADMIN-US-206 一致）                                                      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。

## 技术笔记

做法与理由见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 4 节。Postgres Changes 对每次变更、每个订阅者都要执行一次 RLS 查询，Broadcast 与 Presence 不查库，适合在线人数增长的场景。撤权移除在线状态不再是数据库事务的一部分，以服务端撤权广播加频道重新鉴权保证 ADMIN-US-215 的时限。

## 实现文件

尚未实施。预计涉及 `rxdb-admin-template/supabase/migrations/`、`rxdb-admin-template/packages/collaboration/src/client/`（`controller.ts`、`workspace-feed.ts`、`api.ts`）与 `src/server/main.ts`、`src/server/http.ts`。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [ADMIN-US-215 在线成员与当前查看状态](ADMIN-US-215-presence.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
