# Research: US-220 — Supabase 推送 UPDATE 的落库语义

**Date**: 2026-10-05 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

决策编号 D1–D9。D1、D3、D4 是 spec 输入里「待 plan 定」的三项。D3、D4 与 US-218 阶段 A 共用，**本文件给出的是建议冻结值，
须在 US-218 plan 里逐项核对一致后才算冻结**（roadmap 约束 16），见 [plan.md](plan.md)「跨 plan 冻结项」。

## D1 下发形状：`rxdb_mutations` 新增第 5 个参数 `p_updates`

**Decision**: `rxdb_mutations(p_upserts, p_deletes, p_changes, p_skip_sync, p_updates jsonb DEFAULT '[]')`，`p_updates` 与 `p_upserts`
同形：`[{ table, schema, data: [{ id, ...下发的列 }] }]`。`build_merge_changes_payload()` 把 `actions.updates` 放进 `p_updates`，
`p_upserts` 只剩 `actions.inserts`。参考 SQL 里显式 `DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean)`，
与文件里已有的两条旧签名 `DROP` 同一写法；`GRANT EXECUTE` 改成新签名。

**Rationale**:

- 语义分开：`p_upserts` 的每一行今天都是「整行插入、冲突则更新」，`p_updates` 的每一行是「只改出现的列」。在 `p_upserts` 里按行带
  标记会让同一个参数有两种语义，SQL 端要逐行分流，回归也要逐行断言。
- 新旧组合都不会静默丢修改（FR-011）：
  - 旧客户端 + 新 SQL：PostgREST 按参数名匹配，旧客户端不传 `p_updates` 时取默认值，行为与今天一致（含今天的缺陷，不更坏）；
  - 新客户端 + 旧 SQL：PostgREST 找不到带 `p_updates` 的函数，返回 `PGRST202`（HTTP 404），推送显式失败、水位线不推进。
  - 所以迁移文档写「先升级远端 SQL，再升级客户端」即可，不需要在 SQL 里兼容新载荷的旧形状。
- 必须 `DROP` 旧签名：`CREATE OR REPLACE` 改参数表会新建一个重载，PostgREST 遇到 4 参与 5 参两个都能匹配的调用会报
  `PGRST203`（ambiguous），旧客户端反而连不上。
- 追加在末尾而不是插在 `p_upserts` 后面：SQL 回归里的调用都是具名参数，但末尾追加对任何位置参数调用也不破坏。

**Alternatives**:

- `p_upserts` 内按表带 `mode: 'update'`：新客户端 + 旧 SQL 时旧 SQL 忽略未知键，静默退回 upsert 语义，修复看起来生效实际没生效，难排查。
- `p_upserts` 内按行带 `__op`：旧 SQL 会把 `__op` 拼进 `SET` 子句报「列不存在」，虽不静默，但把控制字段混进业务列，与 `jsonb_populate_record` 的
  「未知键忽略」相冲突。
- 单独新建 RPC（如 `rxdb_push_mutations`）：要复制 `rxdb_mutations` 的快照、幂等与日志逻辑，两份实现会漂移。

## D2 落库：新增 `rxdb_batch_update`，普通 `UPDATE`，逐行执行

**Decision**: 新增 `public.rxdb_batch_update(p_table text, p_schema text DEFAULT 'public', p_data jsonb DEFAULT '[]') RETURNS int`，
`SECURITY INVOKER`、`SET search_path = pg_catalog, pg_temp`，与 `rxdb_batch_upsert` 同样先校验表名。对 `p_data` 的每一行执行：

```sql
UPDATE %I.%I AS t
   SET <k> = (pg_catalog.jsonb_populate_record(null::%I.%I, $1)).<k>, …   -- 只列出该行出现的非 id 键
 WHERE t.id = (pg_catalog.jsonb_populate_record(null::%I.%I, $1)).id
```

行里除 `id` 外没有任何键时，`SET` 写成 `id = t.id`（不改值，但仍是一次真实的 UPDATE，触发器、权限判定与日志配对都照常）。
`GET DIAGNOSTICS … ROW_COUNT` 为 0 时交给 D3。返回成功更新的行数。`rxdb_mutations` 在 upsert 之后、delete 之前循环 `p_updates`
调用它，与 upsert / delete 同受 `apply_entity_operations`（纯重试批次跳过实体操作）约束；返回值新增 `'updated', <行数>`，
与 `'deleted'` 对称，其余键不变。

**Rationale**:

- `jsonb_populate_record` 负责把 JSON 值转成列类型，与 upsert 路径的类型转换口径一致（`text-varchar` / `uuid` 回归已覆盖的那套），
  不用自己按列类型拼 cast。
- `WHERE` 两侧类型一致，能用主键索引；快照步骤里的 `source.id::text = $1` 在列上做 cast，用不上索引，不照抄。
- 显式写入的 `null` 是「出现的键」，会被 `SET` 成 NULL；没出现的键不进 `SET`，保持原值（spec Edge Cases）。
- 不带 `RETURNING`：本路径没有调用方读返回行（`validateMergeResponse` 只读 `change_id_mapping` / `max_change_id`），去掉后 SELECT 策略对
  新行的检查不再参与；SELECT 策略对**旧行**的过滤仍在（UPDATE 的 `WHERE` 引用了列，PostgreSQL 会套 SELECT 的 `USING`），被它过滤即零行，
  由 D3 报 42501，满足 AC#4 的「SELECT 不放行」分支。
- 顺序 upsert → update → delete：与今天「UPDATE 混在 upsert 里、delete 在后」的相对顺序一致；修改可能把外键指向同批新建的行，必须在
  upsert 之后。

**Alternatives**: 一条语句批量 `UPDATE … FROM jsonb_to_recordset(...)`：同批各行的键集合不同，`SET` 无法统一，且零行判定要按行算，逐行更直接；
用当前行补齐再走 upsert：已实验否定（症状 3），见故事技术笔记。

## D3 「行已不存在」的 SQLSTATE：`RX001`（新设 `RX` 类）

**Decision**: UPDATE 零行生效时，用 D4 的原语判定目标行是否存在：

- 存在 → `RAISE EXCEPTION USING ERRCODE = 'insufficient_privilege'`（42501）；
- 不存在 → `RAISE EXCEPTION USING ERRCODE = 'RX001'`。

两者 `MESSAGE` 自带可读原因（今天 `classify_postgrest_error` 只保留 `message`，SQLSTATE 要到 US-218 阶段 B 才带到客户端），
`DETAIL` 是一段 JSON：`{"op":"UPDATE","schema":…,"table":…,"entityId":…,"reason":"denied"|"gone"}`，供 US-218 阶段 B 按实体键做回执。
`RX` 类登记在 [contracts/sqlstate-registry.md](contracts/sqlstate-registry.md)，US-218 若需要新的自定义码（如 AC#6 的配对违规）顺延 `RX002` 起。

**Rationale**:

- PostgREST 把 `P0*` 映射为 HTTP 500（`P0001` 例外，为 400），未列出的码映射为 400。选 `P0002`（`no_data_found`）会让「行已不存在」
  以 5xx 回到客户端，而 US-218 AC#13 规定 5xx 一律按可重试处理、不计 rejected，两条规则互相打架。`RX001` 落在 400，归入远端的业务回答。
- `P0002` 还是 PL/pgSQL `SELECT … INTO STRICT` 找不到行时的默认码。用户自己写的触发器抛出它时会被误认作「行已不存在」，
  而 US-218 阶段 B 对「已不存在」的处理是本地移除该实体，误判就是丢数据。自定义码不会与 PostgreSQL 或用户代码撞车。
- SQL 标准把首字符为 I–Z（及 5–9）的类留给实现自定义；PostgreSQL 自己用的是 `P0`、`XX`、`F0` 等，`RX` 不冲突。
  不用 `PT` 前缀：那是 PostgREST 直接改写 HTTP 状态的保留前缀。

**Alternatives**: `P0002`（见上）；`02000`（`no_data`，属「完成类」而非异常类，PL/pgSQL 不允许以它 `RAISE EXCEPTION`）；
`PGRST` + JSON 消息（把错误形状绑死在 PostgREST 上，直连 PostgreSQL 的调用方读不到结构）。

## D4 存在性判定原语：`SECURITY DEFINER` 探针 `rxdb_existing_ids`（与 US-218 阶段 A 共用）

**Decision**:

```text
public.rxdb_existing_ids(p_table text, p_schema text, p_ids text[]) RETURNS text[]
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  SET row_security = off
```

- 返回 `p_ids` 中在表里真实存在的那部分元素（原样返回，避免 uuid 大小写等写法差异影响调用方判断），不返回任何列值；
- 只接受「同步表」：表存在（`relkind` 为 `r` / `p`）且挂着 `rxdb_enable_sync_for_table()` 建的 `rxdb_sync_trigger`，否则
  `RAISE … USING ERRCODE = 'invalid_parameter_value'`（22023），消息写明表名；
- 按 `id` 列的真实类型转换 `p_ids` 再与 `id` 比较（能用主键索引），与 `rxdb_batch_delete` 同一种取类型的办法；同步表判定同时核对触发器函数是 `rxdb_log_change_trigger`；参数顺序与 `rxdb_batch_delete` 一致（表、schema、数据）；
  取类型的那段查询抽成内部函数 `rxdb_id_array_type(p_table, p_schema) RETURNS regtype`，`rxdb_batch_delete` 改为调用它，不留两份；
- `GRANT EXECUTE … TO anon, authenticated`：调用它的 `rxdb_batch_update` / `rxdb_batch_delete` 是 `SECURITY INVOKER`，以调用方身份执行，
  调用方必须有 `EXECUTE`。
- 只在零行生效时调用：UPDATE 成功的路径不多一次查询（SC-006）。US-218 阶段 A 对 DELETE 用同一个函数一次传入整批 id。

**Rationale**:

- 「按 main 分支最新日志判定」不满足 AC#5：从未被同步过、或在关掉同步触发器时被删掉的行没有 DELETE 日志，会被误判成「存在但被拒」；
  日志的读权限还会随 US-218 阶段 C 的生产指引收紧，判定结果随部署配置漂移。探针直接问业务表，没有这两个问题。
- `SET row_security = off` 让探针要么真正绕开 RLS，要么显式报错，不会返回被策略过滤后的「不存在」：函数属主有 `BYPASSRLS`，或是表属主
  且表没开 `FORCE ROW LEVEL SECURITY` 时，正常执行；否则 PostgreSQL 直接报「query would be affected by row-level security policy」。
  参考 SQL 的属主是 `postgres`。**推断** Supabase 的 `postgres` 角色满足上述条件之一，由 `existence-probe` 回归用例在容器里实测确认。
- 对外泄露面：只回答「这些 id 在同步表里是否存在」。参考部署里 `rxdb_change` 关着 RLS，同步表的 `beforeData` / `afterData` 整行本来就对 `anon`
  可读，探针泄露的严格少于此；同步表白名单挡住了对 `auth.users` 等非同步表的探测。US-218 阶段 C 收紧 `rxdb_change` 后，探针成为
  剩余的存在性通道，写进 `website/docs/adapters/supabase.md` 的已知限制。
- 批量签名（`text[]` 进、`text[]` 出）让 DELETE 一次判完整批，UPDATE 传单元素数组，两个故事共用一个签名。

**Alternatives**: 按日志判定（见上）；返回 `boolean` 的单 id 探针（DELETE 一批要调 N 次）；不设白名单（`anon` 能探测任意表的主键）；
用 `has_table_privilege` 限定调用方（`SECURITY DEFINER` 内拿不到调用方角色，`current_user` 已是属主）。

## D5 客户端改动面：只动内部载荷构造，公共 API 不变

**Decision**: `MergeChangesPayload` 增加 `p_updates: MergeChangesUpdatePayload[]`（与 upsert 同形的内部类型），
`build_merge_changes_payload()` 按 D1 分流，`RxDBAdapterSupabase.mergeChanges()` 多传一个 `p_updates`。更新行沿用今天的拼法：
`{ id, ...patch }`，有 `userId` 时加 `updatedBy`，不加 `createdBy`。

**Rationale**: `supabase.merge-changes.ts` 不从包入口 `index.ts` 导出，属内部模块；`RemoteMergeResult` 与 `validateMergeResponse` 不变，
`rxdb-plugin-sync` 与三框架绑定无需改动（FR-015）。

**Alternatives**: 无。

## D6 `RxDBAdapterSupabase.mutations()` 的 UPDATE 不改（显式排除）

**Decision**: 仓库直写路径 `mutations()` 也调 `rxdb_mutations`，它把 `options.update` 经 `build_upsert_params(…, 'update')` 放进
`p_upserts`。本故事不改这条调用：它不传 `p_updates`，按 D1 取默认值，行为与今天一致。

**Rationale**: 该路径下发的是整个实体（减去 `createdBy`），不是部分列；改走普通 UPDATE 会把「目标行不存在时插入」变成 `RX001`，
是对仓库 `save()` 语义的改变，超出本故事 In Scope（推送路径）。**推断**该路径在 owner 型与共享编辑型 RLS 上同样命中症状 2、3
（`applyAuditFields` 在 update 模式下移除 `createdBy`），未实跑。

**Follow-up**: 在故事「范围边界」的 Out of Scope 里补一条，并在 requirements 里登记为待评估项，不在本 PR 处理。

## D7 版本配合：迁移文档 + 两处参数说明

**Decision**: 新增 `website/docs/migration/supabase-update-push.md`，写明「先执行新版 `04-rxdb-utils-functions.sql`，再升级客户端」，
以及新客户端连旧 SQL 时的报错特征（`PGRST202`，函数签名里带 `p_updates`）。`packages/rxdb-adapter-supabase/README.md` 与
`website/docs/adapters/supabase.md` 的 `rxdb_mutations` 参数表增加 `p_updates` 行与 UPDATE 语义、`RX001` / 42501 的说明。

**Rationale**: 仓库没有参考 SQL 的版本校验（`rxdb_server_version()` 返回 `pg_catalog.version()`），D1 已保证新旧组合只会显式失败，
剩下的是告诉部署者升级顺序。

**Alternatives**: 给参考 SQL 加版本号函数并在客户端启动时校验：价值更大但跨出本故事，留给后续。

## D8 测试布局

**Decision**:

| AC   | 层                        | 落点                                                                                                                                    |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | SQL 回归                  | `update-partial-columns`：参考 schema 的 `todos`，只推 `completed`，`title` 不变、日志 1 条                                             |
| 2    | SQL 回归                  | `update-owner-rls`：`FOR ALL` 本人策略，改自己的行不带 `owner`                                                                          |
| 3    | SQL 回归                  | `update-shared-edit`：SELECT / UPDATE 不设限、INSERT 限本人，改他人的行                                                                 |
| 4    | SQL 回归                  | `update-denied`：UPDATE `USING` 不放行、SELECT 不放行两个子场景，均 42501、行未变、无新日志                                             |
| 5    | SQL 回归                  | `update-gone`：NOT NULL 表与全可空表各一次，均 `RX001`、无新行、无新日志                                                                |
| 4、5 | SQL 回归                  | `existence-probe`：隐藏行返回存在、缺失行返回不存在、非同步表 22023、返回值不含列值                                                     |
| —    | 单元（vitest）            | `review-regressions.spec.ts` 的载荷断言改为 `p_upserts` 只含 INSERT、`p_updates` 只含 UPDATE；新增非 main 分支 `p_updates` 为空的断言   |
| 6    | 连真实 Supabase 的 vitest | 新增 `update-push-semantics.spec.ts`：两个 wa-sqlite 客户端经 `mergePushBatch` 推送 / 拉取，写法同 `sync-data-integrity.spec.ts`        |
| 7    | Playwright e2e            | `remote-sync.spec.ts` 新增「新建 → 勾选 → 另一上下文拉取」用例                                                                          |
| 8    | 脚本                      | 上述 6 个新用例登记进 `run-supabase-sql-security-regressions.sh` 的 `CASES`，与既有 10 个（含 US-218 的 `rls-filtered-delete`）一起实跑 |

**Rationale**: SQL 行为在 SQL 层断言最直接；AC#6、AC#7 证明客户端载荷与远端语义在真实链路上对得上。每个用例都先写、先红（宪法 II）。

## D9 性能

**Decision**: 不新增基准。成功路径与今天相比：每条 UPDATE 从「INSERT 试探 + ON CONFLICT 更新」变成一次按主键的 UPDATE，探针只在零行时执行。
AC#6 spec 记录单批推送耗时，作为 SC-006（< 100 ms）的验证数据，写进 tasks 的验证项。

**Rationale**: 宪法 IV 的数据库操作预算是 < 100 ms；按主键的单行 UPDATE 不会比今天的 upsert 慢（**推断**，由 AC#6 的记录核实）。
