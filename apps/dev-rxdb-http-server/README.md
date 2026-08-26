# dev-rxdb-http-server

`@aiao/rxdb-adapter-http` 的**参考后端**，也是 [`website/docs/adapters/http-protocol.md`](../../website/docs/adapters/http-protocol.md) 的活靶场：那篇文档「端到端示例」里的 curl，把 baseUrl 换掉之后逐字可跑。

前端 demo 在 [`apps/dev-rxdb-http`](../dev-rxdb-http)，两者**故意不同源**（前端 4300 / 后端 4301），跨源现象才有得看。

## 零依赖

`package.json` 的 `dependencies` 是空的，并且必须一直是空的。整个后端只用三个内置模块：

| 模块          | 用途                                       |
| ------------- | ------------------------------------------ |
| `node:http`   | 服务本身，含预检与 CORS 头                 |
| `node:sqlite` | `DatabaseSync`，全部语句参数化             |
| `node:crypto` | `randomUUID()` 生成 id、`hash()` 生成 ETag |

源码用 Node 26 的原生类型剥离直接跑，因此本项目**没有 `build` target**，不产出 `dist/`，也不发 npm。它是给人读的示例，不是可发布产物。

> Node 26 是硬前置。`node --version` 低于 26 时 `node:sqlite` 与类型剥离都不可用。

## 起服务

```bash
pnpm nx run dev-rxdb-http-server:serve     # http://127.0.0.1:4301/v1
pnpm nx run dev-rxdb-http-server:seed      # 往现有库写 250 行确定性种子
pnpm nx run dev-rxdb-http-server:reset     # 删库文件 → 重建表 → 写种子
```

库文件默认落在 `apps/dev-rxdb-http-server/.data/demo.sqlite`（已 gitignore）。`serve` 发现库是空的会自动补一次种子——空库起服务会得到一个「什么都对、就是没数据」的 demo，比报错更难排查。

### 环境变量

| 变量                         | 默认                | 说明                                         |
| ---------------------------- | ------------------- | -------------------------------------------- |
| `RXDB_HTTP_DEMO_PORT`        | `4301`              | 端口                                         |
| `RXDB_HTTP_DEMO_DB`          | `.data/demo.sqlite` | 库文件路径。e2e 用临时目录，**不碰**开发库   |
| `RXDB_HTTP_DEMO_EXPOSE_ETAG` | 开（`0` 关）        | 是否回 `Access-Control-Expose-Headers: ETag` |
| `NODE_ENV`                   | —                   | `production` 时不注册 `__control/*`          |

## 端点

全部挂在 `/v1` 下。资源名 `recipes` 对应实体 `Recipe`，字段 `title` / `status` / `price` / `tag` 与协议文档同名。

| 方法    | 路径               | 说明                                               |
| ------- | ------------------ | -------------------------------------------------- |
| `POST`  | `recipes/metadata` | 拉 `{ id, updatedAt }` 列表，带 `where` / 翻页     |
| `POST`  | `recipes/by-ids`   | 按 id 批量取完整行                                 |
| `POST`  | `recipes`          | 创建，回执是**回读数据库后**的完整行               |
| `PATCH` | `recipes/:id`      | 更新，同上                                         |
| `POST`  | `recipes/delete`   | 删除，body `{ ids }`——**不是** `DELETE` 到集合路径 |
| `GET`   | `meta/version`     | 后端版本串                                         |
| `HEAD`  | `recipes`          | 表是否存在                                         |

### 翻页两种形态

- **形态 A（offset）**：默认。body 带 `offset` / `limit`，回一个数组。整除时末页是空页——客户端只能靠短页判断到底。
- **形态 B（token）**：`POST recipes/metadata?pageMode=token`，回 `{ rows, nextPageToken }`。token 里编了一条**读取水位线**，翻页途中别人插入的新行不会挤进来，也不会顶掉后面的行。

`?pageMode=token` 之所以用查询串，是因为 `createRestHandlers()` 的模板在构造期就拒绝 `?`（`UNSAFE_IN_SEGMENT`），前端无法通过模板表达它。前端改用 `POST __control/page-mode` 切换服务端默认形态，不必重建适配器。

### 过滤

`where` 收 `RuleGroup`，支持 `=` / `in` / `between` / `contains` / `null` 五类。**所有 `value` 都走 `?` 占位符**，一次字符串拼接都没有；`field` 必须命中 `config.ts` 的 `RECIPE_COLUMNS` 白名单，命不中回 `400` 且**不进 SQL**。

`contains` 用 `instr` / `substr` 而不是 `LIKE`，因此**大小写敏感**——与 `rxdb-adapter-sqlite-core` 的本地实现一致。QueryCache 下客户端会用同一份 `where` 再过滤一遍本地缓存，两边语义必须逐字对齐，否则会出现「远端给了、本地滤掉」的空列表。

### 认证

`Authorization` 缺省放行；带了但不是 `Bearer <非空>` 回 `401`。这是**假认证**：只校验它存在，不校验它是谁。协议文档里四条 curl 不带这个头，所以不能一律强制。

## `__control/*`

只在 `NODE_ENV !== 'production'` 时注册。双下划线前缀的意思是「照协议实现自己后端的人不用抄这一段」。

| 方法   | 路径                  | body                          | 用途                          |
| ------ | --------------------- | ----------------------------- | ----------------------------- |
| `GET`  | `__control/state`     | —                             | 当前开关快照                  |
| `GET`  | `__control/log`       | —                             | 请求日志（含 `OPTIONS` 预检） |
| `POST` | `__control/log/clear` | `{}`                          | 清空日志                      |
| `POST` | `__control/reset`     | `{}`                          | 删库重建 + 种子               |
| `POST` | `__control/offline`   | `{ offline: boolean }`        | 掐断 socket，模拟断网         |
| `POST` | `__control/fault`     | `{ status: number\|null }`    | 强制返回某个非 2xx            |
| `POST` | `__control/cors`      | `{ exposeEtag: boolean }`     | 切 `Expose-Headers: ETag`     |
| `POST` | `__control/page-mode` | `{ mode: 'offset'\|'token' }` | 切默认翻页形态                |

`offline` 是**掐断传输**而不是回 5xx：只有前者才在客户端侧翻译成网络故障，进而触发 `offlineFallback`。回 5xx 是「远端的回答」，照常上抛——AC#13 的对照实验就是这个区别。

## 确定性种子

`seed` 写 250 行，**零随机、零 `Date.now()`**：id 由固定字符串派生，`updatedAt` 从一个写死的基准时刻按行号递增。`reset seed` 跑两遍，产出的库文件逐字节相同。

前三行的 id 被钉在协议文档示例用的那三个值上，文档里的 `by-ids` / `PATCH` curl 才不会 404。

## 测试

```bash
pnpm nx run-many -t lint typecheck test --projects=dev-rxdb-http-server
```

- `rule-group-to-sql.spec.ts`：`RuleGroup` → 参数化 SQL 的翻译，含白名单拒绝与注入载荷。
- `server.spec.ts`：端点级契约。每个用例起一份独立临时库、`port: 0` 让内核挑端口，测试之间不抢 4301。

浏览器侧的现象（预检、跨源读不到 ETag、离线降级）在 [`apps/dev-rxdb-http-e2e`](../dev-rxdb-http-e2e) 里验——那些只有真浏览器做得出来。

## 不做什么

- 不是可发布产物，不进 `dist`、不发 npm。
- 不为「以后换 PostgreSQL」预留抽象层。方言相关的代码全在 `rule-group-to-sql.ts` 一个文件里，换库时改那一个文件。
- 没有真实身份认证、没有 Full / Filter 同步、没有离线写队列与冲突解决。
- 与 `packages/rxdb-adapter-http/tests/reference-server.ts`（US-213）**不共享代码**。那份服务的是包内测试，这份服务的是浏览器 demo，各自演进。
