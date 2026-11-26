---
id: US-233
title: Supabase 待拉数与能拉的对不上：刷新后把自己推的算进去，分区按变更号差计
status: Backlog
priority: High
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-26
tags: [adapter, supabase, sync, pull, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改待拉数的重算口径；拉取本身、实时通知与 US-226 的按事务计数互不依赖
- [x] Negotiable (可协商): 分区计数走新 RPC 还是扩现有 RPC 留待实现时定；「只数别人的、只数本实体本区的」已定
- [x] Valuable (有价值): 推送之后刷新，Todo 页的拉取徽标从 0 跳到 75，点了拉取什么也没变
- [x] Estimable (可估算): 适配器的重算过滤自己 + 分区按真实条数 + SQL 回归 + 两个浏览器的真栈用例
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 适配器单测 + SQL 回归 + 远端 e2e
-->

# 用户故事：待拉数与能拉的对不上

## 作为/我想要/以便

**作为** 在 dev-rxdb-supabase 里推送、拉取的登录用户
**我想要** 拉取上的数字只数「远端有、我还没拉、而且不是我自己推上去」的变更，按区同步的实体按真实条数数
**以便** 看到数字就知道拉取会带来什么，不会推完一刷新，徽标就冒出一个拉了也没变化的大数

## 现状

1. 实时通知跳过自己推的变更（[`handle_supabase_change.ts`](../../../packages/rxdb-adapter-supabase/src/handle_supabase_change.ts)）：

   ```ts
   if (myClientId && notice.clientId === myClientId) return undefined;
   ```

   所以推送之后、不刷新，待拉数不变。

2. 刷新之后，订阅恢复时按水位线重算，走 [`getChangeCount`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)，不排除自己推的：

   ```ts
   let query = this.#client.from('rxdb_change').select('id', { count: 'exact' }).gt('id', sinceId).is('bucket', null);
   ```

   推送不推进本地的拉取游标，自己刚推上去的变更在游标之后，于是被当成待拉。真拉下来时 [`pull-round.ts`](../../../packages/rxdb-plugin-sync/src/pull-round.ts) 按 `clientId` 认出是自己的，只回填 `remoteId`、不落库——数字归零，数据不动。

3. 按区同步的实体按变更号差计数，见 [`checkRepositoryUpdates`](../../../packages/rxdb-plugin-sync/src/check-repository-updates.ts)：

   ```ts
   pendingCount += progress?.snapshotComplete ? Math.max(1, remotePoint - progress.cursor) : 1;
   ```

   `remotePoint` 与 `cursor` 都是全库共用的 `rxdb_change.id`，两者之差把这期间所有实体、所有区的变更都算了进来。

复验方式（dev 栈，Alice）：订单页新建一位客户、商品页新建一件商品，都不推送；到 Todo 页点「推送」，两条一起推上去。刷新页面，Todo 页拉取徽标显示 75。`syncManager.checkRepositoryUpdates('public', 'CatalogItem')` 返回 `remoteLatestChangeId` 142、`localLastPullRemoteChangeId` 68、`pendingCount` 74；库里 `rxdb_change` 在 (68, 142] 区间商品只有 1 条（就是刚推的那条），全库共 74 条。`DemoCustomer` 的待拉 1 条是刚推的客户。点「拉取」后归 0，Todo 一条没变。

## 范围边界

### In Scope

- 刷新后的重算排除本客户端推上去的变更，与实时通知同一口径；远端直写（`clientId` 为空，如「模拟服务端变更」）照样计入。
- 按区同步的实体按真实条数数：只数这个实体、这个身份能读的区里、游标之后、不是自己推的变更。
- 两处修完，同一场景下「推送后不刷新」与「推送后刷新」的待拉数相同。
- SQL 回归、适配器单测、两个浏览器的远端 e2e。

### Out of Scope

- 按事务计数（一个事务算一条）：[US-226](US-226-supabase-pull-count-records.md) 的范围；两条都改 `getChangeCount`，先落地的一方改，后落地的一方在它上面接着改。
- 推送时顺带推进拉取游标：游标之前可能还有别人的变更没拉，推进会把它们跳过。

## 验收标准

| #   | 前置条件                                             | 操作                           | 预期结果                                                     | 状态 |
| --- | ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ | ---- |
| 1   | Alice 本机新建一位客户、一件商品并推送；没有别人在写 | 刷新页面                       | 待拉数为 0                                                   | ⬜   |
| 2   | Bob 在 Alice 所在的租户区里改了一件商品              | Alice 刷新页面                 | 商品的待拉是 1，不是两次变更号之差；拉取后归 0、改动落进本机 | ⬜   |
| 3   | Bob 推送了一条 Todo                                  | Alice 刷新前后各看一次         | 刷新前（实时通知）与刷新后（重算）都是 1                     | ⬜   |
| 4   | Alice 在「模拟服务端变更」里直写远端一件商品         | Alice 刷新页面                 | 计入待拉（直写的 `clientId` 为空，不是本客户端推的）         | ⬜   |
| 5   | —                                                    | 适配器单测、SQL 回归、远端 e2e | 通过                                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（实现时补齐，验证层级与 AC 一致）：

- AC#1～#4：`apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts`、`catalog-sync.spec.ts` 新增用例（两个浏览器上下文）；按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。
- AC#5：适配器里只跑本故事新增的 mock 单测与单个真栈 spec，不跑整个 `rxdb-adapter-supabase:test`（它会清掉 demo 数据）；SQL 回归按 `docker/sql` 的回归入口单跑新增用例。

## 技术笔记

- 排除自己：`clientId` 可能为空（远端直写），SQL 里 `"clientId" <> $me` 会把空值一并滤掉，要写成 `"clientId" IS NULL OR "clientId" <> $me`（PostgREST 里是 `or=(clientId.is.null,clientId.neq.<me>)`）。
- 分区计数：现有 `rxdb_bucket_snapshot_point` 只给区里最新的变更号，数不出条数；加一个按区、实体、游标与排除的客户端计数的 RPC，或让 `rxdb_pull_bucket_changes` 支持只返回条数。权限与现有分区 RPC 一样走 `SECURITY INVOKER` 与 `rxdb_caller_buckets()`。
- 快照没拉完（`snapshotComplete` 为假）时仍按 1 计，表示「这个区要补快照」，与现在一致。

## 实现文件

- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` — `getChangeCount` 排除本客户端
- `packages/rxdb-plugin-sync/src/check-repository-updates.ts` — 分区按真实条数
- `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/production/` — 分区计数 RPC 与授权
- `apps/dev-rxdb-supabase-e2e/src/` — 真栈用例

## References

- 顶栏的拉取徽标依赖它：[US-230](US-230-supabase-header-sync.md) 阶段 B；整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-226 待拉数按记录计](US-226-supabase-pull-count-records.md)、[US-033 按授权分区同步](../core/US-033-identity-scoped-read-sync.md)
