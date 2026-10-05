# Implementation Plan: US-218 — Supabase 远端启用 RLS 时的推送完整性

**Branch**: `007-us218-rls-push-integrity` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md)（故事 [US-218](../../requirements/stories/adapter/US-218-supabase-rls-push-integrity.md)，阶段 A～C，AC#1～19）。
复用 US-220 plan（[specs/006](../006-us220-update-push-semantics/plan.md)）给出的 F1～F3，经本 plan 交叉核对后与 F4～F6 一并冻结。
本轮只出 plan 与设计产物，不写实现代码（roadmap 约束 16）。

## Summary

三个阶段，一个 PR 一个阶段：

1. **阶段 A（只动参考 SQL）**：
   - 显式日志模式（`p_skip_sync = true`）下 DELETE 少删时，用 US-220 的探针 `rxdb_existing_ids` 判定：存在 → 42501，不存在 → 幂等成功（D1）；
   - `rxdb_mutations` 开头做日志与业务写的配对校验，不配对抛新码 `RX002`（D3）；
   - 签名不变；任一错误整批回滚（D2）。与阶段 B 同版本发布（D4）。
2. **阶段 B（推送契约，破坏性）**：
   - 服务端：`rxdb_mutations` 加 `p_receipts`（默认 false）；为 true 时先整组执行、组内出错逐实体重放，可归类错误（42501 / `RX001` / 23503）
     计为被拒，写后只记已生效实体的日志，返回 `entity_results`；按 `clientId` 加锁逐实体幂等（D5～D9）；
   - 客户端：`RemoteMergeResult` 改为每条源变更一条结果（删 `changeIdMapping`）；`RxDBChange` 加 `rejectedAt` / `rejection`
     （系统模式 6 → 7）；「待推」口径加 `rejectedAt = null`；推送提交时对齐被拒实体（D10～D14）；
   - 三框架：`SyncState.lastRejections`，经已有 `useSyncState()` 暴露（D15、D16）。
3. **阶段 C（日志表收口）**：触发器函数改 DEFINER，日志写入收进带 GUC 守卫的 DEFINER helper `rxdb_insert_changes`；生产权限脚本回收
   `anon` / `authenticated` 对 `rxdb_change` 的写权限；站点文档「生产部署」节（D18）。

## 跨 plan 冻结项

F1～F3 由 US-220 plan 给出，本 plan 逐项核对一致；F4～F6 由本 plan 给出，其中 F4 改了 006 的两份契约。六项在两份 plan 与对应
contracts 同步后**一并冻结**，进 `/speckit-tasks` 前不再改；任何一项要改，两份 plan 与契约同步改。

| #   | 冻结项                          | 取值                                                                                                                                               | 契约                                                                                                                                                  | 核对结论 |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F1  | `rxdb_mutations` 签名           | US-220：5 参（加 `p_updates`）；本故事阶段 A 不改参数表；阶段 B 加第 6 个 `p_receipts boolean DEFAULT false`，DROP 5 参签名                        | [006 rxdb-mutations](../006-us220-update-push-semantics/contracts/rxdb-mutations.md)、[rxdb-mutations-receipts](contracts/rxdb-mutations-receipts.md) | 一致     |
| F2  | SQLSTATE 登记                   | 42501 = 被拒、`RX001` = 已不存在、`RX002` = 推送不配对（本故事登记）；`DETAIL` 统一 JSON `{op,schema,table,entityId,reason}`                       | [006 sqlstate-registry](../006-us220-update-push-semantics/contracts/sqlstate-registry.md)                                                            | 一致     |
| F3  | 存在性判定原语                  | `rxdb_existing_ids(p_table, p_schema, p_ids text[]) RETURNS text[]`，DEFINER、`row_security = off`、同步表白名单；本故事 DELETE 判定为第二个使用方 | [006 existence-probe](../006-us220-update-push-semantics/contracts/existence-probe.md)                                                                | 一致     |
| F4  | DELETE 判定与配对规则（阶段 A） | 删后探针，仅 `p_skip_sync = true`；五条配对检查按序，`RX002` 带 `reason`                                                                           | [push-integrity](contracts/push-integrity.md)                                                                                                         | 新       |
| F5  | 逐实体回执（阶段 B）            | `p_receipts` 开关；可归类错误 42501 / `RX001` / 23503；`entity_results` 形状；`change_id_mapping` 只含已生效与非 main                              | [rxdb-mutations-receipts](contracts/rxdb-mutations-receipts.md)                                                                                       | 新       |
| F6  | `RemoteMergeResult`（阶段 B）   | `{maxChangeId?, results: RemoteChangeResult[]}`，每条源变更恰好一条                                                                                | [remote-merge-result](contracts/remote-merge-result.md)                                                                                               | 新       |

核对要点：

- **F1**：阶段 A 只在函数体内加判定与校验，不碰参数表，与 US-220 不冲突。阶段 B 加参数是在 US-220 之上的**顺序**变更（US-220 先合入，
  roadmap 约束 16）；若 US-220 与本故事阶段 A+B 同版本发布，对外只有一次 4 → 6 参的签名变更，迁移文档按发布合并（D17）。
- **F2**：AC#13「5xx 一律可重试」与 `RX001` / `RX002` 落 HTTP 400 一致；阶段 B 按 SQLSTATE 归类，不解析 `MESSAGE`。
- **F3**：DELETE 判定整组调用一次探针；探针不读 `rxdb_change`，阶段 C 回收日志表权限后不受影响；非同步表在推送路径上少删以 22023 显式失败。

## Technical Context

**Language/Version**: PostgreSQL 15+ PL/pgSQL（参考 SQL `docker/sql/02-*.sql`、`04-*.sql`）；TypeScript 6.0 strict + ESM

**Primary Dependencies**: PostgREST（按参数名匹配 RPC、SQLSTATE → HTTP 映射）；`@supabase/supabase-js`；RxJS 7.8（`SyncStateHub`）；
Angular signals / React `useSyncExternalStore` / Vue `computed`（既有绑定）；无新增 npm 依赖

**Storage**: 远端同步表与 `rxdb_change`；本地 `RxDBChange` 加两列（SQLite 系列与 PGlite 的系统模式迁移 6 → 7）

**Testing**: SQL 回归（`supabase-sql-security-regressions.sql` + runner，手动对容器跑）；Vitest 单测（核心、`rxdb-plugin-sync`、
`rxdb-plugin-history`、各适配器、三框架绑定）；连真实 Supabase 的 Vitest；Playwright e2e（`dev-rxdb-supabase-e2e:e2e-remote`、
React / Vue demo e2e）

**Target Platform**: 远端 Supabase；客户端为浏览器 / Node / Electron 中的 RxDB

**Project Type**: 可发布库的推送契约变更（破坏性，阶段 B）+ 参考 SQL 变更（阶段 A～C）+ 三框架状态字段 + demo

**Performance Goals**: 单批推送落库 < 100 ms（宪法 IV，SC-009）；成功路径增量为载荷遍历、一次已存在日志查询、每组一个子事务、
每个 `clientId` 一把咨询锁；探针只在零行时执行（D19）

**Constraints**: 无 fallback——不配对、缺回执、未列明的 SQLSTATE 一律整批失败；部分成功只对显式 `p_receipts = true` 的客户端开放；
新客户端连旧 SQL 显式失败（`PGRST202`）；被拒实体对齐不产生 `RxDBChange`、不进撤销栈

**Scale/Scope**: 参考 SQL 2 个文件 + 1 个新生产脚本；包：`rxdb`、`rxdb-plugin-sync`、`rxdb-plugin-history`、`rxdb-adapter-supabase`、
`rxdb-adapter-sqlite-core`、`rxdb-adapter-pglite`、`rxdb-angular` / `rxdb-react` / `rxdb-vue`；demo 3 个；站点文档 2 处 + 迁移文档 1 篇

## Constitution Check

_GATE: Phase 0 前必须通过，Phase 1 设计后复查。_ 依据宪法 v2.0.2。

| 原则        | 检查项                                                                                                                                                   | 结论 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| I. 代码质量 | 涉及包的 `lint` + `typecheck` 零警告；嵌套 ≤ 3；新导出类型（`RemoteChangeResult`、`RemoteChangeRejection`、`RemoteEntityRef`、`SyncRejection*`）带 TSDoc |  ✅  |
| I. 代码质量 | 无 fallback：回执缺项整轮失败（D10）；`p_receipts = false` 原样抛首个错误（D5）；未列明 SQLSTATE 不捕获（D7）；对齐所需的远端读失败则不提交（D14）       |  ✅  |
| I. 代码质量 | SQL 护栏沿用：`search_path = pg_catalog, pg_temp`、`%I` 引用；DEFINER 只用于探针（已有白名单）、触发器函数与 `rxdb_insert_changes`（GUC 守卫）（D18）    |  ✅  |
| II. 测试    | TDD：阶段 A 的 SQL 用例先红（quickstart A1）；阶段 B 改写 `push-repository.spec.ts`「远端返回非映射结果时仍推进水位线」为反向断言而非删除（D10）         |  ✅  |
| II. 测试    | 覆盖率：`rxdb` 与三框架绑定 ≥ 90%，其余 ≥ 80%（`coverage-check.mjs`）；新分支（回执校验、对齐、迁移）都有单测                                            |  ✅  |
| III. 三框架 | `lastRejections` 经三端已有 `useSyncState()` 暴露，字段名与语义一致；三端各一条绑定 spec；三个 demo 各一处展示（D15、D16）                               |  ✅  |
| IV. 性能    | 成功路径增量有界（D19）；连真实 Supabase 的 spec 记录单批耗时；包体积增量为类型与少量提交逻辑，仍 < 50 KB gz                                             |  ✅  |
| 工程护栏    | 破坏性变更过 API 基线 + 迁移文档；系统模式迁移过 `check-migration-release-gate`；可信写入新调用点过 `audit:callsite-drift`；一个 PR 一个阶段             |  ✅  |

**设计后复查**：Phase 1 新增的抽象见 Complexity Tracking，每项都有被否决的更简方案；结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/007-us218-rls-push-integrity/
├── spec.md
├── plan.md            # 本文件
├── research.md        # Phase 0：D1–D20
├── data-model.md      # Phase 1：载荷、函数、回执、本地列、状态流转、提交流程、框架状态
├── contracts/
│   ├── push-integrity.md            # 阶段 A：DELETE 判定 + 配对校验 + SQL 用例（F4）
│   ├── rxdb-mutations-receipts.md   # 阶段 B：p_receipts、执行流程、错误归类、返回值、版本组合（F5）
│   ├── remote-merge-result.md       # 阶段 B：TS 契约、推送方语义、回执构造、夹具迁移（F6）
│   ├── sync-rejections-api.md       # 阶段 B：SyncState.lastRejections 与三框架、demo
│   └── rxdb-change-permissions.md   # 阶段 C：DEFINER 收口、生产脚本、回归、文档
├── quickstart.md      # 分阶段验证步骤
├── checklists/requirements.md
└── tasks.md           # Phase 2（/speckit-tasks，约束 16 解除前不生成）
```

### Source Code (repository root)

```text
# 阶段 A
docker/sql/04-rxdb-utils-functions.sql                 # rxdb_mutations：配对校验（RX002）、DELETE 零行判定
packages/rxdb-adapter-supabase/src/__tests__/
├── supabase-sql-security-regressions.sql             # 改写 rls-filtered-delete；新增 5 个用例
└── run-supabase-sql-security-regressions.sh          # CASES 登记

# 阶段 B：服务端与适配器
docker/sql/04-rxdb-utils-functions.sql                 # p_receipts、逐实体执行、写后记日志、咨询锁、entity_results；DROP 5 参
packages/rxdb-adapter-supabase/src/
├── RxDBAdapterSupabase.ts                            # mergeChanges 传 p_receipts、构造 results
├── supabase.merge-changes.ts / supabase.helpers.ts   # validateMergeResponse、回执构造
├── errors.ts                                         # SupabaseDataError.code / details
├── postgrest-error.ts                                # classify_postgrest_error 保留 SQLSTATE 与 DETAIL
└── __tests__/push-receipts.spec.ts                   # 新：真实 Supabase 双用户

# 阶段 B：核心与插件
packages/rxdb/src/rxdb-adapter.ts                      # RemoteMergeResult / RemoteChangeResult / RemoteChangeRejection / RemoteEntityRef
packages/rxdb/src/system/change.ts                     # RxDBChange.rejectedAt / rejection
packages/rxdb/src/system/migration.ts                  # RXDB_SYSTEM_SCHEMA_VERSION 7
packages/rxdb/src/sync-state.ts                        # SyncRejection*、lastRejections、reportRejections
packages/rxdb/src/sync-contract/VersionManager.interface.ts  # PushRepositoryResult.rejected
packages/rxdb/src/trusted-write/trusted-write-intent.ts      # 登记对齐写入调用点
packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts   # migrateSystemSchema 加列
packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts # 加列
packages/rxdb-plugin-sync/src/
├── push-repository.ts                                # results 校验、提交事务、对齐、上报
├── get-repository-sync-status.ts / pull-conflict-utils.ts / pull-round.ts
├── query-cache-outbox.ts / cleanup-expired.ts        # 「待推」口径
packages/rxdb-plugin-history/src/HistoryManager.ts     # pendingCount 口径
packages/rxdb-adapter-http/src/…                       # mergeChanges 返回类型随签名改（仍抛不支持）

# 阶段 B：三框架与 demo
packages/rxdb-angular/src/use-sync-state.ts            # lastRejections Signal
packages/rxdb-vue/src/use-sync-state.ts                # lastRejections ComputedRef
packages/rxdb-react/src/use-sync-state.ts              # 透传（TSDoc 补字段说明）
apps/dev-rxdb-supabase/ + apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts
apps/dev-rxdb-react/ + apps/dev-rxdb-react-e2e/、apps/dev-rxdb-vue/ + apps/dev-rxdb-vue-e2e/

# 阶段 B：发布
requirements/api-baseline/{rxdb,rxdb-plugin-sync,rxdb-adapter-supabase,rxdb-angular,rxdb-vue}.json
website/docs/migration/supabase-push-receipts.md + README.md + website/sidebars.ts

# 阶段 C
docker/sql/02-rxdb-sync-functions.sql                  # rxdb_log_change_trigger SECURITY DEFINER
docker/sql/04-rxdb-utils-functions.sql                 # rxdb_insert_changes + GUC 守卫；rxdb_mutations 改调
docker/sql/production/rxdb-change-grants.sql           # 新：生产权限
website/docs/adapters/supabase.md                      # 「生产部署」节
```

**Structure Decision**: 远端语义全部在参考 SQL；客户端契约变更集中在 `rxdb-adapter.ts`（类型）、`push-repository.ts`（消费）与
Supabase 适配器（唯一实现）；被拒状态复用 `RxDBChange` 与 `SyncStateHub` 两条既有通道，不新增模块。

## 偏离与澄清

1. **spec 假设「跨框架测试夹具需按新契约改」**：`sync-override.ts` 是本地适配器夹具，不实现远端 `mergeChanges`，不受影响；真正要改的是
   [remote-merge-result §5](contracts/remote-merge-result.md) 列出的远端替身（分属 `rxdb-plugin-sync`、`rxdb-adapter-sqlite-wasm`、
   `rxdb-adapter-supabase`）。
2. **AC#7「既有 9 条」**：runner 今天登记 10 个用例，其中 `rls-filtered-delete` 断言的正是要修的行为，本故事改写它（AC#1）；其余 9 条
   不变并全部 PASS。与 006 quickstart 同口径。
3. **AC#16 的 React / Vue demo**：两个 demo 今天不连远端、也不用 `useSyncState()`。本 plan 定为各加一个被拒列表面板；e2e 的触发方式
   在 tasks 阶段二选一：只在 e2e 构建启用的会拒绝的远端替身，或在三框架绑定单测里断言同一份 `SyncRejection` 输入（D16）。
4. **探针只接受同步表**：DELETE 判定只在 `p_skip_sync = true`（推送路径）执行，推送路径只作用于已启用同步的表（**推断**，与 US-220
   `rxdb_batch_update` 同一前提）；非同步表上少删以 22023 显式失败（[push-integrity §2](contracts/push-integrity.md)）。
5. **开发默认权限不收紧**：10 个 Supabase 测试文件以 `anon` 清理 `rxdb_change`；生产权限进单独脚本，回归在事务内执行后回滚（D18）。
   测试清理改用 `service_role` 登记为后续项。
6. **`mutations()` 直写路径不变**：不传 `p_receipts`，保持全有或全无；它在 `p_skip_sync = false` 下由触发器记日志，配对校验只做
   「重复写」一条（[push-integrity §3](contracts/push-integrity.md)）。
7. **被拒上报点**：changelog 推送由 `SyncManager.push` 显式触发，不经 `sync-listeners.ts` 的回推轮，所以 `reportRejections` 在
   `pushRepository` 提交后调用（D15）。

## Complexity Tracking

| 新增                                             | 为什么需要                                                           | 更简单的方案为什么不行                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `p_receipts` 开关                                | 部分成功必须由认识它的客户端显式要求                                 | 直接改返回形状：旧客户端会把缺项当成功、推进水位线，造成「被拒被当成已生效」（D5）                               |
| 先整组、出错逐实体重放                           | 逐实体结果需要子事务隔离                                             | 每实体一个子事务：大批次超过 64 个子事务后 PostgreSQL 性能断崖（D6）                                             |
| `pg_advisory_xact_lock` + 逐实体幂等             | 部分成功后重试要跳过已生效实体、重新判定被拒实体                     | 沿用整批幂等（`idempotent_changes_count < input_changes_count`）：部分已写时整批跳过，被拒实体永远不再判定（D8） |
| `RxDBChange.rejectedAt` / `rejection` + 模式迁移 | 被拒是跨重启的终态，且要可查询                                       | 复用 `remoteId` 作标记：与「待推」口径冲突，`query-cache-outbox.ts` 明确反对（D12）                              |
| `rxdb_insert_changes`（DEFINER + GUC 守卫）      | 回收客户端对日志表的写权限后，INVOKER 的 `rxdb_mutations` 仍需写日志 | `rxdb_mutations` 整体改 DEFINER：业务写会绕过 RLS，正好违背本故事（D18）                                         |
| 生产权限单独脚本                                 | 生产要收紧、开发测试依赖宽松权限                                     | 收紧基础 SQL：破坏 10 个以 `anon` 清理日志的测试文件（D18）                                                      |
