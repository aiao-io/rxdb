---
id: RV-01a1c69f412774fdb9f96a5ea8b44419
title: '远端重建后拉取游标越过新库的全部 id，旧客户端静默拉空、推送照常'
project: 'rxdb-plugin-sync'
status: Fixed
severity: 'P1'
anchors:
  [
    'packages/rxdb-plugin-sync/src/pull-repository.ts#pullSingleRepository',
    'packages/rxdb-plugin-sync/src/pull-batch.ts#pullBatchOnce',
    'packages/rxdb/src/system/sync.ts#RxDBSync',
    'docker/sql/01-rxdb-system-tables.sql#rxdb_change'
  ]
affected_projects:
  ['rxdb', 'rxdb-adapter-supabase', 'rxdb-adapter-sqlite-core', 'rxdb-adapter-pglite', 'rxdb-adapter-http']
related_findings: ['RV-01a1c49dee517814adf2e68788ad084e']
found_on_branch: 'refs/heads/live-store'
found_view: commit
found_snapshot: '6e03381dea405b988f09cf5ca2769e016b196707'
found_range: project
found_base: null
created: 2026-11-10
updated: 2026-11-11
pr: null
---

# RV-01a1c69f412774fdb9f96a5ea8b44419：远端重建后拉取游标越过新库的全部 id，旧客户端静默拉空、推送照常

## 问题与影响

拉取游标是远端 `rxdb_change.id`，只在同一个远端库里单调。远端被推倒重建，或者变更日志被 `TRUNCATE ... RESTART IDENTITY` 清空之后，`id` 从头计数，
已有客户端的游标越过新库的全部 `id`：拉取一直返回 0 条，`SyncState` 没有任何错误，待拉计数报 0；推送照常把本地变更写进新库。
客户端与远端静默分叉，新库长出来的变更要等 `id` 追过旧游标之后才开始拉，之前那一段永远拉不到。远端地址被改到另一个项目时同样如此。

定 P1：后果是所有已有客户端静默分叉。不定 P0，是因为触发条件是运维动作（重建库、清空日志、改远端地址），生产环境不常见，本地数据也没有被破坏；
开发与预发环境经常重建栈，在那里是常见条件。

## 证据与根因

快照 `6e03381dea405b988f09cf5ca2769e016b196707`：

- `docker/sql/01-rxdb-system-tables.sql:13`：`id serial PRIMARY KEY`，库重建后从 1 开始。
- `packages/rxdb-plugin-sync/src/pull-repository.ts:543`：`let sinceId = lastPullRemoteChangeId ?? 0;`，
  `packages/rxdb-plugin-sync/src/pull-batch.ts:204` 与 `packages/rxdb-plugin-sync/src/check-repository-updates.ts:121` 同口径；
  `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:354`：`.gt('id', sinceId)`。
- `packages/rxdb/src/system/sync.ts:174`：同步记录只有游标，没有记下游标属于哪个远端，客户端无从判断游标是否还有效。

复现：真栈用例 `packages/rxdb-adapter-supabase/src/__tests__/remote-reset.spec.ts`（首版）。共享测试栈不能真的重建，
把旧客户端的游标抬到远端全部 `id` 之上来拼出重建后的处境，另一个客户端再推一条新变更：
旧客户端 `pullRepository` 返回 `{ pulled: 0, success: true }`，`pushRepository` 照常推出。

## 修复方向

借鉴 LiveStore 的 `backendId`：远端生成一个身份值，重建后改变；客户端与游标存在同一行，与远端交换数据之前比对，对不上就停止同步，
错误经 `SyncState.lastError` 暴露，由应用显式改绑。不自动改绑，免得远端地址配错时把别人的数据拉进来、把本地变更推过去。

一起核对：远端适配器契约（自定义适配器与 HTTP 适配器）、两个本地适配器的系统表迁移、分支物化来源、状态查询的只读口径。

## 处理记录

### EV-01a1c69f4205778dad9bf5d0b103870a：发现

- 时间：2026-11-10T22:19:01+08:00
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 9fbd9033-c708-4a79-be9b-164eaafe7a0f（按 LiveStore 调研的 P0「记录远端身份，处理远端重置」做最小验证）
- 输入快照：`6e03381dea405b988f09cf5ca2769e016b196707`
- 输出快照：同输入（只加了用例）
- 状态：未登记 → Open
- 结论：成立。游标越过远端全部 `id` 之后，拉取静默拉空，推送照常，没有任何错误。
- 验证：`pnpm nx test rxdb-adapter-supabase -- src/__tests__/remote-reset.spec.ts --coverage.enabled=false`，
  断言拉取与推送应当报错，两条都失败：`promise resolved "{ repository: { …(2) }, …(11) }" instead of rejecting`。
- 剩余事项：owner 拍板处理策略与身份的存放位置。

### EV-01a1c69f42447ce08d72f961e9ada369：修复

- 时间：2026-11-11T02:23:43+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 9fbd9033-c708-4a79-be9b-164eaafe7a0f
- 输入快照：`6e03381dea405b988f09cf5ca2769e016b196707`（提交视图）
- 输出快照：工作区树 `c888269cfc70f80441395b67bfb99507007d15cd`（`ai-review snapshot --worktree`，基于 `6e03381d`）；本记录与之后的文档改动不在该树内。
- 状态：Open → Fixed
- 结论：owner 选「停止同步并报错，提供显式重绑定」，身份存进 `RxDBSync` 新列，系统 schema 8 → 9。
- 改动：
  - 远端契约：`packages/rxdb/src/rxdb-adapter.ts` 的 `RxDBAdapterRemoteBase` 新增抽象方法 `backendId()`；`RxDBAdapterHttp` 抛 `HttpChangelogUnsupportedError`；
  - Supabase：`docker/sql/01-rxdb-system-tables.sql` 新增单行表 `rxdb_backend`；`02-rxdb-sync-functions.sql` 新增 `rxdb_backend_id()` 与 `TRUNCATE rxdb_change` 时换身份的触发器
    `rxdb_change_rotate_backend_id`；`production/rxdb-change-grants.sql` 收回客户端对 `rxdb_backend` 的写权限；适配器实现 `backendId()`，不缓存；
  - 本地：`RxDBSync.remoteBackendId`（可空），`RXDB_SYSTEM_SCHEMA_VERSION` 8 → 9；sqlite-core 与 PGlite 的 `migrateSystemSchema()` 把补列逻辑泛化成按实体补可空列，给 `rxdb_sync` 补上新列；
  - 同步插件：新增 `remote-backend.ts`（`RemoteBackendMismatchError`、只读比对、比对加绑定、改绑、新记录盖章）；`SyncManager` 八个交换数据的入口先比对再绑定旧记录，
    新增 `rebindRemoteBackend()`；`checkRepositoryUpdates` 碰远端之前只读比对；分支物化来源的 `freezeIntent` / `pages` 碰远端之前比对；四处新建同步记录盖上已核实的身份；
  - 回归：`remote-reset.spec.ts` 改为以 service_role 换掉远端身份并抬高游标，断言拉取、推送、待拉计数都抛 `RemoteBackendMismatchError`、错误进 `lastError`，
    改绑后全量拉回新远端的数据、推出本地待推变更；SQL 回归新增 `backend-identity` 用例，`production-change-grants` 补一步；
    sqlite-core 与 PGlite 的系统迁移用例补模式 8 → 9；同步插件新增 `remote-backend.spec.ts`，编排契约、分支物化、待拉计数各补用例；
  - 文档：新增 `website/docs/migration/supabase-remote-backend.md`（含索引与侧边栏），`sync.md` 新增远端重置一节，`adapters/supabase.md`、包 README、`CHANGELOG.md`。
- 验证：
  - 修复前红：见发现事件；
  - 修复后：`pnpm nx run rxdb-adapter-supabase:sql-security-regressions` 40 个用例逐个通过、全量单事务一轮通过；
    `pnpm nx test rxdb-adapter-supabase --skip-nx-cache` 全量通过；`--skip-nx-cache` 跑过的单测：rxdb、rxdb-plugin-sync、rxdb-adapter-sqlite-core、
    rxdb-adapter-pglite、rxdb-adapter-sqlite-wasm、rxdb-adapter-http、rxdb-adapter-wa-sqlite、rxdb-plugin-working-tree、rxdb-plugin-querycache、rxdb-plugin-history、
    rxdb-devtools、rxdb-test，全部通过；改动涉及的包 lint 与 typecheck 通过。
- 剩余事项：
  - 复核（verify）；
  - 已有部署按迁移说明先建表、重跑 02 与生产权限脚本，再升级客户端；
  - 升级之前已经发生的重置认不出来，迁移说明给了处理方式；
  - 手工 `ALTER SEQUENCE ... RESTART` 不会换身份，迁移说明要求同时手工换身份。
