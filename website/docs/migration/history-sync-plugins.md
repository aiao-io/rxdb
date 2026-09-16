# 历史与同步拆包

历史 / 撤销重做 / 分支从 `@aiao/rxdb` 搬进 `@aiao/rxdb-plugin-history`，推拉同步搬进 `@aiao/rxdb-plugin-sync`。**这是破坏性变更**：core 不再自动创建 `versionManager`，同步方法也换了挂载点。

只用本地存储、不碰历史与同步的应用不受影响，升级即可。

## 先确认你要装哪几个包

| 你在用的能力                                        | 需要的包                                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| 只有本地读写                                        | 不装插件                                             |
| 撤销重做 / 历史查询 / 分支（`rxdb.versionManager`） | `@aiao/rxdb-plugin-history`                          |
| 推拉同步（`syncRepository` / `push` / `pull` 等）   | `+ @aiao/rxdb-plugin-sync`                           |
| `SyncType.QueryCache` 实体                          | `+ @aiao/rxdb-plugin-querycache`（三个包一起，见下） |

同步插件声明 `inject: ['plugin:history']`：历史插件是它进入 active 的硬前置。**装 sync 必须同时装 history**，只装 sync 时宿主不安装它、只告警一次，`rxdb.syncManager` 这个槽位于是不存在。

## 1. 装包并注册

```bash
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync
```

```diff
 import { RxDB, SyncType } from '@aiao/rxdb';
+import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
+import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

 const rxdb = new RxDB({ dbName: 'my-app', entities: [Todo] , sync: { … } });
 rxdb.adapter('wa-sqlite', /* … */).adapter('supabase', /* … */);
+// 顺序随意：宿主按 `inject` 拓扑排序，历史插件一定先装完
+rxdb.use(rxDBPluginHistory);
+rxdb.use(rxDBPluginSync);

 await rxdb.connect('wa-sqlite');
```

`use()` 传的是**插件工厂函数本身**，不要调用它（`rxdb.use(rxDBPluginSync)`，不是 `rxdb.use(rxDBPluginSync())`）。

## 2. 同步方法换挂载点

同步整体从 `rxdb.versionManager` 搬到 `rxdb.syncManager`：

```diff
-await rxdb.versionManager.syncRepository('public', 'Todo');
-await rxdb.versionManager.push();
-await rxdb.versionManager.pull();
+await rxdb.syncManager.syncRepository('public', 'Todo');
+await rxdb.syncManager.push();
+await rxdb.syncManager.pull();
```

### 搬到 `rxdb.syncManager` 的成员

| 方法                                                      | 用途                     |
| --------------------------------------------------------- | ------------------------ |
| `pull` / `push` / `sync`                                  | 全库推拉                 |
| `pullRepository` / `pushRepository` / `syncRepository`    | 单仓库推拉               |
| `bulkSync`                                                | 按依赖序批量同步         |
| `syncBranches`                                            | 分支表同步               |
| `cleanupExpired`                                          | 清理不再满足 filter 的行 |
| `checkRepositoryUpdates`                                  | 探测远端是否有新变更     |
| `getRepositorySyncStatus` / `getAllRepositorySyncStatus`  | 同步状态查询             |
| `refreshPullableCount`                                    | 重算待拉数               |
| `getRepositoryDependencyGraph` / `getRepositorySyncOrder` | 仓库依赖序               |

### 留在 `rxdb.versionManager` 的成员

| 方法                                             | 用途           |
| ------------------------------------------------ | -------------- |
| `createBranch` / `removeBranch` / `switchBranch` | 分支增删切     |
| `mergeBranch`                                    | 分支合并       |
| `history()`                                      | 历史作用域 API |
| `restoreEntity`                                  | 按历史恢复实体 |
| `resetSessionState`                              | 复位会话态     |

`getLocalRepositories` / `getRemoteRepositories` / `getCurrentBranch` **两边都有**，可以按手头拿到的那个管理器调用，不用为它们改挂载点。

## 3. 槽位的可用时机

两个槽位都由插件在**连接纪元**内 `Object.defineProperty` 挂载，断连时删除：

```ts
const rxdb = new RxDB({ … });
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);

rxdb.versionManager; // ❌ undefined —— 还没 connect()

await rxdb.connect('wa-sqlite');

rxdb.versionManager; // ✅
rxdb.syncManager; // ✅

await rxdb.disconnectAll();

rxdb.syncManager; // ❌ 槽位已删除
```

没装插件时读这两个槽拿到的是 `undefined`，**不是**一个什么都不做的空壳——core 不做 fallback 兜底。

## 4. 漏装的表现

| 症状                                                    | 原因                                         |
| ------------------------------------------------------- | -------------------------------------------- |
| `import` 处类型不存在（`Property 'versionManager' …`）  | 没装 `@aiao/rxdb-plugin-history`             |
| 类型有、运行时 `undefined`                              | 装了包但没 `use()`，或还没 `await connect()` |
| `rxdb.syncManager` 恒为 `undefined`，控制台一条依赖告警 | 装了 sync 但没装 history                     |
| `versionManager.syncRepository is not a function`       | 同步方法已搬到 `syncManager`（见上面对照表） |

## QueryCache 应用要装三个包

声明了 `SyncType.QueryCache` 的实体在 `connect()` 时会连查两个槽：读引擎来自 querycache 插件，**离线写出站队列来自 sync 插件**。所以这类应用需要 history + sync + querycache 三个包齐全，缺哪个都在 `connect()` 抛 `RxDBMissingPluginError`。详见 [QueryCache 读引擎拆包](./querycache-plugin.md)。

## 相关

- [同步策略](../collaboration/sync.md)：`syncManager` 的完整用法
- [分支管理](../collaboration/branch.md)：`versionManager` 的分支 API
- [QueryCache 读引擎拆包](./querycache-plugin.md)
- [插件作用域契约迁移](./plugin-scope.md)：`install(scope)` 契约与纪元撤销
- [版本与 API 稳定性策略](../versioning.md)
