---
id: US-713
title: P2P demo 管理后台：管理员总览并处置账号与服务
status: In Review
priority: Medium
epic: epic-011-p2p-file-share
created: 2026-11-05
updated: 2026-11-05
tags: [p2p, admin, supabase, cloudflare, demo]
---

# 用户故事：P2P demo 管理后台

## 作为/我想要/以便

**作为** 部署 `apps/dev-rxdb-p2p` 的维护者（超级管理员）
**我想要** 在应用里总览账号、在线设备与服务器副本，并做封禁、删除、踢下线这类处置
**以便** 不必为每次清理都去 Supabase / Cloudflare 控制台手写 SQL

现状的痛点：账号与服务只能走平台控制台。删账号只级联删设备登记，清单表里的持有声明没有外键、会留成孤儿，所以清测试账号要手写 SQL 先清声明再删账号；服务器副本（R2）没有任何删除入口；信令上谁在线、把某台设备踢下线也没有入口。

## 范围边界

### In Scope

- **管理员身份**：Worker secret `ADMIN_USER_IDS`（逗号分隔的 Supabase 用户 id）。服务端验过 access token 后比对；前端的「是否管理员」只决定入口显不显示，不授予任何权限。不用邮箱认定：测试项目关了邮箱确认，任何人都能注册一个自己并不拥有的邮箱，而用户 id 由 Supabase 分配、无法抢注。
- **总览（只读）**：
  - 账号：邮箱、注册与最近登录时间、是否封禁、设备数、持有声明数；
  - 在线设备：设备名、所属账号、实例键（信令 Durable Object 的当前连接）；
  - 服务器副本：内容哈希、文件名、大小、上传时间、持有者数（R2 对象与清单）。
- **处置**：
  - 封禁 / 解封账号；封禁时同时断开该账号在线的设备；
  - 删除账号：先清掉账号的设备登记与全部持有声明，再断开在线设备，最后删账号；
  - 删除服务器副本；
  - 踢设备下线：断开信令连接，客户端不自动重连。
- **保护**：管理员不能封禁、删除自己，也不能处置名单里的其他管理员。
- **权限边界**：管理接口只认管理员；`p2p.admin_*` 函数只有 `service_role` 能执行；缺 `SUPABASE_SERVICE_ROLE_KEY` 或 `ADMIN_USER_IDS` 时明确报未配置，不降级成放行。

### Out of Scope

- **角色表与在线授权界面**：名单只经 `wrangler secret` 修改。
- **审计日志、批量操作、配额与用量告警**：处置只在响应里回报结果，不落库。
- **中断已建立的 P2P 直连**：直连由两端各自持有，服务端拆不了；封禁与踢下线只作用于信令连接和新请求。
- **立即作废已签发的 Supabase 会话**：封禁后 GoTrue 拒绝续期，但已签发的 access token 在 PostgREST / Realtime 上直到过期仍有效；Worker 的信令与文件接口经 `/auth/v1/user` 实时判定，封禁对它们立即生效。
- **只封某台设备而不封账号**：设备登记是用户自己的数据；本故事只做账号级处置与在线连接级踢下线。
- **清理管理后台之外留下的孤儿持有声明**：例如在 Supabase 控制台直接删账号之前已经留下的声明；后台只清它自己删除的账号的声明。
- **服务器副本的配额与自动过期**。

## 验收标准

| #   | 前置条件                                                        | 操作                        | 预期结果                                                                                     | 状态 |
| --- | --------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| 1   | 已登录的普通账号（不在名单里）                                  | 请求管理接口；打开 `/admin` | 管理接口 403，`me` 为 `admin: false`；界面没有「管理后台」入口，直接打开 `/admin` 被带回首页 | ✅   |
| 2   | 令牌缺失或无效                                                  | 请求管理接口                | 401                                                                                          | ✅   |
| 3   | Worker 缺 `SUPABASE_SERVICE_ROLE_KEY` 或 `ADMIN_USER_IDS`       | 请求管理接口                | 503 并说明缺什么；`me` 为 `admin: false`；其余路由不受影响                                   | ✅   |
| 4   | 管理员登录；库里有多个账号、设备与声明，有设备在线，R2 里有副本 | 打开 `/admin`               | 账号、在线设备、服务器副本三张表与真实状态一致（设备数、声明数、文件名、大小）               | ✅   |
| 5   | 某账号有设备在线                                                | 管理员封禁它                | 在线设备断开且不自动重连；该账号旧 token 的信令 hello 与文件请求都被拒；解封后可重新连接     | ✅   |
| 6   | 某账号有设备并持有声明；另一账号也有声明                        | 管理员删除该账号            | 账号、设备登记、持有声明全部消失，不留孤儿声明；另一账号的声明不受影响；在线设备被断开       | ✅   |
| 7   | R2 里有某文件的服务器副本                                       | 管理员删除它                | R2 对象被删，副本列表更新；清单里的持有声明不受影响                                          | ✅   |
| 8   | 两台设备在线                                                    | 管理员踢其中一台            | 该设备的信令断开且不自动重连，另一台的在线列表更新                                           | ✅   |
| 9   | 管理员对自己或名单里的另一位管理员                              | 封禁或删除                  | 409，账号状态不变                                                                            | ✅   |
| 10  | 普通登录用户与匿名角色                                          | 直接调用 `p2p.admin_*` RPC  | 被数据库拒绝（permission denied），不泄露数据                                                | ✅   |
| 11  | 全部用例                                                        | 入 CI                       | 进入仓库门禁（`e2e-remote`），不依赖人工环境                                                 | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 验收证据

真栈用例：`pnpm nx run dev-rxdb-p2p-e2e:e2e-remote`（[admin.spec.ts](../../../apps/dev-rxdb-p2p-e2e/src/demo/admin.spec.ts)，配置 [playwright.demo.config.ts](../../../apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts)）。
Worker 经 wrangler 起（真 Durable Object、本地 R2），认证与清单同步走本 checkout 的隔离 Supabase 栈（GoTrue、PostgREST、Postgres 的镜像版本由 `docker/docker-compose.ci.yml` 固定）。
处置的结果以 service role 直接读库、读 R2 为准，不只看界面上变了。`nx e2e` 有用例失败时也可能返回 0，以 `test-output/playwright/output/.last-run.json` 为准。

- **AC#1**：e2e「AC#1」——普通账号调 `/accounts`、`/online`、`/devices/:id/kick` 得 403，`/me` 为 `admin: false`，工作区导航里没有 `admin-entry`，`goto('/admin')` 落回 `/`。单测：[admin.spec.ts](../../../apps/dev-rxdb-p2p/server/admin.spec.ts)「keeps a signed-in user who is not an administrator out of …」逐条覆盖全部管理路由并断言没有任何副作用；[app.routes.spec.ts](../../../apps/dev-rxdb-p2p/src/app/app.routes.spec.ts)「administration access」；[workspace.page.spec.ts](../../../apps/dev-rxdb-p2p/src/app/pages/workspace.page.spec.ts)「shows the administration entry only to a confirmed administrator」。
- **AC#2**：e2e「AC#2」；单测「answers %s with 401 and touches nothing」。
- **AC#3**：只能在单测层验：e2e 的 Worker 是配好的。[router.spec.ts](../../../apps/dev-rxdb-p2p/server/router.spec.ts)「a Worker without administrator secrets」走真实的 `handleRequest` 与 `adminConfigOf`，只把 Supabase 的网络调用换成桩，断言 503 的原因文字、`me` 为 `admin: false`、`/app-config.js` 与文件路由照常；[admin-config.spec.ts](../../../apps/dev-rxdb-p2p/server/admin-config.spec.ts) 覆盖缺一个、缺两个、名单写错。
- **AC#4**：e2e「AC#4」——账号行的设备数、声明数与库里一致，在线设备表含该账号的设备，服务器副本行有文件名与大小。拼装逻辑：admin.spec.ts「joins Supabase users with their device and claim counts」「lists server copies newest first …」；数据库函数的输出：[admin-schema.spec.ts](../../../apps/dev-rxdb-p2p/server/admin-schema.spec.ts)「counts the devices and the claims …」「groups the manifest by content hash …」。
- **AC#5**：e2e「AC#5」——封禁后该设备页面的信令状态为 `rejected` 且连接数不再增加（等两个多重连周期）；封禁前取得的旧 token 的 hello 回 `unauthorized`、文件接口回 401；解封后 hello 回 `welcome`。单测：[identity.spec.ts](../../../apps/dev-rxdb-p2p/server/identity.spec.ts)「treats a banned account as an invalid token …」，信令客户端 [signaling-client.spec.ts](../../../apps/dev-rxdb-p2p/src/app/p2p/signaling-client.spec.ts)「stops for good when an administrator removes the device」。
- **AC#6**：e2e「AC#6」——删除后以 service role 读库：该账号的声明为 0、设备登记为空、Auth 里查不到账号，旁观账号的声明仍在，被删账号的页面信令为 `rejected`。数据库侧：admin-schema.spec.ts「removes the claims and the device registrations of one account and nothing else」「leaves the account unable to write a new claim」。
- **AC#7**：e2e「AC#7」——删除后 `HEAD /api/files/:hash` 回 404，清单里的声明仍为 1 条。
- **AC#8**：e2e「AC#8」——被踢设备的信令状态为 `rejected` 且连接数不再增加，见证者的在线设备数少一台，管理员的在线设备表里该行消失。单测：[signaling-hub.spec.ts](../../../apps/dev-rxdb-p2p/server/signaling-hub.spec.ts)「administration」、[signaling-room.spec.ts](../../../apps/dev-rxdb-p2p/server/signaling-room.spec.ts)「administration endpoints」。
- **AC#9**：e2e「AC#9」——以管理员令牌封禁、删除自己得 409，账号仍在。单测：admin.spec.ts「refuses to ban %s」「refuses to delete %s」（对「去掉自我保护」「去掉其他管理员保护」做过变异检查，用例会变红）。
- **AC#10**：e2e「AC#10」——普通用户与匿名角色经 PostgREST 调三个函数得 401 / 403，调用后用户自己的声明与设备仍在，service role 得 200 与真实数据。数据库侧：admin-schema.spec.ts「permissions」（对「去掉 REVOKE」「service_role 授 ALL」做过变异检查）。
- **AC#11**：`e2e-remote` 目标由 CI 自动编入 e2e 矩阵并拉起 supabase action，`admin.spec.ts` 与现有用例同目录、自动进入；首次 CI 运行确认前保持 ⚠️。

## 技术笔记

- **接口**（`/api/admin/*`，Bearer 是 Supabase access token；类型见 [admin-protocol.ts](../../../apps/dev-rxdb-p2p/shared/admin-protocol.ts)）：

  | 方法与路径                         | 作用                                                  |
  | ---------------------------------- | ----------------------------------------------------- |
  | `GET /me`                          | `{ admin }`；任何已登录用户可调，前端据此决定入口     |
  | `GET /accounts?page=N`             | 一页账号（每页 50）与总数，含设备数、声明数、是否封禁 |
  | `GET /online`                      | 信令上在线的设备                                      |
  | `GET /files`                       | R2 副本（一次最多 1000 个）、总大小、是否被截断       |
  | `POST /accounts/:id/ban` / `unban` | 封禁并断开在线设备 / 解封                             |
  | `DELETE /accounts/:id`             | 清设备登记与声明、断开在线设备、删账号                |
  | `DELETE /files/:contentHash`       | 删 R2 副本                                            |
  | `POST /devices/:deviceId/kick`     | 断开该设备的信令连接；设备不在线回 404                |

- **检查次序**：令牌（401）→ 配置（503）→ 管理员名单（403）→ 路由；`/me` 例外，只问身份，配置缺失也回 `admin: false`。验证方式：admin.spec.ts 的访问控制用例与变异检查。
- **为什么管理员在 Worker 里认定，不走 RLS**：账号的列表、封禁、删除是 GoTrue 的 Admin API，必须用 service role key；它只存在于 Worker secret，不进浏览器，也不进 `/app-config.js`。
- **封禁怎么生效**：Admin API 的 `ban_duration`（封禁 `876000h`，解封 `none`）。**封禁前签发的 access token 在封禁后调 `/auth/v1/user` 仍返回 200**，只是响应里多了 `banned_until`；所以 [`verifyAccessToken`](../../../apps/dev-rxdb-p2p/server/identity.ts) 读这个字段，封禁中视同令牌无效，字段读不懂时按封禁处理（失败即关闭）。没有这一步，Worker 会继续放行被封禁账号的旧令牌。验证方式：对隔离栈的真实 GoTrue 手工请求确认上述响应，e2e「AC#5」回归。
- **删除次序**：先 `p2p.admin_purge_account`（一条语句里清掉声明与设备登记）→ 踢在线设备 → Admin API 删账号；任何一步失败即停并回 502，重试安全。设备登记要先于账号删除清掉：设备一没，`p2p.owns_holder` 就拒绝该账号写任何新声明，设备握手也过不了，不会在清理与删除之间被写进新的孤儿声明。封禁是先封（新连接立即被拒）再踢。验证方式：admin.spec.ts「purges the account data … and only then deletes the account」，admin-schema.spec.ts。
- **踢下线**：信令中枢新增 `roster()` 与 `evict()`，关闭码 4403；客户端把 4401 与 4403 都当作「凭据被拒」，进入 `rejected` 且不自动重连（自己重连只会再被拒或再被踢），设备面板据此提示「刷新页面或重新登录后再试，仍被拒绝请联系管理员」。房间的 `/admin/*` 只由 Worker 在验过管理员后以内部请求调用；公开的 `/api/signal` 把原请求交给房间，路径恒为 `/api/signal`，外部到不了。验证方式：router.spec.ts「never lets an outside request reach the signaling room administration paths」。
- **数据库函数**（[p2p-schema.sql](../../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql) 第 4 节）：`p2p.admin_account_stats()`、`p2p.admin_file_catalog()`、`p2p.admin_purge_account(uuid)`，复用 `p2p.holder_id` 派生；`EXECUTE` 只授予 `service_role`，并给 `service_role` 授最小的表权限（`devices` 的 SELECT / DELETE，清单的 SELECT / DELETE）。可重复执行。清单行的删除照常触发同步触发器、写进同步日志 `rxdb_change`，其他设备下一次拉取就能看到声明被撤回。验证方式：对隔离栈的真库，在会回滚的事务里以 `service_role` 清一个持有 2 条声明的账号，`rxdb_change` 多出 2 条 `DELETE`。
- **部署**：线上要把 SQL 重新执行一遍，并写两个 secret（`scripts/admin-secrets.mjs | wrangler secret bulk`），步骤见 [README](../../../apps/dev-rxdb-p2p/README.md#部署到-cloudflare)。本地与 e2e 的接线：`scripts/dev-vars.mjs` 写入 service role key 与 `P2P_ADMIN_USER_IDS`，`scripts/e2e-admin-user.mjs` 在 Worker 启动前建好管理员并回报它的 id。
- **已知限制**：账号每页 50 个、副本一次最多列 1000 个（超出时界面提示被截断）；管理后台之外留下的孤儿声明不清；已签发的 Supabase access token 在 PostgREST / Realtime 上直到过期仍有效。

## 实现文件

- `apps/dev-rxdb-p2p/server/` — `admin.ts`（路由与处置次序）、`admin-config.ts`（名单与凭据）、`admin-supabase.ts`（Auth Admin API 与 `p2p.admin_*` 的客户端）、`admin-room.ts`（经内部路径调信令房间）、`signaling-hub.ts` / `signaling-room.ts`（在线列表与踢下线）、`identity.ts`（封禁判定）
- `apps/dev-rxdb-p2p/shared/admin-protocol.ts` — 接口形状
- `apps/dev-rxdb-p2p/src/app/` — `admin/`（接口封装与身份缓存）、`pages/admin.page.ts`（管理后台）、`app.routes.ts`（`/admin` 路由与守卫）、`pages/workspace.page.ts`（入口）、`p2p/signaling-client.ts`（4403 不重连）
- `apps/dev-rxdb-p2p/supabase/p2p-schema.sql` — `p2p.admin_*` 函数与授权
- `apps/dev-rxdb-p2p/scripts/` — `supabase-stack.mjs`、`dev-vars.mjs`、`e2e-admin-user.mjs`、`admin-secrets.mjs`
- `apps/dev-rxdb-p2p-e2e/src/demo/` — `admin.spec.ts`、`admin-fixtures.ts`

## References

- [US-704 开工前置](US-704-p2p-manifest-discovery.md#开工前置)：认证宿主与服务端授权合同
- [US-706](US-706-p2p-fallback-auth.md)：服务器回退与 R2
- [US-707](US-707-p2p-cross-runtime-e2e.md)：独立 demo 的交付形态
