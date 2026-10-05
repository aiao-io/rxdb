# Contract: 被拒变更的框架 API（阶段 B，AC#16）

**落点**: `packages/rxdb/src/sync-state.ts`、`packages/rxdb/src/sync-contract/VersionManager.interface.ts`；
`packages/rxdb-plugin-sync/src/push-repository.ts`；`packages/rxdb-{angular,react,vue}/src/use-sync-state.ts`；三个 demo。
**依据**: research D15、D16。

## 1. 核心类型（`@aiao/rxdb` 导出，均带 TSDoc）

```ts
/** 一个被远端拒绝的实体，推送提交处上报用 */
export interface SyncRejectionReport {
  /** 实体命名空间 */
  namespace: string;
  /** 实体名 */
  entity: string;
  /** 被拒实体的主键 */
  entityId: string;
  /** 合并后的远端操作 */
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  /** 数据库 SQLSTATE */
  code: string;
  /** 归类，同 `RemoteChangeRejection.reason` */
  reason: 'denied' | 'gone' | 'dependency';
  /** 远端原始消息 */
  message: string;
  /** 依赖失败时指向父实体或约束 */
  dependsOn?: RemoteEntityRef | { constraint: string };
}

/** 带发生时刻与源变更的被拒记录 */
export interface SyncRejection extends SyncRejectionReport {
  /** 推送提交时刻 */
  at: Date;
  /** 该实体被一并标为被拒的本地变更 id（`RxDBChange.id`） */
  changeIds: readonly number[];
}

export interface SyncState {
  // …既有字段不变
  /** 最近一轮有被拒的推送产生的被拒列表；不会被后续成功清空，下一轮有被拒时整体替换 */
  lastRejections: readonly SyncRejection[];
}
```

- `INITIAL_STATE.lastRejections = []`（冻结的空数组，引用稳定）；`sameState` 按引用比较该字段。
- `SyncStateHub.reportRejections(rejections: readonly SyncRejection[]): void`：空数组不改状态；非空时整体替换。
- `op` 取远端回执的 `op`（合并后的远端操作），不是单条源变更的类型。

## 2. 上报时机

changelog 推送由 `SyncManager.push` 显式触发（`sync-listeners.ts` 的回推轮只管 QueryCache），所以上报点在
`pushRepository` 的提交事务成功之后：本轮被拒非空 → `sm.rxdb.syncState.reportRejections(...)`。提交失败不上报。

实现定稿（2026-10-05，阶段 B）：

- **一次推送只上报一次**：目标仓库与关联仓库（级联）的被拒先汇总，`pushRepository` 末尾统一调一次 `reportRejections`；
  汇总为空 → 不调用。
- **级联路径先报后抛**：关联仓库已提交、目标仓库随后失败时，已提交部分的被拒照样上报，再抛目标仓库的错误——
  已经落盘的被拒标记不能因为后面失败而对用户不可见。
- 未提交的仓库不贡献被拒条目。

`PushRepositoryResult` 增加必填 `rejected: number`：

- 单位是**压缩后的条目**（与 `pushed`、`failed`、`compacted` 同口径），不是源变更数；不变式
  `originalCount = pushed + failed + rejected + compacted`；
- `pushed` 只数 `applied`；`failed` 语义不变（整批失败）；本轮未提交 → `rejected = 0`；提交前远端 `findByIds` 失败 → `pushed = 0`；
- 关联仓库按各自结果计；
- 必填理由同 `failures`：「字段缺失」与「没有被拒」是两件事。

## 3. 三框架绑定（同名、同语义）

| 框架    | 入口             | 新字段                                                  |
| ------- | ---------------- | ------------------------------------------------------- |
| Angular | `useSyncState()` | `lastRejections: Signal<readonly SyncRejection[]>`      |
| React   | `useSyncState()` | `Readonly<SyncState>` 透传，`lastRejections` 自动出现   |
| Vue     | `useSyncState()` | `lastRejections: ComputedRef<readonly SyncRejection[]>` |

不新增函数。三端 spec 各加一条：hub 上报一份被拒列表 → 绑定读到同一引用；后续成功一轮 → 仍保留；下一轮新被拒 → 替换。

跨重启的完整列表：查询 `RxDBChange` 中 `rejectedAt` 不为空的行（文档示例，不另加 API）。

## 4. Demo（AC#16）

| 应用                                | 展示                                                  | 触发方式                                                          |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/dev-rxdb-supabase`（Angular） | 同步面板列出 `lastRejections`：实体、操作、原因、消息 | e2e-remote：两个上下文，A 删除后 B 修改同一待办 → 面板出现 `gone` |
| `apps/dev-rxdb-react`               | 被拒列表面板，绑定 `useSyncState()`                   | 面板组件 spec 经 hub 渲染共享夹具；e2e 只验空态与 a11y            |
| `apps/dev-rxdb-vue`                 | 同上                                                  | 同上                                                              |

面板的可访问性：列表用语义列表元素，原因文字可读，`a11y` 扫描不新增违规。面板只有「空态 / 有数据」两态：数据是同步快照，无加载态；提交失败不上报，无错误态。

## 5. 发布

- API 基线：`rxdb.json`（`SyncRejectionReport`、`SyncRejection`、`RemoteMergeResult` 相关新类型）、`rxdb-angular.json`、`rxdb-vue.json`
  （`SyncStateResource` 字段）随 `pnpm audit:api-surface:update` 更新。
- 站点：同步状态文档加 `lastRejections` 与跨重启查询示例。
