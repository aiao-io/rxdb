# PR #226 评审记录

## 基本信息

- PR：#226
- 分支：`origin/supabase-log-access-baseline`
- 评审工作区：`/private/tmp/rxdb-pr-226`
- 评审 HEAD：`a81b9081ae13eee8d4478f44dafa8208568212db`
- 基线：`origin/main`，提交 `fd8cdfa4aa126a0e883ab7d1d16a33933d0a37ed`
- 评审方式：完整检查 `origin/main...HEAD` 的差异

## 审查范围

覆盖 Supabase 变更日志、Realtime 广播、生产权限脚本、Supabase adapter 的实时订阅与事件处理、身份同步、RLS/SQL 回归测试和客户端会话入口。

## P1：Realtime 全局频道向任意已登录用户泄露跨租户变更元数据

`docker/sql/02-rxdb-sync-functions.sql:202-231` 将 `namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId` 和 `createdAt` 广播到统一频道 `rxdb:changes`。

`docker/sql/production/rxdb-change-grants.sql:95-102` 的 policy 只限制 `authenticated`、topic 和 extension，没有按租户、bucket、实体或用户授权。`packages/rxdb-adapter-supabase/src/handle_supabase_change.ts:64-84` 只过滤本端 `clientId` 和本地配置实体。`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:952-963` 让所有已登录客户端订阅同一个频道。

因此，任意已登录用户都可能收到其它租户或其它授权范围的变更元数据。即使事件不包含完整文档内容，实体名称、实体 ID、分支 ID、变更类型和时间仍构成跨租户信息泄露。

应在服务端按租户、bucket、实体和用户授权隔离 topic，或在服务端发布前完成授权校验。客户端过滤不能替代服务端访问控制，并需要补充跨租户和跨 bucket 的 Realtime 回归测试。

## P0、P2、P3

除上述 P1 外，未发现可登记问题。

## 验证

- `pnpm nx run rxdb-adapter-supabase:typecheck --skip-nx-cache --output-style=static` 最终通过。
- 执行期间曾打印 Node 22 不满足仓库 Node 26 要求的 preinstall 警告，但类型检查任务完成。

## 处置记录（2026-11-27）

状态：**未处置**。owner 决定合入 `main` 之前另做服务端改造，收紧统一频道。

分支 tip 上的现状：

- 分区实体（业务表带 `rxdb_bucket`）的通知只发到 `rxdb:changes:bucket:<bucket>`。`realtime.messages` 上的接收策略 `rxdb_changes_receive`（`docker/sql/production/rxdb-change-grants.sql`）要求频道里的 bucket 属于 `rxdb_caller_buckets()`。SQL 回归 `rxdb_sql_regression.test_realtime_notifications` 断言登录用户只收到 `public` 区与自己分区的通知。
- 统一频道 `rxdb:changes` 仍对全部 `authenticated` 开放，承载未分区旧日志的元数据。这些日志的整行正文本来就经 `rxdb_change` 的 RLS 对全部 `authenticated` 可读（适配器文档「适用边界」），频道没有扩大读取面；但 P1 要的是服务端按租户、实体或用户隔离，这一条还没有做。

## 结论

该 PR 存在一个 P1 级跨租户 Realtime 元数据泄露问题，修复服务端频道授权后再合入。
