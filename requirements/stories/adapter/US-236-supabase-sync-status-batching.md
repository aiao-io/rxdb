---
id: US-236
title: Supabase 同步状态一轮问完：打开页面不再为每个仓库各发三个请求，频道订阅上只重算一次
status: In Review
priority: Medium
epic: epic-016-local-change-workbench
created: 2026-11-28
updated: 2026-11-28
tags: [adapter, supabase, sync, pull, performance]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改待拉数的统计方式与拉取开头的登记信息查询；计数口径沿用 US-233，推送、实时通知的计数不动
- [x] Negotiable (可协商): 登记信息不跨轮缓存（服务端改了分区设置时会静默拉空），改为每轮批量问一次；系统表在状态里照样列出（公开契约）
- [x] Valuable (有价值): 商品页打开、点一次拉取共 139 个请求，其中 106 个是两轮逐仓库的待拉数统计，真实网络下要好几秒才数完
- [x] Estimable (可估算): 两个批量 RPC + 适配器两个方法 + 同步插件一轮统计 + 频道订阅批次 + 系统表不进拉取
- [x] Small (小): 一个 PR
- [x] Testable (可测试): SQL 回归、适配器与同步插件单测、真栈网络面板计数
-->

# 用户故事：同步状态一轮问完

## 作为/我想要/以便

**作为** 打开 dev-rxdb-supabase 页面、在弱网下使用的登录用户
**我想要** 待拉数的统计一轮只问几次远端，不随仓库数增加；Realtime 频道订阅上之后只重算一次
**以便** 页面打开之后待拉数很快就准，重连时也不会把每个仓库再问一遍、给服务端造成请求风暴

## 背景

商品页（`/catalog`）打开并点一次「拉取」的 HAR 一共 139 个请求，按阶段分：

| 阶段         | 请求数 | 内容                                                                                                                            |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 连接与页面   | 7      | RLS 自检、caller buckets、caller grants、页面自己的查询                                                                         |
| 待拉数第一轮 | 53     | 17 个仓库逐个串行：`rxdb_backend_id` → `rxdb_entity_sync_info` → `rxdb_change?…limit=1`（分区实体再问 caller buckets 与快照点） |
| 待拉数第二轮 | 53     | 原样再来一遍                                                                                                                    |
| 点拉取       | 26     | 16 个并发的 `rxdb_entity_sync_info`、一个批量日志查询、分区拉取                                                                 |

四个原因叠在一起：

1. 状态统计是把单仓的 [`checkRepositoryUpdates`](../../../packages/rxdb-plugin-sync/src/check-repository-updates.ts) 套在循环里，每个仓库各核一次远端身份、各问一次登记信息。
2. 17 个仓库里 8 个是系统表：它们不带自己的 `sync`，跟随库级 `SyncType.Full` 被判成能拉取，而它们不记变更日志，远端永远没有它们的行。拉取里同样带着它们。
3. 统一频道加每个分区一个频道，各报一次 SUBSCRIBED 就各请求一次重算，同步插件合成「正在数的一轮 + 收尾一轮」，于是整整数两轮。
4. 登记信息与远端身份每次都现问，一轮里同一个答案问了十几遍。

改完之后同一页面：打开 113 → 11 个请求，点一次拉取 26 → 8 个加上每个可读分区 1 个。

## 范围边界

### In Scope

- 参考 SQL 加两个批量函数：`rxdb_entity_sync_infos(p_entities)` 一次答完多个实体的登记信息，`rxdb_pending_change_counts(p_probes, p_branch_ids)` 一次数清多个仓库的待拉数；生产权限脚本授权，SQL 回归覆盖 anon 与 authenticated。
- Supabase 适配器实现 `getEntitySyncInfos`、`countPendingChanges`；一次建出的一批频道都有了订阅结局才请求一次重算，之后单个频道重新加入时单独请求。
- 同步插件：状态统计一轮只核一次远端身份、问一次登记信息与可读分区，把要数的拼成探针一次交给远端；适配器不支持批量时逐个问，最多同时问 4 个。
- `pull()` 一轮只问一次登记信息，按区与按条件拉取的仓库带着答案进逐仓拉取；系统表不进批量拉取。
- 适配器文档（中英）与迁移说明。

### Out of Scope

- 跨轮缓存登记信息：服务端把实体改成分区（或取消分区）之后，缓存着旧答案的客户端会只读未分区日志、静默拉空，要到下一次连接才发现。每轮批量问一次只多一个请求。
- 旧服务端兜底：新客户端连到没有这两个函数的 SQL 时报 `PGRST202`，与按区函数同一个升级顺序（先升级 SQL）。PostgREST 的 schema cache 没刷新时同样回 `PGRST202`，退回逐个问会把问题藏起来（RV-01a21194e68f7aacb5782c196d2ea870 同一理由）。
- 单仓的 `checkRepositoryUpdates` 照旧逐个问：它还要交回 `remoteLatestChangeId`，不在热路径上。
- 拉取里的远端身份复核：按区拉取落库之前再核一次远端身份是有意的（拉取途中远端被重建时不推进游标），不并掉。
- 页面自己的查询（商品页的租户列表、公开商品的 QueryCache 校验）：属于演示应用，不在同步插件的范围。

## 验收标准

| #   | 前置条件                                                   | 操作                                        | 预期结果                                                                                                                                             | 状态 |
| --- | ---------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 登录身份，远端支持批量 RPC                                 | 打开商品页，等 Realtime 订阅上              | 状态统计只有 `rxdb_backend_id`、`rxdb_entity_sync_infos`、`rxdb_caller_buckets`、`rxdb_pending_change_counts` 各一个，不随仓库数增加，只统计一轮     | ✅   |
| 2   | 统一频道加两个分区频道                                     | 三个频道依次订阅上；之后一个频道重新加入    | 三个都有结局时请求一次重算；有频道失败时为订阅上的那几个请求一次；都失败不请求；之后重新加入的频道单独请求一次                                       | ✅   |
| 3   | 未分区、只拉、分区（含快照没拉完、被撤销）、本库推过的仓库 | 一轮批量统计与逐仓 `checkRepositoryUpdates` | 每个仓库的待拉数相同；徽标总数等于各仓库之和                                                                                                         | ✅   |
| 4   | 系统表跟随库级 `SyncType.Full`                             | 状态统计；`pull()`                          | 状态里照样列出系统表，待拉为 0，不为它们问远端；批量拉取不为它们建同步记录、不进请求                                                                 | ✅   |
| 5   | 有按区与按条件同步的仓库                                   | `pull()`                                    | 登记信息只问一次（不含系统表）；逐仓拉取带着答案，不再各自重问                                                                                       | ✅   |
| 6   | 远端适配器不实现批量方法                                   | 状态统计                                    | 结果相同，逐个问，最多同时 4 个                                                                                                                      | ✅   |
| 7   | 参考 SQL 部署后                                            | anon 与 authenticated 调两个新函数          | 登记信息与逐个问同口径、按传入顺序；计数按游标、分支与 `excludeIds`，anon 只数得到可读分区、数不到未分区日志；生产权限脚本只给 anon 开这两个只读函数 | ✅   |
| 8   | —                                                          | 同步插件与适配器单测、SQL 回归、真栈        | 通过                                                                                                                                                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

- AC#1、#3（真栈）：`pnpm nx dev dev-rxdb-supabase` 起栈后在浏览器网络面板过滤 `rest/v1` 看商品页的请求；口径对照在页面控制台按 `syncManager.getAllRepositorySyncStatus()` 与逐仓 `syncManager.checkRepositoryUpdates()` 比较（取实例的方法见 dev-rxdb-supabase 的 Playwright 调试约定）。
- AC#2：`packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts` 的「一批频道只请求一次待拉数重算（US-236）」与「重建后订阅恢复触发的待拉数重算再问 getCallerBuckets」。
- AC#3、#6：`packages/rxdb-plugin-sync/src/__tests__/pending-counts.spec.ts`（同一张内存日志上比对批量、逐个与 `checkRepositoryUpdates`，含并发上限与分区撤销）。
- AC#4：`packages/rxdb-plugin-sync/src/__tests__/get-all-repository-sync-status.spec.ts`、`pull-batch.spec.ts`；状态里列出系统表的公开契约见 `src/__tests__/contracts/sync-manager-api.spec.ts`。
- AC#5：`packages/rxdb-plugin-sync/src/__tests__/pull-sync-infos.spec.ts`、`bucketed-pull.spec.ts`。
- AC#7：`packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql` 的 `bucketed-read-sync` 与 `sync-access-upgrade` 用例（`pnpm nx run rxdb-adapter-supabase:sql-security-regressions`）；适配器侧 `review-regressions.spec.ts` 的「批量登记信息与批量待拉数（US-236）」。
- AC#8：`pnpm nx test rxdb-plugin-sync`；适配器只跑 mock 单测（整个 `rxdb-adapter-supabase:test` 会清掉 demo 数据）。

## 技术笔记

- 探针：`{ namespace, entity, bucket, afterId, excludeIds }`。未分区仓库一个探针（游标取同步记录的 `lastPullRemoteChangeId`）；分区仓库每个可读分区一个，游标取当前同步规则指纹、当前远端的分区进度，快照没拉完或还没有进度的区不问远端、各算 1。`excludeIds` 是本库推上去的远端 id（US-233 的口径），随请求体发出，不分批。
- 一次数完的口径比逐个数更准：远端日志删掉了本库推上去的行时，逐个数按「总数减本库 id 个数」再按 0 截断，一次数完直接不数这些 id。两者只在这种情况下不同。
- 能力是可选的：[`ScopedSyncAdapter`](../../../packages/rxdb-plugin-sync/src/scoped-sync.ts) 的 `getEntitySyncInfos` 与 `PendingChangeCountAdapter` 的 `countPendingChanges`，没实现时同步插件用原有原语逐个问，与 `pullChangesBatch` 同一种特性探测。
- 频道批次：[`RealtimeSubscriptionBatch`](../../../packages/rxdb-adapter-supabase/src/supabase.helpers.ts) 记下一次建出的频道，每个都报过一次状态、且至少一个订阅上时请求一次；之后再报 SUBSCRIBED 的是 Realtime 客户端自己重新加入，单独请求。同步插件的合并（正在数的一遍 + 收尾一遍）不变，管的是不同批次之间。
- 系统表：状态统计里照样列出（`sync-manager-api.spec.ts` 的公开契约），只是不为它们问远端；批量拉取与 `pull()` 的登记信息查询跳过它们，与 `bulkSync`、同步监听同一口径。

## 实现文件

- `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/production/rxdb-change-grants.sql` — 两个批量函数与授权
- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`、`supabase.helpers.ts`、`supabase.interface.ts` — 批量方法、频道批次
- `packages/rxdb-plugin-sync/src/pending-counts.ts` — 一轮统计
- `packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts`、`get-repository-sync-status.ts` — 状态统计接一轮统计
- `packages/rxdb-plugin-sync/src/pull.ts`、`pull-repository.ts`、`bucketed-pull.ts`、`pull-batch.ts` — 拉取一轮问一次登记信息，系统表不进拉取
- `packages/rxdb-plugin-sync/src/scoped-sync.ts` — 可选的批量能力与探针类型
- `website/docs/adapters/supabase.md`、`website/docs/migration/supabase-sync-status-batch.md` — 文档

## References

- 计数口径：[US-233 待拉数准确](US-233-supabase-pullable-count-accuracy.md)；按区同步：[US-033](../core/US-033-identity-scoped-read-sync.md)
- 整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
