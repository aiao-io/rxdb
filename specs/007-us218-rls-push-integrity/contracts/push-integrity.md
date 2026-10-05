# Contract: 阶段 A：DELETE 零行判定与日志配对（冻结项 F4）

**状态**: 冻结（与 US-220 F1～F3 一并冻结，见 [plan.md](../plan.md)「跨 plan 冻结项」）。
**落点**: `docker/sql/04-rxdb-utils-functions.sql` 的 `rxdb_mutations`。签名不变（沿用 US-220 F1 的 5 参签名）。
**依据**: research D1～D3。

## 1. 执行顺序（阶段 A）

```text
0. 配对校验（§3）                                   — 新增；失败抛 RX002，什么都没写
1. 快照 + 写 rxdb_change（幂等判定）                — 不变
2. IF apply_entity_operations:
     a. p_upserts → rxdb_batch_upsert              — 不变
     b. p_updates → rxdb_batch_update              — US-220
     c. p_deletes → rxdb_batch_delete + 零行判定（§2）— 新增判定
3. RETURN                                           — 不变
```

任一步抛错，整个 RPC 事务回滚（AC#5）。

## 2. DELETE 零行判定

只在 `p_skip_sync = true` 时执行；对 `p_deletes` 的每一组：

```sql
v_deleted := public.rxdb_batch_delete(v_table, v_schema, v_ids);
IF v_deleted < pg_catalog.cardinality(v_ids) THEN
  v_denied := public.rxdb_existing_ids(v_table, v_schema, v_ids);   -- 同事务内已删的行对探针不存在
  IF pg_catalog.cardinality(v_denied) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = pg_catalog.format('rxdb: DELETE denied by row-level security: %I.%I id=%s', v_schema, v_table, v_denied[1]),
      DETAIL  = pg_catalog.jsonb_build_object(
                  'op', 'DELETE', 'schema', v_schema, 'table', v_table,
                  'entityId', v_denied[1], 'reason', 'denied')::text;
  END IF;
  -- 余下的都是「已不存在」：幂等成功，不抛错
END IF;
```

| 目标行状态                               | 结果              | AC   |
| ---------------------------------------- | ----------------- | ---- |
| 可见、DELETE 策略放行                    | 删除，成功        | —    |
| 可见、DELETE 策略不放行                  | 42501，`denied`   | AC#1 |
| 存在、SELECT 与 DELETE 都不放行          | 42501，`denied`   | AC#2 |
| 对任何角色都不存在                       | 成功（幂等）      | AC#4 |
| 同组里有被拒、有已不存在、有成功         | 42501，整批回滚   | AC#5 |
| 非同步表（无 `rxdb_sync_trigger`）且少删 | 22023（探针拒绝） | —    |

- 不带 `RETURNING`，`rxdb_batch_delete` 签名与返回值不变。
- `p_skip_sync = false`（`mutations()` 直写）不判定：零行删除不触发日志触发器，没有幽灵日志。
- 推送路径只针对已启用同步的表（**推断**，与 US-220 `rxdb_batch_update` 同一前提）；非同步表上少删以 22023 显式失败，不静默放过。

## 3. 配对校验

在步骤 1 之前只读载荷完成。键 = （`schema`、`table`、`id` 文本），main 日志 = `COALESCE(branchId,'main') = 'main'`。

| 序  | 检查                                                                        | 失败时 `reason`                | `DETAIL.op`              |
| --- | --------------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| 1   | `p_skip_sync = false` 且存在 main 日志                                      | `explicit_log_in_trigger_mode` | 该日志的 `type`          |
| 2   | 同一键在 `p_upserts` ∪ `p_updates` ∪ `p_deletes` 出现多于一次               | `duplicate_write`              | 第二次出现所在数组的操作 |
| 3   | main 日志的键不在任何业务写里                                               | `unpaired_change`              | 该日志的 `type`          |
| 4   | `p_skip_sync = true` 且业务写的键没有 main 日志                             | `unpaired_write`               | 业务写的操作             |
| 5   | 键的最后一条 main 日志（按 `p_changes` 顺序）为 DELETE ⇔ 键不在 `p_deletes` | `op_mismatch`                  | 最后一条日志的 `type`    |

- 按序检查，报第一处违规。
- 业务写的操作：`p_upserts` → `INSERT`，`p_updates` → `UPDATE`，`p_deletes` → `DELETE`。
- 非 main 日志不参与任何一条；`p_skip_sync = false` 且无日志时只做检查 2。
- 合法形状：N 条 main 日志对应同一个键、1 次业务写（压缩）。

```sql
RAISE EXCEPTION USING
  ERRCODE = 'RX002',
  MESSAGE = pg_catalog.format('rxdb: push integrity violation (%s): %I.%I id=%s', v_reason, v_schema, v_table, v_id),
  DETAIL  = pg_catalog.jsonb_build_object(
              'op', v_op, 'schema', v_schema, 'table', v_table,
              'entityId', v_id, 'reason', v_reason)::text;
```

`RX002` 在 [006 sqlstate-registry](../../006-us220-update-push-semantics/contracts/sqlstate-registry.md) 登记，HTTP 400，不重试。
客户端正常推送路径不会触发它（SC-003）；触发即说明客户端合并逻辑有缺陷或调用被伪造，整批失败暴露。

## 4. 回归用例（SQL）

| 用例                          | AC  | 期望                                                                                       |
| ----------------------------- | --- | ------------------------------------------------------------------------------------------ |
| `rls-filtered-delete`（改写） | 1   | 读不设限、删除仅本人；删他人行 → 42501 `denied`；行仍在；该客户端无新日志                  |
| `delete-hidden-row`           | 2   | 读与删都仅本人；删他人行 → 42501 `denied`（不是成功）；行仍在；无新日志                    |
| （US-220 `update-denied`）    | 3   | 可见、UPDATE 不放行 → 42501；行未变；无新日志（由 US-220 用例覆盖，tasks T014 补日志断言） |
| `delete-gone`                 | 4   | 删不存在的 id → 成功；日志按幂等语义写入                                                   |
| `mixed-batch-rollback`        | 5   | 一条被拒删除 + 一条可放行新建 → 42501；两张表都无变化                                      |
| `push-integrity`              | 6   | §3 五种 `reason` 各一例均 `RX002` 且两张表不变；N 日志 → 1 写成功；非 main 日志不受约束    |
| 既有用例                      | 7   | US-220 合入后的 16 条（含改写的 `rls-filtered-delete`）+ 本表新增 4 条，共 20 条全部 PASS  |
