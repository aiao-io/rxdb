---
id: US-229
title: Supabase 远端变更历史：每次业务写入记完整前后快照，只对能编辑的成员开放
status: In Review
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-25
updated: 2026-11-26
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

| #   | 前置条件                                          | 操作                                     | 预期结果                                                                                                          | 状态 |
| --- | ------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 业务表登记了同步                                  | 直写一行（触发器模式）                   | 历史里有一条：完整前后快照、`patch` / `inversePatch`、操作者为调用者、来源为直写、记下当时所在的区                | ✅   |
| 2   | 同上                                              | 经 `rxdb_mutations` 推送新增、修改、删除 | 每个生效的实体一条历史，带完整快照、操作者、`clientId` / `localId`，来源为推送                                    | ✅   |
| 3   | 父行删除会级联删除子行                            | 推送只删父行                             | 被级联删除的子行也各有一条历史，来源为服务端级联                                                                  | ✅   |
| 4   | 推送里有一个实体被 RLS 拒绝                       | `rxdb_mutations`                         | 被拒的实体没有历史；生效的实体照常记录                                                                            | ✅   |
| 5   | 未分区表（`todos`）                               | 直写与推送                               | 同样记录历史                                                                                                      | ✅   |
| 6   | 完成 AC#1～5                                      | 查看 `rxdb_change`                       | 分区日志仍不带正文，未分区日志与现在一致                                                                          | ✅   |
| 7   | anon、已登录身份                                  | 直接 `SELECT` 历史表                     | 都被拒绝                                                                                                          | ✅   |
| 8   | anon；已登录但不是该商品租户成员的身份            | 调读取 RPC 查一件商品的历史              | 都得到零条                                                                                                        | ✅   |
| 9   | 该商品所属租户的成员                              | 调读取 RPC                               | 得到这件商品的全部历史，包括它在公开区时的修改                                                                    | ✅   |
| 10  | 调用者没有某列的列权限                            | 调读取 RPC                               | 四个正文字段里都不含这一列                                                                                        | ✅   |
| 11  | 一件商品从租户 1 改到租户 2                       | 两个租户的成员分别调读取 RPC             | 改动前的历史只对租户 1 成员可见，改动后的只对租户 2 成员可见；换租户那一条的前像与逆补丁只给也能编辑租户 1 的成员 | ✅   |
| 12  | 一件商品已被删除                                  | 该租户成员调读取 RPC                     | 仍能看到它的全部历史，按删除前的行判定可见性                                                                      | ✅   |
| 13  | 已有数据的库                                      | 执行生产升级命令两次                     | 幂等；历史表与 RPC 的授权正确，anon 没有执行权                                                                    | ✅   |
| 14  | dev-rxdb-supabase，Alice 编辑过一件星河零售的商品 | 打开这件商品的「变更历史」               | 按时间列出每次修改的前后值与操作者；访客与 Bob 看不到入口                                                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

| AC         | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1、#5、#6 | SQL 回归 `change-history`（[supabase-sql-security-regressions.sql](../../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql)）：直写按所有者分区的表与未分区表各一行，断言完整前后快照、`patch` / `inversePatch`、`actor` 为调用者、来源 `trigger`、记下当时的区；分区日志四个正文字段仍为空，未分区日志正文与改动前一致                                                                                                                                                                                                                                                                                                                  |
| #2、#4     | 同上：经 `rxdb_mutations`（`p_receipts = true`）推送新增、修改、删除，每条生效的源变更一条历史，带 `clientId` / `localId`、完整快照与来源 `push`；同批被 RLS 拒绝的实体没有历史。真栈 [catalog-local-writes.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/catalog-local-writes.spec.ts) 另验本机新建的分区实体能推上去（见技术笔记里 `rxdb_batch_upsert` 的修正）                                                                                                                                                                                                                                                                                           |
| #3         | 同上：未分区父子表，推送只删父行，外键级联删除的子行各一条来源为 `cascade` 的历史，前像取触发器捕获的 OLD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| #7、#13    | 同上：生产权限下 anon、authenticated 直接 `SELECT` 历史表得到 `42501`，anon 没有 `rxdb_entity_history` 的执行权；按目录检查历史表、序列、读取 RPC 与内部函数的授权，生产权限脚本执行两次之后不变。US-225 的升级用例先删掉历史表，按迁移指南的四份文件执行两次，表、索引、RLS 与授权到位                                                                                                                                                                                                                                                                                                                                                                                      |
| #8～#12    | SQL 回归 `change-history`（平台默认判定，含 #10 的列脱敏：没有列权限的列在四个正文字段里都不出现）；真栈 [change-history.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/change-history.spec.ts) 经适配器 `getEntityHistory` 验 demo 覆盖的租户成员判定：成员读到含公开区时的全部历史，非成员零条，anon 抛 `SupabaseDataError`；换租户之后新旧租户成员各见各的，换租户那一条新租户成员拿到的 `beforeData` / `inversePatch` 为空、两个租户都能编辑的成员四个正文字段齐全（SQL 回归同样断言）；删除之后按删除前的行开放。适配器的参数、日期与形状由 [entity-history.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/entity-history.spec.ts) 覆盖 |
| #14        | `dev-rxdb-supabase-e2e` 的 [catalog-local-writes.spec.ts](../../../apps/dev-rxdb-supabase-e2e/src/catalog-local-writes.spec.ts)：匿名成员加入星河零售，本机新建、改价、撤销重做后推送，再改价推送一次，打开「历史」按时间列出「新建 · 本机推送（售价 — → 99）」「修改（99 → 123）」「修改（123 → 150）」，操作者都是「我」；访客的商品行没有「历史」入口。别的租户的成员（Bob）没有入口由面板单测 [catalog-synced-panel.spec.ts](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-synced-panel.spec.ts) 覆盖                                                                                                                                                          |

复验命令：SQL 回归 `pnpm nx run rxdb-adapter-supabase:sql-security-regressions`（每个用例在事务里执行，结束时回滚）；真栈先 `pnpm nx run rxdb-adapter-supabase:test-env`，再 `pnpm nx test rxdb-adapter-supabase -- src/__tests__/change-history.spec.ts`（自建租户与用户，结束时按 id 清理）；e2e 见 [dev-rxdb-supabase README](../../../apps/dev-rxdb-supabase/README.md)，`pnpm nx run dev-rxdb-supabase-e2e:e2e-remote --grep="Catalog local writes"`。

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

### 实现记录

- **索引**按 `(namespace, entity, "entityId", id)`：读取按 `id` 升序翻页，`id` 即写入顺序，不用 `createdAt`。
- **写入点**：直写在 `rxdb_log_change_trigger` 里每写一条日志就经 `rxdb_record_change_history` 记一条（diff 在换区分支之前算好，换区记成新区的 UPDATE）。推送与级联在 `rxdb_insert_changes` 里：日志仍是一条集合式 `INSERT … RETURNING`（实时通知按语句聚合，逐行插会把 200 条一批的通知拆散），历史随后按 `(clientId, localId)`、隐式日志按 `(namespace, entity, entityId, type)` 与返回的日志 id 配对，一次插入。`rxdbHistory` / `rxdbHistoryType` / `rxdbHistorySource` 只由函数自己打，载荷带进来的一律摘掉。只记 main：非 main 推送只写日志。
- **粒度**：历史跟源变更一一对应，与日志同口径。一次推送里同一实体的多条变更（新建之后又改）各记一条；业务表收到的是本机压缩后的一次写，历史记的是逻辑上的每次修改。AC#2 的「每个生效的实体一条」按「每条生效的源变更一条」实现。
- **快照**：推送的前后快照取 `rxdb_mutations` 已经固化的 `beforeData` / `afterData`；JSON 的 `null` 正文存成 SQL `NULL`。`actor` 取 `auth.uid()`，`role` 取 `auth.role()`；`service_role` 与没有会话的直连 `actor` 为 `NULL`。
- **平台默认判定** `rxdb_caller_can_edit_default`：未分区实体按表级 `UPDATE`；分区实体只认调用者自己的 `user:<auth.uid()>` 区。caller buckets 是「读得到的区」，不等于「能编辑的区」，所以不拿它做默认。未分区实体的默认比按行的 RLS 宽，文档提示按行限制编辑的表要覆盖。
- **demo 覆盖**在 `catalog-demo.sql`：`CatalogItem` 按 `demo_tenant_members` 判定，其余交回默认。重新执行 04 会把判定恢复成默认，demo 与部署方都要在升级之后重新加载覆盖（迁移文档第 2 步）。
- **顺带修正 `rxdb_batch_upsert`**：它把载荷按整行 `jsonb_populate_record` 插入，连生成列 `rxdb_bucket` 也写了 `NULL`，推送本机新建的分区实体报 `428C9 cannot insert a non-DEFAULT value into column "rxdb_bucket"`（US-034 的本机新建因此推不上去）。改为只写 `attgenerated = ''` 的列。
- **量级**（2026-11-26 在 demo 栈上量的 `pg_column_size`）：商品的一条历史约 1.0～1.1 KB；同一张表的分区日志约 140 字节，带正文的未分区日志约 730 字节。条数与 `rxdb_change` 同阶，体积约为带正文日志的 1.5 倍。先不做归档。

## 实现文件

- `docker/sql/01-rxdb-system-tables.sql`、`docker/sql/production/rxdb-sync-access-upgrade.sql` — `rxdb_change_history`（全新安装与增量升级）
- `docker/sql/02-rxdb-sync-functions.sql` — 直写的历史写入 `rxdb_record_change_history`
- `docker/sql/04-rxdb-utils-functions.sql` — 推送与级联的历史写入、读取 RPC `rxdb_entity_history`、判定函数、`rxdb_batch_upsert` 生成列修正、GRANT
- `docker/sql/production/rxdb-change-grants.sql` — 历史表与序列收权、读取 RPC 的签名与授权、内部函数收权
- `apps/dev-rxdb-supabase/supabase/catalog-demo.sql` — demo 的判定函数
- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`、`supabase.interface.ts` — `getEntityHistory`、`SupabaseEntityHistoryItem`、`SupabaseEntityHistoryOptions`
- `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`、`run-supabase-sql-security-regressions.sh` — 回归用例 `change-history`
- `packages/rxdb-adapter-supabase/src/__tests__/entity-history.spec.ts`、`change-history.spec.ts` — 适配器读取方法（替身与真栈）
- `apps/dev-rxdb-supabase/src/app/catalog/catalog-item-history.ts`、`catalog-history-view.ts`、`catalog-synced-panel.ts` — 「历史」入口与对话框
- `apps/dev-rxdb-supabase-e2e/src/catalog-local-writes.spec.ts` — AC#14
- `website/docs/adapters/supabase.md`（「远端变更历史」）、`website/docs/migration/supabase-change-history.md` — 用法与迁移说明

## References

- [US-033 的试验记录](../core/US-033-bucket-log-spike.md) — 同步日志不带正文的依据
- [US-034 分区实体的本地写入](../core/US-034-bucketed-entity-local-writes.md)
- [US-224 Supabase 推送路径上级联删除的子行不写变更日志](./US-224-supabase-cascade-delete-change-log.md) — 级联删除的捕获
- [US-225 Supabase 日志同步只对已登录身份开放](./US-225-supabase-sync-protocol-access-baseline.md)
- [US-038 双向一对一的实体能开同步](../core/US-038-bidirectional-one-to-one-sync.md) — 同样改 `rxdb_mutations`
