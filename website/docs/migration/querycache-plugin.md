# QueryCache 读引擎拆包

`SyncType.QueryCache` 的读引擎从 `@aiao/rxdb` 搬进 `@aiao/rxdb-plugin-querycache`，离线写的**出站队列**同期搬进 `@aiao/rxdb-plugin-sync`。**这是破坏性变更**：用到该同步策略的应用必须装齐三个插件包并注册，否则 `connect()` 会直接抛错。

没有 `SyncType.QueryCache` 实体的应用不受影响，升级即可——core 因此少掉约 1,500 行只有少数应用用得上的读路径。

## 应用开发者

### 1. 装包并注册插件

QueryCache 一条完整的读写路径横跨三个包，缺一不可：

| 能力                | 提供方                     | 说明                                     |
| ------------------- | -------------------------- | ---------------------------------------- |
| QueryCache 读引擎   | `@aiao/rxdb-plugin-querycache` | 回源远端、比对 `updatedAt`、写本地缓存   |
| 离线写出站队列      | `@aiao/rxdb-plugin-sync`       | 读引擎靠它区分「远端没返回」和「本地离线写过」 |
| 同步历史桥          | `@aiao/rxdb-plugin-history`    | sync 插件 `inject: ['plugin:history']`，是它进入 active 的硬前置 |

```bash
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

```diff
 import { RxDB, SyncType } from '@aiao/rxdb';
+import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
+import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
+import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

 const db = new RxDB({ dbName: 'shop', entities: [CachedProduct] });
 db.adapter('sqlite', /* … */).adapter('supabase', /* … */);
+// 注册顺序随意：宿主按 `inject` 拓扑排序，history 一定先于 sync 装完
+db.use(rxDBPluginHistory);
+db.use(rxDBPluginSync);
+db.use(rxDBPluginQueryCache);

 await db.connect('sqlite');
```

`use()` 传的是**插件工厂函数本身**，不要调用它（`db.use(rxDBPluginQueryCache)`，不是 `db.use(rxDBPluginQueryCache())`）。

已经在用推拉同步的应用多半已经装好 history + sync，这一步只需要补 querycache 一个包。从旧版 core 升级的完整同步迁移见[历史与同步拆包](./history-sync-plugins.md)。

实体元数据一个字都不用改：`@Entity({ sync: { type: SyncType.QueryCache, … } })` 照旧——`SyncType` 是闭合联合，枚举值仍在 core。

### 2. 漏装的表现

`connect()` 收尾时连查两个槽：读引擎、出站队列。缺哪个就点名哪个包，抛 `RxDBMissingPluginError`：

```text
Entity 'CachedProduct' declares SyncType.QueryCache but no engine is installed.
Install '@aiao/rxdb-plugin-querycache' and register it via rxdb.use(rxDBPluginQueryCache).
```

只装 querycache、漏了 sync 时，第一道护栏放行，第二道拦下——所以务必三个包一起装。漏了 history 时 sync 插件根本不会安装（依赖未满足，控制台一条告警），出站槽同样是空的。

错误抛在启动时而不是第一次 `find()` 时，**也不会降级成本地读**——降级之后调用方看到的是「远端没有这行数据」，比直接失败难查得多。出站队列这一条更不许当空集：读引擎靠待提交写把「远端没返回」和「本地离线写过」区分开，空集会让每一条离线写都被当成孤儿删掉，静默降级在这里等于丢用户数据。

### 3. 直接实例化 `QueryCacheRepository` 的代码

`QueryCacheRepository` 从 `@aiao/rxdb` 的公开面移除，改名为插件包的 `QueryCacheEngine`：

```diff
-import { QueryCacheRepository } from '@aiao/rxdb';
+import { QueryCacheEngine } from '@aiao/rxdb-plugin-querycache';

-const repo = new QueryCacheRepository('Product', remoteAdapter, localAdapter);
+const repo = new QueryCacheEngine('Product', remoteAdapter, localAdapter);
```

这条入口在[版本与 API 稳定性策略](../versioning.md)里标为实验性，改名不受废弃周期约束。正常用法（经 `entityManager.getRepository()` 拿仓储）不碰这个类。

## 留在 core 的东西

搬走的是**消费者**，不是契约。下列符号仍从 `@aiao/rxdb` 导出，适配器作者与出站写回路径继续用它们，import 路径不用改：

| 符号                                                       | 用途                   |
| ---------------------------------------------------------- | ---------------------- |
| `SyncType.QueryCache`                                      | 实体元数据取值         |
| `QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter`       | 适配器要实现的原语契约 |
| `QueryCacheLocalReader` / `QueryCacheEntity` / `SyncStats` | 同一组契约的配套类型   |
| `QueryCachePendingWriteIds`                                | 出站队列占用查询       |
| `RxDBQueryCacheCapabilityError`                            | 适配器能力不足时的错误 |

注意 `QueryCachePendingWriteIds` 是**契约**，留在 core 的只是这张接口；填它的实现（离线期本地改动重放回远端的那条出站路径）在 `@aiao/rxdb-plugin-sync` 里，core 的 `rxdb.queryCacheOutbox()` 槽由该插件在连接纪元内注册。

## 插件作者 / 适配器作者

core 新增了一个**策略轴运行期槽位**，用来接住读引擎：

```typescript
import type { QueryCacheEngineFactory, QueryCacheSession, QueryCacheSessionContext } from '@aiao/rxdb';

rxdb.queryCacheEngine(factory, scope); // 带纪元作用域注册，断连时随之撤销
rxdb.getQueryCacheEngine(); // 读槽位，未装插件时为 undefined
```

它**不是**注册表：`SyncType` 是闭合联合，这个槽的成员恒为 QueryCache 一个。要新增同步策略仍需改 core，与门面轴的 `RxDBRepositories` 注册表（可由插件扩展）不同。

## 相关

- [编写插件](../plugins/authoring.md)：`install(scope)` 契约与作用域用法
- [历史与同步拆包](./history-sync-plugins.md)：`versionManager` → `syncManager` 的完整对照
- [插件作用域契约迁移](./plugin-scope.md)：本包的注册同样随连接纪元撤销
- [版本与 API 稳定性策略](../versioning.md)：实验性层级与破坏性变更流程
