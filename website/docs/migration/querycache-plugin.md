# QueryCache 读引擎拆包

`SyncType.QueryCache` 的读引擎从 `@aiao/rxdb` 搬进 `@aiao/rxdb-plugin-querycache`。**这是破坏性变更**：用到该同步策略的应用必须多装一个包并注册插件，否则 `connect()` 会直接抛错。

没有 `SyncType.QueryCache` 实体的应用不受影响，升级即可——core 因此少掉约 1,500 行只有少数应用用得上的读路径。

## 应用开发者

### 1. 装包并注册插件

```bash
pnpm add @aiao/rxdb-plugin-querycache
```

```diff
 import { RxDB, SyncType } from '@aiao/rxdb';
+import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

 const db = new RxDB({ dbName: 'shop', entities: [CachedProduct] });
 db.adapter('sqlite', /* … */).adapter('supabase', /* … */);
+db.use(rxDBPluginQueryCache);

 await db.connect('sqlite');
```

`use()` 传的是**插件工厂函数本身**，不要调用它（`db.use(rxDBPluginQueryCache)`，不是 `db.use(rxDBPluginQueryCache())`）。

实体元数据一个字都不用改：`@Entity({ sync: { type: SyncType.QueryCache, … } })` 照旧——`SyncType` 是闭合联合，枚举值仍在 core。

### 2. 漏装的表现

漏掉 `use()` 时 `connect()` 抛 `RxDBMissingPluginError`，消息点名具体实体：

```text
Entity 'CachedProduct' declares SyncType.QueryCache but no engine is installed.
Install '@aiao/rxdb-plugin-querycache' and register it via rxdb.use(rxDBPluginQueryCache).
```

错误抛在启动时而不是第一次 `find()` 时，**也不会降级成本地读**——降级之后调用方看到的是「远端没有这行数据」，比直接失败难查得多。

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

写回出站（离线期本地改动重放回远端）整条路径同样留在 core，本次未改动。

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
- [插件作用域契约迁移](./plugin-scope.md)：本包的注册同样随连接纪元撤销
- [版本与 API 稳定性策略](../versioning.md)：实验性层级与破坏性变更流程
