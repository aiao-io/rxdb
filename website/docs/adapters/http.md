# HTTP 适配器

`@aiao/rxdb-adapter-http` 让**你自己的 REST API** 充当 QueryCache 的远端事实源：
本地 SQLite 只做行缓存，读写都以远端为准。适合已有一套后端接口、不打算把数据库结构暴露给客户端的场景。

:::warning v1 只支持 `SyncType.QueryCache`
本包**没有** Full / Filter 同步：`pullChanges` / `mergeChanges` / `getChangeCount` 一律抛
`HttpChangelogUnsupportedError`，不会返回空数组或 `0` 假装「远端无变更」。
需要离线写、undo/redo 与冲突解决的实体请改用本地适配器 + Supabase。
:::

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-http
```

无运行时依赖：请求由包内的 transport 用全局 `fetch` 发出。

## 两个槽位各归各位

QueryCache 需要两个适配器，本包只占 **remote** 那一个：

| 槽位     | 谁来做                           | 职责                                                              |
| :------- | :------------------------------- | :---------------------------------------------------------------- |
| `remote` | `@aiao/rxdb-adapter-http`        | `fetchMetadata` / `findByIds` + 可选的 `create`/`update`/`delete` |
| `local`  | 任一 SQLite 适配器（**你注册**） | 行缓存：`getMetadataByIds` / `upsertMany` / `deleteByIds`         |

本包**不持有也不创建**任何本地存储——不 `new` SQLite、不打开 OPFS / IndexedDB。
本地缓存落在哪个库、用什么引擎，完全由你注册的那个适配器决定。
`inject: ['adapter:local']` 的插件（搜索、图查询等）因此绑到你的 SQLite，不会绑到本包。

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Product],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'http' }
  }
});

rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db));
rxdb.adapter('http', db => new RxDBAdapterHttp(db, { baseUrl: 'https://api.example.com', handlers }));
```

## handlers：只做协议映射，不发请求

`handlers` 把 core 的调用翻译成 HTTP 请求描述，再把响应体解析回数据。
**请求由适配器发出**——注入 auth、提取状态码、分类错误、翻页、分块、超时都在包内。
handler 拿不到网络，也就不可能绕过这些担保。

```typescript
import type { HttpHandlers } from '@aiao/rxdb-adapter-http';

const handlers: HttpHandlers = {
  // 必选：只拉 { id, updatedAt } 做新鲜度比较
  onFetchMetadata: {
    request: ctx => ({
      url: `${ctx.entityName}/metadata`,
      method: 'POST',
      body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit }
    }),
    parse: body => body as { id: string; updatedAt: string }[]
  },
  // 必选：按 id 拉完整行
  onFindByIds: {
    request: ctx => ({ url: `${ctx.entityName}/rows`, method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  },
  // 可选：配了才有对应的写入口
  onCreate: { request: ctx => ({ url: ctx.entityName, method: 'POST', body: ctx.data }), parse: body => body },
  onUpdate: {
    request: ctx => ({ url: `${ctx.entityName}/${ctx.id}`, method: 'PATCH', body: ctx.data }),
    parse: body => body
  },
  onDelete: { request: ctx => ({ url: ctx.entityName, method: 'DELETE', body: { ids: ctx.ids } }) }
};
```

`where` 以 **JSON `RuleGroup`** 的形态原样交给你——本包不生成 SQL，服务端怎么翻译由你决定。

:::tip 写 handler 决定写能力
`onCreate` / `onUpdate` / `onDelete` 没配，适配器上就**不存在**对应方法，
`repo.create(...)` 当场 fail-fast（`Remote adapter does not support create`），不会写进本地缓存。
只读接入方不配这三个即可。
:::

### `updatedAt` 必须是 ISO 8601 字符串

`onFetchMetadata.parse` 返回的 `updatedAt` 会被规范化成 UTC + 3 位毫秒（`2026-08-23T10:00:00.000Z`）后交给 core。
带时区偏移或缺毫秒的合法 ISO 串会先 canonicalize；**非法时间串抛 `HttpInvalidMetadataError`**，
不静默放行——新鲜度比较是字典序的，不规范的串会得出反向结论，表现为缓存卡死或无谓重拉。

## 翻页：翻完，或者抛错

`onFetchMetadata.parse` 有两种返回形态，**同一次查询中途不得切换**：

| 形态                   | 终止判据                     | 服务端要求                                              |
| :--------------------- | :--------------------------- | :------------------------------------------------------ |
| `Metadata[]`           | `rows.length < limit` 即末页 | 不得因限流 / 超时 / max-rows 提前返回短页；跨页排序稳定 |
| `{ rows, nextCursor }` | `nextCursor === undefined`   | 游标必须推进                                            |

任一条保证做不到的服务端**必须**用游标形态——短页截断在客户端侧无法检测。

翻不安全时**抛 `HttpPaginationError` 而不是返回半份结果**，`reason` 区分四种成因：
`shape_switch` / `cursor_not_advancing` / `empty_page_limit` / `max_pages`。
返回部分 metadata 会让缺席的 id 被当成「远端已删除」，把还活着的行从本地缓存抹掉。

## 配置项

```typescript
new RxDBAdapterHttp(db, {
  baseUrl: 'https://api.example.com',
  handlers,
  auth: () => ({ Authorization: `Bearer ${getToken()}` }),
  headers: { 'X-App': 'catalog' },
  pageSize: 1000,
  idChunkSize: 100,
  maxEmptyPages: 3,
  maxPages: 1000,
  requestTimeoutMs: 30000
});
```

| 字段               | 默认    | 含义                                          |
| :----------------- | :------ | :-------------------------------------------- |
| `pageSize`         | `1000`  | 单页条数，透传为 handler 的 `ctx.limit`       |
| `idChunkSize`      | `100`   | `findByIds` 单块 id 数                        |
| `maxEmptyPages`    | `3`     | 游标形态下连续空页容忍上限；`0` = 不容忍      |
| `maxPages`         | `1000`  | 单次 `fetchMetadata` 总页数上限，触顶**抛错** |
| `requestTimeoutMs` | `30000` | **单个**请求的超时上限                        |

五个数值都必须是 finite 正整数（`maxEmptyPages` 可为 `0`），否则**构造期**抛 `HttpConfigError` 并带上字段名与实际值。

`auth` 在**每次请求发出前**调用，返回的 header 与 `headers` 冲突时以 `auth` 为准；
`auth` 抛错则请求不发出。

## 错误与离线降级

判别位是**类名**（`instanceof`），`code` 只作辅助。

| 情形                       | 抛出                                   | `isNetworkError` | `offlineFallback` |
| :------------------------- | :------------------------------------- | :--------------- | :---------------- |
| 非 2xx 响应（401/409/…）   | `HttpResponseError`（带数字 `status`） | `false`          | 不降级，原样上抛  |
| 2xx 但响应体不是 JSON      | `HttpInvalidResponseError`             | `false`          | 不降级            |
| 连不上远端（fetch reject） | core 的 `NetworkOfflineError`          | `true`           | 有缓存则降级      |
| 单请求超时                 | core 的 `NetworkOfflineError`          | `true`           | 有缓存则降级      |
| `disconnect()` 主动取消    | `HttpDisconnectedError`                | `false`          | **不降级**        |

传输失败刻意**不**包进本包的错误类：`isNetworkError` 的第一条判据是 `instanceof NetworkOfflineError`，
包起来会让降级静默失效。反过来，业务错误必须带数字 `status`，否则 401 会被 `offlineFallback` 吞成缓存命中。

## 生命周期

| 成员                | 行为                                                                              |
| :------------------ | :-------------------------------------------------------------------------------- |
| `connect()`         | 不建长连接、**不发探测请求**；扫描已注册实体，遇 bigint / binary 字段即 fail-fast |
| `disconnect()`      | 取消进行中的请求（走 error 通道）；**已发出的写请求不回滚**——HTTP 没有事务        |
| `version()`         | 返回**远端服务端**版本，需配 `onVersion`；未配则抛错，不回落到本包版本号          |
| `isTableExisted(E)` | `2xx` → `true`，`404` → `false`，其余状态码与传输失败 → 抛错                      |

### 不支持的字段类型

实体声明 `PropertyType.bigint` 或 `PropertyType.binary` 时，`connect()` 当场抛
`HttpUnsupportedWireTypeError`。本包没有为这两种类型定义 wire codec——`JSON.stringify` 会把
`7n` 弄丢、把 `Uint8Array` 塌成 `{"0":1,…}`。只用本地适配器的 bigint / binary 实体可以与本包同步的实体共存。

### v1 不支持的操作

`getRepository` / `saveMany` / `removeMany` / `mutations` 一律抛 `HttpUnsupportedOperationError`。
这不影响 QueryCache 的批量写——`EntityManager` 判定为 QueryCache 批后走 remote-then-local，
不经过这些成员。同一个库里的 `SyncType.Full` 实体也照旧走它们自己的本地适配器。

## 延伸阅读

- [同步策略 · QueryCache 快速入门](../collaboration/sync.md#querycache-快速入门)——`localCacheFirst`、`offlineFallback`、`syncStaleTime`
- [适配器总览](./README.md)
