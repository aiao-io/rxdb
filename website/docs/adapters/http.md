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

### REST 模板：不想手抄这份样板

绝大多数 REST 后端的 mapping 长得一模一样：资源路径 + 固定 body 形状。
`createRestHandlers()` 把它收成一个工厂，**产出的仍是普通 `HttpHandlers`**——
适配器一行没改，翻页、分块、单次发射、错误分类全部照旧。

```typescript
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';

rxdb.adapter(
  'http',
  db =>
    new RxDBAdapterHttp(db, {
      baseUrl: 'https://api.example.com/v1',
      handlers: createRestHandlers({
        resources: { Recipe: 'recipes' }, // 未列出的实体直接用实体名作路径片段
        templates: {
          version: { path: 'meta/version' }, // 覆盖：给对象
          delete: null // 关闭：只读后端让 repo.delete() fail-fast
        }
      })
    })
);
// fetchMetadata → POST  https://api.example.com/v1/recipes/metadata
// update        → PATCH https://api.example.com/v1/recipes/{id}
```

| 操作             | 方法    | 默认路径           | 默认产出     |
| :--------------- | :------ | :----------------- | :----------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` | 是（不可关） |
| `findByIds`      | `POST`  | `:entity/by-ids`   | 是（不可关） |
| `create`         | `POST`  | `:entity`          | 是           |
| `update`         | `PATCH` | `:entity/:id`      | 是           |
| `delete`         | `POST`  | `:entity/delete`   | 是           |
| `version`        | `GET`   | —                  | 否           |
| `isTableExisted` | `HEAD`  | —                  | 否           |

请求体形状：`fetchMetadata` 发 `{ where, offset, limit, pageToken }`，`findByIds` 与 `delete` 发 `{ ids }`，
`create` / `update` 直接发调用方给的数据。`version` / `isTableExisted` 默认**不产出**——
`/version` 与探测端点没有公认形状，替你猜一个等于发明一个不存在的端点。这两个操作**没有默认路径**，
不显式配 `templates.version.path` / `templates.isTableExisted.path` 就整个不产出 handler：
`version()` 抛 unsupported，`isTableExisted()` 回落到 `onFetchMetadata` 的 `limit: 1` 探测。
`isTableExisted` 方法栏的 `HEAD` 是**给了路径之后**才生效的默认方法。

:::warning 模板校验在构造期
路径为空 / 含空白、`?`、`#` / 方法非法 / 占位符集合不匹配 / 关掉 `fetchMetadata` 或 `findByIds`，
都当场抛 `HttpConfigError`。占位符必须**恰好匹配**：`update` 少 `:id` 会 `PATCH` 整个集合，
任意模板少 `:entity` 会让所有实体共用一个 URL——两种退化在网线上都可能拿到 2xx，
等发出去再看响应码是看不出来的。
:::

`delete` 默认走 `POST :entity/delete` 而不是 `DELETE :entity` + body：DELETE 的请求体会被不少代理、
网关与服务端框架直接丢弃，那样一条「删这 3 行」的请求会以「`DELETE /recipes`」的面目到达服务端。
需要真 `DELETE` 的显式覆盖 `templates.delete` 即可。

`resources` 的值可以含 `/`（`v1/recipes` 合法）——它来自你的配置，是常量；
而 `:id` 的取值来自远端行，会先 `encodeURIComponent` 再拼进 URL。

### `updatedAt` 必须是 ISO 8601 字符串

`onFetchMetadata.parse` 返回的 `updatedAt` 会被规范化成 UTC + 3 位毫秒（`2026-08-23T10:00:00.000Z`）后交给 core。
带时区偏移或缺毫秒的合法 ISO 串会先 canonicalize；**非法时间串抛 `HttpInvalidMetadataError`**，
不静默放行——新鲜度比较是字典序的，不规范的串会得出反向结论，表现为缓存卡死或无谓重拉。

## 翻页：翻完，或者抛错

`onFetchMetadata.parse` 有两种返回形态，**同一次查询中途不得切换**：

| 形态                      | 终止判据                      | 服务端要求                                              |
| :------------------------ | :---------------------------- | :------------------------------------------------------ |
| `Metadata[]`              | `rows.length < limit` 即末页  | 不得因限流 / 超时 / max-rows 提前返回短页；跨页排序稳定 |
| `{ rows, nextPageToken }` | `nextPageToken === undefined` | token 必须推进                                          |

任一条保证做不到的服务端**必须**用 token 形态——短页截断在客户端侧无法检测。

:::note `pageToken` 是不透明串，不是 `findByCursor` 的游标
适配器只判断它「相等 / 不等 / 是否 `undefined`」，从不解析内部结构。core 的
[`findByCursor`](../model-query/findByCursor.md) 用「游标」指**实体实例**做的 keyset 锚点，那种游标在
Repository 里就被编译成了 `where` 规则组，适配器根本看不到。两者没有关系。
:::

:::warning `request()` 必须把翻页位置编码进 URL 或 body
offset 形态编 `ctx.offset`，token 形态编 `ctx.pageToken`。适配器只按返回的行数与 token 决定要不要继续翻，
**无从检查请求里带没带位置**。漏掉的表现是远端每页都回第一页，翻页一直不推进，
直到 `maxPages` 触顶抛错——而错误信息指向的是页数上限，不是那个漏掉的参数。
:::

翻不安全时**抛 `HttpPaginationError` 而不是返回半份结果**，`reason` 区分四种成因：
`shape_switch` / `page_token_not_advancing` / `empty_page_limit` / `max_pages`。
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
  requestTimeoutMs: 30000,
  conditionalRequests: false,
  conditionalCacheSize: 256
});
```

| 字段                   | 默认    | 含义                                                      |
| :--------------------- | :------ | :-------------------------------------------------------- |
| `pageSize`             | `1000`  | 单页条数，透传为 handler 的 `ctx.limit`                   |
| `idChunkSize`          | `100`   | `findByIds` 单块 id 数                                    |
| `maxEmptyPages`        | `3`     | token 形态下容忍几个连续空页，第 N+1 个抛错；`0` = 不容忍 |
| `maxPages`             | `1000`  | 单次 `fetchMetadata` 总页数上限，触顶**抛错**             |
| `requestTimeoutMs`     | `30000` | **单个**请求的超时上限                                    |
| `conditionalCacheSize` | `256`   | 条件请求响应缓存条目上限，仅在下节的开关打开生效          |

六个数值都必须是 finite 正整数（`maxEmptyPages` 可为 `0`），否则**构造期**抛 `HttpConfigError` 并带上字段名与实际值。

`auth` 在**每次请求发出前**调用，返回的 header 与 `headers` 冲突时以 `auth` 为准；
`auth` 抛错则请求不发出。

## 条件请求：让没变的页不再传一遍

缺省关闭。打开后，`fetchMetadata` / `findByIds` 会记住上一次 `200` 的 `ETag` 与解析结果，
下次同一请求带 `If-None-Match` 去问；远端回 `304` 就直接复用那份结果。

```typescript
new RxDBAdapterHttp(db, { baseUrl, handlers, conditionalRequests: true });
```

**为什么要显式开。** 它只在远端真的发 `ETag` 并认 `If-None-Match` 时才有收益，而适配器无从探测这一点。
关闭时的行为与不带此特性的版本**逐字相同**：不发条件头、不去重并发、`304` 照旧当错误响应抛出。

**304 返回上次的结果，不是空集。** 这条是硬约束：QueryCache 靠 `fetchMetadata` 的 id 集合判断哪些行是孤儿，
把 304 当成「零条」会把还活着的远端行当孤儿删掉。缓存也因此在定义上不会脏——远端一旦认为内容变了就不会回 304。

**缓存的是响应，不是行。** 行缓存归 core 经本地适配器落盘，本包按结构隔离不碰。这份响应缓存：

- 按请求指纹（method + url + body）键控，翻页 / 分块**逐页、逐块**各占一个条目
- 有界，`conditionalCacheSize` 条 LRU；取太小只是命中率下降，不会产生错误结果
- 随适配器实例存活，`disconnect()` 时清空
- 同一指纹的并发调用 **single-flight** 去重，不会出现「后一个拿到 304 而前一个还没回填」的空洞
- 每个调用方拿到的都是**独立副本**：就地改动返回值既不会污染缓存，也不会串到后续 304 命中或同批 single-flight 的其他调用方身上。开与不开这个特性，对象是否共享的答案是同一个

:::warning 换用户要走 `disconnect()` / `connect()`
auth header **不进**请求指纹——否则每次 token 轮换都会让整份缓存失效，等于没开这个特性。
代价是：在同一个适配器实例上直接换 token，可能读到上一个身份的响应。切换用户时重建连接。
:::

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
