---
id: US-214
title: HTTP 适配器浏览器端到端 demo（Angular 前端 + node:sqlite 参考后端）
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-26
updated: 2026-08-27
tags: [adapter, http, demo, e2e, angular, node, sqlite, cors]
---

<!--
INVEST 检查清单:
- [x] Independent: 零前置。US-212 已 Done 且按 stable 发布；与 US-213 无先后关系（两条各建各的后端，见「与 US-213 的分工」）
- [x] Negotiable: 端口号、UI 形态、种子行数、实体字段可调；「浏览器真实 fetch + 真 sqlite 后端 + 真本地行缓存」三条不可协商——去掉任何一条，本故事就退化成 US-213 的重复
- [x] Valuable: `http-protocol.md` 全篇没有一个字提 CORS，而浏览器接入方 100% 会撞上它；跨源下 `HttpTransport.#cacheAndReturn` 读不到 ETag 会让条件请求静默失效且不报错。今天没有任何用例或 demo 走过浏览器
- [x] Estimable: 一个 node 后端 app（7 端点 + RuleGroup→SQL + 种子）、一个 Angular app（照 dev-rxdb-supabase 接线）、一个 playwright e2e app
- [x] Small: 体量确实偏大，因此按 CONVENTIONS「大故事分阶段」切成 A（能手工跑通）/ B（自动化门禁 + 浏览器专属证据）两阶段，不拆子文件
- [x] Testable: 17 条 AC，阶段 B 的每一条都落成一个 playwright 用例；阶段 A 的每一条都能用一条 curl 或一次页面操作复验
-->

# 用户故事：HTTP 适配器浏览器端到端 demo

## 作为/我想要/以便

**作为** 打算把自己的 REST 后端接上 `@aiao/rxdb-adapter-http`、并在**浏览器里**跑 RxDB 的开发者
**我想要** 一个能一键起起来的完整 demo——Angular 前端（`SyncType.QueryCache` + wa-sqlite 行缓存）
打一个**真 SQLite 落盘**的 node 后端，两端**不同源**，页面上能看见每一次真实请求
**以便** 我在写自己的后端之前，先有一份**照抄就能跑**的参考实现，并且那些 vitest 用例结构上
够不到的浏览器现实（CORS 预检、`ETag` 要显式暴露才读得到、离线降级、孤儿行清理）
在 demo 里当场发生、当场看见，而不是等我上线后自己踩。

## 范围边界

### In Scope

- **`apps/dev-rxdb-http-server`**：零第三方运行时依赖的 node 后端，`node:http` + `node:sqlite`，
  按 `http-protocol.md` 实现七个端点，数据**真落盘**到 sqlite 文件
- **`RuleGroup` → 参数化 SQL** 的翻译模块：协议文档「翻译指南」一节的可执行样板
- **`apps/dev-rxdb-http`**：Angular 前端，`SyncType.QueryCache` + `remote: {adapter:'http'}` +
  `local: {adapter:'wa-sqlite'}`，handlers 走 `createRestHandlers()`
- **协议流量面板**：页面上按发生顺序列出真实请求（方法 / 路径 / 状态码 / 耗时 / 是否 304）
- **`apps/dev-rxdb-http-e2e`**：playwright，`webServer` 同时起前后端，阶段 B 每条 AC 一个用例
- **跨源（CORS）**：前后端**故意不同源**（4300 / 4301）。同源会让本故事最重要的两条证据消失
- **本故事允许的唯一 docs 改动**：给 `http-protocol.md` 补一节「跨源（CORS）」——
  预检要放行哪三个请求头、`Access-Control-Expose-Headers: ETag` 是条件请求在浏览器可用的**前置**、
  验收清单加一条。理由见[「协议文档缺了 CORS 这一节」](#协议文档缺了-cors-这一节)

### Out of Scope

- **改 `packages/rxdb-adapter-http/src/`**。若 demo 暴露出客户端**本身**的缺陷（最可能的一条：
  跨源读不到 ETag 时应不应该告警而不是静默降级），本故事只把症状冻结成用例并记为
  「→ 另开 US」，不动已按 `stable` 发布的包。同 US-213 的处置口径（[roadmap 约束 13](../../roadmap.md#排期约束)）
- **把 demo 后端做成可发布产物或"官方 SDK"**。它是 `apps/` 下的参考实现，不进 `dist`、不发 npm
- **为"以后换 PostgreSQL"预留抽象层**。用户意图里的「先用 sqlite」由「方言相关代码只集中在
  `rule-group-to-sql.ts` 一个文件」承接，不提前抽 `Store` 接口——病灶数尚未 ≥ 抽象数
  （[CONVENTIONS 价值待证](../../CONVENTIONS.md#价值待证--价值待证)）
- **真实身份认证**。auth hook 返回一个固定的假 token，后端只校验它存在；接 IdP 是另一件事
- **Full / Filter 同步、离线写队列、冲突解决**。v1 的 HTTP 适配器只支持 `QueryCache`
- **React / Vue 双端 demo**。「三框架对称」铁律约束的是 `packages/` 下的公开 API，不是 `apps/` 下的
  演示应用——`dev-rxdb-supabase` 同样只有 Angular 一版
- **替代 US-213**。两条各建各的后端，互不复用，理由见下表

## 交付阶段

| 阶段  | 内容                                      | 关闭判据                                          | 状态 |
| :---- | :---------------------------------------- | :------------------------------------------------ | :--- |
| **A** | 后端 + 前端跑通主路径，**人工**端到端可见 | AC#1～8 全绿；两条 `serve` 命令起来就能操作数据   | ✅   |
| **B** | 浏览器专属协议证据 + 自动化 e2e 门禁      | AC#9～17 全绿；`pnpm nx e2e dev-rxdb-http-e2e` 绿 | ✅   |

阶段 A 有独立价值：它交付的是「照抄就能跑的参考实现」，不依赖阶段 B 就能被人用。
阶段 B 把阶段 A 的手工验收变成门禁，并把三条**只有浏览器能证**的事钉死。
**全部阶段关闭后才置 `Done`**（[CONVENTIONS 大故事分阶段](../../CONVENTIONS.md#大故事分阶段不拆子故事文件硬规则)）。

## 验收标准

前置条件里的「两端已起」统一指：后端在 `127.0.0.1:4301` 且已跑过 `seed`，前端在 `127.0.0.1:4300`，
前端的 `baseUrl` 指向 `http://127.0.0.1:4301/v1`。

### 阶段 A：demo 可跑通

| #   | 前置条件                                | 操作                                                                                   | 预期结果                                                                                                                                                                                                                                                                 | 状态 |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 仓库无 `apps/dev-rxdb-http-server`      | `pnpm nx serve dev-rxdb-http-server`                                                   | 服务起在 4301；`package.json` 的 `dependencies` **为空**——只用 `node:http` / `node:sqlite` / `node:crypto` 三个内置模块；库文件落 `apps/dev-rxdb-http-server/.data/demo.sqlite` 且该目录进 `.gitignore`                                                                  | ✅   |
| 2   | 后端已起                                | 把 `http-protocol.md`「端到端示例（curl）」的五条命令 baseUrl 换成本地后逐条执行       | 五条**逐字可跑**，响应体形状与文档示例一一对应；实体取 `Recipe → recipes`、字段取 `title` / `status` / `price` / `tag`，与文档示例**同名**——demo 后端因此是那份文档的活靶场，而不是又一套自造样例                                                                        | ✅   |
| 3   | 后端持有 `recipes` 表                   | `POST recipes/metadata` 递含 `=` / `in` / `between` / `contains` / `null` 的 RuleGroup | `where` 编译成**参数化 SQL**：每个 `value` 走 `?` 绑定、一次字符串拼接都没有；`field` 过列名白名单，命中不了当场 `400` 且**不进 SQL**；返回集合与同条件手写 SQL 的结果逐 id 相等。`contains` 的大小写立场在实现处注释里写明（协议未规定，见 US-213 同名讨论）            | ✅   |
| 4   | 表内 250 行、前端 `pageSize: 50`        | 前端触发一次全量查询                                                                   | 后端每页 `rows.length === limit` 直至真末页，**短页只出现在末页**；`ORDER BY updatedAt, id` 跨页稳定；拼接结果无重无漏（250 行 = 6 次请求，末次是空页，见[落地偏差](#落地偏差)第 1 条）                                                                                  | ✅   |
| 5   | 后端实现 `create` / `update` / `delete` | 页面上新建 / 编辑 / 删除各一次                                                         | 响应体是**读回数据库后**的完整行——`id` 由 `crypto.randomUUID()`、`updatedAt` 由服务端写 ISO 串，都不是回显入参；删除实收 `POST recipes/delete` + `{ids}`，**不是** `DELETE` 到集合                                                                                       | ✅   |
| 6   | 后端有 `seed` / `reset` 两个 target     | 连续执行 `pnpm nx run dev-rxdb-http-server:reset seed` 两遍                            | 两遍产出的 250 行**逐字节相同**：标题 / 状态 / 价格 / 标签按固定规则生成，`id` 由行序号确定性派生，**零随机、零 `Date.now()`**；否则 e2e 断言只能写成"大概有几条"                                                                                                        | ✅   |
| 7   | 仓库无 `apps/dev-rxdb-http`             | `pnpm nx serve dev-rxdb-http`                                                          | Angular 起在 4300；`SyncType.QueryCache` + `remote: {adapter:'http'}` + `local: {adapter:'wa-sqlite'}`；handlers 用 `createRestHandlers()` 并**显式配** `templates.version`；`pageSize: 50` / `idChunkSize: 20`（理由见[默认值会让 demo 白跑](#默认配置会让-demo-白跑)） | ✅   |
| 8   | 两端已起                                | 打开列表页并操作                                                                       | 列表渲染、过滤面板能组合 AC#3 的五类算子、增删改可用；「后端版本」显示 `version()` 的返回值（后端串，**不是**包版本号）；**协议流量面板**按发生顺序列出真实请求的方法 / 路径 / 状态码 / 耗时 / 是否 304                                                                  | ✅   |

### 阶段 B：浏览器专属证据 + 自动化门禁

| #   | 前置条件                                                                       | 操作                                                                                                            | 预期结果                                                                                                                                                                                                                                                                         | 状态 |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 9   | 前后端**不同源**（4300 / 4301）                                                | 任意一次读、一次 `PATCH`、一次 `HEAD`                                                                           | 浏览器对 `POST :entity/metadata` 先发 `OPTIONS` 预检（`content-type: application/json` 不在 CORS 安全列表内）；`PATCH` 因方法不在安全列表**必然**预检；后端 `Access-Control-Allow-Headers` 含 `content-type` / `authorization` / `if-none-match`，七端点全部可用                 | ✅   |
| 10  | 后端**不**回 `Access-Control-Expose-Headers`，前端 `conditionalRequests: true` | 重复同一次 `fetchMetadata`                                                                                      | `HttpTransport.#cacheAndReturn` 的 `response.headers.get('etag')` 读到 `null` → 走 `cache.delete(key)` → 第二次请求**不带** `if-none-match`、仍回 `200`。条件请求**全程不命中、不报错、无任何日志**。用例名写死这是[已知症状](#跨源下-etag-读不到条件请求静默失效)，不是待修 bug | ✅   |
| 11  | 后端回 `Access-Control-Expose-Headers: ETag`（demo 默认开）                    | 同 AC#10                                                                                                        | 第二个请求实收 `if-none-match`、后端回 `304`（无 body），前端还原上次结果**而非空集**；流量面板显示 `304`；内容改动后回 `200` + 新 `ETag`                                                                                                                                        | ✅   |
| 12  | `http-protocol.md` 无任何 CORS 相关内容                                        | 补写「跨源（CORS）」一节                                                                                        | 该节写明：三个必须放行的请求头、`PATCH` 必然预检、`Access-Control-Expose-Headers: ETag` 是条件请求在浏览器可用的**前置**（漏配的后果是 AC#10 那条静默失效）；「验收清单」加一条。**本故事唯一允许的 docs 改动**                                                                  | ✅   |
| 13  | demo 有「模拟离线」开关（打 `POST __control/offline`）                         | 打开开关后重新查询                                                                                              | transport 抛 `NetworkOfflineError`、`offlineFallback` 命中本地 wa-sqlite 行缓存、页面进离线态且**仍能看到数据**；关闭开关后恢复真实拉取。对照一条：后端回 `409` 时**不降级**，页面报错                                                                                           | ✅   |
| 14  | 后端绕过前端直接删掉一行                                                       | 前端重新查询                                                                                                    | 该行从本地行缓存中消失（core 调 `deleteByIds` 做孤儿清理）、UI 同步移除——证明"远端权威"在真实落盘的两端之间成立                                                                                                                                                                  | ✅   |
| 15  | 后端支持 `?pageMode=token`，前端可切换                                         | 用 token 形态跑一次全量查询                                                                                     | token 逐页推进、末页缺省 `nextPageToken`；token 里编码**读取水位线**，翻页途中另一个连接插入新行不会造成重复 / 遗漏——这是协议「快照一致」在 offset 形态下**做不到**、必须用形态 B 的那条                                                                                         | ✅   |
| 16  | 仓库无 `apps/dev-rxdb-http-e2e`                                                | `pnpm nx e2e dev-rxdb-http-e2e`                                                                                 | playwright `webServer` 起后端（**临时目录的库文件 + 种子**，不碰 `.data/` 的开发库）与前端静态服务；AC#9～15 各至少一条用例；全绿                                                                                                                                                | ✅   |
| 17  | 三个新 project 已建                                                            | `pnpm nx run-many -t lint typecheck test build --projects=dev-rxdb-http,dev-rxdb-http-server,dev-rxdb-http-e2e` | 全绿、零 ESLint 警告；`rule-group-to-sql.ts` 有单测覆盖（它是后端唯一含分支逻辑的模块，其余端点都是直筒子）；三个 project 打上与既有 demo 一致的 tag                                                                                                                             | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 落地偏差

写 AC 时按推演写下、实际做出来发现不成立的几处。全部按实测结果落地；AC 的**要求**保持原样不追改，
只更正 AC#4 括号里那处算术标注（见第 1 条）——那是个数字，不是一条验收。

1. **AC#4 括号里原写「250 行 = 5 次请求」，实测是 6 次，已就地更正。** offset 形态的翻页在收到**满页**后必然再要
   下一页，而 250 恰好被 50 整除，于是第 6 次请求拿到的是空页——它才是循环的终止条件。
   AC 正文那三条（短页只出现在末页、`ORDER BY updatedAt, id` 跨页稳定、无重无漏）不受影响。
   这条算术同样决定了 AC#11 的用例断言形状：内容变化只落在最后一页上，所以断言的是
   「这一轮里**有**一次 `200`」而不是「最后一次是 `200`」，见
   `apps/dev-rxdb-http-e2e/src/conditional-requests.spec.ts` 的注释。

2. **AC#5 的「完整行」是按实体算的，不是按业务列算的。** `EntityBase` 预声明的 `createdAt`
   没写 `nullable`，本地行缓存那张表上它就是 `NOT NULL`；后端少回这一列，网线上一切正常，
   错误发生在客户端把远端行 upsert 进 wa-sqlite 那一步——`NOT NULL constraint failed:
public$recipes.createdAt`，报的还是后端从没听说过的列名。参考后端因此把 `createdAt`
   作为服务端定型的真列一起持久化、一起回。**`http-protocol.md` 全篇没写这条约束**，
   而 AC#12 限定了本故事唯一允许的 docs 改动是 CORS 一节，所以它眼下只落在
   `apps/dev-rxdb-http-server/src/db.ts` 与 `server.spec.ts` 的注释里 → **另开 US 补协议文档**。

3. **前端实体配了 `syncStaleTime: 0`。** 默认的 1000ms「刚同步过」记忆窗口本身完全合理，
   但本 demo 的全部意义是把协议流量摆出来看，而「重新查询」若落在窗口内就直接读本地投影：
   一次请求都不发、也不报错。观测台上没有比「按钮按了但什么都没发生，且这是对的」更坏的现象。

4. **QueryCache 实体的远端适配器若不在库级 `sync` 里，core 会静默永挂。**
   `RxDB.init()` 只从库级配置喂 `#remote_adapter_sub`，实体级 `sync.remote.adapter` 不参与；
   缺了它 `combineLatest` 既不 emit 也不 error，UI 永远停在「加载中…」且零诊断。
   非 QueryCache 路径早有 `RxDBMissingPrimaryAdapterError` 顶这个位置 → **另开 US**。
   已落成 [US-021](../core/US-021-querycache-adapter-fail-fast.md) 并于 2026-08-27 关闭：
   `validateSyncStrategy` 增判 `missingQueryCacheAdapter`，现在漏配在 `RxDB.init()` 就抛。
   本 demo 的 [setup_rxdb_http.ts](../../../apps/dev-rxdb-http/src/app/setup_rxdb_http.ts)
   注释已随之改口径——**它是这条修复的现场复验对象**（US-021 AC#7）。

5. **AC#15 的 `?pageMode=token` 走不了 `createRestHandlers()`**（模板的 `UNSAFE_IN_SEGMENT`
   拒绝 `?`）。改成双通道：后端同时认查询串与一个服务端默认形态开关
   （`POST __control/page-mode`），e2e 走后者。

6. **AC#2 与「无真实身份认证」的冲突**按「缺 `Authorization` 放行、带了但格式不对回 `401`」
   化解——否则文档里那五条 curl 有四条没带 token，逐字跑必然 `401`。

7. **跨源读不到 ETag** 已按 AC#10 冻结成用例（用例名写明是已知症状），不动 `stable` 包 → **另开 US**。

## 技术笔记

### 与 US-213 的分工：两条各建各的后端，不复用

[US-213](./US-213-http-wire-integration-test.md) 也要写一个参考后端，但两者**证明的事不同**，
强行复用会让两边都变形：

| 维度         | US-213 参考后端                            | 本故事 demo 后端                                    |
| :----------- | :----------------------------------------- | :-------------------------------------------------- |
| 运行环境     | vitest / node，**undici** fetch            | 浏览器，**Chromium** fetch                          |
| 存储         | 内存 `Map`                                 | **真 sqlite 文件**                                  |
| `where` 求值 | JS 里 `Array.filter`                       | **参数化 SQL**                                      |
| 本地行缓存   | 内存替身 fixture                           | **真 wa-sqlite**（OPFS）                            |
| 同源         | 是（无 CORS）                              | **否**（有预检、有暴露头问题）                      |
| 故障注入     | `faults` 开关，覆盖 6 种退化响应           | 一个 `__control/offline` 开关，够 UI 演示即可       |
| 证明的事     | 协议的 **wire 不变量**在真实 socket 上成立 | 协议在**浏览器 + 真数据库**这一整条产品路径上可互通 |

三件事本故事能证、US-213 结构上**够不到**：

1. **CORS**。undici 不做同源策略，`vi.stubGlobal('fetch')` 更不做。协议文档全篇零处提 CORS，
   而任何浏览器接入方都会撞上（AC#9 / #12）。
2. **`RuleGroup → SQL`**。US-213 的后端在 JS 里过滤，等于假设"翻译这一步没问题"——而协议文档自己
   写明这是**翻译风险最高**的一节。只有真数据库才逼出参数绑定、列名白名单、`between` 开闭区间。
3. **真本地行缓存**。US-213 明确把「真实 sqlite 本地适配器」列为 Out of Scope，用内存替身。
   孤儿清理（AC#14）与 `offlineFallback`（AC#13）在真 OPFS 上的行为因此从未被打过。

**先后无关**：两条零前置、可并行开工。若 US-213 先落地，本故事**不**去 import 它的
`tests/reference-server.ts`——那是测试目录里的资产，跨 `packages/` → `apps/` 引用会把一个明确
"不进 `dist`"的文件变成 app 的依赖。**两份独立实现本身也是证据**：协议若只有一种实现方式能跑通，
它就不是协议。

### 后端选型：`node:sqlite` + `node:http`，零第三方依赖

Node 26 内置 `node:sqlite`，仓库已有先例——`packages/rxdb-adapter-electron/src/sqlite-script.ts`
就是 Electron 主进程侧的 `node:sqlite` 宿主。因此 demo 后端**不引入** express / fastify /
better-sqlite3 / knex 中的任何一个：

- 与 US-213 参考后端同风格（零依赖），两份实现的对照才有意义；
- `apps/` 下多一个带自己 `node_modules` 的服务端框架，会让 `pnpm test-all` 的 affected 图多出
  一条与被测能力无关的边；
- 协议本身只有七个端点、两个必选，路由用 `URL` + `switch` 二十行写完。上框架是**给读者增加**
  阅读成本——demo 的读者要看的是协议怎么实现，不是 express 怎么用。

**不为"以后换 PG"预留抽象层。** 你说的「先使用 sqlite」我理解为「sqlite 够用且好测」，
而不是「现在就要能换」。落实方式是：**方言相关的代码只集中在 `rule-group-to-sql.ts` 一个文件**，
其余端点处理器只碰 `id` / `updatedAt` 这些协议字段。真要加 PG 时，要换的就是那一个文件——
届时再抽接口，抽象数才不会超过病灶数（AGENTS.md 铁律「无 fallback 兜底」的同一条理由）。

### 协议文档缺了 CORS 这一节

`http-protocol.md` 的定位是「面向**任何语言后端**的对接规范」，「通用约定」一节列了 URL 拼接、
`Content-Type`、认证 header、时间戳、`encodeURIComponent` 五条，**没有一条提到跨源**。
但客户端最主流的运行环境就是浏览器，而协议本身注定触发预检：

| 触发点                     | 为什么必然预检                                                           |
| :------------------------- | :----------------------------------------------------------------------- |
| `POST :entity/metadata`    | `Content-Type: application/json` 不在 CORS 安全列表的三个值里            |
| `PATCH :entity/:id`        | `PATCH` 不在安全方法（`GET`/`HEAD`/`POST`）里                            |
| 认证 header                | `Authorization` 不是安全列表请求头                                       |
| 条件请求的 `If-None-Match` | 同上，不是安全列表请求头，且**必须**在 `Access-Control-Allow-Headers` 里 |

AC#12 因此补一节，把这四条 + `Access-Control-Expose-Headers: ETag` 写进协议。
这是本故事唯一允许的 docs 改动——**不改客户端行为**，只是把一个已经存在的硬前置写下来。

### 跨源下 ETag 读不到，条件请求静默失效

`HttpTransport.#cacheAndReturn` 读响应头拿 ETag：

```ts
const value = await decodeJson(response, url);
const etag = response.headers.get('etag');
if (etag === null) {
  // 远端停发 ETag：留着旧条目就是拿一个再也换不到 304 的令牌去问
  cache.delete(key);
  return value;
}
```

（[transport.ts](../../../packages/rxdb-adapter-http/src/transport.ts) 的 `HttpTransport.#cacheAndReturn`）

这个分支写得对——它处理的是「后端停发 ETag」。但**跨源**下还有第二种命中方式：后端明明发了
`ETag`，浏览器却因为响应里没有 `Access-Control-Expose-Headers: ETag` 而**不把它交给 JS**，
`headers.get('etag')` 同样返回 `null`。后果是：

- 每次都走 `cache.delete(key)`，缓存永远是空的；
- 下次请求因此不带 `if-none-match`，后端永远回 `200`；
- **全程零错误、零日志**，开了 `conditionalRequests: true` 与没开完全一样。

AC#10 把这条冻结成**已知症状**用例（后端故意不发暴露头），AC#11 是配上之后的对照。
用例名与注释必须点明「这不是待修 bug，是浏览器 CORS 的既定行为」——否则将来一定有人来"修"它。

**若判定客户端应当在这里告警**（比如首次读不到 ETag 时 warn 一次），那是 `src/` 改动，
按 Out of Scope 与 [roadmap 约束 13](../../roadmap.md#排期约束) 的同一口径**另开故事**，
不在本故事内动一个已按 `stable` 发布的包。

### 默认配置会让 demo 白跑

`DEFAULT_HTTP_CONFIG`（[config.ts](../../../packages/rxdb-adapter-http/src/config.ts)）：

```ts
pageSize: 1000,
idChunkSize: 100,
```

demo 种子 250 行。照默认值跑，`fetchMetadata` **一次请求就结束**、`findByIds` **一块就发完**——
翻页（AC#4）与分块这两条路径在整个 demo 里**一次都不会发生**，而它们恰恰是协议里最容易实现歪的部分。

所以 AC#7 要求前端显式配 `pageSize: 50` / `idChunkSize: 20`：250 行 → 5 页 metadata、
若干块 by-ids，两条路径都真实发生，流量面板上肉眼可数。**这一条不是调参偏好，是 demo 能不能
证明东西的分水岭**，写进 AC 而不是留给实现者临场决定。

### 前端接线：抄 `dev-rxdb-supabase` 而不是 `dev-rxdb-angular`

脚手架（`project.json` / `tsconfig.*` / `eslint.config.mjs` / `vite.config.mts` 的形状）照
`dev-rxdb-angular` 抄；但**应用形态**照 [dev-rxdb-supabase](../../../apps/dev-rxdb-supabase/)：
它才是仓库里既有的「远端权威 + 本地 sqlite 行缓存」demo，`remote-sync-state.ts` /
`app-header.ts` 的在线离线指示、`setup_rxdb_wa-sqlite.ts` 的 worker 工厂、`runtime-config.ts` 的
环境读取都能直接对照。`dev-rxdb-angular` 是**多本地适配器**的演示，槽位形状不一样。

一处必须**不抄** `dev-rxdb-angular` 的地方：它的 `serve` 配了 COOP / COEP：

```json
"headers": {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
}
```

（[apps/dev-rxdb-angular/project.json](../../../apps/dev-rxdb-angular/project.json) 的 `serve.configurations.development`）

那是给 wa-sqlite 同步构建（需要 `SharedArrayBuffer`）准备的。`dev-rxdb-supabase` 的 `serve`
**没有**这两个头，走异步构建照样跑。本故事跟 supabase 走：本故事的核心是跨源 fetch，
COEP `require-corp` 会给跨源响应再叠一层策略判定——**推断**：CORS 模式且校验通过的请求不受
`require-corp` 拦截，因此即使开了也不会挂；但一旦后端 CORS 配漏，症状会同时从 COEP 和 CORS
两个方向报出来，把排查方向引偏。不开就没有这个歧义，收益为零、成本为零。

### 端口、库文件与 e2e 稳定性

- 端口固定：前端 **4300**、后端 **4301**（现有占用：4200 angular / 4201 react / 4203 vue 与 supabase
  ——这两个 demo 实配同一端口，历史遗留，不在本故事范围；4202 无人使用）。
  **必须不同源**——同源会让 AC#9～#12 四条全部失去意义。
- 开发库 `apps/dev-rxdb-http-server/.data/demo.sqlite` 进 `.gitignore`；**e2e 用临时目录另起一份**
  并在 `webServer` 启动时种子。e2e 直接打开发库，会让"本地跑过一遍 demo"变成 e2e 挂掉的原因。
- `reset` 的实现是**删文件重建**，不是 `DELETE FROM`：后者留下自增状态与页碎片，"两遍结果逐字节
  相同"（AC#6）就不再成立。
- 前端的 OPFS 库同样要在 e2e 每个用例前清掉，否则上一个用例的行缓存会让"孤儿清理"（AC#14）
  测到的是缓存残留而不是清理逻辑。

### `__control` 端点显式不属于协议

「模拟离线」（AC#13）需要后端能被前端叫停。该开关挂在 `POST __control/offline`，
**双下划线前缀是刻意的**：它不在 `http-protocol.md` 的七个端点里，读 demo 源码的人一眼能看出
"这条不是协议的一部分，别照抄"。同理，它只在 `NODE_ENV !== 'production'` 时注册。

## 实现文件

| 阶段 | 文件                                                                | 改动                                                                           |
| :--- | :------------------------------------------------------------------ | :----------------------------------------------------------------------------- |
| A    | `apps/dev-rxdb-http-server/project.json`                            | 新增：`serve` / `seed` / `reset` / `lint` / `test` / `typecheck` targets       |
| A    | `apps/dev-rxdb-http-server/package.json`                            | 新增：`dependencies` **为空**（AC#1 的断言对象）                               |
| A    | `apps/dev-rxdb-http-server/src/server.ts`                           | 新增：`node:http` 路由，七端点 + `__control`                                   |
| A    | `apps/dev-rxdb-http-server/src/db.ts`                               | 新增：`node:sqlite` 连接、`recipes` 建表、只读快照                             |
| A    | `apps/dev-rxdb-http-server/src/rule-group-to-sql.ts`                | 新增：`RuleGroup` → 参数化 SQL + 列名白名单（**唯一含分支逻辑的模块**）        |
| A    | `apps/dev-rxdb-http-server/src/__tests__/rule-group-to-sql.spec.ts` | 新增：五类算子 + 白名单拒绝 + 参数绑定（AC#17）                                |
| A    | `apps/dev-rxdb-http-server/src/seed.ts`                             | 新增：确定性 250 行种子；`reset` 删文件重建                                    |
| A    | `apps/dev-rxdb-http/`                                               | 新增：Angular app，接线照 `dev-rxdb-supabase`，实体 `Recipe`                   |
| A    | `apps/dev-rxdb-http/src/app/rxdb/setup_rxdb_http.ts`                | 新增：`SyncType.QueryCache` + `createRestHandlers` + `pageSize:50` 等          |
| A    | `apps/dev-rxdb-http/src/app/traffic-panel/`                         | 新增：协议流量面板（AC#8）                                                     |
| B    | `apps/dev-rxdb-http-server/src/cors.ts`                             | 新增：预检 + `Access-Control-Expose-Headers`，暴露头可由开关关掉（AC#10 对照） |
| B    | `apps/dev-rxdb-http-server/src/page-token.ts`                       | 新增：token 形态与读取水位线（AC#15）                                          |
| B    | `apps/dev-rxdb-http-e2e/`                                           | 新增：playwright，`webServer` 起前后端，AC#9～15 各一条用例                    |
| B    | `website/docs/adapters/http-protocol.md`                            | 「跨源（CORS）」一节 + 验收清单一条。**本故事唯一允许的 docs 改动**            |
| —    | `requirements/epics/epic-004-future-features.md`                    | 目标行 + 故事清单条目（**已随本文件落地**）                                    |
| —    | `requirements/status-overview.md`                                   | 汇总表计数 Backlog 9 → 10、合计 56 → 57 + 未来功能段条目（**已随本文件落地**） |
| —    | `requirements/roadmap.md`                                           | 批次 3 排期行 + 约束 14（**已随本文件落地**）                                  |
| —    | 状态流转                                                            | 关闭时把上述三处派生视图改掉；story YAML `status` 是唯一真相源                 |

## References

- 协议规范：[website/docs/adapters/http-protocol.md](../../../website/docs/adapters/http-protocol.md)
- 客户端文档：[website/docs/adapters/http.md](../../../website/docs/adapters/http.md)
- 上游故事：[US-212 HTTP 远程适配器](./US-212-http-adapter.md)（已 Done，按 `stable` 发布）
- 姊妹故事：[US-213 wire 级集成测试](./US-213-http-wire-integration-test.md)（node 侧，与本故事无先后）
- ETag 读取点：[transport.ts](../../../packages/rxdb-adapter-http/src/transport.ts) 的 `HttpTransport.#cacheAndReturn`
- 默认数值配置：[config.ts](../../../packages/rxdb-adapter-http/src/config.ts) 的 `DEFAULT_HTTP_CONFIG`
- 接线范例：[apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts)
- `node:sqlite` 先例：[packages/rxdb-adapter-electron/src/sqlite-script.ts](../../../packages/rxdb-adapter-electron/src/sqlite-script.ts)

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
