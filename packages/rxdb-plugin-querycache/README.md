# @aiao/rxdb-plugin-querycache

> Implements: [US-025 核心插件化外移](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

`SyncType.QueryCache` 的读引擎：按 `where` 回源远端、比对 `updatedAt` 元数据、把结果写进本地可丢弃缓存，并在并发相同查询之间去重。

`SyncType.QueryCache` 这个取值、以及适配器要实现的原语契约（`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` 等）仍在 `@aiao/rxdb`；本包提供的是消费这些原语的那条读路径。用不到该策略的应用不装本包，core 里也就不含这段代码。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

QueryCache 的**写**路径靠 `@aiao/rxdb-plugin-sync` 提供的出站队列，而 sync 插件 `inject: ['plugin:history']`。三个插件包缺任何一个，`connect()` 都会抛 `RxDBMissingPluginError`。

## 使用

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

@Entity({
  name: 'CachedProduct',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedProduct extends EntityBase {
  title!: string;
}

const rxdb = new RxDB({ dbName: 'shop', entities: [CachedProduct] });
rxdb.adapter('sqlite' /* … */).adapter('supabase' /* … */);

// 传工厂函数本身，不要调用它。注册顺序随意，宿主按 `inject` 保证 history 先于 sync
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginQueryCache);

await rxdb.connect('sqlite');
rxdb.init();
```

漏掉任何一个 `use()` 时 `connect()` 抛 `RxDBMissingPluginError`，消息点名是哪个实体声明了 `SyncType.QueryCache`、要装哪个包。`connect()` 连查两个槽——读引擎（本包）与出站队列（sync 插件），所以只装本包同样过不去。它**不会**降级成本地读——降级之后调用方看到的是「远端没有这行数据」，比直接失败难查得多。

## 缓存语义

- **读**：先按 `where` 向远端要一份 `(id, updatedAt)` 元数据，与本地缓存比对后只回源真正变新的行，其余直接用本地副本。
- **去重**：`syncStaleTime`（默认 1000ms）内的相同查询共用同一次回源；配 `0` 关闭这层记忆。
- **`localCacheFirst`**：开启后先发本地副本、回源结果随后补发，用于把首屏等待换成一次内容更新。
- **离线**：远端不可达时读回落到本地缓存，写落本地并进出站队列，由 `@aiao/rxdb-plugin-sync` 的写回路径在恢复后重放。
- **缓存是可丢弃投影**：写缓存与孤儿清理都不进 changelog，与 `SyncType.Full` 的版本化写路径互不相通。同一批 `saveMany()` 里混入两类实体会被拒绝（`RxDBMixedVersionedCacheTransactionError`），请分批。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，唯一的宿主改动——把引擎工厂填进 `rxdb.queryCacheEngine()` 的槽位——登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时随作用域一起撤销，宿主不会调用 `destroy()`。重新 `connect()` 会装回一个全新的工厂，而不是复活上一纪元那个。

## 迁移

从把读引擎打在 core 里的版本升级，见[QueryCache 读引擎拆包](https://rxdb.netlify.app/docs/migration/querycache-plugin)。
