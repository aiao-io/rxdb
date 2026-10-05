# Contract: 存在性判定原语 `rxdb_existing_ids`（冻结项 F3，与 US-218 阶段 A 共用）

**状态**: 建议冻结值，**须与 US-218 plan 交叉核对后一并冻结**（见 [plan.md](../plan.md)「跨 plan 冻结项」）。
**落点**: `docker/sql/04-rxdb-utils-functions.sql`。
**使用方**: US-220 `rxdb_batch_update`（单元素数组）；US-218 阶段 A 的 DELETE 判定（整批）。

## 1. 签名

```sql
CREATE OR REPLACE FUNCTION public.rxdb_existing_ids(
  p_table  text,
  p_schema text,
  p_ids    text[]
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = off;

GRANT EXECUTE ON FUNCTION public.rxdb_existing_ids(text, text, text[]) TO anon, authenticated;
```

参数顺序与 `rxdb_batch_upsert` / `rxdb_batch_delete` 相同（表、schema、数据）；三个参数都无默认值。

## 2. 行为

| 输入                                                               | 结果                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 同步表，`p_ids` 中部分存在                                         | 返回 `p_ids` 中存在的那部分元素（原样，顺序不保证），不含任何列值                   |
| 同步表，`p_ids` 都不存在 / 为空数组                                | 返回空数组 `'{}'`                                                                   |
| 行存在但调用方 RLS 看不见                                          | 视为存在（判定不受调用方 RLS 影响）                                                 |
| 表名不匹配 `^[a-zA-Z_][a-zA-Z0-9_]*$`                              | `RAISE`（与 `rxdb_batch_delete` 同一条校验）                                        |
| 表不存在、不是 `r` / `p`，或没挂 RxDB 的同步日志触发器             | `RAISE … USING ERRCODE = 'invalid_parameter_value'`（22023），消息含 `schema.table` |
| 函数属主无法绕过该表 RLS（无 `BYPASSRLS`，且非属主或开了 `FORCE`） | PostgreSQL 报「query would be affected by row-level security policy」，不返回结论   |

「挂了同步日志触发器」的判定：`pg_trigger` 中该表存在 `tgname = 'rxdb_sync_trigger'` 且 `tgfoid = 'public.rxdb_log_change_trigger'::regproc`
的触发器（由 `rxdb_enable_sync_for_table()` 创建）。只看名字不看函数，任何人在自己有权建触发器的表上起同名触发器就能把表加进白名单。

## 3. 比较方式

```sql
v_array_type := public.rxdb_id_array_type(p_table, p_schema);   -- 内部 helper，见 §4
EXECUTE pg_catalog.format(
  'SELECT pg_catalog.array_agg(p.raw)
     FROM pg_catalog.unnest($1, $1::%s) AS p(raw, typed)
    WHERE EXISTS (SELECT 1 FROM %I.%I AS t WHERE t.id = p.typed)',
  v_array_type, p_schema, p_table
) INTO result USING p_ids;
RETURN COALESCE(result, '{}');
```

- `id` 列按真实类型比较，能用主键索引；
- 返回的是调用方传入的**原样**元素，不是 `t.id::text`：`uuid` 大小写、`varchar` 尾随空格等写法差异不会让调用方的「是否包含」判断出错；
- 某个元素转不成 `id` 的类型（如非法 uuid 文本）→ PostgreSQL 类型转换错误，显式失败。

## 4. 内部 helper `rxdb_id_array_type`

```sql
CREATE OR REPLACE FUNCTION public.rxdb_id_array_type(p_table text, p_schema text)
RETURNS pg_catalog.regtype
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp;
```

把 `rxdb_batch_delete` 里「从 `pg_attribute` 取 `id` 列类型及其数组类型」那段原样搬出，含两条错误：`Missing id column` 与
`Unsupported id type without array regtype`。`rxdb_batch_delete` 与探针都改调它。`rxdb_batch_delete` 是 INVOKER，以调用方身份
调用 helper，所以 `GRANT EXECUTE … TO anon, authenticated`；helper 只读系统目录，不读业务表。

## 5. 泄露面

- 只回答「同步表里这些 id 是否存在」，不返回任何列值、行数以外的信息。
- 参考部署里 `rxdb_change` 关着 RLS，同步表每行的 `beforeData` / `afterData` 本来就对 `anon` 可读，探针泄露的严格少于此。
- US-218 阶段 C 收紧 `rxdb_change` 读权限后，探针是剩余的存在性通道：写进 `website/docs/adapters/supabase.md` 的已知限制，
  说明 id 不应承载敏感信息（UUID 主键不可枚举，自增或业务主键可被逐个探测）。
- 非同步表（如 `auth.users`）一律 22023，不可探测。

## 6. 调用约定

- **只在需要时调用**：UPDATE 仅在 `ROW_COUNT = 0` 时调；成功路径不调。
- 调用方拿到结果后自行决定错误码（42501 / `RX001`），探针本身不抛业务错误。
- US-218 阶段 A 对 DELETE：用 `DELETE … RETURNING id` 得到实际删掉的 id，未删掉的那部分再交给探针一次判定；存在 → 被拒，不存在 → 按 US-218
  的规则处理（由 US-218 plan 定，须与本契约同时冻结）。
