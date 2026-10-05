# Tasks: US-218 — Supabase 推送的 RLS 拒绝与日志完整性

**Input**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)（D1–D20）、[data-model.md](data-model.md)、
[contracts/](contracts/)（[push-integrity](contracts/push-integrity.md)、[rxdb-mutations-receipts](contracts/rxdb-mutations-receipts.md)、
[remote-merge-result](contracts/remote-merge-result.md)、[sync-rejections-api](contracts/sync-rejections-api.md)、
[rxdb-change-permissions](contracts/rxdb-change-permissions.md)；与 US-220 共用的 F1～F6 已冻结）、[quickstart.md](quickstart.md)

**Tests**: 必需。TDD：每个用例先写、先跑红，红的原因记进 PR 描述，再写实现。今天就绿的护栏用例在描述里注明「护栏，今天即绿」。

**交付**: 三个 PR，一个阶段一个 PR，按 A → B → C 顺序合入；US-220（[006 tasks](../006-us220-update-push-semantics/tasks.md)）之上叠分支开发（stacked PR：PR-A 以 US-220 分支为 base，B 以 A 为 base，C 以 B 为 base），
合入顺序 US-220 → A → B → C（roadmap 约束 16）。阶段 A 不单独发版，与阶段 B 同一版本发布（research D4）。

| PR   | 阶段 | 故事                                                    | 任务             |
| ---- | ---- | ------------------------------------------------------- | ---------------- |
| PR-A | A    | US1、US2、US7                                           | T001～T019       |
| PR-B | B    | Foundational-B、US3、US4、US5、PR-B 收尾                | T020～T076、T090 |
| PR-C | C    | US6                                                     | T077～T087       |
| —    | —    | Polish（每个 PR 各自收尾的状态同步 + 合入后的范围登记） | T088～T089       |

**Organization**: 按 spec 的用户故事分阶段，阶段内的故事按 PR 归组。阶段 B 的类型与系统表迁移阻塞 US3～US5，单列为 Foundational-B。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1～US7）

## 路径约定

| 简称         | 路径                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| 参考 SQL     | `docker/sql/04-rxdb-utils-functions.sql`                                                                       |
| 同步函数 SQL | `docker/sql/02-rxdb-sync-functions.sql`                                                                        |
| 回归 SQL     | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`                           |
| 回归脚本     | `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh`                        |
| 重载 SQL     | `docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < 参考 SQL`                        |
| 单跑用例     | `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v test_case=<用例> < 回归 SQL` |
| 推送仓库     | `packages/rxdb-plugin-sync/src/push-repository.ts`                                                             |
| 推送仓库测试 | `packages/rxdb-plugin-sync/src/__tests__/push-repository.spec.ts`                                              |
| 适配器       | `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                                                    |
| 真实链路测试 | `packages/rxdb-adapter-supabase/src/__tests__/push-receipts.spec.ts`                                           |

新增 SQL 用例的固定写法与 [006 tasks「路径约定」](../006-us220-update-push-semantics/tasks.md) 相同（下文不再重复）：

1. 在回归 SQL 中新增 `CREATE FUNCTION rxdb_sql_regression.test_<snake_name>() RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp`；
2. 在文件末尾分发区追加 `SELECT rxdb_sql_regression.test_<snake_name>() WHERE :'test_case' IN ('all', '<kebab-name>');`
   （需以 `anon` 执行的放在 `SET LOCAL ROLE anon;` 与 `RESET ROLE;` 之间）；
3. 在回归脚本的 `CASES=( … )` 末尾追加 `<kebab-name>`。

夹具表建在回归 SQL 顶部既有夹具区（`rxdb_sql_regression` schema）；调用方身份沿用 `pg_catalog.set_config('rxdb_sql_regression.uid', '<uid>', true)`。
凡是会走到 DELETE 零行判定（即会调探针 `rxdb_existing_ids`）的夹具表都要调用 `public.rxdb_enable_sync_for_table('<table>', 'rxdb_sql_regression', '<Entity>')`。
回归 SQL 整个文件是一个事务、以 `ROLLBACK` 结束，用例之间互不留痕。

用例数口径：US-220 合入后 16 条；PR-A 新增 4 条（`delete-hidden-row`、`delete-gone`、`mixed-batch-rollback`、`push-integrity`）并改写
`rls-filtered-delete` → 20 条；PR-B 新增 8 条 → 28 条；PR-C 新增 1 条 → 29 条。

---

# PR-A：阶段 A（AC#1～7）

## Phase 1: Setup（PR-A）

**Purpose**: 拿到基线，确认夹具约束，验证配对规则依赖的客户端压缩不变量（research D3 的**推断**）

- [ ] T001 确认 PR-A 分支基于 US-220 分支最新提交（US-220 合入 `main` 后改 rebase 到 `main`）；`pnpm nx run rxdb-adapter-supabase:test-env` 起环境，
      重载 SQL 后执行 `bash 回归脚本`，记录 16 个用例基线：15 条 `🟢 PASS`，`rls-filtered-delete` 红（期望 42501，今天成功且写了日志）。贴进 PR-A 描述草稿
- [ ] T002 读 006 tasks T004 的「验证记录」，决定本阶段夹具表 `rls_owned_ids` 与新建夹具表是否保留 `FORCE ROW LEVEL SECURITY`：
      探针在 `FORCE` 表上正确返回 → 保留 `FORCE`；抛「query would be affected by row-level security policy」→ 本阶段走到探针的夹具表一律只
      `ENABLE`（不 `FORCE`），并在回归 SQL 夹具区加注释说明原因。结论写回下方「决策记录」

  决策记录：（实现时填写）

- [ ] T003 [P] 在 `packages/rxdb/src/__tests__/sync-contract/compact-changes.spec.ts` 补三组断言，验证 `compactChanges`
      （`packages/rxdb/src/sync-contract/compact-changes.ts`）满足配对规则的前提：
      ① 同一实体任意变更序列压缩后，结果操作为 DELETE 当且仅当最后一条源变更为 DELETE（覆盖 INSERT→UPDATE、UPDATE→DELETE、
      INSERT→UPDATE→DELETE、DELETE→INSERT 等序列）；② INSERT→DELETE 抵消后不产生任何动作；③ 动作里的实体 id 文本与源变更的 `entityId` 逐字相同。
      跑一遍：全绿 → 在 PR-A 描述记「D3 推断已验证」；有红 → 修 `compactChanges`，不改 SQL 规则（research D3）
- [ ] T004 [P] 在 `packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts` 加一条载荷断言：一批里实体 X 为 UPDATE→DELETE、
      实体 Y 为 INSERT、实体 Z 为 INSERT→UPDATE 时，`rxdb_mutations` 调用参数满足：`p_changes` 中每个 main 日志的键恰好出现在
      `p_upserts` / `p_updates` / `p_deletes` 之一；`p_deletes` 的 id 恰好是「最后一条 main 日志为 DELETE」的那些键，字符串逐字相等

**Checkpoint**: 基线已贴；`FORCE` 决策已记录；客户端正常推送路径不会触发 `RX002`（SC-003 的前提成立）

---

## Phase 2: User Story 1 — 被权限拦下的删除不留幽灵日志，而是明确拒绝（P1）🎯 MVP

**Goal**: `p_skip_sync = true` 时，删除零行生效且目标行存在 → 42501 `denied`、行不变、无日志；目标行已不存在 → 幂等成功（AC#1、2、4、5）

**Independent Test**: 单跑 `rls-filtered-delete`、`delete-hidden-row`、`delete-gone`、`mixed-batch-rollback` 四个用例全部 PASS

### Tests（先红）

- [ ] T005 [US1] 改写回归 SQL 中的 `test_rls_filtered_delete`（AC#1，[push-integrity §2、§4](contracts/push-integrity.md)）：
      在夹具区为 `rls_owned_ids` 调用 `rxdb_enable_sync_for_table('rls_owned_ids', 'rxdb_sql_regression', 'RlsOwnedId')`，`FORCE` 按 T002 决策；
      保留既有场景（SELECT `USING (true)`、DELETE 仅本人，行 `'owned-by-b'` 属 `sql-owner-b`，客户端 `sql-rls-filter-client`、`localId` 730001），
      断言补齐为：SQLSTATE `42501`；`MESSAGE` 等于 `format('rxdb: DELETE denied by row-level security: %I.%I id=%s', 'rxdb_sql_regression', 'rls_owned_ids', 'owned-by-b')`；
      `DETAIL::jsonb` 等于 `{"op":"DELETE","schema":"rxdb_sql_regression","table":"rls_owned_ids","entityId":"owned-by-b","reason":"denied"}`；
      行仍在；该客户端该 `localId` 无日志。改之前先 `grep -n rls_owned_ids 回归 SQL`，确认其它用例不因新挂的同步触发器多出日志而改变断言结果。
      单跑确认红（今天成功并写了日志）
- [ ] T006 [US1] 在回归 SQL 新增用例 `delete-hidden-row`（AC#2）：夹具表 `rls_hidden_ids`（`text` 主键 + `owner` 列），开 RLS（`FORCE` 按 T002），
      SELECT 与 DELETE 策略都是 `owner = current_setting('rxdb_sql_regression.uid', true)`，挂同步触发器，一行属 `sql-owner-b`。
      拆两个函数、同一 kebab 名：`test_delete_hidden_row()`（在 `anon` 区，uid 设为 `sql-owner-a`，推送删除该行 + 一条 main DELETE 日志，
      `p_skip_sync = true`，断言 42501 且 `DETAIL.reason = 'denied'`，**不是**成功）与 `test_delete_hidden_row_verify()`（在 `RESET ROLE` 之后，
      断言行仍在、该客户端无日志）。分发区两行都用 `IN ('all', 'delete-hidden-row')`，`CASES` 只追加一次。单跑确认红
- [ ] T007 [US1] 在回归 SQL 新增用例 `delete-gone`（AC#4，护栏）：在挂同步触发器的夹具表上，① 推送删除一个从未存在的 id + main DELETE 日志
      → 成功，返回 `deleted = 0`，日志按既有幂等语义写入 1 条；② 同组一个可删 id + 一个不存在 id → 成功，可删的行已删除；
      ③ 在不挂同步触发器的普通表上推送删除不存在的 id（`p_skip_sync = true`）→ `invalid_parameter_value`（22023）。
      单跑：①② 今天即绿（护栏），③ 今天红（今天不判定、直接成功）
- [ ] T008 [US1] 在回归 SQL 新增用例 `mixed-batch-rollback`（AC#5）：同一次调用含一条被拒删除（`rls_owned_ids` 的 `'owned-by-b'`）+ 一条
      可放行新建（同 schema 另一张放行表）及各自 main 日志 → 42501；调用前后对两张业务表与 `rxdb_change` 计数，全部不变。单跑确认红（今天新建落库）

### Implementation

- [ ] T009 [US1] 在参考 SQL 的 `rxdb_mutations`（5 参签名）`p_deletes` 分支加 DELETE 零行判定，代码形状照 [push-integrity §2](contracts/push-integrity.md)：
      只在 `p_skip_sync = true` 时执行；`rxdb_batch_delete` 返回值小于 `cardinality(ids)` 时对整组调 `rxdb_existing_ids`，非空 → `RAISE`
      `insufficient_privilege`，`MESSAGE` / `DETAIL` 取第一个被拒 id；空 → 不抛。`rxdb_batch_delete` 签名与返回值不变，不加 `RETURNING`。
      执行顺序按 [push-integrity §1](contracts/push-integrity.md)（步骤 0 留给 T014）
- [ ] T010 [US1] 重载 SQL；单跑 `rls-filtered-delete`、`delete-hidden-row`、`delete-gone`、`mixed-batch-rollback` 全部转绿；再跑一次 `bash 回归脚本`
      确认既有 16 条未回退

**Checkpoint**: 幽灵 DELETE 消失（SC-001、SC-002）；此时没有逐实体回执的客户端遇到被拒删除会被卡住，所以 PR-A 合入后不单独发版（T018）

---

## Phase 3: User Story 2 — 远端日志与业务写一一配对（P1）

**Goal**: 写入前只读载荷做配对校验，五种不配对一律 `RX002`，两张表都不变；压缩（N 日志 → 1 写）与非 main 日志照常通过（AC#6）

**Independent Test**: 单跑 `push-integrity` PASS；T003、T004 绿（正常推送路径不触发 `RX002`）

### Tests（先红）

- [ ] T011 [US2] 在回归 SQL 新增用例 `push-integrity`（AC#6，[push-integrity §3](contracts/push-integrity.md)），在挂同步触发器、RLS 放行的夹具表上：
      ① 五种 `reason` 各一例——`explicit_log_in_trigger_mode`（`p_skip_sync = false` + 一条 main 日志）、`duplicate_write`（同一键同时在
      `p_upserts` 与 `p_deletes`，`DETAIL.op` 为第二次出现所在数组的操作 `DELETE`）、`unpaired_change`（main DELETE 日志无对应删除）、
      `unpaired_write`（`p_skip_sync = true`，一次 `p_updates` 写无日志，`DETAIL.op = 'UPDATE'`）、`op_mismatch`（最后一条 main 日志为 DELETE，
      键却在 `p_upserts`）；每例断言 SQLSTATE `RX002`、`MESSAGE` 等于 `format('rxdb: push integrity violation (%s): %I.%I id=%s', …)`、
      `DETAIL::jsonb` 五个键齐全，且两张表计数不变；
      ② 一次调用同时违反检查 3 与 4 → 报 `unpaired_change`（按序报第一处）；
      ③ 合法形状：同一键三条 main 日志（INSERT、UPDATE、UPDATE）+ 一次 `p_upserts` → 成功，日志 3 条；
      ④ 非 main 日志（`branchId = 'feature-x'`）无业务写 → 成功，日志 1 条；
      ⑤ 键归一：日志 `schema` 为 NULL、业务写 schema 为 `public` 视为同一键；日志 `branchId` 为 NULL 视为 main；
      ⑥ `p_skip_sync = false`、无日志、两次不同键的业务写 → 成功（只做检查 2）。
      单跑确认红（今天五种不配对全部成功）

### Implementation

- [ ] T012 [US2] 在参考 SQL 的 `rxdb_mutations` 步骤 0 实现配对校验：只读 `p_changes` / `p_upserts` / `p_updates` / `p_deletes`，
      键 = （`COALESCE(schema, 'public')`、`table`、`id` 文本），main = `COALESCE("branchId", 'main') = 'main'`；按 §3 表的五条检查顺序，报第一处违规，
      `RAISE` 形状照 §3。校验在快照与写 `rxdb_change` 之前，失败时什么都没写。可抽成内部 helper，若抽则 `SECURITY INVOKER`、
      `SET search_path = pg_catalog, pg_temp`，不 `GRANT` 给客户端角色
- [ ] T013 [US2] 重载 SQL；单跑 `push-integrity` 转绿；`pnpm nx test rxdb-adapter-supabase` 全绿（正常推送路径因配对校验被拒 0 次，SC-003）

**Checkpoint**: 推送入口不再接受不配对的调用

---

## Phase 4: User Story 7 — 回归护栏（P3）

**Goal**: 改不了的修改继续 42501 且不写日志（AC#3）；20 个用例全部 PASS（AC#7、FR-027）

**Independent Test**: `bash 回归脚本` 20 条全部 `🟢 PASS`

- [ ] T014 [US7] 在回归 SQL 的 `test_update_denied`（006 T023）加一条断言：`p_skip_sync = true` 推送被拒修改后，该 `clientId` 无新日志；
      在函数头加注释「同时覆盖 US-218 AC#3」。护栏，今天即绿
- [ ] T015 [US7] 重载 SQL 后执行 `bash 回归脚本`，20 个用例全部 `🟢 PASS`；完整输出贴进 PR-A 描述（FR-027）
- [ ] T016 [P] [US7] 文档口径核对：`contracts/push-integrity.md` §4、`quickstart.md` A1、`plan.md` Project Structure 的用例数均为「新增 4 条、共 20 条」，AC#3 注明由 US-220 `update-denied` 覆盖（T014）；与实跑结果不符则同步修正

### PR-A 收尾

- [ ] T017 跑 PR-A 门禁：`pnpm nx run-many -t lint test --projects=rxdb,rxdb-adapter-supabase`；本 PR 只改 SQL 与测试，不涉及导出、系统表，其余门禁不需要
- [ ] T018 [P] 在 `requirements/release-plan.md` 标注：US-218 阶段 A 合入后不单独发版，与阶段 B 同一版本发布（research D4）；该版本含系统模式 7，
      属 `kind=migration`，按 release-plan 须先有一个 `kind=bridge` 版本；与 US-305 迁移版本如何合并由发布负责人定。不改 `requirements/migration-release.json`
- [ ] T019 更新 `requirements/stories/adapter/US-218-supabase-rls-push-integrity.md` 验收表 AC#1～7 状态与「实现文件」，同步 `requirements/status-overview.md`；
      PR-A 描述汇总 T001 基线、T002 决策、T003 结论、T015 回归输出

**Checkpoint（PR-A 可合入）**: AC#1～7 有 SQL 回归证据；阶段 A 不发版，等 PR-B

---

# PR-B：阶段 B（AC#8～16）

## Phase 5: Foundational-B（阻塞 US3～US5）

**Purpose**: 破坏性的 `RemoteMergeResult` 契约、系统模式 6 → 7、`SupabaseDataError` 保留错误码、推送方覆盖检查。

**⚠️ CRITICAL**: 本阶段完成前不开始 US3～US5 的实现任务（测试任务可先写）。

### Tests（先红）

- [ ] T020 [P] 在 `packages/rxdb/src/__tests__/system/migration.spec.ts` 把
      `expect(RXDB_SYSTEM_SCHEMA_VERSION).toBe(6)` 改为 `7`；在 `packages/rxdb-adapter-sqlite-core/src/__tests__/system-schema-migration.spec.ts` 与
      `packages/rxdb-adapter-pglite/src/__tests__/system-schema-migration.spec.ts` 各加：模式 6 的库升级后 `RxDBChange` 多出 `rejectedAt`、`rejection`
      两列，可空，旧行两列均为空；重复执行迁移不报错（FR-021）。确认红
- [ ] T021 [P] 在 `packages/rxdb-adapter-supabase/src/__tests__/errors.spec.ts` 与 `transient-write-retry.spec.ts` 加断言：PostgREST 错误体
      `{code, message, details, hint}` 经 `executeRetryableWrite` / `classify_postgrest_error` 后，抛出的 `SupabaseDataError` 带只读 `code`、`details`；
      网络错误与 5xx 仍按既有重试语义处理、不变成 `SupabaseDataError`（FR-016、AC#13）。确认红
- [ ] T022 [P] 在推送仓库测试加覆盖检查用例（FR-017、AC#14，[remote-merge-result §2](contracts/remote-merge-result.md)）：远端结果对本批 `sourceChanges`
      缺项 / 重复 / 多出未知 `localId` 各一例 → 本轮抛错、`lastPushedChangeId` 不动、本地无任何 `remoteId` 写入；把既有用例
      「远端返回非映射结果时仍推进水位线，但不保存本地变更」改写为「回执缺项时整轮失败、水位线不动」；再加一例：一批含已抵消的
      INSERT→DELETE 对与一条正常 UPDATE，远端只回那条 UPDATE 的结果 → 覆盖检查通过、水位线越过整批（抵消的变更不在 `sourceChanges`）；
      全部抵消的批次（`effectiveCount === 0`）不调用 `mergeChanges`、水位线照常推进。确认红

### Implementation

- [ ] T023 在 `packages/rxdb/src/system/change.ts` 的 `RxDBChange` 加两列，带 TSDoc：`rejectedAt`——「时间戳，可空」，默认 `null`；
      `rejection`——「JSON，可空（RemoteChangeRejection）」，默认 `null`；与 `remoteId` 互斥（同一行最多其一非空，data-model §5）
- [ ] T024 系统模式迁移：`packages/rxdb/src/system/migration.ts` 的 `RXDB_SYSTEM_SCHEMA_VERSION` 6 → 7；
      `packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts` 的 `migrateSystemSchema` 照 `ensureBranchActiveKey` 的写法
      （`pragma_table_info` 判存在 + `ALTER TABLE ADD COLUMN`）补两列；`packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts` 同样补齐
      （`ADD COLUMN IF NOT EXISTS`）。T020 转绿
- [ ] T025 在 `packages/rxdb/src/rxdb-adapter.ts` 按 [remote-merge-result §1](contracts/remote-merge-result.md) 定义并导出 `RemoteMergeResult`、
      `RemoteChangeResult`、`RemoteChangeRejection`、`RemoteEntityRef`（TSDoc 照契约），删除 `changeIdMapping`；文件中两处 `abstract mergeChanges`
      的返回类型都改为 `Promise<RemoteMergeResult>`；不传 `changes` 时约定 `results` 为空数组。确认 `packages/rxdb/src/index.ts` 导出新类型
- [ ] T026 [P] `packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts` 的 `mergeChanges` 只把返回类型改为 `Promise<RemoteMergeResult>`，仍抛 `HttpChangelogUnsupportedError`
- [ ] T027 [P] 在 `packages/rxdb-adapter-supabase/src/errors.ts` 给 `SupabaseDataError` 加只读 `code?: string`、`details?: string`（TSDoc）；
      `packages/rxdb-adapter-supabase/src/postgrest-error.ts` 的 `classify_postgrest_error` 与适配器的 `executeRetryableWrite` 保留 `code` / `details` / `hint`。T021 转绿
- [ ] T028 改推送仓库：删除 `getChangeIdMapping`；`mapRemoteIds` 只读 `status = 'applied'` 的结果；在写本地之前对本批 `sourceChanges` 做覆盖检查
      （缺项 / 重复 / 多余 → 抛错，不写本地、不推进水位线）；`sourceChangesByLocalId` 不再用于扇出（无其它使用则删除）。`rejected` 结果的提交在 US3 实现。T022 转绿
- [ ] T029 适配器的 `mergeChanges` 改为返回 `RemoteMergeResult`：本批每个源变更 `localId` 在 `change_id_mapping` 中 → `{localId, status: 'applied', remoteId}`；
      不在 → 抛 `SupabaseDataError`（不再返回 `number | void`）。此时仍调 5 参 `rxdb_mutations`
- [ ] T030 [P] 测试夹具按新契约迁移（[remote-merge-result §5](contracts/remote-merge-result.md)），每个文件的 mock 都返回 `{results: [...]}`：
      `packages/rxdb-plugin-sync/src/__tests__/{push-repository,push-protocol,push-pull-protocol.integration}.spec.ts`、
      `packages/rxdb-plugin-sync/src/__tests__/contracts/push-repository.spec.ts`
- [ ] T031 [P] 同上：`packages/rxdb-adapter-sqlite-wasm` 下的 `branch-materialization-sync.spec.ts`、`querycache-identity.spec.ts`
- [ ] T032 [P] 同上：`packages/rxdb-adapter-supabase/src/__tests__/` 下 `transient-write-retry`、`review-regressions`、`pull-push-changes`、
      `filter-sync-snapshots`、`utils`、`repository-sync` 六个 spec；迁移完 `grep -rn changeIdMapping packages apps` 应只剩 SQL 返回字段 `change_id_mapping`
- [ ] T033 检查点：`pnpm nx run-many -t test typecheck --projects=rxdb,rxdb-plugin-sync,rxdb-adapter-supabase,rxdb-adapter-http,rxdb-adapter-sqlite-core,rxdb-adapter-sqlite-wasm,rxdb-adapter-pglite` 全绿

**Checkpoint**: 新契约就位，行为与 PR-A 相同（全部 applied 或整批失败）

---

## Phase 6: User Story 3 — 一条被拒不再拖垮整批（P1）

**Goal**: `p_receipts = true` 时逐实体回执；被拒变更持久标记、不再重推、水位线越过；扇出到全部源变更；未登记错误整批失败（AC#8、9、10、13、14、15）

**Independent Test**: 回执相关 SQL 用例 PASS；推送仓库测试与 `push-receipts.spec.ts` 中 AC#8～10、13～15 的用例 PASS

### Tests（先红）

- [ ] T034 [US3] 在回归 SQL 新增用例 `receipts-partial`（AC#8、9）与 `receipts-fanout`（AC#10），期望照 quickstart B1：
      `receipts-partial`——`p_receipts = true`，1 条被拒删除（`rls_owned_ids`）+ 2 条可放行新建 → 调用成功；`entity_results` 3 条，被拒那条
      `status = 'rejected'`、`code = '42501'`、`reason = 'denied'`、`localIds` 含其源变更；两条新建落库且在 `change_id_mapping`；被拒那条无日志。
      `receipts-fanout`——同一实体 3 条 main 源变更压成 1 次被拒写 → 该实体回执 `localIds` 含 3 个，3 条都无日志。单跑确认红（6 参签名不存在）
- [ ] T035 [US3] 在回归 SQL 新增用例 `receipts-gone`（AC#13：修改已不存在的行 → `rejected`、`RX001`、`gone`）与 `receipts-unclassified`
      （AC#13：在带唯一约束的夹具表上制造 23505 → 整次调用失败，SQLSTATE 原样为 23505，两张表无变化）。确认红
- [ ] T036 [US3] 在回归 SQL 新增用例 `receipts-idempotent`（AC#15，复用既有 `idempotency_effects` 夹具与 `count_idempotency_effect`）：同一批调两次 →
      第二次业务写副作用计数不变、`change_id_mapping` 远端 id 与首次相同；首次被拒的实体在放开策略后重试 → 变为 `applied`；
      `receipts-legacy`（FR-022：不传 `p_receipts`，任一条被拒 → 整批 42501，返回无 `entity_results`）；
      `receipts-many-groups`（70 个组各含 1 条被拒 → 调用成功，不报子事务溢出）。确认红
- [ ] T037 [US3] 改回归 SQL 的 `test_rls_write_boundary`：把 006 T015 写入的 5 参签名改为 `public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb,boolean)`，
      并断言 5 参 `to_regprocedure` 为 NULL（旧签名已删）、6 参不为 NULL、`prosecdef = false`。确认红
- [ ] T038 [P] [US3] 新建 `packages/rxdb-adapter-supabase/src/__tests__/push-receipts-mapping.spec.ts`（mock `client.rpc`，不连远端）
      （[remote-merge-result §3](contracts/remote-merge-result.md)、[rxdb-mutations-receipts §6](contracts/rxdb-mutations-receipts.md)）：
      `mergeChanges` 传 `p_receipts: true`，`mutations()` 不传；`localId` 在 mapping → applied；在被拒实体 `localIds` → rejected，`rejection` 的
      `code` / `reason` / `message` / `entity` 照回执；两者都不在或都在 → `SupabaseDataError`；响应缺 `entity_results` 或形状不对 → `validateMergeResponse`
      抛 `SupabaseDataError`；RPC 返回 `PGRST202`（旧 SQL）→ `SupabaseDataError` 且 `code = 'PGRST202'`。确认红
- [ ] T039 [P] [US3] 在推送仓库测试加（AC#8、9、10，[data-model §7](data-model.md)）：部分被拒 → applied 的源变更拿到 `remoteId`，被拒实体的
      全部源变更写入 `rejectedAt` 与 `rejection`、`remoteId` 仍为空；`lastPushedChangeId` 越过两者；第二轮推送 `mergeChanges` 收到的 `changes`
      不含被拒变更；`PushRepositoryResult.pushed` 只数 applied、`rejected` 等于被拒源变更数；本地提交事务失败 → 两种标记都不写、水位线不动。确认红
- [ ] T040 [P] [US3] 「待推」口径测试（research D13）：每个查询各一条「被拒变更不计入」断言——推送仓库测试（`queryUnpushedChanges`）、
      `get-repository-sync-status.spec.ts`、`pull-conflict-resolution.spec.ts`（`queryPendingLocalChanges`）、`pull-round.spec.ts`
      （`backfillOwnChangeRemoteIds`）、`query-cache-outbox.spec.ts`（两处查询各一条）、`cleanup-expired.spec.ts`，均在
      `packages/rxdb-plugin-sync/src/__tests__/`；`packages/rxdb-plugin-history/src/__tests__/HistoryManager.spec.ts` 对「`remoteId` 为空」的查询一条。确认红
- [ ] T041 [US3] RLS 夹具表（真实链路用）：在 `docker/sql/03-business-tables.sql` 第 8 节之前新增 `public.rls_todos`（列同 `public.todos`，含 `"createdBy"`），
      `ENABLE ROW LEVEL SECURITY`（不 `FORCE`）；策略 SELECT `USING (true)`，INSERT `WITH CHECK ("createdBy" = auth.uid()::text)`，
      UPDATE / DELETE `USING ("createdBy" = auth.uid()::text)`；`rxdb_enable_sync_for_table('rls_todos', 'public', 'RlsTodo')`；
      `GRANT SELECT, INSERT, UPDATE, DELETE … TO anon, authenticated`；确认第 8 节「禁用 RLS」循环不会关掉它（必要时在循环里排除该表）。
      重建容器后 `\d+ public.rls_todos` 与 `pg_policies` 核对
- [ ] T042 [US3] 新建真实链路测试 `push-receipts.spec.ts`，门控与其它连远端 spec 相同（缺 `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 时 skip）：
      用 `createClient(url, key).auth.signUp` 注册两个随机用户（容器已开 autoconfirm），各自以 `client` 选项构造适配器；在 spec 内声明
      `@Entity({ name: 'RlsTodo', namespace: 'public', tableName: 'rls_todos', … })`。场景：A 新建一行并推送；B 拉取后删除 A 的行、修改自己的行、
      并对 A 的另一行做两次修改 → 推送：自己的修改 applied 并拿到远端 id，删除被拒 `42501`、`denied`，两次修改的源变更都标被拒（AC#8、10）；
      再推一轮 → 被拒变更不被重发（AC#9）；对同一批直接调两次 `adapter.mergeChanges` → 远端 id 相同（AC#15）；制造一条 23505 →
      `SupabaseDataError`、水位线不动、无被拒标记（AC#13）。记录单批 `mergeChanges` 耗时并断言 < 100 ms（SC-009）。确认红

### Implementation

- [ ] T043 [US3] 参考 SQL：按 [rxdb-mutations-receipts §1～§5](contracts/rxdb-mutations-receipts.md) 改 `rxdb_mutations`——
      `DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb,jsonb,jsonb,boolean,jsonb)`；新 6 参签名第 6 参 `p_receipts boolean DEFAULT false`，
      `SECURITY INVOKER`，`SET search_path = pg_catalog, pg_temp`，`GRANT EXECUTE` 6 参签名给 `anon, authenticated`；流程：
      0 配对校验 → 1 快照 → 2 按 `clientId` 排序加 `pg_advisory_xact_lock(hashtext('rxdb_mutations:' || clientId))`，某实体 main 日志都已存在 → 跳过、计为 applied
      → 3 分组执行：`p_receipts = true` 时每组一个子事务，组内出现可归类错误则回滚该组、逐实体各开子事务重放；`p_receipts = false` 不开子事务
      → 4 按 `p_changes` 顺序写 `rxdb_change`（applied 的 main 日志 + 全部非 main 日志，`ON CONFLICT DO NOTHING`）→ 5 返回。
      本任务归类 42501 → `denied`、`RX001` → `gone`；`WITH CHECK` 先于外键触发的 42501 归 `denied`；其它码不捕获。重放时 DELETE 零行判定逐 id 执行。
      返回 `{upserted, updated, deleted, changes, max_change_id, change_id_mapping, entity_results}`，`entity_results` 只在 `p_receipts = true` 时出现，
      元素形状 `{schema, table, entityId, op, status, code?, reason?, message?, localIds}`（`dependsOn` 在 US4）
- [ ] T044 [US3] 重载 SQL；单跑 T034～T037 的用例全部转绿；`bash 回归脚本` 除 `receipts-dependency`（尚未新增）外全绿
- [ ] T045 [US3] 适配器：`mergeChanges` 传 `p_receipts: true`；`validateMergeResponse` 校验 `entity_results`；按回执构造 `RemoteChangeResult`
      （T029 的 applied 分支 + rejected 分支）；`rejection.entity` 由 `SchemaManager.getEntityMetadataByTableName(tableName, namespace)` 反查实体名；
      `mutations()` 不传 `p_receipts`。T038 转绿
- [ ] T046 [US3] 推送仓库提交（data-model §7 的步骤 1、3 中的标记部分）：同一本地事务内 applied → `remoteId`，被拒实体的全部源变更 →
      `rejectedAt` / `rejection`，再写 `lastPushedChangeId`；`packages/rxdb/src/sync-contract/VersionManager.interface.ts` 的 `PushRepositoryResult`
      加必填 `rejected: number`（TSDoc），`pushed` 只数 applied；关联仓库按各自结果计。T039 转绿
- [ ] T047 [US3] 「待推」口径加 `rejectedAt = null`（research D13）：推送仓库 `queryUnpushedChanges`、`packages/rxdb-plugin-sync/src/get-repository-sync-status.ts`、
      `pull-conflict-utils.ts` 的 `queryPendingLocalChanges`、`pull-round.ts` 的 `backfillOwnChangeRemoteIds`、`query-cache-outbox.ts`（两处）、
      `cleanup-expired.ts`、`packages/rxdb-plugin-history/src/HistoryManager.ts` 中按 `remoteId` 为空的查询；**不改** `undo-redo-apply.ts`。T040 转绿
- [ ] T048 [US3] `pnpm nx test rxdb-adapter-supabase -- push-receipts` 中 AC#8～10、13、15 与 SC-009 断言转绿（AC#11 的本地对齐断言在 US4 补）；耗时记进 PR-B 描述

**Checkpoint**: 部分成功可用；被拒变更不再卡住同步（SC-004、SC-006）

---

## Phase 7: User Story 4 — 被拒实体在本地回到远端状态，依赖它的子实体一并处理（P2）

**Goal**: 推送提交时被拒实体对齐为远端当前值（远端无则移除），不产生待推变更、不进撤销栈；外键依赖失败归为 `dependency` 并指向父实体（AC#11、12）

**Independent Test**: `receipts-dependency` PASS；推送仓库测试的对齐用例 PASS；`push-receipts.spec.ts` 的 AC#11 断言 PASS

### Tests（先红）

- [ ] T049 [US4] 在回归 SQL 新增用例 `receipts-dependency`（AC#12）：夹具区建父子两张同步表（子表单列外键引用父表 `id`），父表 INSERT 策略不放行；
      一次 `p_receipts = true` 调用含父新建、引用它的子新建、一条无关新建 → 调用成功；父 `denied`；子 `rejected`、`code = '23503'`、
      `reason = 'dependency'`、`dependsOn = {schema, table, entityId}` 指向父；无关新建 applied。再加一例多列外键 → `dependsOn = {constraint}`。确认红
- [ ] T050 [P] [US4] 在推送仓库测试加（AC#11，[data-model §7](data-model.md)）：被拒实体远端有行 → 本地被覆盖为远端值（逐列相等）；远端无行 → 本地移除；
      对齐不生成 `RxDBChange`、不进撤销栈；被拒实体在本批之外还有更新的待推变更 → 不对齐；对被拒实体调远端 `findByIds` 失败 → 本轮不提交
      （无 `remoteId`、无被拒标记、水位线不动）。确认红
- [ ] T051 [P] [US4] 在 `push-receipts-mapping.spec.ts` 加：回执 `dependsOn` 为表引用 → `RemoteEntityRef {namespace, entity, entityId}`（实体名经
      `getEntityMetadataByTableName` 反查）；为 `{constraint}` → 原样透传。确认红
- [ ] T052 [US4] 在 `push-receipts.spec.ts` 的被拒删除场景后补 AC#11 断言：B 本地被删的那行恢复为远端值，B 的待推变更数与推送前被拒部分扣除后一致（对齐未产生新变更）。确认红

### Implementation

- [ ] T053 [US4] 参考 SQL：重放时把 23503 归为 `dependency`，用 `GET STACKED DIAGNOSTICS` 取 `CONSTRAINT_NAME` / `SCHEMA_NAME` / `TABLE_NAME`，查
      `pg_constraint`：单列外键（`conkey` 长度 1）→ 由 `confrelid` 与子行该列值给出 `dependsOn {schema, table, entityId}`；否则 `{constraint}`
      （[rxdb-mutations-receipts §3](contracts/rxdb-mutations-receipts.md)、research D9）。重载 SQL，`receipts-dependency` 转绿，`bash 回归脚本` 28 条全绿
- [ ] T054 [US4] 适配器构造 `rejection.dependsOn`（T051 转绿）
- [ ] T055 [US4] 推送仓库按 data-model §7 补齐提交：覆盖检查之后、本地事务之外对被拒实体调远端 `findByIds`（失败 → 不提交）；本地事务内在写被拒标记之后对齐：
      远端有行 → `upsertMany`，无行 → `deleteByIds`；关触发器、不写 `RxDBChange`、不进撤销栈；跳过本批之外有更新待推变更的实体。
      对齐写入用 `declareTrustedWrite(…, { intent: TrustedWriteIntent.remote_sync })`，并在 `packages/rxdb/src/trusted-write/trusted-write-intent.ts`
      登记 `{file, symbol, writePrimitive, intent, entrance: 'remote_entity_apply', verifiedAtLine}`。T050、T052 转绿
- [ ] T056 [US4] 跑 `pnpm audit:callsite-drift` 与 `pnpm audit:suite-callsites`，确认新登记的可信写入口无漂移

**Checkpoint**: 被拒实体本地与远端一致（SC-005）；外键依赖不再卡整批

---

## Phase 8: User Story 5 — 三框架都能看到被拒变更及原因（P2）

**Goal**: `SyncState.lastRejections` 在核心与三框架绑定对称暴露；三个 demo 都有被拒面板（AC#16，[sync-rejections-api](contracts/sync-rejections-api.md)）

**Independent Test**: 核心与三框架 `use-sync-state` spec PASS；三个 demo 面板组件 spec PASS；Supabase demo e2e 出现 `gone` 被拒，React / Vue e2e 空态 + a11y PASS

### Tests（先红）

- [ ] T057 [P] [US5] 新建共享夹具 `packages/rxdb-test/src/cross-framework-fixtures/sync-rejections.ts`（一份含 `denied` 与 `dependency` 两条的
      `readonly SyncRejection[]`，`dependency` 那条带 `dependsOn`），在 `packages/rxdb-test/src/cross-framework-fixtures/index.ts` 导出
- [ ] T058 [P] [US5] `packages/rxdb/src/__tests__/sync-state.spec.ts`：初始 `lastRejections` 是冻结空数组且引用稳定；`reportRejections([])` 不改状态、不发事件；
      非空时整体替换；之后一轮成功推送仍保留；下一次非空上报整体替换；`sameState` 按引用比较
- [ ] T059 [P] [US5] 三框架绑定 spec 各加一条（用 T057 夹具）：hub 上报 → 绑定读到同一引用；成功一轮 → 仍保留；再上报 → 替换。文件：
      `packages/rxdb-angular/src/__tests__/use-sync-state.spec.ts`（`Signal`）、`packages/rxdb-vue/src/__tests__/use-sync-state.spec.ts`（`ComputedRef`）、
      `packages/rxdb-react/src/__tests__/use-sync-state.spec.tsx`（透传字段）
- [ ] T060 [P] [US5] 推送仓库测试：本地提交成功且本轮有被拒 → 调一次 `sm.rxdb.syncState.reportRejections`，每条 `SyncRejection` 字段为
      `namespace`、`entity`、`entityId`、`op`（取回执的合并后操作，不是源变更类型）、`code`、`reason`、`message`、`dependsOn?`、`at`、`changeIds`；
      本轮无被拒 → 不调用；提交失败 → 不调用（sync-rejections-api §2）
- [ ] T061 [P] [US5] Angular demo 面板 spec `apps/dev-rxdb-supabase/src/app/sync-rejections-panel.spec.ts`：hub 上报 T057 夹具后，面板以语义列表
      （`ul` / `li`）列出实体、操作、原因、消息；空列表时显示空态文字
- [ ] T062 [P] [US5] React 面板 spec `apps/dev-rxdb-react/src/app/components/SyncRejectionsPanel.spec.tsx` 与 Vue 面板 spec
      `apps/dev-rxdb-vue/src/app/components/SyncRejectionsPanel.spec.ts`：同 T061，经 hub 渲染共享夹具（React 参照 `LoadingBar.spec.tsx`，
      Vue 用 `apps/dev-rxdb-vue/vitest.config.ts`）
- [ ] T063 [US5] Supabase demo e2e：在 `apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts` 加场景——上下文 A 新建待办并推送；上下文 B 拉取；
      A 删除并推送；B 勾选完成（走 `p_updates`）并推送 → B 的面板出现一条 `gone`（`RX001`）被拒。用 `gone` 而非 `denied` 的原因：参考 `todos`
      表关闭 RLS、demo 无登录（spec US5 已登记为批准的偏离）
- [ ] T064 [P] [US5] React / Vue e2e：新建 `apps/dev-rxdb-react-e2e/src/sync-rejections.a11y.spec.ts` 与 `apps/dev-rxdb-vue-e2e/src/sync-rejections.a11y.spec.ts`，
      照 `working-tree.a11y.spec.ts` 的写法：打开待办页，被拒面板空态可见，a11y 扫描无新增违规

### Implementation

- [ ] T065 [US5] 在 `packages/rxdb/src/sync-state.ts` 按 [sync-rejections-api §1](contracts/sync-rejections-api.md) 定义并导出 `SyncRejectionReport`、
      `SyncRejection`（TSDoc 照契约），`SyncState` 加只读 `lastRejections`，`INITIAL_STATE.lastRejections` 为冻结空数组，`sameState` 按引用比较
      （照 `lastConflict` 的写法）；`SyncStateHub.reportRejections(rejections)`：空数组不改状态，非空整体替换。T058 转绿
- [ ] T066 [US5] 推送仓库在本地提交成功后、本轮被拒非空时调用 `reportRejections`（data-model §7 步骤 4）。T060 转绿
- [ ] T067 [US5] 三框架绑定：`packages/rxdb-angular` 的 `useSyncState()` 加 `lastRejections: Signal<readonly SyncRejection[]>`（`computed`）；
      `packages/rxdb-vue` 加 `lastRejections: ComputedRef<readonly SyncRejection[]>`；`packages/rxdb-react` 透传，在 `useSyncState` 的 TSDoc 里提及
      `lastRejections`。不新增函数。T059 转绿
- [ ] T068 [US5] Demo 面板：Angular 新建 `apps/dev-rxdb-supabase/src/app/sync-rejections-panel.ts`，挂到 `todo/todo.page.html`；React 新建
      `apps/dev-rxdb-react/src/app/components/SyncRejectionsPanel.tsx`，挂到 `apps/dev-rxdb-react/src/app/pages/todo.tsx`；Vue 新建
      `apps/dev-rxdb-vue/src/app/components/SyncRejectionsPanel.vue`，挂到 `apps/dev-rxdb-vue/src/pages/TodoPage.vue`。三端字段与文案一致。
      T061～T064 转绿（`pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`、`pnpm nx run dev-rxdb-react-e2e:e2e`、`pnpm nx run dev-rxdb-vue-e2e:e2e`）
- [ ] T069 [P] [US5] 核对 demo 范围与已批准偏离一致：`spec.md` US5「批准的偏离」、`contracts/sync-rejections-api.md` §4、`quickstart.md` B4、
      `research.md` D16、`plan.md`「偏离与澄清」3 与 T061～T068 的实际实现相符；不符则修实现，不改批准内容
- [ ] T070 [P] [US5] `website/docs/plugins/rxdb-plugin-sync/README.md` 的同步状态部分加 `lastRejections`（语义：不被后续成功清空、下一轮有被拒整体替换），
      附跨重启查询示例：查询 `RxDBChange` 中 `rejectedAt` 不为空的行

**Checkpoint**: 三框架 API 对称（SC-007）

---

## Phase 9: PR-B 收尾

- [ ] T071 版本组合（FR-022，quickstart B5）：`receipts-legacy` 已覆盖「旧客户端 + 新 SQL」；另加载 US-220 版参考 SQL（`git show main:docker/sql/04-rxdb-utils-functions.sql`）
      后跑 `pnpm nx test rxdb-adapter-supabase -- push-receipts`，确认得到含 `PGRST202` 的 `SupabaseDataError`、本地变更仍待推；记录后重载新版 SQL
- [ ] T072 [P] API 基线：`pnpm audit:api-surface`，确认差异只有契约列出的新增 / 删除导出，然后 `pnpm audit:api-surface:update`；涉及
      `requirements/api-baseline/{rxdb,rxdb-plugin-sync,rxdb-adapter-supabase,rxdb-angular,rxdb-vue}.json`
- [ ] T073 [P] 迁移文档 `website/docs/migration/supabase-push-receipts.md`：`changeIdMapping` → `results` 的改法、`PushRepositoryResult.rejected`、
      系统模式 7、先升级 SQL 再升级客户端（research D17）；在 `website/docs/migration/README.md` 与 `website/sidebars.ts` 登记（FR-020）
- [ ] T074 [P] 核对 T018 的 `requirements/release-plan.md` 标注仍成立（A+B 同版本、`kind=migration`、须先有 `kind=bridge`）；`pnpm check-migration-release-gate`
      通过（门禁脚本不需要改）
- [ ] T075 PR-B 门禁：`pnpm nx run-many -t lint test build typecheck --projects=tag:js-lib`、`pnpm audit:callsite-drift`、`pnpm audit:suite-callsites`、
      `pnpm check-migration-release-gate`、`pnpm audit:api-surface`；改动包覆盖率 `rxdb` 与三框架绑定 ≥ 90%、其余 ≥ 80%（`pnpm nx test <project> --coverage`，口径同 `scripts/audit/coverage-check.mjs`）；`bash 回归脚本` 28 条全部
      `🟢 PASS`，输出贴进 PR-B 描述
- [ ] T090 [P] 推送路径基准（宪法 IV「`benchmarks/` 覆盖关键路径」）：新建 `benchmarks/push-receipts.bench.ts`，照 `non-encrypted-hot-path.bench.ts` 的写法
      （PGlite memory + `bench-stats.ts`），远端用返回逐条 `results` 的替身：基线批（100 条全部 applied）与含被拒批（100 条中 10 条 rejected，
      触发本地对齐）各测 `pushRepository` 本地提交耗时；在 `benchmarks/project.json` 加 `bench-push-receipts` target，README「Node 端回归 benchmark」登记。
      编号为追加（不重排既有编号），执行顺序在 T075 之前
- [ ] T076 更新 US-218 故事文件验收表 AC#8～16 与「实现文件」，同步 `requirements/status-overview.md`；PR-B 描述汇总 T048 耗时、T071 版本组合、T075 门禁输出、T090 基准结果

**Checkpoint（PR-B 可合入，A+B 可发版）**

---

# PR-C：阶段 C（AC#17～19）

## Phase 10: User Story 6 — 生产部署下客户端不能直写日志表，分支同步不受影响（P2）

**Goal**: 日志写入收口到 `rxdb_mutations` → `rxdb_insert_changes` 与 DEFINER 触发器；生产权限脚本回收客户端角色对 `rxdb_change` 的写权限（[rxdb-change-permissions](contracts/rxdb-change-permissions.md)）

**Independent Test**: `production-change-grants` PASS；执行生产脚本后 `branch-contracts` 全绿；文档评审通过

### Tests（先红）

- [ ] T077 [US6] 回归脚本：`psql` 调用加 `-v production_grants_sql="$(cat docker/sql/production/rxdb-change-grants.sql)"`
- [ ] T078 [US6] 在回归 SQL 新增用例 `production-change-grants`（AC#17、18，[rxdb-change-permissions §5](contracts/rxdb-change-permissions.md)），放在文件末尾
      `ROLLBACK` 之前：用 `\if :{?production_grants_sql}` 门控，变量缺失时显式失败（`\echo` 后 `\quit 3`）；通过 `SELECT … AS run_prod \gset` 判定本次
      `test_case` 是否包含该用例，包含时执行 `:production_grants_sql`；然后 `SET LOCAL ROLE authenticated`（夹具对 `authenticated` 补授权）依次断言：
      ① 直接 `INSERT INTO public.rxdb_change` → 42501；② 直调 `public.rxdb_insert_changes` → 42501，消息为 `rxdb: rxdb_insert_changes may only be called by rxdb_mutations`；
      ③ 推一条非 main 分支日志 → 成功，日志 +1；④ 推一条 main 新建（显式日志）→ 成功，日志 +1；⑤ `p_skip_sync = false` 新建 → 触发器写日志 +1；
      ⑥ `SELECT` 日志表成功。另断言 `rxdb_log_change_trigger` 与 `rxdb_insert_changes` 的 `prosecdef = true`、`rxdb_insert_changes` 的 `proconfig`
      含 `search_path=pg_catalog, pg_temp`。单跑确认红

### Implementation

- [ ] T079 [US6] 同步函数 SQL：`rxdb_log_change_trigger()` 加 `SECURITY DEFINER`，其余不变
- [ ] T080 [US6] 参考 SQL：新增 `public.rxdb_insert_changes(jsonb)`——`SECURITY DEFINER`、`SET search_path = pg_catalog, pg_temp`；入口守卫
      `current_setting('rxdb.insert_changes', true) IS DISTINCT FROM 'on'` → 42501（消息见 T078 ②），随即把守卫置 `''` 消费；
      `INSERT … ON CONFLICT ("clientId", "localId") DO NOTHING`，返回 `{localId, remoteId}` 映射与新写条数；`GRANT EXECUTE … TO anon, authenticated`。
      `rxdb_mutations` 写日志段改调它，调用前 `set_config('rxdb.insert_changes', 'on', true)`、调用后置 `''`（contract §2）
- [ ] T081 [US6] 新建 `docker/sql/production/rxdb-change-grants.sql`，内容照 contract §3（`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change FROM anon, authenticated;`
      `REVOKE USAGE, UPDATE ON SEQUENCE public.rxdb_change_id_seq FROM anon, authenticated;`，保留 `SELECT`），可重复执行；`docker/init-db.sh` 不加载它
- [ ] T082 [US6] 重载同步函数 SQL 与参考 SQL；单跑 `production-change-grants` 转绿；`bash 回归脚本` 29 条全部 `🟢 PASS`（`rls-write-boundary` 若检查
      「写 RPC 必须是 INVOKER」，确认 `rxdb_insert_changes` 不在其列表内或按 DEFINER 例外处理）
- [ ] T083 [US6] AC#18 真实链路：对容器执行生产脚本（`docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < docker/sql/production/rxdb-change-grants.sql`），
      跑 `pnpm nx test rxdb-adapter-supabase -- branch-contracts` 全绿，结果贴进 PR-C 描述；跑完重建容器恢复开发默认（测试清理依赖 `anon` 删日志）
- [ ] T084 [P] [US6] `website/docs/adapters/supabase.md` 新增「生产部署」节（AC#19，contract §6）：执行生产权限脚本的步骤；业务表 RLS 推荐策略；
      已知限制——非 main 分支日志仍可写、`rxdb_branch` 未收紧、存在性探针的剩余探测面（id 不应承载敏感信息）、测试环境 `service_role` 清理为后续项

### PR-C 收尾

- [ ] T085 PR-C 门禁：`pnpm nx run-many -t lint test --projects=rxdb-adapter-supabase`；SQL 回归 29 条输出贴进 PR-C 描述
- [ ] T086 [P] 文档评审：按 quickstart C3 逐项核对 T084
- [ ] T087 更新 US-218 故事文件验收表 AC#17～19，同步 `requirements/status-overview.md`

**Checkpoint（PR-C 可合入）**: 三阶段全部完成

---

## Phase 11: Polish & Cross-Cutting

- [ ] T088 [P] 在 `requirements/roadmap.md`「零散收尾项」登记 research D20 的后续项：23505 / 23502 / 23514 是否归类为被拒；撤销 / 重做与被拒变更的交互；
      `ON DELETE CASCADE` 级联删除不写日志；测试清理改用 `service_role`（之后开发默认也可收紧日志表权限）
- [ ] T089 PR-C 合入后把 US-218 故事状态改为完成，`requirements/status-overview.md` 同步；若 006 T033 登记的「SQL 安全回归接入 nx target / CI」仍未做，在该条目下补充用例数已到 29

---

## Dependencies & Execution Order

### Phase Dependencies

- **前置**: US-220 PR 已合入（006 全部任务完成）
- **PR-A**
  - Setup（T001～T004）：T001 先行；T002 依赖 T001；T003、T004 可与 T001 并行
  - US1（T005～T010）：测试依赖 T002；实现 T009 在全部 US1 测试红之后
  - US2（T011～T013）：T011 可与 US1 测试同时写（同一文件，注意合并分发区与 `CASES`）；T012 依赖 T009（同一函数，顺序编辑）
  - US7（T014～T019）：T015 依赖 T010、T013；T016、T018 可随时并行
- **PR-B**（PR-A 合入后开始）
  - Foundational-B（T020～T033）：阻塞 US3～US5 的实现
  - US3（T034～T048）：测试可在 Foundational-B 期间先写；T043 依赖 T034～T037 已红；T045 依赖 T029、T043；T046 依赖 T028
  - US4（T049～T056）：依赖 US3 的 T043、T045、T046
  - US5（T057～T070）：核心与绑定（T057～T059、T065、T067）只依赖 Foundational-B，可与 US3 并行；T060、T066 依赖 T046；
    demo e2e（T063）依赖 T045、T068 与 RX001 归类（T043）
  - PR-B 收尾（T071～T076、T090）：依赖 US3～US5 全部完成
- **PR-C**（PR-B 合入后开始）：T077～T078 先红；T079～T081 实现；T082～T087 验证与收尾
- **Polish**：T088 可在 PR-A 期间完成；T089 在 PR-C 合入后

### 先红的推荐顺序

- PR-A：T001、T003、T004 → T002 → T005～T008、T011（红，记录原因）→ T009 → T010 → T012 → T013 → T014～T019
- PR-B：T020～T022（红）→ T023～T033 → T034～T042、T049～T052、T057～T064（红）→ T043～T048 → T053～T056 → T065～T070 → T071～T074、T090 → T075～T076
- PR-C：T077、T078（红）→ T079～T082 → T083～T087

### Within Each User Story

- 测试先写并确认红，再实现；护栏用例在 PR 描述注明「今天即绿」
- 参考 SQL 的任务（T009、T012、T043、T053、T080）同一文件，顺序执行
- 回归 SQL 的任务（T005～T008、T011、T014、T034～T037、T049、T078）同一文件，并行编写时注意合并分发区与 `CASES`
- 推送仓库的任务（T028、T046、T055、T066）同一文件，顺序执行

## Parallel Example

```text
# PR-A Setup（三个不同文件）
T003 compact-changes.spec.ts
T004 review-regressions.spec.ts
T018 release-plan.md

# PR-B Foundational-B 测试（不同包）
T020 rxdb / sqlite-core / pglite 迁移 spec
T021 supabase errors / transient-write-retry spec
T022 push-repository.spec.ts

# PR-B 夹具迁移（不同包）
T030 rxdb-plugin-sync    T031 rxdb-adapter-sqlite-wasm    T032 rxdb-adapter-supabase

# PR-B US5 与 US3 并行的两条线
核心线：T057 → T058 → T065 → T059 → T067
demo 线：T061、T062（组件 spec）→ T068
```

## Implementation Strategy

### MVP（PR-A 的 US1 + US2）

PR-A 交付后幽灵 DELETE 消失、不配对的调用被拒（SC-001～SC-003）。但阶段 A 单独发布会让没有逐实体回执的客户端被被拒删除永久卡住，
所以 **PR-A 合入不发版**，A 与 B 同一版本发布（T018、research D4）。

### 增量顺序

1. PR-A：Setup → US1（零行判定）→ US2（配对校验）→ US7（20 条回归全绿）→ 合入
2. PR-B：Foundational-B（契约与迁移）→ US3（部分成功）→ US4（对齐与依赖）→ US5（三框架）→ 收尾 → 合入 → 发版（A+B，`kind=migration`）
3. PR-C：US6（日志写入收口 + 生产权限脚本 + 文档）→ 合入

## Notes

- 每个 PR 只含一个阶段；不在 PR 内手写 CHANGELOG；不改 `requirements/migration-release.json`（发布流程负责）
- 不改 `RxDBAdapterSupabase.mutations()` 的推送语义（不传 `p_receipts`，保持全有或全无）
- 不改 `undo-redo-apply.ts` 的查询口径
- 开发环境默认权限保持宽松；生产权限脚本只在 T078 的事务内与 T083 的临时环境里生效
- 上游：[006 tasks](../006-us220-update-push-semantics/tasks.md)
