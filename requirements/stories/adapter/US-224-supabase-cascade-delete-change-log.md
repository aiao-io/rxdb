---
id: US-224
title: Supabase 推送路径上级联删除的子行不写变更日志
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-27
updated: 2026-10-29
tags: [adapter, supabase, sync, change-log]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动推送路径（`p_skip_sync = true`）的日志来源；触发器模式不变
- [x] Negotiable (可协商): 服务端触发器捕获实际删除，不在客户端预测级联
- [x] Valuable (有价值): 一端删父行，其它端拉不到被级联删掉的子行，各端数据静默分叉（回归 SQL 复现）
- [x] Estimable (可估算): 同步触发器与推送事务共享删除上下文，捕获实际删除并按源日志之后统一写入，保留现有回执及重试协议
- [x] Small (小): 两个参考 SQL 文件与级联日志回归
- [x] Testable (可测试): SQL 精确计数日志、检查完整快照，浏览器验证两端拉取结果
-->

# 用户故事：Supabase 推送路径上级联删除的子行不写变更日志

## 作为/我想要/以便

**作为** 多端同步同一个 Supabase 库的用户
**我想要** 一端删掉父行、被外键 `ON DELETE CASCADE` 连带删掉的子行，其它端也能拉到这些删除
**以便** 各端的数据一致，不留只在本地存在的幽灵子行

## 修复前症状（`7bb16a90`）

推送路径调 `rxdb_mutations(…, p_skip_sync = true)`：同步触发器在这条路上不记日志，日志只来自客户端随批下发的 `p_changes`。
客户端只推了父行的删除，数据库按外键级联删掉的子行没有任何一条 `rxdb_change`，其它端拉取时收不到，子行留在它们的本地库里。

触发器模式（`p_skip_sync = false`）是对照：级联删掉的子行各落一条 DELETE 日志。两种模式都由回归 SQL
`rxdb_sql_regression.test_cascade_delete_logging()` 固定（[`supabase-sql-security-regressions.sql`](../../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)，
夹具表 `cascade_parent_ids` / `cascade_child_ids`），修复前推送路径那一段断言的是「子行 0 条日志」。

## 范围边界

### In Scope

- 推送路径上，被级联删除的子行各有一条 DELETE 变更日志，其它端拉取后本地子行被删掉
- 服务端既有 `SECURITY DEFINER` 同步触发器捕获实际删除的完整 `OLD`，RPC 在源日志之后统一写入隐式 DELETE 日志
- 显式删除沿用客户端日志与映射；触发器捕获实际删除的 `OLD`，避免重复日志并修正最终回执
- 隐式级联日志不携带推送端的 `clientId` / `localId`，使推送端自己也能拉回未在本地显式删除的子行
- 同批新增或修改子行后又删除父行时，隐式 DELETE 排在源 INSERT / UPDATE 之后，拉取不会把已删子行复活
- 回归 SQL 的复现段翻成正向断言

### Out of Scope

- 触发器模式（今天已正确）
- 本地 SQLite / PGlite 后端上的级联语义（不经过 `rxdb_mutations`）
- 直写路径的 UPDATE 语义（[US-223](US-223-supabase-mutations-update-semantics.md)）

## 验收标准

| #   | 前置条件                                                                              | 操作                                 | 预期结果                                                                                                      | 状态 |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 父表与子表都启用同步，子表外键 `ON DELETE CASCADE`                                    | 推送父行删除（`p_skip_sync = true`） | 每个被级联删除的子行各有一条 DELETE 日志                                                                      | ✅   |
| 2   | 两个客户端同步同一个库                                                                | A 删父行并推送，B 拉取               | B 本地的父行与子行都被删除                                                                                    | ✅   |
| 3   | 客户端在同一批里已显式删了子行                                                        | 推送                                 | 每个子行只有一条 DELETE 日志，不重复                                                                          | ✅   |
| 4   | 触发器模式（`p_skip_sync = false`）                                                   | 删父行                               | 行为不变（回归 SQL 的对照段照常通过）                                                                         | ✅   |
| 5   | 子行对推送角色不可见，但外键仍实际级联删除                                            | 推送父行删除                         | 保留与触发器模式一致的完整 `OLD` 日志；推送端也可拉取隐式子行删除                                             | ✅   |
| 6   | 显式子行删除先被策略拒绝，随后被允许的父删除级联                                      | 同批推送并获取回执                   | 子行最终为 `applied`，源日志只写一次，最终 DELETE 快照取实际删除的 `OLD`（含 `id`），按 `id` 过滤的拉取能拿到 | ✅   |
| 7   | 级联批次已成功，或逐实体写入发生失败                                                  | 重试成功批次，或继续同事务后续操作   | 不重复写级联日志；失败子事务不留下日志，事务设置不泄漏到后续调用                                              | ✅   |
| 8   | 同批新增或修改子行，并删除其父行                                                      | 推送后由另一客户端按日志顺序拉取     | 源 INSERT / UPDATE 在前、隐式 DELETE 在后，最终子行不存在，不被复活                                           | ✅   |
| 9   | 客户端 id 拼写与存储表示不同（如 `numeric` 的 `1` 与 `1.00`），或同步启用在分区根表上 | 推送显式删除（经根表或叶分区）       | 每行只有一条带源映射的 DELETE 日志，不追加隐式重复                                                            | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- `rxdb.sync_enabled = false` 时，DELETE 触发器把所有实际 DELETE 按（分区根表 oid，`OLD.id::text`）缓存在事务上下文
  `rxdb.captured_deletes` 中，保存 namespace、entity 与 `OLD`，不立即写日志；叶分区上克隆的触发器按同一分区根取键。
  业务写完成后，`rxdb_mutations` 按 id 列类型的等值关系（与 DELETE 的 `id = ANY(...)` 同一判据）把显式删除与捕获配对：
  uuid 大小写、`numeric` 的 `1` 与 `1.00` 认成同一行；配上的沿用客户端源键与映射，其余捕获是隐式删除。
- RPC 在业务写完成后，先按源顺序整理客户端日志，再追加隐式 DELETE，通过一次 `rxdb_insert_changes` 写入；
  写入使用 `WITH ORDINALITY` 与 `ORDER BY` 保留顺序。这样同批 INSERT / UPDATE 子行再删除父行时，
  拉取顺序为源变化在前、隐式 DELETE 在后，子行不会因晚到的源日志复活。两部分日志与业务写在同一事务里回滚。
- 隐式日志的 `clientId` / `localId` 为 NULL，不会被推送端当作自己的回声排除。显式日志保留源客户端映射；
  该实体最后一条 DELETE 一律以捕获的 `OLD` 为快照：客户端 DELETE 的 `inversePatch` 按协议不含 `id`，
  对调用方不可见的行只靠它会被按 `id` 过滤的拉取漏掉。隐式日志保留
  `beforeData = OLD`、`afterData = null`、`snapshotComplete = true`。
- 回执以实际删除结果为准：显式子行先被策略拒绝、随后被同批父行级联删掉时，最终改为 `applied`，
  清除先前拒绝原因。纯重试由现有幂等键跳过实体副作用，不会再次产生隐式日志。
- `rxdb.sync_enabled` 与 `rxdb.captured_deletes` 在入口保存、正常出口恢复；失败子事务内的行、日志与设置
  一起回滚，不能污染后续调用。
- 外键动作可删除调用方按 RLS 看不到的行。完整 `OLD` 进入日志沿用现有触发器模式的可读边界，
  不只暴露 id；业务表 RLS 不等于日志的逐行授权隔离。需要隔离日志读取的应用必须另行限制日志访问。
- 部署先在同一数据库事务中按 02 → 04 更新 `docker/sql/02-rxdb-sync-functions.sql` 与 `04-rxdb-utils-functions.sql`
  并一起提交，再升级客户端；不能原子执行时须在维护窗口禁止写入，避免新触发器与旧 RPC 混用。
  `01-rxdb-system-tables.sql` 无变化。升级与边界见[迁移说明](../../../website/docs/migration/supabase-update-push.md)。

## 验证记录

验证日期：2026-10-28，评审修复复验 2026-10-29。AC#1～9 全部通过，待评审；尚未合并，不标 Done。

- 先写失败回归，再实现并转绿。级联日志缺失及混合批次按 DELETE → INSERT 顺序复活子行的回归先红后绿；完整 `OLD`、显式删除去重、最终回执、幂等重试、事务设置恢复与 UUID 输入表示均有覆盖。
- 与 US-223 共同完成完整 affected 门禁：49 项任务、4 个受影响项目、36 项依赖任务全部通过。
- Supabase 适配器 43 个 spec 文件、630 个用例通过；应用单测 50 个、本地模式 e2e 4 个、远端模式 e2e 4 个通过；两客户端同步验证父行及隐式子行最终均不存在。
- SQL 安全回归 36 个独立用例及 `all` 单事务组合全部通过；脚本套件已执行版本 489 个用例通过。
- PR 复核补充：大写 UUID 子行先被 RLS 拒绝、随后由父行级联删除及重试的组合验证通过，保留源回执键、映射与完整快照；02 / 04 同事务升级与中途 SQL 错误整组回滚实测通过。
- 适配器覆盖率：Lines 97.52%、Statements 96.65%、Functions 97.71%、Branches 88.20%，四项均达到 80% 门槛。
- 评审修复（2026-10-29）：三个反例先写回归，在修复前的 02 / 04 上实测为红——RLS 隐藏的显式子行带常规 `inversePatch` 时最终快照缺 `id`、按 `id` 过滤拉不到删除（`cascade-hidden-inverse-patch`）；`numeric(8,2)` 与无修饰 `numeric`（存 `1.00`、客户端发 `"1"`）主键的显式删除追加隐式重复日志（`cascade-numeric-keys`）；经分区根表或叶分区的显式删除追加隐式重复日志（`cascade-partition-keys`）。修复后 SQL 安全回归 39 个独立用例及 `all` 单事务组合全部通过（PostgreSQL 17.6）；适配器 43 个 spec 文件、630 个用例通过，覆盖率 Lines 97.53%、Statements 96.66%、Functions 97.71%、Branches 88.23%；lint / typecheck 通过。完整 affected 门禁与 e2e 未在本轮重跑。

## 实现文件

- `docker/sql/02-rxdb-sync-functions.sql` — 实际 DELETE 与完整 `OLD` 捕获
- `docker/sql/04-rxdb-utils-functions.sql` — 删除上下文、回执与快照收口、源日志与隐式日志顺序、事务设置恢复
- `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql` — 复现段翻成正向断言
- `packages/rxdb-adapter-supabase/src/__tests__/cascade-delete-sync.spec.ts` — 两客户端拉取与混合批次不复活回归
- `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh` — 39 个独立用例与 `all` 单事务组合执行入口

## References

- [US-218 Supabase 远端启用 RLS 时的推送完整性](US-218-supabase-rls-push-integrity.md) — 推送路径的日志由客户端随批下发
- [US-223 Supabase 直写路径的 UPDATE 落库语义](US-223-supabase-mutations-update-semantics.md)

- [PR #170](https://github.com/aiao-io/rxdb/pull/170)
