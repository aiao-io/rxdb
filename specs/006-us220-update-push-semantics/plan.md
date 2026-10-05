# Implementation Plan: US-220 — Supabase 推送 UPDATE 的落库语义

**Branch**: `006-us220-update-push-semantics` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md)（故事 [US-220](../../requirements/stories/adapter/US-220-supabase-update-push-semantics.md)，AC#1～8）。
已冻结：落库方式为普通 UPDATE；行已不存在时抛错，SQLSTATE 与 42501 不同，不跳过。本轮只出 plan 与设计产物，不写实现代码
（roadmap 约束 16：US-218 阶段 A～C 与本故事的 plan 全部完成后再开工）。

## Summary

推送路径上的修改今天和新建一起走 `INSERT … ON CONFLICT DO UPDATE`，部分列载荷先撞 NOT NULL（23502），owner 型与共享编辑型 RLS
又要求修改行满足 INSERT 策略（42501）。改法：

1. **下发形状**：`rxdb_mutations` 新增第 5 个参数 `p_updates`（默认 `'[]'`），与 `p_upserts` 同形；客户端
   `build_merge_changes_payload()` 把修改放进 `p_updates`，`p_upserts` 只剩新建；参考 SQL 删除 4 参旧签名（D1、D5）。
2. **落库**：新增 `rxdb_batch_update`，逐行普通 `UPDATE`，只 `SET` 载荷里出现的列；`rxdb_mutations` 按 upsert → update → delete
   执行，返回值增加 `updated`（D2）。
3. **零行判定**：UPDATE 零行时调存在性原语 `rxdb_existing_ids`（`SECURITY DEFINER`、`row_security = off`、只接受同步表）：
   存在 → 42501，不存在 → `RX001`；两者带 JSON `DETAIL`（D3、D4）。
4. **测试与文档**：6 个 SQL 回归用例、载荷单测改断言、连真实 Supabase 的双客户端 spec、e2e 勾选用例；README、适配器文档、
   迁移文档（D7、D8）。

`RxDBAdapterSupabase.mutations()`（仓库直写路径）不改，见「偏离与澄清」2。

## 跨 plan 冻结项（须与 US-218 plan 交叉核对后一并冻结）

下面三项由本 plan 给出取值。它们与 US-218 阶段 A / B 共用，**US-218 plan 完成并逐项核对一致后才算冻结**；核对中任何一方要改，
两份 plan 与对应 contracts 同步改，再进 `/speckit-tasks`。

| #   | 冻结项                      | 本 plan 的取值                                                                                                                                                                                                                       | 契约                                                             | 依据 |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---- |
| F1  | UPDATE 下发形状             | `rxdb_mutations(p_upserts, p_deletes, p_changes, p_skip_sync, p_updates jsonb DEFAULT '[]')`；`p_updates` 与 `p_upserts` 同形；删 4 参旧签名                                                                                         | [contracts/rxdb-mutations.md](contracts/rxdb-mutations.md)       | D1   |
| F2  | 「行已不存在」的 SQLSTATE   | `RX001`（新设 `RX` 类，PostgREST 映射 HTTP 400）；「被拒」用 42501；两者 `DETAIL` 为 `{"op","schema","table","entityId","reason"}` JSON；US-218 的新自定义码从 `RX002` 顺延                                                          | [contracts/sqlstate-registry.md](contracts/sqlstate-registry.md) | D3   |
| F3  | 存在性判定原语（机制+签名） | `public.rxdb_existing_ids(p_table text, p_schema text, p_ids text[]) RETURNS text[]`，`SECURITY DEFINER`、`STABLE`、`SET search_path = pg_catalog, pg_temp`、`SET row_security = off`；只接受挂 `rxdb_sync_trigger` 的表，否则 22023 | [contracts/existence-probe.md](contracts/existence-probe.md)     | D4   |

US-218 核对时重点看：

- F1：US-218 阶段 A 改 DELETE 时不再改 `rxdb_mutations` 的参数表（否则两边各删一次旧签名、各加一个参数会互相覆盖）；若 US-218 也要加参数，
  两个故事合成一次签名变更。
- F2：US-218 AC#13「5xx 一律可重试」与 `RX001` 落 400 一致；US-218 阶段 B 按 `DETAIL.reason` 区分「被拒」与「已不存在」，不靠解析 `MESSAGE`。
- F3：US-218 阶段 A 的 DELETE 用同一个函数整批判定；阶段 C 收紧 `rxdb_change` 后探针仍可用（它不读日志）。

## Technical Context

**Language/Version**: PostgreSQL 15+ PL/pgSQL（参考 SQL `docker/sql/04-rxdb-utils-functions.sql`）；TypeScript 6.0 strict + ESM

**Primary Dependencies**: PostgREST（Supabase）——按参数名匹配 RPC、SQLSTATE → HTTP 映射；`@supabase/supabase-js`（`rpc()`）；
`@aiao/rxdb`（`mergePushBatch` 的推送动作）；无新增 npm 依赖

**Storage**: 远端 Supabase / PostgreSQL 的同步表（挂 `rxdb_sync_trigger` / `rxdb_timestamp_trigger`）与 `rxdb_change` 日志表；本地不变

**Testing**: SQL 回归（`supabase-sql-security-regressions.sql` + `run-supabase-sql-security-regressions.sh`，docker 容器 `supabase-db`）；
Vitest 单测（`review-regressions.spec.ts` 载荷断言）；连真实 Supabase 的 Vitest（`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 门控，同
`sync-data-integrity.spec.ts`）；Playwright e2e（`apps/dev-rxdb-supabase-e2e`）

**Target Platform**: 远端 Supabase（PostgREST + PostgreSQL）；客户端为浏览器 / Node 中的 `@aiao/rxdb-adapter-supabase`

**Project Type**: 既有可发布库的内部行为修正 + 参考 SQL 变更；无公共 TS API 变化

**Performance Goals**: 单批推送的数据库操作 < 100 ms（宪法 IV，SC-006）；成功路径不比今天多查询，探针只在零行时执行（D9）

**Constraints**: 无 fallback——零行一律抛错，不跳过、不补插入；新客户端连旧 SQL 必须显式失败（`PGRST202`），不得静默丢修改；
探针只泄露「同步表里某 id 是否存在」；`rxdb_batch_update` 是 `SECURITY INVOKER`，不绕过调用方 RLS

**Scale/Scope**: 一个包（`rxdb-adapter-supabase`）+ 参考 SQL 一个文件 + e2e 一个文件 + 文档三处；新 SQL 函数 3 个（含内部 helper）

## Constitution Check

_GATE: Phase 0 前必须通过，Phase 1 设计后复查。_ 依据宪法 v2.0.2。

| 原则        | 检查项                                                                                                                                      | 结论 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| I. 代码质量 | `rxdb-adapter-supabase` 的 `lint` + `typecheck` 零警告；嵌套 ≤ 3；新内部类型 `MergeChangesUpdatePayload` 与改动函数带 TSDoc                 |  ✅  |
| I. 代码质量 | 无 fallback：零行必抛（42501 / `RX001`），不跳过、不按 upsert 重试；新客户端连旧 SQL 由 PostgREST 报 `PGRST202`，不做降级调用（D1）         |  ✅  |
| I. 代码质量 | 新 SQL 函数沿用既有护栏：`search_path = pg_catalog, pg_temp`、标识符校验、`%I` 引用；`SECURITY DEFINER` 只用于探针且有同步表白名单（D4）    |  ✅  |
| I. 代码质量 | 新抽象：内部 helper `rxdb_id_array_type()`，由 `rxdb_batch_delete` 与探针共用，理由见 Complexity Tracking                                   |  ✅  |
| II. 测试    | TDD：6 个 SQL 用例、载荷单测、AC#6 spec、AC#7 e2e 都先写并确认红（今天的实现下 AC#1～5 用例会以 23502 / 42501 / 静默插入失败）              |  ✅  |
| II. 测试    | 既有断言改写而非删除（FR-013）：`review-regressions.spec.ts` 的「同一次推送里新建与修改同在 `p_upserts`」改为分属 `p_upserts` / `p_updates` |  ✅  |
| II. 测试    | 覆盖率：`rxdb-adapter-supabase` 按「其他包」档 ≥ 80%（`coverage-check.mjs`），本次只改内部载荷构造，不降基线                                |  ✅  |
| III. 三框架 | 无公共 API 变化，`rxdb-plugin-sync` 与 Angular / React / Vue 绑定不改；三端经同一个适配器推送，行为天然一致（FR-015）                       | N/A  |
| IV. 性能    | 成功路径：每条修改一次按主键 `UPDATE`，不多查询；探针只在零行时执行；AC#6 spec 记录单批耗时作为 < 100 ms 的验证数据（D9）                   |  ✅  |
| IV. 性能    | 包体积：只改载荷构造，增量可忽略，仍 < 50 KB gz                                                                                             |  ✅  |
| 工程护栏    | 无新依赖；参考 SQL 的签名变更附迁移文档与升级顺序（D7）；一个 PR 只交付本故事；与 US-218 的共用部分按「跨 plan 冻结项」先核对               |  ✅  |

**设计后复查**：Phase 1 只引入一个内部 SQL helper（Complexity Tracking），对外签名变更有迁移文档，结论不变。

## Project Structure

### Documentation (this feature)

```text
specs/006-us220-update-push-semantics/
├── spec.md
├── plan.md            # 本文件
├── research.md        # Phase 0：D1–D9
├── data-model.md      # Phase 1：载荷实体、函数、错误回答、判定流程
├── contracts/
│   ├── rxdb-mutations.md      # rxdb_mutations 新签名、p_updates、执行顺序、返回值、兼容矩阵（F1）
│   ├── existence-probe.md     # rxdb_existing_ids（F3，与 US-218 共用）
│   └── sqlstate-registry.md   # RX 类登记 + 42501 / RX001 的 DETAIL 形状（F2）
├── quickstart.md      # AC#1～8 验证步骤
├── checklists/requirements.md
└── tasks.md           # Phase 2（/speckit-tasks，约束 16 解除前不生成）
```

### Source Code (repository root)

```text
docker/sql/04-rxdb-utils-functions.sql
  # 新：rxdb_id_array_type()（内部）、rxdb_existing_ids()、rxdb_batch_update()
  # 改：rxdb_batch_delete() 改用 rxdb_id_array_type()；rxdb_mutations() 加 p_updates、执行顺序、返回 updated；
  #     DROP 4 参旧签名；GRANT 改新签名；探针 GRANT anon, authenticated

packages/rxdb-adapter-supabase/
├── src/supabase.merge-changes.ts     # 改：MergeChangesUpdatePayload、MergeChangesPayload.p_updates、按 inserts / updates 分流
├── src/RxDBAdapterSupabase.ts        # 改：mergeChanges() 多传 p_updates；mutations() 不改
├── src/__tests__/review-regressions.spec.ts                 # 改：载荷断言
├── src/__tests__/supabase-sql-security-regressions.sql      # 改：6 个新用例 + 分发行
├── src/__tests__/run-supabase-sql-security-regressions.sh   # 改：CASES 登记
├── src/__tests__/update-push-semantics.spec.ts              # 新：AC#6 双客户端（真实 Supabase）
└── README.md                         # 改：rxdb_mutations 参数说明、UPDATE 语义、错误码

apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts           # 改：AC#7 新建 → 勾选 → 另一上下文拉取

website/docs/adapters/supabase.md                            # 改：参数表、UPDATE 语义、探针的已知限制
website/docs/migration/supabase-update-push.md               # 新：升级顺序与报错特征
website/docs/migration/README.md、website/sidebars.ts        # 改：登记迁移文档
CHANGELOG / requirements/release-plan.md                      # 发布时按惯例登记迁移项（不在本故事 PR 内手写 CHANGELOG）
```

**Structure Decision**: 远端语义全部落在参考 SQL；客户端只改内部载荷构造与一处 RPC 参数，不新增模块。SQL 回归沿用既有
`rxdb_sql_regression.test_*()` + `CASES` 的写法；真实链路验证沿用 `sync-data-integrity.spec.ts` 的门控方式。

## 偏离与澄清

1. **SC-006「成功路径不多一次查询」**：spec 标为推断。设计上成立——探针只在 `ROW_COUNT = 0` 时调用（D2、D4），成功路径是一次按主键的
   `UPDATE`；耗时由 AC#6 spec 记录确认（D9）。
2. **`mutations()` 直写路径不在范围内**：它把 `options.update` 整实体（减 `createdBy`）放进 `p_upserts`，**推断**在 owner 型与共享编辑型
   RLS 上同样命中症状 2、3。改成普通 UPDATE 会把「目标行不存在时插入」变成 `RX001`，是仓库 `save()` 语义的改变，超出本故事 In Scope
   （推送路径）。本 plan 不改它（不传 `p_updates`，取默认值，行为不变）；实现前在故事「范围边界」的 Out of Scope 补一条并登记待评估项（D6）。
3. **AC#4「SELECT 不放行」分支**：`rxdb_batch_update` 不带 `RETURNING`，SELECT 策略经 `WHERE` 对旧行的过滤仍生效，被过滤即零行 → 探针判
   「存在」→ 42501，与 spec「存在但看不见视为被拒」一致（D2）。
4. **探针依赖属主绕过 RLS**：**推断** Supabase 的 `postgres` 角色满足 `row_security = off` 的前提（`BYPASSRLS`，或为表属主且未开
   `FORCE ROW LEVEL SECURITY`）；不满足时探针显式报错而非返回错误结论。`existence-probe` 用例在容器里实测，结果写进 tasks 验证项（D4）。

## Complexity Tracking

| 新增                                        | 为什么需要                                                                       | 更简单的方案为什么不行                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 内部 SQL helper `rxdb_id_array_type()`      | `rxdb_batch_delete` 与探针都要按 `id` 列真实类型构造数组比较，取类型的查询抽一处 | 探针里复制一份 `pg_attribute` 查询：两份取类型逻辑会在支持新 id 类型时漂移（`uuid` / `varchar` 回归已踩过） |
| `rxdb_existing_ids()` 用 `SECURITY DEFINER` | 「存在但被拒」与「已不存在」必须分得开，而调用方 RLS 下两者都是零行              | 按日志判定：从未同步或关同步时删除的行没有日志，会误判；日志读权限随部署收紧而漂移（D4）                    |
