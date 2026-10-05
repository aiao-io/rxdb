# Data Model: US-220 — Supabase 推送 UPDATE 的落库语义

**Date**: 2026-10-05 | **Plan**: [plan.md](plan.md)

本故事不新增表、不改表结构。「数据」是推送载荷、远端函数与错误回答；本文件给出它们的字段、校验与判定流程，SQL 签名以
[contracts/](contracts/) 为准。

## 1. 推送载荷（客户端 → `rxdb_mutations`）

| 实体                        | 来源                          | 字段                                                     | 说明                                                                    |
| --------------------------- | ----------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MergeChangesUpsertPayload` | `actions.inserts`             | `table`、`schema`、`data[]`                              | 只含新建；行 = 实体全部列 + `createdBy` + `updatedBy`（有 `userId` 时） |
| `MergeChangesUpdatePayload` | `actions.updates`（新）       | `table`、`schema`、`data[]`                              | 只含修改；行 = `id` + 本次修改的列 + `updatedBy`（有 `userId` 时）      |
| `MergeChangesDeletePayload` | `actions.deletes`             | `table`、`schema`、`ids[]`                               | 不变                                                                    |
| `MergeChangesPayload`       | `build_merge_changes_payload` | `p_upserts`、`p_updates`（新）、`p_deletes`、`p_changes` | 非 main 分支时前三者为空数组；`p_changes` 不变                          |

校验规则：

- 同一实体在一次推送里只会出现在 `inserts` / `updates` / `deletes` 之一（`mergePushBatch` 已按实体合并，本故事不改合并逻辑）；
- 「新建后又修改」在合并后是一条 insert，走 `p_upserts`（spec Edge Cases）；
- `MergeChangesUpdatePayload.data[i]` 不含 `createdBy`；`id` 必填；
- 这些类型是 `supabase.merge-changes.ts` 的内部类型，不从包入口导出。

## 2. 远端函数

| 函数                 | 安全属性                      | 职责                                               | 状态                  |
| -------------------- | ----------------------------- | -------------------------------------------------- | --------------------- |
| `rxdb_mutations`     | INVOKER                       | 幂等判定、写日志、按 upsert → update → delete 执行 | 改：加 `p_updates`    |
| `rxdb_batch_upsert`  | INVOKER                       | INSERT … ON CONFLICT                               | 不变                  |
| `rxdb_batch_update`  | INVOKER                       | 逐行普通 UPDATE；零行时调探针并抛错                | 新                    |
| `rxdb_batch_delete`  | INVOKER                       | `DELETE … WHERE id = ANY(...)`                     | 改：取类型改调 helper |
| `rxdb_existing_ids`  | DEFINER、`row_security = off` | 同步表 id 存在性判定（与 US-218 共用）             | 新                    |
| `rxdb_id_array_type` | INVOKER                       | 按 `id` 列真实类型给出数组类型                     | 新（内部）            |

## 3. 错误回答

| 回答     | SQLSTATE | `DETAIL.reason` | 触发条件                    | 客户端今天看到的             |
| -------- | -------- | --------------- | --------------------------- | ---------------------------- |
| 被拒     | `42501`  | `denied`        | UPDATE 零行，探针判定存在   | `SupabaseDataError(message)` |
| 已不存在 | `RX001`  | `gone`          | UPDATE 零行，探针判定不存在 | `SupabaseDataError(message)` |
| 非同步表 | `22023`  | —               | 探针收到非同步表            | 不经推送路径到达（防御性）   |

`DETAIL` 是 JSON：`{ op, schema, table, entityId, reason }`，见 [contracts/sqlstate-registry.md](contracts/sqlstate-registry.md)。
任一错误都让整个 `rxdb_mutations` 事务回滚：本批的日志与其他行写入都不落库，客户端水位线不推进。

## 4. 单行 UPDATE 的判定流程

```text
UPDATE … SET <出现的列> WHERE id = <id>      （调用方身份：UPDATE USING / WITH CHECK + SELECT USING）
        │
        ├─ ROW_COUNT = 1 ──────────────────────► 成功；rxdb_sync_trigger / rxdb_timestamp_trigger 照常
        │
        └─ ROW_COUNT = 0
               │  rxdb_existing_ids(table, schema, [id])   （属主身份，绕过 RLS）
               ├─ 含 id ──► RAISE 42501  reason=denied   （UPDATE 或 SELECT 策略不放行）
               └─ 不含  ──► RAISE RX001  reason=gone     （已被删除 / 从未存在）
```

`WITH CHECK` 不放行时 PostgreSQL 直接抛 42501（`new row violates row-level security policy`），不经过 ROW_COUNT 分支；
它与「被拒」同码，`DETAIL` 不是本契约的 JSON 形状。**推断**这对客户端没有区别（今天只看 `message`；US-218 阶段 B 按 `code` 分类时两者同为
「被拒」），由 `update-denied` 用例覆盖 `USING` 与 SELECT 两个子场景，`WITH CHECK` 子场景记为可选补充。

## 5. 状态与幂等

- 本故事不引入新状态。重试语义沿用 `(clientId, localId)` 幂等键与 `apply_entity_operations`：纯重试批次不再执行任何实体操作，
  所以「第一次已成功、重试时行已被他人删除」不会误报 `RX001`。
- 一批里部分行「已不存在」：整批回滚、整批失败（spec Edge Cases「部分已不存在」）；逐行回执是 US-218 阶段 B 的范围。
