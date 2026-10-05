# Data Model: US-218 — Supabase 远端启用 RLS 时的推送完整性

**Date**: 2026-10-05 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

远端不新增表；本地 `RxDBChange` 加两列。签名与形状以 [contracts/](contracts/) 为准，这里给字段、校验规则与状态流转。

## 1. 推送载荷（客户端 → `rxdb_mutations`）

沿用 US-220 的载荷（[006 data-model §1](../006-us220-update-push-semantics/data-model.md)），阶段 B 加一个参数：

| 参数          | 阶段   | 说明                                                                                    |
| ------------- | ------ | --------------------------------------------------------------------------------------- |
| `p_upserts`   | 不变   | 新建                                                                                    |
| `p_updates`   | US-220 | 修改                                                                                    |
| `p_deletes`   | 不变   | 删除                                                                                    |
| `p_changes`   | 不变   | 源变更；每条带 `schema`、`table`、`entityId`、`type`、`branchId`、`clientId`、`localId` |
| `p_skip_sync` | 不变   | 推送路径恒为 `true`                                                                     |
| `p_receipts`  | B 新增 | 推送路径恒为 `true`；缺省 `false`                                                       |

### 配对键与校验（阶段 A，[contracts/push-integrity.md](contracts/push-integrity.md)）

- **实体键**：（`schema`、`table`、`id` 文本）。日志侧取 `COALESCE(schema,'public')`、`table`、`entityId`；业务写侧取组的 `schema` /
  `table` 与 `data[i]->>'id'` 或 `ids[i]`。
- **main 日志**：`COALESCE(branchId,'main') = 'main'` 的 `p_changes` 元素。非 main 日志不参与。
- 规则：每个 main 日志的键都有业务写；`p_skip_sync = true` 时每个业务写的键都有 main 日志；每个键至多一次业务写；
  键的最后一条 main 日志类型与业务写所在数组一致（DELETE ↔ `p_deletes`）；`p_skip_sync = false` 时不得带 main 日志。

## 2. 远端函数

| 函数                      | 安全属性                      | 阶段 | 变化                                                                                                       |
| ------------------------- | ----------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `rxdb_mutations`          | INVOKER                       | A    | 开头做配对校验（`RX002`）；显式日志模式下 DELETE 少删时调探针判定（42501）                                 |
| `rxdb_mutations`          | INVOKER                       | B    | 加 `p_receipts`；先整组、出错逐实体重放；写后记日志；按 `clientId` 加锁的逐实体幂等；返回 `entity_results` |
| `rxdb_mutations`          | INVOKER                       | C    | 写日志改调 `rxdb_insert_changes`，前后置 GUC 守卫                                                          |
| `rxdb_existing_ids`       | DEFINER、`row_security = off` | A    | 不改（US-220 F3），新增 DELETE 一个使用方                                                                  |
| `rxdb_batch_delete`       | INVOKER                       | —    | 不改（签名有回归断言）                                                                                     |
| `rxdb_log_change_trigger` | INVOKER → DEFINER             | C    | 改安全属性                                                                                                 |
| `rxdb_insert_changes`     | DEFINER                       | C    | 新（内部），GUC 守卫                                                                                       |

## 3. 远端错误与回执

### 3.1 整批错误（`p_receipts = false`，或任何模式下的协议错误）

| 回答     | SQLSTATE | `DETAIL.reason`                                                                                           | 登记方 |
| -------- | -------- | --------------------------------------------------------------------------------------------------------- | ------ |
| 被拒     | `42501`  | `denied`                                                                                                  | US-220 |
| 已不存在 | `RX001`  | `gone`（只出现在 UPDATE）                                                                                 | US-220 |
| 不配对   | `RX002`  | `unpaired_change` / `unpaired_write` / `duplicate_write` / `op_mismatch` / `explicit_log_in_trigger_mode` | US-218 |

`DETAIL` 都是 JSON `{op, schema, table, entityId, reason}`（[006 sqlstate-registry](../006-us220-update-push-semantics/contracts/sqlstate-registry.md)）。

### 3.2 实体回执（`p_receipts = true`，[contracts/rxdb-mutations-receipts.md](contracts/rxdb-mutations-receipts.md)）

| 字段        | 类型                                        | 说明                                                  |
| ----------- | ------------------------------------------- | ----------------------------------------------------- |
| `schema`    | text                                        | 实体键                                                |
| `table`     | text                                        | 实体键                                                |
| `entityId`  | text                                        | 实体键（载荷原样）                                    |
| `op`        | `'INSERT' \| 'UPDATE' \| 'DELETE'`          | 来自所在数组：`p_upserts` / `p_updates` / `p_deletes` |
| `status`    | `'applied' \| 'rejected'`                   |                                                       |
| `code`      | text                                        | 仅 `rejected`：`42501` / `RX001` / `23503`            |
| `reason`    | `'denied' \| 'gone' \| 'dependency'`        | 仅 `rejected`                                         |
| `message`   | text                                        | 仅 `rejected`：数据库原消息                           |
| `dependsOn` | `{schema,table,entityId}` 或 `{constraint}` | 仅 `reason = dependency`                              |
| `localIds`  | int[]                                       | 该实体在本批的全部 main 源变更 `localId`（扇出依据）  |

`change_id_mapping` 只含 `applied` 实体的源变更与全部非 main 源变更。

## 4. 客户端契约（`@aiao/rxdb`）

| 类型                    | 字段                                                                                 | 说明                                    |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| `RemoteMergeResult`     | `maxChangeId?`、`results`                                                            | `results` 必填，每条源变更恰好一条      |
| `RemoteChangeResult`    | `{localId, status:'applied', remoteId}` \| `{localId, status:'rejected', rejection}` |                                         |
| `RemoteChangeRejection` | `code`、`reason`、`message`、`entity{namespace,entity,entityId}`、`dependsOn?`       | `dependsOn` 为实体引用或 `{constraint}` |

见 [contracts/remote-merge-result.md](contracts/remote-merge-result.md)。

## 5. 本地 `RxDBChange` 新列（系统模式 6 → 7）

| 列           | 类型                                  | 默认 | 写入时机                   |
| ------------ | ------------------------------------- | ---- | -------------------------- |
| `rejectedAt` | 时间戳，可空                          | null | 推送提交事务，源变更被拒时 |
| `rejection`  | JSON，可空（`RemoteChangeRejection`） | null | 同上                       |

- `rejectedAt` 与 `remoteId` 互斥：一条变更至多其一非空（推送提交时校验，测试断言）。
- 迁移：SQLite `migrateSystemSchema` 与 PGlite `migrate_system_schema.ts` 都用「列不存在才 `ADD COLUMN`」；旧行不回填。

## 6. 本地变更的状态流转

```text
                   推送提交（回执 applied）
   待推 ───────────────────────────────────► 已推（remoteId 非空）
 (remoteId = null,
  rejectedAt = null)
     │             推送提交（回执 rejected）
     └─────────────────────────────────────► 被拒（rejectedAt 非空，终态，不再重推）

 整批失败（网络 / 5xx / RX002 / 未列明 SQLSTATE / 回执缺项）：保持待推，水位线不动
```

- 「待推」判据：`remoteId = null AND rejectedAt = null`（撤销 / 重做查询除外，见 research D13）。
- 水位线 `RxDBSync.lastPushedChangeId` 越过已推与被拒变更。

## 7. 推送提交（一次推送的末尾）

```text
各批 mergeChanges ──► 回执覆盖校验（每条源变更恰好一条）── 失败 ──► 整轮失败，不提交
        │
        ▼
被拒实体 → 远端 findByIds（按实体名分组）── 失败 ──► 整轮失败，不提交（下一轮重推，D8 重新判定）
        │
        ▼
本地单事务：
  applied → remoteId
  rejected → rejectedAt / rejection
  被拒实体（无更新的本地待推变更）：远端有 → 覆盖；远端无 → 移除   （executor.mergeChanges(…, true)：不写 RxDBChange，可信写入 remote_sync，登记 #12）
  lastPushedChangeId → 本轮最大本地 id
        │
        ▼
SyncStateHub.reportRejections(...)   （本轮有被拒时）
```

## 8. 框架侧状态

| 类型                  | 字段                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `SyncRejectionReport` | `namespace`、`entity`、`entityId`、`op`、`code`、`reason`、`message`、`dependsOn?` |
| `SyncRejection`       | `SyncRejectionReport` + `at: Date` + `changeIds: readonly number[]`                |
| `SyncState`           | 新增 `lastRejections: readonly SyncRejection[]`，初值 `[]`                         |

见 [contracts/sync-rejections-api.md](contracts/sync-rejections-api.md)。
