---
id: US-218
title: Supabase 远端启用 RLS 时的推送完整性
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-02
updated: 2026-10-05
tags: [adapter, supabase, sync, security, rls]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 US-029 的 access 声明或角色；阶段 A 无前置，阶段 B 以 US-220（UPDATE 落库语义）为前置；「行是否存在」的判定原语与 US-220 共用，两者 plan 全部完成后才开工
- [x] Negotiable: 「行是否存在」的判定机制、日志改由触发器推导还是函数内校验、回执形状，在 plan 阶段冻结
- [x] Valuable: 已有可复现症状（幽灵 DELETE），开了 RLS 的部署今天就会踩到
- [x] Estimable: 阶段 A 只动参考 SQL 与回归用例；B / C 的波及面已列在实现文件
- [ ] Small: 阶段 B 改远端适配器契约，按 A / B / C 分阶段，不拆子故事文件
- [x] Testable: 阶段 A 的红测试 `rls-filtered-delete` 已在仓库里，其余阶段 A 用例按 AC 补
-->

# 用户故事：Supabase 远端启用 RLS 时的推送完整性

## 作为/我想要/以便

**作为** 在 Supabase 远端业务表上启用了 RLS 的应用开发者
**我想要** 被 RLS 拦下的推送写入在远端不留日志、在客户端明确报为被拒绝，并且不阻塞同批其它变更
**以便** 其它设备不会拉到一条从未生效的删除，被拒绝的变更也不会让同步永久卡住

## 现状与证据

适配器的 RLS 自检（`rxdb_check_rls`，见 [website/docs/adapters/supabase.md](../../../website/docs/adapters/supabase.md) 「RLS 自检」）
会提示部署方给业务表开 RLS，所以「业务表开 RLS」是推荐配置，不是边缘场景。推送经
[`mergePushBatch()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) →
[`RxDBAdapterSupabase.mergeChanges()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) →
`rxdb_mutations(p_upserts, p_deletes, p_changes, p_skip_sync => true)`。该函数为 `SECURITY INVOKER`，业务表的 RLS 对它生效。

以下「已实验确认」的结论均在本地 Supabase（PostgreSQL 17.6）容器内以 `anon` 角色、`BEGIN … ROLLBACK` 包裹实跑得出。

**症状 1：幽灵 DELETE（已实验确认）。** [`rxdb_mutations`](../../../docker/sql/04-rxdb-utils-functions.sql) 先 `INSERT INTO public.rxdb_change`，
再调 `rxdb_batch_delete`。当 DELETE 的 `USING` 策略把目标行过滤掉时，PostgreSQL 不报错，只是零行生效；
`rxdb_batch_delete` 用 `GET DIAGNOSTICS affected = ROW_COUNT` 拿到了 0，但 `rxdb_mutations` 只把它累加进 `delete_count`，不回收已写的日志。结果：

- 远端行仍在，`rxdb_change` 里却多了一条 DELETE；
- 推送方拿到成功映射，本地删掉了这一行；
- 其它客户端拉到这条 DELETE 并在本地删除。

远端数据从此与所有客户端分叉，且没有任何一端报错。目标行对调用方**可见**时的复现用例：
[`supabase-sql-security-regressions.sql`](../../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)
中的 `test_rls_filtered_delete()`（`run-supabase-sql-security-regressions.sh` 的 `rls-filtered-delete`），当前为红。
目标行连 SELECT 策略也不放行时结果相同（`deleted = 0`，日志照写 1 条）。这种行在推送方本地**确实存在**：
`rxdb_change` 的拉取不经业务表的 SELECT 策略过滤，用户能拉到自己按 RLS 读不到的行，再对它发起删除。

**症状 2：毒批次（推断，读代码得出，未实跑）。** upsert 被 `WITH CHECK` 或 `INSERT … ON CONFLICT DO UPDATE` 的策略拒绝时抛 42501，
整个 `rxdb_mutations` 事务回滚，这一路是安全的；但客户端走 [`throwPushFailure()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts)，
水位线不推进，下一轮推送原样重发同一批，同批里本可成功的变更也一起卡住，直到用户手工清掉那条本地变更。

**症状 3：`rxdb_change` 可被任意登录用户直接写（已实验确认）。** [`01-rxdb-system-tables.sql`](../../../docker/sql/01-rxdb-system-tables.sql)
对 `rxdb_change` 关闭 RLS 并 `GRANT ALL ... TO anon / authenticated`，注释写明「仅测试环境」，但仓库没有给出生产部署该怎么收紧。
`anon` 直接 `INSERT` 一条伪造的 DELETE 被接受，效果同症状 1。

**症状 4：`rxdb_mutations` 不校验日志与业务写是否配对。**

- **已实验确认**：`p_changes` 带一条 main 分支 DELETE、`p_deletes` 为空，调用被接受（`changes = 1`），业务行仍在。
  也就是说，只回收客户端对 `rxdb_change` 的直写（阶段 C）关不掉伪造删除，这个 RPC 本身就是同一个口子。
- **推断，读代码得出**：`p_changes` 为空、`p_upserts` 非空且 `p_skip_sync => true` 时，`apply_entity_operations` 保持初值 `true`，
  业务写照常执行，同步触发器又被 `rxdb.sync_enabled = 'false'` 关掉。业务表被改了，却没有任何日志，其它客户端永远拉不到。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                           | 必过 AC   | 门禁                                                                      |
| ---- | ---- | -------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| A    | ⚠️   | 参考 SQL：被 RLS 过滤或拒绝的操作不写日志，统一以 42501 拒绝；区分「被拒」与「已不存在」；日志与业务写必须配对 | AC#1～7   | `rls-filtered-delete` 转绿，阶段 A 新增用例全绿，既有 9 条 SQL 回归不回退 |
| B    | ⚠️   | 逐实体回执与 rejected 状态：一条被拒不再拖垮整批；被拒实体在本地回到远端状态；客户端可见被拒原因               | AC#8～16  | `RemoteMergeResult` / `mergeChanges` 契约变更过 API 基线，并附迁移说明    |
| C    | ⚠️   | 生产部署指引与 `rxdb_change` 写入收口：客户端角色不能直接写日志表，非 main 分支变更保留显式写日志的路径        | AC#17～19 | 用 `authenticated` 角色直写 `rxdb_change` 被拒；分支推送回归不回退        |

一个 PR 只交付一个阶段。A 不改任何 TypeScript 契约；B 是破坏性变更，必须单独走 API 基线与迁移文档。

> 2026-10-05：A～C 三阶段已实现，应 owner 要求与 US-220 合并为一个 PR #99 评审（原 #89 / #90 / #97 / #98 关闭）。
> 提交仍按阶段拆分，B 的 API 基线与迁移说明照常附带；三个阶段的状态在 #99 合入后再改 ✅。

**前置**：阶段 B 以 [US-220](./US-220-supabase-update-push-semantics.md) 为前置。在 US-220 之前，UPDATE 推送按 INSERT 语义落库：
只改部分列的 UPDATE 在 NOT NULL 列上报 23502、owner 型 RLS 下改自己的行误报 42501，INSERT 策略比 UPDATE 窄的表上改别人的行也误报 42501。
这时阶段 B 的「被拒原因」会把这类误拒当成 RLS 拒绝暴露给用户，rejected 的判定也就失去意义。

**开工条件**：本故事三个阶段与 [US-220](./US-220-supabase-update-push-semantics.md) 的 plan 全部完成后，才进入开发。
理由是几处决策互相咬合，拆开定会返工：阶段 A 与 US-220 共用「行是否存在」的判定原语；US-220 的「已不存在」SQLSTATE
是阶段 B 错误分类（AC#13）的输入；阶段 A 推荐与 B 同版本发布，A 的拒绝语义要按 B 的回执形状来定。

**阶段 A 单独发布的代价**：A 把幽灵 DELETE 从「静默成功」改成「42501 拒绝」。在 B 落地之前，客户端仍按症状 2 处理，
被拒那条会让该仓库的推送一直卡住，直到用户手工清掉它。这比数据静默分叉安全，但对用户是一个新出现的阻塞。处置二选一，在 plan 阶段定：

- A 与 B 同一版本发布（推荐）；
- A 单独发布，并在 `website/docs/migration/` 写明手工恢复步骤：删掉那条本地变更，再从远端重拉该实体。

## 范围边界

### In Scope

- `rxdb_mutations` 及其调用的批量函数在 RLS 下的日志正确性、拒绝语义，以及日志与业务写的配对校验
- 推送路径的逐实体结果（applied / rejected）、被拒实体的本地对齐，以及客户端对 rejected 的处置
- `rxdb_change` 的生产权限模型与部署文档

### Out of Scope

- UPDATE 推送按 INSERT 语义落库导致的 23502 / 误报 42501（[US-220](./US-220-supabase-update-push-semantics.md) 的范围）
- 角色、`access.owner` 等声明与客户端谓词（[US-029](../core/US-029-rbac-owner-role-permission.md) 的范围）
- 拉取侧过滤与按租户水位：包括「用户能拉到自己按 SELECT 策略读不到的行」本身，本故事只保证对这种行的写入被正确拒绝
- Supabase 之外的远端适配器实现 RLS 等价物；阶段 B 只改它们共享的契约，并让它们按新契约返回结果
- rejected 变更与撤销 / 重做的交互：阶段 B 只要求 rejected 变更不再被重推、被拒实体回到远端状态；撤销语义另议

## 验收标准

### 阶段 A：不写幽灵日志，统一拒绝

| #   | 前置条件                                                                          | 操作                                       | 预期结果                                                                                                                                                                                                                        | 状态 |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 业务表开 RLS，目标行对调用方可见，DELETE 策略不放行                               | `rxdb_mutations` 删除该行并附 DELETE       | 抛 42501；行仍在；`rxdb_change` 无该客户端的新记录（即 `rls-filtered-delete`）                                                                                                                                                  | ✅   |
| 2   | 业务表开 RLS，目标行存在，但 SELECT 与 DELETE 策略都不放行                        | `rxdb_mutations` 删除该行并附 DELETE       | 抛 42501，**不**按「已不存在」放过；行仍在；无新日志                                                                                                                                                                            | ✅   |
| 3   | 目标行对调用方可见，UPDATE 的 `USING` 策略不放行                                  | `rxdb_mutations` 推送对该行的 UPDATE       | 抛 42501；行未变；无新日志。今天的 upsert 路径已成立，作为回归护栏；US-220 改走普通 `UPDATE` 后由其 AC#4 继续保证                                                                                                               | ✅   |
| 4   | 目标行已被他人删除（对任何角色都不存在）                                          | `rxdb_mutations` 删除该行                  | 按既有幂等语义成功，不因「零行生效」被误判为拒绝                                                                                                                                                                                | ✅   |
| 5   | 同批含一条被拒操作和若干可放行操作                                                | `rxdb_mutations`                           | 整批回滚，无任何日志写入（阶段 A 的语义；阶段 B 再放开部分成功）                                                                                                                                                                | ✅   |
| 6   | main 分支的日志与业务写不配对：有 DELETE 日志而无对应删除，或有业务写而无对应日志 | `rxdb_mutations`                           | 拒绝，业务表与 `rxdb_change` 都不变。规则：main 分支每条日志都须有业务写；`p_skip_sync => true` 时每条业务写都须有日志（`false` 时由同步触发器写）。按 (schema, table, entityId) 配对，压缩后 N 条源变更对应 1 条业务写视为配对 | ✅   |
| 7   | 既有 SQL 回归 9 条                                                                | `run-supabase-sql-security-regressions.sh` | 全部 PASS                                                                                                                                                                                                                       | ✅   |

### 阶段 B：逐实体回执

| #   | 前置条件                                               | 操作      | 预期结果                                                                                                  | 状态 |
| --- | ------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- | ---- |
| 8   | 同批含一条被 RLS 拒绝的变更和若干可放行变更            | 推送      | 可放行的变更生效并拿到远端 ID；被拒的那条标为 rejected，附拒绝原因（含 SQLSTATE）                         | ✅   |
| 9   | AC#8 之后                                              | 再次推送  | rejected 变更不再被重推，水位线越过它；其余待推变更正常推送                                               | ✅   |
| 10  | 同一实体的多条本地变更被压缩成一条远端操作，该操作被拒 | 推送      | 回执按实体给出，并扇出到它的全部源变更：这些源变更都标为 rejected，都不拿远端 ID                          | ✅   |
| 11  | AC#8 之后，推送方本地仍是被拒前写入的值                | 推送完成  | 被拒实体在推送方本地回到远端当前状态（被拒的 INSERT 在本地移除），且这次对齐不产生新的待推变更            | ✅   |
| 12  | 同批含被拒的父实体 INSERT 和引用它的子实体 INSERT      | 推送      | 子实体也标为 rejected，原因指向依赖的父实体；同批其它变更照常生效，整批不因 23503 卡住                    | ✅   |
| 13  | 推送因网络错误、5xx 或非 RLS / 约束类数据库错误失败    | 推送      | 不标 rejected，按既有重试语义处理，水位线不推进；只有 plan 阶段列明的 SQLSTATE（至少 42501）计为 rejected | ✅   |
| 14  | 远端适配器返回的回执缺少某条本地变更                   | 推送      | 整批按失败处理，水位线不推进（不再按「无映射」静默放过）                                                  | ✅   |
| 15  | 相同批次重试                                           | 推送      | 已生效的变更不重复执行副作用，返回首次提交的同一远端 ID（`mergeChanges` 既有契约的回归验收）              | ✅   |
| 16  | 三框架 demo                                            | 触发 AC#8 | Angular / React / Vue 都能看到被拒变更及原因，API 对称                                                    | ✅   |

### 阶段 C：日志表收口与部署指引

| #   | 前置条件                            | 操作                                           | 预期结果                                                           | 状态 |
| --- | ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 17  | 按生产指引部署的参考 SQL            | 以 `authenticated` 直接 `INSERT` `rxdb_change` | 被拒                                                               | ✅   |
| 18  | 同上                                | 推送非 main 分支的变更                         | 日志照常写入，分支同步回归不回退                                   | ✅   |
| 19  | `website/docs/adapters/supabase.md` | 阅读                                           | 写明生产环境的 `rxdb_change` 权限、业务表 RLS 的推荐策略与已知限制 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **阶段 A 的落点**：`rxdb_mutations` 当前顺序是「step 1 取快照 → step 2 写 `rxdb_change` → upsert → delete」。
  要么把写日志挪到业务写之后、按真实受影响行数决定是否写；要么保留顺序，在受影响行数不足时抛 42501 让事务整体回滚。
  后者改动最小，且与 upsert 被拒时的现有行为（抛错回滚）一致，**推断**是阶段 A 的首选，plan 阶段定。
- **「被拒」与「已不存在」的区分**：USING 过滤和行已删除都表现为 ROW_COUNT = 0，而且在调用方权限下无法区分。
  症状 1 已证实，连 SELECT 都看不到的行在推送方本地真实存在，所以「调用方查不到即已不存在」不成立（AC#2）。
  判定必须绕开调用方的 RLS，候选两种，plan 阶段定：
  - 一个只返回「该 id 是否存在」的 `SECURITY DEFINER` 探针函数，不返回行内容，不扩大读权限；
  - 按日志判定：该实体在 main 分支的最新一条日志是 DELETE 即视为已不存在，否则零行生效一律按拒绝处理。

  对可见的行，step 1 取快照的 `SELECT … WHERE source.id::text = $1` 已经拿到了 `current_data`，可直接复用，不必再查一次。

  [US-220](./US-220-supabase-update-push-semantics.md) 把 UPDATE 改走普通 `UPDATE` 后面对同一个问题（零行生效时被拒还是已不存在），
  **两个故事只交付一个判定原语，其机制、签名与 SQLSTATE 在两份 plan 里一次冻结，不得各写一份。** 「已不存在」与 42501 用不同的 SQLSTATE 报出，
  阶段 B 据此区分 RLS 拒绝与远端已删；DELETE 的「已不存在」按 AC#4 幂等成功，UPDATE 的「已不存在」按 US-220 AC#5 抛错。

- **日志与业务写配对（AC#6）**：`p_changes` 每条都带 `schema` / `table` / `entityId`（`rxdb_mutations` 写日志前用 `op - 'schema' - 'table'` 剥掉前两者），
  配对键直接取自载荷。唯一的 TypeScript 调用方 `RxDBAdapterSupabase.mergeChanges()` 总是传 `p_skip_sync: true`，
  但 RPC 对 `anon` / `authenticated` 开放，`false` 的分支同样要覆盖。客户端发出的载荷天然按实体键配对。
  [`buildCompactedPushEntries()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 只为压缩后仍有效的实体收集源变更；
  被 INSERT → DELETE 抵消的实体不进 `p_changes`。所以配对校验只拦伪造或残缺的调用，不影响正常推送。
  非 main 分支的变更本就没有业务写，不参与配对。
- **非 main 分支**：[`build_merge_changes_payload()`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts)
  只在 `isMainBranch` 时生成 `p_upserts` / `p_deletes`，非 main 分支的推送只写日志、不碰业务表。阶段 A 的判定只对有业务写的操作生效；
  阶段 C 若改为由触发器推导日志（候选：`SECURITY DEFINER` 触发器 + 回收客户端角色对 `rxdb_change` 的 DML），
  分支变更必须保留显式写日志的路径，否则分支同步会断。机制在 plan 阶段定。阶段 C 单靠回收直写关不掉症状 4，那一半由 AC#6 关。
- **阶段 B 的回执粒度**：`p_changes` 按源变更逐条发送，`p_upserts` / `p_deletes` 却是压缩后每实体一条，两者是 N:1。
  RLS 的判定发生在实体操作上，所以回执按实体键给出，再由客户端扇出到该实体的全部源变更（AC#10）。
  沿用今天按 `localId` 的 `change_id_mapping` 无法表达「一条实体操作被拒、它的三条源变更都不拿远端 ID」。
- **阶段 B 的本地对齐**：rejected 只阻止重推还不够。推送方本地已经写下了被拒的值，不对齐的话这个设备会一直显示一份远端没有的数据（AC#11）。
  对齐是「把该实体覆盖为远端当前值」，不是撤销：不生成反向变更、不进撤销栈、不产生新的待推变更。
  用哪条现有的拉取路径重取单个实体，在 plan 阶段定。
- **阶段 B 的依赖级联**：被拒的父实体 INSERT 不存在于远端，同批引用它的子实体 INSERT 会以 23503 失败（AC#12）。
  如果把 23503 当普通失败处理，就又回到毒批次。`PUSH_PHASES` 是先 DELETE 再 INSERT / UPDATE，依赖顺序由它决定；
  级联标记按外键依赖还是按 23503 反推，在 plan 阶段定。参考 schema 只有 `shop.*` 与 `menu_large` 带外键，`todos` 没有，
  AC#12 的用例须落在这两组表上。
- **阶段 B 的错误分类**：[`RxDBAdapterSupabase.executeRetryableWrite()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)
  只保留了 `error.message` 与 `status`，SQLSTATE 在这里丢掉。AC#13 要求把 SQLSTATE 带到客户端，并给出 rejected 与可重试错误的明确划分。
- **阶段 B 的契约变更**：阶段 B 之前 [`RemoteMergeResult`](../../../packages/rxdb/src/rxdb-adapter.ts) 两个字段都是可选，
  推送仓库的 `getChangeIdMapping()` 对缺映射 `return []`（阶段 B 已删除，改由
  [`assertMergeResultCoversBatch()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 做覆盖检查）。
  逐实体回执要求把它升级为强制的逐条结果（applied / rejected），影响所有 `RxDBAdapterRemoteBase` 实现。实际波及面很小：
  - 真正实现推送的只有 `RxDBAdapterSupabase`；
  - [`RxDBAdapterHttp.mergeChanges()`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts) 直接抛 `HttpChangelogUnsupportedError`，不受影响；
  - 测试夹具 [`sync-override.ts`](../../../packages/rxdb-test/src/cross-framework-fixtures/sync-override.ts) 返回 `undefined`，需要按新契约改。

  rejected 落到本地 `RxDBChange` 的哪个字段、是否需要系统表迁移，在 plan 阶段定。

- **SQL 回归不在 CI 里**：`run-supabase-sql-security-regressions.sh` 没有接入任何 nx target，需要手工对一个运行中的 Supabase 容器执行
  （默认容器名 `supabase-db`，用 `SUPABASE_DB_CONTAINER` 覆盖）。阶段 A 的门禁靠它，PR 描述里需要贴实跑输出；
  是否接入 nx / CI 不在本故事范围。
- **与 US-029 的关系**：本故事是 [RV-022](../../reviews/RV-022-us-029-readiness-review.md) R02 / R04 / R05 中与租户无关的部分，
  单独成立的依据是症状 1 已复现。US-029 阶段 C 的权威端工作以本故事为前置。

## 实现文件

| 阶段 | 路径                                                                                                                            | 说明                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `docker/sql/04-rxdb-utils-functions.sql`                                                                                        | `rxdb_mutations`：DELETE 零行判定（探针 `rxdb_existing_ids`，42501 `denied`）；配对校验 `rxdb_assert_push_integrity`（`RX002`）                                                                      |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`                                            | 改写 `rls-filtered-delete`；新增 `delete-hidden-row` / `delete-gone` / `mixed-batch-rollback` / `push-integrity`；`update-denied` 补 AC#3 日志断言                                                   |
| A    | `packages/rxdb/src/__tests__/sync-contract/compact-changes.spec.ts`                                                             | 配对规则依赖的压缩不变量：每键恰一个动作，DELETE ⇔ 最后一条为 DELETE                                                                                                                                 |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts`                                                       | `mergeChanges` 载荷里每个 main 日志键恰对应一次业务写                                                                                                                                                |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh`                                         | 新用例登记进 `CASES`                                                                                                                                                                                 |
| B    | `docker/sql/04-rxdb-utils-functions.sql`                                                                                        | `rxdb_mutations(p_receipts)`：逐实体组在 `BEGIN … EXCEPTION` 子事务里落库（`rxdb_mutations_apply_group`）、`entity_results` 回执（42501 `denied` / RX001 `gone` / 23503 `dependency`）、同批重放幂等 |
| B    | `docker/sql/03-business-tables.sql`                                                                                             | 回归夹具 `rls_unique_probe` 等 RLS 演示表                                                                                                                                                            |
| B    | `packages/rxdb/src/rxdb-adapter.ts`                                                                                             | `RemoteMergeResult.results`：`RemoteChangeResult` / `RemoteChangeRejection` / `RemoteEntityRef`                                                                                                      |
| B    | `packages/rxdb/src/sync-state.ts`、`sync-contract/VersionManager.interface.ts`                                                  | `SyncState.lastRejections`、`SyncStateHub.reportRejections`、`SyncRejection` / `SyncRejectionReport`                                                                                                 |
| B    | `packages/rxdb/src/system/change.ts`、`system/types.ts`、`system/migration.ts`                                                  | `RxDBChange.rejectedAt` / `rejection` 列与系统模式迁移                                                                                                                                               |
| B    | `packages/rxdb/src/trusted-write/trusted-write-intent.ts`                                                                       | 可信写入登记 #12 `alignRejectedEntities`（`remote_sync`）                                                                                                                                            |
| B    | `packages/rxdb-adapter-{pglite,sqlite-core}/src/…`                                                                              | 系统模式迁移补列                                                                                                                                                                                     |
| B    | `packages/rxdb-plugin-sync/src/push-repository.ts`                                                                              | 回执扇出到源变更、被拒标记、`rejected` 计数、被拒实体本地对齐、一次推送汇总上报一次                                                                                                                  |
| B    | `packages/rxdb-plugin-sync/src/{pull-round,cleanup-expired,query-cache-outbox,get-repository-sync-status,…}.ts`                 | 待推查询排除 `rejectedAt` 非空的变更                                                                                                                                                                 |
| B    | `packages/rxdb-adapter-supabase/src/{RxDBAdapterSupabase,supabase.helpers,errors,postgrest-error}.ts`                           | `p_receipts: true`、回执校验与 `dependsOn` 反查、`SupabaseDataError.code` 保留 SQLSTATE / `PGRST202`                                                                                                 |
| B    | `packages/rxdb-{angular,react,vue}/src/use-sync-state.ts`                                                                       | 三端 `lastRejections`                                                                                                                                                                                |
| B    | `packages/rxdb-test/src/cross-framework-fixtures/sync-rejections.ts`                                                            | 三框架共享被拒夹具                                                                                                                                                                                   |
| B    | `apps/dev-rxdb-{supabase,react,vue}`                                                                                            | 被拒列表面板（`data-testid="sync-rejections-panel"`）与 e2e / a11y                                                                                                                                   |
| B    | `benchmarks/push-receipts.bench.ts`                                                                                             | 推送提交基准：全部 applied vs 含 10% 被拒                                                                                                                                                            |
| B    | `website/docs/migration/supabase-push-receipts.md`                                                                              | 契约变更迁移说明                                                                                                                                                                                     |
| C    | `docker/sql/02-rxdb-sync-functions.sql`                                                                                         | `rxdb_log_change_trigger()` 改为 `SECURITY DEFINER`，收紧后直写业务表仍能经触发器写日志                                                                                                              |
| C    | `docker/sql/04-rxdb-utils-functions.sql`                                                                                        | 内部函数 `rxdb_insert_changes(jsonb)`（`SECURITY DEFINER`，入口守卫 `rxdb.insert_changes`，直调 42501）；`rxdb_mutations` 写日志段改调它                                                             |
| C    | `docker/sql/production/rxdb-change-grants.sql`                                                                                  | 生产权限脚本：收回 `anon` / `authenticated` 对 `rxdb_change` 的写权限与序列权限，保留 `SELECT`；`init-db.sh` 不加载                                                                                  |
| C    | `packages/rxdb-adapter-supabase/src/__tests__/{supabase-sql-security-regressions.sql,run-supabase-sql-security-regressions.sh}` | 用例 `production-change-grants`（事务内套生产脚本后以 `authenticated` 断言 AC#17、18）                                                                                                               |
| C    | `website/docs/adapters/supabase.md`                                                                                             | 「生产部署」节：权限脚本、业务表 RLS 推荐策略、被拒表现、已知限制                                                                                                                                    |

## References

- [RV-022 US-029 立项准入评审](../../reviews/RV-022-us-029-readiness-review.md)
- [US-029 多用户 RBAC：角色与所有权写权限](../core/US-029-rbac-owner-role-permission.md)
- [US-220 Supabase 推送 UPDATE 的落库语义](./US-220-supabase-update-push-semantics.md)
- PostgreSQL 文档：[Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- PostgreSQL 文档：[INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
