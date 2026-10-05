---
id: US-220
title: Supabase 推送 UPDATE 的落库语义
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-05
updated: 2026-10-05
tags: [adapter, supabase, sync, rls]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 US-218 的任何 TypeScript 契约；与 US-218 阶段 A 共用一个「行是否存在」的 SQL 判定，与 US-218 的 plan 全部完成后才开工，见技术笔记
- [x] Negotiable: 落库方式已定为普通 UPDATE；UPDATE 的下发形状、行已不存在时的 SQLSTATE 取值在 plan 阶段定
- [x] Valuable: Todo 只改 `completed` 的推送在参考 schema 上就会 23502；owner 型 RLS 下连自己的行都改不了；共享编辑表上改别人的行一律被拒
- [x] Estimable: 参考 SQL 一处落库分支 + 载荷构造一处 + 回归用例
- [x] Small: 一个 PR
- [x] Testable: 四条失败路径都已在本地 Supabase 容器实跑复现
-->

# 用户故事：Supabase 推送 UPDATE 的落库语义

## 作为/我想要/以便

**作为** 用 Supabase 作远端的应用开发者
**我想要** 本地 UPDATE 推送到远端时按 UPDATE 语义落库：只改载荷里出现的列，只受 UPDATE 与 SELECT 策略约束
**以便** 一次普通的修改不会因为没带上的 NOT NULL 列、RLS 的所有权列或比 UPDATE 更窄的 INSERT 策略推不上去，卡住整个仓库的同步

## 现状与证据

本地 UPDATE 产生的 `patch` 只含变更过的列。依据：

- [`IRxDBChange`](../../../packages/rxdb/src/system/change.ts) 的契约注释写明「UPDATE: `patch = { 变更字段的新值 }`（仅记录变更字段，增量数据，**不含 id**）」；
- SQLite 的更新触发器（[`trigger_sql.ts`](../../../packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts)）逐列以 `WHERE OLD.col IS NOT NEW.col` 收集，
  PGlite 的同名文件（[`trigger_sql.ts`](../../../packages/rxdb-adapter-pglite/src/table/trigger_sql.ts)）用 `IS DISTINCT FROM`；
- [`compactChanges()`](../../../packages/rxdb/src/sync-contract/compact-changes.ts) 把同一实体的多条 UPDATE 用 `Object.assign` 合并，结果仍是部分列。

推送时 [`build_merge_changes_payload()`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 把它组装成
`{ id, ...patch, updatedBy }` 交给 [`rxdb_batch_upsert`](../../../docker/sql/04-rxdb-utils-functions.sql)。
[`applyAuditFields()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) 的注释说明更新路径**刻意不下发** `createdBy`，
所以 UPDATE 载荷里永远没有归属列。`rxdb_batch_upsert` 对每一行执行：

```sql
INSERT INTO %I.%I SELECT * FROM pg_catalog.jsonb_populate_record(null::%I.%I, $1)
 ON CONFLICT (id) DO UPDATE SET %s
```

也就是说，远端把每一条 UPDATE 当成一次 INSERT 来做，冲突后才转成更新。没带上的列在「拟插入行」里都是 NULL；
拟插入行在走到 UPDATE 分支之前，就要先通过 NOT NULL、INSERT 策略的 `WITH CHECK` 与 SELECT 策略的 `USING`，
与语句带不带 `RETURNING` 无关。以下四种失败均在本地 Supabase（PostgreSQL 17.6）容器内以 `anon` 角色、`BEGIN … ROLLBACK` 包裹实跑确认：

**症状 1：NOT NULL 列触发 23502（已实验确认）。** 参考 schema [`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)
的 `todos.title varchar NOT NULL`。对一条已存在的 todo upsert `{ id, completed: true }`，报 23502（`title` 为 NULL）。
不开 RLS 的任意 NOT NULL 表结果相同。

**症状 2：owner 型 RLS 下改自己的行误报 42501（已实验确认）。** 两种策略各试一次，对调用方自己拥有的行做不含 `owner` 的 upsert：

- `FOR ALL USING (owner = uid) WITH CHECK (owner = uid)`：报 42501，同一行带上完整列则成功；
- SELECT 策略 `USING (owner = uid)`、INSERT 不设限：同样报 42501，去掉 `RETURNING` 结果不变。拟插入行的 `owner` 是 NULL，过不了 SELECT 策略。

按 `createdBy` 判定归属的策略必然命中这一条。

**症状 3：INSERT 策略比 UPDATE 窄的表，改别人的行一律误报 42501（已实验确认）。** 共享编辑是常见形态：
SELECT `USING (true)`、INSERT `WITH CHECK (owner = uid)`、UPDATE `USING (true) WITH CHECK (true)`。对他人拥有的行做 upsert，
**即使载荷是整行**也报 42501（new row violates row-level security policy）；同一行用普通 `UPDATE` 语句则成功。
拟插入行要过 INSERT 的 `WITH CHECK`，与列是否带全无关。

**症状 4：目标行已不存在时复活出一条残缺的新行（已实验确认）。** 列都可空的表上，对一条不存在的 id upsert 部分列，
没有冲突，直接走 INSERT 分支，插入 `{"id":"c9","owner":null,"title":"ghost"}`：未下发的列全是 NULL。带 NOT NULL 列的表上则落回症状 1。

**客户端后果（推断，读代码得出，未实跑）。** 症状 1～3 都让整个 `rxdb_mutations` 事务回滚，客户端走
[`throwPushFailure()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts)，水位线不推进，下一轮原样重发同一批。
参考 demo [`apps/dev-rxdb-supabase`](../../../apps/dev-rxdb-supabase/src/app/todo-interactions.ts) 的 `persistCompleted()` 只改 `completed`，
该应用的 Todo 按 Full 同步推送，所以「勾选一条 todo 之后该仓库的推送一直失败」在参考 demo 上就能触发。

**为什么现有测试没拦住。** 连真实数据库、经推送路径的 spec 在 UPDATE 时都恰好带上了 NOT NULL 列，且都没开 RLS：

- [`sync-data-integrity.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/sync-data-integrity.spec.ts)
  与 [`sync-multi-operations.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/sync-multi-operations.spec.ts) 的更新都改了 `title`；
- [`pull-push-changes.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/pull-push-changes.spec.ts) 用的是含 `title` 的 patch；
- [`filter-sync-snapshots.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/filter-sync-snapshots.spec.ts) 手工补了 `title`。

[`test-todo.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/test-todo.spec.ts) 的更新走 `SupabaseRepository.update`
的 PostgREST `.update()`，不经 `rxdb_mutations`，不受影响。demo 的 e2e [`remote-sync.spec.ts`](../../../apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts)
只覆盖新建 Todo 的推送，不覆盖勾选。

## 范围边界

### In Scope

- 推送路径（`rxdb_mutations`）上 UPDATE 的落库方式：普通 `UPDATE`，只改载荷里出现的列，不经 INSERT 语义
- UPDATE 零行生效时区分「被策略拒绝」与「行已不存在」，两者都不写日志、都不静默成功
- 对应的 SQL 回归用例、连真实数据库的推送 spec，以及 demo e2e 的勾选推送用例

### Out of Scope

- 被拒后的逐实体回执、rejected 状态与本地对齐（[US-218](./US-218-supabase-rls-push-integrity.md) 阶段 B 的范围）
- INSERT 路径：本地 INSERT 的 patch 是整行，仍走 `rxdb_batch_upsert`
- `SupabaseRepository.update` 的 PostgREST 直写路径
- 远端行已删、本地仍在更新这类并发冲突的解决策略：本故事只保证它被明确报错，不保证它被自动解决
- `RxDBAdapterSupabase.mutations()`（仓库 `save()` 直写，`options.update` 整实体进 `p_upserts`）不改。**推断**：它在 owner 型与共享编辑型 RLS 上同样命中症状 2、3；登记为[零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带)第 8 条待评估

## 验收标准

| #   | 前置条件                                                                                                                      | 操作                                                                           | 预期结果                                                                                                                           | 状态 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 参考 schema，远端已有一条 todo                                                                                                | `rxdb_mutations` 推送只含 `completed`（及 `updatedAt` / `updatedBy`）的 UPDATE | 成功；`completed` 已更新，`title` 等未下发的列不变；日志写入一条 UPDATE                                                            | ✅   |
| 2   | 业务表策略 `FOR ALL USING (owner = uid) WITH CHECK (owner = uid)`，目标行属于调用方                                           | 推送不含 `owner` 列的 UPDATE                                                   | 成功，`owner` 不变                                                                                                                 | ✅   |
| 3   | 业务表策略：SELECT `USING (true)`、INSERT `WITH CHECK (owner = uid)`、UPDATE `USING (true) WITH CHECK (true)`，目标行属于他人 | 推送不含 `owner` 列的 UPDATE                                                   | 成功，`owner` 不变；INSERT 策略不参与 UPDATE 的判定                                                                                | ✅   |
| 4   | 目标行存在，但 UPDATE 的 `USING` 或 SELECT 策略不放行                                                                         | 推送 UPDATE                                                                    | 抛 42501；行未变；无新日志。普通 `UPDATE` 被策略过滤时是静默零行，不得因此退化为成功                                               | ✅   |
| 5   | 目标行在远端已不存在（对任何角色都不存在）                                                                                    | 推送 UPDATE                                                                    | 抛错，SQLSTATE 与 42501 不同（plan 冻结为 `RX001`）；不插入任何行；无新日志                                                        | ✅   |
| 6   | 两个客户端连同一个真实 Supabase                                                                                               | 客户端 A 只改一条 todo 的 `completed` 并推送，客户端 B 拉取                    | A 推送成功、水位线推进；B 看到 `completed` 已变、`title` 不变。spec 经 `mergePushBatch` 推送路径，不走 `SupabaseRepository.update` | ✅   |
| 7   | 参考 demo 连本地 Supabase                                                                                                     | 新建一条 Todo 并推送，再勾选完成并推送，另一浏览器上下文拉取                   | 两次推送都成功；另一上下文看到该 Todo 已完成（`remote-sync.spec.ts` 新增用例）                                                     | ✅   |
| 8   | 既有 SQL 回归 9 条 + 本故事新增用例                                                                                           | `run-supabase-sql-security-regressions.sh`                                     | 全部 PASS（`rls-filtered-delete` 属 US-218，状态不因本故事变化）                                                                   | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验证（[specs/006 tasks](../../../specs/006-us220-update-push-semantics/tasks.md)）：AC#1～5、8 由 SQL 回归
`update-partial-columns` / `update-owner-rls` / `update-shared-edit` / `update-denied` / `update-gone` 等用例覆盖，
全量 15 PASS、`rls-filtered-delete` FAIL 与基线一致（属 US-218）；AC#6 由 `update-push-semantics.spec.ts` 覆盖；
AC#7 由 `remote-sync.spec.ts`「pushes a completion toggle as an UPDATE …」覆盖。

## 技术笔记

- **落库方式：普通 `UPDATE`。** `build_merge_changes_payload()` 已经分别遍历 `actions.inserts` 与 `actions.updates`，
  把 UPDATE 单独下发，远端执行 `UPDATE … SET <下发的键> WHERE id = $1`。另一条思路是用远端当前行补齐拟插入行
  （`jsonb_populate_record(<当前行>, $1)` 替代 `jsonb_populate_record(null::t, $1)`），它能修症状 1、2，但修不了症状 3：
  拟插入行仍要过 INSERT 的 `WITH CHECK`，整行载荷照样被拒（已实验确认），故不采用。
  UPDATE 的下发形状（新增参数如 `p_updates`，还是在 `p_upserts` 内按行带标记）在 plan 阶段定。
- **零行生效的判定（AC#4、AC#5）。** 普通 `UPDATE` 遇到三种情况都是 `ROW_COUNT = 0` 且不报错：被 UPDATE 的 `USING` 过滤、
  被 SELECT 策略隐藏、行已不存在（前两种已实验确认，症状 4 的同一张表上 `UPDATE` 他人的行静默零行）。
  在调用方权限下三者无法区分，判定必须绕开调用方的 RLS。这与 [US-218](./US-218-supabase-rls-push-integrity.md) 阶段 A 对 DELETE 的
  「被拒与已不存在」判定是同一个问题，候选机制也相同（`SECURITY DEFINER` 存在性探针，或按该实体在 main 分支的最新日志判定）。
  **两个故事只交付一个判定原语，其机制、签名与 SQLSTATE 在两份 plan 里一次冻结，不得各写一份。**
- **行已不存在为什么抛错而不是跳过（AC#5）。** 跳过意味着该实体的源变更既不写日志也不拿远端 ID。在 US-218 阶段 B 之前，
  客户端只能靠「缺映射静默放过」消化它，而 US-218 AC#14 要关掉的正是这一行为；所以与 US-218 一致的只有抛错。
  SQLSTATE 与 42501 分开，是为了让 US-218 阶段 B 把它与 RLS 拒绝区分开，并经 US-218 AC#11 的本地对齐把该实体在本地移除。
  在 US-218 阶段 B 之前，这条错误仍会让该仓库的推送卡住（**推断**）；今天同一场景在 NOT NULL 表上是 23502、在可空表上是静默复活残缺行，
  前者行为不变，后者由数据错误变成显式错误。
- **开工条件**：本故事与 US-218（阶段 A～C）的 plan 全部完成后才进入开发。存在性判定原语、AC#5 的 SQLSTATE 与
  US-218 阶段 B 的回执和错误分类互相咬合，须一次定好。
- **与 US-218 的关系**：本故事是 US-218 阶段 B 的前置。不修这里，阶段 B 的「被拒原因」会把 23502 和症状 2、3 的误报 42501
  当成真实拒绝暴露给用户。AC#4 保证 US-218 阶段 A 依赖的「UPDATE 被拒即抛 42501」不被普通 `UPDATE` 的静默零行削弱。
- **远端 SQL 与客户端的版本配合**：改 `rxdb_mutations` 的参数或载荷会让新客户端连不上旧 SQL。仓库没有参考 SQL 的版本校验：
  `rxdb_server_version()` 返回的是 `pg_catalog.version()`，即 PostgreSQL 版本。所以 plan 阶段要么保持新 SQL 兼容旧载荷，
  要么在 `website/docs/migration/` 写明「先升级远端 SQL，再升级客户端」。
- **三框架对称**：不改任何公共 API，三框架无需改动。
- **SQL 回归不在 CI 里**：同 US-218，`run-supabase-sql-security-regressions.sh` 需手工对运行中的容器执行，PR 描述贴实跑输出。

## 实现文件

| 路径                                                                                    | 说明                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docker/sql/04-rxdb-utils-functions.sql`                                                | `rxdb_mutations` 新增 `p_updates`（5 参，DROP 旧 4 参）；新增 `rxdb_batch_update`、探针 `rxdb_existing_ids`、helper `rxdb_id_array_type` |
| `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts`                          | UPDATE 单独分组为 `p_updates`，只带 `id` 与修改的列                                                                                      |
| `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                             | `mergeChanges()` 下发 `p_updates`                                                                                                        |
| `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`    | AC#1～5 与探针的 SQL 用例                                                                                                                |
| `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh` | 新用例登记进 `CASES`                                                                                                                     |
| `packages/rxdb-adapter-supabase/src/__tests__/update-push-semantics.spec.ts`            | AC#6 连真实数据库的推送 spec                                                                                                             |
| `packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts`               | 载荷形状断言随 `p_updates` 更新                                                                                                          |
| `apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts`                                    | AC#7 勾选推送用例                                                                                                                        |
| `packages/rxdb-adapter-supabase/README.md`、`website/docs/adapters/supabase.md`         | `rxdb_mutations` 参数、UPDATE 语义、错误码与探针已知限制                                                                                 |
| `website/docs/migration/supabase-update-push.md`                                        | 先升级远端 SQL 再升级客户端；新旧组合与报错特征                                                                                          |

## References

- [US-218 Supabase 远端启用 RLS 时的推送完整性](./US-218-supabase-rls-push-integrity.md)
- PostgreSQL 文档：[INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- PostgreSQL 文档：[Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
