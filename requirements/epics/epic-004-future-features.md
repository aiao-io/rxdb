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
- [x] HTTP 协议文档的可执行验收：参考后端 + 真实 fetch 证明 `http-protocol.md` 可互通
- [x] HTTP 协议的浏览器端到端 demo：Angular + 真 sqlite 后端 + 跨源，补齐 CORS 与 `RuleGroup → SQL` 两处空白
- [x] QueryCache 的远端变更实时同步：core 失效上报口 + HTTP 可选变更通知通道，让别的客户端的写自己走到屏幕上

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
- [US-212 HTTP 远程适配器](../stories/adapter/US-212-http-adapter.md) — 远端权威 HTTP + 独立注册 sqlite 行缓存；**零前置**（US-020 已全关，两档发布门禁同时解除）；v1 不实现 Full changelog
- [US-213 HTTP 适配器 wire 级集成测试](../stories/adapter/US-213-http-wire-integration-test.md) — US-212 的验收补票：零依赖 `node:http` 参考后端 + 真实 fetch 打穿 transport；纯测试资产，**不改 `src/`**
- [US-214 HTTP 适配器浏览器端到端 demo](../stories/adapter/US-214-http-browser-demo.md) — `apps/` 下三个新 project：Angular 前端 + `node:sqlite` 后端 + playwright，**跨源**；两阶段（可跑通 → 自动化门禁）；唯一允许的产物改动是给协议文档补「跨源（CORS）」一节
- [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](../stories/core/US-021-querycache-adapter-fail-fast.md) — 出自 US-214：库级 `sync` 少配 remote 时 QueryCache 查询**静默永挂**；在 `validateSyncStrategy` 里配置期拦下
- [US-022 QueryCache 远端行的列契约与缺列诊断](../stories/core/US-022-querycache-remote-row-contract.md) — 出自 US-214：`upsertMany` 的裸 SQL 写不过仓储，实体 `default` 不生效；补契约文档 + 落地前列集校验，**不做本地兜底**
- [US-215 条件请求被静默停用时给出可观测信号](../stories/adapter/US-215-conditional-request-silence.md) — 出自 US-214：跨源读不到 `ETag` 时 transport 静默降级；加可选诊断 hook，**不引入 console**、不改数据路径
- [US-023 QueryCache 远端变更的失效上报口与实时同步](../stories/core/US-023-querycache-remote-invalidation.md) — 出自 US-214：别的客户端改了数据，本客户端永不更新；三阶段（core 失效上报口 → HTTP 可选 SSE 通道 → demo 双页面收敛），**承接 US-212 AC#29**，失效粒度=整实体、通知不带行数据
- [US-216 参考后端以 RxDB 引擎实现](../stories/adapter/US-216-server-side-rxdb.md) — 参考后端初始化 RxDB（pglite），七个协议端点改由 Repository / EntityManager 实现、SSE 由 RxDB 事件驱动，前后端共享 schema 模块；wire 逐字不变（US-213 套件 + e2e 17 条是验收主体）；单类收敛依赖另立的 core sync 覆盖故事

> 拆分理由：PGlite 的 callback transaction 无法跨 IPC 序列化，需要一套 SQLite 路径不需要的事务 host 协议，
> 故 US-208 从 US-207 拆出。US-020 / US-212 / US-023 / US-213 / US-214 / US-021 / US-022 / US-215 归本 Epic
> 而非已 `Done` 的 epic-002（Done 的 epic 不得持有未完成故事、不得重开）。US-021 / US-022 / US-215 是
> US-214 的产出（约束 14 禁止 US-214 改 `src/`，故每条产物缺陷另开故事）。
