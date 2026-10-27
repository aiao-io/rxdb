---
id: US-223
title: Supabase 直写路径的 UPDATE 落库语义
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-10-27
updated: 2026-10-27
tags: [adapter, supabase, rls, mutations]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改 `RxDBAdapterSupabase.mutations()` 的修改半边；推送路径已由 US-220 改完
- [x] Negotiable (可协商): 修改载荷的形状复用 US-220 的 `p_updates`，整实体还是逐列在 plan 定
- [x] Valuable (有价值): 启用行级安全的 Supabase 上，直写路径改行今天被 42501 误拒（真实 Supabase 复现）
- [x] Estimable (可估算): 与 US-220 同源，改一个适配器方法的载荷构造，SQL 不动
- [x] Small (小): 一个适配器方法 + 复现用例翻转
- [x] Testable (可测试): 复现 spec 的两条用例从「断言被拒」翻成「断言改成功」
-->

# 用户故事：Supabase 直写路径的 UPDATE 落库语义

## 作为/我想要/以便

**作为** 在启用了行级安全（RLS）的 Supabase 上直接写库的应用开发者
**我想要** `save()` 修改一行时按普通 UPDATE 落库
**以便** 改自己的行、改共享编辑表上别人的行，不会被只针对插入的策略误拒

## 症状

[US-220](US-220-supabase-update-push-semantics.md) 只改了推送路径（`mergeChanges`）。直写路径
[`RxDBAdapterSupabase.mutations()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)（仓库 `save()` 直写 Supabase 时走这里）
仍把修改并进 upsert：

```ts
const upserts = [
  ...build_upsert_params(options.create, userId, 'insert'),
  ...build_upsert_params(options.update, userId, 'update')
];
```

`rxdb_mutations` 对 `p_upserts` 执行 `INSERT … ON CONFLICT DO UPDATE`，拟插入行要先过 INSERT 策略与 `WITH CHECK`。
真实 Supabase 上的复现（[`mutations-update-rls-repro.spec.ts`](../../../packages/rxdb-adapter-supabase/src/__tests__/mutations-update-rls-repro.spec.ts)，
夹具表 `rls_mutations_owner` / `rls_mutations_shared` 在 `docker/sql/03-business-tables.sql`）：

- owner 型策略（`FOR ALL USING ("createdBy" = auth.uid()::text)`）：改自己的行被 `SupabaseDataError` 42501 拒绝，行不变——
  修改载荷不带 `createdBy`，拟插入行过不了 `WITH CHECK`；
- 共享编辑型（INSERT 策略比 UPDATE 窄）：改别人的行同样被 42501 拒绝。

这两条用例今天断言的就是「被拒」。

## 范围边界

### In Scope

- `mutations()` 的 `options.update` 改经 `p_updates` 下发（普通 UPDATE），复用 US-220 的 `rxdb_batch_update` 与 `RX001`（行已不存在）判定
- `options.create` 仍走 `p_upserts`（INSERT），审计字段的注入语义不变（`createdBy` 只在新增时写）
- 复现 spec 的两条用例翻成正向断言，并补「UPDATE 策略本身拒绝」与「行已不存在」两条

### Out of Scope

- 推送路径（US-220 已交付）
- 23505 / 23502 / 23514 是否计为被拒（[roadmap 零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带)里「待评估」的一条）
- 推送路径上级联删除的变更日志（[US-224](US-224-supabase-cascade-delete-change-log.md)）

## 验收标准

| #   | 前置条件                                           | 操作                     | 预期结果                                                     | 状态 |
| --- | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------ | ---- |
| 1   | owner 型 RLS（`rls_mutations_owner`），自己的行    | `mutations()` 修改       | 成功，行已更新，`createdBy` 不变                             | ⬜   |
| 2   | 共享编辑型 RLS（`rls_mutations_shared`），别人的行 | `mutations()` 修改       | 成功，行已更新                                               | ⬜   |
| 3   | UPDATE 策略本身不允许改这一行                      | `mutations()` 修改       | 抛 `SupabaseDataError` 42501，行不变                         | ⬜   |
| 4   | 行已被删除                                         | `mutations()` 修改       | 抛 `RX001`，与推送路径同口径                                 | ⬜   |
| 5   | 同一批里有新增也有修改                             | `mutations()`            | 新增走 INSERT、修改走 UPDATE，整批一个事务，任一失败整批回滚 | ⬜   |
| 6   | 没开 RLS 的表                                      | `mutations()` 新增与修改 | 结果与改动前一致（现有 Supabase 适配器单测与 e2e 全绿）      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 修法与 US-220 同源：推送路径的 `build_merge_changes_payload` 已把修改写成 `p_updates`（只含 id、修改的列与 `updatedBy`），
  `rxdb_mutations` 也已带 `p_updates` 参数，SQL 不用改。
- 直写路径手里是整实体，没有逐列差异：整实体下发（等同全列 UPDATE）还是从实体缓存取修改的列，在 plan 定。

## 实现文件

- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` — `mutations()` 的修改半边
- `packages/rxdb-adapter-supabase/src/__tests__/mutations-update-rls-repro.spec.ts` — 复现用例翻成正向断言

## References

- [US-220 Supabase 推送 UPDATE 的落库语义](US-220-supabase-update-push-semantics.md) — 推送路径的同一缺陷
- [US-218 Supabase 远端启用 RLS 时的推送完整性](US-218-supabase-rls-push-integrity.md)
