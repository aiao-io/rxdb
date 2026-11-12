---
id: RV-01a1c49dee517814adf2e68788ad084e
title: '拉取以 serial id 为游标，晚提交的日志行被已越过它的拉取方永久漏掉'
project: 'rxdb-adapter-supabase'
status: Fixed
severity: 'P1'
anchors:
  [
    'docker/sql/01-rxdb-system-tables.sql#rxdb_change',
    'docker/sql/02-rxdb-sync-functions.sql#rxdb_pull_changes',
    'packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#pullChanges'
  ]
affected_projects: ['rxdb-plugin-sync']
related_findings: []
found_on_branch: 'refs/heads/live-store'
found_view: commit
found_snapshot: 'db7434c46bf0fd65bf7e28423b410453fbeaa47e'
found_range: project
found_base: null
created: 2026-11-10
updated: 2026-11-10
pr: null
---

# RV-01a1c49dee517814adf2e68788ad084e：拉取以 serial id 为游标，晚提交的日志行被已越过它的拉取方永久漏掉

## 问题与影响

两个写 `rxdb_change` 的事务并发、先拿到 `id` 的那个晚提交时触发。来源有三种：

- 不同客户端的推送：`rxdb_mutations` 只给同一 `clientId` 的推送加锁；
- 推送与直写业务表：直写时同步触发器在业务写当时写日志；
- 两个直写业务表的事务。

在两次提交之间拉取过的客户端，游标已经越过晚提交的 `id`，之后 `id > 游标` 永远取不到它。客户端与远端静默分叉，`SyncState` 里没有任何错误。

定 P1：属于评审标准里「并发写互相覆盖」一类，结果是数据静默分叉。不定 P0，是因为它需要并发写入才触发；推送路径在函数接近末尾才写日志，窗口较窄，单用户的常见用法碰不到。

## 证据与根因

快照 `db7434c46bf0fd65bf7e28423b410453fbeaa47e`：

- `docker/sql/01-rxdb-system-tables.sql:13`：`id serial PRIMARY KEY`。`nextval` 在 INSERT 时取值、不随事务回滚，行在提交时才对其他会话可见。
- `docker/sql/02-rxdb-sync-functions.sql:321`：`rxdb_pull_changes` 的条件是 `WHERE change.id > p_since_id`；
  `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:354`：不带过滤的 `pullChanges` 直接查表，同样是 `.gt('id', sinceId)`。
- `docker/sql/04-rxdb-utils-functions.sql:1059`：`rxdb_mutations` 的咨询锁键里带 `clientId`，不同客户端互不排斥；`:1243` 在第 4 步经 `rxdb_insert_changes` 写日志。
- `docker/sql/02-rxdb-sync-functions.sql:79`：直写业务表时，`rxdb_log_change_trigger` 在业务写当时插入日志，窗口一直延续到所在事务提交。

复现：

1. 一次性 Homebrew PostgreSQL 16 集群（unix socket，不监听 TCP），加载 01、02 两个脚本，用真实的 `rxdb_pull_changes`：
   A 插入后拿到 `id` 1，3 秒后才提交；B 插入 `id` 2 并立即提交；C 从游标 0 拉取只得到 2；A 提交后，C 从 2 往后拉，结果为空。
2. 真实链路回归 `packages/rxdb-adapter-supabase/src/__tests__/pull-commit-order.spec.ts`：慢事务直写 `todos`，期间另一个客户端经 `mergeChanges` 推送，再拉取两次。
   修复前失败：`AssertionError: expected [ Array(1) ] to include '<慢事务的实体 id>'`，前提断言（慢事务先拿到 `id`）通过。

## 修复方向

在 `rxdb_change` 上加语句级 BEFORE INSERT 触发器，取一把全库共用的事务级咨询锁、持有到提交，让日志 `id` 顺序等于提交顺序。语句级触发器先于 serial 默认值求值，已实测。
不改游标协议，客户端不用升级。副作用是直写的多语句事务与推送改到同一行时可能互锁（`40P01`），适配器的写入重试要认它。

一起核对：`rxdb-plugin-sync` 只消费游标，不用改；已有部署需要按迁移说明重跑 02。对照来源见 [sqlite-sync 调研](../../sqlite-sync-research.md)。

## 处理记录

### EV-01a1c4b3d00f7d8ebf8a18a89cdc6376：发现

- 时间：2026-11-10T16:23:10+08:00
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 f237c1c8-3edd-4cd4-9e6a-8866dfd0c046（对照 sqlite-sync 1.2.0 的同类修复时发现）
- 输入快照：`db7434c46bf0fd65bf7e28423b410453fbeaa47e`
- 输出快照：同输入（只做复现，未改仓库）
- 状态：未登记 → Open
- 结论：成立。日志 `id` 在写入时分配、提交时才可见，拉取只认 `id > 游标`，先拿到 `id` 却晚提交的变更会被永久跳过。
- 验证：`bash /tmp/pg-cursor-gap-scripts/run.sh`。输出：C 第一次拉取（游标 0）得到 `2|b1`；A 提交后从游标 2 续拉为空；表里实际是 `1|a1`、`2|b1`。
- 剩余事项：补真实链路回归，再修复。

### EV-01a1c4b3d03971bdafbb088fb261bfc7：修复

- 时间：2026-11-10T17:19:55+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 f237c1c8-3edd-4cd4-9e6a-8866dfd0c046
- 输入快照：`db7434c46bf0fd65bf7e28423b410453fbeaa47e`（提交视图）
- 输出快照：工作区树 `f968508a2232827e761ee5e0733ed29e1849f615`（`ai-review snapshot --worktree`，基于 `84bc7e3d`）。
  外部自动提交 `ec6f1ab3` 与 `84bc7e3d` 已带走本修复的 SQL、适配器与回归改动；迁移说明、CHANGELOG、调研文档与本记录当时仍在工作区，本记录不在该树内。
- 状态：Open → Fixed
- 结论：按修复方向实现，用户选定全局事务级咨询锁，不改游标协议。
- 改动：
  - `docker/sql/02-rxdb-sync-functions.sql`：新增 `rxdb_change_serialize_append()` 与同名的语句级 BEFORE INSERT 触发器。放在 02 而不是 01，已有部署重跑 02 即可装上，不用重跑带索引重建的 01；
  - `packages/rxdb-adapter-supabase/src/supabase.helpers.ts`：`isRetryableSupabaseWriteError` 加 SQLSTATE 参数，`40P01` 可重试；`RxDBAdapterSupabase.ts` 的写入重试把 `error.code` 传进去；
  - `docker/sql/03-business-tables.sql`：测试夹具 `rxdb_test_slow_todo_insert`（直写后拖住提交）与 `rxdb_test_change_id_seq_last_value`（读日志序列，确认慢事务已拿到 `id`）；
  - 回归：`pull-commit-order.spec.ts`（真实链路），`transient-write-retry.spec.ts` 补 `40P01` 重试用例；
  - 文档：`website/docs/adapters/supabase.md` 的同步游标与生产部署两节，新增 `website/docs/migration/supabase-change-log-order.md`（含迁移索引与侧边栏），`CHANGELOG.md`。
- 验证：
  - 修复前红：真实链路回归报 `expected [ Array(1) ] to include …`；`40P01` 用例单独失败，同文件其余用例通过；
  - 锁的时机：在隔离栈的临时 schema 上实测，语句级 BEFORE INSERT 触发器里取锁后，并发插入的 `id` 依次是 a1=1、a2=2、b1=3，后到的事务没有提前占号；
  - 修复后：`pnpm nx run rxdb-adapter-supabase:test-env-down` 推倒本检出的隔离栈，重建后在全新库上触发器经 02 装上；
    `pnpm nx run-many -t lint typecheck test --projects=rxdb-adapter-supabase --skip-nx-cache` 全部通过，`pnpm nx run rxdb-adapter-supabase:sql-security-regressions --skip-nx-cache` 逐用例与全量一轮全部 PASS。
- 剩余事项：
  - 复核（verify）；
  - 已有部署按迁移说明重跑 02，升级前已漏掉的变更不会自动补回；
  - RLS 下日志的可见性与空窗口游标，见调研文档的 P1，未立项。
