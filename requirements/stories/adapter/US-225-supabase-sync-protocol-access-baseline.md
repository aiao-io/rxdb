---
id: US-225
title: Supabase 日志同步只对已登录身份开放，非 main 分支按所有者写入
status: Done
priority: High
epic: epic-004-future-features
created: 2026-11-19
updated: 2026-11-19
tags: [adapter, supabase, sync, security, rls, realtime]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动 Supabase 参考 SQL、适配器的实时订阅、测试身份与 demo 登录；不改核心公开 API
- [x] Negotiable (可协商): 已登录用户之间的行级隔离、存在性信号、协作分支留给 epic-015
- [x] Valuable (有价值): 拿前端公开的 anon key 就能读全部日志、实时收到每条变更的完整行、往任何人的分支写入变更
- [x] Estimable (可估算): 参考 SQL 三个文件 + 适配器实时订阅 + 测试身份迁移 + demo 匿名登录
- [x] Small (小): 一个 PR
- [x] Testable (可测试): SQL 回归套件按角色断言；适配器真栈测试以 authenticated 身份全量回归
-->

# 用户故事：Supabase 日志同步的访问底线

## 作为/我想要/以便

**作为** 用 Supabase 适配器部署日志同步（`SyncType.Full` / `SyncType.Filter`）的开发者
**我想要** 变更日志、分支登记、实时通知与推送入口只对已登录身份开放，非 main 分支只能由所有者写入
**以便** 拿着随前端发布的 anon key 读不到任何同步数据，别人也不能往我的分支注入变更；文档写清日志同步适用于哪类数据

## 修复前症状（`258856694`）

1. **anon 可读全部日志。** [`rxdb-change-grants.sql`](../../../docker/sql/production/rxdb-change-grants.sql) 保留读权限，表本身也没开 RLS：

   ```sql
   GRANT SELECT ON public.rxdb_change TO anon, authenticated;
   ```

   [`rxdb_pull_changes`](../../../docker/sql/02-rxdb-sync-functions.sql) 是 `SECURITY INVOKER`，`p_filter` 由客户端传、可以不传，快照不完整的日志直接放行（`OR NOT change."snapshotComplete"`）。anon key 本来就打在前端包里，等于日志全文（含 `beforeData` / `afterData`）对外公开。

2. **实时通知带完整行。** [`RxDBAdapterSupabase.#createRealtimeChannel()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 订阅的是日志表本身：

   ```ts
   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rxdb_change' }, payload =>
   ```

   `rxdb_change` 在 `supabase_realtime` 发布里、没有 RLS，每条变更连同 `patch` 推给所有订阅者。

3. **分支无主。** [`rxdb_enable_sync_for_branch`](../../../docker/sql/02-rxdb-sync-functions.sql) 是 `SECURITY DEFINER`，授给了 anon / authenticated，任何客户端都能登记或改写任意分支 ID；生产授权脚本也没有收回 `rxdb_branch` 的直写（`01-rxdb-system-tables.sql` 对两个角色 `GRANT ALL`）。[`rxdb_mutations`](../../../docker/sql/04-rxdb-utils-functions.sql) 对非 main 日志不做业务写：

   ```text
   4. 经 rxdb_insert_changes（SECURITY DEFINER）写 rxdb_change：按 p_changes 原顺序，只写 applied 实体的 main 日志与全部非 main 日志
   ```

   因此非 main 推送不过任何业务表 RLS：任何人都能往别人的分支写入任意 `afterData`，分支主人拉取后照单物化。

4. **anon 可直接调用存在性探针。** [`rxdb_existing_ids`](../../../docker/sql/04-rxdb-utils-functions.sql) 带 `SET row_security = off`，授给了 anon / authenticated，可以跨租户判断某个主键是否存在。

## 范围边界

### In Scope

- **anon 退出日志同步协议**（生产授权脚本）：收回 anon 对 `rxdb_change`、`rxdb_branch` 的读取；收回 anon 与 `PUBLIC` 对日志协议 RPC 的执行权，包括拉取、推送（`rxdb_mutations` 及其内部函数）、分支登记和存在性探针。保留连接时调用的 `rxdb_server_version`、`rxdb_backend_id`、`rxdb_check_rls`；anon 仍可按业务表自己的 GRANT 与 RLS 直接读写。
- **非 main 分支按所有者写入**：新表 `rxdb_branch_owner` 记录每个非 main 分支的所有者（`auth.uid()`）。第一个登记或推送该分支的已登录用户认领它，之后只有所有者能登记、改写或往它推送日志；收回客户端对 `rxdb_branch` 的直写。已有日志或登记、却没有所有者的旧分支拒绝写入，文档给出补登所有者的 SQL。
- **实时通知不带行内容**：`rxdb_change` 移出 `supabase_realtime` 发布，改由日志插入触发器经 `realtime.send` 向私有频道发元数据（`namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId`、`createdAt`），不含 `patch` / `inversePatch` / `beforeData` / `afterData`；频道只对 authenticated 开放。适配器改订阅该频道，派发的远端事件只带 `id`。
- **测试与 demo 改用已登录身份**：适配器真栈测试以测试栈的 JWT 密钥签发 authenticated 令牌；`dev-rxdb-supabase` 没有会话时匿名登录（Supabase 匿名用户的数据库角色是 authenticated）。
- **文档**：`website/docs/adapters/supabase.md` 写明生产权限模型与适用边界。

### Out of Scope

以下留给 [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)：

- **已登录用户之间的隔离**：日志仍对全部 authenticated 可读，只适用于所有登录者可见范围一致的数据。开放注册或开启匿名登录的部署，等于把日志开放给任何访客。
- **存在性信号**：推送对「被 RLS 拒绝」与「已不存在」分别报 `42501` / `RX001`（[US-218](US-218-supabase-rls-push-integrity.md) AC#2、[US-223](US-223-supabase-mutations-update-semantics.md)），已登录用户能借此判断某个 id 是否存在。要等读授权落地，与「不可见即不存在」一起改；在此之前单独封堵已登录用户对 `rxdb_existing_ids` 的直接调用没有收益。
- **多人共享同一分支**：本故事按所有者独占写入，协作分支的授权随 epic-015 定。

## 验收标准

| #   | 前置条件                                               | 操作                                                                                                        | 预期结果                                                                                                             | 状态 |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 按生产指引部署（`01`～`04` + 生产授权脚本）            | anon 直接 SELECT `rxdb_change`、`rxdb_branch`，调用 `rxdb_pull_changes`                                     | 权限拒绝（42501），不返回任何日志或分支                                                                              | ✅   |
| 2   | 同上                                                   | authenticated 调用 `rxdb_pull_changes`、读取 `rxdb_branch`                                                  | 正常返回                                                                                                             | ✅   |
| 3   | 同上                                                   | anon 调用 `rxdb_mutations`（main 与非 main 日志各一次）、`rxdb_existing_ids`、`rxdb_enable_sync_for_branch` | 权限拒绝；业务表、日志、分支表都不变                                                                                 | ✅   |
| 4   | 同上                                                   | anon 调用 `rxdb_server_version`、`rxdb_backend_id`、`rxdb_check_rls`，并按业务表 RLS 直接读写               | 照常可用                                                                                                             | ✅   |
| 5   | 用户 A 已登录，分支 `feature-a` 从未出现过             | A 登记 `feature-a` 并推送它的非 main 日志；另一个从未登记的祖先分支随同一次推送上行                         | 写入成功；两个分支的所有者都是 A 的 `auth.uid()`                                                                     | ✅   |
| 6   | `feature-a` 属于 A                                     | 用户 B 登记同名分支，或推送 `feature-a` 的非 main 日志                                                      | 42501；日志、分支表与所有者表都不变                                                                                  | ✅   |
| 7   | 已登录用户                                             | 推送已有日志或登记、却没有所有者的旧分支                                                                    | 42501，提示补登所有者，不写日志                                                                                      | ✅   |
| 8   | 生产授权脚本已执行                                     | authenticated 直接 INSERT / UPDATE / DELETE `rxdb_branch`，读写 `rxdb_branch_owner`                         | 权限拒绝                                                                                                             | ✅   |
| 9   | 按生产指引部署                                         | 查询 `supabase_realtime` 发布的表                                                                           | 不含 `rxdb_change`                                                                                                   | ✅   |
| 10  | authenticated 订阅私有频道                             | 另一个客户端推送一条变更                                                                                    | 收到一条通知，载荷只有元数据，没有 `patch` / `inversePatch` / `beforeData` / `afterData`                             | ✅   |
| 11  | anon 订阅同一私有频道                                  | 另一个客户端推送一条变更                                                                                    | 订阅被拒，收不到通知                                                                                                 | ✅   |
| 12  | 适配器已连接并订阅                                     | 另一个客户端推送当前分支的变更                                                                              | 本端可拉取计数增加，拉取后数据一致（原有实时用例在新通知上回归）                                                     | ✅   |
| 13  | 适配器真栈测试                                         | 以 authenticated 身份全量运行                                                                               | 全部通过                                                                                                             | ✅   |
| 14  | `dev-rxdb-supabase` 首次打开，没有会话                 | 启动应用                                                                                                    | 自动匿名登录后完成同步；e2e 通过                                                                                     | ✅   |
| 15  | `website/docs/adapters/supabase.md`                    | 阅读                                                                                                        | 写明 anon 不参与日志同步、日志对全部登录者可见的适用边界、分支所有者与旧分支补登、实时通知不带内容、已知的存在性信号 | ✅   |
| 16  | 生产授权脚本已执行过                                   | 再执行一次                                                                                                  | 幂等，权限与发布结果不变                                                                                             | ✅   |
| 17  | 客户端没有登录会话（令牌是 anon key、不是 JWT 或没有） | `rxdb.connect('supabase')`                                                                                  | 不订阅通知频道、不按退避重试，只提示一次；登录后再 `connect()` 才订阅；service_role 令牌照常订阅                     | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

| AC      | 证据                                                                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1～#4  | SQL 回归 `anon-sync-protocol`（`test_anon_sync_protocol` + `_verify`）、`branch-ownership` 里 authenticated 的拉取与读分支                                                                                                                                                                                 |
| #5～#8  | SQL 回归 `branch-ownership`（`test_branch_ownership`，`seed_legacy_branches` 造旧分支）；`production-change-grants` 的非 main 推送随首写认领                                                                                                                                                               |
| #9、#10 | SQL 回归 `realtime-notifications`（发布成员、通知载荷的键集合、不含行内容、通知聚合）；真栈 `realtime-notifications.spec.ts`「已登录的订阅者收到只带元数据的通知」                                                                                                                      |
| #11     | 同一真栈用例：anon 订阅状态不是 `SUBSCRIBED`、收不到通知；SQL 层 `visible_change_notifications()` 对 anon 为 0                                                                                                                                                                                             |
| #12     | 真栈 `realtime-notifications.spec.ts`「另一台设备推送后可拉取计数增加，拉取后本地数据一致」；`handle-supabase-change.spec.ts` 的处理器测试                                                                                                                                                              |
| #13     | `nx test rxdb-adapter-supabase` 全部通过，语句 96.77% / 分支 89.82% / 函数 98.36% / 行 97.79%                                                                                                                                                                                            |
| #14     | `dev-rxdb-supabase` 单测全部通过（含 `supabase-session.spec.ts`）；对隔离栈直跑 `remote-sync.spec.ts` 全部通过（两个浏览器上下文是两个匿名用户）                                                                                                                                                         |
| #15     | `website/docs/adapters/supabase.md` 的「日志同步只对已登录身份开放」「适用边界」「非 main 分支按所有者写入」「从旧版本升级」「实时同步」与两处已知限制                                                                                                                                                     |
| #16     | SQL 回归的生产段落连续执行两次生产权限脚本，`production-grants-idempotent` 断言策略、触发器各一份且权限符合生产模型                                                                                                                                                                                        |
| #17     | `review-regressions.spec.ts`「change notifications need a signed-in session」：anon 令牌、新式 publishable key、非 JSON 载荷、无令牌四种都不订阅且 10 秒内不重试，登录后再连接才订阅，service_role 照常订阅；真栈 `realtime-notifications.spec.ts`「只拿 anon key 的适配器连接时不订阅通知，也不反复重试」 |

## 验证记录

隔离测试栈（`nx run rxdb-adapter-supabase:test-env`）：

- 红：新用例先在旧版 01～04 上运行，套件准备段因缺 `rxdb_branch_owner` 整体失败；加载新版 01、02、04 与生产权限脚本后 `sql-security-regressions` 与单事务汇总全过。
- 迁移中暴露并修正的依赖：`branch-search-path` 与 `pagination-truncation`（SUPA-005）原先以客户端身份直写 `rxdb_branch` 造数据，改走 service_role；三个桩客户端补 `realtime.setAuth`。
- 经 HTTP 复核：anon key 调 `rxdb_pull_changes` 得 `42501 permission denied for function rxdb_pull_changes`；匿名注册拿到的令牌是 `role=authenticated`、`is_anonymous=true`。
- 订阅私有频道必须先 `realtime.setAuth()`：不调用时 Realtime 日志里的令牌是 anon key 本身（`iss=supabase-demo`），已登录客户端也被拒。

## 技术笔记

- **为什么连推送一起收回 anon**：推送对「被拒绝」与「已不存在」的区分本身就是存在性探针——`rxdb_execute_batch_update` 与 `rxdb_mutations_apply_group` 在零行时都会调用 `rxdb_existing_ids`，二者都可以经 PostgREST 直接调用。只收探针、留着推送，等于没收。
- **`PUBLIC` 默认有函数执行权**：Postgres 建函数时默认授 `EXECUTE` 给 `PUBLIC`，`03-business-tables.sql` 还对 anon 授了 public schema 的全部函数；收回时要 `FROM PUBLIC, anon`，再显式授给 authenticated。
- **匿名登录的含义**：Supabase 匿名用户拿到的是 authenticated 角色。部署开启匿名登录，就等于任何访客都能读日志；demo 这样做是因为它的数据本来公开。
- **为什么是「首个写入者认领」而不是「先登记才能推」**：`push()` 只登记当前分支（`pushBranch`），祖先分支的变更随同一次推送上行，从未单独登记（`push-ancestor-branches.spec.ts` 的 main → release → feature 用例）。要求先登记会打破这条既有语义。所有者单独存表，不在 `rxdb_branch` 造占位行，免得 `syncBranches` 把缺父分支的占位行当成拓扑错误。
- **校验放在写日志的唯一入口**：非 main 日志只经 `rxdb_insert_changes` 落库（`SECURITY DEFINER`，只接受 `rxdb_mutations` 的调用），所有者校验放在这里，再加上 `rxdb_enable_sync_for_branch`，覆盖全部非 main 写入。
- **通知按语句聚合**：`realtime.send` 每次调用都开一个子事务并吞掉错误（只发 WARNING）。按行触发时一次推 1000 条就有 1000 个子事务，超过 64 个会让快照子事务溢出、拖慢并发查询；所以用语句级触发器，每 200 条变更聚合成一条通知。通知在推送事务内发出，事务回滚就不会发。广播触发器函数是 `SECURITY DEFINER`：`realtime` schema 的使用权只属于 Supabase 内置角色，不能转授给自定义角色。
- **远端事件只带 `id`**：远端实体事件只被 sync 插件用来累计可拉取条数（`setupSyncListeners` 按分支过滤，不读载荷），`QueryManager` 不监听远端事件，所以去掉载荷不影响同步结果；devtools 面板看到的远端事件不再带字段。

## 实现文件

- `docker/sql/01-rxdb-system-tables.sql`、`docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql` — 分支所有者列与校验、实时广播触发器
- `docker/sql/production/rxdb-change-grants.sql` — anon 退出日志协议、收回分支表直写、私有频道授权、移出实时发布
- `packages/rxdb-adapter-supabase/src/` — 订阅私有频道、处理不带内容的通知
- `packages/rxdb-adapter-supabase/src/__tests__/` — SQL 回归用例、以 authenticated 身份运行的真栈测试
- `apps/dev-rxdb-supabase/` — 无会话时匿名登录
- `website/docs/adapters/supabase.md` — 生产权限模型与适用边界

## References

- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)
- [US-218 RLS 下的推送完整性](US-218-supabase-rls-push-integrity.md) — Out of Scope 写明「拉取侧过滤与按租户水位」不在其范围
