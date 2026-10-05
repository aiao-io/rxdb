# Contract: `rxdb_mutations` 与 `rxdb_batch_update`（冻结项 F1）

**状态**: 已冻结（已与 [US-218 plan](../../007-us218-rls-push-integrity/plan.md) 交叉核对，见 [plan.md](../plan.md)「跨 plan 冻结项」）。
**落点**: `docker/sql/04-rxdb-utils-functions.sql`；客户端 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts`。

## 1. 签名

```sql
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.rxdb_mutations(jsonb, jsonb, jsonb, boolean);   -- 新增：删 4 参旧签名

CREATE OR REPLACE FUNCTION public.rxdb_mutations(
  p_upserts   jsonb   DEFAULT '[]'::jsonb,
  p_deletes   jsonb   DEFAULT '[]'::jsonb,
  p_changes   jsonb   DEFAULT '[]'::jsonb,
  p_skip_sync boolean DEFAULT false,
  p_updates   jsonb   DEFAULT '[]'::jsonb      -- 新增
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION public.rxdb_mutations(jsonb, jsonb, jsonb, boolean, jsonb) TO anon, authenticated;
```

```sql
CREATE OR REPLACE FUNCTION public.rxdb_batch_update(
  p_table  text,
  p_schema text  DEFAULT 'public',
  p_data   jsonb DEFAULT '[]'::jsonb
)
RETURNS int                                     -- 成功更新的行数（= p_data 的长度，否则已抛错）
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION public.rxdb_batch_update(text, text, jsonb) TO anon, authenticated;
```

## 2. 参数形状

`p_updates` 与 `p_upserts` 同形，按表分组：

```jsonc
[
  {
    "table": "todos", // 必填，须匹配 ^[a-zA-Z_][a-zA-Z0-9_]*$
    "schema": "public", // 可选，缺省 public
    "data": [
      { "id": "…", "completed": true, "updatedBy": "…" } // id 必填；其余键 = 要改的列
    ]
  }
]
```

| 规则               | 说明                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| 出现的键才改       | 每行只 `SET` 出现的非 `id` 键；未出现的列保持原值                                                            |
| 显式 `null`        | 出现且值为 `null` → 该列 `SET` 为 NULL                                                                       |
| 只有 `id`          | `SET id = t.id`：值不变，但仍是一次真实 UPDATE（触发器、策略判定、零行判定照常）                             |
| 类型转换           | 经 `jsonb_populate_record(null::<表>, 行)` 转成列类型，与 `rxdb_batch_upsert` 同口径                         |
| 未知键             | 不是表列的键被 `jsonb_populate_record` 忽略，但会出现在 `SET` 列表里 → PostgreSQL 报「列不存在」（显式失败） |
| 同表同 id 重复出现 | 按出现顺序逐行执行；客户端推送路径已按实体合并，不会产生                                                     |

## 3. 执行顺序

```text
1. 快照 + 写 rxdb_change（幂等判定，得出 apply_entity_operations）     — 不变
2. IF apply_entity_operations:
     a. p_upserts → rxdb_batch_upsert                                  — 不变（只剩 INSERT）
     b. p_updates → rxdb_batch_update                                  — 新增
     c. p_deletes → rxdb_batch_delete                                  — 不变
3. RETURN
```

纯重试批次（全部 change 命中幂等键）跳过 2，与 upsert / delete 一致。任一行抛错，整个 RPC 事务回滚：日志、其他行的写入都不落库。

## 4. 单行语义（`rxdb_batch_update`）

```sql
UPDATE <schema>.<table> AS t
   SET <k1> = (pg_catalog.jsonb_populate_record(null::<schema>.<table>, $1)).<k1>, …
 WHERE t.id = (pg_catalog.jsonb_populate_record(null::<schema>.<table>, $1)).id;
GET DIAGNOSTICS rc = ROW_COUNT;
IF rc = 0 THEN
  -- 调 rxdb_existing_ids(p_table, p_schema, ARRAY[$1->>'id'])，见 existence-probe.md
  --   返回含该 id → 42501（被拒）
  --   返回不含    → RX001（已不存在）
END IF;
```

- 不带 `RETURNING`。
- 只受调用方 UPDATE 策略（`USING` / `WITH CHECK`）与 SELECT 策略（经 `WHERE` 对旧行过滤）约束，不受 INSERT 策略约束。
- 两类错误的 `MESSAGE` / `DETAIL` 形状见 [sqlstate-registry.md](sqlstate-registry.md)。

## 5. 返回值

```jsonc
{
  "upserted": [/* 不变：INSERT 行的 to_jsonb */],
  "updated": 3, // 新增：p_updates 实际更新的行数；跳过实体操作时为 0
  "deleted": 1,
  "changes": 4,
  "max_change_id": 1234,
  "change_id_mapping": [/* 不变 */]
}
```

`validateMergeResponse` / `validateMutationsResponse` 不读 `updated`，不改；`updated` 供 SQL 回归与排障使用。

## 6. 客户端载荷（内部，不导出）

```ts
/** 与 MergeChangesUpsertPayload 同形；data 每行只含 id + 本次修改的列 + updatedBy。 */
export interface MergeChangesUpdatePayload {
  table: string;
  schema: string;
  data: Record<string, unknown>[];
}

export interface MergeChangesPayload {
  p_upserts: MergeChangesUpsertPayload[]; // 只含 actions.inserts
  p_updates: MergeChangesUpdatePayload[]; // 新增：actions.updates
  p_deletes: MergeChangesDeletePayload[];
  p_changes: …; // 不变
}
```

- 非 main 分支：`p_upserts` / `p_updates` / `p_deletes` 都为空数组（与今天 upsert / delete 的口径一致）。
- 更新行：`{ id, ...patch }`，有 `userId` 时加 `updatedBy`，**不加** `createdBy`。
- `RxDBAdapterSupabase.mergeChanges()` 调用 `rpc('rxdb_mutations', { p_upserts, p_deletes, p_changes, p_skip_sync: true, p_updates })`。
- `RxDBAdapterSupabase.mutations()` 不传 `p_updates`（plan「偏离与澄清」2）。

## 7. 新旧版本组合

| 客户端 | 远端 SQL | 结果                                                                                                        |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| 旧     | 旧       | 今天的行为                                                                                                  |
| 旧     | 新       | 不传 `p_updates` → 取默认值；修改仍在 `p_upserts` 里走 upsert，行为与今天一致（缺陷仍在，不更坏）           |
| 新     | 旧       | PostgREST 找不到带 `p_updates` 的函数 → `PGRST202`（HTTP 404）→ `SupabaseDataError`；推送失败，水位线不推进 |
| 新     | 新       | 本契约                                                                                                      |

升级顺序：先执行新版 `04-rxdb-utils-functions.sql`，再升级客户端（`website/docs/migration/supabase-update-push.md`）。

US-218 阶段 B 在本签名之上顺序追加第 6 个参数 `p_receipts boolean DEFAULT false` 并 DROP 本 5 参签名；本节组合表在那时由
[US-218 rxdb-mutations-receipts §7](../../007-us218-rls-push-integrity/contracts/rxdb-mutations-receipts.md) 取代。
