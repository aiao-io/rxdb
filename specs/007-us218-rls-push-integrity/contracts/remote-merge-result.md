# Contract: `RemoteMergeResult` 与推送提交（阶段 B，破坏性变更，冻结项 F6）

**状态**: 冻结（见 [plan.md](../plan.md)「跨 plan 冻结项」）。

**落点**: `packages/rxdb/src/rxdb-adapter.ts`（类型与远端基类签名）；`packages/rxdb-plugin-sync/src/push-repository.ts`（消费方）；
`packages/rxdb-adapter-supabase`（唯一真实实现）。
**依据**: research D10、D11、D14。

## 1. 类型（`@aiao/rxdb` 导出，均带 TSDoc）

```ts
/** 远端合并一批本地变更后的结果：本批每条源变更恰好一条结果 */
export interface RemoteMergeResult {
  /** 本次远端最大变更 id */
  maxChangeId?: number;
  /** 每条源变更的结果；必须恰好覆盖调用时传入的全部 `changes` */
  results: RemoteChangeResult[];
}

/** 单条源变更的结果 */
export type RemoteChangeResult =
  | { localId: number; status: 'applied'; remoteId: number }
  | { localId: number; status: 'rejected'; rejection: RemoteChangeRejection };

/** 远端拒绝原因 */
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

/** 实体引用 */
export interface RemoteEntityRef {
  namespace: string;
  entity: string;
  entityId: string;
}
```

远端基类：

```ts
abstract mergeChanges(
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
): Promise<RemoteMergeResult>;          // 原为 Promise<RemoteMergeResult | number | void>
```

- `changeIdMapping` 删除。
- 不传 `changes` 时 `results` 为空数组（没有源变更可对应）。
- HTTP 适配器的 `mergeChanges` 仍抛 `HttpChangelogUnsupportedError`，只随签名改返回类型。

## 2. 推送方语义（`push-repository.ts`）

| 情况                                                   | 行为                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `results` 覆盖本批全部源变更，无重复、无多余 `localId` | 继续                                                          |
| 缺项 / 重复 / 多余                                     | 抛错，整轮失败，水位线不推进（AC#14）                         |
| `mergeChanges` 抛错                                    | 按既有重试语义（`throwPushFailure` / `RxDBPartialSyncError`） |
| 全部批次成功                                           | 进入提交（§4）                                                |

- 「源变更」= `createCompactedPushBatch` 的 `sourceChanges`；扇出由远端适配器完成，推送方不再按 `sourceChangesByLocalId` 自行补齐。
- `getChangeIdMapping` 删除；`mapRemoteIds` 改为从 `results` 取 `applied` 项。

## 3. Supabase 适配器的回执构造

对本批每条源变更 `c`：

1. `c.localId` 在 `change_id_mapping` 中 → `{status:'applied', remoteId}`；
2. 否则 `c.localId` 在某个 `status = rejected` 的 `entity_results[i].localIds` 中 → `{status:'rejected', rejection}`，
   `rejection.entity` 取 `c` 的 `namespace` / `entity` / `entityId`；
3. 两者都不在、或同时在 → `SupabaseDataError`（远端回执不一致），整批失败。

`dependsOn` 的（schema、table）按适配器已有的实体元数据反查（namespace、entity）；反查不到时上报 `{constraint}`（若远端给了约束名）
或该（schema.table）组成的约束描述——**推断**元数据可反查，tasks 阶段核实，不可反查时改为远端直接返回 namespace / entity。

## 4. 推送提交

见 [data-model.md](../data-model.md) §7。要点：

- 远端 `findByIds` 在本地事务之外；失败则不提交。
- 一个本地事务：`remoteId`、`rejectedAt` / `rejection`、被拒实体对齐（`upsertMany` / `deleteByIds`，关触发器）、`lastPushedChangeId`。
- 对齐写入经 `declareTrustedWrite(..., { intent: TrustedWriteIntent.remote_sync })`，在 `trusted-write-intent.ts` 登记新调用点。
- 被拒实体若有本批之外的更新本地待推变更，跳过对齐。

## 5. 测试夹具迁移

所有返回 `RemoteMergeResult` 的远端替身改为返回 `results`：

- `rxdb-plugin-sync`：`push-repository.spec.ts`（「远端返回非映射结果时仍推进水位线」改写为「回执缺项时整轮失败、水位线不动」）、
  `push-protocol.spec.ts`、`push-pull-protocol.integration.spec.ts`、`contracts/push-repository.spec.ts`；
- `rxdb-adapter-sqlite-wasm`：`branch-materialization-sync.spec.ts`、`querycache-identity.spec.ts`；
- `rxdb-adapter-supabase`：`transient-write-retry.spec.ts`、`review-regressions.spec.ts`、`pull-push-changes.spec.ts`、
  `filter-sync-snapshots.spec.ts`、`utils.spec.ts`、`repository-sync.spec.ts`。

`sync-override.ts` 是本地适配器夹具，不实现远端 `mergeChanges`，不受影响（plan「偏离与澄清」1）。

## 6. 发布

- API 基线：`requirements/api-baseline/rxdb.json`、`rxdb-adapter-supabase.json` 经 `pnpm audit:api-surface:update` 更新；
  基线只记名称与种类，字段形状变化另由迁移文档说明。
- 迁移文档 `website/docs/migration/supabase-push-receipts.md`：自定义远端适配器如何返回 `results`、`changeIdMapping` 的去向、
  SQL 升级顺序；在 `website/docs/migration/README.md` 与 `website/sidebars.ts` 登记。
