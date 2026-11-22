# PR #231 评审记录

## 基本信息

- PR：#231
- 分支：`origin/codex/supabase-log-access`
- 评审工作区：`/private/tmp/rxdb-pr-231`
- 评审 HEAD：`3aad053dab7ead4bbf42e00aa2d882c335b88c99`
- 基线：`origin/main`，提交 `fd8cdfa4aa126a0e883ab7d1d16a33933d0a37ed`
- 评审方式：完整检查 `origin/main...HEAD` 的差异

## 审查范围

覆盖 Supabase 变更日志、Realtime 广播、生产权限脚本、bucket 快照与增量同步、Supabase adapter、同步插件、RLS/SQL 回归测试和客户端会话入口。

## P1：Realtime 全局频道向任意已登录用户泄露跨租户变更元数据

`docker/sql/02-rxdb-sync-functions.sql:202-231` 将 `namespace`、`entity`、`entityId`、`type`、`branchId`、`clientId` 和 `createdAt` 广播到统一频道 `rxdb:changes`。

`docker/sql/production/rxdb-change-grants.sql:133-146` 的 policy 没有按租户、bucket、实体或用户授权隔离 topic。`packages/rxdb-adapter-supabase/src/handle_supabase_change.ts:64-84` 只过滤本端 `clientId` 和本地配置实体。`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1069-1080` 让所有已登录客户端订阅同一个频道。

因此，任意已登录用户都可能收到其它租户或其它授权范围的变更元数据。客户端过滤不能替代服务端访问控制。

应在服务端按租户、bucket、实体和用户授权隔离 topic，或在服务端发布前完成授权校验，并补充跨租户和跨 bucket 的 Realtime 回归测试。

## P1：bucket 快照使用全局日志最大 ID，可能跳过目标 bucket 的有效变更

`docker/sql/02-rxdb-sync-functions.sql:327-340` 的 `rxdb_bucket_snapshot_point()` 接收 namespace、entity、bucket 参数，但直接返回 `public.rxdb_change` 的全局 `MAX(id)`。

`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:455-466` 调用该 RPC。`packages/rxdb-plugin-sync/src/bucketed-pull.ts:248-275` 持久化该 snapshot point，`bucketed-pull.ts:308-341` 在快照完成后从该游标拉增量。`docker/sql/02-rxdb-sync-functions.sql:562-565` 使用 `change.id > p_since_id`，同时限制目标 bucket。

并发时，若其它 bucket 先产生更大的日志 ID，目标 bucket 的较小 ID 变更在快照期间提交但未被快照看到，快照完成后游标推进到全局最大值，目标 bucket 的较小日志就可能被永久跳过，造成漏同步。

快照点至少必须按 namespace、entity 和 bucket 取日志水位，并与快照读取建立一致的边界。快照查询与游标采集还需要明确 PostgreSQL 事务隔离和并发提交语义，确保边界之后提交的目标 bucket 日志都能进入后续增量。应补充目标 bucket 与其它 bucket 交错写入、更新事务延迟提交、删除和分页快照的回归测试。

## P0、P2、P3

除上述两个 P1 外，未发现可登记问题。

## 验证

- `pnpm nx run rxdb-plugin-sync:typecheck --skip-nx-cache --output-style=static` 通过。
- `pnpm nx run rxdb-adapter-supabase:typecheck --skip-nx-cache --output-style=static` 通过。
- `pnpm nx run rxdb-plugin-sync:test --skip-nx-cache --run --output-style=static` 通过，39 个测试文件、588 个测试通过。覆盖率为 Statements 95%、Branches 87.77%、Functions 95.42%、Lines 96.26%。
- Supabase adapter 测试未进入业务测试阶段，依赖的 `rxdb-client-generator:build` 在当次环境中触发 CLI 产物大小保护并生成 0 字节 `dist/cli.js`。这属于构建环境阻塞，未将其登记为 adapter 业务失败。

## 结论

该 PR 存在两个 P1 级问题。第一个是跨租户 Realtime 元数据泄露，第二个是 bucket 快照全局游标造成并发漏同步。两项均应修复并补回归后再合入。
