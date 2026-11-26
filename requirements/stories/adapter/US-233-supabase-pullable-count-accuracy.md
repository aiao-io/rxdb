---
id: US-233
title: Supabase 待拉数与能拉的对不上：刷新后把自己推的算进去，分区按变更号差计
status: In Review
priority: High
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-27
tags: [adapter, supabase, sync, pull, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改待拉数的重算口径；拉取本身、实时通知与 US-226 的按事务计数互不依赖
- [x] Negotiable (可协商): 分区计数直接数 `rxdb_change`（表上的 RLS 只放行可读分区），不另加 RPC；「只数别人的、只数本实体本区的」已定
- [x] Valuable (有价值): 推送之后刷新，Todo 页的拉取徽标从 0 跳到 75，点了拉取什么也没变
- [x] Estimable (可估算): 重算减掉本库推上去的 + 分区按真实条数 + 重算与拉取并发时作废重算 + 真栈用例
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 同步插件与适配器单测 + 远端 e2e
-->

# 用户故事：待拉数与能拉的对不上

## 作为/我想要/以便

**作为** 在 dev-rxdb-supabase 里推送、拉取的登录用户
**我想要** 拉取上的数字只数「远端有、我还没拉、而且不是我自己推上去」的变更，按区同步的实体按真实条数数
**以便** 看到数字就知道拉取会带来什么，不会推完一刷新，徽标就冒出一个拉了也没变化的大数

## 背景

dev 栈实测（Alice）：订单页新建一位客户、商品页新建一件商品，到 Todo 页点「推送」，两条一起推上去；刷新页面，Todo 页拉取徽标显示 75，
点了拉取 Todo 一条没变、徽标归 0。数字从三处来：

1. 实时通知跳过本实例推的变更（[`handle_supabase_change.ts`](../../../packages/rxdb-adapter-supabase/src/handle_supabase_change.ts)
   按 `clientId` 认），所以推送之后、不刷新，待拉数不变。
2. 刷新之后订阅恢复，按水位线重算（[`getChangeCount`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)）。推送不推进本地的拉取游标，
   自己推上去的变更在游标之后，被当成待拉。按 `clientId` 排除也不行：它是每个 RxDB 实例启动时新生成的，刷新之后上一次会话推的修改带着另一个
   `clientId`。真拉下来时 [`pull-round.ts`](../../../packages/rxdb-plugin-sync/src/pull-round.ts) 同样按 `clientId` 分，把它们当成别人的、幂等地再应用一遍，数据不动。
3. 按区同步的实体曾按变更号差计数（[`checkRepositoryUpdates`](../../../packages/rxdb-plugin-sync/src/check-repository-updates.ts)）：快照点与游标都是全库共用的
   `rxdb_change.id`，两者之差把这期间所有实体、所有区的变更都算了进来。75 里 74 是商品按变更号差算的（实际只有 1 条，就是刚推的那件），1 是刚推的客户。

另有一处并发：登录后立刻点拉取，启动时的重算还在逐个仓库数，拉取先结算成 0；重算按拉取之前的游标数出的数再盖上去，徽标又冒出几条。

## 范围边界

### In Scope

- 刷新后的重算排除本库推上去的变更：按推送回执写下的 `RxDBChange.remoteId` 认，刷新也还在；远端直写（如「模拟服务端变更」）本地没有记录，照样计入。
- 按区同步的实体按真实条数数：只数这个实体、这个身份能读的区里、游标之后、不是本库推的变更。
- 重算期间有一次拉取结算过（或会话重置），这次重算作废、再数一遍，不把按旧游标数出的数盖到刚结算的计数上。
- 修完之后，同一场景下「推送后不刷新」与「推送后刷新」的待拉数相同。
- 同步插件与适配器单测、远端 e2e。

### Out of Scope

- 按事务计数（一个事务算一条）：[US-226](US-226-supabase-pull-count-records.md) 的范围；两条都改 `getChangeCount`，先落地的一方改，后落地的一方在它上面接着改。
- 推送时顺带推进拉取游标：游标之前可能还有别人的变更没拉，推进会把它们跳过。
- 拉取认出上一次会话推的修改：拉取按 `clientId` 分自己的与别人的，刷新之后上一次会话推的会被当成别人的、幂等地再应用一遍（数据不变，结果行的「拉到」里含它们）。
  要让拉取也认得出，需要一个跟着库走而不是跟着实例走的客户端标识；`clientId` 同时是跨标签页网关（`RxDBTabsGateway`）的自消息过滤，
  同一个库的几个标签页必须各不相同，改它要先拆成两个标识，另开编号。
- 实时通知数重了：通知不带日志 id，客户端认不出一条通知描述的变更是否已经拉到；数重时下一次重算（订阅恢复、刷新）校正。

## 验收标准

| #   | 前置条件                                             | 操作                           | 预期结果                                                     | 状态 |
| --- | ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ | ---- |
| 1   | Alice 本机新建一位客户、一件商品并推送；没有别人在写 | 刷新页面                       | 待拉数为 0                                                   | ✅   |
| 2   | Bob 在 Alice 所在的租户区里改了一件商品              | Alice 刷新页面                 | 商品的待拉是 1，不是两次变更号之差；拉取后归 0、改动落进本机 | ✅   |
| 3   | Bob 推送了一条 Todo                                  | Alice 刷新前后各看一次         | 刷新前（实时通知）与刷新后（重算）都是 1                     | ✅   |
| 4   | Alice 在「模拟服务端变更」里直写远端一件商品         | Alice 刷新页面                 | 计入待拉（直写的 `clientId` 为空，不是本客户端推的）         | ✅   |
| 5   | —                                                    | 同步插件与适配器单测、远端 e2e | 通过                                                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

- AC#1、#2、#4：`apps/dev-rxdb-supabase-e2e/src/sync-counts.spec.ts` 的「AC#14、#15」用例——同一个用例里本库推上去两条（商品、客户）、「模拟服务端变更」直写一条，刷新后 ↓ 正好是直写的那一条，同步中心里客户一行不出现，拉取后归零、改动落进本机。
- AC#3：`sync-counts.spec.ts` 的「AC#16」用例（两个浏览器上下文，刷新前后各看一次）。
- AC#1～#4 的计数口径：`packages/rxdb-plugin-sync/src/__tests__/check-repository-updates.spec.ts`（「本库自己推上去的变更」、按区的用例）；重算与拉取并发：`packages/rxdb-plugin-history/src/__tests__/HistoryManager.scopes-and-undo.spec.ts`、`packages/rxdb-plugin-sync/src/__tests__/SyncManager.orchestration.spec.ts`。
- AC#5：`pnpm nx test rxdb-plugin-sync`、`pnpm nx test rxdb-plugin-history`；适配器只跑 mock 单测 `pnpm nx test rxdb-adapter-supabase --excludeTaskDependencies -- src/__tests__/review-regressions.spec.ts`（整个 `rxdb-adapter-supabase:test` 会清掉 demo 数据）；远端 e2e 按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`（计数用例在第二轮单独串行跑）。

## 技术笔记

- 认「本库推的」：推送回执给每条推上去的本地变更写 `RxDBChange.remoteId`。[`checkRepositoryUpdates`](../../../packages/rxdb-plugin-sync/src/check-repository-updates.ts)
  先读本地游标之后的这些远端 id（按实体、分支过滤，去重：压缩推送会把几条本地变更记成同一个远端 id），再问远端；先读本地再问远端，
  之后才落库的那几条只会让这一次多数，不会数成负的。只拉的远端实体本地没有推上去的变更，不去扫变更表。
- 未分区的仓库：游标之后的远端条数减去本库的远端 id 个数（远端日志删掉了本库推上去的行才会减成负数，那几条也不再待拉，按 0 算）。
- 分区的仓库：[`ScopedSyncAdapter`](../../../packages/rxdb-plugin-sync/src/scoped-sync.ts) 的 `getBucketChangeCount` 多一个可选的 `ids`，
  先数这个区游标之后的条数，再按本库的远端 id 分批（每批不超过 100 个，id 写在请求地址里）数落在这个区的有几条，两次相减。
  Supabase 适配器直接数 `rxdb_change`：表上的 `rxdb_change_read_by_bucket` 策略只放行调用者可读分区的行，不另开 RPC，没有 SQL 改动。
- 计数查询不再按 `clientId` 排除：本实例推的变更也有本地 `remoteId`，再按 `clientId` 排除会减两次。实时通知仍按 `clientId` 跳过本实例推的，那是同一次会话里的事。
- 重算作废：[`HistoryManager`](../../../packages/rxdb-plugin-history/src/HistoryManager.ts) 的拉取结算与会话重置也换代，并记下最近一次结算的代次；
  `reconcilePullableCount` 发现令牌早于它就不用这次的结果、返回 `false`，[`SyncManager.refreshPullableCount`](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 据此再数一遍，
  连着三次都被拉取抢先就不再数（那几次拉取已经把计数结算到位）。只到了实时事件时照旧取两者较大值，不吞掉事件。
- 快照没拉完（`snapshotComplete` 为假）时仍按 1 计，表示「这个区要补快照」。

## 实现文件

- `packages/rxdb-plugin-sync/src/check-repository-updates.ts` — 减掉本库推上去的；分区按真实条数
- `packages/rxdb-plugin-sync/src/scoped-sync.ts` — `getBucketChangeCount` 的 `ids`
- `packages/rxdb-plugin-sync/src/SyncManager.ts` — 重算被拉取抢先时再数
- `packages/rxdb-plugin-history/src/HistoryManager.ts`、`sync-history-bridge.ts` — 结算换代，`reconcilePullableCount` 报告这次重算是否作废
- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` — 计数不按 `clientId` 排除；`getBucketChangeCount` 支持 `ids`
- `apps/dev-rxdb-supabase-e2e/src/sync-counts.spec.ts`、`project.json` — 真栈用例与单独串行的第二轮

## References

- 顶栏的拉取徽标依赖它：[US-230](US-230-supabase-header-sync.md) 阶段 B；整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-226 待拉数按记录计](US-226-supabase-pull-count-records.md)、[US-033 按授权分区同步](../core/US-033-identity-scoped-read-sync.md)
