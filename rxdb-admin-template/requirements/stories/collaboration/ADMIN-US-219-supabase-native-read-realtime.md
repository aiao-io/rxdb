---
id: ADMIN-US-219
title: 协作读取、实时与身份校验改用 Supabase 原生能力
status: In Review
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-18
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
| 1   | 成员已登录                        | 打开团队页、PR 列表、提交历史与审计并翻页 | 数据经 Supabase 查询读取并受 RLS 约束，不经自定义读 API；跨团队、跨应用读取返回空                                                 | ✅   |
| 2   | 某条命令改变了工作区              | 观察实时通知                              | 只有该团队/应用可读成员的私有频道收到通知；载荷只含修订号、类别与 ID，不含业务内容；客户端据此只拉取变化部分                      | ✅   |
| 3   | 多名成员在线                      | 进入、切换和离开 PR 与记录                | 在线状态经 Realtime Presence 显示，不写数据库、不周期性调用命令接口，也不授予任何操作权限                                         | ✅   |
| 4   | 成员被撤权                        | 撤权生效                                  | 被撤成员在计划规定的时限内从他人在线列表消失，其客户端停止接收频道消息并锁定团队上下文（与 ADMIN-US-215、ADMIN-US-201 AC#7 一致） | ✅   |
| 5   | 已登录成员连续发起命令            | 服务端校验身份                            | 稳态下每个请求不再访问 Auth 服务；成员关系与权限仍由每条命令在服务端判定                                                          | ✅   |
| 6   | 用户接受邀请                      | 服务端核对邮箱                            | 仅此时向 Auth 确认邮箱已验证并与邀请匹配；access token 有效期与账号删除后的残留窗口写入运维文档                                   | ✅   |
| 7   | Realtime 或 Supabase 查询暂不可用 | 继续使用已解锁任务                        | 本地可继续编辑与排队；恢复后补齐变化，不伪报同步成功（与 ADMIN-US-206 一致）                                                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（2026-11-18，本地隔离 Supabase 栈：GoTrue、PostgREST、Realtime v2.102.3）：

- AC#1：public 下 13 个 `security_barrier` 只读视图与 5 个只读函数（提交图推导不受 PostgREST max-rows 截断），以 `admin_private.can_read()` 判定成员资格，通知与回执只限本人，邀请只限管理者；邀请令牌摘要、请求指纹、初始化密钥与提交指纹不暴露。`read-projections.integration.spec.ts` 的投影矩阵覆盖 anon、本团队成员、跨团队、跨应用、被撤成员与写入全拒；客户端经 PostgREST 分页读取团队页、PR 详情、历史、审计与通知，自定义 API 只保留命令。团队页不再含讨论、审核与审计，因此 ADMIN-US-218 AC#6 一并关闭。
- AC#2：命令事务的最后一条语句在递增版本行的同时调用 `realtime.send(…, true)`，发往私有频道 `collab:<团队>:<应用>`；载荷只有修订号、类别白名单与 ID。集成用例断言回滚、被拒与重放不发，且全部是私有消息；`realtime.messages` 的 RLS 只允许可读成员订阅。客户端按修订号连续处理，只拉取变化部分，跳号时整页重读。
- AC#3：在线状态改为同一私有频道的 Realtime Presence，删除 `admin_presence` 表与每 15 秒一次的 presence 命令；不写库、不授予权限。关闭页面即时消失，断网且无 FIN 时约 59 秒后由 Realtime 移除。
- AC#4：撤权命令在同一事务里发出 `revoked` 事件，他人页面即时移除该成员，被撤成员页面即时锁定并离开频道；绕过页面继续监听时，令牌刷新或重新加入即被 Realtime 按 RLS 拒绝（真栈 e2e ×3）。
- AC#5：命令入口本地验签，`SUPABASE_JWKS_URL`（ES256 / RS256，生产）与 `SUPABASE_JWT_SECRET`（HS256，本机栈）必须恰好配置一种，否则启动失败；校验 iss、aud、role、exp / nbf、sub。`identity.spec.ts` 26 例，http 用例以 Auth 桩计数证明稳态零调用。
- AC#6：只在接受邀请时调用一次 Auth 核对邮箱已验证，以 Auth 返回的邮箱写入成员行；令牌有效期、账号删除后的残留窗口与团队级撤权即时生效写入协作包 README 的运维须知。
- AC#7：Supabase 查询或 Realtime 不可用时本地照常编辑与排队，恢复后按修订号补齐，不伪报同步成功（controller、reader 用例与 e2e「Realtime 断开期间页面照常可用，恢复后按修订号补齐」×3）。
- 回归：单测 478 例、集成 45 例、协作 e2e 42 例（原 30 例加新增 12 例）同轮通过，`secrets-check` 通过；旧迁移下新投影与广播用例 11 例全红，RLS、广播与身份共 13 个变异均被捕获。
- 已知局限：Presence 载荷由成员自报，可冒用他人 userId，只作协作提示、不授予任何权限。

## 技术笔记

做法与理由见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 4 节。Postgres Changes 对每次变更、每个订阅者都要执行一次 RLS 查询，Broadcast 与 Presence 不查库，适合在线人数增长的场景。撤权移除在线状态不再是数据库事务的一部分，以服务端撤权广播加频道重新鉴权保证 ADMIN-US-215 的时限。

## 实现文件

- 迁移：`rxdb-admin-template/supabase/migrations/202611170004_supabase_native.sql`（只读视图、读取函数、`realtime.messages` 策略）。
- 读取：`packages/collaboration/src/reader.ts`、`read-source.ts`、`rows.ts`、`derive.ts`、`approval.ts`，服务端 `src/server/pg-read.ts`。
- 实时：`src/server/signal.ts`、`src/server/pg-workspace.ts`、`src/client/workspace-feed.ts`。
- 身份：`src/server/identity.ts`、`src/server/start.ts`、`src/server/main.ts`、`src/server/http.ts`。
- e2e 拓扑：`scripts/browser-server.mjs` 让协作服务直接连隔离栈数据库，删除了投影同步桥接。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [ADMIN-US-215 在线成员与当前查看状态](ADMIN-US-215-presence.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
