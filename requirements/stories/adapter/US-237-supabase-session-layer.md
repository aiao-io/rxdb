---
id: US-237
title: Supabase 会话层：一个客户端负责登录、会话恢复、离线身份与按身份换库，应用不再各写一套
status: Backlog
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-28
updated: 2026-11-28
tags: [adapter, supabase, auth, session, identity]
---

<!--
INVEST 检查清单:
- [x] Independent: 只建在已交付的 US-035（身份绑定与库名）与适配器现有的 `client` 选项上，不改同步协议
- [x] Negotiable: 放在适配器子路径还是独立包、状态与事件的命名、登录方式怎么插拔可协商；「一页一个客户端」「库名与 `callerIdentity()` 同口径」「旧身份的迟到回调不进新库」已定
- [x] Valuable: 仓库里已有两份手写会话层（dev-rxdb-supabase 与 Admin 协作包），各自处理同一组换号问题，见「现状」
- [x] Estimable: 两份现成实现可对照；离线与跨标签页的规则已在 Admin 的协作契约 C01 里验收过
- [x] Small: 一个框架无关的会话对象，加 dev-rxdb-supabase 改用；Admin 接入由 ADMIN-US-223 承接
- [x] Testable: 每条 AC 都能在单测或 dev-rxdb-supabase 真栈上复验
-->

# 用户故事：Supabase 会话层

## 作为/我想要/以便

**作为** 用 RxDB + Supabase 做 local-first 应用的开发者
**我想要** 平台给我一个会话层：一页一个 supabase-js 客户端，负责登录、会话恢复、离线时沿用上次在线验证过的身份、跨标签页的退出与换号，并按当前身份告诉我该打开哪个本地库
**以便** 不再自己拼「读会话 → 算身份 → 算库名 → 换号时销毁旧实例再开新库」这条链，身份口径天然与适配器的 `callerIdentity()` 一致

## 立项

2026-11-28 owner 定方向：应用连 Supabase 要有一套标准逻辑，`rxdb-adapter-supabase` 能解决的由它解决；Admin 里有而平台没有的场景，列故事补齐成可复用能力。会话层是其中第一项。适配器已经能复用应用传入的客户端（`SupabaseAdapterOptions.client`），也能报告调用者身份，但「谁在登录、什么时候换号、换号后开哪个库」至今每个应用手写一遍。

本故事同时认领 [epic-015](../../epics/epic-015-identity-scoped-sync.md) 目标「本机数据按账号隔离」里「切换账号时多标签页广播锁定代次，迟到的回调按会话代次丢弃」这一半；「从此设备移除此账户数据」不在本故事。

## 现状

1. **平台只到身份为止。** [`RxDBAdapterSupabase.callerIdentity()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 按会话令牌报告 `{ scope, subject }`；[`getRxDBIdentityDatabaseName()`](../../../packages/rxdb/src/system/identity-binding.ts) 按身份算库名，库与身份的绑定与核对由 US-035 交付。登录、会话恢复、换号、跨标签页都不在任何包里。
2. **dev-rxdb-supabase 手写了一套。** [`prepareSupabaseSession()`](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts) 启动时自己建客户端、读会话、拼身份与库名：

   ```ts
   const identity: RxDBIdentity = { scope: config.scope, subject: session.subject };
   const databaseName = getRxDBIdentityDatabaseName(resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME), identity);
   ```

   登录方式在 [`supabase-session.ts`](../../../apps/dev-rxdb-supabase/src/app/supabase-session.ts)（访客、匿名登录、前端写死密码的演示账号）；换号由 [`switchIdentity()`](../../../apps/dev-rxdb-supabase/src/app/identity-switch.ts) 断开远端、登录或退出之后**整页刷新**，靠刷新打开另一个库。

3. **Admin 协作包另写了一套。** [`AuthSession`](../../../rxdb-admin-template/packages/collaboration/src/client/session.ts) 做邮箱验证码登录、要求邮箱已验证、离线时只信上次在线确认过且未过期的本机缓存身份（`restoreGrant()`）、经 `BroadcastChannel` 把退出广播给其他标签页、`guardLogout()` 让未保存的输入拦住退出。它不碰 RxDB：团队库名由协作包自己散列（[`teamDatabaseName()`](../../../rxdb-admin-template/packages/collaboration/src/client/team-database.ts)），本机工作台库干脆不按账号分（Admin D-10 第 4 条）。
4. **口径容易对错。** `RxDBIdentity.scope` 必须与适配器报告的值逐字相同（`new URL(supabaseUrl).origin`），尾斜杠、路径段不同都算另一个后端。库名上限随本地后端而变：`getRxDBIdentityDatabaseName()` 的说明只按 wa-sqlite 的 49 字节要求基础名留在 28 字节以内，sqlite-wasm 的 idb VFS 更紧，超限时 `sqlite3_open_v2` 报不透明的失败（[roadmap](../../roadmap.md)「零散收尾项」第 6 条）。

## 范围边界

### In Scope

- **一页一个客户端**：会话层持有唯一的 supabase-js 客户端（可延迟加载），同一个实例交给 `RxDBAdapterSupabase`（`client` 选项）与应用自己的 REST / RPC 调用。
- **登录方式按需启用**：邮箱验证码（可要求邮箱已验证才算登录）、邮箱密码、匿名登录、访客（不登录，以 anon 身份访问公开数据）；应用声明启用哪几种。
- **会话恢复与离线身份**：启动时恢复已保存的会话；在线时以服务端确认过的用户为准，并在本机记下带到期时间的身份；离线冷启动只沿用未过期的那份，到期或缺失时报「未登录」。会话层只报告身份与在线状态，解锁哪些本机数据由应用按自己的规则决定（例如 Admin 的 C01 矩阵）。
- **按身份给库名**：由当前身份与应用的基础名算出库名（复用 `getRxDBIdentityDatabaseName()`，`scope` 取与适配器相同的口径），并按应用声明的本地后端校验库名上限，超限在打开库之前明确报错。
- **换号不整页刷新**：身份变化时发出带代次的事件；提供把 RxDB 实例从旧身份的库换到新身份的库的步骤（断开远端、销毁旧实例、打开新库、重连），旧代次的迟到回调与在途响应不写进新库（在途响应不落库由 US-035 保证，本故事保证事件与回调按代次丢弃）。
- **跨标签页**：一个标签页退出或换号，其他标签页在可感知的时间内收到同一个身份变化事件；各标签页的旧库原样保留。
- **退出前的拦截**：应用可登记拦截（如有未保存的输入），拦截成立时退出不发生。
- **dev-rxdb-supabase 改用**：替换 `prepareSupabaseSession()`、`supabase-session.ts` 与 `switchIdentity()` 的手写部分，保留它的三类演示身份；文档写明用法、离线口径与库名上限。

### Out of Scope

- OAuth、企业 SSO、账号合并与找回；登录页等界面组件（会话层是无界面的状态与动作）。
- 「从此设备移除此账户数据」与退出后旧库保留多久（epic-015 待冻结的决策 2）。
- 授权快照：仍由 `rxdb.grants` 按远端或应用设入（US-029）；会话层不缓存权限。
- Admin 的接入与 C01 矩阵的回归：由 [ADMIN-US-223](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-223-platform-supabase-session.md) 验收。

## 验收标准

| #   | 前置条件                                   | 操作                                       | 预期结果                                                                                             | 状态 |
| --- | ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | 应用只经会话层建客户端                     | 启动后连接 Supabase 适配器并发起应用请求   | 页面上只有一个 supabase-js 客户端；适配器与应用请求带同一个会话令牌                                  | ⬜   |
| 2   | 启用邮箱验证码且要求邮箱已验证             | 请求并输入验证码；再用未验证的邮箱登录     | 已验证邮箱得到登录身份；未验证的不算登录，不产生半登录状态                                           | ⬜   |
| 3   | 已登录用户刷新页面                         | 会话层恢复会话并给出库名                   | 身份与适配器 `callerIdentity()` 报告的逐字相同；按库名打开的库通过 US-035 的绑定核对，不报身份不匹配 | ⬜   |
| 4   | 在线登录过一次，之后断网冷启动             | 本机身份未过期 / 已过期各打开一次          | 未过期：报告该身份且标为离线，不发任何网络请求；已过期：报「未登录」                                 | ⬜   |
| 5   | 同一标签页从账号 A 换到账号 B              | 执行换号                                   | 不整页刷新；RxDB 实例换到 B 的库并重连；A 那一代的迟到回调与在途响应都没有写进 B 的库                | ⬜   |
| 6   | 两个标签页都以 A 打开                      | 在其中一个退出或换成 B                     | 另一个标签页收到同一个身份变化事件；它仍打开着的是 A 的库，A 的本机数据原样保留                      | ⬜   |
| 7   | 应用登记了退出拦截且拦截成立               | 调用退出                                   | 不退出，身份与库都不变；拦截撤销后再退出照常进行                                                     | ⬜   |
| 8   | 基础名加身份后缀超过所选本地后端的库名上限 | 请求库名                                   | 在打开库之前报明确的配置错误，写明上限与实际长度；不出现底层不透明的打开失败                         | ⬜   |
| 9   | dev-rxdb-supabase 改用会话层               | 跑现有的身份切换与按身份同步的远端 e2e     | 访客、匿名用户、演示账号三类身份行为不变；换号不再依赖整页刷新                                       | ⬜   |
| 10  | 会话层是框架无关的 RxJS 接口               | Angular / React / Vue 各用现有的订阅方式接 | 三端拿到同一组状态与事件；若加框架绑定，三端在同一 PR 内交付且 API 对称                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐——会话层单测（含离线冷启动、代次丢弃、跨标签页广播）、dev-rxdb-supabase 远端 e2e 的身份切换用例与复验命令。

## 技术笔记

- 离线身份的「本机记录」只存用户 id、邮箱与到期时间，不存令牌；与 Admin `AuthSession` 的缓存授权同口径，便于 ADMIN-US-223 平移。
- 换号步骤的顺序沿用 dev-rxdb-supabase `switchIdentity()` 的经验：先断开远端，否则登录事件会让适配器按新身份重建实时订阅、随即被打断。
- 库名上限按本地后端登记（wa-sqlite 内置 VFS 49 字节；sqlite-wasm idb VFS 约 41 字节，含 `@0_1.sqlite.db-journal` 后缀的路径上限 64），同时收掉 roadmap「零散收尾项」第 6 条「至少在连接时给出明确报错」。
- 包位置倾向放在 `@aiao/rxdb-adapter-supabase` 的子路径导出：它已经依赖 supabase-js，也最清楚 `scope` 的口径；放独立包要多一条发布边。

## 实现文件

- `packages/rxdb-adapter-supabase/src/session/`（待建）— 会话对象、登录方式、离线身份、库名
- `apps/dev-rxdb-supabase/src/app/` — 改用会话层，删去手写的会话与换号

## References

- [US-035 每个身份一个本地库](../core/US-035-identity-bound-local-database.md)
- [US-029 按作用域的成员写权限](../core/US-029-rbac-owner-role-permission.md)
- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)
- [Admin 协作契约 C01：身份、初始化与邀请](../../../rxdb-admin-template/requirements/collaboration-contract.md)
