# dev-rxdb-http-server

`@aiao/rxdb-adapter-http` 的**参考后端**，也是 [`website/docs/adapters/http-protocol.md`](../../website/docs/adapters/http-protocol.md) 的活靶场：那篇文档「端到端示例」里的 curl，把 baseUrl 换掉之后逐字可跑。

前端 demo 在 [`apps/dev-rxdb-http`](../dev-rxdb-http)，两者**故意不同源**（前端 4300 / 后端 4301），跨源现象才有得看。

## 依赖

后端由 RxDB 引擎驱动：协议端点的读写走 `@aiao/rxdb` 的 `Repository` / `EntityManager`，存储走
`@aiao/rxdb-adapter-pglite`（PostgreSQL 方言、WASM，Node 下主线程直跑），Recipe 的 schema 与查询逻辑
来自共享模块 `@modules/recipes-domain`。`package.json` 声明了这三个 **workspace 依赖**：

| 依赖                        | 用途                                       |
| --------------------------- | ------------------------------------------ |
| `@aiao/rxdb`                | Repository / EntityManager / 实体事件      |
| `@aiao/rxdb-adapter-pglite` | pglite 本地存储（Node `dataDir` 文件落盘） |
| `@modules/recipes-domain`   | Recipe schema + 共享查询函数的单一来源     |

它们都是仓库内 workspace 包，不是外部第三方库。运行时仍是 Node 26 的原生类型剥离直跑；
引入 workspace 依赖后，`serve` 前需先构建这几个包的 `dist`（Nx `dependsOn` 已接好）。
本项目自身**没有 `build` target**，不产出自己的 `dist/`，也不发 npm——它是给人读的示例，不是可发布产物。

> Node 26 是硬前置。`node --version` 低于 26 时类型剥离不可用。

## 起服务

```bash
pnpm nx run dev-rxdb-http-server:serve     # http://127.0.0.1:4301/v1
pnpm nx run dev-rxdb-http-server:seed      # 往现有库写 250 行确定性种子
pnpm nx run dev-rxdb-http-server:reset     # 删数据目录 → 重建空库 → 写种子
```

数据目录默认落在 `apps/dev-rxdb-http-server/.data/pglite`（已 gitignore）。`serve` 发现库是空的会自动补一次种子——空库起服务会得到一个「什么都对、就是没数据」的 demo，比报错更难排查。

### 环境变量

| 变量                         | 默认                | 说明                                         |
| ---------------------------- | ------------------- | -------------------------------------------- |
| `RXDB_HTTP_DEMO_PORT`        | `4301`              | 端口                                         |
| `RXDB_HTTP_DEMO_DB`          | `.data/pglite`      | pglite 数据目录。e2e 用临时目录，**不碰**开发库   |
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

`where` 收 `RuleGroup`，支持 `=` / `in` / `between` / `contains` / `null` 五类。翻译职责回引擎
（`rxdb-adapter-pglite` 生成的参数化 SQL）：字段白名单与非法算子由引擎查询校验拒绝、映射回 `400`；
`value` 全程参数化，不进 SQL 文本。

`contains` 用大小写敏感比较，与 `rxdb-adapter-sqlite-core` 的本地实现逐字一致。QueryCache 下客户端会用同一份 `where` 再过滤一遍本地缓存，两边语义必须逐字对齐，否则会出现「远端给了、本地滤掉」的空列表。

### 认证

`Authorization` 缺省放行；带了但不是 `Bearer <非空>` 回 `401`。这是**假认证**：只校验它存在，不校验它是谁。协议文档里四条 curl 不带这个头，所以不能一律强制。

## `__control/*`

只在 `NODE_ENV !== 'production'` 时注册。双下划线前缀的意思是「照协议实现自己后端的人不用抄这一段」。

| 方法   | 路径                  | body                          | 用途                          | 广播 |
| ------ | --------------------- | ----------------------------- | ----------------------------- | ---- |
| `GET`  | `__control/state`     | —                             | 当前开关快照                  |      |
| `GET`  | `__control/log`       | —                             | 请求日志（含 `OPTIONS` 预检） |      |
| `POST` | `__control/log/clear` | `{}`                          | 清空日志                      |      |
| `POST` | `__control/reset`     | `{}`                          | 删数据目录重建 + 种子         | ✅   |
| `POST` | `__control/clear`     | `{}`                          | 只删行，表结构保留            | ✅   |
| `POST` | `__control/offline`   | `{ offline: boolean }`        | 掐断 socket，模拟断网         |      |
| `POST` | `__control/fault`     | `{ status: number\|null }`    | 强制返回某个非 2xx            |      |
| `POST` | `__control/cors`      | `{ exposeEtag: boolean }`     | 切 `Expose-Headers: ETag`     |      |
| `POST` | `__control/page-mode` | `{ mode: 'offset'\|'token' }` | 切默认翻页形态                |      |

**「广播」那一列的判据是「库里的行变没变」，不是「这条路径属不属于协议」。** `reset` 与 `clear` 改了数据，
因此和七个协议写端点一样发一条[变更通知](../../website/docs/adapters/http-protocol.md#变更通知可选)——
按前一种判据漏掉它们，别的客户端在你清空数据之后会毫无察觉地留着一份已经不存在的列表。
这两条同样认 `x-client-id`：带了就回显进通知，发起方据此丢掉自己的回声。
其余几条只动内存里的开关或日志，广播它们只会让每个订阅者白跑一趟远端查询。

`offline` 是**掐断传输**而不是回 5xx：只有前者才在客户端侧翻译成网络故障，进而触发 `offlineFallback`。回 5xx 是「远端的回答」，照常上抛——AC#13 的对照实验就是这个区别。

## 安全边界（照着抄之前先读这一节）

**这份后端只安全在一件事上：它只监听 `127.0.0.1`。** 其余每一道「像是安全措施」的东西都不是，
逐条写在这里，是因为它们看起来足够真，足以被人当成能抄的样板：

| 看起来是                 | 实际是                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Bearer` 认证            | 只校验请求头**形状**（`/^Bearer .+/`），从不比对值。`DEMO_TOKEN` 在服务端从没被读过，随便一个非空串都放行                               |
| `__control/*` 有开关保护 | 开关只看 `NODE_ENV !== 'production'`，而**控制分支排在认证之前**，`runControl` 自己不鉴权。默认起服务时 `reset`（删数据目录重建）无需任何凭据 |
| CORS 有配置              | 回显任意 `Origin`。它今天安全，唯一的理由是这份服务**永不发** `Access-Control-Allow-Credentials`——一旦补上凭据头，任意站点即可代读      |
| 翻页 token 编了水位线    | 未签名、可伪造。今天只作绑定参数、且没有行级鉴权，因此影响限于重读/跳页                                                                 |

把服务绑到 `0.0.0.0` 或放到反向代理后面，上面四条会立刻变成四个真实漏洞。它是给人读的协议示例，
不是可发布产物（见「不做什么」）。

## 确定性种子

`seed` 写 250 行，**零随机、零 `Date.now()`**：id 由固定字符串派生，`createdAt` / `updatedAt` 从一个写死的基准时刻按行号递增。`reset` 跑两遍，读出的 250 行**逐字节相同**（pglite 是 PostgreSQL 文件格式，文件字节级确定性不在承诺范围）。

前三行的 id 被钉在协议文档示例用的那三个值上，文档里的 `by-ids` / `PATCH` curl 才不会 404。

## 测试

```bash
pnpm nx run-many -t lint typecheck test --projects=dev-rxdb-http-server
```

- `server.spec.ts`：引擎化后端的端点级契约（短页、稳定排序、token 翻页、五算子求值、条件请求、SSE 载荷边界）。每个用例起一份独立临时数据目录、`port: 0` 让内核挑端口，测试之间不抢 4301。

浏览器侧的现象（预检、跨源读不到 ETag、离线降级）在 [`apps/dev-rxdb-http-e2e`](../dev-rxdb-http-e2e) 里验——那些只有真浏览器做得出来。

## 不做什么

- 不是可发布产物，不进 `dist`、不发 npm。
- 不为「以后换 PostgreSQL」预留抽象层。SQL 方言由 `rxdb-adapter-pglite` 生成，换库时换适配器。
- 没有真实身份认证、没有 Full / Filter 同步、没有离线写队列与冲突解决。
- 与 `packages/rxdb-adapter-http/tests/reference-server.ts`（US-213）**不共享代码**。那份服务的是包内测试，这份服务的是浏览器 demo，各自演进。
