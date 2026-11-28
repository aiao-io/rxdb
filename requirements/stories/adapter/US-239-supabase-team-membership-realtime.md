---
id: US-239
title: Supabase 团队成员、邀请与协作实时：邀请绑定已验证邮箱、撤权即时生效、私有频道的业务通知与在线成员
status: Backlog
priority: Low
epic: epic-017-pr-only-team-data
created: 2026-11-28
updated: 2026-11-28
tags: [adapter, supabase, membership, realtime, presence]
---

# 用户故事：Supabase 团队成员、邀请与协作实时

## 作为/我想要/以便

**作为** 做多成员团队应用的开发者
**我想要** 平台提供成员与邀请的参考实现（六项权限的授予与撤回、不能撤掉最后一个管理员、邀请只给已验证的目标邮箱且只能消费一次），以及按团队授权的私有频道（服务端在事务里发业务通知、撤权时广播、频道上能看到谁在线）
**以便** 成员管理与协作实时不必每个应用各写一份，`rxdb_caller_grants()` 也直接从这份成员表派生

## 解锁条件

价值待证（[epic-017](../../epics/epic-017-pr-only-team-data.md#价值待证)）。出现以下任一信号即可提请解锁：

- dev-rxdb-supabase 或其他应用要把「自助加入租户」换成邀请；
- Admin 之外的第二个应用要做在线成员或撤权即时生效。

## 现状

1. **平台的成员管理只在演示 SQL 里。** [`catalog-demo.sql`](../../../apps/dev-rxdb-supabase/supabase/catalog-demo.sql) 的成员表（`permissions text[]`）、自助加入只得 `read`、`demo_set_member_permissions`（要 `manage`、锁租户行、拒绝撤掉最后一个管理员）与 `demo_leave_tenant`；没有邀请。演示的函数是 SECURITY INVOKER、成员能读自己的成员行，[Supabase 适配器文档](../../../website/docs/adapters/supabase.md)写的却是 SECURITY DEFINER 帮助函数、成员表不对客户端授权——两处口径不一。
2. **实时只有日志通知。** 适配器只订阅日志同步的变更通知（`rxdb:changes` 与各分区的主题，由触发器 `rxdb_change_broadcast` 发出）；没有业务事件，也没有在线成员。
3. **Admin 协作包都有。** 邀请（令牌摘要、绑定服务端规范化的已验证邮箱、原子消费、重发即撤销旧版本，Admin C01）、权限代次（撤权使已有批准失效）、私有频道 `collab:<team>:<app>`（`realtime.messages` 上按成员授权，服务端只能经 `admin_private.broadcast()` 发 `changed` / `revoked`）、Presence。成员命令在领域引擎里与批准、合并按同一锁顺序裁决（[`membership.ts`](../../../rxdb-admin-template/packages/collaboration/src/server/membership.ts)）。

## 范围边界

### In Scope

- 成员表与六项权限（`read / edit / comment / review / merge / manage`，epic-015 已采用）的参考 SQL；授予不能超出授予者自己的权限；不能撤掉最后一个 `manage`，最后一个管理员不能退出。
- `rxdb_caller_grants()` / `rxdb_caller_scopes()` 从这份成员表派生，替换演示里的覆盖；统一函数的安全上下文与成员表的客户端授权口径。
- 邀请：创建、重发、撤销、接受；只有服务端确认的已验证邮箱与邀请目标一致的登录用户才能接受，一次性消费。
- 私有频道：按分区授权订阅；服务端发业务事件（载荷只含修订号、类别与 ID）；撤权广播；在线成员（Presence）。
- 框架无关的订阅接口，Angular / React / Vue 用各自现有的订阅方式接。

### Out of Scope

- 自助创建团队与组织层级。
- 邮件投递本身（用 Supabase Auth 的邮件模板）。
- 与 [US-322](../collaboration/US-322-pr-only-write-mode.md) 的锁顺序整合（随 US-322 定）。

## 验收标准

| #   | 前置条件                    | 操作                          | 预期结果                                                              | 状态 |
| --- | --------------------------- | ----------------------------- | --------------------------------------------------------------------- | ---- |
| 1   | 成员只有 `read` 与 `manage` | 给别人授予 `edit`             | 拒绝：不能授予自己没有的权限                                          | ⬜   |
| 2   | 团队只剩一个 `manage`       | 撤掉他的 `manage`，或他退出   | 都被拒绝                                                              | ⬜   |
| 3   | 邀请目标是 x@a.com          | 用 y@a.com 或未验证的邮箱接受 | 拒绝且不消耗邀请；x@a.com 接受后成为成员，重复接受返回原结果          | ⬜   |
| 4   | 邀请被重发                  | 用旧链接接受                  | 拒绝                                                                  | ⬜   |
| 5   | 成员被撤权                  | 观察该成员的频道与授权快照    | 撤权事件到达他的客户端；下一次 `rxdb.grants.refresh()` 不再含该作用域 | ⬜   |
| 6   | 两个成员在同一团队频道      | 其中一个打开某条记录          | 另一个看到他在线与所看的记录；断线后在超时内消失                      | ⬜   |
| 7   | 非成员                      | 订阅团队频道                  | 订阅被拒                                                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- 网络中断（没有 FIN）时，在线成员由 Realtime 空闲超时移除；Admin 本机实测约 59 秒（ADMIN-US-219），AC#6 的「超时」按这一量级定。
- `rxdb:changes` 未分区主题对全部 authenticated 开放的收口不在本故事；若决定按分区收口，可以复用本故事的频道授权写法。

## References

- [US-234 Supabase 租户内成员权限](US-234-supabase-tenant-member-permissions.md)
- [Admin 协作契约 C01](../../../rxdb-admin-template/requirements/collaboration-contract.md)
- [ADMIN-US-219 协作读取、实时与身份校验改用 Supabase 原生能力](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md)
