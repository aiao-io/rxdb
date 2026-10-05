# Tasks: US-220 — Supabase 推送 UPDATE 的落库语义

**Input**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)（D1–D9）、[data-model.md](data-model.md)、
[contracts/](contracts/)（F1 [rxdb-mutations](contracts/rxdb-mutations.md)、F2 [sqlstate-registry](contracts/sqlstate-registry.md)、
F3 [existence-probe](contracts/existence-probe.md)，均已冻结）、[quickstart.md](quickstart.md)

**Tests**: 必需。TDD：每个用例先写、先跑红，红的原因记进 PR 描述，再写实现。

**交付**: 一个 PR，先于 US-218 任何阶段合入（roadmap 约束 16）。PR 描述贴 SQL 回归实跑输出（T028）。

> **2026-10-05**：原 PR #89 应 owner 要求与 US-218 阶段 A～C 合并为 [#99](https://github.com/aiao-io/rxdb/pull/99) 一起评审，提交仍独立在前；一次合入，约束 16 的先后自然满足。

**Organization**: 按 spec 的用户故事分阶段。US1～US3 的 SQL 用例都在同一个回归文件里，先红的时点见「Dependencies」。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成的任务）
- **[Story]**: 所属用户故事（US1～US4）

## 路径约定

| 简称     | 路径                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 参考 SQL | `docker/sql/04-rxdb-utils-functions.sql`                                                                       |
| 回归 SQL | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`                           |
| 回归脚本 | `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh`                        |
| 重载 SQL | `docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < 参考 SQL`                        |
| 单跑用例 | `docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v test_case=<用例> < 回归 SQL` |

新增 SQL 用例的固定写法（每条都照此登记，下文不再重复）：

1. 在回归 SQL 中新增 `CREATE FUNCTION rxdb_sql_regression.test_<snake_name>() RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp`；
2. 在文件末尾分发区追加 `SELECT rxdb_sql_regression.test_<snake_name>() WHERE :'test_case' IN ('all', '<kebab-name>');`
   （需以 `anon` 执行的放在 `SET LOCAL ROLE anon;` 与 `RESET ROLE;` 之间）；
3. 在回归脚本的 `CASES=( … )` 末尾追加 `<kebab-name>`。

用例需要的夹具表建在回归 SQL 顶部既有夹具区（`rxdb_sql_regression` schema），`GRANT … TO anon` 已按 schema 批量授予；
调用方身份沿用 `pg_catalog.set_config('rxdb_sql_regression.uid', '<uid>', true)` + 策略里读 `current_setting('rxdb_sql_regression.uid', true)`。
探针只接受挂了 `rxdb_sync_trigger` 的表，凡是会走到探针的夹具表都要在夹具区调用
`public.rxdb_enable_sync_for_table('<table>', 'rxdb_sql_regression', '<Entity>')`。

---

## Phase 1: Setup

**Purpose**: 拿到基线，补齐开工前的范围登记

- [x] T001 启动 CI Supabase 环境 `pnpm nx run rxdb-adapter-supabase:test-env`，执行 `bash 回归脚本`，记录既有 10 个用例的基线结果（含 `rls-filtered-delete` 当前状态，它属于 US-218，本故事不改其断言与状态），贴进 PR 描述草稿
- [x] T002 [P] 在 `requirements/stories/adapter/US-220-supabase-update-push-semantics.md`「范围边界 → Out of Scope」补一条：`RxDBAdapterSupabase.mutations()`（仓库 `save()` 直写，`options.update` 整实体进 `p_upserts`）不改，**推断**在 owner 型与共享编辑型 RLS 上同样命中症状 2、3；并在 `requirements/roadmap.md`「零散收尾项」登记待评估项「`mutations()` 直写路径的 UPDATE 语义」（plan「偏离与澄清」2、research D6）

---

## Phase 2: Foundational（阻塞 US1～US3）

**Purpose**: 内部 helper `rxdb_id_array_type` 与存在性原语 `rxdb_existing_ids`（F3）。US3 的零行判定与 US-218 阶段 A 都依赖它。

**⚠️ CRITICAL**: 本阶段完成前不开始任何故事的实现任务（测试任务可先写，见 Dependencies）。

### Tests（先红）

- [x] T003 在回归 SQL 新增用例 `existence-probe`（函数 `test_existence_probe`，以 `anon` 执行），夹具：一张挂同步触发器、开 RLS（不 `FORCE`）且 SELECT 策略对 `anon` 不放行的表，一张 `uuid` 主键的同步表，一张不挂同步触发器的普通表。断言（[existence-probe §2、§3](contracts/existence-probe.md)）：
      ① 对调用方隐藏的行 → 在返回里；② 不存在的 id → 不在返回里；③ 空数组 → `'{}'`；④ `uuid` 表传大写 id → 返回传入的原样元素；
      ⑤ 非同步表 → `invalid_parameter_value`（22023），消息含 `schema.table`；⑥ 非法 uuid 文本 → 类型转换错误；
      ⑦ `pg_proc.prosecdef = true`、`provolatile = 's'`，`proconfig` 含 `search_path=pg_catalog, pg_temp` 与 `row_security=off`；
      ⑧ 在挂同名触发器 `rxdb_sync_trigger` 但 `tgfoid` 不是 `public.rxdb_log_change_trigger` 的表上 → 22023。
      按「固定写法」登记。跑单个用例确认红（函数不存在）
- [x] T004 在 `test_existence_probe` 末尾加一个子断言：对 `FORCE ROW LEVEL SECURITY` 的同步表调用探针，记录结果——要么正确返回（`postgres` 有 `BYPASSRLS`），要么抛「query would be affected by row-level security policy」；两者都不得返回错误结论。实跑结果写回本文件 T004 下方的「验证记录」，用以确认或推翻 plan「偏离与澄清」4 的**推断**

  验证记录（2026-10-05，本地 `supabase-db` 容器）：对开了 `FORCE ROW LEVEL SECURITY` 的同步表调用探针，正确返回 `{probe-forced-1}`，未报错。
  函数属主 `postgres` 带 `BYPASSRLS`，它压过 `FORCE`；plan「偏离与澄清」4 的**推断**在参考部署上成立。属主无 `BYPASSRLS` 的自建部署仍按
  [existence-probe](contracts/existence-probe.md) 的错误表走「query would be affected by row-level security policy」分支，不返回错误结论

### Implementation

- [x] T005 在参考 SQL 新增内部 helper `public.rxdb_id_array_type(p_table text, p_schema text) RETURNS pg_catalog.regtype`（`LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp`），把 `rxdb_batch_delete` 中「从 `pg_attribute` 取 `id` 列类型及其数组类型」的逻辑原样搬入，保留两条错误 `Missing id column` 与 `Unsupported id type without array regtype`；`rxdb_batch_delete` 改调 helper；文件末尾 GRANT 区加 `GRANT EXECUTE ON FUNCTION public.rxdb_id_array_type(text, text) TO anon, authenticated;`（[existence-probe §4](contracts/existence-probe.md)）
- [x] T006 重载 SQL，单跑 `uuid`、`text-varchar`、`entity-id`、`rls-filtered-delete`，结果与 T001 基线一致（helper 抽取不改行为）
- [x] T007 在参考 SQL 新增 `public.rxdb_existing_ids(p_table text, p_schema text, p_ids text[]) RETURNS text[]`（`LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off`）：表名校验与 `rxdb_batch_delete` 同一条 `^[a-zA-Z_][a-zA-Z0-9_]*$`；表不存在 / `relkind` 不是 `r`、`p` / `pg_trigger` 中无 `tgname = 'rxdb_sync_trigger' AND tgfoid = 'public.rxdb_log_change_trigger'::regproc` → `RAISE … USING ERRCODE = 'invalid_parameter_value'`，消息含 `schema.table`；比较按 [existence-probe §3](contracts/existence-probe.md)（`unnest($1, $1::<数组类型>)`、返回原样元素、`COALESCE(result, '{}')`）；GRANT 区加 `GRANT EXECUTE ON FUNCTION public.rxdb_existing_ids(text, text, text[]) TO anon, authenticated;`
- [x] T008 重载 SQL，单跑 `existence-probe` 转绿；填写 T004 验证记录

**Checkpoint**: 探针可用；既有用例结果与基线一致。

---

## Phase 3: User Story 1 — 只改部分列的修改能推上去（P1）🎯 MVP

**Goal**: 修改走 `p_updates` → `rxdb_batch_update` 普通 UPDATE，只改出现的列（AC#1、AC#6、AC#7）。

**Independent Test**: quickstart §1 `update-partial-columns`、§2 载荷单测、§3 双客户端 spec、§4 e2e。

### Tests（先红）

- [x] T009 [P] [US1] 在回归 SQL 新增用例 `update-partial-columns`（`test_update_partial_columns`，以 `anon` 执行）：在 `public.todos` 预置一行（`title` 等 NOT NULL 列有值），以 `p_skip_sync = false`（触发器写日志）调用 `public.rxdb_mutations(p_updates => '[{"table":"todos","data":[{"id":…,"completed":true,"updatedBy":…}]}]')`，断言：`completed` 已变；`title` 及其他未下发列与调用前逐列相同；`rxdb_change` 新增恰好 1 条该 id 的 `UPDATE`；返回值 `updated = 1`；另含子断言「可空列显式 `null` → 该列被置 NULL」「只有 `id` 的行 → 成功、行值不变、日志新增 1 条 UPDATE」（[rxdb-mutations §2](contracts/rxdb-mutations.md)）。按「固定写法」登记，确认红（实现前报 `rxdb_mutations` 不接受 `p_updates`）
- [x] T010 [P] [US1] 改写 `packages/rxdb-adapter-supabase/src/__tests__/review-regressions.spec.ts` 中 `mergeChanges decodes typed action keys before sending entity IDs to Supabase` 的载荷断言（改写不删除，FR-013）：新建只在 `p_upserts`、修改只在 `p_updates`；修改行为 `{ id, ...patch, updatedBy }`，不含 `createdBy`；新增用例：非 main 分支时 `p_upserts` / `p_updates` / `p_deletes` 均为 `[]`；`mergeChanges()` 的 `rpc('rxdb_mutations', …)` 参数含 `p_updates` 且 `p_skip_sync: true`；`mutations()` 的 RPC 参数**不含** `p_updates`。`pnpm nx test rxdb-adapter-supabase -- review-regressions` 确认红
- [x] T011 [P] [US1] 新建 `packages/rxdb-adapter-supabase/src/__tests__/update-push-semantics.spec.ts`（AC#6）：门控与夹具沿用 `sync-data-integrity.spec.ts`（`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 缺失则 skip）；客户端 A 新建 todo 并推送 → 客户端 B 拉取、只改 `completed` 并经常规推送路径（`mergeChanges`）推送 → A 拉取：`completed` 为新值、`title` 不变、B 的水位线已推进；用 `performance.now()` 记录 B 那一批推送耗时并 `console.info` 输出，同时断言 `< 100`（SC-006，宪法 IV 数据库操作预算）。确认红（23502）
- [x] T012 [P] [US1] 在 `apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts` 的 `Supabase remote sync` 下新增用例（AC#7）：新建待办 → 推送 → 勾选完成 → 推送 → 另开浏览器上下文拉取后显示已完成；拦截 `rxdb_mutations` 请求，断言勾选那次的实体出现在请求体 `p_updates` 而非 `p_upserts`。`pnpm nx run dev-rxdb-supabase-e2e:e2e-remote` 确认红

### Implementation

- [x] T013 [US1] 在参考 SQL 新增 `public.rxdb_batch_update(p_table text, p_schema text DEFAULT 'public', p_data jsonb DEFAULT '[]'::jsonb) RETURNS int`（`LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp`）：表名校验同 `rxdb_batch_upsert`；逐行执行 [rxdb-mutations §4](contracts/rxdb-mutations.md) 的 `UPDATE … SET <k> = (pg_catalog.jsonb_populate_record(null::<schema>.<table>, $1)).<k>, … WHERE t.id = (…).id`，只 `SET` 该行出现的非 `id` 键（`%I` 引用），只有 `id` 时 `SET id = t.id`；不带 `RETURNING`；累加 `ROW_COUNT` 并返回。零行分支留到 US3（T025）实现，本任务先不处理零行。GRANT 区加 `GRANT EXECUTE ON FUNCTION public.rxdb_batch_update(text, text, jsonb) TO anon, authenticated;`
- [x] T014 [US1] 在参考 SQL 改 `public.rxdb_mutations`（[rxdb-mutations §1、§3、§5](contracts/rxdb-mutations.md)）：在既有两条 DROP 后追加 `DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean);`；签名追加第 5 个参数 `p_updates jsonb DEFAULT '[]'::jsonb`；`apply_entity_operations` 分支内按 `p_upserts` → `p_updates`（逐组调 `rxdb_batch_update`，`schema` 缺省 `public`）→ `p_deletes` 执行；返回对象新增 `"updated"`（跳过实体操作时为 0）；GRANT 行改为 `public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb)`
- [x] T015 [US1] 在回归 SQL 的 `test_rls_write_boundary` 中，把 `to_regprocedure('public.rxdb_mutations(jsonb,jsonb,jsonb,boolean)')` 改为 5 参签名，并把 `public.rxdb_batch_update(text,text,jsonb)` 加进「写 RPC 必须是 INVOKER」的检查列表；另加断言这几个 `to_regprocedure` 都不为 NULL（防止签名改了检查静默失效）
- [x] T016 [US1] 重载 SQL，单跑 `update-partial-columns`、`rls-write-boundary`、`idempotent-retry` 转绿 / 保持绿
- [x] T017 [US1] 在 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts` 新增 `MergeChangesUpdatePayload { table; schema; data: Record<string, unknown>[] }`（带 TSDoc：「与 MergeChangesUpsertPayload 同形；data 每行只含 id + 本次修改的列 + updatedBy」），`MergeChangesPayload` 增加 `p_updates: MergeChangesUpdatePayload[]`；`build_merge_changes_payload()` 把 `actions.inserts` 放进 `p_upserts`、`actions.updates` 放进 `p_updates`（按表分组，行 `{ id, ...patch }`，有 `userId` 时加 `updatedBy`，不加 `createdBy`），非 main 分支三个写数组都为 `[]`；更新函数 TSDoc
- [x] T018 [US1] 在 `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts` 的 `mergeChanges()` 中 `rpc('rxdb_mutations', …)` 增加 `p_updates: payload.p_updates`；`mutations()` 不改。T010 转绿
- [x] T019 [US1] 跑 T011（`pnpm nx test rxdb-adapter-supabase -- update-push-semantics`）与 T012（`pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`）转绿；把 T011 输出的单批耗时记进 PR 描述（SC-006）

**Checkpoint**: 参考 schema 上勾选 todo 的推送成功，双客户端与 e2e 通过。

---

## Phase 4: User Story 2 — 启用行级权限的表上，有权修改的行都能改（P1）

**Goal**: owner 型与共享编辑型 RLS 上，有权修改的行推送成功，INSERT 策略不参与 UPDATE 判定（AC#2、AC#3）。

**Independent Test**: quickstart §1 `update-owner-rls`、`update-shared-edit`。

### Tests（先红，须在 T013 之前跑红，见 Dependencies）

- [x] T020 [P] [US2] 在回归 SQL 新增夹具表 `rls_update_owner(id text PK, owner text NOT NULL, value text NOT NULL)`，开 RLS（不 `FORCE`），策略 `FOR ALL USING (owner = current_setting('rxdb_sql_regression.uid', true)) WITH CHECK (同上)`，挂同步触发器；新增用例 `update-owner-rls`（`test_update_owner_rls`，以 `anon` 执行）：uid 设为行主人，推送不含 `owner` 的 `p_updates`，断言成功、`value` 已变、`owner` 不变、日志新增 1 条 UPDATE。按「固定写法」登记；在 T013 之前跑，确认红为 42501（今日经 `p_upserts` 的症状 2）或签名不存在
- [x] T021 [P] [US2] 在回归 SQL 新增夹具表 `rls_update_shared(id text PK, owner text NOT NULL, value text NOT NULL)`，开 RLS（不 `FORCE`），策略 SELECT `USING (true)`、INSERT `WITH CHECK (owner = uid)`、UPDATE `USING (true) WITH CHECK (true)`，挂同步触发器，预置一行属于他人；新增用例 `update-shared-edit`（`test_update_shared_edit`）：以另一 uid 推送不含 `owner` 的 `p_updates`，断言成功、`owner` 不变、日志新增 1 条 UPDATE。按「固定写法」登记，确认红

### Implementation

- [x] T022 [US2] 无新增实现（`rxdb_batch_update` 为 INVOKER 普通 UPDATE，已在 T013 交付）。重载 SQL，单跑 `update-owner-rls`、`update-shared-edit` 转绿；若不绿，修 T013 而不是改用例

**Checkpoint**: 两种 RLS 形态上的误拒为 0（SC-002）。

---

## Phase 5: User Story 3 — 改不了的修改被明确报错（P2）

**Goal**: UPDATE 零行时调探针：存在 → 42501，不存在 → `RX001`，`DETAIL` 为 JSON；不写日志、不插入（AC#4、AC#5）。

**Independent Test**: quickstart §1 `update-denied`、`update-gone`。

### Tests（先红）

- [x] T023 [P] [US3] 在回归 SQL 新增用例 `update-denied`（`test_update_denied`，以 `anon` 执行），两个子场景各一张挂同步触发器、开 RLS（不 `FORCE`）的夹具表：
      ① SELECT `USING (true)`、UPDATE `USING (owner = uid)`，改他人的行；② SELECT `USING (owner = uid)`、UPDATE `USING (true)`，改他人的行。
      每个子场景用 `BEGIN … EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS … PG_EXCEPTION_DETAIL, MESSAGE_TEXT` 捕获，断言：SQLSTATE 为 42501；`MESSAGE_TEXT` 以 `rxdb: UPDATE denied by row-level security:` 开头；`DETAIL::jsonb` 恰含键 `op`/`schema`/`table`/`entityId`/`reason`，且 `op = 'UPDATE'`、`reason = 'denied'`；行未变；无新日志；可选子场景③ UPDATE `WITH CHECK (false)` → 42501（`DETAIL` 非 JSON，只断言 SQLSTATE）。
      按「固定写法」登记，确认红（实现前零行静默成功）
- [x] T024 [P] [US3] 在回归 SQL 新增用例 `update-gone`（`test_update_gone`，以 `anon` 执行），两个子场景：① `public.todos`（有 NOT NULL 列）；② 一张挂同步触发器、除 `id` 外全部可空的夹具表。对不存在的 id 推送 `p_updates`，捕获 `SQLSTATE 'RX001'`，断言：`MESSAGE_TEXT` 以 `rxdb: UPDATE target row is gone:` 开头；`DETAIL::jsonb` 的 `op = 'UPDATE'`、`reason = 'gone'`、`entityId` 为传入 id；表中无该 id 的行；无新日志；另加子断言「同批一条 gone、一条正常 → 整批回滚，正常那条也未生效」。按「固定写法」登记，确认红

### Implementation

- [x] T025 [US3] 在参考 SQL 的 `rxdb_batch_update` 中补零行分支（[rxdb-mutations §4](contracts/rxdb-mutations.md)、[sqlstate-registry §2](contracts/sqlstate-registry.md)）：`GET DIAGNOSTICS rc = ROW_COUNT`；`rc = 0` 时调 `public.rxdb_existing_ids(p_table, p_schema, ARRAY[行->>'id'])`：含该 id → `RAISE EXCEPTION USING ERRCODE = 'insufficient_privilege', MESSAGE = pg_catalog.format('rxdb: UPDATE denied by row-level security: %I.%I id=%s', p_schema, p_table, v_id), DETAIL = jsonb_build_object('op','UPDATE','schema',p_schema,'table',p_table,'entityId',v_id,'reason','denied')::text`；不含 → 同形，`ERRCODE = 'RX001'`、消息 `'rxdb: UPDATE target row is gone: %I.%I id=%s'`、`reason = 'gone'`；成功路径不调探针
- [x] T026 [US3] 重载 SQL，单跑 `update-denied`、`update-gone` 转绿，并复跑 US1、US2 的三个用例保持绿

**Checkpoint**: 静默零行成功与复活残缺行出现 0 次（SC-003、SC-004）。

---

## Phase 6: User Story 4 — 既有安全回归持续通过（P3）

**Goal**: 16 个用例中 15 个 PASS、`rls-filtered-delete` 保持基线（红，US-218 修），PR 贴实跑输出（AC#8）。

**Independent Test**: quickstart §1 全量。

- [x] T027 [US4] 核对回归脚本 `CASES` 恰为 16 项（既有 10 = 9 条 + `rls-filtered-delete`（属于 US-218）；加 `existence-probe`、`update-partial-columns`、`update-owner-rls`、`update-shared-edit`、`update-denied`、`update-gone`），回归 SQL 分发区每个用例恰有一行
- [x] T028 [US4] 重载 SQL 后执行 `bash 回归脚本`，15 个用例 `🟢 PASS`，`rls-filtered-delete` 保持红且结果与 T001 基线一致（属 US-218 阶段 A 修复）；完整输出贴进 PR 描述

**Checkpoint**: AC#1～8 全部有实跑证据。

---

## Phase 7: Polish & Cross-Cutting

- [x] T029 [P] 更新 `packages/rxdb-adapter-supabase/README.md`：`rxdb_mutations` 参数表加 `p_updates`；UPDATE 语义（只改出现的列、只受 UPDATE / SELECT 策略约束）；错误码 42501 / `RX001` 与 `DETAIL` 形状（链 [sqlstate-registry](contracts/sqlstate-registry.md) 的口径，不复制全表）
- [x] T030 [P] 更新 `website/docs/adapters/supabase.md`：同 T029 的参数表、UPDATE 语义与错误码；「已知限制」加探针一条——在自行收紧 `rxdb_change` 读权限的部署里探针是剩余的存在性通道，id 不应承载敏感信息（UUID 主键不可枚举，自增或业务主键可被逐个探测）（[existence-probe §5](contracts/existence-probe.md)）
- [x] T031 [P] 新建 `website/docs/migration/supabase-update-push.md`：升级顺序「先执行新版 `docker/sql/04-rxdb-utils-functions.sql`，再升级客户端」；新旧组合表（[rxdb-mutations §7](contracts/rxdb-mutations.md)）；新客户端连旧 SQL 的报错特征（`SupabaseDataError`，消息含 `PGRST202` / `Could not find the function public.rxdb_mutations`），本地变更仍待推送；在 `website/docs/migration/README.md` 与 `website/sidebars.ts`（`migration/supabase-network-errors` 之后）登记
- [x] T032 版本组合抽查（quickstart §5，FR-011）：重载上一版本的参考 SQL（`git show main:docker/sql/04-rxdb-utils-functions.sql`），跑 T011，确认推送以 `SupabaseDataError` 失败、消息含 `PGRST202`、本地变更仍待推送；结果记进 PR 描述后重载新版 SQL

  结果：推送抛 `SupabaseDataError: Failed to merge changes: Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_skip_sync, p_updates, p_upserts) in the schema cache`；
  `PGRST202` 只在 HTTP 响应体的 `code` 里（curl 复核），`SupabaseDataError` 的消息不带码，迁移文档按消息识别；水位线未推进，本地变更仍待推送。新版 SQL 已重载

- [x] T033 [P] 在 `requirements/roadmap.md`「零散收尾项」登记待评估项「SQL 安全回归接入 nx target / CI」（quickstart 末注）
- [x] T034 门禁：`pnpm nx run-many -t lint test build --projects=rxdb-adapter-supabase` 与 `pnpm nx run rxdb-adapter-supabase:typecheck` 零警告通过；`pnpm nx test rxdb-adapter-supabase --coverage` 不低于 80%
- [x] T035 更新 `requirements/stories/adapter/US-220-supabase-update-push-semantics.md` 验收表 AC#1～8 状态与「实现文件」，同步 `requirements/status-overview.md`；PR 描述汇总 T001 基线、T004 验证记录、T019 耗时、T028 回归输出、T032 版本组合结果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（T001～T002）**: 无依赖
- **Foundational（T003～T008）**: 依赖 T001；阻塞 US3 的实现（T025 调探针），也阻塞 US1 的实现（同文件顺序编辑，避免冲突）
- **US1（T009～T019）**: 实现依赖 Foundational
- **US2（T020～T022）**: 测试须在 T013 之前跑红（T013 之后普通 UPDATE 已就位，用例不会再红）；T022 依赖 T014
- **US3（T023～T026）**: 测试须在 T025 之前跑红；T025 依赖 T007、T013
- **US4（T027～T028）**: 依赖 US1～US3 全部完成
- **Polish（T029～T035）**: T029～T031、T033 可与 US 阶段并行；T032、T034、T035 依赖 US4

### 先红的推荐顺序

T001 → T003、T004（红）→ T009、T010、T011、T012、T020、T021、T023、T024（全部红，记录原因）→ T005～T008 → T013～T019 → T022 → T025～T026 → T027～T028

### Within Each User Story

- 测试先写并确认红，再实现
- 参考 SQL 的任务（T005、T007、T013、T014、T025）同一文件，顺序执行
- 回归 SQL 的任务（T003、T009、T015、T020、T021、T023、T024）同一文件，并行编写时注意合并分发区与 `CASES`

## Parallel Example

```text
# US1 测试（四个不同文件）
T009 回归 SQL 新增 update-partial-columns
T010 review-regressions.spec.ts 载荷断言
T011 update-push-semantics.spec.ts
T012 apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts

# US1 实现中可并行的两条线
SQL 线：T013 → T014 → T015 → T016
客户端线：T017 → T018
```

## Implementation Strategy

### MVP（US1）

Setup → Foundational → US1：勾选 todo 的推送即可成功（SC-001）。但 US1 单独不能合入：零行分支（T025）缺失时
修改会静默零行成功，违反 FR-010。**本故事只作为一个整体 PR 合入**，US1 是内部第一个可验证的检查点。

### 增量顺序

1. Setup + Foundational → 探针就位
2. US1 → 部分列推送成功（检查点）
3. US2 → RLS 误拒清零（检查点）
4. US3 → 零行判定（检查点，此后满足 FR-010）
5. US4 → 全量回归；Polish → 文档、迁移、门禁 → 提 PR

## Notes

- 不改 `RxDBAdapterSupabase.mutations()`、不改公共 TS API、不改三框架绑定（FR-015、SC-007）
- 不改 `rls-filtered-delete` 的断言（US-218 阶段 A 改写）
- 不在 PR 内手写 CHANGELOG；迁移项由发布流程登记（plan Project Structure）
- 合入后才开始 US-218 阶段 A（[007 tasks](../007-us218-rls-push-integrity/tasks.md)）
