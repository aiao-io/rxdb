# Supabase 推送回执迁移

`rxdb_mutations` 的推送路径从「整批成功或整批失败」改为**逐实体回执**：一批推送里的某一条被行级权限拒绝（或目标行已不存在、依赖的父实体被拒），不再拖垮同一批里其它能成功的变更。这是一次**破坏性变更**：远端合并结果的契约 `RemoteMergeResult` 改了形状，自定义远端适配器作者必须跟着改；只用 `@aiao/rxdb-adapter-supabase` 的开发者不用改业务代码，但要先升级参考 SQL 再升级客户端依赖，并了解被拒变更的新语义。

## 影响范围

| 你是谁                                                     | 要做什么                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 实现了 `RxDBAdapterRemoteBase.mergeChanges` 的自定义适配器 | 必须改：返回值形状变了（见下节），否则编译不过                           |
| 只用 `@aiao/rxdb-adapter-supabase`                         | 不用改业务代码；升级前先跑新版参考 SQL；了解 `lastRejections` 新语义即可 |

## `mergeChanges` 返回值变了（自定义远端适配器作者）

`RemoteMergeResult` 的 `changeIdMapping`（可选）被 `results`（必填）取代，`mergeChanges` 的返回类型也从联合类型收紧为单一类型：

**变更前**

```ts
export interface RemoteMergeResult {
  maxChangeId?: number;
  changeIdMapping?: Array<{ localId: number; remoteId: number }>;
}

abstract mergeChanges(
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
): Promise<RemoteMergeResult | number | void>;
```

**变更后**

```ts
export interface RemoteMergeResult {
  /** 本次远端最大变更 id */
  maxChangeId?: number;
  /** 每条源变更的结果；必须恰好覆盖调用时传入的全部 `changes` */
  results: RemoteChangeResult[];
}

export type RemoteChangeResult =
  | { localId: number; status: 'applied'; remoteId: number }
  | { localId: number; status: 'rejected'; rejection: RemoteChangeRejection };

export interface RemoteChangeRejection {
  /** 数据库 SQLSTATE，例如 `42501` */
  code: string;
  /** 归类：权限拒绝 / 目标行已不存在 / 依赖的实体不可用 */
  reason: 'denied' | 'gone' | 'dependency';
  /** 远端原始消息 */
  message: string;
  /** 被拒的实体 */
  entity: RemoteEntityRef;
  /** `reason = 'dependency'` 时指向父实体；无法定位时给出约束名 */
  dependsOn?: RemoteEntityRef | { constraint: string };
}

abstract mergeChanges(
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
): Promise<RemoteMergeResult>;
```

`RemoteEntityRef`（`{ namespace, entity, entityId }`）形状不变。

迁移要点：

- `changeIdMapping` 删除；改成 `results`，且从「可省」变成**必填**——过去远端什么都不回传时调用方按「无映射」兜底放行，现在空值本身就是契约违反。
- `results` 必须恰好覆盖调用时传入的 `changes` 参数：**每条源变更（`IRxDBChange`）出现恰好一次**，要么 `status: 'applied'` 带 `remoteId`，要么 `status: 'rejected'` 带 `rejection`。不传 `changes` 时返回空数组。
- 返回类型从 `RemoteMergeResult | number | void` 收紧为单一的 `Promise<RemoteMergeResult>`——旧代码里「返回一个数字当 `maxChangeId`」或「什么都不返回」的写法不再通过类型检查。

### 推送仓库现在会校验 `results`

`@aiao/rxdb-plugin-sync` 的推送仓库不再信任远端「什么都不说」：它对 `results` 做覆盖检查，三种情况都会让整轮推送失败、水位线不推进：

- **缺失**：`changes` 里某条源变更的 `localId` 没出现在 `results` 里；
- **重复**：同一个 `localId` 出现了不止一次；
- **未知**：`results` 里出现了调用时没传入的 `localId`。

自定义适配器如果过去依赖「只回传部分映射、其余按远端 id 等于本地 id 处理」之类的隐式兜底，升级后会在推送时直接抛错，而不是静默产生错误的 `remoteId`。

## `PushRepositoryResult` 新增必填字段 `rejected`

推送仓库结果新增必填字段 `rejected: number`（本轮被拒的源变更数），与既有的 `pushed` 配合读：`pushed` 现在只数 `status: 'applied'` 的变更，不再把被拒的也算进去。和 `failures` 一样设计成必填而非可选——「字段缺失」和「没有被拒」是两件不同的事，可选字段会让调用方不得不写 `result.rejected ?? 0` 猜测缺省含义。

## 被拒变更的本地语义

一条源变更被远端拒绝后，本地的处理方式是**持久标记为终态，不再重推**，而不是像以前的整批失败那样留在待推队列里反复重试：

- 本地 `RxDBChange` 新增两列：`rejectedAt`（拒绝时刻）与 `rejection`（拒绝原因，形状同 `RemoteChangeRejection`）。两者与 `remoteId` 互斥——一条变更至多其一非空。
- 「待推」判据从「`remoteId = null`」改为「`remoteId = null AND rejectedAt = null`」：被拒变更不会再被下一轮推送取到，也不会让待推计数、过期清理之类的查询永远卡住。
- 推送提交时，被拒**实体**（不是单条变更，是该实体本批全部被拒的源变更一起）会被对齐为远端当前值：远端还有这行就整行覆盖为远端值，远端已经没有就把本地那行删掉；对齐不产生新的本地变更、不进撤销栈。
- 被拒不是永久的：下一次有新的本地修改经过正常推送流程重新判定，远端权限或数据变化后完全可能变为 `applied`。

框架侧经 `SyncState.lastRejections` 读取最近一轮的被拒列表（三框架 `useSyncState()` 对称暴露），完整字段、语义与跨重启查询示例见 [`@aiao/rxdb-plugin-sync` 的「被拒的推送」](../plugins/rxdb-plugin-sync/README.md#被拒的推送)，这里不重复。

## 系统模式 6 → 7

`RXDB_SYSTEM_SCHEMA_VERSION` 从 6 升到 7，对应的正是上一节那两个新列：`RxDBChange` 补 `rejectedAt`（可空时间戳）与 `rejection`（可空 JSON）。两个本地适配器的 `migrateSystemSchema()` 都按「列不存在才 `ADD COLUMN`」的幂等写法补列，旧行不回填两列（保持 `null`）。这一步在 `connect()` 时自动跑，不需要手工迁移脚本；唯一要注意的是**不要跳过小版本连续升级**——如果中间直接从更早的系统模式版本升级，`migrateSystemSchema()` 仍会按顺序把中间的几次结构变更一并补齐。

## 升级顺序：先 SQL，再客户端

这次改动同时动了参考 SQL 与客户端，**必须先执行新版 SQL，再升级客户端依赖**：

1. 在 Supabase 数据库执行新版 `docker/sql/04-rxdb-utils-functions.sql`。`rxdb_mutations` 从 5 参签名换成 6 参签名，新增的第 6 个参数 `p_receipts boolean DEFAULT false` 带默认值，旧客户端按名匹配到前 5 个参数，行为不变。
2. 升级客户端依赖 `@aiao/rxdb-adapter-supabase`（连带 `@aiao/rxdb`、`@aiao/rxdb-plugin-sync`，若要读 `lastRejections` 还要升级对应框架绑定包）。

反过来做（先升级客户端）会在推送时直接报错，见下节。

## 新旧版本组合

| 客户端              | 远端 SQL                    | 结果                                                                                                                  |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 旧（US-220 及更早） | 旧（5 参，无 `p_receipts`） | 变更前的整批语义，不受影响                                                                                            |
| 旧（US-220 及更早） | 新（6 参）                  | 不传 `p_receipts`，取默认值 `false`：仍按整批语义工作——全有或全无，被拒以 `42501` / `RX001` / `RX002` 整批抛出        |
| 新（本迁移之后）    | 旧（5 参）                  | PostgREST 找不到带 `p_receipts` 的函数签名 → `PGRST202` → `SupabaseDataError`；推送失败，水位线不推进，本地变更仍待推 |
| 新（本迁移之后）    | 新（6 参）                  | 本文描述的逐实体回执语义                                                                                              |

任何组合都不会「部分成功却不告知客户端」——旧 SQL 配新客户端不会静默丢失被拒信息，它直接让整次推送失败并报出可识别的错误。

## 新客户端连旧 SQL 的报错特征

推送抛 `SupabaseDataError`，`code` 为 `PGRST202`，消息形如：

```
Failed to merge changes: Could not find the function public.rxdb_mutations(p_changes, p_deletes, p_receipts, p_skip_sync, p_updates, p_upserts) in the schema cache
```

对应的 HTTP 响应是 404。推送水位线不推进，本地变更不会丢失；执行新版 SQL 后无需任何客户端操作，下一次推送会把积压的变更一并推上去。

## 参考

- [Supabase 适配器](../adapters/supabase.md)
- [`@aiao/rxdb-plugin-sync` · 被拒的推送](../plugins/rxdb-plugin-sync/README.md#被拒的推送)
- [Supabase 修改推送语义迁移](./supabase-update-push.md)：上一次改动 `rxdb_mutations` 签名时走的同一套「先 SQL 后客户端」升级顺序
