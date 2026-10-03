---
id: US-218
title: Supabase 远端启用 RLS 时的推送完整性
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-10-02
updated: 2026-10-02
tags: [adapter, supabase, sync, security, rls]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 US-029 的 access 声明或角色；只修现有推送协议在 RLS 下的行为
- [x] Negotiable: 日志改由触发器推导还是函数内重排、回执形状，在 plan 阶段冻结
- [x] Valuable: 已有可复现症状（幽灵 DELETE），开了 RLS 的部署今天就会踩到
- [x] Estimable: 阶段 A 只动参考 SQL 与回归用例；B / C 的波及面已列在实现文件
- [ ] Small: 阶段 B 改远端适配器契约，按 A / B / C 分阶段，不拆子故事文件
- [x] Testable: 阶段 A 的红测试已在仓库里
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

**症状 1：幽灵 DELETE（已实验确认）。** [`rxdb_mutations`](../../../docker/sql/04-rxdb-utils-functions.sql) 先 `INSERT INTO public.rxdb_change`，
再调 `rxdb_batch_delete`。当目标行对调用方可见、但 DELETE 的 `USING` 策略把它过滤掉时，PostgreSQL 不报错，只是零行生效；
`rxdb_batch_delete` 用 `GET DIAGNOSTICS affected = ROW_COUNT` 拿到了 0，但 `rxdb_mutations` 只把它累加进 `delete_count`，不回收已写的日志。结果：

- 远端行仍在，`rxdb_change` 里却多了一条 DELETE；
- 推送方拿到成功映射，本地删掉了这一行；
- 其它客户端拉到这条 DELETE 并在本地删除。

远端数据从此与所有客户端分叉，且没有任何一端报错。复现用例：
[`supabase-sql-security-regressions.sql`](../../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)
中的 `test_rls_filtered_delete()`（`run-supabase-sql-security-regressions.sh` 的 `rls-filtered-delete`），当前为红。

**症状 2：毒批次（推断，读代码得出，未实跑）。** upsert 被 `WITH CHECK` 或 `INSERT … ON CONFLICT DO UPDATE` 的策略拒绝时抛 42501，
整个 `rxdb_mutations` 事务回滚，这一路是安全的；但客户端走 [`throwPushFailure()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts)，
水位线不推进，下一轮推送原样重发同一批，同批里本可成功的变更也一起卡住，直到用户手工清掉那条本地变更。

**症状 3：`rxdb_change` 可被任意登录用户直接写。** [`01-rxdb-system-tables.sql`](../../../docker/sql/01-rxdb-system-tables.sql)
对 `rxdb_change` 关闭 RLS 并 `GRANT ALL ... TO anon / authenticated`，注释写明「仅测试环境」，但仓库没有给出生产部署该怎么收紧。
任何人都能绕过 `rxdb_mutations` 直接插入一条伪造的 DELETE，效果同症状 1。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                    | 必过 AC   | 门禁                                                                   |
| ---- | ---- | ------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| A    | ⬜   | 参考 SQL：被 RLS 过滤或拒绝的操作不写日志，统一以 42501 拒绝；区分「可见但被拒」与「已不存在」          | AC#1～5   | `rls-filtered-delete` 转绿，既有 9 条 SQL 回归不回退                   |
| B    | ⬜   | 逐操作回执与 rejected 状态：一条被拒不再拖垮整批；客户端可见被拒原因                                    | AC#6～10  | `RemoteMergeResult` / `mergeChanges` 契约变更过 API 基线，并附迁移说明 |
| C    | ⬜   | 生产部署指引与 `rxdb_change` 写入收口：客户端角色不能直接写日志表，非 main 分支变更保留显式写日志的路径 | AC#11～13 | 用 `authenticated` 角色直写 `rxdb_change` 被拒；分支推送回归不回退     |

一个 PR 只交付一个阶段。A 不改任何 TypeScript 契约，可以独立发布；B 是破坏性变更，必须单独走 API 基线与迁移文档。

## 范围边界

### In Scope

- `rxdb_mutations` 及其调用的批量函数在 RLS 下的日志正确性与拒绝语义
- 推送路径的逐操作结果（applied / rejected）与客户端对 rejected 的处置
- `rxdb_change` 的生产权限模型与部署文档

### Out of Scope

- 角色、`access.owner` 等声明与客户端谓词（[US-029](../core/US-029-rbac-owner-role-permission.md) 的范围）
- 拉取侧过滤与按租户水位
- Supabase 之外的远端适配器实现 RLS 等价物；阶段 B 只改它们共享的契约，并让它们按新契约返回结果
- rejected 变更与撤销 / 重做的交互（阶段 B 只要求 rejected 变更不再被重推；撤销语义另议）

## 验收标准

### 阶段 A：不写幽灵日志，统一拒绝

| #   | 前置条件                                            | 操作                                       | 预期结果                                                                       | 状态 |
| --- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ | ---- |
| 1   | 业务表开 RLS，目标行对调用方可见，DELETE 策略不放行 | `rxdb_mutations` 删除该行并附 DELETE       | 抛 42501；行仍在；`rxdb_change` 无该客户端的新记录（即 `rls-filtered-delete`） | ⬜   |
| 2   | 同上，UPDATE 的 `USING` 策略不放行                  | `rxdb_mutations` upsert 该行               | 抛 42501；行未变；无新日志                                                     | ⬜   |
| 3   | 目标行已被他人删除（对任何人都不存在）              | `rxdb_mutations` 删除该行                  | 按既有幂等语义成功，不因「零行生效」被误判为拒绝                               | ⬜   |
| 4   | 同批含一条被拒操作和若干可放行操作                  | `rxdb_mutations`                           | 整批回滚，无任何日志写入（阶段 A 的语义；阶段 B 再放开部分成功）               | ⬜   |
| 5   | 既有 SQL 回归 9 条                                  | `run-supabase-sql-security-regressions.sh` | 全部 PASS                                                                      | ⬜   |

### 阶段 B：逐操作回执

| #   | 前置条件                                    | 操作      | 预期结果                                                                                     | 状态 |
| --- | ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- | ---- |
| 6   | 同批含一条被 RLS 拒绝的变更和若干可放行变更 | 推送      | 可放行的变更生效并拿到远端 ID；被拒的那条标为 rejected，附拒绝原因                           | ⬜   |
| 7   | AC#6 之后                                   | 再次推送  | rejected 变更不再被重推，水位线越过它；其余待推变更正常推送                                  | ⬜   |
| 8   | 远端适配器返回的回执缺少某条本地变更        | 推送      | 整批按失败处理，水位线不推进（不再按「无映射」静默放过）                                     | ⬜   |
| 9   | 相同批次重试                                | 推送      | 已生效的变更不重复执行副作用，返回首次提交的同一远端 ID（`mergeChanges` 既有契约的回归验收） | ⬜   |
| 10  | 三框架 demo                                 | 触发 AC#6 | Angular / React / Vue 都能看到被拒变更及原因，API 对称                                       | ⬜   |

### 阶段 C：日志表收口与部署指引

| #   | 前置条件                            | 操作                                           | 预期结果                                                           | 状态 |
| --- | ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 11  | 按生产指引部署的参考 SQL            | 以 `authenticated` 直接 `INSERT` `rxdb_change` | 被拒                                                               | ⬜   |
| 12  | 同上                                | 推送非 main 分支的变更                         | 日志照常写入，分支同步回归不回退                                   | ⬜   |
| 13  | `website/docs/adapters/supabase.md` | 阅读                                           | 写明生产环境的 `rxdb_change` 权限、业务表 RLS 的推荐策略与已知限制 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **阶段 A 的落点**：`rxdb_mutations` 当前顺序是「step 1 取快照 → step 2 写 `rxdb_change` → upsert → delete」。
  要么把写日志挪到业务写之后、按真实受影响行数决定是否写；要么保留顺序，在受影响行数不足时抛 42501 让事务整体回滚。
  后者改动最小，且与 upsert 被拒时的现有行为（抛错回滚）一致，**推断**是阶段 A 的首选，plan 阶段定。
- **「可见但被拒」与「已不存在」的区分**：USING 过滤和行已删除都表现为 ROW_COUNT = 0。区分办法是在同一事务里对零行生效的 id
  再 `SELECT` 一次：查得到即被策略拒绝，查不到即已不存在。若 SELECT 策略也不放行，该行对调用方不可见，按「已不存在」处理，
  这与它在该用户本地本来就看不到一致（**推断**，需在 plan 阶段用一条「SELECT 也不放行」的用例确认）。
- **非 main 分支**：[`build_merge_changes_payload()`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts)
  只在 `isMainBranch` 时生成 `p_upserts` / `p_deletes`，非 main 分支的推送只写日志、不碰业务表。阶段 A 的判定只对有业务写的操作生效；
  阶段 C 若改为由触发器推导日志（候选：`SECURITY DEFINER` 触发器 + 回收客户端角色对 `rxdb_change` 的 DML），
  分支变更必须保留显式写日志的路径，否则分支同步会断。机制在 plan 阶段定。
- **阶段 B 的契约变更**：[`RemoteMergeResult`](../../../packages/rxdb/src/rxdb-adapter.ts) 两个字段都是可选，
  [`getChangeIdMapping()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 对缺映射 `return []`。
  逐操作回执要求把它升级为强制的逐条结果（applied / rejected），影响所有 `RxDBAdapterRemoteBase` 实现。
  rejected 落到本地 `RxDBChange` 的哪个字段、是否需要系统表迁移，在 plan 阶段定。
- **与 US-029 的关系**：本故事是 [RV-022](../../reviews/RV-022-us-029-readiness-review.md) R02 / R04 / R05 中与租户无关的部分，
  单独成立的依据是症状 1 已复现。US-029 阶段 C 的权威端工作以本故事为前置。

## 实现文件

| 阶段 | 路径                                                                                 | 说明                                                         |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A    | `docker/sql/04-rxdb-utils-functions.sql`                                             | `rxdb_mutations` / `rxdb_batch_delete` / `rxdb_batch_upsert` |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql` | 阶段 A 回归用例（`rls-filtered-delete` 已在）                |
| B    | `packages/rxdb/src/rxdb-adapter.ts`                                                  | `RemoteMergeResult` / `mergeChanges` 契约                    |
| B    | `packages/rxdb-plugin-sync/src/push-repository.ts`                                   | 逐操作结果处置、rejected 不重推                              |
| B    | `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                          | 按新契约返回回执                                             |
| B    | `website/docs/migration/`                                                            | 契约变更迁移说明                                             |
| C    | `docker/sql/01-rxdb-system-tables.sql`、`docker/sql/02-*.sql`                        | `rxdb_change` 权限与日志写入路径                             |
| C    | `website/docs/adapters/supabase.md`                                                  | 生产部署指引                                                 |

## References

- [RV-022 US-029 立项准入评审](../../reviews/RV-022-us-029-readiness-review.md)
- [US-029 多用户 RBAC：角色与所有权写权限](../core/US-029-rbac-owner-role-permission.md)
- PostgreSQL 文档：[Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
