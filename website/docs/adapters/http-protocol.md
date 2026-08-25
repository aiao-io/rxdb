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

| 字段        | 类型   | 说明                            |
| :---------- | :----- | :------------------------------ |
| `id`        | string | 主键，全库唯一                  |
| `updatedAt` | string | **ISO 8601** 时间串，新鲜度依据 |

其余字段由你的实体定义决定，客户端原样收发。

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
| `create`         | `POST`  | `:entity`          |  否  | 完整行数据（无 `id` 或由你生成）       | **写入后的完整行**                            |
| `update`         | `PATCH` | `:entity/:id`      |  否  | 部分字段                               | **更新后的完整行**                            |
| `delete`         | `POST`  | `:entity/delete`   |  否  | `{ ids: string[] }`                    | 任意（响应体被丢弃）                          |
| `version`        | `GET`   | （自定义）         |  否  | —                                      | `"x.y.z"` 或 `{ "version": "x.y.z" }`         |
| `isTableExisted` | `HEAD`  | `:entity`          |  否  | —                                      | 只看状态码（2xx / 404）                       |

写入口没配就不存在：只读后端不实现 `create` / `update` / `delete`，客户端对应方法会**当场拒绝**，
而不是发出一个注定失败的请求。

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

**响应体**：数组，元素是**完整行**（含 `id`、`updatedAt` 及全部业务字段）。

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Pasta",
    "status": "published",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
]
```

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

- **请求体**：客户端给的新行数据（可能不含 `id`，由你生成）。
- **响应体**：**写入后的完整行**——`id`、`updatedAt` 由服务端决定，必须回传，不能回显入参。

```json
{
  "id": "99999999-9999-4999-8999-999999999999",
  "status": "draft",
  "title": "Risotto",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

:::warning 必须返回持久化后的行，不能回显入参
客户端把响应当作权威行写入本地缓存。若你回显了客户端没给的 `id` 空缺，本地会留下一条
远端从不存在的行。`id` 与时间戳一律由服务端定型。
:::

## 4. update（可选）

```http
PATCH /v1/recipes/99999999-9999-4999-8999-999999999999
Content-Type: application/json

{ "status": "published" }
```

- **请求体**：部分字段（只含要改的字段）。
- **响应体**：更新后的完整行（同 `create`）。

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
- [ ] `create` / `update` 返回**持久化后**的完整行（服务端定的 `id` / `updatedAt`）；
- [ ] `findByIds` 对不存在的 id 返回**少于请求数**的行，而不是 `500`；
- [ ] `delete` 用 `POST` 且从 body 读 `ids`（或与客户端显式约定真 `DELETE`）；
- [ ] 若实现了条件请求：内容一旦变化就**不得**再回 `304`（`304` 的含义是「客户端手上那份仍有效」）。

---

:::note 与 Full / Filter 同步的区别
本协议**只**覆盖 `SyncType.QueryCache`。需要离线写、undo/redo、冲突解决、分支语义的双向
同步（Full / Filter）是另一套更复杂的变更流协议，不在本页范围内。
:::
