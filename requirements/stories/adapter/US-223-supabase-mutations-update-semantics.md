---
id: US-223
title: Supabase 直写路径的 UPDATE 落库语义
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-27
updated: 2026-10-28
tags: [adapter, supabase, rls, mutations]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改 `RxDBAdapterSupabase.mutations()` 的修改半边；推送路径已由 US-220 改完
- [x] Negotiable (可协商): 复用 US-220 的 `p_updates`，直写按序列化整实体更新，不新增逐列脏追踪
- [x] Valuable (有价值): 启用行级安全的 Supabase 上，直写路径改行今天被 42501 误拒（真实 Supabase 复现）
- [x] Estimable (可估算): 适配器拆分载荷，SQL 的 UPDATE 返回最终行并保留原有计数函数
- [x] Small (小): 一个适配器方法、UPDATE 返回行通道与对应回归
- [x] Testable (可测试): owner / 共享编辑正向用例、拒绝 / 已删除错误与返回行回填均可断言
-->

# 用户故事：Supabase 直写路径的 UPDATE 落库语义

## 作为/我想要/以便

**作为** 在启用了行级安全（RLS）的 Supabase 上直接写库的应用开发者
**我想要** `save()` 修改一行时按普通 UPDATE 落库
**以便** 改自己的行、改共享编辑表上别人的行，不会被只针对插入的策略误拒

## 修复前症状（`7bb16a90`）

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

修复前这两条用例断言的是「被拒」。实现中的 UPDATE 还必须返回服务器实际写入的行：只返回计数会让
`mutations()` 丢失修改结果，无法把服务器生成的 `updatedAt` 等值回填给实体。

## 范围边界

### In Scope

- `mutations()` 的 `options.update` 改经 `p_updates` 下发（普通 UPDATE），保留 `RX001`（行已不存在）判定
- 直写载荷使用序列化后的整实体：`id` 只用于定位，`createdBy` 不下发，其余出现的列参与 UPDATE；不新增逐列脏追踪
- 直写 UPDATE 经 `UPDATE … RETURNING` 返回服务器实际写入的行，连同新增结果返回适配器，供实体回填服务器字段
- 推送与原计数 RPC 保持无 RETURNING 的执行方式，不因直写的返回行需求收紧其修改后行可见性或全列 SELECT 权限
- `options.create` 仍走 `p_upserts`（INSERT），审计字段的注入语义不变（`createdBy` 只在新增时写）
- 复现 spec 的两条用例翻成正向断言，并补「UPDATE 策略本身拒绝」与「行已不存在」两条

### Out of Scope

- 推送路径（US-220 已交付）
- 23505 / 23502 / 23514 是否计为被拒（[roadmap 零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带)里「待评估」的一条）
- 推送路径上级联删除的变更日志（[US-224](US-224-supabase-cascade-delete-change-log.md)）

## 验收标准

| #   | 前置条件                                           | 操作                     | 预期结果                                                     | 状态 |
| --- | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------ | ---- |
| 1   | owner 型 RLS（`rls_mutations_owner`），自己的行    | `mutations()` 修改       | 成功，行已更新，`createdBy` 不变                             | ✅   |
| 2   | 共享编辑型 RLS（`rls_mutations_shared`），别人的行 | `mutations()` 修改       | 成功，行已更新                                               | ✅   |
| 3   | UPDATE 策略本身不允许改这一行                      | `mutations()` 修改       | 抛 `SupabaseDataError` 42501，行不变                         | ✅   |
| 4   | 行已被删除                                         | `mutations()` 修改       | 抛 `RX001`，与推送路径同口径                                 | ✅   |
| 5   | 同一批里有新增也有修改                             | `mutations()`            | 新增走 INSERT、修改走 UPDATE，整批一个事务，任一失败整批回滚 | ✅   |
| 6   | 没开 RLS 的表                                      | `mutations()` 新增与修改 | 结果与改动前一致（现有 Supabase 适配器单测与 e2e 全绿）      | ✅   |
| 7   | 服务器在 UPDATE 时生成 `updatedAt` 等字段          | `mutations()` 修改       | 返回实际写入的完整行，实体回填值与数据库一致                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 推送路径的 `p_updates` 只含 id、变化的列与 `updatedBy`；直写路径使用序列化后的整实体，不从缓存推导差异。
  两条路径都不下发 `createdBy`，调用角色仍需目标表 UPDATE / SELECT 权限，并满足相应 RLS 策略。
- `rxdb_execute_batch_update` 共用普通 UPDATE 与 denied / gone 判定，通过 `p_return_rows` 决定是否执行
  RETURNING，返回 `{updated, rows}`。`rxdb_batch_update_rows` 以 `SECURITY INVOKER` 调用返回行模式；
  原 `rxdb_batch_update` 调用无 RETURNING 模式，保留整数计数、原有列权限与 RLS 可见性语义。
- `rxdb_mutations_apply_group` 只在直写（`p_skip_sync = false`）把 UPDATE 的最终行并入 `upserted` 数组，
  `mutations()` 由这份返回值组装结果。推送（`p_skip_sync = true`）沿用计数入口，不额外返回修改行；
  `updated` 在两条路径都提供计数。直写不启用逐实体回执，任一写入失败整批回滚。
- 部署先更新 `docker/sql/02-rxdb-sync-functions.sql` 与 `04-rxdb-utils-functions.sql`，再升级客户端；
  `01-rxdb-system-tables.sql` 无变化，无需为本故事重建系统表。升级步骤见[迁移说明](../../../website/docs/migration/supabase-update-push.md)。

## 验证记录

验证日期：2026-10-28。AC#1～7 全部通过，门禁通过、待评审；尚未合并，不标 Done。

- 先写失败回归，再实现并转绿：直写载荷不再混入 upsert，owner / 共享编辑 RLS 正向修改、拒绝与已删除错误、整批回滚、服务器最终行回填均有覆盖。列级 SELECT 权限回归同时验证原计数 UPDATE 不要求读取无关列。
- 与 US-224 共同完成完整 affected 门禁：49 项任务、4 个受影响项目、36 项依赖任务全部通过。
- Supabase 适配器 43 个 spec 文件、630 个用例通过；应用单测 50 个、本地模式 e2e 4 个、远端模式 e2e 4 个通过。
- SQL 安全回归 36 个独立用例及 `all` 单事务组合全部通过；脚本套件已执行版本 489 个用例通过。
- 适配器覆盖率：Lines 97.52%、Statements 96.65%、Functions 97.71%、Branches 88.20%，四项均达到 80% 门槛。

## 实现文件

- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` — `mutations()` 的修改半边
- `docker/sql/04-rxdb-utils-functions.sql` — UPDATE 返回行、兼容计数入口与事务结果汇总
- `packages/rxdb-adapter-supabase/src/__tests__/mutations-update-rls-repro.spec.ts` — 复现用例翻成正向断言
- `packages/rxdb-adapter-supabase/src/__tests__/mutations-update-payload.spec.ts` — INSERT / UPDATE 载荷拆分、完整结果与审计字段回归
- `packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts` — 旧直写断言对齐普通 UPDATE 与服务器返回行
- `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql` — UPDATE 错误、返回行与计数入口列权限回归
- `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh` — 独立用例与单事务组合执行入口

## References

- [US-220 Supabase 推送 UPDATE 的落库语义](US-220-supabase-update-push-semantics.md) — 推送路径的同一缺陷
- [US-218 Supabase 远端启用 RLS 时的推送完整性](US-218-supabase-rls-push-integrity.md)
