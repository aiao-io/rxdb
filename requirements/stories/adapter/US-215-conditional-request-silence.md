---
id: US-215
title: 条件请求被静默停用时给出可观测信号
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-27
updated: 2026-08-27
tags: [adapter, http, etag, observability, dx]
---

<!--
INVEST 检查清单:
- [x] Independent: 只在 `transport.ts` 已有的分支上加一次回调，不依赖 US-021 / US-022
- [x] Negotiable: 回调签名与载荷字段可议；「不引入 console」不可议（见 D2）
- [x] Valuable: 今天开了 `conditionalRequests` 却全程不生效，用户侧零信号——账单照付，缓存零命中
- [x] Estimable: 一个可选 hook + 一次去重 + 改一条既有 e2e 的判词
- [x] Small: 单次迭代内可完成
- [x] Testable: 断言回调被调用的次数与载荷；断言不配回调时行为逐字不变
-->

# 用户故事：条件请求被静默停用时给出可观测信号

## 作为/我想要/以便

**作为** 给 `RxDBAdapterHttp` 开了 `conditionalRequests: true` 的开发者
**我想要** 在它实际上一次都没生效时收到一个信号
**以便** 不必靠对比服务端日志才发现自己开了一个全程空转的开关

## 问题现状

### 病灶：一个正确的分支，两种成因，一片静默

[transport.ts](../../../packages/rxdb-adapter-http/src/transport.ts) 的 `#cacheAndReturn`：

```ts
const etag = response.headers.get('etag');
if (etag === null) {
  // 远端停发 ETag：留着旧条目就是拿一个再也换不到 304 的令牌去问，
  // 每次都白搭一个请求头，且下一次 200 会被误判成「内容变了」
  cache.delete(key);
  return value;
}
```

这个分支**本身是对的**，删缓存的理由也是对的。问题在注释里的那句「远端停发 ETag」——
它只覆盖了两种成因中的一种：

| 成因                                                           | 客户端看到的            | 修法在哪           |
| :------------------------------------------------------------- | :---------------------- | :----------------- |
| 远端确实不发 `ETag`                                            | `headers.get` 得 `null` | 服务端             |
| 远端发了，但跨源响应没有 `Access-Control-Expose-Headers: ETag` | `headers.get` 得 `null` | 服务端的 CORS 配置 |

两行的中间列一模一样。第二种成因下，服务端日志里 `ETag` 明明发出去了，
`curl` 也能看见——只有浏览器里的那个 `fetch` 看不见。这正是最难查的一种：
**证据在两台机器上分别都成立，只有合起来才不成立**。

### 缺口不在文档，在没读文档的人

文档这一半已经补齐了：[http-protocol.md](../../../website/docs/adapters/http-protocol.md)
「跨源（CORS）」一节第 3 小节「`ETag` 必须显式暴露，否则条件请求全程静默失效」是 US-214 AC#12 的产物。

而 `HttpAdapterOptions.conditionalRequests` 的 TSDoc 里写着：

> **必须显式开启**，因为它只在远端真的发 `ETag` 并认 `If-None-Match` 时才有收益，
> 而这一点适配器无从探测。

「开启**前**无从探测」是事实，但「开启**后**无从发现」不是——适配器手上就有铁证：
一个 200 响应，`conditionalRequests` 开着，却读不到 `ETag`。它知道，只是没有嘴。

### 症状被冻结在用例里

[conditional-requests.spec.ts](../../../apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts)
的 AC#10 用例名就叫「已知症状（非待修 bug）：未暴露 ETag 时条件请求全程不命中，且不报错、无日志」，
其断言包括 `expect(consoleErrors).toEqual([])`。本故事要动的正是这条「无日志」。

### 复验方式

源码实证 + 已有 e2e 复现（US-214 AC#10 每次跑都在复现这个症状）。
包内零日志通道这一点用 `grep -rni "console\.\|logger" packages/rxdb-adapter-http/src --exclude-dir=__tests__`
核过，无输出。

## 范围边界

### In Scope

- 一个**可选**的诊断回调：`conditionalRequests` 开着、响应是 200、却读不到 `ETag` 时触发一次
- 载荷里给出足以定位的事实（实体、URL、`Response.type`），并**不臆断成因**
- 按缓存 key 去重，一个 key 只报一次
- 更新 US-214 AC#10 的 e2e 判词（见 D3）

### Out of Scope

- **不引入 `console` / logger**——见 D2
- **不改数据路径**：未配回调时，`cache.delete(key); return value;` 逐字不变，不抛、不重试、不降级
- 不自动关闭 `conditionalRequests`，不自动改请求
- 不做通用的传输层事件总线 / 指标上报（1 个已知病灶配 1 个 hook，抽象数不越过病灶数）
- 不动后端与协议文档——那一半 US-214 已经做完

## 设计决策

### D1 — 回调不得断言成因，只报事实

客户端**分不清**上表那两种成因，二者在 `headers.get('etag') === null` 上完全重合。
回调若写「远端未发送 ETag」，在跨源成因下就是一句假话，会把人送去改一个本来就对的服务端。

可用的区分线索是 `Response.type`：跨源响应在浏览器里是 `'cors'`，同源是 `'basic'`。
把它原样放进载荷，让调用方自己判断，比适配器替他猜要诚实。
（`Response.type` 在浏览器里的取值明确；在 Node 的 undici 下是否同样可区分**未核实**，
属**推断**，实现阶段以用例确认——若不可区分，载荷仍带该字段，只是不作为文档承诺的判据。）

### D2 — 用回调，不用 `console.warn`

三条理由，按分量排：

1. **本包零日志输出是既定事实**（`src/` 下无 `console`、无 logger），破例得有比「方便」更硬的理由。
2. 库不该替宿主决定日志去向。Angular / React / Vue / Electron / 测试进程对「一条警告该去哪」
   的答案各不相同。
3. `HttpAdapterOptions` 的既有形状就是 hook 式的——`auth?: HttpAuthHook`、
   `handlers` 下清一色 `onFetchMetadata` / `onCreate` / …。加一个可选 hook 是顺着房子的纹理走。

### D3 — 既有 e2e 用例保留，改判词

US-214 AC#10 那条用例今天断言的是「没有任何信号」。本故事关闭后，它的语义应从
**「已知症状」**改为**「未配置诊断回调时的默认行为」**：控制台**仍然**零输出（AC#3 要求的），
同时新增一条对照用例证明「配了回调就拿得到信号」。

用例不删。删掉它等于丢掉「静默是刻意的默认，不是疏忽」这条证据。

## 验收标准

| #   | 前置条件                                                                | 操作                 | 预期结果                                                                                             | 状态 |
| --- | ----------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | `conditionalRequests: true`，配了诊断回调，远端 200 但响应读不到 `ETag` | 一次 `fetchMetadata` | 回调被调用一次，载荷含实体名、请求 URL、`Response.type`                                              | ✅   |
| 2   | 同 AC#1，载荷文案                                                       | 读文案               | **不**断言成因；同时点出「远端未发」与「跨源未暴露」两种可能，并指向 `Access-Control-Expose-Headers` | ✅   |
| 3   | `conditionalRequests: true`，**未配**回调，远端读不到 `ETag`            | 一次 `fetchMetadata` | 行为与本故事之前逐字相同：缓存条目被删、正常返回值、不抛、控制台零输出                               | ✅   |
| 4   | `conditionalRequests: false`，配了回调                                  | 一次 `fetchMetadata` | 回调不触发——关着的开关不该产生噪音                                                                   | ✅   |
| 5   | 同一缓存 key 连续 N 次都读不到 `ETag`                                   | 连续拉取             | 回调只触发一次；不同 key 各自触发一次                                                                | ✅   |
| 6   | 远端正常发 `ETag`                                                       | 两次 `fetchMetadata` | 回调一次都不触发；304 命中行为不变                                                                   | ✅   |
| 7   | 回调自身抛错                                                            | 一次 `fetchMetadata` | 不影响本次请求的结果——诊断通道不得成为新的故障源                                                     | ✅   |
| 8   | [dev-rxdb-http-e2e](../../../apps/dev-rxdb-http-e2e/) 的 AC#10 用例     | 跑 e2e               | 按 D3 更新判词后通过；新增的「配了回调有信号」对照用例通过                                           | ✅   |
| 9   | 实现完成                                                                | 跑门禁               | `@aiao/rxdb-adapter-http` 覆盖率不回退（当前 99%）；新导出补 TSDoc 并进 api-baseline                 | ✅   |

AC#1–#7 由 `packages/rxdb-adapter-http` 的单元用例证实（`Tests 350 passed (10 files)`，
其中 `transport.spec.ts` 66 条、`RxDBAdapterHttp.spec.ts` 74 条、`conditional-cache.spec.ts` 20 条）。
AC#8 由 `dev-rxdb-http-e2e` 证实（`10 passed`，含新增的对照用例）。
AC#9 的门禁：`lint test build` 全绿，`tsc -p tsconfig.lib.json --noEmit` 零错误，
覆盖率 99.81% stmts / 97.81% branches / 100% funcs / 99.8% lines（未回退），
`pnpm audit:api-surface` 与更新后的基线一致。

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 触发点只有 `#cacheAndReturn` 一处——`transport.ts` 里读 `etag` 的地方就这一个。
- 去重表随缓存实例走，`disconnect()` 时一并清空（与 `conditionalCacheSize` 缓存同生命周期），
  否则换了后端配置重连后收不到新信号。
- AC#7 的「回调抛错不影响请求」意味着调用点要包一层——但**不要**把错误吞成静默，
  这与铁律「无 fallback 兜底」的边界在于：吞的是**诊断通道**的错误，不是数据路径的错误。
  实现时想清楚吞掉之后往哪儿去（大概率只能丢弃，因为此时正没有第二条通道可用——
  这本身就是本故事的题眼，值得在 TSDoc 里写明）。
- 本故事**不改** `packages/rxdb-adapter-http/src/` 之外的任何运行时代码。US-214 立的
  「不改该包」的约束到此解除，因为那条约束的本意是「demo 不夹带库改动」，不是「该包不许再改」。

### 设计结论

- **D1 那个「未核实」有了答案，而且两边不一样**：Node（undici）下手工构造的 `Response`
  恒为 `'default'`，浏览器里的跨源响应是 `'cors'`——两个取值分别由单元用例与 e2e 钉住。
  所以 `Response.type` 按 D1 的预案处理：**载荷带它，但不作为文档承诺的判据**，
  TSDoc 里明写「线索而非判据」。判断留给拿得到部署拓扑的调用方。
- **AC#4 由结构保证，不靠运行期再判一次开关**。`onEtagUnreadable` 挂在
  `HttpTransportOptions.conditional` **里面**而不是与它并列：`conditionalRequests` 关掉时
  整个 `conditional` 对象就不存在（`RxDBAdapterHttp.#createTransport` 早已如此），
  回调因此根本不可达。「关着的开关不产生噪音」于是不是一条需要维护的判断。
- **`entityName` 做成可选，且刻意不参与任何判定**。`sendJson` 对所有操作共用一个签名，
  而 `version` 这类操作没有实体。两条本可以避免这个可选的路子都被否掉：
  按 `entityName !== undefined` 决定走不走条件缓存，等于把「漏传一个诊断参数」变成
  「静默丢缓存」——正是本故事要治的病；缺席就抛，等于把一个纯诊断的疏漏变成数据路径故障。
  于是维持可选，靠 TSDoc 说明「触发本回调的两个操作都由实体驱动，实际恒有值」。
- **去重表不能被 `delete()` 清掉**。读不到 ETag 的那一支每次都调 `cache.delete(key)`，
  去重记录若跟着没了，「一个 key 只报一次」当场退化成「每次查询都报一次」。
  `ConditionalRequestCache.delete()` 的 TSDoc 里把这条写死了。去重表只在 `clear()`
  （即 `disconnect()`）时清——一次断开重连之间后端 CORS 配置完全可能被改过。
- **去重表同样有界**，上限与条目共用 `maxEntries`：无界的 `Set` 会随「读不到 ETag 的不同
  URL 数」单调增长，正是 `conditionalCacheSize` 存在的理由。`Set` 的迭代顺序即插入顺序，
  逐出写法与 `set()` 同构。
- **回调抛错吞掉，且吞得有据**。此刻 `value` 已经解析完毕、就等着返回给调用方，
  让一个诊断回调的异常把一次成功的查询变成失败，比它要报告的问题严重得多。
  吞掉的异常没地方转发——正在报告的就是「本包没有输出通道」这件事本身，
  这与铁律「无 fallback 兜底」的边界正如技术笔记所划：吞的是诊断通道，不是数据路径。
- **e2e 顺带证实了去重在真实链路上成立**：翻 5 页 + 分块 `findByIds` 全都读不到 ETag，
  面板上只出现有限的几条而不是几十条同义警告，`refetch` 之后条数不增。

## 实现文件

| 文件                                                                                                                        | 说明                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [packages/rxdb-adapter-http/src/http.interface.ts](../../../packages/rxdb-adapter-http/src/http.interface.ts)               | 新增 `HttpEtagUnreadableReport` / `HttpEtagUnreadableHook` 与选项 |
| [packages/rxdb-adapter-http/src/transport.ts](../../../packages/rxdb-adapter-http/src/transport.ts)                         | 触发点 `#reportEtagUnreadable` + 文案 + `entityName` 透传         |
| [packages/rxdb-adapter-http/src/conditional-cache.ts](../../../packages/rxdb-adapter-http/src/conditional-cache.ts)         | `markEtagUnreadable()`：有界去重表，随 `clear()` 清空             |
| [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)             | 把回调接进 `conditional`（AC#4 的结构保证）                       |
| [packages/rxdb-adapter-http/src/pagination.ts](../../../packages/rxdb-adapter-http/src/pagination.ts)                       | `fetchMetadata` 传 `entityName`                                   |
| [packages/rxdb-adapter-http/src/chunking.ts](../../../packages/rxdb-adapter-http/src/chunking.ts)                           | `findByIds` 传 `entityName`                                       |
| [requirements/api-baseline/rxdb-adapter-http.json](../../api-baseline/rxdb-adapter-http.json)                               | AC#9：两个新导出进基线                                            |
| [apps/dev-rxdb-http/src/app/etag-diagnostics.ts](../../../apps/dev-rxdb-http/src/app/etag-diagnostics.ts)                   | 新增：demo 侧诊断收集器（见「落地偏差」）                         |
| [apps/dev-rxdb-http/src/app/demo-config.ts](../../../apps/dev-rxdb-http/src/app/demo-config.ts)                             | `resolveDiagnosticsEnabled`：`?diagnostics=1`                     |
| [apps/dev-rxdb-http/src/app/setup_rxdb_http.ts](../../../apps/dev-rxdb-http/src/app/setup_rxdb_http.ts)                     | 按开关装 `onEtagUnreadable`                                       |
| [apps/dev-rxdb-http/src/app/app.ts](../../../apps/dev-rxdb-http/src/app/app.ts)                                             | 诊断信号 + 清空联动                                               |
| [apps/dev-rxdb-http/src/app/app.html](../../../apps/dev-rxdb-http/src/app/app.html)                                         | 诊断面板；未开启时明说这是默认行为                                |
| [apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts](../../../apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts) | AC#8：AC#10 判词按 D3 改写 + 新增对照用例                         |

## References

- [US-212 HTTP 适配器](./US-212-http-adapter.md) — `conditionalRequests` 的来历（AC#28）
- [US-214 HTTP 适配器浏览器端到端 demo](./US-214-http-browser-demo.md) — AC#10 冻结了本症状，AC#12 补齐了文档一半；见其「落地偏差」
- [http-protocol.md](../../../website/docs/adapters/http-protocol.md) — 「跨源（CORS）」第 3 小节
