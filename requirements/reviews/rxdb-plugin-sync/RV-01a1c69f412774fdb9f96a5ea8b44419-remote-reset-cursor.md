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
    'packages/rxdb-plugin-sync/src/push-repository.ts#persistPushReceipts',
    'packages/rxdb-plugin-sync/src/branch-materialization-source.ts#createSyncBranchMaterializationSource',
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

### EV-01a1c93d75c87d42ba83a4e82bc938b4：复核（修复不完整）

- 时间：2026-11-11T13:21:53+08:00
- 操作：review/independent
- 执行者：unknown（仓库根 `CODE_REVIEW.md`，随提交 `e0fea72e726b022777b082dd905bac67b41319e3` 登记，文档未写评审者与模型）；
  本事件由下一个修复事件的会话按原文转录，原文件随修复删除
- 输入快照：`2ec740002ad8b63d69f9164c25b3b291f822c2d9`（分支相对 `origin/main`：66 个文件，+2732/−85）
- 输出快照：同输入（只写了评审文档）
- 状态：Fixed → Open
- 结论：远端身份只在同步入口核对一次，两处窗口仍成立，都定 P1：
  - 复合同步与多轮拉取：`sync()`、`syncRepository()`、`bulkSync()` 与 `fetchAll` 拉取只在入口调 `verifyRemoteBackend()`，
    途中远端被重建，后续拉取与推送打在新库上，游标与 `lastPushedChangeId` 照样推进（`packages/rxdb-plugin-sync/src/sync-repository.ts:270`、`:291`）；
  - 分支物化：`freezeIntent()` 冻结的截止 id 没有记下远端身份，`pages()` 的核对只靠已有的 `RxDBSync` 记录，首次物化本地一条记录都没有时，
    冻结之后的重建认不出来，续拉拿旧库的截止 id 与游标去新库上拉（`packages/rxdb-plugin-sync/src/branch-materialization-source.ts:384`、`:394`）。
- 验证：静态阅读；typecheck、lint、受影响包的测试与构建通过；`website:build` 在 `api-docs` 处挂起，未计入。
- 剩余事项：入口之外的核对点与冻结意图的身份绑定；补远端在分页拉取、pull→push 边界、首次物化期间被重建的回归。

### EV-01a1c93d75fd7537bb097c10042552db：修复（复核跟进）

- 时间：2026-11-11T14:26:55+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 ccb89d16-0db5-4eba-a539-cff657e68711（按 `CODE_REVIEW.md` 修上一事件的两处窗口）
- 输入快照：`e0fea72e726b022777b082dd905bac67b41319e3`（提交视图）
- 输出快照：工作区树 `dd2d51ccc1d79551f0f615be446b5a0af11d7895`（`ai-review snapshot --worktree`，基于 `8cb62c5b`：会话中途外部以「123」提交了大部分改动）；
  本记录与 `CODE_REVIEW.md` 的删除不在该树内。
- 状态：Open → Fixed
- 结论：两处都成立，第一处的描述要修正：`sync()` 的实体推送经 `sm.bulkSync()` 的入口会再核对一次，「push 照常推进 `lastPushedChangeId`」对它不成立；
  `syncRepository()`、`bulkSync()` 的先拉后推与多轮拉取成立。在请求之前核对挡不住核对与请求之间的重建，改为在**落库之前**核对：
  进门那次与这一次夹住的往返才算这个远端上的进度，对不上就停，游标与水位都不推进。
- 改动：
  - 拉取：`pullSingleRepository` 每一轮有变更时、`pullBatchOnce` 远端交回变更时，落库事务之前再调 `verifyRemoteBackend()`；空的一轮不核对，不多打远端；
  - 推送：`persistPushReceipts` 在远端往返（含被拒行回读）全部结束之后、回执事务之前核对，对不上回执与水位都不落，下一次按原水位重推，
    远端 `(clientId, localId)` 唯一索引保证不重复。复合同步的 pull→push 边界没有另加请求前核对：落库前那一次省不掉，它只会给每个仓库多一趟远端；
  - 分支物化：冻结水位新增 `backendId`，先于截止 id 读取；`pages()` 开拉之前、每一页交出之前用新增的 `assertRemoteBackendIs()` 比对；
    `settle()` 把身份随截止 id 一起写进同步记录；`resolveIntentDrift()` 遇到本实例核实过的身份与冻结时不同即报漂移，改绑之后重试按新远端重冻；
    不带身份的旧意图按形状不符报漂移；
  - 顺手：`SyncManager.getRepositoryDependencyGraph()` 的 TSDoc 被上一轮插进来的两个方法隔开，挪回原处；
  - 文档：`sync.md` 远端重置一节、迁移说明、`CHANGELOG.md`、`livestore-research.md` 补途中重建与物化的行为，示例改为从 `RxDBPartialSyncError.cause` 取远端身份错误。
- 验证：
  - 修复前红：新增 20 条用例，其中 15 条在旧实现上失败：同步插件 12 条（物化 6、拉取 2、批量拉取 2、推送 2）在 `e0fea72e` 的实现上失败；
    仓库同步 pull→push 边界那条把 `push-repository.ts` 换回 `e0fea72e` 的版本后失败；sqlite-wasm 两条端到端用例在旧 dist 上切换直接成功，物化出两个库拼起来的数据。
    其余 5 条是守卫（空轮与无待推不核对、未核实时不判漂移）与 `assertRemoteBackendIs()` 的直接用例；
  - 修复后（Node 26，均 `--skip-nx-cache`）：`pnpm nx test rxdb-plugin-sync` 558 条通过，覆盖率 95.28 / 88.34 / 97.58 / 96.54；
    `rxdb-adapter-sqlite-wasm` 1025 条通过、13 条跳过（前两轮全量各有一条 Worker 时序用例超时，`worker-lifecycle` 与 `shared-client`，不涉及同步，单跑通过）；
    `rxdb-adapter-pglite` 1674 条通过；`rxdb-adapter-supabase` 真栈 664 条通过；两个改动包的 lint 与 typecheck、prettier、
    `package-graph --check`、`api-surface --check`、`requirements-consistency --check`、`check-doc-code` 通过。
- 剩余事项：
  - 复核（verify）；
  - 远端在某一批写入之前被重建时，这一批仍会先写进新库、到落库前才被发现：本地不记账，之后幂等重推，新库多出的正是改绑之后本来也会推过去的那批。
    要在写入之前就拦住，得由服务端在推送 RPC 里原子比对身份。
