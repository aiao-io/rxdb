---
id: US-213
title: HTTP 适配器 wire 级端到端集成测试（真实 node 后端）
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-25
updated: 2026-08-25
tags: [adapter, http, testing, integration, conformance]
---

<!--
INVEST 检查清单:
- [x] Independent: 零前置。US-212 两阶段已全关（status: Done），本故事只加测试、不改适配器
- [x] Negotiable: 参考后端（conformance server）的文件布局、端口分配方式可调；「真实 socket + 真实 fetch」这条不可协商
- [x] Valuable: 现有 integration.spec.ts 用 vi.stubGlobal('fetch') 在 handler 输出层拦截，真实 transport 从未被真实网线打过；http-protocol.md 是「文档协议」，需要一份证明「后端照文档实现、前端照文档消费就能互通」的可执行验收
- [x] Estimable: 起一个 node:http 参考后端 + 复用现有 RxDB/本地 mock 接线，范围收敛在一个测试文件 + 一个 server fixture
- [x] Small: 只新增测试资产，不改 src/ 生产代码（除非暴露「文档协议本身无法实现」的缺陷，那属于 bug 修复另行处置）
- [x] Testable: 每条 AC 都是一条真实网线用例，断言主体是「字节在线上怎么走」而非纯函数返回值
-->

# 用户故事：HTTP 适配器 wire 级端到端集成测试

## 作为/我想要/以便

**作为** 按 `website/docs/adapters/http-protocol.md` 实现后端、并把 `@aiao/rxdb-adapter-http` 当 QueryCache 远端接入的开发者
**我想要** 一份**真实 node HTTP 后端 + 真实 fetch** 的端到端集成测试（不是 `vi.stubGlobal('fetch')` 的内存桩），
把「后端照协议实现、前端照协议消费」这条链路用可执行用例冻结
**以便** 协议文档不是一纸空文——后端与前端之间任何一方偏离 `http-protocol.md`（翻页形状、Content-Type、状态码、ETag、快照语义），测试当场变红，而不是等真实用户踩到「假孤儿 / 静默截断 / 拿陈旧缓存当最新」。

## 范围边界

### In Scope

- 一个**零第三方依赖**的参考后端（conformance server），用 `node:http` 内置模块实现 `http-protocol.md` 全部七个端点，监听 `listen(0)` 分配的随机端口
- 一条「真实网线」测试路径：`RxDBAdapterHttp` 的 transport 用**全局 undici fetch** 走本地 socket 打参考后端，**不 stub fetch**、不走 `MockAgent`
- 覆盖 wire 级协议不变量：`Content-Type: application/json`、JSON `RuleGroup` 请求体、翻页两种形态（offset / token）、分块 `findByIds`、写回执由服务端定型 `id`/`updatedAt`、`HEAD` 探测、错误状态码、超时、主动断开、ETag/`If-None-Match` 304
- 参考后端自身的**协议一致性**断言（它必须能证明「协议是可实现的」：短页只出现在真末页、token 逐页推进、快照一致、稳定排序）
- 测试跑在 `environment: 'node'`，纳入 `pnpm nx test rxdb-adapter-http`，不新增 vitest 配置项

### Out of Scope

- 改 `src/` 生产代码（`transport.ts` / `RxDBAdapterHttp.ts` 等）。本故事是纯测试资产；若参考后端暴露「协议文档无法实现」，那是协议缺陷，另开 bug 处理，不在本故事内修
- 为 transport 增加可注入的 `fetch` / 客户端覆盖点（US-212 阶段 A 明确「不提供 transport 覆盖点」）
- 真实 sqlite 本地适配器。本地行缓存继续用 `integration.spec.ts` 的内存替身——wire 层是本故事重点，本地落盘已有 `packages/rxdb` 的 QueryCache 套件覆盖
- 多语言后端的对照实现（Go / Python / Java 各写一个 server）。参考后端只写 node 一版，多语言是协议文档的阅读验收，不在此落地
- 非 QueryCache 的 Full / Filter 变更流同步测试
- 把参考后端作为公开 API / 发布产物（它只活在测试目录，不进 `dist`）

## 验收标准

| #   | 前置条件                                       | 操作                                                                         | 预期结果                                                                                                                                                                                                                              | 状态 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 参考后端已在 `beforeAll` 起于随机端口并返回 `baseUrl` | 构造 `RxDBAdapterHttp`（`createRestHandlers` 默认模板）+ 真实 fetch           | 测试**不调用** `vi.stubGlobal('fetch')` / `vi.spyOn(globalThis, 'fetch')`；`beforeAll` 与 `afterAll` 之间真实 socket 建立、请求成功、连接关闭，`afterAll` 后端口被释放                                                                   | ✅/⬜ |
| 2   | 后端 `fetchMetadata` 返回**数组（offset 形态）**，行数 > `pageSize` | `fetchMetadata`                                                             | 客户端经真实网线翻页至短页终止，拼接结果完整无重无漏；后端证明「短页只在真末页出现」——用一行「网关限流式提前短页」的对照用例证明**那会被判末页、协议无法自证截断**，从而锚定「服务端保证」这条契约的边界                                  | ✅/⬜ |
| 3   | 后端 `fetchMetadata` 返回 `{ rows, nextPageToken }`（token 形态） | `fetchMetadata`                                                             | token 逐页推进、末页缺省 `nextPageToken`；后端把「不推进的 token / 中途换形态」标为协议违约，客户端侧 `fetchAllMetadataPages` 对应抛错（复用 US-212 AC#7 的四条 fail-fast）                                                              | ✅/⬜ |
| 4   | 后端 `findByIds` 收到 > `idChunkSize` 的 id | 增量 pull                                                                     | 客户端按 `idChunkSize` 分块、每块一个真实请求；某块 id 被后端「真删」时返回**少于请求数**的行，客户端不重试不补空对象（对照 `integration.spec.ts` 的 AC#9，但那是在内存桩上）                                                               | ✅/⬜ |
| 5   | 后端实现 `create` / `update` / `delete` | 三个写 duck 各跑一次真实请求                                                    | 响应体是**后端定型**的完整行（`id` / `updatedAt` 由 server 生成，非回显入参）；`delete` 走 `POST :entity/delete` + `{ ids }`（对照 `http-protocol.md` 的「不用真 DELETE + body」）；断言抓到的请求是「POST 到 /delete」，不是 `DELETE` 到集合 | ✅/⬜ |
| 6   | 后端 `version` 端点返回版本串 | `version()`                                                                   | 真实 `GET` 请求；无 `onVersion` 时抛 unsupported（不回落包版本号，复用 US-212 AC#24），配了则透出后端版本                                                                                                                               | ✅/⬜ |
| 7   | 后端 `isTableExisted` 支持 `HEAD :entity` | `isTableExisted(entity)`                                                      | 2xx → `true`、404 → `false`、500 → 抛错三分支在真实 `HEAD` 上各一条；断言请求方法是 `HEAD`（不是复用 `limit:1` 的 `POST`）                                                                                                              | ✅/⬜ |
| 8   | 后端对某资源回 401 / 409 / 500 | 对应读或写                                                                    | 客户端 transport 抛 `HttpResponseError`，错误带**数字** `status`，`isNetworkError` 判 `false`、不被 `offlineFallback` 吞成缓存命中（真实状态码走线，非内存桩塞 `status` 字段）                                                             | ✅/⬜ |
| 9   | 参考后端主动关 socket / 永不 `listen` 的端口 | 任意请求                                                                       | transport 抛 core 的 `NetworkOfflineError`（node/undici 的真实 `fetch failed` 被归类，`isNetworkError` 判 `true`），**不得**原样上抛 `TypeError`；对照「后端回 401」一例证明状态码与传输失败两条路径可区分                                     | ✅/⬜ |
| 10  | 后端对某页挂起（收到请求不回包）超过 `requestTimeoutMs` | `fetchMetadata` / `findByIds` 各一条                                         | 真实超时：请求被 abort、抛 `NetworkOfflineError`、不永久挂起；对照「`disconnect()` 主动取消」一例证明两者错误可区分（超时判 true、断开判 false 不降级）                                                                                 | ✅/⬜ |
| 11  | 后端发 `ETag` 并认 `If-None-Match`，客户端 `conditionalRequests: true` | 重复 `fetchMetadata` / `findByIds`                                          | 第二次请求带 `if-none-match`，后端回 `304`，客户端还原上次 200 结果**而非空集**；断言后端真实收到的第二个请求头含 `If-None-Match`（真实 header 走线，非 mock 断言）                                                                       | ✅/⬜ |
| 12  | 全套用例绿 + 纳入门禁 | `pnpm nx test rxdb-adapter-http`                                             | 绿；无 `vi.stubGlobal('fetch')` 残留；覆盖率不因新增测试目录被计入生产 `src/**` 之外（`tests/` 或 `__tests__/` 已在 coverage `exclude` 内）                                                                                             | ✅/⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 为什么现有测试不够：桩拦在错误的一层

`src/__tests__/integration.spec.ts` 已经「把真的 RxDBAdapterHttp 挂进真的 RxDB」，但它的服务端是
`vi.stubGlobal('fetch', vi.fn(...))`——拦截点是**适配器输出**。US-212 AC#2 原文要证「适配器发出去的
东西长什么样」，所以拦截 handler 输出（`request()` 返回的 `HttpRequestSpec`）是**正确的**：它防的是
「在 handler 层拦截等于拿被测对象的输入冒充它的输出」。

但这套桩对下面这些**真实网线语义**是瞎的：

- `transport.ts` 的 `#send` 用的是**全局 `fetch`**（`await fetch(request.url, …)`，无 import 注入），
  node 环境里是 undici。undici 的 header 合并、`Content-Type` 自动补全、连接池、`fetch failed` 消息、
  body 未消费导致的 socket 悬挂——这些只有真实 socket 才会发生。
- `http-protocol.md` 是一份**给任意后端看的协议规范**。它的价值取决于「后端照着实现、前端照着消费，
  两者真能对得上」。内存桩永远假设两者「本来就对得上」，测不出文档里的翻页形状、`POST /delete`、
  `HEAD` 探测、`ETag` 这些**约定本身**是否自洽。

因此本故事的桩只做一件事：**把 `fetch` 换成真实后端**。handler 输出层的断言（AC#2/#3/#4/#5 的
「谁被调用了、网线上出去什么」）不变，但「网线」从 `vi.fn` 换成了 `node:http` 的 TCP socket。

### 参考后端（conformance server）的形态

零第三方依赖，只用 `node:http`：

```ts
// tests/reference-server.ts（示意，非最终实现）
import { createServer } from 'node:http';

export interface ReferenceServer {
  baseUrl: string;          // 如 http://127.0.0.1:54321
  stop(): Promise<void>;
  /** 用例可注入的故障开关：慢响应 / 固定状态码 / 停发 ETag / 关 socket */
  faults: { hangNextMetadata?: boolean; forceStatus?: number; dropEtag?: boolean };
}

export const startReferenceServer = async (): Promise<ReferenceServer> => {
  // 内存 Map<entity, Map<id, Row>> 作存储；listen(0) 拿随机端口，规避 CI 并发端口冲突
};
```

七个端点严格对照 `http-protocol.md` 的「端点一览」表，方法 / 路径 / 请求体 / 响应体逐字对齐：

| 端点               | 实现要点                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `:entity/metadata` | 收 `{ where, offset, limit, pageToken }`，按 `where` 过滤；返回数组（offset）或 `{rows,nextPageToken}`（token） |
| `:entity/by-ids`   | 收 `{ ids }`，返回存在 id 的完整行（缺 id 合法地少返回）                                        |
| `:entity` (POST)   | 生成 `id` + `updatedAt`，返回**持久化后**的完整行（不回显入参）                                 |
| `:entity/:id`(PATCH)| 合并部分字段，返回更新后完整行                                                                    |
| `:entity/delete`   | 收 `{ ids }`（`POST`，非真 `DELETE`），返回任意体                                              |
| `meta/version`     | 返回版本串 / `{ version }`                                                                     |
| `HEAD :entity`     | 2xx / 404 判定表是否存在                                                                        |

`where` 的 `RuleGroup` 求值只实现协议要求的算子子集（`=` / `!=` / 大小比较 / `contains` / `in` / `between` /
`null`），不求全——它是**协议翻译指南的可执行样板**，不是又一个查询引擎。

### 与现有测试的分工（不要删 integration.spec.ts）

| 文件                       | 拦截点             | 证明的事                                             |
| -------------------------- | ------------------ | ---------------------------------------------------- |
| `src/__tests__/integration.spec.ts` | `vi.stubGlobal('fetch')` | 适配器**输出**正确：谁被调用、请求描述形状、错误分类 |
| `tests/`（本故事）         | 真实 `node:http` 后端 | **协议可互通**：后端照文档实现、前端照文档消费能走通 |

两条互补，不是替代。删除 `integration.spec.ts` 会丢「在 handler 层拦截」的 AC#2 语义；只留桩则会漏掉
真实网线语义。本故事只新增 `tests/`，不动 `src/__tests__/`。

### 端口分配与 CI 稳定性

- 用 `listen(0)` 拿**随机空闲端口**，构造 `baseUrl = 'http://127.0.0.1:' + port`，再传给
  `RxDBAdapterHttp`。绝不硬编码端口（如 4000）——CI 容器里多 worker 并发会撞端口。
- `beforeAll` 起 server 并 `await` 一个 `listening` 事件（`listen(0)` 是异步的，不等会导致首个请求
  `ECONNREFUSED`）；`afterAll` `server.close()` 并 `await` `close` 事件，确保端口释放、无句柄泄漏。
- 超时用 `requestTimeoutMs` 配小（如 500ms）+ 后端 `faults.hangNextMetadata` 挂起，而不是真 `sleep`；
  「主动断开」用 `disconnect()` 触发 transport 的 `AbortController`，与超时走同一条 `AbortError` 分流。

### 本地适配器继续用内存替身

复用 `integration.spec.ts` 的 `createLocalAdapter`（内存 `Map` + `getMetadataByIds` / `upsertMany` /
`deleteByIds`）。理由：本故事证明「**远端到本地**这一段是真实网线」，本地落盘是 core 的账，已由
`packages/rxdb` 覆盖；为 wire 测试再拉一份真 sqlite 只会让 `beforeAll` 变慢、引入无关的 IDB/OPFS 环境
依赖，与本故事的断言主体（字节在线上怎么走）无关。

### 可能的「测试暴露协议缺陷」处置

若参考后端按文档逐字实现后，某条 AC 暴露出协议**本身**不自洽（例如 offset 形态的「短页即末页」与
「网关限流短页」不可调和），不在此故事内改 `src/`，而是：把该用例标注为 `it.fails` 或单列一个
`describe.skip`，并在 story 里记录为「协议缺陷 → 另开 US」。这避免用「改参考后端迁就前端」来掩盖
协议问题。

## 实现文件

- `packages/rxdb-adapter-http/tests/reference-server.ts` — 零依赖 `node:http` 参考后端（conformance server），实现 `http-protocol.md` 七个端点 + 故障注入开关
- `packages/rxdb-adapter-http/tests/wire-integration.spec.ts` — 真实网线端到端用例（AC#1～11）
- `packages/rxdb-adapter-http/vite.config.mts` — 无需改动（`include` 已含 `tests/**`，`coverage.exclude` 已含测试目录）
- `requirements/status-overview.md` — 关闭本故事时在 adapter 段补一条 US-213 记录（派生视图，随 YAML 同步）

## References

- 协议规范：[website/docs/adapters/http-protocol.md](../../website/docs/adapters/http-protocol.md)
- 上游故事：[US-212 HTTP 远程适配器](./US-212-http-adapter.md)
- 现有桩测试：[packages/rxdb-adapter-http/src/__tests__/integration.spec.ts](../../packages/rxdb-adapter-http/src/__tests__/integration.spec.ts)
- transport 实现：[packages/rxdb-adapter-http/src/transport.ts](../../packages/rxdb-adapter-http/src/transport.ts)

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
