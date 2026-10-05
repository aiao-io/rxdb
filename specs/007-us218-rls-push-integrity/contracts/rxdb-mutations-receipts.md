# Contract: 阶段 B：`rxdb_mutations` 逐实体回执（冻结项 F5）

**状态**: 冻结（见 [plan.md](../plan.md)「跨 plan 冻结项」）。
**落点**: `docker/sql/04-rxdb-utils-functions.sql`；客户端 `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`、
`supabase.merge-changes.ts`、`supabase.helpers.ts`、`errors.ts`。
**前置**: US-220 F1（5 参签名、`p_updates`）已合入；本契约在其上做一次顺序变更。
**依据**: research D5～D9、D11、D17。

## 1. 签名

```sql
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb);   -- US-220 的 5 参签名

CREATE OR REPLACE FUNCTION public.rxdb_mutations(
  p_upserts   jsonb   DEFAULT '[]'::jsonb,
  p_deletes   jsonb   DEFAULT '[]'::jsonb,
  p_changes   jsonb   DEFAULT '[]'::jsonb,
  p_skip_sync boolean DEFAULT false,
  p_updates   jsonb   DEFAULT '[]'::jsonb,
  p_receipts  boolean DEFAULT false             -- 新增
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb, boolean) TO anon, authenticated;
```

参数只追加、不改顺序；全部带默认值，只传前 4 个或前 5 个参数的旧客户端按名匹配到本签名，`p_receipts = false`。

## 2. 执行流程

```text
0. 配对校验（push-integrity.md §3）              失败 → RX002，整批，无回执
1. 快照（不变）
2. 按 clientId 排序逐个 pg_advisory_xact_lock；查出本批 (clientId, localId) 中已在 rxdb_change 的
   → 实体的 main 日志全部已存在：标记 skip（结果 applied，不执行业务写）
3. 业务写：upsert 组 → update 组 → delete 组，按载荷顺序；跳过 skip 实体
   p_receipts = true:
     每组一个子事务整组执行
       成功 → 组内实体 applied
       捕获可归类错误（§3）→ 回滚该组 → 组内逐实体各自子事务重放 → 每个实体 applied / rejected
       其它错误 → 不捕获，上抛
   p_receipts = false:
     不开子事务，第一个错误原样上抛（全有或全无，等于阶段 A）
4. 写 rxdb_change：按 p_changes 原顺序，只写 applied 实体的 main 日志与全部非 main 日志（ON CONFLICT DO NOTHING 不变）
5. RETURN（§4）
```

- DELETE 的零行判定（push-integrity §2）在逐实体重放中按单个 id 执行：存在 → `denied`，不存在 → `applied`。
- 组：`p_upserts` / `p_updates` 的一个元素（一个表的 `data`），`p_deletes` 的一个元素（一个表的 `ids`）。
- 跳过的实体不参与组执行；组里全是跳过实体时不开子事务。

## 3. 错误归类

| SQLSTATE                                        | `reason`     | `code`  | `dependsOn`                                                                  |
| ----------------------------------------------- | ------------ | ------- | ---------------------------------------------------------------------------- |
| `42501`                                         | `denied`     | `42501` | —                                                                            |
| `RX001`                                         | `gone`       | `RX001` | —                                                                            |
| `23503`                                         | `dependency` | `23503` | `{schema, table, entityId}`：由约束解析出的父实体；解析不出时 `{constraint}` |
| 其它（含 `RX002`、23505、23502、23514、XX000…） | —            | —       | 不捕获，整批失败                                                             |

`dependsOn` 解析：`GET STACKED DIAGNOSTICS` 取 `CONSTRAINT_NAME`、`SCHEMA_NAME`、`TABLE_NAME` → `pg_constraint`（`conrelid` 匹配本表、
`conname` 匹配）→ 单列外键时取 `conkey` 对应列名，从该实体的载荷行取值作父 `entityId`，`confrelid` 给父表的 schema / table。
多列外键、载荷里没有该列（例如删除被引用行时的 23503）→ `{constraint: CONSTRAINT_NAME}`。

同一实体既会被 RLS `WITH CHECK` 拒绝又会外键失败时，`WITH CHECK` 在行写入前检查、先报出，结果为 `denied`。

## 4. 返回值

```jsonc
{
  "upserted": [/* applied 的 INSERT 行 to_jsonb */],
  "updated": 2,
  "deleted": 1,
  "changes": 5, // 本次新写入的日志条数
  "max_change_id": 1240,
  "change_id_mapping": [
    // applied 实体的 main 源变更 + 全部非 main 源变更
    { "localId": 11, "remoteId": 1236 }
  ],
  "entity_results": [
    // 仅 p_receipts = true；p_upserts/p_updates/p_deletes 每个实体一条，按载荷顺序
    {
      "schema": "public",
      "table": "todos",
      "entityId": "…",
      "op": "UPDATE",
      "status": "rejected",
      "code": "42501",
      "reason": "denied",
      "message": "rxdb: UPDATE denied by row-level security: public.todos id=…",
      "localIds": [12, 13]
    },
    {
      "schema": "public",
      "table": "todo_items",
      "entityId": "…",
      "op": "INSERT",
      "status": "rejected",
      "code": "23503",
      "reason": "dependency",
      "message": "insert or update on table \"todo_items\" violates foreign key constraint …",
      "dependsOn": { "schema": "public", "table": "todos", "entityId": "…" },
      "localIds": [14]
    },
    { "schema": "public", "table": "todos", "entityId": "…", "op": "INSERT", "status": "applied", "localIds": [15] }
  ]
}
```

- `p_receipts = false` 时没有 `entity_results` 键，其余字段与 US-220 契约一致。
- `localIds`：该实体在本批的全部 main 源变更（压缩前）的 `localId`，即扇出依据（AC#10）。不带 `clientId` / `localId` 的日志不出现。
- 跳过（已幂等）的实体：`status = applied`，其 `localIds` 在 `change_id_mapping` 里取首次提交的远端 id（AC#15）。
- 一个实体的 `localIds` 要么全部出现在 `change_id_mapping`（applied），要么全部不出现（rejected）。

## 5. 重试语义（FR-018）

| 首次结果 | 重试时                                                                  |
| -------- | ----------------------------------------------------------------------- |
| applied  | 日志已存在 → 跳过业务写，返回同一远端 id                                |
| rejected | 日志从未写入 → 作为新实体重新判定；远端权限或数据变化后可能变为 applied |
| 整批失败 | 什么都没写 → 全部重新判定                                               |

## 6. 客户端

- `mergeChanges()` 传 `p_receipts: true`；`mutations()` 不传（直写路径保持全有或全无）。
- `validateMergeResponse` 增加：`entity_results` 必须是数组；每个元素 `status` ∈ {applied, rejected}；`rejected` 必须有 `code`、
  `reason`、`message`；`localIds` 必须是非负整数数组。不合格 → `SupabaseDataError`，整批失败。
- 回执构造与覆盖校验见 [remote-merge-result.md](remote-merge-result.md) §3。
- `executeRetryableWrite` / `classify_postgrest_error` 保留 `code`、`details`、`hint`；`SupabaseDataError` 增加只读 `code?: string`、
  `details?: string`（导出类的新增字段，进 API 基线）。

## 7. 新旧版本组合

| 客户端               | 远端 SQL    | 结果                                                                                    |
| -------------------- | ----------- | --------------------------------------------------------------------------------------- |
| US-220 之前 / US-220 | 阶段 B      | `p_receipts` 取默认 false：全有或全无；拒绝以 42501 / `RX001` / `RX002` 整批抛出        |
| 阶段 B               | 阶段 B 之前 | `PGRST202`（找不到带 `p_receipts` 的函数）→ `SupabaseDataError`；推送失败，水位线不推进 |
| 阶段 B               | 阶段 B      | 本契约                                                                                  |

升级顺序：先执行新版参考 SQL，再升级客户端（迁移文档 `website/docs/migration/supabase-push-receipts.md`）。
没有任何组合会部分成功而不告知客户端（FR-022）。
