# dev-rxdb-http

`@aiao/rxdb-adapter-http` 的浏览器端到端 demo：Angular 前端 + `dev-rxdb-http-server` 参考后端。

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

打开 http://localhost:4300 。想指向别的后端就加查询串：`?api=http://127.0.0.1:9999/v1`。

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

- **筛选（五类算子）**：`contains` / `=` / `in` / `between` / `null`，组出来的 `RuleGroup`
  就摊在面板里，与网线上那份一字不差。
- **写入**：`create` / `update` / `delete`。返回的行是后端**读回数据库之后**的完整行——
  `id` 与 `updatedAt` 都是服务端定的，不是把输入原样回声。
- **协议流量（浏览器视角）**：方法 / 路径 / 状态码 / 耗时 / 是否 `304`，按发生顺序。
  `__control/*` 的请求**不进**这张表——它们不是协议的一部分。
- **后端视角的日志**：多出浏览器发的 `OPTIONS` 预检。预检在 `fetch` 上看不见，只能问后端。
- **演示开关**：离线、注入错误码、`Access-Control-Expose-Headers: ETag`、token 翻页。
  这些打到后端的 `__control/*`，只在 `NODE_ENV !== 'production'` 时注册。

## 值得盯一眼的两个开关

**关掉 ETag 暴露**后再点「重新查询」：一切正常，没有报错、没有日志，只是条件请求
从此一次都不命中——跨源响应默认不把 `ETag` 交给脚本，客户端读到 `null` 就不做条件请求。
这是浏览器 CORS 的既定行为，不是待修的 bug；修法在后端补一个响应头。

**打开离线**后再点「重新查询」：后端直接掐断连接，客户端抛 `NetworkOfflineError`，
`offlineFallback` 落到 wa-sqlite 行缓存，页面进离线态但**仍看得见数据**。
换成「注入 409」则不降级——那是一个成功送达的拒绝，不是连不上。

## 用 DevTools 扩展看本地那一侧

页面上的两张表只讲得清**网线**上的事。行缓存里最后存下了什么、事件流按什么顺序发出来，
得换一件工具：[`apps/rxdb-devtools-extension`](../rxdb-devtools-extension/README.md)。

本 app 已装好 `@aiao/rxdb-devtools` 连接器（`setup_rxdb_http.ts`），**无需任何查询串开关**，
`nx serve` 与 e2e 跑的构建产物两种形态下都在。

```bash
pnpm nx build rxdb-devtools-extension    # 产物在 apps/rxdb-devtools-extension/dist/
```

Chrome 打开 `chrome://extensions` → 开发者模式 → 「加载已解压的扩展程序」选上面那个 `dist/`，
然后在 4300 这一页按 F12，多出来的就是 **RxDB** 面板。

看这个 demo 时值得对着两张表读的是 **Events**：一次「重新查询」在协议流量面板上是
`POST recipes/metadata` + `POST recipes/ids`，在 Events 面板上是同一次操作落进 wa-sqlite
行缓存的那几条写入——`304` 命中的那几次，后者一条都不会有。

**Database** 面板查的是行缓存（wa-sqlite），不是后端。它和「离线」开关是一对：
离线态下页面还看得见的那些行，就是这里能查到的那些行。

## 相关

- 协议规范：[`website/docs/adapters/http-protocol.md`](../../website/docs/adapters/http-protocol.md)
- 参考后端：[`apps/dev-rxdb-http-server`](../dev-rxdb-http-server/README.md)
- e2e：[`apps/dev-rxdb-http-e2e`](../dev-rxdb-http-e2e)
