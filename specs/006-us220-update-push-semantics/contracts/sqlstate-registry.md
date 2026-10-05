# Contract: RxDB 远端 SQLSTATE 登记（冻结项 F2）

**状态**: 已冻结（已与 [US-218 plan](../../007-us218-rls-push-integrity/plan.md) 交叉核对，见 [plan.md](../plan.md)「跨 plan 冻结项」）。
本表是参考 SQL 抛出的业务错误码的唯一登记处；新码先在这里登记再实现。

## 1. 码表

| SQLSTATE | 名称                     | 何时抛                                       | PostgREST HTTP             | 登记方 |
| -------- | ------------------------ | -------------------------------------------- | -------------------------- | ------ |
| `42501`  | `insufficient_privilege` | 推送的 UPDATE 零行生效，且目标行存在（被拒） | 403（已登录）/ 401（匿名） | US-220 |
| `RX001`  | `rxdb_row_gone`          | 推送的 UPDATE 零行生效，且目标行不存在       | 400                        | US-220 |
| `RX002`  | `rxdb_push_integrity`    | 推送载荷中日志与业务写不配对（写入前校验）   | 400                        | US-218 |
| `RX003`… | —                        | 预留，按需顺延                               | 400                        | —      |

`RX` 类规则：

- 首字符 `R` 落在 SQL 标准留给实现自定义的范围（I–Z），不与 PostgreSQL 内置类（`P0`、`XX`、`F0`、`HV` 等）冲突；
- 不用 `P0*`：PostgREST 把 `P0*`（`P0001` 除外）映射为 HTTP 500，与 US-218 AC#13「5xx 一律可重试」冲突；`P0002` 还是
  PL/pgSQL `STRICT` 找不到行的默认码，用户触发器抛出时会被误判；
- 不用 `PT*`：PostgREST 保留用于直接指定 HTTP 状态；
- PostgREST 对未列出的码一律返回 HTTP 400，`RX` 类全部落 400，归入「远端的业务回答」，不触发重试。

## 2. 错误体

两个码都用同一种 `RAISE`：

```sql
RAISE EXCEPTION USING
  ERRCODE = 'RX001',                     -- 或 'insufficient_privilege'
  MESSAGE = pg_catalog.format('rxdb: UPDATE target row is gone: %I.%I id=%s', p_schema, p_table, v_id),
            -- 被拒：'rxdb: UPDATE denied by row-level security: %I.%I id=%s'
  DETAIL  = pg_catalog.jsonb_build_object(
              'op', 'UPDATE',
              'schema', p_schema,
              'table', p_table,
              'entityId', v_id,
              'reason', 'gone'           -- 或 'denied'
            )::text;
```

PostgREST 返回体：

```jsonc
{
  "code": "RX001",
  "message": "rxdb: UPDATE target row is gone: public.todos id=…",
  "details": "{\"op\": \"UPDATE\", \"schema\": \"public\", \"table\": \"todos\", \"entityId\": \"…\", \"reason\": \"gone\"}",
  "hint": null
}
```

| 字段      | 约定                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `code`    | 判定依据。US-218 阶段 B 起客户端保留并按它分类                                                          |
| `message` | 以 `rxdb:` 开头，人可读、自带原因；今天客户端只保留 `message`，靠它在日志里分辨两种失败                 |
| `details` | JSON 文本，键固定为 `op` / `schema` / `table` / `entityId` / `reason`；整批失败时供调用方定位实体与原因 |
| `reason`  | `denied` ↔ 42501，`gone` ↔ `RX001`，一一对应，冗余以便只拿到 `details` 的场景也能判                     |

## 3. 客户端现状与边界

- 今天 `executeRetryableWrite` 只保留 `error.message` 与 `status`，`classify_postgrest_error` 把非 0 状态一律包成
  `SupabaseDataError(message)`。本故事不改客户端错误分类：两种失败都以 `SupabaseDataError` 显式抛出、推送不推进水位线，满足 FR-010。
- 保留 `code` / `details` 并据此区分「被拒」与「已不存在」是 US-218 阶段 B 的范围；本契约保证那时需要的信息已经在错误体里。
- US-218 阶段 B（`p_receipts = true`）在服务端逐实体重放时按 SQLSTATE 归类：42501 → `denied`、`RX001` → `gone`（不重试）、
  23503 → `dependency`；`RX002` 与其它码不捕获、整批失败。实体由重放上下文给出，不依赖 `DETAIL`，所以 `WITH CHECK` 抛出的非 JSON
  `DETAIL` 的 42501 同样归为 `denied`（[US-218 rxdb-mutations-receipts §3](../../007-us218-rls-push-integrity/contracts/rxdb-mutations-receipts.md)）。
