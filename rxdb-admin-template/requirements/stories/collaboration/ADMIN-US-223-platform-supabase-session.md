---
id: ADMIN-US-223
title: 全局会话改用平台 Supabase 会话层：登录、离线身份与跨标签页行为不变，协作包不再自带会话实现
status: Backlog
priority: Medium
epic: ADMIN-EPIC-005
created: 2026-11-28
updated: 2026-11-28
tags: [admin, auth, session, supabase, platform]
dependsOn: [ADMIN-US-201, ADMIN-US-222]
capabilities: [rxdb:US-237]
---

# 用户故事：全局会话改用平台 Supabase 会话层

## 作为/我想要/以便

**作为** Admin 模板的维护者与使用者
**我想要** 全站登录（D-10）建立在平台 Supabase 会话层之上：邮箱验证码、会话恢复、离线时只信未过期的本机身份、跨标签页退出、未保存输入拦住退出，都由平台提供
**以便** Admin 与 dev-rxdb-supabase 用同一套会话逻辑，身份与库名的口径天然与 `rxdb-adapter-supabase` 一致，协作包只保留团队与 PR 相关的部分

## 背景

- 现状：协作包 `AuthSession`（`packages/collaboration/src/client/session.ts`）。`authSession(base)` 单例经 `GET /collaboration-api/config` 取公开配置并延迟加载 supabase-js；`signInWithOtp` / `verifyOtp` 登录；在线时 `getUser()` 必须是已验证邮箱，之后在本机记下 `{ user, expiresAt }`；离线只信未过期的那份（`restoreGrant()`）；`BroadcastChannel('admin-collaboration-session')` 把退出广播给其他标签页；`guardLogout()` 让未保存的输入拦住退出。三端路由守卫（`shell/auth-gate.ts`）与外壳账号菜单都订阅它。
- 平台 [US-237](../../../../requirements/stories/adapter/US-237-supabase-session-layer.md) 交付同一组能力的框架无关实现，并让 dev-rxdb-supabase 改用；本故事把 Admin 接上去，行为以 [协作契约 C01](../../collaboration-contract.md#c01身份初始化与邀请) 与 [D-10](../../decisions.md#d-10全站登录与全局会话) 为准，方向见 [D-11](../../decisions.md#d-11supabase-接入走平台标准层)。

## 范围边界

### In Scope

- 协作包 `@rxdb-admin-template/collaboration/auth` 的对外接口（路由守卫、账号菜单与团队协作所用的身份）改由平台会话层提供；删除协作包里自写的会话、本机身份缓存与跨标签页实现，不保留回退路径。
- 公开配置仍由命令入口的 `/config` 提供（Supabase URL 与 anon / publishable key），交给会话层建客户端。
- 本机工作台与团队库的库名、身份取自会话层，与 [ADMIN-US-222](ADMIN-US-222-identity-bound-local-databases.md) 同口径。
- 一页一个 Supabase 客户端：协作读取（PostgREST / RPC）、Realtime 频道与（[ADMIN-US-224](ADMIN-US-224-team-database-standard-grants.md) 之后的）适配器都用它。
- e2e 模拟认证服务（`apps/react-e2e/auth/e2e-auth-server.mjs`）继续可用；生产代码里没有跳过登录的开关。

### Out of Scope

- 新的登录方式（OAuth / SSO 仍是后续候选）。
- 团队上下文的锁定与解锁（C01 的团队部分）：仍由协作包按会话层报告的身份与在线状态判定。

## 验收标准

| #   | 前置条件                   | 操作                              | 预期结果                                                                      | 状态 |
| --- | -------------------------- | --------------------------------- | ----------------------------------------------------------------------------- | ---- |
| 1   | 未登录                     | 访问任一页面                      | 进入 `/login`，登录后回到原地址；结果与 ADMIN-US-201 AC#1 一致                | ⬜   |
| 2   | 邮箱验证码登录             | 输入正确、错误与重复使用的验证码  | 结果与 ADMIN-US-201 AC#2、#3 一致                                             | ⬜   |
| 3   | 热续作中断网，会话自然过期 | 继续编辑当前任务                  | 结果与 ADMIN-US-201 AC#4 一致                                                 | ⬜   |
| 4   | 离线冷启动                 | 本机身份未过期 / 已过期各打开一次 | 结果与 ADMIN-US-201 AC#5、#6 一致                                             | ⬜   |
| 5   | 两个标签页                 | 在其中一个退出或切换账号          | 另一个随之锁定原上下文，迟到回执不进新账号视图；结果与 ADMIN-US-201 AC#7 一致 | ⬜   |
| 6   | 编辑界面有未保存的输入     | 退出账号                          | 被拦住并提示，与 ADMIN-US-205 AC#5 一致                                       | ⬜   |
| 7   | 页面运行中                 | 检查 Supabase 客户端与协作包源码  | 页面上只有一个客户端；协作包里不再有自写的建客户端、会话缓存与跨标签页广播    | ⬜   |
| 8   | 三端                       | 跑协作 e2e 与三端 app e2e         | 全部通过，用例断言不因改用平台而修改                                          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- 回归基线是现有用例：协作包 `controller.spec.ts` 的离线冷启动、锁定前存草稿与跨账号队列，协作 e2e 的真实 `verifyOtp`、重复验证码、冷启动、退出与撤权锁定。改用平台之后这些用例的断言不改。
- 若平台会话层的离线身份口径与 `restoreGrant()` 不同（例如到期时间的来源），以 C01 为准回到 US-237 修，不在 Admin 里补一层。

## 实现文件

- `rxdb-admin-template/packages/collaboration/src/auth.ts`、`src/client/session.ts` — 改为平台会话层
- `rxdb-admin-template/apps/{react,angular,vue}/src/app/shell/auth-gate.ts` — 路由守卫

## References

- [平台 US-237 Supabase 会话层](../../../../requirements/stories/adapter/US-237-supabase-session-layer.md)
- [ADMIN-US-201 Supabase 邮箱验证码登录与会话恢复](ADMIN-US-201-supabase-email-otp-session.md)
- [Supabase 接入标准化计划](../../plans/supabase-standardization-tasks.md)
