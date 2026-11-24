---
id: US-226
title: Supabase 待拉数按记录计：一个事务一条
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-11-24
updated: 2026-11-24
tags: [adapter, supabase, sync, pull, realtime, sql]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 本地待推数已按记录计（见「现状」），本故事只补远端与拉取这一半
- [x] Negotiable (可协商): 远端计数走新 RPC 还是 PostgREST 聚合、旧服务端怎么处理，留待实现前定
- [x] Valuable (有价值): 一次批量操作在对端显示 1 条待拉记录，与操作历史、待推数同一口径
- [x] Estimable (可估算): 参考 SQL 两处 + 计数 RPC + 生产升级脚本 + 适配器推送载荷 / 通知解析 / 计数 + 同步插件累计与结算
- [ ] Small (小): 跨 SQL、适配器与同步插件三层，一个 PR 偏大
- [x] Testable (可测试): 真栈两个客户端对照，SQL 回归断言日志行的 transactionId
-->

# 用户故事：Supabase 待拉数按记录计

## 作为/我想要/以便

**作为** 在多个客户端之间做日志同步（`SyncType.Full` / `SyncType.Filter`）的用户
**我想要** 对端的待拉数（Pull 徽标）按记录计：一个事务一条，不在事务里的变更各一条
**以便** 一次批量添加 10 条在对端显示 1 条待拉记录，与本端的待推数、操作历史同一口径

## 现状

本地一侧已经按记录计。[`countRxDBChangeRecords`](../../../packages/rxdb/src/sync-contract/change-records.ts) 把待推变更分成「不在事务里的」与「按 `transactionId` 分组」两次数，历史插件的 [`updatePushableCount`](../../../packages/rxdb-plugin-history/src/undo-redo-apply.ts) 与同步插件的 `calculatePushableCount`（[`get-repository-sync-status.ts`](../../../packages/rxdb-plugin-sync/src/get-repository-sync-status.ts)）都用它；`count({ groupBy })` 由 [`count_sql`](../../../packages/rxdb-adapter-sqlite-core/src/query/count_sql.ts) 与 PGlite 的 [`generate_count_sql`](../../../packages/rxdb-adapter-pglite/src/query/query_sql.ts) 执行。dev-rxdb-supabase 的 Todo 页批量添加 10 条，Push 显示 1。

远端一侧按行计，三处都拿不到事务：

1. **日志不记事务。** `rxdb_change` 有 `"transactionId" uuid` 列（[`01-rxdb-system-tables.sql`](../../../docker/sql/01-rxdb-system-tables.sql)），但写日志的唯一入口 [`rxdb_insert_changes`](../../../docker/sql/04-rxdb-utils-functions.sql) 的列清单里没有它：

   ```sql
   INSERT INTO public.rxdb_change (
     namespace, entity, bucket, "entityId", type, patch, "inversePatch",
     "branchId", "clientId", "localId", "createdAt", "updatedAt",
   ```

   推送载荷也不带：[`build_merge_changes_payload`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 给 `p_changes` 的每条只有 `namespace`、`entity`、`entityId`、`type`、`branchId`、`patch`、`inversePatch`、`clientId`、`localId`、`createdAt`、`updatedAt`。

2. **实时通知不带事务。** [`rxdb_change_broadcast`](../../../docker/sql/02-rxdb-sync-functions.sql) 的载荷只有 `namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId`、`createdAt`、`bucket`；同步插件收到通知按条累加（[`sync-listeners.ts`](../../../packages/rxdb-plugin-sync/src/sync-listeners.ts) 的 `sm.history.incrementPullableCount(count)`）。

3. **重算按行数。** 订阅恢复后按水位线重算，走适配器的 [`getChangeCount`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)，是 PostgREST 的行计数：

   ```ts
   let query = this.#client.from('rxdb_change').select('id', { count: 'exact' }).gt('id', sinceId).is('bucket', null);
   ```

   PostgREST 默认不开聚合，数不了 `COUNT(DISTINCT "transactionId")`。

复验方式：上面的符号逐个 grep；dev-rxdb-supabase 两个浏览器以登录身份打开 Todo 页，一边批量添加 10 条并推送，另一边 Pull 徽标加 10。

## 范围边界

### In Scope

- 推送载荷带上本地变更的 `transactionId`，`rxdb_insert_changes` 校验它是 uuid 并落库。
- `rxdb_change_broadcast` 的载荷带 `transactionId`；适配器解析后交给远端事件。
- 远端按记录计数的入口，与 `getChangeCount` 同口径（水位线、分支、`bucket IS NULL`、仓库过滤），供重算使用。
- 同步插件：实时累加按 `transactionId` 去重（同一结算窗口内同一事务只计一次，事务可能跨多条广播），拉取结算按记录数扣减。
- 生产升级脚本（`docker/sql/production/`）与迁移文档；`RepositorySyncStatus.pullableCount`、`pullableCount$` 的文档改为记录数。
- dev-rxdb-supabase：对端批量添加 10 条并推送后，本端 Pull 徽标显示 1。

### Out of Scope

- 本地待推数（已按记录计，见「现状」）。
- HTTP 适配器：没有 changelog（`getChangeCount` 抛 `HttpChangelogUnsupportedError`），不涉及待拉数。
- 直接写业务表产生的日志（触发器写入，没有客户端事务）：照旧各算一条，不为它们合成事务。

## 验收标准

| #   | 前置条件                               | 操作                                         | 预期结果                                                          | 状态 |
| --- | -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- | ---- |
| 1   | 客户端 A 以登录身份连着远端            | `saveMany` 写 10 条并推送                    | 远端 `rxdb_change` 新增 10 行，`transactionId` 相同且等于本地事务 | ⬜   |
| 2   | 客户端 B 以登录身份订阅着实时通知      | A 完成 AC#1 的推送                           | B 的 `pullableCount$` 加 1                                        | ⬜   |
| 3   | 同 AC#2，事务超过一条广播（200 条）    | A 一个事务写 500 条并推送                    | B 的 `pullableCount$` 只加 1                                      | ⬜   |
| 4   | B 未订阅期间 A 推送了 AC#1 的批次      | B 重新订阅、按水位线重算                     | B 的 `pullableCount$` 为 1                                        | ⬜   |
| 5   | A 推送了 3 条不在事务里的单条变更      | B 收到通知                                   | B 的 `pullableCount$` 加 3                                        | ⬜   |
| 6   | 服务端直接写业务表（触发器记日志）     | B 收到通知                                   | 每条日志各算一条                                                  | ⬜   |
| 7   | B 待拉 2 条记录                        | B 拉取完整                                   | `pullableCount$` 归零                                             | ⬜   |
| 8   | 推送载荷里 `transactionId` 不是 uuid   | 调 `rxdb_mutations`                          | 整批拒绝（22P02），日志一行不写                                   | ⬜   |
| 9   | dev-rxdb-supabase 两个浏览器以登录身份 | 一边批量添加 10 条并推送，另一边看 Pull 徽标 | 显示 1                                                            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1、#8 由 SQL 回归套件（`rxdb-adapter-supabase:sql-security-regressions`）断言；AC#2～#7 由适配器真栈测试覆盖；AC#9 由 dev-rxdb-supabase-e2e 覆盖。

## 技术笔记

- **待澄清：旧服务端。** 新客户端连没跑升级脚本的服务端时，计数入口不存在。是按 `rxdb_server_version` 门控、在旧服务端上仍按行计，还是连接时报错要求升级，实现前定。
- **事务跨广播。** 广播按 bucket 每 200 条聚合一条（`rxdb_change_broadcast` 的 `/ 200 AS batch`），一个大事务会分成多条广播，去重不能只在单条广播内做。
- **计数入口。** 候选是新 RPC（`SECURITY INVOKER`，与 `getChangeCount` 同口径的过滤 + `COUNT(DISTINCT COALESCE("transactionId"::text, id::text))`）；PostgREST 聚合需要部署方开 `db-aggregates-enabled`，不能作为默认路径。
- **观察（未复验根因）：** dev-rxdb-supabase 里推送 10 条之后重新加载，本端的待拉数多出 10，疑似重算把本端自己推送的日志也数了进去。实现时一并核对 `getChangeCount` 的过滤。

## 实现文件

- `docker/sql/02-rxdb-sync-functions.sql` — 广播载荷、计数入口
- `docker/sql/04-rxdb-utils-functions.sql` — `rxdb_insert_changes` 落库 `transactionId`
- `docker/sql/production/` — 升级脚本
- `packages/rxdb-adapter-supabase/` — 推送载荷、通知解析、记录计数
- `packages/rxdb-plugin-sync/` — 实时累加去重、拉取结算
- `packages/rxdb-plugin-history/` — `pullableCount$` 的结算口径
- `apps/dev-rxdb-supabase/`、`apps/dev-rxdb-supabase-e2e/` — demo 与端到端验收

## References

- [US-225 Supabase 日志同步的访问底线](./US-225-supabase-sync-protocol-access-baseline.md) — 实时通知只带元数据的来由
