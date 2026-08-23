---
id: RV-004
title: US-212 第二轮深度评审：RV-002 引用过时、isTableExisted 论据失效、Node fetch 错误漏判、必选成员语义空白
status: Open
created: 2026-08-23
updated: 2026-08-23
pr:
---

# Review：US-212 HTTP 远程适配器需求（第二轮）

## 结论

在 RV-003 关闭后的当前版本上做第二轮逐条核对。方向、核心决策（transport 归适配器、
结构隔离、判别式返回 + fail-fast、错误判别位口径）全部成立且质量很高，**不返工**。

本轮新发现 7 条，按阻塞程度分：

- 🔴 **必须修正（4 条）**：RV-002 引用过时、`isTableExisted` 论据失效且与 `connect()`
  语义自相矛盾、Node 环境「原样上抛 TypeError」会漏判、`saveMany`/`removeMany`/
  `mutations`/`getRepository` 四个必选成员语义空白。
- 🟡 **建议改进（3 条）**：发射契约漏写 `firstValueFrom` 侧、`create`/`update`/
  `delete` 命名映射方向与 `fetchMetadata`/`findByIds` 相反、`disconnect()` 取消语义
  与 `shareReplay` 缓存的交互。

结论来自对 `packages/rxdb` 与 `packages/rxdb-adapter-supabase` 源码的逐条核对，
未运行测试。

## 问题

### 🔴 P0-1：RV-002 已关闭，「契约至今没写在文档里」引用过时

「[`fetchMetadata`：对 core 的发射契约](../stories/adapter/US-212-http-adapter.md#fetchmetadata对-core-的发射契约)」
一节断言：

> 现有 supabase 适配器满足这条纯属结构巧合……**不是遵约**，因为这条契约至今没写在
> 任何面向适配器作者的文档里。缺口与修复归属见 RV-002。

源码实证：这条契约**已经冻结**在
`RxDBAdapterRemoteBase.fetchMetadata` 的 TSDoc
（[rxdb-adapter.ts:360](../../packages/rxdb/src/rxdb-adapter.ts#L360)）——
「恰好发射一次全量结果，然后 `complete`」+ 传输失败判据，明确点名 RV-001 / RV-002。
supabase 也已有回归测试
（[querycache-error-contract.spec.ts:151](../../packages/rxdb-adapter-supabase/src/__tests__/querycache-error-contract.spec.ts#L151)
的 `describe('RV-002 — fetchMetadata 的发射契约（forkJoin 承重）')`）。

**后果：** 引用口径错误会让 plan 阶段的人重复造这条契约，或误以为 core 还有待修的
缺口。RV-002 是「已关闭的 review」，不是「待修复缺口」。

**修法：** 把该句改为「契约已冻结在 core TSDoc（RV-002 已关闭，supabase 已有回归
测试）」。纯文档勘误。

### 🔴 P0-2：`isTableExisted` 的「core 会调它」论据不成立，且与 `connect()` 语义矛盾

「生命周期成员」表与 AC#24 都写：

> `isTableExisted` 不是可以敷衍的成员——core 在连接流程里会调它（RxDB.ts），恒
> `true` 会让一个根本连不上的远端一路跑到首次查询才暴露。

源码实证：`isTableExisted` 在 `RxDB.ts` 里**只有两处调用，且都收窄到 local adapter**：

- [RxDB.ts:559-564](../../packages/rxdb/src/RxDB.ts#L559-L564) 在
  `if (isLocalAdapter(adapterName, this.#config))` 分支内调用
  `adapter.isTableExisted(RxDBMigration)`；
- [RxDB.ts:988](../../packages/rxdb/src/RxDB.ts#L988) 在
  `#ensureEntityTables(adapter: RxDBAdapterLocalBase)` 内调用。

**remote adapter 的 `isTableExisted` 根本不会被 core 的连接流程调用。** 所以「恒
`true` 让远端一路跑到首次查询才暴露」这个威慑理由不成立——恒 `true` 根本不产生这个
后果，因为没人调它。三分支语义（2xx→`true` / 404→`false` / 其余→抛错）作为定义仍
有价值，但**论据必须换**。

更麻烦的是它与 `connect()` 的语义**自相矛盾**：文档一边说 `connect()`「不得发探测
请求——远端此刻不可达不代表配置错」，一边指望 `isTableExisted` 在连接期兜底「远端
连不上」。如果真要连接期探测可达性，那是 `connect()` 的职责，不是 `isTableExisted`
的。

**修法（二选一，需做一次设计决策）：**

1. 承认 v1 不做连接期探测，删掉「core 会调它」这个威慑理由，只保留三分支语义定义；
2. 把「探测远端可达性」明确归到 `connect()`，`isTableExisted` 只做语义映射。

两条不能并存，否则 `connect()` 的「不发探测」和「连接期能发现连不上」互相打架。

### 🔴 P0-3：Node 环境「原样上抛 TypeError」会漏判，AC#13 会挂

「错误分类锚定 `isNetworkError`」一节把两条路并列等价：

> 要么原样上抛，要么抛 `NetworkOfflineError`。

但 `isNetworkError` 第 5 条判据的正则只覆盖浏览器消息
（[network-error.ts:50](../../packages/rxdb/src/repository/network-error.ts#L50)）：

```ts
const FETCH_FAILURE_MESSAGE =
  /failed to fetch|networkerror when attempting to fetch|load failed|network request failed/i;
```

Node / undici 的 fetch 失败消息是 **`fetch failed`**（`TypeError: fetch failed`），
不命中任何一支；真正的 errno（`ECONNREFUSED` 等）挂在 `error.cause` 上，而
`isNetworkError` 读的是 `error` 自身的 `code`，读不到 `cause`。

**后果：** HTTP 是仓库里第一个直接用原生 `fetch` 的适配器（supabase 走 SDK，被
`SupabaseDataError` 包死，反而避开了这条）。vitest 单测跑在 node、Electron 主进程、
Tauri JS 侧，这些环境里「原样上抛 TypeError」会让 `isNetworkError` 判 `false`，
`offlineFallback` 静默失效，AC#13 直接挂。

**修法（二选一）：**

1. 把「抛 `NetworkOfflineError`」从二选一改成**强制要求**（走 `instanceof` 第 1 条
   判据，不依赖任何字符串约定——core TSDoc 自己就是这么建议的）；
2. 或在 plan 阶段加一条前置：给 core 的 `FETCH_FAILURE_MESSAGE` 正则补 `fetch failed`
   （并把 `cause` 上的 errno 读出来）。

两条至少二选一，**不得**留成「原样上抛也行」。

### 🔴 P0-4：`saveMany` / `removeMany` / `mutations` / `getRepository` 语义空白

`IRxDBAdapter` 必选成员共 9 个：`name` / `connect` / `disconnect` / `version` /
`getRepository` / `saveMany` / `removeMany` / `mutations` / `isTableExisted`
（[rxdb-adapter.ts:58-110](../../packages/rxdb/src/rxdb-adapter.ts#L58-L110)）。
生命周期表（AC#24）只覆盖了 `connect` / `disconnect` / `version` / `isTableExisted`
四个，**前四个完全没定义**：

- `getRepository` 是 `RxDBAdapterBase` 的 abstract 成员，本包必须实现。Full/Filter
  实体下返回什么？throw？supabase 返回 `SupabaseRepository`（Full 专用），本包 v1
  无 Full sync，这条是空的。
- `saveMany` / `removeMany` / `mutations` 是 `IRxDBAdapter` 必选，本包 throw 还是
  委托给 QueryCache 的 `create`/`update`/`delete`？没说。AC#22 只提「不改 Full/
  Filter 写本地」，但没落到「这三个方法怎么实现」。

**后果：** plan 阶段实现者撞上这四条时没有契约可依，只能自定，且「自定」出来的
语义无法验收。

**修法：** 补一条 AC（或并入 AC#24），写清这四个成员的 HTTP 语义：v1 下
`getRepository` 与 `saveMany`/`removeMany`/`mutations` 应 throw unsupported（与
changelog 方法同口径），不得静默返回空或假成功。

### 🟡 P1-1：发射契约只覆盖 `forkJoin`，漏了 `firstValueFrom`

「发射契约」只写了 `QueryCacheRepository` 的 `forkJoin`（只留最后一次）。但
`query-cache-primary.ts` 的 `#fetchMetadata` 用 `firstValueFrom`
（[query-cache-primary.ts:237-238](../../packages/rxdb/src/repository/query-cache-primary.ts#L237-L238)）
——**只取第一次发射**，语义正好相反。两者都指向「必须单次发射」，但理由不同，core
TSDoc 两条都写了（[rxdb-adapter.ts:360](../../packages/rxdb/src/rxdb-adapter.ts#L360)
及其上下文）。

**修法：** 补一句「`firstValueFrom` 只取第一次发射」的对称说明。否则未来有人优化掉
`forkJoin` 侧，`firstValueFrom` 侧仍会咬人，而方案里没留下这条提醒。

### 🟡 P1-2：`create`/`update`/`delete` 的命名映射方向与 `fetchMetadata`/`findByIds` 相反

「Handler 契约」用「别把 handler 取成 `fetchMetadata`/`findByIds`，因为基类有同名
abstract」论证 `onFetchMetadata`/`onFindByIds`。这个论证对这两个 duck 成立。但
`create`/`update`/`delete` **恰好相反**：`RxDBAdapterRemoteBase` **没有** abstract
的 `create`/`update`/`delete`——它们是 `QueryCacheRemoteAdapter` 接口的 optional
成员（[QueryCacheRepository.ts:59-63](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L59-L63)），
`QueryCacheRepository` 调 `remoteAdapter.create(...)`。

**后果：** 本包类的方法名**必须是** `create`/`update`/`delete`（不能叫 `onCreate`），
handler 才加 `on` 前缀。这个方向性差异不写清，实现时极容易搞反——把方法名取成
`onCreate` 会导致 `QueryCacheRepository` 探测不到可选写入口，静默退化。

**修法：** 在 Handler 契约里点一句：`fetchMetadata`/`findByIds` 与基类 abstract 同名
所以 handler 加 `on` 前缀；`create`/`update`/`delete` 是 optional duck，**方法名必须
保持原样**，只有 handler 加 `on` 前缀。

### 🟡 P1-3：`disconnect()` 取消 in-flight 与 `shareReplay` 缓存的交互未定义

AC#24 要求 `disconnect()` abort 进行中请求。但 `QueryCacheRepository.find` 用
`shareReplay({ bufferSize: 1, refCount: true })` 缓存了 Observable
（[QueryCacheRepository.ts:279-289](../../packages/rxdb/src/repository/QueryCacheRepository.ts#L279-L289)），
disconnect 时可能有已缓存的实例。

**后果：** abort 底层 `fetch` → reject → 如何传播到已缓存流、已缓存结果如何处理，属
实现细节风险。不是设计错误，但 plan 阶段要写清 teardown 语义：断开后旧缓存流是否
立即报错、后续订阅是否重跑同步。

## 根因

1. **RV-002 引用过时**：评审期间 RV-002 已关闭，但需求文本停留在「评审前」的时间点
   ——核心契约被固化进 core TSDoc + supabase 回归测试这件事，需求没跟着刷新。
2. **`isTableExisted` 论据失效**：把「core 会调 `isTableExisted`」这个对 **local**
   成立的连接流程事实，无差别套到了 **remote** 适配器头上，没核对调用点是否被
   `isLocalAdapter` 收窄。
3. **Node fetch 漏判**：需求只从「传输失败不得被包装」这个正确前提出发，把「原样上抛
   TypeError」与「抛 `NetworkOfflineError`」当成等价项，没意识到 `isNetworkError`
   第 5 条正则的覆盖面是「浏览器」而非「所有 JS 运行时」。
4. **必选成员空白**：生命周期表只覆盖了「HTTP 没有天然概念」的那四个成员（connect/
   disconnect/version/isTableExisted），把「有天然答案但答案是无操作/throw」的那四个
   成员（getRepository/saveMany/removeMany/mutations）漏掉了——后者的语义也是「空白」，
   只是空得不容易被注意到。

## 修复方案

按阻塞程度排序，前四条是 plan 前必须关的。

1. **P0-1**：改「发射契约」一节的 RV-002 引用，标注「契约已冻结在 core TSDoc」。
2. **P0-2**：替换 `isTableExisted` 的「core 会调它」论据，二选一定「连接期探测」归
   `connect()` 还是不做。
3. **P0-3**：把「抛 `NetworkOfflineError`」定为强制，或补 core 正则 `fetch failed`。
4. **P0-4**：补 `getRepository`/`saveMany`/`removeMany`/`mutations` 的语义（一条新 AC）。
5. **P1-1**：补 `firstValueFrom` 侧对称说明。
6. **P1-2**：写明 `create`/`update`/`delete` 方法名必须保持原样。
7. **P1-3**：plan 阶段写清 `disconnect()` 与 `shareReplay` 缓存的 teardown 语义。

## 复核结论（2026-08-23，逐条对源码验证）

七条全部**属实**，无误报。修正时对两条的口径做了收窄，另补一条本轮漏掉的过时引用。

| 条目 | 判定       | 落点                                                                                                                                                                                                                                                                |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | 成立       | 契约确在 `rxdb-adapter.ts` 的 `fetchMetadata` TSDoc（两个调用点都写明）。另：RV-001/002/003 三个文件已从工作区删除，故事里的链接是死链——改为指向源码而非 review                                                                                                     |
| P0-2 | 成立       | `RxDB.ts:560` / `:984` 两处调用均在 local 分支内（`isLocalAdapter` / `#ensureEntityTables(adapter: RxDBAdapterLocalBase)`）。按方案 1 处理：不做连接期探测，只保留语义定义                                                                                          |
| P0-3 | 成立       | `FETCH_FAILURE_MESSAGE` 无 `fetch failed`，判据第 3 步读 `error.code` 而非 `error.cause`。按方案 1 处理，**不改 core**（放宽正则会让 message 含 `load failed` 的业务错误误判成离线，`postgrest-error.ts` 已论证过）                                                 |
| P0-4 | 成立       | 四个成员确实空白。已核实 throw 不会打断 QueryCache：`getRepository` 只在 `SyncType.None`+remote-only 下被订阅（`Repository.remote$` 是 `refCount` 惰性流），批量写走 `#mutations_query_cache` 而非 `adapter.mutations`                                              |
| P1-1 | 成立       | `query-cache-primary.ts:237` 确为 `firstValueFrom`                                                                                                                                                                                                                  |
| P1-2 | 成立       | `QueryCacheRepository:398/431/462` 三处 `if (!this.remoteAdapter.create)` 特性探测                                                                                                                                                                                  |
| P1-3 | 成立但降级 | 已收窄到适配器能担保的部分：abort 必须走 error 通道，不得 complete 一个没发射过的流。**不写 teardown 协议**——core 的 `#inflightQueries` 用 `finalize` 在 error 上也会清缓存（`QueryCacheRepository:308-317`），缓存流不会滞留，再写就是替 core 定它自己已经定过的事 |

### 本轮漏掉的一条（一并修正）

「错误分类锚定 `isNetworkError`」一节还写着「**既有的 supabase 适配器正踩在上面**……`offlineFallback` 在当前唯一已发布的远端适配器上恒不触发」，并链到 RV-001。**RV-001 状态是 `Fixed`**：`postgrest-error.ts` 的 `classify_postgrest_error` 已按 `status === 0` 把传输失败分类成 `NetworkOfflineError`。与 P0-1 同一类过时引用，本轮只抓了 RV-002 那一处。已改写成「supabase 已付过的学费」的历史陈述。

## 解决记录

- [x] P0-1 改写发射契约的引用口径，指向 core TSDoc；清掉三条死链
- [x] P0-2 替换 `isTableExisted` 论据，明确「连接期不做可达性探测」，与 `connect()` 不再打架
- [x] P0-3 定传输失败 MUST 抛 `NetworkOfflineError`；AC#13 加「用例须在 node 环境跑」；Out of Scope 增「不改 core 正则」
- [x] P0-4 生命周期表补四个成员 + 新增 AC#32 + 新增 `HttpUnsupportedOperationError`
- [x] P1-1 发射契约补 `firstValueFrom` 侧对称说明
- [x] P1-2 Handler 契约补命名方向表（类方法同名 vs handler 加 `on`）
- [x] P1-3 收窄为 `disconnect()` 语义一句：abort 走 error 通道，不得静默 complete
- [x] 额外：清掉 RV-001 的过时断言
- [ ] PR 合并，`status: Resolved`
