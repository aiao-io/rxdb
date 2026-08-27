---
id: epic-004-future-features
status: In Progress
startDate: 2026-06-01
targetDate: 2026-12-01
owner: jimmy
---

# 未来功能

## 愿景

为 Aiao 规划全文搜索、桌面原生文件存储等中长期能力。

## 目标

- [x] SQLite FTS5 全文搜索引擎集成
- [ ] PGlite 原生全文搜索集成
- [x] Electron/Tauri 桌面应用连接原生本地 SQLite 文件
- [ ] Electron 主进程托管 PGlite data directory 与跨 IPC 事务
- [ ] `rxdb-plugin-storage` 文件内容落入桌面应用数据目录（Electron 先行，Tauri 随 US-210）
- [x] 微信小程序逻辑层的实验性 wa-sqlite 路径纳入门禁与公开能力矩阵
- [ ] 多端小程序宿主：先抽平台无关 host，再按可行性门禁放行支付宝 / 抖音 / 百度 / QQ
- [x] QueryCache 生产路径：`getRepository` / EntityManager 在 `SyncType.QueryCache` 时走 `QueryCacheRepository`（远端权威 + sqlite 行缓存）
- [x] HTTP 远程适配器：已有 REST API 可挂 `adapter:remote`，本地 sqlite 独立注册为行缓存
- [ ] HTTP 协议文档的可执行验收：参考后端 + 真实 fetch 证明 `http-protocol.md` 可互通
- [ ] HTTP 协议的浏览器端到端 demo：Angular + 真 sqlite 后端 + 跨源，补齐 CORS 与 `RuleGroup → SQL` 两处空白
- [ ] QueryCache 的远端变更实时同步：core 失效上报口 + HTTP 可选变更通知通道，让别的客户端的写自己走到屏幕上

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [全文搜索](../stories/future/US-702-full-text-search.md) — `@aiao/rxdb-plugin-search`（FTS5 + 三端绑定 + parity e2e + perf baseline）
- [PGlite 全文搜索](../stories/future/US-703-pglite-full-text-search.md) — tsvector/GIN 与现有搜索 API 集成
- [US-207 Electron 连接本地 SQLite 文件](../stories/adapter/US-207-desktop-local-database.md) — 桌面本地 SQLite 的 Electron 半边：`node:sqlite` 文件路径与共享桌面 host 契约
- [US-208 Electron PGlite 数据目录与事务宿主](../stories/adapter/US-208-electron-pglite-data-directory.md) — 从 US-207 拆出，依赖其抽出的 host 契约；不含 Tauri
- [US-210 Tauri 连接应用作用域 SQLite 文件](../stories/adapter/US-210-tauri-sqlite-local-database.md) — 桌面本地 SQLite 的 Tauri 半边：自写 Rust command 持有 `rusqlite::Connection`
- [US-209 微信小程序 wa-sqlite 适配器](../stories/adapter/US-209-miniprogram-adapter.md) — 实验性平台扩展，仅微信逻辑层
- [US-211 多端小程序宿主](../stories/adapter/US-211-multi-miniprogram-platforms.md) — US-209 的后续：抽 host 后按可行性门禁逐个放行非微信平台
- [US-504 Electron 本地文件存储](../stories/plugin/US-504-electron-local-file-storage.md) — 文件内容落 `userData/rxdb-files`，与桌面 SQLite 同一备份域；窄接口 `StorageFilesystem` + host 侧仲裁路径锁 + `StorageBackendError { code }`
- [US-505 Tauri 本地文件存储](../stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边；被 US-210 门禁的只有 AC#1 / #7，其余可独立交付
- [US-020 将 QueryCache 接入统一 Repository](../stories/core/US-020-querycache-repository.md) — 让 `SyncType.QueryCache` 从空操作变成生产真；两阶段（接线 → 缓存质量）；不 inherit US-203 AC#6
- [US-212 HTTP 远程适配器](../stories/adapter/US-212-http-adapter.md) — 远端权威 HTTP + 独立注册 sqlite 行缓存；**零前置**（US-020 已于 2026-08-22 全关，两档发布门禁同时解除）；v1 不实现 Full changelog
- [US-213 HTTP 适配器 wire 级集成测试](../stories/adapter/US-213-http-wire-integration-test.md) — US-212 的验收补票：零依赖 `node:http` 参考后端 + 真实 fetch 打穿 transport；纯测试资产，**不改 `src/`**
- [US-214 HTTP 适配器浏览器端到端 demo](../stories/adapter/US-214-http-browser-demo.md) — `apps/` 下三个新 project：Angular 前端 + `node:sqlite` 后端 + playwright，**跨源**；两阶段（可跑通 → 自动化门禁）；唯一允许的产物改动是给协议文档补「跨源（CORS）」一节
- [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](../stories/core/US-021-querycache-adapter-fail-fast.md) — 出自 US-214：库级 `sync` 少配 remote 时 QueryCache 查询**静默永挂**；在 `validateSyncStrategy` 里配置期拦下
- [US-022 QueryCache 远端行的列契约与缺列诊断](../stories/core/US-022-querycache-remote-row-contract.md) — 出自 US-214：`upsertMany` 的裸 SQL 写不过仓储，实体 `default` 不生效；补契约文档 + 落地前列集校验，**不做本地兜底**
- [US-215 条件请求被静默停用时给出可观测信号](../stories/adapter/US-215-conditional-request-silence.md) — 出自 US-214：跨源读不到 `ETag` 时 transport 静默降级；加可选诊断 hook，**不引入 console**、不改数据路径
- [US-023 QueryCache 远端变更的失效上报口与实时同步](../stories/core/US-023-querycache-remote-invalidation.md) — 出自 US-214：别的客户端改了数据，本客户端永不更新；三阶段（core 失效上报口 → HTTP 可选 SSE 通道 → demo 双页面收敛），**承接 US-212 AC#29**，失效粒度=整实体、通知不带行数据

> 拆分理由：PGlite 的 callback transaction 无法跨 IPC 序列化，需要一套 SQLite 路径不需要的
> 事务 host 协议；混编会让 US-207 在不做这件事的前提下无法验收。Tauri PGlite 明确不在范围内——Tauri 没有 Node
> 主进程，PGlite `BaseFilesystem` 的 `open/read/write/fstat` 是同步契约，无法用异步 Tauri command 逐次代理。
>
> US-209 归入本 Epic 而非 [epic-001](epic-001-core-mvp.md)：epic-001 已 `Done`，且小程序与 Electron/Tauri 同属
> **平台扩展**而非核心 MVP 能力。它是补写的故事——包自 `0.0.24` 起已发布但 `requirements/` 下一直没有对应需求文件。
>
> US-211 同理归入本 Epic：US-209 把「仅微信」写成长期口径是为了防止无效扩大已发布包的能力承诺；
> 多端是新能力，必须自己过可行性门禁，不能顺手改 US-209 的 Out of Scope。
>
> US-504 / US-505 同理归入本 Epic：[US-502](../stories/plugin/US-502-storage-plugin.md) 的 OPFS 承诺属于已 `Done`
> 的 epic-001，桌面原生文件后端是平台扩展。两条故事按 US-207 → US-210 的先例拆分——Electron 半边前置齐备可即刻
> 排期，Tauri 半边被 US-210（meta 的桌面 adapter）前置，绑在一起会让能交付的一半陪跑。
>
> US-020 / US-212 归入本 Epic 而非 [epic-002](epic-002-data-sync.md)：epic-002 已 `Done`，**不得持有未完成故事、不得重开**。QueryCache 生产路径是 US-203 AC#6 / US-006 AC#6 的文档债——类与 supabase ducks 都在，统一 Repository 从不实例化它们。HTTP 是新的远程适配器，与 US-208 / US-211 同属未完成的平台/适配器扩展。原有的硬顺序 US-020 **阶段 A** → US-212 **发布**（线路不关就发 HTTP 包，QueryCache 配置仍是空操作且写入污染 local changelog）于 2026-08-22 先收窄为「只卡发布动作、分 `experimental` / `stable` 两档」，**当天即随 US-020 两阶段全关而彻底解除**，见 [roadmap 约束 10](../roadmap.md#排期约束)。**US-212 现在零前置**，US-020 也已 `Done`——本段保留只为解释两条故事当初为何落在本 Epic。US-212 原有的 epic-006 前置已由 [roadmap 约束 11](../roadmap.md#排期约束) 的**结构隔离**不变量替代（该不变量是编码约束，不是排期前置）。
>
> US-213 另起故事而非重开 US-212：US-212 已 `Done` 且包已按 `stable` 发布，重开会让一个对外承诺过的版本回到未完成态。
> 它补的是**验收手段**不是功能——`http-protocol.md` 随 `stable` 对外，第三方后端照它实现却没有任何可执行验收。
> 因此 US-213 是纯测试资产，**禁止顺手改 `src/`**：真打出协议缺陷就标记待修用例并另开故事，见 [roadmap 约束 13](../roadmap.md#排期约束)。
>
> US-214 与 US-213 **并列而非重复**，两条各建各的后端、零先后关系：US-213 在 node/undici 里证 wire 不变量，
> US-214 在浏览器里证产品路径。三件事只有后者能证——跨源 CORS（`http-protocol.md` 全篇零处提及，而
> `Content-Type: application/json` 与 `PATCH` 都必然触发预检）、`RuleGroup → 参数化 SQL`（US-213 的参考后端在 JS 里
> `Array.filter`，等于假设翻译这步没问题，而文档自己写明这是翻译风险最高的一节）、真 wa-sqlite 行缓存上的孤儿清理
> 与 `offlineFallback`（US-213 明确列为 Out of Scope，用内存替身）。它同样**不改 `src/`**，口径见 [roadmap 约束 14](../roadmap.md#排期约束)。
>
> US-023 与前三条同源但不同性质：US-021 / US-022 / US-215 治的是**已有路径上的静默失败**，
> US-023 补的是一条**从来不存在的路径**——远端变了没有任何机制通知客户端。它因此需要一个 core 新抽象，
> 也因此在 2026-08-24 的 owner 判定里以「拿不到 owner」被移出 US-212（原 AC#29）、按「价值待证」登记进
> [roadmap「明确不排期」](../roadmap.md#明确不排期)。2026-08-27 该行的两条解锁条件同时满足（真实的实时性需求 +
> 说得清失效粒度），故建档。它归本 Epic 而非 [epic-002](epic-002-data-sync.md) 的理由与 US-020 / US-212 同：
> epic-002 已 `Done`，**不得持有未完成故事、不得重开**。
>
> US-021 / US-022 / US-215 是 US-214 的**产出**而非它的遗留工作：那条故事被 [roadmap 约束 14](../roadmap.md#排期约束)
> 禁止改 `src/`，所以每撞见一个产物侧缺陷就只能冻成用例或记进「落地偏差」，另开故事是当初就定好的出口。
> 三条各自独立、无先后：US-021 与 US-022 都在 QueryCache 的落地路径上但一个判配置、一个判数据，
> US-215 只动 `rxdb-adapter-http`。三条的共同点是**症状都是静默**——永挂、约束错误指向陌生列名、
> 开关全程空转——因此都归在「让失败可被看见」这一类，而不是新增能力。
