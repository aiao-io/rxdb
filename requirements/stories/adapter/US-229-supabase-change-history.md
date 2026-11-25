---
id: US-229
title: Supabase 远端变更历史：每次业务写入记完整前后快照，只对能编辑的成员开放
status: Backlog
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-25
updated: 2026-11-25
tags: [adapter, supabase, sql, history, audit, security]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只加历史表、写入点与读取 RPC；同步日志与同步协议不变，不依赖 US-034
- [x] Negotiable (可协商): 判定函数的名字与签名、读取 RPC 的分页形状、保留期限留待实现前定
- [x] Valuable (有价值): 分区实体在远端没有任何修改过程的记录；未分区日志的正文对全部登录用户可读，算不上受控的历史
- [x] Estimable (可估算): 一张系统表 + 三个写入点 + 一个读取 RPC 与判定函数 + 生产升级 + 适配器读取方法 + demo 抽屉
- [x] Small (小): 一个 PR
- [x] Testable (可测试): SQL 回归套件逐条断言写入与可见性
-->

# 用户故事：Supabase 远端变更历史

## 作为/我想要/以便

**作为** 管理租户数据的成员（以及将来做审核、对比、回滚的管理功能）
**我想要** 远端记下每一次增删改的完整前后快照、谁改的、从哪条路径改的
**以便** 以后能按条目查看、对比和管理不同的更新，而同步日志继续不带正文

## 现状

1. 分区实体在远端没有修改过程的正文记录。[`rxdb_log_change_trigger`](../../../docker/sql/02-rxdb-sync-functions.sql) 写分区日志时四个正文字段都置空：

   ```sql
   CASE WHEN v_is_bucketed THEN NULL ELSE v_patch END,
   ```

   `rxdb_strip_bucket_change_payload` 再兜底：「即使日志经 SECURITY DEFINER 推送入口或受信任的维护脚本写入，bucket 行也不能重新带正文」。这条规则来自 [US-033 的试验记录](../core/US-033-bucket-log-spike.md)：同步日志按区开放读取，带正文会让换区后的旧成员、后来加入的成员和 anon 绕过列权限读到内容。

2. 未分区实体的日志带正文，但那是同步通道，不是受控的历史：`rxdb_change` 的未分区日志对全部已登录身份可读（[US-225](./US-225-supabase-sync-protocol-access-baseline.md)），不按行的编辑权限收窄。

3. 日志不记操作者。`rxdb_change` 的列只有客户端自报的 `clientId` / `localId`，没有 `auth.uid()`（[`01-rxdb-system-tables.sql`](../../../docker/sql/01-rxdb-system-tables.sql)）。

复验方式：第 1、3 点 grep 对应符号与建表语句；在 dev-rxdb-supabase 以 Alice 身份用「模拟服务端变更」编辑一件商品，Studio 里新的 `rxdb_change` 行只有区、实体与行 id。

## 范围边界

### In Scope

- 新系统表 `rxdb_change_history`：每次业务写入一条，记录 `patch` / `inversePatch` / `beforeData` / `afterData`、操作者 `auth.uid()`、来源（直写触发器 / 推送 / 服务端级联）、推送的 `clientId` / `localId`、写入时所在的区与时间。开 RLS 并 `FORCE`，客户端角色不能直接读写。
- 写入点与业务写在同一事务：直写走 `rxdb_log_change_trigger`；推送走 `rxdb_mutations`，用它已经固化的前后快照；服务端级联删除走 US-224 捕获的 OLD。只记生效的写入，被拒、回滚的不记。
- 覆盖所有登记同步的表：分区表与未分区表走同一套机制。
- 读取：`SECURITY DEFINER` 的读取 RPC，只返回调用者**当前**有编辑权限的行的历史，并按列权限逐列脱敏。可见性按每条历史记录时的行（删除取前像）判定。
- 编辑权限的判定交给部署方覆盖的函数，与 `rxdb_caller_buckets()` 同一模式。平台默认：未分区表按表级写权限，分区表按区；demo 按租户成员资格实现，与 `catalog_items_member_*` 策略同口径。
- 生产升级：GRANT 写进参考 SQL，签名同步到 `production/rxdb-change-grants.sql`；迁移说明写在 `website/docs/migration/`。
- 适配器：`RxDBAdapterSupabase` 增加读历史的方法（补 TSDoc）。
- demo：商品详情加「变更历史」，只对有编辑权限的成员显示。

### Out of Scope

- 同步日志的规则：分区日志仍不带正文，未分区日志保持现状。
- 基于历史的回滚、审批与「仅经 PR」合并：本故事只记录与读取。
- 保留期限与归档：默认永久保留，量级评估写在技术笔记里；归档策略另行立项。
- 历史的实时通知。
- 非 main 分支：只写日志、不写业务表，没有业务写入可记。

## 验收标准

| #   | 前置条件                                                    | 操作                                          | 预期结果                                                                                                   | 状态 |
| --- | ----------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 业务表登记了同步                                            | 直写一行（触发器模式）                        | 历史里有一条：完整前后快照、`patch` / `inversePatch`、操作者为调用者、来源为直写、记下当时所在的区         | ⬜   |
| 2   | 同上                                                        | 经 `rxdb_mutations` 推送新增、修改、删除      | 每个生效的实体一条历史，带完整快照、操作者、`clientId` / `localId`，来源为推送                             | ⬜   |
| 3   | 父行删除会级联删除子行                                      | 推送只删父行                                  | 被级联删除的子行也各有一条历史，来源为服务端级联                                                           | ⬜   |
| 4   | 推送里有一个实体被 RLS 拒绝                                 | `rxdb_mutations`                              | 被拒的实体没有历史；生效的实体照常记录                                                                     | ⬜   |
| 5   | 未分区表（`todos`）                                          | 直写与推送                                    | 同样记录历史                                                                                               | ⬜   |
| 6   | 完成 AC#1～5                                                | 查看 `rxdb_change`                            | 分区日志仍不带正文，未分区日志与现在一致                                                                   | ⬜   |
| 7   | anon、已登录身份                                            | 直接 `SELECT` 历史表                          | 都被拒绝                                                                                                   | ⬜   |
| 8   | anon；已登录但不是该商品租户成员的身份                      | 调读取 RPC 查一件商品的历史                   | 都得到零条                                                                                                 | ⬜   |
| 9   | 该商品所属租户的成员                                        | 调读取 RPC                                    | 得到这件商品的全部历史，包括它在公开区时的修改                                                             | ⬜   |
| 10  | 调用者没有某列的列权限                                      | 调读取 RPC                                    | 四个正文字段里都不含这一列                                                                                 | ⬜   |
| 11  | 一件商品从租户 1 改到租户 2                                 | 两个租户的成员分别调读取 RPC                  | 改动前的历史只对租户 1 成员可见，改动后的只对租户 2 成员可见                                               | ⬜   |
| 12  | 一件商品已被删除                                            | 该租户成员调读取 RPC                          | 仍能看到它的全部历史，按删除前的行判定可见性                                                               | ⬜   |
| 13  | 已有数据的库                                                | 执行生产升级命令两次                          | 幂等；历史表与 RPC 的授权正确，anon 没有执行权                                                             | ⬜   |
| 14  | dev-rxdb-supabase，Alice 编辑过一件星河零售的商品           | 打开这件商品的「变更历史」                    | 按时间列出每次修改的前后值与操作者；访客与 Bob 看不到入口                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～13 由 SQL 回归套件（`rxdb-adapter-supabase:sql-security-regressions`）覆盖，适配器的读取方法另由真栈用例覆盖；AC#14 由 `dev-rxdb-supabase-e2e` 覆盖。

## 技术笔记

- **表结构**（草案）：`id bigserial`、`changeId`（对应 `rxdb_change.id`，可空）、`namespace`、`entity`、`entityId`、`bucket`、`type`、`patch`、`inversePatch`、`beforeData`、`afterData`、`actor uuid`、`role`、`source`（`trigger` / `push` / `cascade`）、`clientId`、`localId`、`branchId`、`createdAt`。索引按 `(namespace, entity, "entityId", "createdAt")`。
- **写入点**：
  - 直写：`rxdb_log_change_trigger` 本就是 `SECURITY DEFINER`，在写日志的同一处按完整 OLD / NEW 写历史，不受分区剥正文的影响；
  - 推送：`rxdb_mutations` 第 4 步只记 `applied` 实体，复用 `normalized_changes` 的快照，经 `SECURITY DEFINER` 入口写入（与 `rxdb_insert_changes` 同一做法）；
  - 级联：用 `rxdb.captured_deletes` 里捕获的 OLD。
- **可见性**：读取 RPC 对每条历史取记录时的行（`afterData`，删除取 `beforeData`），交给部署方的判定函数判断调用者当前能否编辑。平台默认实现是：未分区表用 `has_table_privilege(..., 'UPDATE')`，分区表看该区是否在调用者可编辑的区里。demo 覆盖为「调用者是行的 `tenantId` 对应租户的成员」。
- **脱敏**：对四个正文字段逐列用 `has_column_privilege(..., 'SELECT')` 过滤。
- **量级**：每次生效的业务写入一条，量级与 `rxdb_change` 同阶；先不做归档，故事关闭前补一次量级评估。
- **与 US-038 的关系**：US-038 会把 `rxdb_mutations` 第 3 步重构成三遍执行，历史写入要放在只记 `applied` 实体的第 4 步，不受重构影响；重构时要保留。
- `search_path` 与其他 `SECURITY DEFINER` 函数一样固定为 `pg_catalog, pg_temp`。

## 实现文件

- `docker/sql/01-rxdb-system-tables.sql` — `rxdb_change_history`
- `docker/sql/02-rxdb-sync-functions.sql` — 直写的历史写入
- `docker/sql/04-rxdb-utils-functions.sql` — 推送与级联的历史写入、读取 RPC、默认判定函数、GRANT
- `docker/sql/production/rxdb-change-grants.sql` — 签名与授权
- `apps/dev-rxdb-supabase/supabase/catalog-demo.sql` — demo 的判定函数
- `packages/rxdb-adapter-supabase/src/` — 读历史的方法
- `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`、`run-supabase-sql-security-regressions.sh` — 回归用例
- `apps/dev-rxdb-supabase/src/app/catalog/` — 「变更历史」抽屉
- `website/docs/migration/` — 迁移说明

## References

- [US-033 的试验记录](../core/US-033-bucket-log-spike.md) — 同步日志不带正文的依据
- [US-034 分区实体的本地写入](../core/US-034-bucketed-entity-local-writes.md)
- [US-224 Supabase 推送路径上级联删除的子行不写变更日志](./US-224-supabase-cascade-delete-change-log.md) — 级联删除的捕获
- [US-225 Supabase 日志同步只对已登录身份开放](./US-225-supabase-sync-protocol-access-baseline.md)
- [US-038 双向一对一的实体能开同步](../core/US-038-bidirectional-one-to-one-sync.md) — 同样改 `rxdb_mutations`
