---
id: US-220
title: Supabase 推送只改了部分列的 UPDATE
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-10-05
updated: 2026-10-05
tags: [adapter, supabase, sync, rls]
---

<!--
INVEST 检查清单:
- [x] Independent: 不依赖 US-218；只改 UPDATE 在远端的落库方式，不改任何 TypeScript 公共契约
- [x] Negotiable: 拆出独立的 UPDATE 语句，还是用远端当前行补齐载荷，在 plan 阶段定
- [x] Valuable: Todo 只改 `completed` 的推送在参考 schema 上就会 23502，开了 owner 型 RLS 的表连自己的行都改不了
- [x] Estimable: 参考 SQL 一个函数 + 载荷构造一处 + 回归用例
- [x] Small: 一个 PR
- [x] Testable: 两条失败路径都已在本地 Supabase 容器实跑复现
-->

# 用户故事：Supabase 推送只改了部分列的 UPDATE

## 作为/我想要/以便

**作为** 用 Supabase 作远端、在本地只改了实体部分字段的应用开发者
**我想要** 这类 UPDATE 推送后只改动远端行里的对应列
**以便** 不会因为没带上的 NOT NULL 列或 RLS 的所有权列，让一次普通的修改推不上去、卡住整个仓库的同步

## 现状与证据

本地 UPDATE 产生的 `patch` 只含变更过的列。依据：

- [`IRxDBChange`](../../../packages/rxdb/src/system/change.ts) 的契约注释写明「UPDATE: `patch = { 变更字段的新值 }`（仅记录变更字段，增量数据，**不含 id**）」；
- SQLite 的更新触发器（[`trigger_sql.ts`](../../../packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts)）逐列以 `WHERE OLD.col IS NOT NEW.col` 收集，
  PGlite 的同名文件（[`trigger_sql.ts`](../../../packages/rxdb-adapter-pglite/src/table/trigger_sql.ts)）用 `IS DISTINCT FROM`；
- [`compactChanges()`](../../../packages/rxdb/src/sync-contract/compact-changes.ts) 把同一实体的多条 UPDATE 用 `Object.assign` 合并，结果仍是部分列。

推送时 [`build_merge_changes_payload()`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 把它组装成
`{ id, ...patch, updatedBy }` 交给 [`rxdb_batch_upsert`](../../../docker/sql/04-rxdb-utils-functions.sql)。后者对每一行执行：

```sql
INSERT INTO %I.%I SELECT * FROM pg_catalog.jsonb_populate_record(null::%I.%I, $1)
 ON CONFLICT (id) DO UPDATE SET %s
```

没带上的列在「拟插入行」里都是 NULL。PostgreSQL 在判定冲突之前就对拟插入行做 NOT NULL 检查；带 `RETURNING` 的
`ON CONFLICT DO UPDATE` 还要求拟插入行通过 SELECT 策略。于是部分列 UPDATE 有两种失败，均在本地 Supabase（PostgreSQL 17.6）
容器内以 `anon` 角色、`BEGIN … ROLLBACK` 包裹实跑确认：

**症状 1：NOT NULL 列触发 23502（已实验确认）。** 参考 schema [`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)
的 `todos.title varchar NOT NULL`。对一条已存在的 todo upsert `{ id, completed: true }`，报 23502（`title` 为 NULL）。
不开 RLS 的任意 NOT NULL 表结果相同。

**症状 2：owner 型 RLS 下改自己的行误报 42501（已实验确认）。** 策略为 `FOR ALL USING (owner = uid) WITH CHECK (owner = uid)`，
对调用方自己拥有的行做只含部分列的 upsert，报 42501；同一行带上完整列则成功。拟插入行里 `owner` 是 NULL，过不了策略。
[`applyAuditFields()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) 的注释说明更新路径**刻意不下发** `createdBy`，
`mergeChanges` 的 UPDATE 载荷同样只注入 `updatedBy`。所以「按 `createdBy` 判定归属」的 RLS 策略必然命中这一条。

**客户端后果（推断，读代码得出，未实跑）。** 两种失败都让整个 `rxdb_mutations` 事务回滚，客户端走
[`throwPushFailure()`](../../../packages/rxdb-plugin-sync/src/push-repository.ts)，水位线不推进，下一轮原样重发同一批。
用户只是勾选了一条 todo，该仓库此后的推送就一直失败。

**为什么现有测试没拦住。** 连真实数据库、经推送路径的 spec 在 UPDATE 时都恰好带上了 NOT NULL 列：

- [`sync-data-integrity.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/sync-data-integrity.spec.ts)
  与 [`sync-multi-operations.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/sync-multi-operations.spec.ts) 的更新都改了 `title`；
- [`pull-push-changes.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/pull-push-changes.spec.ts) 用的是含 `title` 的 patch；
- [`filter-sync-snapshots.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/filter-sync-snapshots.spec.ts) 手工补了 `title`。

[`test-todo.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/test-todo.spec.ts) 的更新走 `SupabaseRepository.update`
的 PostgREST `.update()`，不经 `rxdb_mutations`，不受影响。

## 范围边界

### In Scope

- 推送路径（`rxdb_mutations` → `rxdb_batch_upsert`）上 UPDATE 的落库方式：只改载荷里出现的列
- UPDATE 目标行在远端已不存在时的行为，在 plan 阶段冻结并有用例固定
- 对应的 SQL 回归用例与连真实数据库的推送 spec

### Out of Scope

- 被 RLS 拒绝时的日志回收、逐实体回执与 rejected 状态（[US-218](./US-218-supabase-rls-push-integrity.md) 的范围）
- INSERT 路径：本地 INSERT 的 patch 是整行，不受本问题影响
- `SupabaseRepository.update` 的 PostgREST 直写路径
- 远端行已删、本地仍在更新这类并发冲突的解决策略

## 验收标准

| #   | 前置条件                                                                            | 操作                                                                           | 预期结果                                                                                                                           | 状态 |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 参考 schema，远端已有一条 todo                                                      | `rxdb_mutations` 推送只含 `completed`（及 `updatedAt` / `updatedBy`）的 UPDATE | 成功；`completed` 已更新，`title` 等未下发的列不变；日志写入一条 UPDATE                                                            | ⬜   |
| 2   | 业务表策略 `FOR ALL USING (owner = uid) WITH CHECK (owner = uid)`，目标行属于调用方 | 推送不含 `owner` 列的部分列 UPDATE                                             | 成功，`owner` 不变                                                                                                                 | ⬜   |
| 3   | 目标行对调用方可见，但 UPDATE 的 `USING` 策略不放行                                 | 推送部分列 UPDATE                                                              | 仍抛 42501；行未变；无新日志。改用普通 `UPDATE` 语句时，策略过滤会变成静默零行，不得因此退化为成功                                 | ⬜   |
| 4   | UPDATE 的目标行在远端已不存在                                                       | 推送部分列 UPDATE                                                              | 不复活出一条只有部分列、其余为 NULL 的新行；是拒绝还是跳过在 plan 阶段定，并以 SQL 用例固定                                        | ⬜   |
| 5   | 两个客户端连同一个真实 Supabase                                                     | 客户端 A 只改一条 todo 的 `completed` 并推送，客户端 B 拉取                    | A 推送成功、水位线推进；B 看到 `completed` 已变、`title` 不变。spec 经 `mergePushBatch` 推送路径，不走 `SupabaseRepository.update` | ⬜   |
| 6   | 既有 SQL 回归 9 条 + 本故事新增用例                                                 | `run-supabase-sql-security-regressions.sh`                                     | 全部 PASS（`rls-filtered-delete` 属 US-218，状态不因本故事变化）                                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **候选方案**（plan 阶段二选一）：
  - **拆分 INSERT 与 UPDATE**：`build_merge_changes_payload()` 已经分别遍历 `actions.inserts` 与 `actions.updates`，
    把两者分开下发，UPDATE 走 `UPDATE … SET <下发的键> WHERE id = $1`。语义最干净，但要改 `p_upserts` 的载荷形状和 `rxdb_mutations` 的签名或分支。
    普通 `UPDATE` 被 `USING` 过滤时是静默零行，必须自己检查 `ROW_COUNT` 并抛 42501，否则症状变成另一种幽灵日志（AC#3）。
  - **用远端当前行补齐拟插入行**：`jsonb_populate_record(<当前行>, $1)` 替代 `jsonb_populate_record(null::t, $1)`，
    拟插入行变成「当前行 ⊕ patch」，NOT NULL 与 SELECT 策略都按完整行判定。改动只在 `rxdb_batch_upsert` 内部，载荷形状不变；
    但对调用方不可见的行仍取不到当前行，会退回今天的行为（此时本来就该被拒，**推断**结果可接受，plan 阶段用用例确认）。
- **与 US-218 的关系**：本故事是 [US-218](./US-218-supabase-rls-push-integrity.md) 阶段 B 的前置。不修这里，
  阶段 B 的「被拒原因」会把部分列 UPDATE 的 23502 / 误报 42501 当成真实拒绝暴露给用户。本故事不依赖 US-218 阶段 A，
  但 AC#3 保证不削弱阶段 A 依赖的「UPDATE 被拒即抛 42501」。
- **三框架对称**：不改任何公共 API，三框架无需改动。
- **SQL 回归不在 CI 里**：同 US-218，`run-supabase-sql-security-regressions.sh` 需手工对运行中的容器执行，PR 描述贴实跑输出。

## 实现文件

| 路径                                                                                    | 说明                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `docker/sql/04-rxdb-utils-functions.sql`                                                | `rxdb_batch_upsert`（或新增 UPDATE 专用函数）、`rxdb_mutations` |
| `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts`                          | 若选拆分方案：分开下发 INSERT 与 UPDATE                         |
| `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`    | AC#1～4 的 SQL 用例                                             |
| `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh` | 新用例登记进 `CASES`                                            |
| `packages/rxdb-adapter-supabase/src/__tests__/`                                         | AC#5 连真实数据库的推送 spec                                    |
| `packages/rxdb-adapter-supabase/README.md`、`website/docs/api/rxdb-adapter-supabase/`   | `rxdb_batch_upsert` 语义说明同步                                |

## References

- [US-218 Supabase 远端启用 RLS 时的推送完整性](./US-218-supabase-rls-push-integrity.md)
- PostgreSQL 文档：[INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- PostgreSQL 文档：[Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
