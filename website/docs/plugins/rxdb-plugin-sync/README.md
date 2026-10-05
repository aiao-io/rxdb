# @aiao/rxdb-plugin-sync

> Implements: [US-025 核心插件化外移](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

推拉同步、冲突落地与仓库依赖序。装上它，`rxdb.syncManager` 才存在。

核心 `@aiao/rxdb` 保留的是**原语**：`RxDBSync` 水位表、变更编解码、冲突模型（`ConflictResolution` / `RxDBConflictError`）与同步资格判定。搬进本包的是**消费者**：整库与单仓库两个粒度的 push / pull / sync、冲突落地、依赖拓扑序、过期清理与 QueryCache 出站队列。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
```

`@aiao/rxdb-plugin-history` 不是可选的：本包声明 `inject: ['plugin:history']`。

## 使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

const rxdb = new RxDB({
  dbName: 'notes',
  entities: [Note],
  sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
});

// 传工厂函数本身，不要调用它；两句 use() 的先后随意——宿主按 inject 拓扑排序
rxdb.use(rxDBPluginHistory).use(rxDBPluginSync).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

await rxdb.syncManager.sync();
await rxdb.syncManager.pushRepository('public', 'note');
```

`use()` 必须早于 `connect()`——`connect()` 内部就会调 `init()`。

`connect()` 返回之前本包的 `install()` 一定跑完，这一点比没有 `inject` 的插件更值得留意：声明了依赖的插件**不在** `init()` 里安装，它要等历史插件装好、状态转 `active`，宿主再对齐一趟才轮到它。`rxdb.init()` 之后紧接着读 `rxdb.syncManager` 会读到 `undefined`，那不是缺陷而是时序——`connect()` 是这条链的静止点。

## 主要能力

| 分组     | 入口                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 推拉     | `push()` / `pull()` / `sync()` / `pushRepository()` / `pullRepository()` / `syncRepository()` |
| 批量     | `bulkSync()` / `getRepositoryDependencyGraph()` / `getRepositorySyncOrder()`                  |
| 仓储状态 | `getRepositorySyncStatus()` / `getAllRepositorySyncStatus()` / `checkRepositoryUpdates()`     |
| 分支     | `syncBranches()`                                                                              |
| 计数     | `refreshPullableCount()`                                                                      |
| 清理     | `cleanupExpired()`                                                                            |

水位线是 `RxDBSync.lastPushedChangeId`，push 与 QueryCache 出站共用同一条——两者都在把本地变更送去远端，各记一条水位会让「已推到哪」在同一张表上有两个答案。

## 与历史插件的关系

单向：本包 `inject: ['plugin:history']`，历史包不认识本包。耦合只走一张窄接口（`SyncHistoryBridge`）——一次往返结束时 undo 边界要作废、待拉计数要结算，而那些状态的主人在历史侧。

两件事的生命周期本就不同，所以它们各自成包：撤销重做要在第一条 `rxdb_change` 之前就位（历史插件因此**不**声明任何 `inject`），推拉同步则只在配了远端时才有意义。

## 与 QueryCache 插件的关系

只有 `import type { QueryCacheRemoteAdapter }`，**不产生** `inject` 运行期依赖。装了本包、没装 `@aiao/rxdb-plugin-querycache` 且没有 QueryCache 实体的工作区照常运行。

## 没装插件时

`rxdb.syncManager` **不存在**（读到 `undefined`），核心不给一个什么都不做的空壳。

只装了本包、忘了装历史插件时，本包停在 `waiting` 永远装不上——依赖来源尘埃落定后宿主会点名一次：

```
[RxDB] Plugin 'sync' is not installed: unsatisfied dependencies [plugin:history]
```

`syncState` 面板上的待拉数由本包维护：远端适配器在实时订阅恢复后发 `syncState.requestPullableRefresh()`，本包接住它并调 `refreshPullableCount()`。没装本包，那个读数就是无人维护——这正是实情，不是零。

## 被拒的推送

远端按实体合并后整体落库或整体被拒。被拒的实体不会让整轮推送失败：本地提交照常完成，该实体的全部源变更写上 `rejectedAt` 与 `rejection`、`remoteId` 留空，此后不再重推；本轮有被拒时，本包调一次 `syncState.reportRejections()`。

`SyncState.lastRejections` 是最近一轮有被拒的推送里的 `SyncRejection` 列表，每条带实体（`namespace` / `entity` / `entityId`）、合并后的远端操作 `op`、SQLSTATE `code`、归类 `reason`、远端原始 `message`、提交时刻 `at` 与源变更 `changeIds`：

| `reason`     | 含义                 | 典型 `code` |
| ------------ | -------------------- | ----------- |
| `denied`     | 被 RLS 拒绝          | `42501`     |
| `gone`       | 远端行已不存在       | `RX001`     |
| `dependency` | 依赖的父实体推送失败 | `23503`     |

两条语义：

- **不被后续成功清空**——之后几轮推送全部成功，列表原样保留；
- **下一轮有被拒时整体替换**——不与上一轮合并。

三框架经 `useSyncState().lastRejections` 读取（Angular `Signal`、Vue `ComputedRef`、React 快照字段）。

`lastRejections` 只在内存里，重启即空。跨重启要查被拒的变更，直接查 `RxDBChange` 中 `rejectedAt` 不为空的行：

```ts
import { RxDBChange } from '@aiao/rxdb';

rxdb.entityManager
  .getRepository(RxDBChange)
  .find({
    where: {
      combinator: 'and',
      rules: [{ field: 'rejectedAt', operator: '!=', value: null }]
    }
  })
  .subscribe(changes => {
    for (const change of changes) console.log(change.entity, change.rejection);
  });
```

## 连接纪元

插件声明 `lifecycle: 'scoped'`，三处宿主改动全部登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时逆序释放，宿主不调用 `destroy()`：`SyncManager` 实例本身（`destroy()` 随它撤掉 `connected$` 自动回推订阅与远端事件监听）、`rxdb.syncManager` 槽位、`syncState.bindPullableRefresh()` 跳板。释放走逆拓扑序，本包先于历史插件撤销。

重新 `connect()` 装的是一个全新的管理器，而不是复活上一纪元那个——后者指向的事件总线已经拆了。

## 迁移

从 `syncManager` 直接挂在 core 里的版本升级，见[历史与同步拆包](../../migration/history-sync-plugins.md)。
