# rxdb-adapter-http 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本报告按风险追踪公开入口与关键调用链，未声称逐行覆盖全部源码。

验证口径：区分源码实证、原函数局部执行与真实后端运行。统一 Nx 校验结果见 [包级索引](README.md)；未运行的浏览器、真机或 Rust 宿主测试不计为通过。

## 结论与范围

🟡凑合：HTTP 传输的错误分类、分页上限、条件缓存隔离已有完整结构；SSE 的 URL 守卫与普通请求采用了不同的地址契约。确定问题 2 条。

| 评审重点             | 已追踪的源码                                                                                                                                                                  | 当前判断                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 请求构造、认证与取消 | [`HttpTransport.#prepare` / `#send` / `classify`](../../../packages/rxdb-adapter-http/src/transport.ts)                                                                       | body/header 构造错误与网络错误分开；断开信号与超时分别分类 |
| 分页与批量读         | [`fetchAllMetadataPages`](../../../packages/rxdb-adapter-http/src/pagination.ts)、[`findByIdsInChunks`](../../../packages/rxdb-adapter-http/src/chunking.ts)                  | 短页/token 终止、总页数/空页上限和响应形状已检查           |
| 条件请求             | [`ConditionalRequestCache` / `requestFingerprint`](../../../packages/rxdb-adapter-http/src/conditional-cache.ts)                                                              | handler header 进入指纹，命中与合流方返回副本              |
| SSE 生命周期         | [`HttpChangeFeed`](../../../packages/rxdb-adapter-http/src/change-feed.ts)、[`RxDBAdapterHttp.#createChangeFeed`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts) | 发现 HTTP-001；停止时摘回调，重连退避有上限                |
| 写回执               | [`RxDBAdapterHttp.#installWriteDucks`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)                                                                            | 当前回执经过 canonicalizeRowUpdatedAt，不复报已修时区问题  |

## 确定问题

### HTTP-001 · P2 · 同源相对 baseUrl 一旦开启 SSE 就在构造期被拒绝

**证据。** 普通请求的 [`assertResolvableUrl`](../../../packages/rxdb-adapter-http/src/transport.ts) 同时检查绝对 URL 和 `location.href` 下的相对 URL，注释明确支持浏览器中的相对 `baseUrl`。[`RxDBAdapterHttp.#createChangeFeed`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts) 把同一个 `resolveUrl` 的结果交给 SSE，但 [`assertResolvedFeedUrl`](../../../packages/rxdb-adapter-http/src/change-feed.ts) 只执行 `URL.canParse(url)`。

**触发步骤。** 在 `https://app.example.test/` 的页面构造 `{ baseUrl: '/api', handlers, changeFeed: { url: 'changes' } }`。拼接结果 `/api/changes`。预期构造成功、EventSource 连接同源地址；实际立即抛 `HttpConfigError(changeFeed.url)`，整个 adapter 无法创建。去掉 changeFeed 后，同样的 baseUrl 可以正常用于请求。

**验证。** 递归转译当前完整 HTTP adapter 源码后调用真实构造函数，`baseUrl:'/api'`、`changeFeed.url:'changes'` 直接抛 `HttpConfigError`，`field:'changeFeed.url'`，消息含解析结果 `/api/changes`。原生 URL 对照：`URL.canParse('/api/changes') === false`，提供页面 base 后为 true。尚未运行浏览器 EventSource 端到端复现。

**修复与回归。** 在同一个地址解析入口使用浏览器 `location.href` 补全绝对地址，再交给普通请求与 SSE；无 location 的宿主仍拒绝不可解析地址。增加 `/api`、`api`、绝对 baseUrl、畸形 `https://` 及缺 location 的测试，确保错误 URL 不进入无限重连。

### HTTP-002 · P2 · 已确认写入后的读取仍合流到写入前的在飞请求

**证据与根因。** [`HttpTransport.sendJson`](../../../packages/rxdb-adapter-http/src/transport.ts) 在开启 `conditionalRequests` 后，对 fetchMetadata/findByIds 以请求指纹进入 [`ConditionalRequestCache.singleFlight`](../../../packages/rxdb-adapter-http/src/conditional-cache.ts)。在飞表只在原请求 finally 时移除，没有作废代次。HTTP adapter 的 [`#installWriteDucks`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts) 在 create/update/delete 成功时没有结束对应旧读的合流窗口；SSE 的 invalidate 回调也只通知核心查询层。

**触发。** `conditionalRequests:true`，先发起某一组 id 的 findByIds，服务端已经取到写前快照但暂缓交付正文；等待 update 成功返回新行后，再调用同一 findByIds。新调用发生在写确认之后，却拿到旧在飞请求，不再向服务端读取。

**预期 / 实际。** 写后新发起的读应获得写后快照；实际读到旧值。核心 QueryCacheEngine 虽会在本地写/远端失效时清自己的在飞代次，新一代远端调用仍能被 HTTP 下层再次合回旧请求，故不能用核心代次守卫证明此组合安全。

**完整 adapter 诊断。** 本轮将当前 HTTP 包各源码模块转译后运行真实 `RxDBAdapterHttp`、transport、条件缓存和分块实现，仅把 fetch 替换成可控制响应交付时序的网络替身。调用公开 `connect → findByIds(挂起) → await update → findByIds → 交付旧读`，实际观测：

```json
{ "confirmedWrite": "new", "afterWriteRead": "old", "httpReadRequests": 1 }
```

这是公开 HTTP adapter 的编排实证；未声称已用真实 HTTP 服务和本地 QueryCache 数据库复现持久化回退。未开启条件请求的路径不走该合流表。

**修复建议。** 在已确认写入及远端失效时推进合流代次，使新读不会复用先前代次的请求；旧请求结算只清自身条目，也不得把过时代次重新填入条件缓存。按实体失效或整个 transport 失效均需采用同一判据。

**回归建议。** 用当前 HTTP adapter+QueryCache 生产入口覆盖挂起的 metadata/full-row 读、update/delete 确认后新读及 SSE invalidation；断言写后新请求确实发出，旧结果不能伪装成新代次结果。保留同一代次的并发读去重。

## 已核对而不作为新增缺陷的约束

[README](../../../packages/rxdb-adapter-http/README.md) 明确要求换用户时 disconnect/connect：auth header 不参与缓存指纹。该代价不是本次新增问题。SSE 实验性、HTTP 不支持 changelog/bigint/binary、删除只判断状态码也是已明示契约。

## 测试与边界

已定位 [`transport.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/transport.spec.ts)、[`change-feed.spec.ts`](../../../packages/rxdb-adapter-http/src/__tests__/change-feed.spec.ts)、分页与缓存测试入口。未实测跨源 CORS/ETag 暴露、多身份部署和真实 SSE 断线；普通单元测试通过也不代表这些部署条件已验收。

## 调用链交叉核查

HTTP-001 已补完整构造函数诊断；HTTP-002 已补完整 adapter+网络交付替身诊断。两个问题分别位于地址守卫和在飞请求代次，修复其中一个不会自动关闭另一个。

## 本次 Nx 校验

本次 `rxdb-adapter-http:test`：501 passed (501)；目标实际执行。命令及整体边界见[总索引](README.md)。
