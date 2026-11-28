---
id: US-238
title: Supabase 适配器只接身份与授权：不走日志同步的库不订阅变更频道、不探日志表，服务端只需授权函数
status: Backlog
priority: Medium
epic: epic-015-identity-scoped-sync
created: 2026-11-28
updated: 2026-11-28
tags: [adapter, supabase, identity, permission, deployment]
---

<!--
INVEST 检查清单:
- [x] Independent: 只改适配器连接时按需启用哪些能力，不改同步协议、授权快照与身份绑定的语义
- [x] Negotiable: 自动按实体同步配置判定还是加显式选项可协商；「没有实体走日志同步时，不订阅、不探、不要求日志 SQL」已定
- [x] Valuable: Admin 团队库要用平台的身份核对与授权快照，却不走日志同步，今天接上适配器会被迫部署整套日志同步 SQL，见「现状」
- [x] Estimable: 三处入口都在 `connect()` 链上：实时频道、分区查询、RLS 自检
- [x] Small: 一个适配器内的按需开关加文档
- [x] Testable: 请求记录可断言「只调了授权函数」，混合配置的回归可在真栈上跑
-->

# 用户故事：Supabase 适配器只接身份与授权

## 作为/我想要/以便

**作为** 自带数据协议（例如经服务端命令提交、仅经 PR 合并）的应用开发者
**我想要** 只为身份核对（US-035）与授权快照（US-029）连上 Supabase 适配器，服务端只部署授权函数
**以便** 应用的本地写判定与三端界面用上平台同一份授权，而不必在自己的 Supabase 项目里装一套用不到的日志同步表、直写 RPC 与变更频道

## 立项

2026-11-28 owner 定方向：连 Supabase 走平台标准逻辑，平台缺的补成可复用能力。具名使用方是 Admin 团队库：每个「用户 × 团队 × 应用」一个本地库，实体 `SyncType.None`，共享数据只经服务端命令与 PR 合并改变（Admin D-06、协作契约 C06），它的 Supabase 项目里没有 `rxdb_change`。Admin 接入由 [ADMIN-US-224](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-224-team-database-standard-grants.md) 承接。

## 现状

1. **授权快照不要求日志同步。** [`RxDBGrants`](../../../packages/rxdb/src/grants/grants.ts) 的远端来源是实例配置的 `sync.remote.adapter`，只要它实现 `callerGrants()`；连接时由 `refreshOnConnect()` 读一次。身份核对只要 `callerIdentity()`，后者不发 RPC。
2. **连接却总按日志同步的需要来。** [`RxDBAdapterSupabase.connect()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 先做 RLS 自检，再建实时频道：
   - 自检的默认表固定含两张日志表（[`resolveRlsCheckTables()`](../../../packages/rxdb-adapter-supabase/src/supabase.rls.ts)）：

     ```ts
     { schema: 'public', table: 'rxdb_change' },
     { schema: 'public', table: 'rxdb_branch' },
     ```

   - `#createRealtimeChannels()` 对登录身份总是订阅 `rxdb:changes`，并调 `getCallerBuckets()`（`rxdb_caller_buckets()`）订阅各分区的频道，不看有没有实体在用日志同步。
3. **后果。** 在没有日志同步 SQL 的项目上，每次连接都有一条自检失败告警与一次失败的分区查询；变更频道的私有主题没有对应的 `realtime.messages` 策略时，订阅失败走 `#followRealtimeStatus()` → `#scheduleRealtimeReconnect()` 按指数退避重连，每次留一条错误与一条告警。应用要么关掉自检（`rlsCheck: false`）并忍受频道告警，要么把 01～04 整套参考 SQL 装进项目——后者顺带带进 `rxdb_mutations` 这类直写入口，与「共享数据没有直写通道」的产品规则相冲突。
4. **最小安装集没有文档。** [授权函数的迁移说明](../../../website/docs/migration/supabase-member-permissions.md) 以已经部署日志同步为前提，讲的是在 04 的默认之上覆盖 `rxdb_caller_grants()`。

## 范围边界

### In Scope

- 实例里没有实体经这个远端走日志同步（`Full` / `Filter` 等）时，`connect()` 不订阅变更频道、不调分区查询；有了再按现状订阅。
- RLS 自检的默认表只取经这个远端同步的实体；没有同步实体时不检查日志表（显式传入的 `tables` 照旧）。
- 同步插件、`backendId()`、拉取与推送仍只在有同步实体时用到；不同步的实例调到它们时给出明确的配置错误，而不是底层 PostgREST 的 404。
- 文档：「只接身份与授权」的最小服务端安装集（只需 `public.rxdb_caller_grants()` 及写策略要用的 `rxdb_caller_scopes()`），以及从应用自己的成员表实现它的写法；与完整安装的差异。

### Out of Scope

- `rxdb:changes` 未分区主题对全部 authenticated 开放的收口（PR #226 评审遗留，owner 另定）。
- 授权函数从哪张成员表读：属于应用；成员与邀请的参考实现见 [US-239](US-239-supabase-team-membership-realtime.md)。
- QueryCache 与只读浏览实体（US-036）：它们照样经远端读，不在「不同步」之列。

## 验收标准

| #   | 前置条件                                                 | 操作                                    | 预期结果                                                                                      | 状态 |
| --- | -------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| 1   | 实例实体全部 `SyncType.None`，有实体声明 `access` 作用域 | 登录后 `connect()`                      | 只调用 `rxdb_caller_grants()`；不订阅任何变更频道、不调 `rxdb_caller_buckets()`、不检查日志表 | ⬜   |
| 2   | 同上，服务端只部署了最小安装集                           | 连接、离线重开、`rxdb.grants.refresh()` | 授权快照来源为 `remote`，离线重开沿用上次快照；控制台没有自检或频道告警                       | ⬜   |
| 3   | 同上，会话换了另一个用户                                 | 下一次碰远端                            | 身份核对照常报 `RxDBIdentityMismatchError`，一个请求都不发（US-035 行为不变）                 | ⬜   |
| 4   | 实例里有走日志同步的实体                                 | 连接、推拉、实时通知                    | 与现状一致：订阅变更与分区频道、自检含日志表；现有真栈用例原样通过                            | ⬜   |
| 5   | 不同步的实例误调同步入口                                 | 调 `pull()` / `push()`                  | 报明确的配置错误，说明实例没有经该远端同步的实体                                              | ⬜   |
| 6   | 按文档在空项目里只部署最小安装集                         | 跑 AC#1～#3 的真栈用例                  | 全部通过；文档列出的对象与用例实际调用的一致                                                  | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐——适配器单测（请求记录断言）、只部署最小安装集的真栈用例与复验命令。

## 技术笔记

- 判定「有没有实体经这个远端走日志同步」与 `resolveRlsCheckTables()` 里 `getSyncConfig(metadata, entitySync)?.remote !== undefined` 同口径，避免两处各算一套。
- 共享的 per-checkout 栈装着全套 SQL，AC#6 的「只部署最小安装集」要单独建一个 schema 或一次性栈，不能改共享栈（它的 live spec 会清 demo 数据）。

## 实现文件

- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` — `connect()` 按需订阅、按需自检
- `packages/rxdb-adapter-supabase/src/supabase.rls.ts` — 默认自检表只取同步实体
- `website/docs/migration/supabase-member-permissions.md` — 最小安装集

## References

- [US-029 按作用域的成员写权限](../core/US-029-rbac-owner-role-permission.md)
- [US-035 每个身份一个本地库](../core/US-035-identity-bound-local-database.md)
- [US-225 日志同步只对已登录身份开放](US-225-supabase-sync-protocol-access-baseline.md)
