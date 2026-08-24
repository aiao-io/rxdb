# @aiao/rxdb-adapter-http

RxDB HTTP 适配器 — 让**你自己的 REST API** 充当 QueryCache 的远端事实源。

作为 RxDB 的 **remote** 适配器使用：本地 SQLite 只做行缓存，读写都以远端为准。
适合已有一套后端接口、不打算把数据库结构暴露给客户端的场景。

> ⚠️ **v1 只支持 `SyncType.QueryCache`。** `pullChanges` / `mergeChanges` / `getChangeCount`
> 一律抛 `HttpChangelogUnsupportedError`，**不会**返回空数组或 `0` 假装「远端无变更」。
> 需要离线写、undo/redo 与冲突解决的实体请改用本地适配器 + Supabase。

## 特性

- ✅ **transport 在包内** — `fetch`、auth 注入、状态码提取、错误分类都由适配器做；handler 只做协议 mapping，拿不到网络
- ✅ **翻页** — 数组（短页终止）与游标（`nextCursor` 终止）两种形态，中途换形态 / 游标不推进 / 连续空页 / 总页数触顶四种退化各自 fail-fast
- ✅ **分块 `findByIds`** — 按 `idChunkSize` 切块并合并；某块失败即整体失败，不当空块吞掉
- ✅ **单次发射契约** — `fetchMetadata` / `findByIds` 都是「拼完再发一次」并 `complete`，逐页/逐块发射会让 core 的 `forkJoin` 只留最后一份
- ✅ **REST 模板工厂** — `createRestHandlers()` 一行替掉样板 handler，模板校验全在**构造期**
- ✅ **错误分类锚定 core** — 传输失败与超时抛 core 的 `NetworkOfflineError`（`offlineFallback` 可降级），HTTP 响应错误带数字 `status`（不降级）
- ✅ **单请求超时** — 默认 30s，超时抛 `NetworkOfflineError` 而非裸 `AbortError`
- ✅ **结构隔离** — 不 `new` 任何本地存储、不实现 `upsertMany` / `deleteByIds` / `rawQuery`

## 何时使用

- 已有 REST / JSON API，想让它接进 RxDB 的响应式查询
- 远端权威、客户端只需要一层结构化行缓存
- 不想把 SQL 或数据库结构暴露给客户端（请求体是 JSON `RuleGroup`，不是 SQL）

不适用：需要离线写、Full / Filter 双向同步、分支与工作树语义 —— 那些请用 Supabase 适配器。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-http
# 行缓存用的本地适配器（按需二选一）
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

> peerDependencies：`@aiao/rxdb`、`rxjs` ^7.8。无运行时依赖，请求走全局 `fetch`。

## 导出

- `RxDBAdapterHttp` — 远程适配器主类
- `ADAPTER_NAME` — 常量 `'http'`
- `createRestHandlers` — REST 资源 URL 模板工厂，产出的是普通 `HttpHandlers`
- `HttpAdapterOptions` / `HttpHandlers` / `HttpRequestSpec` / `HttpNumericConfig` / `HttpAuthHook` 等配置与 handler 类型
- `RestHandlersOptions` / `RestOperation` / `RestOperationTemplate` / `RestPlaceholder` — 模板工厂类型
- `DEFAULT_HTTP_CONFIG` — 五个数值配置的默认值
- 错误类型：`HttpAdapterError`（基类）、`HttpConfigError`、`HttpResponseError`、`HttpInvalidResponseError`、
  `HttpPaginationError`、`HttpInvalidMetadataError`、`HttpHandlerContractError`、`HttpDisconnectedError`、
  `HttpChangelogUnsupportedError`、`HttpUnsupportedWireTypeError`、`HttpUnsupportedOperationError`

> ⚠️ 不存在 `createRxDatabase()` / `createHttpAdapter()` 这类函数，注册方式见下方 `rxdb.adapter()`。

## 快速开始

### 1. 两个槽位各归各位

QueryCache 需要两个适配器，本包只占 **remote** 那一个：

| 槽位     | 谁来做                           | 职责                                                              |
| :------- | :------------------------------- | :---------------------------------------------------------------- |
| `remote` | `@aiao/rxdb-adapter-http`        | `fetchMetadata` / `findByIds` + 可选的 `create`/`update`/`delete` |
| `local`  | 任一 SQLite 适配器（**你注册**） | 行缓存：`getMetadataByIds` / `upsertMany` / `deleteByIds`         |

本包**不持有也不创建**任何本地存储——不 `new` SQLite、不打开 OPFS / IndexedDB。
`inject: ['adapter:local']` 的插件（搜索、图查询等）因此绑到你注册的 SQLite，不会绑到本包。

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
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
rxdb.adapter(
  'http',
  db =>
    new RxDBAdapterHttp(db, {
      baseUrl: 'https://api.example.com/v1',
      handlers: createRestHandlers({ resources: { Product: 'products' } }),
      auth: () => ({ Authorization: `Bearer ${getToken()}` })
    })
);
```

### 2A. REST 模板（推荐起步）

`createRestHandlers()` 把「资源路径 + 固定 body 形状」这份样板收成一个工厂，
产出的仍是普通 `HttpHandlers`——**适配器一行没改**，翻页、分块、发射契约、错误分类全部照旧。

默认模板：

| 操作             | 方法    | 路径               | 默认产出     |
| :--------------- | :------ | :----------------- | :----------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` | 是（不可关） |
| `findByIds`      | `POST`  | `:entity/by-ids`   | 是（不可关） |
| `create`         | `POST`  | `:entity`          | 是           |
| `update`         | `PATCH` | `:entity/:id`      | 是           |
| `delete`         | `POST`  | `:entity/delete`   | 是           |
| `version`        | `GET`   | —                  | 否           |
| `isTableExisted` | `HEAD`  | `:entity`          | 否           |

```typescript
createRestHandlers({
  resources: { Product: 'products' }, // 未列出的实体直接用实体名作路径片段
  templates: {
    version: { path: 'meta/version' }, // 覆盖：给对象
    delete: null // 关闭：只读后端让 repo.delete() fail-fast
  }
});
```

模板校验**在构造期**：路径为空 / 含空白、`?`、`#` / 方法非法 / 占位符集合不匹配 / 关掉必选 handler，
都当场抛 `HttpConfigError`。占位符必须**恰好匹配**——`update` 少 `:id` 会 `PATCH` 整个集合，
任意模板少 `:entity` 会让所有实体共用一个 URL，两种退化在网线上都可能是 2xx，等发出去再看响应码是看不出来的。

> `delete` 默认走 `POST :entity/delete` 而不是 `DELETE :entity` + body：DELETE 的请求体会被不少代理、
> 网关和服务端框架直接丢弃，那样一条「删这 3 行」的请求会以「删整个集合」的面目到达服务端。
> 需要真 `DELETE` 的显式覆盖即可。

### 2B. 手写 handlers

后端形状不规则时手写。handler 只做协议 mapping：给出请求描述、解析响应体，**全程不碰网络**。

```typescript
import type { HttpHandlers } from '@aiao/rxdb-adapter-http';

const handlers: HttpHandlers = {
  onFetchMetadata: {
    request: ctx => ({
      url: `${ctx.entityName}/metadata`,
      method: 'POST',
      body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit }
    }),
    parse: body => body as { id: string; updatedAt: string }[]
  },
  onFindByIds: {
    request: ctx => ({ url: `${ctx.entityName}/rows`, method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  }
};
```

`where` 以 **JSON `RuleGroup`** 的形态原样交给你——本包不生成 SQL，服务端怎么翻译由你决定。
`onCreate` / `onUpdate` / `onDelete` 没配，适配器上就**不存在**对应方法，`repo.create(...)` 当场 fail-fast。

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

| 字段                   | 默认    | 含义                                             |
| :--------------------- | :------ | :----------------------------------------------- |
| `pageSize`             | `1000`  | 单页条数，透传为 handler 的 `ctx.limit`          |
| `idChunkSize`          | `100`   | `findByIds` 单块 id 数                           |
| `maxEmptyPages`        | `3`     | 游标形态下连续空页容忍上限；`0` = 不容忍         |
| `maxPages`             | `1000`  | 单次 `fetchMetadata` 总页数上限，触顶**抛错**    |
| `requestTimeoutMs`     | `30000` | **单个**请求的超时上限                           |
| `conditionalCacheSize` | `256`   | 条件请求响应缓存条目上限，仅在下方开关打开时生效 |

六个数值都必须是 finite 正整数（`maxEmptyPages` 可为 `0`），否则**构造期**抛 `HttpConfigError` 并带上字段名与实际值。
`auth` 在每次请求发出前调用，与 `headers` 冲突时以 `auth` 为准；`auth` 抛错则请求不发出。

### 条件请求（`conditionalRequests`，缺省关闭）

打开后，`fetchMetadata` / `findByIds` 会带上 `If-None-Match` 复用上次 `200` 的解析结果，命中 `304` 时**返回那份结果**——
不是空集（把 304 当空集就是本包全篇在防的假孤儿）。同一请求指纹的并发调用 **single-flight** 去重，
不会出现「后一个拿到 304 而前一个还没回填」的空洞。

```typescript
new RxDBAdapterHttp(db, { baseUrl, handlers, conditionalRequests: true });
```

三条要点：

- **必须显式开启。** 它只在远端真的发 `ETag` 并认 `If-None-Match` 时才有收益，而这一点适配器无从探测。
  关闭时行为与不带此特性的版本**逐字相同**：不发条件头、不去重、304 照旧当错误。
- **缓存的是响应不是行。** 行缓存归 core 经本地适配器落盘，本包不碰。响应缓存按适配器实例存活、
  按 `conditionalCacheSize` 有界（LRU）、`disconnect()` 时清空。翻页 / 分块按**单页 / 单块**各自键控。
- **换用户必须走 `disconnect()` / `connect()`。** auth header 不进请求指纹（否则每次 token 轮换都全量失效，
  等于没有缓存），所以在同一实例上直接换 token 会读到上一个身份的响应。

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
包起来会让降级静默失效。

## 限制

- **bigint / binary 字段**：`connect()` 当场抛 `HttpUnsupportedWireTypeError`——本包没有为这两种类型定义 wire codec
- **`getRepository` / `saveMany` / `removeMany` / `mutations`**：一律抛 `HttpUnsupportedOperationError`；
  QueryCache 的批量写不经过它们（走 core 的 remote-then-local）
- **`rawQuery`、分支成员（`pushBranches` / `branchExists` / `pullBranches`）**：不实现
- **`updatedAt`** 必须是合法 ISO 8601 串；带偏移或缺毫秒的会被 canonicalize 成 UTC + 3 位毫秒，非法串抛 `HttpInvalidMetadataError`

## 文档

- [HTTP 适配器完整文档](https://rxdb.netlify.app/docs/adapters/http)
- [适配器总览](https://rxdb.netlify.app/docs/adapters)

## License

MIT
