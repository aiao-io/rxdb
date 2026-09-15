# @aiao/rxdb-plugin-history

> Implements: [US-025 核心插件化外移](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

历史、撤销重做、分支与推拉同步的调度层。装上它，`rxdb.versionManager` 才存在。

核心 `@aiao/rxdb` 保留的是**原语**：三张系统表（`RxDBBranch` / `RxDBChange` / `RxDBSync`）、变更编解码、冲突模型、同步资格判定，以及 `getCurrentBranch()`。这些东西并不专属历史子系统——变更日志触发器直接写 `branchId`，`RxDBChange.branch` 会生成真实的 `REFERENCES rxdb$rxdb_branch(id)` 外键，整条响应式增量链路都跑在 `rxdb_change` 上。搬进本包的是**消费者**：读历史、撤销重做、建/切/合/删分支，以及 `push()` / `pull()` 的调度。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-history
```

## 使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

const rxdb = new RxDB({
  dbName: 'notes',
  entities: [Note],
  sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
});

// 传工厂函数本身，不要调用它；必须早于 connect()——connect() 内部就会调 init()
rxdb.use(rxDBPluginHistory).adapter('wa-sqlite' /* … */);

await rxdb.connect('wa-sqlite');

// 撤销重做
await rxdb.versionManager.history().undo();
await rxdb.versionManager.history(Note).redo(2);

// 分支
await rxdb.versionManager.createBranch('feature-a');
await rxdb.versionManager.switchBranch('feature-a');
await rxdb.versionManager.mergeBranch('feature-a');

// 推拉同步
await rxdb.versionManager.push();
await rxdb.versionManager.pull();
```

`use()` 的时机是有意义的：`use()` 在 `init()` 之前调用则插件在 `init()` 时装上，之后调用则立即装上，而 `connect()` 内部会调 `init()`。写在 `connect()` 后面，第一批变更已经错过了历史订阅。

## 主要能力

| 分组     | 入口                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 历史     | `history(scope?)` → `histories$` / `undoHistories$` / `redoHistories$` / `count$` / `undo()` / `redo()` |
| 分支     | `createBranch()` / `switchBranch()` / `mergeBranch()` / `removeBranch()` / `syncBranches()`             |
| 推拉     | `push()` / `pull()` / `sync()` / `pushRepository()` / `pullRepository()` / `syncRepository()`           |
| 计数     | `pushableCount$` / `pullableCount$` / `refreshPullableCount()`                                          |
| 仓储状态 | `getRepositorySyncStatus()` / `getAllRepositorySyncStatus()` / `checkRepositoryUpdates()`               |
| 依赖顺序 | `getRepositoryDependencyGraph()` / `getRepositorySyncOrder()` / `bulkSync()`                            |
| 清理     | `cleanupExpired()` / `restoreEntity()`                                                                  |

`history()` 的作用域按入参解析：无参 = 整库，传实体类 = 该仓储，传实例 = 该行。撤销一个跨作用域事务时抛 `RxDBCrossScopeTransactionError`，而不是只撤一半——半个事务比失败难查得多。

## 没装插件时

`rxdb.versionManager` **不存在**（读到 `undefined`），核心不给一个什么都不做的空壳。这对下游是可见的契约而非退化路径：

- **DevTools**：`DevToolsRxDB.versionManager` 是可选成员，连接器据实报「分支能力不可用」，不会把它谎报成「一个分支都没有」。
- **同步状态枢纽**：`SyncStateHub` 留在核心，但可推送计数由本插件经 `bindPushableCount()` 接上；远端适配器发出的 `requestPullableRefresh()` 也由本插件接住。没装插件，那两个读数就是无人维护——这正是实情。
- **类型**：`versionManager` 由本包的 `declare module '@aiao/rxdb'` 声明。只消费、不负责安装的模块（框架组件、共享 UI）应写 `import type {} from '@aiao/rxdb-plugin-history';`——它把类型声明拉进编译单元，同时在 emit 时整句擦除，不产生运行时依赖。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，四处宿主改动全部登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时逆序释放，宿主不调用 `destroy()`：`VersionManager` 实例本身（连同 `destroy()`）、`rxdb.versionManager` 槽位、`syncState.bindPushableCount()` 订阅、`syncState.bindPullableRefresh()` 跳板。重新 `connect()` 装的是一个全新的管理器，而不是复活上一纪元那个——后者指向的事件总线已经拆了。

插件**不声明 `inject`**：`VersionManager.init()` 只挂监听与订阅，一条适配器读写都不发。声明 `adapter:local` 会把安装推到引导链之后，而分支流必须在第一条 `rxdb_change` 事件到达之前就订阅上。
