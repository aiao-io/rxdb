---
sidebar_position: 2
---

# HTTP QueryCache 协议规范

> 面向**任何语言后端**（Node / Go / Python / Java / …）的对接规范。
> 你不需要理解 RxDB 内部，只要实现下面这组 REST 端点，RxDB 前端就能把你的 API
> 当作 QueryCache 的**远端事实源**。

## 定位

这组协议对应 RxDB 的 `SyncType.QueryCache`：

- **远端（你的后端）是权威事实源**，读写都以你为准；
- 客户端 SQLite 只做**行缓存**，从不保存远端没有的行；
- 查询过滤条件以 **JSON `RuleGroup`** 传输，**不是 SQL**——数据库结构不暴露给客户端。

一个「实体」对应你后端的一张表 / 一个资源；一条记录是一个 JSON 对象，**至少含**：

| 字段        | 类型   | 说明                              |
| :---------- | :----- | :-------------------------------- |
| `id`        | string | 主键，全库唯一                    |
| `createdAt` | string | **ISO 8601** 时间串，记录创建时刻 |
| `updatedAt` | string | **ISO 8601** 时间串，新鲜度依据   |

其余字段由你的实体定义决定，客户端原样收发。

:::warning `createdAt` 是**框架列**，不是业务字段
客户端实体一律继承 `EntityBase`，它声明的 `createdAt` 在本地表上是 `NOT NULL`，
而 QueryCache 的落地不会替你补默认值。行里少了它，这一批**一行都写不进去**。
完整规则（哪些列可省略、为什么不补默认值）见
[同步策略 · 远端行的列契约](../collaboration/sync.md#远端行的列契约)。
:::

## 通用约定

- **URL** = `baseUrl` 前缀 + 相对路径；下文 `:entity` 是该实体的资源路径片段
  （默认取实体名，客户端可配置映射，如 `Recipe → recipes`）。
- **`Content-Type: application/json`**，请求体 / 响应体都是 JSON。
- **认证**：客户端在每次请求前注入 header（`Authorization: Bearer …` 等），后端正常校验即可。
- **时间戳**：所有时间字段都是 ISO 8601 字符串，不是 Unix 时间戳。
- **`id` 含 `/` 或特殊字符时客户端会 `encodeURIComponent`**，后端按标准 URL 解码即可。

## 端点一览

标准模板（客户端 `createRestHandlers()` 的默认形状）一共七个操作，**两个必选、五个可选**：

| 操作             | 方法    | 路径               | 必选 | 请求体                                 | 响应体                                        |
| :--------------- | :------ | :----------------- | :--: | :------------------------------------- | :-------------------------------------------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` |  是  | `{ where, offset, limit, pageToken? }` | `[{id,updatedAt}]` 或 `{rows,nextPageToken?}` |
| `findByIds`      | `POST`  | `:entity/by-ids`   |  是  | `{ ids: string[] }`                    | 完整行数组 `[…]`                              |
| `create`         | `POST`  | `:entity`          |  否  | 完整行数据（带 `id` 就采纳它）         | **写入后的完整行**                            |
| `update`         | `PATCH` | `:entity/:id`      |  否  | 部分字段                               | **更新后的完整行**                            |
| `delete`         | `POST`  | `:entity/delete`   |  否  | `{ ids: string[] }`                    | 任意（响应体被丢弃）                          |
| `version`        | `GET`   | （自定义）         |  否  | —                                      | `"x.y.z"` 或 `{ "version": "x.y.z" }`         |
| `isTableExisted` | `HEAD`  | （自定义）         |  否  | —                                      | 只看状态码（2xx / 404）                       |

写入口没配就不存在：只读后端不实现 `create` / `update` / `delete`，客户端对应方法会**当场拒绝**，
而不是发出一个注定失败的请求。

`version` 与 `isTableExisted` 的路径栏写「自定义」，意思是**默认根本不产出这两个 handler**：
模板里它们没有默认路径，配了 `templates.version.path` / `templates.isTableExisted.path` 之后
上表的 `GET` / `HEAD` 才是生效的默认方法。前五个操作在 REST 里有公认形状，这两个没有，
替接入方猜一个等于发明一个不存在的端点——`HEAD :entity` 打到不支持 HEAD 的集合上会回 `405`，
而 `405` 既不是 2xx 也不是 404，正好落进「抛错」那一支，把一次本可以答上来的探测变成故障。

七个操作之外还有一个可选的**非实体级**端点——[变更通知](#变更通知可选)（SSE）：它不属于任何实体，
一条连接覆盖客户端订阅的全部实体。

---

## 1. fetchMetadata（必选）

拉取一批**元数据**（只做新鲜度比较），返回满足过滤条件的 `{ id, updatedAt }` 列表。

```http
POST /v1/recipes/metadata
Content-Type: application/json

{
  "where": { "combinator": "and", "rules": [
    { "field": "status", "operator": "=", "value": "published" }
  ]},
  "offset": 0,
  "limit": 1000
}
```

### 请求体字段

| 字段        | 类型      | 说明                                                 |
| :---------- | :-------- | :--------------------------------------------------- |
| `where`     | RuleGroup | 过滤条件，结构见下文「RuleGroup」                    |
| `offset`    | number    | 本页起始偏移（正整数，首页为 `0`）                   |
| `limit`     | number    | 本页条数（正整数，来自客户端 `pageSize`，默认 1000） |
| `pageToken` | string?   | token 形态的翻页位置；首页或 offset 形态**缺省**     |

**响应体 —— 两种形态二选一**，客户端按**首页的返回形状**锁定翻页模式：

**形态 A（offset）**：返回一个数组。

```json
[
  { "id": "11111111-1111-4111-8111-111111111111", "updatedAt": "2026-08-01T00:00:00.000Z" },
  { "id": "22222222-2222-4222-8222-222222222222", "updatedAt": "2026-08-02T00:00:00.000Z" }
]
```

**形态 B（token）**：返回一个对象。

```json
{
  "nextPageToken": "eyJvZmZzZXQiOjEwMDB9",
  "rows": [{ "id": "11111111-1111-4111-8111-111111111111", "updatedAt": "2026-08-01T00:00:00.000Z" }]
}
```

### 翻页语义（后端必须遵守）

| 形态 | 末页判定                      | 后端保证                                                                                    |
| :--- | :---------------------------- | :------------------------------------------------------------------------------------------ |
| A    | `rows.length < limit`（短页） | 返回少于 `limit` 条**必须**意味着最后一页；不得因限流 / 超时 / 服务端 max-rows 提前返回短页 |
| B    | `nextPageToken` 缺省          | 每页返回的 token 原样回传给你（不透明），你只需保证「token 相等 → 同一页」                  |

两种形态的**共性保证**：

- **跨页排序稳定**：同一查询内，各页按同一顺序拼接后是完整无重无漏的结果。
- **快照一致**：一次 `fetchMetadata` 的多页请求应基于同一数据快照，避免翻页中途数据变动造成重复 / 遗漏。
- **任一保证做不到 → 用 token 形态**（客户端无法在自身侧检测短页截断）。

> 中途**切换形态**、token 不推进、连续空页、总页数触顶，客户端都会**抛错而非截断返回**——
> 这是刻意设计：宁可失败，也不返回「少了一半」的静默结果。

---

## 2. findByIds（必选）

按 id 批量拉**完整行**。客户端按 `idChunkSize`（默认 100）切块后合并。

```http
POST /v1/recipes/by-ids
Content-Type: application/json

{ "ids": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] }
```

**响应体**：数组，元素是**完整行**——不只是业务字段，还要带齐本地表建成 `NOT NULL`
的每一列，其中包括 `EntityBase` 的 `createdAt` / `updatedAt`。
哪些列可以省略、为什么客户端不替你补，见
[同步策略 · 远端行的列契约](../collaboration/sync.md#远端行的列契约)。

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Pasta",
    "status": "published",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
]
```

同一次请求返回的多行，**键集必须一致**：客户端按第一行的键生成一条批量 INSERT，
后续行缺的键会被绑成 `undefined`（落库即 NULL）。sqlite 系适配器会在落地前拒掉整批。

:::note 缺失 id 是合法的
某块请求里**部分 id 不存在**（远端真的删了）时，返回的数组**少于**请求的 id 数即可，
客户端不会因此重试或补空对象。但**整个块失败**（如某 id 触发错误）应返回非 2xx。
:::

---

## 3. create（可选）

```http
POST /v1/recipes
Content-Type: application/json

{ "title": "Risotto", "status": "draft" }
```

- **请求体**：客户端给的新行数据。**带 `id` 时必须采纳它**（见下方警告），不带才由你生成。
- **响应体**：**写入后的完整行**——口径同 §2，`createdAt` / `updatedAt` 由服务端定型，
  整行必须回传，不能回显入参。

```json
{
  "createdAt": "2026-08-23T12:00:00.000Z",
  "id": "99999999-9999-4999-8999-999999999999",
  "status": "draft",
  "title": "Risotto",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

- **`id` 已存在**：回 `409`，**不要**静默覆盖那条行。正常重放走不到这里——客户端发
  `create` 之前会先 `fetchMetadata` 探一次远端，已有同 `id` 就改发 `update`。

:::warning 客户端给了 `id` 就必须用它
`id` 与时间戳的归属不一样。`updatedAt` 是新鲜度依据，客户端的钟不可信，你必须重新定型；
`id` 只是身份，谁造的无所谓——而**离线新建时只有客户端造得出来**：那一刻网线是断的，
行已经进了本地缓存、被界面引用、也记在出站队列里。等联网重放时你另造一个 `id`，
本地那条就永远对不上远端，成了一条远端从不认识的孤儿行，下一轮元数据拉取会把它当孤儿清掉——
用户离线时写的东西就这么没了。

同一条理由的另一面：**回执必须是持久化后的行，不能回显入参**。若你回显了一份并未真正落库的
行，本地同样会留下一条远端不存在的行。采纳 `id` 说的是「真的用它落库」，不是「原样抄回去」。
:::

## 4. update（可选）

```http
PATCH /v1/recipes/99999999-9999-4999-8999-999999999999
Content-Type: application/json

{ "status": "published" }
```

- **请求体**：部分字段（只含要改的字段）。
- **响应体**：更新后的完整行（同 `create`）——即便本次没改 `createdAt`，也要带上它的**原值**；
  客户端拿这条响应整行覆盖本地缓存，不做字段级合并。

## 5. delete（可选）

```http
POST /v1/recipes/delete
Content-Type: application/json

{ "ids": ["11111111-1111-4111-8111-111111111111"] }
```

:::note 默认用 POST 而非 DELETE + body
批量删除必须把 id 放在 body 里，而 `DELETE` 的请求体会被不少代理 / 网关 / 服务端框架
直接丢弃——那样一条「删这 3 行」会以「删整个集合」的面目到达。客户端默认因此走
`POST :entity/delete` + `{ ids }`。你也可以和客户端约定改用真 `DELETE`，但需显式配置。
:::

## 6. version（可选）

```http
GET /v1/meta/version
```

响应 `200`，body 是版本号**字符串**或 `{ "version": string }` 二选一：

```json
"1.4.2"
```

或

```json
{ "version": "1.4.2" }
```

未实现时客户端对应方法抛「不支持」，**不会**回落到客户端的包版本号。

## 7. isTableExisted（可选）

只有配了 `templates.isTableExisted.path` 才有这个请求，路径与方法都由你给；下面的
`HEAD /v1/recipes` 是把路径配成 `:entity` 之后的样子，不是缺省行为：

```http
HEAD /v1/recipes
```

客户端只按**状态码**判定：

| 状态码          | 结论                                   |
| :-------------- | :------------------------------------- |
| 2xx             | 表存在                                 |
| 404             | 表不存在                               |
| 其他 / 传输失败 | 抛错（「不知道」与「不存在」必须区分） |

未实现时客户端复用 `fetchMetadata` 的 `limit: 1` 探测。

---

## 条件请求（可选）

只作用于两个读端点（`fetchMetadata` / `findByIds`），后端**不实现也完全合规**——客户端缺省
关闭该特性（`conditionalRequests: false`），此时不发条件头，收到 `304` 按非 2xx 抛错。

后端选择实现时，语义如下：

| 方向          | 约定                                                                       |
| :------------ | :------------------------------------------------------------------------- |
| 响应 `2xx` 时 | 带 `ETag` 头，值随响应体内容变化（强弱校验符均可，客户端原样回传、不解析） |
| 客户端下次    | 对**同一请求**（同 URL + 同请求体）带 `If-None-Match: <上次的 ETag>`       |
| 内容未变      | 回 `304`，**不带 body**                                                    |
| 内容已变      | 回 `200` + 完整 body + **新的 `ETag`**                                     |
| 认不出该 ETag | 回 `200` + 完整 body（安全的降级，客户端不会因此出错）                     |

:::warning `304` 的含义是「你手上那份仍然有效」，不是「零条」
客户端收到 `304` 会**还原上次 `200` 的解析结果**，不是当成空集。因此后端必须保证：只要内容
变了就**不得**回 `304`。QueryCache 靠 `fetchMetadata` 的 id 集合判断哪些本地行成了孤儿，一次
错误的 `304` 会让还活着的远端行被当孤儿删掉。
:::

客户端侧的开关、去重与副本语义见[适配器文档的「条件请求」一节](./http.md)。

---

## 变更通知（可选）

上面七个端点全是**客户端问、后端答**：远端的行变了，客户端在下一次查询之前无从得知。这一节让
后端能反过来捅客户端一下——**只捅一下，不递数据**。

后端**不实现也完全合规**。不实现的后果是回到今天的行为：客户端只在自己发起查询时才发现远端
变了，新鲜度由客户端的 `staleTime` 决定。**这不是故障**，只是「别人改的东西，我要等到下次查询
才看得见」。

### 端点

| 项目           | 约定                                                                                         |
| :------------- | :------------------------------------------------------------------------------------------- |
| 方法 / 路径    | `GET`，路径由客户端配置（`changeFeed.url`），**与实体无关**                                  |
| `Content-Type` | `text/event-stream`（[SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)） |
| 其它响应头     | `Cache-Control: no-cache`；经代理时通常还要 `X-Accel-Buffering: no`                          |
| 方向           | 单向，服务端 → 客户端；客户端在这条连接上**不发**任何东西                                    |
| 覆盖面         | 一条连接覆盖该客户端订阅的**全部实体**，不是一个实体一条连接                                 |

### 事件体

用**默认事件类型**推送——即只写 `data:`，**不要**写 `event:` 字段。客户端监听的是 `onmessage`，
带了自定义 `event:` 名的事件它一条都收不到。

```text
data: {"entity":"Recipe","namespace":"public","clientId":"c-9f3a"}

data: {"entity":"Tag"}

```

（每条事件以**空行**结束，这是 SSE 的分帧规则。）

`data:` 是一行 JSON 对象：

| 字段        | 类型   | 必选 | 说明                                                                   |
| :---------- | :----- | :--: | :--------------------------------------------------------------------- |
| `entity`    | string |  是  | **客户端实体名**（如 `Recipe`），不是表名、也不是 URL 里的资源路径片段 |
| `namespace` | string |  否  | 缺省 `"public"`                                                        |
| `clientId`  | string |  否  | 发起这次变更的客户端标识，用于自回声抑制，见下                         |

`entity` 认不出来时客户端**静默忽略**：广播是发给所有订阅者的，其中大多数并不关心你推的这个
实体，把「别人的实体」当成错误只会在正常运行中制造噪音。

:::warning 事件里**不要**带行数据
协议规定通知只搬运一个实体名。原因有两条，都不是性能：一，广播的对象是**所有**订阅者，多租户
后端上推行数据等于把 A 的行发给 B；二，「这一行属不属于某个客户端正挂着的 `where`」只有服务端
答得出，而服务端并不知道客户端挂了哪些查询。客户端收到通知后会自己回来重查——那条路径上有完整的
权限校验和过滤条件。
:::

### `clientId`：让改动的发起方少查一次

写入方自己已经拿到了 `create` / `update` 的响应，它不需要再被通知一次。事件里带上发起方的
`clientId`，客户端认出是自己就跳过。

**这要求后端能把一次写入归因到某个客户端**，而客户端不会自动带上它——需要应用侧把
`rxdb.context.clientId` 通过 `auth` hook 注入到写请求的 header 里，后端再回显进广播。

省略 `clientId` 完全合规，代价是发起方多重取一次；**填错**才有害：填成别人的 id 会让那个客户端
把一次真实变更当成自己的回声丢掉。拿不准就不填。

### 连接成功 = 全量失效（后端不必补发漏掉的事件）

客户端**每次连上**（首次连接与每一次重连一视同仁）都会把所有订阅实体标记为已失效。含义是：

- 断线期间发生的变更**不需要**你补发；
- `Last-Event-ID` / 事件重放**不必**实现，客户端不发这个头；
- `id:` 字段可以不写。

代价是每次重连都会引来一轮重取。因此后端要做的只有一件事：**允许客户端随时重连**，别对同一
来源的频繁重连做惩罚性限流。客户端自己有指数退避（缺省 1s 起、30s 封顶）。

长连接经过代理时容易被空闲超时切断，建议每 15–30 秒发一行注释保活：

```text
:keep-alive

```

### 认证：`EventSource` 带不了 header

浏览器的 `EventSource` **不能设置自定义请求头**，客户端 `auth` hook 注入的
`Authorization` 对这条连接**不生效**（对上面七个端点照常生效）。可用的两条路：

- **Cookie**——客户端配 `withCredentials: true`，浏览器带上同源/跨源 cookie；
- **URL 上带票据**——由应用自己把一次性 token 拼进 `changeFeed.url`（注意 URL 会进日志）。

后端对这条连接的鉴权要按上述两者之一设计，不要指望 `Authorization` 头。

### 跨源

这条连接是 `GET` 且没有自定义头，属于**简单请求**，不会有预检。但它仍需要：

| 场景                     | 必须的响应头                                                                                              |
| :----------------------- | :-------------------------------------------------------------------------------------------------------- |
| 跨源                     | `Access-Control-Allow-Origin`                                                                             |
| 跨源 + `withCredentials` | `Access-Control-Allow-Origin` **回显具体 Origin**（不能是 `*`）+ `Access-Control-Allow-Credentials: true` |

### 端点不存在会怎样

如果客户端配了 `changeFeed` 而你没实现这个端点，连接会失败，然后客户端**按退避一直重试**。
这不会影响任何查询：`EventSource` 不暴露状态码，客户端因此**分不清**「端点没实现」「鉴权失败」
「真断网」三者，所以它不把这条连接的死活翻译成网络错误——不抛 `NetworkOfflineError`、不触发
离线降级，只走一个诊断回调（`changeFeed.onUnavailable`）交给应用去处理。

结论对后端是：**没实现就别让客户端配它**，否则你会看到一个 404 端点被反复叩门；而排查这件事时，
前端那边只有诊断回调里的一行，没有异常。

### 最小实现（`node:http`）

```js
const clients = new Set();

// GET /changes
function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*'
  });
  res.write(':ok\n\n');
  clients.add(res);
  const keepAlive = setInterval(() => res.write(':keep-alive\n\n'), 20000);
  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

// 任何一次写入落库之后调用
function broadcast(entity, clientId) {
  const frame = `data:${JSON.stringify({ entity, clientId })}\n\n`;
  for (const res of clients) {
    res.write(frame);
  }
}
```

客户端侧的开关、诊断回调与重连参数见[适配器文档](./http.md)。

---

## 跨源（CORS）

协议本身与传输无关，这一节里没有一条是「协议要求」。但浏览器前端几乎不可能与 API 同源，
而跨源的默认行为会**静默地**改掉上面几节的可观测结果——所以后端必须显式配好三件事。

### 1. 预检：非简单请求会先发 `OPTIONS`

七个端点里，只有 `version` 的 `GET` 和 `isTableExisted` 的 `HEAD` 可能落在「简单请求」里；
`POST :entity/metadata`、`POST :entity/by-ids`、`POST :entity`、`PATCH :entity/:id`、
`POST :entity/delete` 全都会先发一次 `OPTIONS` 预检。预检**不出现在 `fetch` 的可观测面上**：
浏览器自己发、自己收，脚本既拿不到请求也拿不到响应，失败时前端只看到一个没有细节的
network error。

预检响应必须包含：

| 响应头                         | 值                                                |
| :----------------------------- | :------------------------------------------------ |
| `Access-Control-Allow-Origin`  | 回显 `Origin`（或 `*`）                           |
| `Access-Control-Allow-Methods` | 至少 `GET, HEAD, POST, PATCH, OPTIONS`            |
| `Access-Control-Allow-Headers` | 至少 `content-type, authorization, if-none-match` |

三个请求头**没有一个**在 CORS 安全列表里：安全列表的 `Content-Type` 只放行三种 MIME，
`application/json` 不在其中；`Authorization` 从来不是安全列表头；`If-None-Match` 也不是。
少配任何一个，对应端点在预检阶段就被挡下，请求根本发不出去。

### 2. 错误响应同样要带跨源头

`4xx` / `5xx` 也要走 `Access-Control-Allow-Origin`。少了它，浏览器把一个**成功送达**的
`409` 变成 network error，客户端于是抛 `NetworkOfflineError` 并按离线降级——
[错误语义](#错误语义后端只需知道后果)那张表里「非 2xx 不降级」的约定就被跨源配置悄悄推翻了。

### 3. `ETag` 必须显式暴露，否则条件请求全程静默失效

跨源响应默认只有七个响应头对脚本可见，`ETag` **不在其中**。没有

```http
Access-Control-Expose-Headers: ETag
```

时，客户端读到的 `ETag` 是 `null`——它据此认为「这个响应没有 ETag」，丢掉缓存条目，
下一次请求自然不带 `If-None-Match`，后端于是永远回 `200`。

这一路上**没有任何一处报错**：没有异常、没有告警、控制台一行日志都没有，功能完全正常，
只是条件请求一次都不命中。它表现为带宽白花，而不是故障——因此几乎不可能在联调阶段被发现。
同源部署时这个头可以省，跨源时它是条件请求能否生效的唯一开关。

浏览器端的完整复现见 `apps/dev-rxdb-http`（前端 4300 / 后端 4301，故意不同源）。

---

## RuleGroup JSON 结构

`where` 是一棵递归的过滤树，**叶子是规则、非叶子是组合**：

```json
{
  "combinator": "and", // "and" | "or"
  "rules": [
    { "field": "status", "operator": "=", "value": "published" },
    {
      "combinator": "or",
      "rules": [
        { "field": "price", "operator": "<=", "value": 10 },
        { "field": "tag", "operator": "in", "value": ["sale", "new"] }
      ]
    }
  ]
}
```

**规则形态**（按 `operator` 分五类）：

| `operator`                                                                     | `value` 形态                 | 说明                   |
| :----------------------------------------------------------------------------- | :--------------------------- | :--------------------- |
| `=` `!=` `<` `>` `<=` `>=`                                                     | 标量                         | 相等 / 不等 / 大小比较 |
| `contains` `notContains` `startsWith` `notStartsWith` `endsWith` `notEndsWith` | 字符串                       | 字符串匹配             |
| `null` `notNull`                                                               | **无 `value`**               | 空值判定               |
| `in` `notIn`                                                                   | 数组                         | 集合包含               |
| `between` `notBetween`                                                         | `[min, max]` 二元数组        | 闭区间                 |
| `exists` `notExists`                                                           | **无 `value`**，可选 `where` | 关联存在性（关系查询） |

**翻译指南**：你只需把每个 `field` 映射到列名、每个 `operator` 映射到自己的查询条件、
`and` / `or` 对应 AND / OR。`field` 值是**受信任的列名**（来自客户端实体定义），不是用户输入。

---

## 错误语义（后端只需知道后果）

客户端把响应按状态码与传输结果分类，后端无需返回特定错误格式，但要知道这些后果：

| 场景                                                | 客户端行为                                       |
| :-------------------------------------------------- | :----------------------------------------------- |
| 网络失败 / 超时                                     | 抛 `NetworkOfflineError`（可降级到本地缓存）     |
| 非 2xx 响应                                         | 抛带数字 `status` 的错误（**不降级**，直接失败） |
| metadata 非法（缺 `id`/`updatedAt` 或时间串不合法） | 抛 `HttpInvalidMetadataError`                    |
| 写回执不是对象（`null` / 数组 / 标量）              | 抛 `HttpHandlerContractError`                    |

:::tip 不要用 5xx 掩盖「无数据」
「远端没有这条数据」应该表现为「返回空数组 / 404」，而不是 `500`。用 500 表示业务空态
会让客户端把一次可预期的空结果当成故障。
:::

---

## 端到端示例（curl）

以 `baseUrl = https://api.example.com/v1`、资源 `recipes` 为例：

```bash
# 拉取 status=published 的元数据（offset 形态，第一页）
curl -X POST 'https://api.example.com/v1/recipes/metadata' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "where": { "combinator": "and", "rules": [
      { "field": "status", "operator": "=", "value": "published" }
    ]},
    "offset": 0,
    "limit": 1000
  }'

# 按 id 拉完整行
curl -X POST 'https://api.example.com/v1/recipes/by-ids' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["11111111-1111-4111-8111-111111111111"]}'

# 新建
curl -X POST 'https://api.example.com/v1/recipes' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Risotto","status":"draft"}'

# 更新
curl -X PATCH 'https://api.example.com/v1/recipes/99999999-9999-4999-8999-999999999999' \
  -H 'Content-Type: application/json' \
  -d '{"status":"published"}'

# 批量删除
curl -X POST 'https://api.example.com/v1/recipes/delete' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["11111111-1111-4111-8111-111111111111"]}'
```

## 验收清单

对接完成前，用这份清单自检（每一条对应客户端一侧的硬性契约）：

- [ ] `fetchMetadata` 首页返回形状（数组 or 对象）在整次查询中**保持一致**；
- [ ] offset 形态下，短页只出现在真正的最后一页；
- [ ] token 形态下，`nextPageToken` 逐页推进，末页**缺省**该字段；
- [ ] `metadata` 每条都含合法的 ISO 8601 `updatedAt`；
- [ ] `create` / `update` 返回**持久化后**的完整行（服务端定的 `updatedAt`）；
- [ ] `create` **采纳**请求体里的 `id`（离线新建的行靠它对上远端），撞车回 `409` 而不是覆盖；
- [ ] `findByIds` 对不存在的 id 返回**少于请求数**的行，而不是 `500`；
- [ ] `delete` 用 `POST` 且从 body 读 `ids`（或与客户端显式约定真 `DELETE`）；
- [ ] 若实现了条件请求：内容一旦变化就**不得**再回 `304`（`304` 的含义是「客户端手上那份仍有效」）；
- [ ] 若实现了[变更通知](#变更通知可选)：事件用**默认类型**（只写 `data:`，不写 `event:`），载荷只含实体名**不含行数据**，且不对客户端重连做惩罚性限流（断线期间的事件不必补发）；
- [ ] 若前端跨源：预检放行 `content-type` / `authorization` / `if-none-match`，错误响应也带跨源头，且用 `Access-Control-Expose-Headers: ETag` 把 `ETag` 暴露出去（漏掉最后一条时条件请求会**静默**失效，见[跨源（CORS）](#跨源cors)）。

---

:::note 与 Full / Filter 同步的区别
本协议**只**覆盖 `SyncType.QueryCache`。需要离线写、undo/redo、冲突解决、分支语义的双向
同步（Full / Filter）是另一套更复杂的变更流协议，不在本页范围内。
:::
