---
id: US-224
title: Supabase 推送路径上级联删除的子行不写变更日志
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-10-27
updated: 2026-10-27
tags: [adapter, supabase, sync, change-log]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动推送路径（`p_skip_sync = true`）的日志来源；触发器模式不变
- [x] Negotiable (可协商): 服务端补日志还是客户端推送前展开级联，在 plan 定
- [x] Valuable (有价值): 一端删父行，其它端拉不到被级联删掉的子行，各端数据静默分叉（回归 SQL 复现）
- [x] Estimable (可估算): 两条候选修法都落在一处（服务端函数或推送载荷构造）
- [x] Small (小): 一条日志来源 + 复现段翻转
- [x] Testable (可测试): 回归 SQL 按实体名精确计数日志条数
-->

# 用户故事：Supabase 推送路径上级联删除的子行不写变更日志

## 作为/我想要/以便

**作为** 多端同步同一个 Supabase 库的用户
**我想要** 一端删掉父行、被外键 `ON DELETE CASCADE` 连带删掉的子行，其它端也能拉到这些删除
**以便** 各端的数据一致，不留只在本地存在的幽灵子行

## 症状

推送路径调 `rxdb_mutations(…, p_skip_sync = true)`：同步触发器在这条路上不记日志，日志只来自客户端随批下发的 `p_changes`。
客户端只推了父行的删除，数据库按外键级联删掉的子行没有任何一条 `rxdb_change`，其它端拉取时收不到，子行留在它们的本地库里。

触发器模式（`p_skip_sync = false`）是对照：级联删掉的子行各落一条 DELETE 日志。两种模式都由回归 SQL
`rxdb_sql_regression.test_cascade_delete_logging()` 固定（[`supabase-sql-security-regressions.sql`](../../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)，
夹具表 `cascade_parent_ids` / `cascade_child_ids`），今天推送路径那一段断言的就是「子行 0 条日志」。

## 范围边界

### In Scope

- 推送路径上，被级联删除的子行各有一条 DELETE 变更日志，其它端拉取后本地子行被删掉
- 选定修法：服务端在推送事务里为级联行补日志（`SECURITY DEFINER` 触发器），或客户端推送前把级联展开成显式删除
- 回归 SQL 的复现段翻成正向断言

### Out of Scope

- 触发器模式（今天已正确）
- 本地 SQLite / PGlite 后端上的级联语义（不经过 `rxdb_mutations`）
- 直写路径的 UPDATE 语义（[US-223](US-223-supabase-mutations-update-semantics.md)）

## 验收标准

| #   | 前置条件                                           | 操作                                 | 预期结果                                 | 状态 |
| --- | -------------------------------------------------- | ------------------------------------ | ---------------------------------------- | ---- |
| 1   | 父表与子表都启用同步，子表外键 `ON DELETE CASCADE` | 推送父行删除（`p_skip_sync = true`） | 每个被级联删除的子行各有一条 DELETE 日志 | ⬜   |
| 2   | 两个客户端同步同一个库                             | A 删父行并推送，B 拉取               | B 本地的父行与子行都被删除               | ⬜   |
| 3   | 客户端在同一批里已显式删了子行                     | 推送                                 | 每个子行只有一条 DELETE 日志，不重复     | ⬜   |
| 4   | 触发器模式（`p_skip_sync = false`）                | 删父行                               | 行为不变（回归 SQL 的对照段照常通过）    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 外键动作绕过行级安全：对推送端不可见的子行照样被级联删除。为它们补日志会把这些行的 id 写进 `rxdb_change`，
  与 [US-218](US-218-supabase-rls-push-integrity.md)「不写幽灵日志」的取舍要在 plan 里一起定。
- 补出的日志算不算推送端自己的回声（`clientId` 归属），决定推送端会不会再拉回这些删除，在 plan 定。

## 实现文件

- `docker/sql/04-rxdb-utils-functions.sql`（服务端补日志的修法）或 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts`（客户端展开的修法）
- `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql` — 复现段翻成正向断言

## References

- [US-218 Supabase 远端启用 RLS 时的推送完整性](US-218-supabase-rls-push-integrity.md) — 推送路径的日志由客户端随批下发
- [US-223 Supabase 直写路径的 UPDATE 落库语义](US-223-supabase-mutations-update-semantics.md)
