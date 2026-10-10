# @aiao/rxdb-plugin-querycache

> Implements: [US-025 核心插件化外移](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

`SyncType.QueryCache` 的读引擎：按 `where` 回源远端、比对 `updatedAt` 元数据、把结果写进本地可丢弃缓存，并在并发相同查询之间去重。

`SyncType.QueryCache` 这个取值、以及适配器要实现的原语契约（`QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` 等）仍在 `@aiao/rxdb`；本包提供的是消费这些原语的那条读路径。用不到该策略的应用不装本包，core 里也就不含这段代码。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
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

const rxdb = new RxDB({
  dbName: 'shop',
  entities: [CachedProduct],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
});
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

## 远端契约与失效上报

### 远端行的列契约（US-022）

QueryCache 的拉取落地是**绕开仓储的裸 SQL 写**（`upsertMany`），实体的 `default` 不参与。因此远端返回的每一行必须带齐**本地表的全部非空列**——包括 `EntityBase` 声明的框架列 `createdAt` / `updatedAt`，只带 `id`、`updatedAt` 和业务字段是不够的：

- 缺非空列 → 落地前抛 `RxDBQueryCacheRowContractError`，消息点名实体与缺失列；**这一批一行都不落**，不留半批脏数据（校验在事务之外）。
- 多带本地没有的列不报错（按既有逻辑过滤）；批内异构行集（首行带 `tag`、次行不带）同样被判为缺列。
- 契约对**所有** QueryCache 远端成立（HTTP、Supabase 视图、自研服务都走同一条落地路径），不是 HTTP 专属；不补本地默认值——就地补的 `createdAt` 是本机拉取时刻，两台机器拉同一行会得到不同值。

### PGlite 半边的契约差异（US-024）

两个本地行缓存后端（`rxdb-adapter-sqlite-core` 与 `rxdb-adapter-pglite`）的**判据按各自的建表 DDL 规则各自实现**，错误类各有一份但 `name` 同为 `'RxDBQueryCacheRowContractError'`、消息骨架同形（跨后端识别靠 `name`）。两处故意不同的分歧：

| 情形                                 | SQLite 系                                         | PGlite                                |
| ---                                | ---                                              | ---                                   |
| `uuid` 主键                          | 豁免（DDL 带 `DEFAULT (lower(hex(randomblob(16))))`） | **必填**（`"id" uuid PRIMARY KEY` 无默认值）  |
| 关系列 `SET NULL` 且 `nullable: false` | 豁免（不发 NOT NULL）                                  | **必填**（照发 NOT NULL）                   |
| `integer` 主键                       | 豁免（AUTOINCREMENT）                                | 豁免（`serial` 隐含 `nextval()`，理由不同）      |
| `default: null` 写在非空列上             | 既有误豁免，保持原状                                       | 不算可用默认值，仍必填                           |
| 非空 `binary` 列带字面量 `default`        | 仍必填                                              | 仍必填（两侧 DDL 都对 `binary` 跳过 DEFAULT 子句） |

「必填」判的是**值**不只是键：`{ createdAt: null }` 同样被拒（「带了键但值为空」与「没带这一列」是两栏措辞，修法不同）。关系列的外键三种写法（关系名 / 外键别名 / 物理列名）两侧都认，带 `teamId` 的行不会被误判成缺 `team`。

### 失效上报口与实时同步（US-023）

远端变了要让活查询自己跟上，靠 core 的失效上报口：

```typescript
rxdb.invalidateRemoteEntity('recipe'); // 实体名；namespace 默认 'public'
```

- **粒度是整实体**，按既有 `depEntityTypeMap` / `relationEntityTypes` 扩散到依赖它的关系查询；签名里**没有承载行数据的位置**——通知只说「变了」，不说「变成什么」，权威值由重跑时的 `fetchMetadata` 决定。
- 动作顺序固定：**同步**清掉同步记忆与在飞查询 → 合流（一个微任务窗口）后统一重跑受影响的活查询，同一任务最多重跑一次；记忆认代次，飞行中的同步不会被失效抹掉。
- 未注册的实体名不报错、不做任何事；非 QueryCache 实体上的上报是 no-op；事件不跨 tab 广播。
- 新事件是 `REMOTE_ENTITY_INVALIDATED_EVENT`，不复用 changelog 语义的 `ENTITY_REMOTE_*` 事件。

**实时通道（HTTP 适配器的 `changeFeed`，SSE）缺省关闭**：配了 `changeFeed` 才有一条变更通知连接，服务端只广播实体名，适配器调失效上报口；自回声按 `clientId` 抑制，断线按指数退避重连，**每次连上（含重连）即全量失效**一次（断线期间的变更没有人补发）。不配轮询降级，也不做 `Last-Event-ID` 断线补发——SSE 连不上只报诊断信号，查询路径照常。接入细节与参数见 [HTTP 适配器](../../adapters/http.md)。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，唯一的宿主改动——把引擎工厂填进 `rxdb.queryCacheEngine()` 的槽位——登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时随作用域一起撤销，宿主不会调用 `destroy()`。重新 `connect()` 会装回一个全新的工厂，而不是复活上一纪元那个。

## 迁移

从把读引擎打在 core 里的版本升级，见 [QueryCache 读引擎拆包](../../migration/querycache-plugin.md)。
