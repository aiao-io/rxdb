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
- [ ] Electron/Tauri 桌面应用连接原生本地 SQLite 文件
- [ ] Electron 主进程托管 PGlite data directory 与跨 IPC 事务
- [ ] `rxdb-plugin-storage` 文件内容落入桌面应用数据目录（Electron 先行，Tauri 随 US-210）
- [x] 微信小程序逻辑层的实验性 wa-sqlite 路径纳入门禁与公开能力矩阵
- [ ] 多端小程序宿主：先抽平台无关 host，再按可行性门禁放行支付宝 / 抖音 / 百度 / QQ
- [ ] QueryCache 生产路径：`getRepository` / EntityManager 在 `SyncType.QueryCache` 时走 `QueryCacheRepository`（远端权威 + sqlite 行缓存）
- [ ] HTTP 远程适配器：已有 REST API 可挂 `adapter:remote`，本地 sqlite 独立注册为行缓存

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
- [US-212 HTTP 远程适配器](../stories/adapter/US-212-http-adapter.md) — 远端权威 HTTP + 独立注册 sqlite 行缓存；硬前置 US-020；v1 不实现 Full changelog

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
> US-020 / US-212 归入本 Epic 而非 [epic-002](epic-002-data-sync.md)：epic-002 已 `Done`，**不得持有未完成故事、不得重开**。QueryCache 生产路径是 US-203 AC#6 / US-006 AC#6 的文档债——类与 supabase ducks 都在，统一 Repository 从不实例化它们。HTTP 是新的远程适配器，与 US-208 / US-211 同属未完成的平台/适配器扩展。硬顺序 US-020 **阶段 A** → US-212 **发布**：线路不关就发 HTTP 包，QueryCache 配置仍是空操作且写入污染 local changelog。2026-08-22 收窄了这条顺序的两处：它卡的是**发布动作**不是开工（两包代码可并行），且分 `experimental`（US-020 阶段 A）/ `stable`（US-020 阶段 B）两档，见 [roadmap 约束 10](../roadmap.md#排期约束)。US-212 原有的 epic-006 前置已由 [roadmap 约束 11](../roadmap.md#排期约束) 的自持不变量替代。
