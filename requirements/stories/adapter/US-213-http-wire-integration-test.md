---
id: US-213
title: HTTP 适配器 wire 级端到端集成测试（真实 node 后端）
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-25
updated: 2026-08-27
tags: [adapter, http, testing, integration, conformance]
---

<!--
INVEST 检查清单:
- [x] Independent: 零前置。US-212 两阶段已全关（status: Done），本故事只加测试、不改适配器
- [x] Negotiable: 参考后端的文件布局、故障开关命名、端口分配方式可调；「真实 socket + 真实 fetch」不可协商
- [x] Valuable: 现有 9 个 spec 里 6 个用 vi.stubGlobal('fetch') 在适配器输出层拦截（另三个是零桩纯单元测试，根本不经过 transport），真实 transport 从未被真实网线打过；http-protocol.md 是「给任意后端看的协议」，需要一份证明「后端照文档实现、前端照文档消费就能互通」的可执行验收
- [x] Estimable: 一个 node:http 参考后端 + 一份本地内存 fixture + 一个 spec 文件，另加四处测试目录纳管配置
- [x] Small: 17 条 AC 但只落三个测试文件；不改 src/ 生产代码（除非暴露「协议本身无法实现」，那属于协议缺陷另行处置）
- [x] Testable: 每条 AC 都是一条真实网线用例，断言主体是「字节在线上怎么走」而非纯函数返回值
-->

# 用户故事：HTTP 适配器 wire 级端到端集成测试

## 作为/我想要/以便

**作为** 按 `website/docs/adapters/http-protocol.md` 实现后端、并把 `@aiao/rxdb-adapter-http` 当 QueryCache 远端接入的开发者
**我想要** 一份**真实 node HTTP 后端 + 真实 fetch** 的端到端集成测试（不是 `vi.stubGlobal('fetch')` 的内存桩），
把「后端照协议实现、前端照协议消费」这条链路用可执行用例冻结
**以便** 协议文档不是一纸空文——后端与前端任何一方偏离 `http-protocol.md`（RuleGroup 求值、翻页形状、`Content-Type`、状态码、ETag、快照语义），测试当场变红，而不是等真实用户踩到「假孤儿 / 静默截断 / 拿陈旧缓存当最新」。

## 范围边界

### In Scope

- 一个**零第三方依赖**的参考后端（conformance server），用 `node:http` 内置模块实现 `http-protocol.md` 全部七个端点，监听 `listen(0)` 分配的随机端口
- 一条「真实网线」测试路径：`RxDBAdapterHttp` 的 transport 用**全局 undici fetch** 走本地 socket 打参考后端，**不 stub fetch**、不走 `MockAgent`
- 覆盖 wire 级协议不变量：`Content-Type: application/json`、`RuleGroup` 的**求值结果**、翻页两种形态（offset / token）、分块 `findByIds`、写回执由服务端定型 `id`/`updatedAt`、`HEAD` 探测、auth hook 的自定义 header、错误状态码、超时、主动断开、ETag/`If-None-Match` 304
- 参考后端自身的**协议一致性**断言（它必须能证明「协议是可实现的」：短页只出现在真末页、token 逐页推进、快照一致、稳定排序）
- 把 `tests/` 目录纳入本包的 tsconfig / typecheck target / eslint / coverage 四处管辖（见[「`tests/` 目录的四处纳管」](#tests-目录的四处纳管)）
- **本故事允许的唯一 docs 改动**：给 `http-protocol.md` 补一节「条件请求（可选）」的**服务端**语义
  （何时发 `ETag`、如何认 `If-None-Match`、`304` 不带 body 且语义是「你手上那份仍有效」）。AC#16 要证
  「后端照协议实现」，而 US-212 阶段 B 只把条件请求写进了客户端文档 `http.md`，协议侧没有锚点——不补
  这一节，AC#16 的服务端行为就是测试作者自创，证不到协议头上。
  **该节已先行落地**：见
  [`http-protocol.md`「条件请求（可选）」](../../../website/docs/adapters/http-protocol.md#条件请求可选)
  与该文件验收清单的「若实现了条件请求：内容一旦变化就**不得**再回 `304`」一条。开工时**不要重复新增**，
  AC#16 直接引用即可

### Out of Scope

- 改 `src/` 生产代码（`transport.ts` / `RxDBAdapterHttp.ts` 等）。本故事是纯测试资产；若参考后端暴露「协议文档无法实现」，那是协议缺陷，另开 bug 处理，不在本故事内修
- **动 `src/__tests__/` 下任何文件**，包括「把 `createLocalAdapter` 抽成共享 fixture」。理由见[「本地适配器 fixture 自带一份」](#本地适配器-fixture-自带一份)
- 为 transport 增加可注入的 `fetch` / 客户端覆盖点（US-212 阶段 A 明确「不提供 transport 覆盖点」）
- 真实 sqlite 本地适配器。本地行缓存用 `tests/` 自带的内存替身——wire 层是本故事重点，本地落盘已有 `packages/rxdb` 的 QueryCache 套件覆盖
- 多语言后端的对照实现（Go / Python / Java 各写一个 server）。参考后端只写 node 一版，多语言是协议文档的阅读验收，不在此落地
- 非 QueryCache 的 Full / Filter 变更流同步测试
- 把参考后端作为公开 API / 发布产物（它只活在测试目录，不进 `dist`）

## 验收标准

前置条件列的「后端已起」统一指：`beforeAll` 已启动参考后端于 `listen(0)` 的随机端口，并把 `baseUrl`
传给 `RxDBAdapterHttp`。

**两类驱动方式**（AC 的预期落在哪一层由此决定，实现时别混）：

| 驱动方式         | 组成                                                                                            | 覆盖的 AC                                |
| :--------------- | :---------------------------------------------------------------------------------------------- | :--------------------------------------- |
| ① **适配器直调** | 只 `new RxDBAdapterHttp(db, { baseUrl, … })`，直接调 handler / `version()` / `isTableExisted()` | #1~#7、#9~#17（除 #8）：transport 级断言 |
| ② **core 全栈**  | `RxDB` + `SyncType.QueryCache` + `tests/local-adapter.fixture.ts` 注册为本地行缓存适配器        | #8：增量 pull 按 `idChunkSize` 分块      |

方式 ② 只为 AC#8 存在：「增量 pull 按 `idChunkSize` 分块」要走 core 的同步流程才会发生，纯适配器直调
拿不到分块行为。

**`offlineFallback` 不在本故事的验收面内**，AC#13 / #15 因此落在方式 ①。理由是它在 RxDB 全栈路径上
**根本开不出来**：公开的
[`FindOptions`](../../../packages/rxdb/src/repository/query-options.interface.ts) 只声明 `localCacheFirst`
与 `onSyncStats`，没有 `offlineFallback` 字段；
[`QueryCachePrimaryRepository.find()`](../../../packages/rxdb/src/repository/query-cache-primary.ts)
也只解构这三项传给 `#sync()`，运行时多塞的字段会被丢弃。真正的降级只存在于内部
`QueryCacheRepository.#wrapWithOfflineFallback()`，由 `QueryCacheFindOptions.offlineFallback` 开启——
直接 `new QueryCacheRepository()` 能测到它，但那不再是本故事承诺的「RxDB 全栈」路径。于是本故事只断言
**降级判据本身**（`HttpResponseError` 带数字 `status`、`isNetworkError` 判 `false` / `true`），
「吞不吞成缓存命中」由 core 侧的 [US-020 AC#16](../core/US-020-querycache-repository.md) 覆盖。
若将来要把 `offlineFallback` 透到公开 `FindOptions` 上，那是 core 的改动，另开故事。

`local-adapter.fixture.ts` 的**最小契约**不止三个写 duck。`createQueryCachePrimary()` 还会调
`localAdapter.getRepository(EntityType)` 取本地行仓储作为读出口，因此 fixture 至少要有：

- 适配器生命周期：`name` / `connect` / `disconnect` / `isTableExisted` / `createTables` / `mutations`
- `getRepository(EntityType)`，其返回对象至少实现 `find`（行读出口，`create` / `update` / `remove` 按用例需要补）
- QueryCache 三个 duck：`getMetadataByIds` / `upsertMany` / `deleteByIds`（US-212 结构隔离约束下，本包 MUST NOT 实现它们）

本地 `find` **可以不求值 `where`**（照抄 `src/__tests__/integration.spec.ts` 那份替身的立场），但 AC#8 的
用例因此必须**只用一个 `where`**——否则本地投影会把别的查询的行一并交给 `diffMetadata`，被当成孤儿删掉。

默认 harness 统一配 `templates.version` 与 `templates.isTableExisted`（两者**无默认路径**，见 AC#10 / #11）。

| #   | 前置条件                                                                                                                                                                                                                                          | 操作                                                                     | 预期结果                                                                                                                                                                                                                                                                                                                                                                       | 状态 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 后端已起（方式 ①）                                                                                                                                                                                                                                | 任意一次读                                                               | 全局 `fetch` **不是** mock（`vi.isMockFunction(globalThis.fetch)` 为 `false`）；真实 socket 建立、请求成功；`afterAll` 后 `stop()` 的 `close` 回调如期完成（端口释放），且参考后端**自持的 socket `Set`** 在 `stop()` 返回后为空——不用 `process.getActiveResourcesInfo()`：它只报资源**类型**、不报归属，在 vitest 并发与 undici 全局连接池下分不出哪个句柄是本 suite 的       | ✅   |
| 2   | 后端记录每个请求的实收 header 与原始 body                                                                                                                                                                                                         | `fetchMetadata`（**首页**，`pageToken` 缺省）                            | 服务端实收 `content-type: application/json`；body 反序列化后是 `{ where, offset, limit }`——客户端发的形状是 `{ where, offset, limit, pageToken }`，首页 `pageToken === undefined` 被 `JSON.stringify` 丢弃，故线上无此键；`where` 是 `RuleGroup` 结构、**一个 SQL 片段都没有**                                                                                                 | ✅   |
| 3   | 后端按[算子子集](#rulegroup-求值只做协议子集)求值 `where`                                                                                                                                                                                         | 多算子组合查询（`=`/`in`/`between`/`contains`/`null`）                   | 返回集合与本地按同一条件筛出的期望集合**逐 id 相等**——协议的 RuleGroup 翻译指南可被后端照抄实现                                                                                                                                                                                                                                                                                | ✅   |
| 4   | 后端返回**数组**（offset 形态），总行数 > `pageSize`                                                                                                                                                                                              | `fetchMetadata`                                                          | 客户端经真实网线翻页至短页终止，拼接结果完整无重无漏；后端每页 `rows.length === limit` 直至真末页                                                                                                                                                                                                                                                                              | ✅   |
| 5   | 后端开 `faults.truncateAt`，在**非末页**返回短页                                                                                                                                                                                                  | `fetchMetadata`                                                          | 客户端判为末页、静默少拉——用例名与注释写死这是[协议自身的契约边界](#短页即末页是契约不是-bug)、**不是 bug**，锚定「短页只在真末页出现」是服务端责任                                                                                                                                                                                                                            | ✅   |
| 6   | 后端返回 `{ rows, nextPageToken }`（token 形态）；种子**按乱序插入**（插入序 ≠ 排序序，否则「排序稳定」在静态 `Map` 上恒真、证不到东西）；开 `faults.mutateAfterPage: 1`                                                                          | `fetchMetadata`                                                          | token 逐页推进、末页缺省 `nextPageToken`，拼接无重无漏；**首页回包后**后端改动活动数据（增删各一行），后续页仍按 token 携带的快照标识取数——汇总 id 集合逐 id 等于**首个快照**，且各页内排序稳定                                                                                                                                                                                | ✅   |
| 7   | 后端按 `faults` 与服务端行为制造四种退化响应（换形态 = `shapeSwitchAt`、token 不推进 = `tokenStuck`、连续空页 = 服务端回空 `rows` + 客户端 `maxEmptyPages`、总页数触顶 = 服务端满页 + 客户端小 `maxPages`）                                       | `fetchMetadata`                                                          | US-212 AC#7 的四条 fail-fast 在真实后端上**各一条独立用例**：中途换形态 / token 不推进 / 连续空页触顶 / 总页数触顶，`fetchAllMetadataPages` 逐条抛错                                                                                                                                                                                                                           | ✅   |
| 8   | 后端收到 > `idChunkSize` 的 id（**方式 ②** core 全栈）                                                                                                                                                                                            | 增量 pull                                                                | 客户端按 `idChunkSize` 分块、每块一个真实请求；某块 id 被「真删」时后端返回**少于请求数**的行，客户端不重试不补空对象（对照桩测试 AC#9）                                                                                                                                                                                                                                       | ✅   |
| 9   | 后端实现 `create` / `update` / `delete`                                                                                                                                                                                                           | 三个写 duck 各跑一次真实请求                                             | 响应体是**后端定型**的完整行（`id`/`updatedAt` 由 server 生成，非回显入参）；后端实收的删除请求是 `POST :entity/delete` + `{ ids }`，**不是** `DELETE` 到集合                                                                                                                                                                                                                  | ✅   |
| 10  | 后端 `meta/version` 返回版本串。**两个分支前置条件不同**：透出分支要**显式配** `templates.version`（如 `{ path: 'meta/version' }`）；unsupported 分支要**不配**——`version` 无默认路径，缺省就整个不产出 handler（`rest.ts` 的 `REST_OPERATIONS`） | `version()`                                                              | 真实 `GET` 请求；配了 `templates.version` 则透出后端版本；未配时抛 unsupported、**不回落包版本号**（US-212 AC#24）                                                                                                                                                                                                                                                             | ✅   |
| 11  | 后端支持 `HEAD :entity`，且客户端**显式配** `templates.isTableExisted`（如 `{ path: ':entity' }`）——`isTableExisted` 同样无默认路径，不配时客户端缺省行为是复用 `onFetchMetadata` 的 `limit: 1` 探测，「实收 `HEAD`」的断言必挂                   | `isTableExisted(entity)`                                                 | 2xx → `true`、404 → `false`、500 → 抛错三分支各一条；后端实收的方法是 `HEAD`，不是复用 `limit:1` 的 `POST`                                                                                                                                                                                                                                                                     | ✅   |
| 12  | 适配器配了 auth hook，产出自定义 header                                                                                                                                                                                                           | 任意一次读                                                               | 后端实收该 header，值与 hook 返回一致，且与 transport 自带的 `content-type` **共存不互相顶掉**（undici 的 header 合并只有真网线能验）                                                                                                                                                                                                                                          | ✅   |
| 13  | 后端对某资源回 401 / 409 / 500（**方式 ①**）                                                                                                                                                                                                      | 对应读或写                                                               | transport 抛 `HttpResponseError`，错误带**数字** `status`；`isNetworkError` 判 `false`——这正是 core 不把业务错误降级成缓存命中的判据（US-020 AC#16），本故事只断言判据本身，不断言降级行为（见[两类驱动方式](#验收标准)）                                                                                                                                                      | ✅   |
| 14  | 后端主动 `destroy` socket / 目标端口拒连                                                                                                                                                                                                          | 任意请求                                                                 | 抛 core 的 `NetworkOfflineError`（undici 的真实 `fetch failed` 被归类，`isNetworkError` 判 `true`），**不得**原样上抛 `TypeError`；与 AC#13 两条路径可区分                                                                                                                                                                                                                     | ✅   |
| 15  | 后端 `faults.hang` 挂起，`requestTimeoutMs` 配小（**方式 ①**）                                                                                                                                                                                    | `fetchMetadata` / `findByIds` 各一条                                     | 真实超时：请求被 abort、抛 `NetworkOfflineError`、不永久挂起；对照 `disconnect()` 一例抛 `HttpDisconnectedError`。两者的 `isNetworkError` 判值必须**可区分**（超时 `true`、主动断开 `false`），断言止于判值                                                                                                                                                                    | ✅   |
| 16  | 后端按 `http-protocol.md`「[条件请求（可选）](../../../website/docs/adapters/http-protocol.md)」一节发 `ETag` 并认 `If-None-Match`，客户端 `conditionalRequests: true`                                                                            | 重复 `fetchMetadata` / `findByIds`                                       | 后端实收的第二个请求头含 `if-none-match`，回 `304`（无 body）；客户端还原上次 200 结果**而非空集**；内容变更后回 `200` + 新 `ETag`（对照 US-212 AC#28 的客户端契约）                                                                                                                                                                                                           | ✅   |
| 17  | 全套用例绿                                                                                                                                                                                                                                        | `pnpm nx test rxdb-adapter-http` + `pnpm nx typecheck rxdb-adapter-http` | 两者皆绿（typecheck 必须真的覆盖 `tests/**`，见[四处纳管](#tests-目录的四处纳管)）；新增的 `tests/**` 内**零** `vi.stubGlobal('fetch')`（`src/__tests__/**` 的既有桩原样保留）；`tests/**` 不计入覆盖率分母；**若存在 `it.fails` / `describe.skip`**，每一条都必须在用例注释里写明另开故事的 id，并在本故事关闭说明里列出条数——否则「全绿」被 expected-fail 撑起来了却看不出来 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

**关闭证据**：17 条 AC 全绿。`tests/` 下三个文件共 **45 条**用例，本包合计
**350 条**全绿（`tests/wire-integration.spec.ts` 45 + `src/__tests__/**` 305）；`lint` / `build` /
`typecheck` 三个 target 全绿，其中 `typecheck` 的第二条命令 `tsc -p tsconfig.spec.json --noEmit`
真的把 `tests/**` 纳入了严格校验（AC#17 的门禁项，不是形式）。覆盖率
99.81% / 97.81% / 100% / 99.8%，与本故事开工前**逐位相同**——`tests/**` 没进分母，这正是
四处纳管里 `coverage.exclude` 那一条要的效果。`tests/**` 内 `vi.stubGlobal('fetch')` **零处**
（文件里出现的三次全在注释里说明"这里为什么不打桩"），`it.fails` / `describe.skip` / `.todo`
**零条**——AC#17 末句那个"全绿被 expected-fail 撑起来"的口子不存在，因此"协议可互通"这个命题
是**完整成立**的，不带待办尾巴。

`src/__tests__/**` 一行未动（AC#17 与 Out of Scope 的硬要求）。

## 技术笔记

### 为什么现有测试不够：桩拦在错误的一层

本包 `src/__tests__/` 下多数 spec 用 `vi.stubGlobal('fetch', …)` 打桩（另有三档零桩纯单元测试
不经过 transport），拦截点是**适配器输出**；`config` / `conditional-cache` / `metadata` 三个是零桩纯单元测试，
不经过 transport。对 `src/__tests__/integration.spec.ts` 而言在 fetch 层打桩是**正确的**：US-212
AC#2 原文要证「适配器发出去的东西长什么样」，**若**改在 handler 层拦截，等于拿被测对象的输入冒充
它的输出。

但这套桩对下面这些**真实网线语义**是瞎的：

- `HttpTransport.#send` 用的是**全局 `fetch`**（`await fetch(request.url, …)`，无 import 注入），node
  环境里是 undici。undici 的 header 合并、`Content-Type` 自动补全、连接池 keep-alive、`fetch failed`
  消息、body 未消费导致的 socket 悬挂——这些只有真实 socket 才会发生。
- `http-protocol.md` 是一份**给任意后端看的协议规范**。它的价值取决于「后端照着实现、前端照着消费，
  两者真能对得上」。内存桩永远假设两者「本来就对得上」，测不出 RuleGroup 求值、翻页形状、
  `POST /delete`、`HEAD` 探测、`ETag` 这些**约定本身**是否自洽。

因此本故事的桩只做一件事：**把 `fetch` 换成真实后端**。断言主体不变，但「网线」从 `vi.fn` 换成了
`node:http` 的 TCP socket。

### 参考后端（conformance server）的形态

零第三方依赖，只用 `node:http`：

```ts
// tests/reference-server.ts（示意，非最终实现）
import { createServer } from 'node:http';

export interface ReferenceServer {
  baseUrl: string; // 如 http://127.0.0.1:54321
  /** 每个请求的实收方法 / 路径 / header / 原始 body，供 AC#2 / #9 / #11 / #12 / #16 断言 */
  received: ReceivedRequest[];
  /** 本 server 自己收下的 socket；AC#1 的句柄断言就查它，不查全局资源表 */
  sockets: Set<Socket>;
  /** 用例可注入的故障开关 */
  faults: {
    hang?: boolean; // AC#15 挂起不回包
    truncateAt?: number; // AC#5 在第 N 页提前返回短页
    forceStatus?: number; // AC#13 固定状态码
    dropEtag?: boolean; // AC#16 停发 ETag
    tokenStuck?: boolean; // AC#7 token 不推进
    shapeSwitchAt?: number; // AC#7 中途换形态
    mutateAfterPage?: number; // AC#6 第 N 页回包后改动活动数据，用来证明 token 携带的是冻结快照
  };
  stop(): Promise<void>;
}

export const startReferenceServer = async (): Promise<ReferenceServer> => {
  // 内存 Map<entity, Map<id, Row>> 作存储；listen(0) 拿随机端口，规避 CI 并发端口冲突
};
```

七个端点严格对照 `http-protocol.md` 的「端点一览」表，方法 / 路径 / 请求体 / 响应体逐字对齐：

| 端点                 | 实现要点                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:entity/metadata`   | 收 `{ where, offset, limit, pageToken }`，按 `where` 过滤；返回数组（offset）或 `{rows,nextPageToken}`（token）。**token 形态必须携带冻结快照**：首页请求时把命中的 id 序列按显式排序定格存下，`pageToken` 指向该快照 + 游标，后续页只从快照取数——AC#6 的「跨页快照一致」靠它才有可证的实现 |
| `:entity/by-ids`     | 收 `{ ids }`，返回存在 id 的完整行（缺 id 合法地少返回）                                                                                                                                                                                                                                    |
| `:entity` (POST)     | 生成 `id` + `updatedAt`，返回**持久化后**的完整行（不回显入参）                                                                                                                                                                                                                             |
| `:entity/:id`(PATCH) | 合并部分字段，返回更新后完整行                                                                                                                                                                                                                                                              |
| `:entity/delete`     | 收 `{ ids }`（`POST`，非真 `DELETE`），返回任意体                                                                                                                                                                                                                                           |
| `meta/version`       | 返回版本串 / `{ version }`                                                                                                                                                                                                                                                                  |
| `HEAD :entity`       | 2xx / 404 判定表是否存在                                                                                                                                                                                                                                                                    |

### RuleGroup 求值只做协议子集

`where` 的求值只实现协议要求的算子子集（`=` / `in` / `between` / `contains` / `null`——与 AC#3 的操作
列**逐字对齐**；`!=` 与大小比较不在本故事的验收面内，参考后端可以不实现，实现了也不算数），不求全
——它是**协议翻译指南的可执行样板**，不是又一个查询引擎。

AC#3 存在的理由：`http-protocol.md` 里翻译风险最高的一节就是 RuleGroup 算子表，后端最容易在这里实现
歪（`between` 的开闭区间、`null` 与缺字段、`contains` 的大小写）。只验传输层而不验求值，「协议可
互通」这个命题就只证了一半。断言口径是「后端返回集合 ≡ 本地按同一条件筛出的期望集合」，逐 id 比对。

其中 **`contains` 的大小写语义协议没有规定**。参考后端必须在实现处的注释里写明自选立场（建议
**case-sensitive**），并让本地期望集合按同一立场筛选——否则「逐 id 相等」的对照口径会在两边各自漂移，
用例挂了也说不清是谁错。若将来要把它变成协议约束，那是 `http-protocol.md` 的改动，另开故事。

### 短页即末页是契约，不是 bug

`http-protocol.md` 的翻页表写明：形态 A 下「返回少于 `limit` 条**必须**意味着最后一页；不得因限流 /
超时 / 服务端 max-rows 提前返回短页」。AC#5 用 `faults.truncateAt` 制造一次违约的提前短页，断言客户端
**判为末页并静默少拉**。

这条用例固化的是一个**已知的数据丢失行为**，目的是把「短页只在真末页出现」这条服务端责任钉死在
可执行处。用例名必须写成「限流式提前短页会被判末页——协议边界，非缺陷」之类，注释里点明改判的唯一
出路是改协议（形态 B）而不是改客户端；否则将来一定有人把它当红测试来「修」。

### 与现有测试的分工（不要删 `src/__tests__/`）

| 文件                                        | 拦截点                   | 证明的事                                             |
| ------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| `src/__tests__/*.spec.ts`（9 个，6 个含桩） | `vi.stubGlobal('fetch')` | 适配器**输出**正确：谁被调用、请求描述形状、错误分类 |
| `tests/wire-integration.spec.ts`（本故事）  | 真实 `node:http` 后端    | **协议可互通**：后端照文档实现、前端照文档消费能走通 |

两条互补，不是替代。删掉桩测试会丢「在 handler 层拦截」的 US-212 AC#2 语义；只留桩则漏掉真实网线
语义。AC#17 的「零 `vi.stubGlobal('fetch')`」**只约束新增的 `tests/**`**——本包 `src/__tests__/` 下
既有 fetch 桩一处都不动。

### 本地适配器 fixture 自带一份

`createLocalAdapter` 是 `src/__tests__/integration.spec.ts` 里一个**未导出的局部 const**（该文件零
`export`）。因此不复用、不抽取，而是在 `tests/local-adapter.fixture.ts` 里**自带一份**内存实现
（`Map` + `getMetadataByIds` / `upsertMany` / `deleteByIds`）。

抽成共享 fixture 需要改 `src/__tests__/`，与本故事「只新增测试资产」的边界冲突；两份内存替身各二十
余行、各自演进，重复的代价低于跨目录耦合。

不上真 sqlite 的理由：本故事证明「**远端到本地**这一段是真实网线」，本地落盘是 core 的账、已由
`packages/rxdb` 覆盖；再拉一份真 sqlite 只会让 `beforeAll` 变慢并引入无关的 IDB/OPFS 环境依赖。

### 端口分配与 CI 稳定性

- 用 `listen(0)` 拿**随机空闲端口**，构造 `baseUrl = 'http://127.0.0.1:' + port`。绝不硬编码端口
  （如 4000）——CI 容器里多 worker 并发会撞端口。
- `beforeAll` 起 server 并 `await` `listening` 事件（`listen(0)` 是异步的，不等会导致首个请求
  `ECONNREFUSED`）。
- **`afterAll` 的关闭顺序是 `server.close()` → `server.closeAllConnections()` → `await` close 回调。**
  `close()` 先停止接收新连接，再毁掉存量连接；反过来（先 `closeAllConnections()` 后 `close()`）在两次
  调用之间监听 socket 仍是开的，新连接照样能进来，防御就漏了。理由不是「keep-alive 必挂」——Node ≥ 19 的
  `server.close()` 已会自动关掉**空闲**连接，undici keep-alive 的连接在 body 消费完后即空闲，本仓库硬性
  要求 Node 26，普通用例不会卡。真正要防的是 **`faults.hang` 那类用例留下的半开连接**（请求还没回包，
  连接不是空闲态，`close()` 的回调会一直等到 `hookTimeout: 10000`）。`closeAllConnections()` 是一句成本
  为零的确定性防御，别省。
- 参考后端在 `connection` 事件里把 socket 收进 `sockets: Set`、`close` 事件里删掉；`stop()` 返回后该
  `Set` 必须为空——这是 AC#1 句柄断言的唯一判据。
- AC#14 的「拒连」**不要**用「`listen(0)` 取端口 → `close` → 复用该端口」：中间可能被其它进程抢占，
  CI 上偶发变绿。用确定性写法——连 `http://127.0.0.1:1`（特权端口，稳定 `ECONNREFUSED`），或对已建立
  的连接直接 `socket.destroy()`。
- 超时用 `requestTimeoutMs` 配小（如 500ms）+ `faults.hang` 挂起，而不是真 `sleep`；「主动断开」用
  `disconnect()` 触发 transport 的 `AbortController`，与超时走同一条 `AbortError` 分流、靠 `timedOut`
  标志区分（`transport.ts` 的 `classify()`——它是 **private** 方法，用例只能经 `sendJson` / `execute`
  间接观测抛出的错误类型，**不是**可直调的断言入口）。

### `tests/` 目录的四处纳管

`vite.config.mts` 的 `test.include` 已是 `['{src,tests}/**/*.{test,spec}.…']`，**无需改动**。但另有四处
只认 `src/__tests__/`，新目录必须补进去，否则开工即撞墙：

| 文件                 | 现状                                                                                                                                                                                                                                                                                                                                                        | 需要                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.spec.json` | `include` 的测试源全部指向 `src/**`（`src/**/*.spec.ts`、`src/__tests__/**/*.ts` 等），无 `tests/**`                                                                                                                                                                                                                                                        | 加 `tests/**/*.ts`，让 `tests/` 归属到 spec project。**但只加这一条不进 CI**，必须连同下面 `project.json` 一起改                                                                                               |
| `project.json`       | `typecheck` 只跑 `tsc --build tsconfig.lib.json --emitDeclarationOnly`，而 `tsconfig.lib.json` 的 `include` 只有 `src/**/*.ts`；根 `tsconfig.json` 虽然 `references` 了 spec project，但**没有任何 target 构建它**；根 `eslint.config.mjs` 也**没开** type-aware lint（无 `parserOptions.project` / `projectService`），所以「typed lint 会兜住」是不成立的 | `typecheck` 追加一条 `tsc -p tsconfig.spec.json --noEmit`（`--build` 模式不接受 `--noEmit`，用 `-p`）。**已实测当前仓库该命令 exit 0**，加上 `tests/**` 后新代码才真正被 TS 严格校验，AC#17 的门禁也才名副其实 |
| `eslint.config.mjs`  | `@nx/dependency-checks.ignoredFiles` 三条里唯一的测试目录是 `{projectRoot}/src/__tests__/**`（另两条是 `eslint.config.*` / `vite.config.*` 自身）                                                                                                                                                                                                           | 对称加 `{projectRoot}/tests/**`；`tests/reference-server.ts` 要 import `node:http` 与 vitest，不加会被判未声明依赖而报错——与 `src/__tests__/**` 当初被加进去同因                                               |
| `vite.config.mts`    | `coverage.exclude` 只有 `['**/__tests__/**','**/dist/**']`                                                                                                                                                                                                                                                                                                  | 加 `'**/tests/**'`。当前 `tests/**` 不在分母里，是 `coverage.include: ['src/**/*']` 的**直接结果**（不是侥幸）；写进 `exclude` 是把意图**显式声明**出来，防将来有人放宽 `include` 时测试资产被计入分母         |

### 可能的「测试暴露协议缺陷」处置

若参考后端按文档逐字实现后，某条 AC 暴露出协议**本身**不自洽，不在此故事内改 `src/`，而是：把该用例
标注为 `it.fails` 或单列一个 `describe.skip`，并在 story 里记录为「协议缺陷 → 另开 US」。这避免用
「改参考后端迁就前端」来掩盖协议问题。

**但 expected-fail 不能悄悄顶替验收**：每一条 `it.fails` / `describe.skip` 必须在用例注释里写明另开
故事的 id（先开故事拿到 id，再标注），并在本故事关闭说明里列出条数与对应故事。AC#17 的「全绿」因此
读作「全绿 + 明面上的 N 条待办」，而不是「协议已被证明可互通」——后者要等那 N 条转绿才成立。

## 实现文件

| 文件                                                        | 改动                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxdb-adapter-http/tests/reference-server.ts`      | 新增：零依赖 `node:http` 参考后端，七个端点 + `received` 记录 + `faults`                                                                                                           |
| `packages/rxdb-adapter-http/tests/local-adapter.fixture.ts` | 新增：内存本地适配器替身（自带，不从 `src/__tests__/` 抽）                                                                                                                         |
| `packages/rxdb-adapter-http/tests/wire-integration.spec.ts` | 新增：真实网线端到端用例（AC#1～17）                                                                                                                                               |
| `packages/rxdb-adapter-http/tsconfig.spec.json`             | `include` 加 `tests/**/*.ts`                                                                                                                                                       |
| `packages/rxdb-adapter-http/project.json`                   | `typecheck` 追加 `tsc -p tsconfig.spec.json --noEmit`；否则 `tests/**` 只被执行、不被 TS 校验                                                                                      |
| `packages/rxdb-adapter-http/eslint.config.mjs`              | `@nx/dependency-checks.ignoredFiles` 加 `{projectRoot}/tests/**`                                                                                                                   |
| `packages/rxdb-adapter-http/vite.config.mts`                | `coverage.exclude` 加 `'**/tests/**'`（`test.include` 已含 `tests/**`）                                                                                                            |
| `website/docs/adapters/http-protocol.md`                    | 「条件请求（可选）」一节：服务端 `ETag` / `If-None-Match` / `304` 语义 + 验收清单一条。**本故事允许的唯一 docs 改动**，AC#16 的协议锚点（见 In Scope）；**已落地，开工时无需再改** |
| `requirements/epics/epic-004-future-features.md`            | 故事清单条目 + 「另起故事不重开 US-212」理由（**已随本文件落地**）                                                                                                                 |
| `requirements/status-overview.md`                           | 汇总表计数 Backlog 8 → 9、合计 55 → 56 + 未来功能段 ⬜ 条目（**已随本文件落地**）                                                                                                  |
| `requirements/roadmap.md`                                   | 批次 3 排期行 + 约束 13「禁止改 `src/`」（**已随本文件落地**）                                                                                                                     |
| 状态流转                                                    | 关闭时把上述三处派生视图的 ⬜ / 未关闭计数改掉，story YAML `status` 是唯一真相源                                                                                                   |

## References

- 协议规范：[website/docs/adapters/http-protocol.md](../../../website/docs/adapters/http-protocol.md)
- 上游故事：[US-212 HTTP 远程适配器](./US-212-http-adapter.md)
- 桩测试（handler 输出层）：[integration.spec.ts](../../../packages/rxdb-adapter-http/src/__tests__/integration.spec.ts)
- 少行不补空的桩用例（US-212 AC#9）：[chunking.spec.ts](../../../packages/rxdb-adapter-http/src/__tests__/chunking.spec.ts) 的 `describe('失败与少行是两件事（AC#9）')`
- transport 实现：[transport.ts](../../../packages/rxdb-adapter-http/src/transport.ts) 的 `HttpTransport.#send` / `HttpTransport.classify`

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
