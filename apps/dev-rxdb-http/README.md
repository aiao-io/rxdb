# dev-rxdb-http

`@aiao/rxdb-adapter-http` 的浏览器 demo：Angular 前端 + `dev-rxdb-http-server` 参考后端。

用来把三件平时看不见的事**变成能指着看的现象**：网线上真正跑了哪些请求、条件请求有没有命中、
后端连不上时列表还剩下什么。

## 跑起来

需要两个进程，**故意不同源**：

```bash
# 终端 1：参考后端（4301）。首次跑会自己建库写 250 行确定性种子。
pnpm nx run dev-rxdb-http-server:serve

# 终端 2：前端（4300）
pnpm nx serve dev-rxdb-http
```

打开 http://localhost:4300 。想指向别的端口就加查询串：`?api=http://127.0.0.1:9999/v1`。

## 查询串开关

| 参数              | 缺省                       | 作用                               |
| :---------------- | :------------------------- | :--------------------------------- |
| `?api=<url>`      | `http://127.0.0.1:4301/v1` | 指向别的后端，**限回环**，见下     |
| `?changefeed=0`   | 开                         | 开页时**先不**接通变更通知，见下节 |
| `?diagnostics=1`  | 关                         | 装上 ETag 诊断回调（US-215 AC#8）  |
| `?pageMode=token` | `offset`                   | 打到后端，切成 token 翻页          |

`?changefeed=` 只定**开页那一刻**的状态，之后归顶栏上的开关管；其余三个都是开页定死、要改得刷页。

`?api=` 只接受主机为 `127.0.0.1` / `localhost` / `[::1]` 的 http(s) URL，端口和路径随意；
末尾斜杠、查询串与 hash 会被去掉。给别的主机会**直接抛错**而不是退回默认值——
这个值是页面上每一个 `fetch` 的目标前缀，不限制的话一条构造好的链接就能让打开它的人
用自己的浏览器把数据打去别处（CodeQL `js/client-side-request-forgery`）。

## 变更通知（实时同步）

**默认开着。** 页面一起来就对后端开一条 SSE 长连接（`GET /v1/changes`），
任何一端写入 recipe，后端广播一条**只含实体名**的通知，收到的页面据此重跑查询回远端取权威值。

### 看它工作

开两个窗口，都指向 `http://localhost:4300/`：

1. 两边都在筛选框里填同一个关键字、点「应用筛选」，让两页看的是同一份结果集；
2. 在页面 A 改一行的标题并保存；
3. **页面 B 什么都不用点**，一两秒内自己变过来。

「变更通知」面板上四个数说明这一路走到了哪：

| 计数            | 含义                                                                             |
| :-------------- | :------------------------------------------------------------------------------- |
| `收到通知`      | SSE 上收到几条。写入方自己也会收到一条                                           |
| `抑制回声`      | 其中几条是自己发起的（`x-client-id` 对上了）。本地已是最新，不再回远端           |
| `触发重跑`      | core 派发了几次 `REMOTE_ENTITY_INVALIDATED`。收到 5 抑制 0 重跑 0 = 实体名对不上 |
| `fetchMetadata` | 重跑真的落到网线上了几次                                                         |

> **两个无痕窗口不算两个客户端。** Chrome 的多个无痕窗口共用同一个 profile，
> OPFS / IndexedDB / `BroadcastChannel` 都是同一份，看到的更新可能来自 US-009 的跨 tab 同步，
> 与这条通道无关。要验通道请用「一个普通窗口 + 一个无痕窗口」或两个浏览器 profile；
> e2e 用的是两个独立 browser context，同一个道理。

### 关掉看对照

顶栏右上角的「变更通知」滑块是**运行时**开关：拨到关当场断开 SSE，
不刷页、不重建适配器。它常驻在顶栏而不是待在面板里，是因为它随时可能被切，
而面板会被滚走。同样开两个窗口，把页面 B 的开关拨到关再重复上面三步——
B 会**一直**显示旧值，直到它自己点一次「重新查询」。这是没有失效上报口时的原始症状，
US-023 修的就是它。拨回来即当场收敛：重新接通本身就触发一次全量失效（D7），
断开期间漏掉的那些改动在这一下补上。

关着的时候也不发 `x-client-id` 写入头——多一个自定义头会多一次 CORS 预检，
关掉开关就该让网线上的行为逐字回到没有通道的样子。要数请求条数的实验请先关掉它
（写入头是每次请求现读开关状态，不是开页时快照的）。

想开页就是关着的，用 `?changefeed=0`；那个参数只定初值，之后照样归顶栏上的开关管。
判据是「非 `0` 即开」，所以 `?changefeed=true` 这种手敲的写法不会把通道悄悄关掉。

> **默认曾经是关的。** US-023 D11 当初担心 demo 的 `syncStaleTime: 0` 遇上开着的通道
> 会让数请求条数的 e2e 互相串台。翻成默认开之后整套 17 条 e2e 复跑通过：
> 那几条数请求的用例要么在计数窗口内不写入，要么断言的是下界而非精确值。
> 通道确实会放大请求量（一次写入让每个活查询各多跑一趟远端），
> 自己写计数实验时把开关关掉即可。

### 接自己的后端要做两件事

1. 开一个 SSE 端点，写入落库**之后**广播 `data:{"entity":"Recipe","clientId":"<回显请求头>"}`，
   见 [`dev-rxdb-http-server/src/change-feed.ts`](../dev-rxdb-http-server/src/change-feed.ts)；
2. 客户端给适配器配上 `changeFeed: { url: 'changes' }`，并在写入请求上带自己的 `clientId`。

通知里**永远不带行数据**：广播是发给所有订阅者的，而「这一行该不该给这个人看」只有查询路径答得出来。
适配器收到通知只调 `rxdb.invalidateRemoteEntity(entity, namespace)`，权威值一律由重跑时的拉取决定。

### 运行时启停

`changeFeed` 配上就默认接通。要在运行时开关（本 demo 顶栏那个滑块就是这么做的）：

```ts
const adapter = await rxdb.getAdapter('http');

adapter.stopChangeFeed(); // 断开 SSE，并取消待执行的退避重连
adapter.startChangeFeed(); // 重新接通，`onopen` 即触发一次全量失效
adapter.changeFeedEnabled; // 开关的**意图**位，不是「此刻通没通」
```

几处会绊人的地方：

- 没配 `changeFeed` 时两个方法都抛 `HttpUnsupportedOperationError`，不是静默 no-op——
  与 `version()` 未配 `onVersion` 时同一条口径：配置缺失要吵。
- `changeFeedEnabled` 是意图，不是连接状态。网络断了它照样是 `true`，
  重连由适配器自己退避重试；要看「此刻通没通」请用 `changeFeed.onUnavailable` 回调。
- `disconnect()` **不动**这一位：断开是生命周期事件，不是调用方改了主意，
  因此随后的 `connect()` 会按调用方最后一次的选择恢复。手动 `stopChangeFeed()` 掉的通道，
  `connect()` 不会把它悄悄复活。

## 为什么是这些端口

| 端口 | 归属                |
| :--- | :------------------ |
| 4200 | `dev-rxdb-angular`  |
| 4201 | `dev-rxdb-react`    |
| 4202 | `dev-rxdb-vue`      |
| 4203 | `dev-rxdb-supabase` |
| 4300 | **本 demo 前端**    |
| 4301 | **本 demo 后端**    |

4300 / 4301 端口不同即不同源，AC#9～#12 那一组跨源验收全靠这一条。

## serve 上刻意不配 COOP / COEP

这是本 app 唯一一处不抄 `dev-rxdb-angular` 的地方。`Cross-Origin-Embedder-Policy: require-corp`
会把没有显式许可的跨源资源全挡回去，于是「请求失败」既可能是 CORS 没配好、也可能是 COEP 拦的，
而这个 demo 存在的全部意义就是把跨源问题诊断清楚。

代价是 wa-sqlite 用不了 `SharedArrayBuffer`。本 demo 里 wa-sqlite 只当行缓存，
`wa-sqlite-options.ts` 的三条 VFS 路径（OPFS / SharedWorker+IDB / 专用 Worker+IDB）都不需要它。

## 页面上的几块

左边一栏是「按什么」，右边整条是「看到了什么」。

左栏：

- **筛选（五类算子）**：`contains` / `=` / `in` / `between` / `null`，组出来的 `RuleGroup`
  就摊在面板里，与网线上那份一字不差。
- **写入**：`create` / `update` / `delete`。返回的行是后端**读回数据库之后**的完整行——
  `id` 与 `updatedAt` 都是服务端定的，不是把输入原样回声。
- **演示开关**：离线、注入错误码、`Access-Control-Expose-Headers: ETag`、token 翻页。
  这些打到后端的 `__control/*`，只在 `NODE_ENV !== 'production'` 时注册。
- **变更通知（US-023）**：四个计数，见上文。开关本身在顶栏。

右栏是三个页签——**同一次操作的三种视角**，切页签不重新取数，三份内容一直都在
（切换只改 `hidden`），所以来回对照不会把刚攒下的流量记录清掉：

- **Recipe**：查询结果本身，带分页。
- **协议流量（浏览器视角）**：方法 / 路径 / 状态码 / 耗时 / 是否 `304`，按发生顺序。
  `__control/*` 的请求**不进**这张表——它们不是协议的一部分。
  页签内折叠着**后端视角的日志**：多出浏览器发的 `OPTIONS` 预检——预检在 `fetch` 上看不见，
  只能问后端。
- **ETag 诊断（适配器视角）**：条件请求为什么没命中。默认不装诊断回调，
  页签上写着「未启用」；带 `?diagnostics=1` 开页才有内容。

页签条上顺带报数（`Recipe 250 行` / `协议流量 12 条`），所以不用逐个切过去
也知道哪一格刚有动静。键盘上左右 / Home / End 在三个页签之间走，走到即切。

## 值得盯一眼的两个开关

**关掉 ETag 暴露**后再点「重新查询」：一切正常，没有报错、没有日志，只是条件请求
从此一次都不命中——跨源响应默认不把 `ETag` 交给脚本，客户端读到 `null` 就不做条件请求。
这是浏览器 CORS 的既定行为，不是待修的 bug；修法在后端补一个响应头。

**打开离线**后再点「重新查询」：后端直接掐断连接，客户端抛 `NetworkOfflineError`，
`offlineFallback` 落到 wa-sqlite 行缓存，页面进离线态但**仍看得见数据**。
换成「注入 409」则不降级——那是一个成功送达的拒绝，不是连不上。

## 用 DevTools 扩展看本地那一侧

「协议流量」页签上的两张表只讲得清**网线**上的事。行缓存里最后存下了什么、事件流按什么顺序发出来，
得换一件工具：[`apps/rxdb-devtools-extension`](../rxdb-devtools-extension/README.md)。

本 app 已装好 `@aiao/rxdb-devtools` 连接器（`setup_rxdb_http.ts`），**无需任何查询串开关**，
`nx serve` 与 e2e 跑的构建产物两种形态下都在。

```bash
pnpm nx build rxdb-devtools-extension    # 产物在 apps/rxdb-devtools-extension/dist/
```

Chrome 打开 `chrome://extensions` → 开发者模式 → 「加载已解压的扩展程序」选上面那个 `dist/`，
然后在 4300 这一页按 F12，多出来的就是 **RxDB** 面板。

看这个 demo 时值得对着两张表读的是 **Events**：一次「重新查询」在「协议流量」页签上是
`POST recipes/metadata` + `POST recipes/ids`，在 Events 面板上是同一次操作落进 wa-sqlite
行缓存的那几条写入——`304` 命中的那几次，后者一条都不会有。

**Database** 面板查的是行缓存（wa-sqlite），不是后端。它和「离线」开关是一对：
离线态下页面还看得见的那些行，就是这里能查到的那些行。

## 相关

- 协议规范：[`website/docs/adapters/http-protocol.md`](../../website/docs/adapters/http-protocol.md)
- 参考后端：[`apps/dev-rxdb-http-server`](../dev-rxdb-http-server/README.md)
- e2e：[`apps/dev-rxdb-http-e2e`](../dev-rxdb-http-e2e)
