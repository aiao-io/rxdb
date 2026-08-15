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
- [x] 微信小程序逻辑层的实验性 wa-sqlite 路径纳入门禁与公开能力矩阵

## 故事

- ✅ [全文搜索](../stories/future/US-702-full-text-search.md) — `@aiao/rxdb-plugin-search`（FTS5 + 三端绑定 + parity e2e + perf baseline）
- ⬜ [PGlite 全文搜索](../stories/future/US-703-pglite-full-text-search.md) — tsvector/GIN 与现有搜索 API 集成
- ⬜ [US-207 Electron/Tauri 连接本地数据库](../stories/adapter/US-207-desktop-local-database.md) — 收敛为 Tauri/Electron **SQLite 文件**路径与共享桌面 host 契约
- ⬜ [US-208 Electron PGlite 数据目录与事务宿主](../stories/adapter/US-208-electron-pglite-data-directory.md) — 从 US-207 拆出，依赖其抽出的 host 契约
- ⬜ [US-210 Tauri 连接应用作用域 SQLite 文件](../stories/adapter/US-210-tauri-sqlite-local-database.md) — 从 US-207 二次拆出，`tauri-plugin-sql` 的单物理连接事务语义未验证
- ✅ [US-209 微信小程序 wa-sqlite 适配器](../stories/adapter/US-209-miniprogram-adapter.md) — 实验性平台扩展；2026-08-15 完成门禁登记与文档收尾

> 拆分理由（2026-08-13 评审）：PGlite 的 callback transaction 无法跨 IPC 序列化，需要一套 SQLite 路径不需要的
> 事务 host 协议；混编会让 US-207 在不做这件事的前提下无法验收。Tauri PGlite 明确不在范围内——Tauri 没有 Node
> 主进程，PGlite `BaseFilesystem` 的 `open/read/write/fstat` 是同步契约，无法用异步 Tauri command 逐次代理。
>
> US-209 归入本 Epic 而非 [epic-001](epic-001-core-mvp.md)：epic-001 已 `Done`，且小程序与 Electron/Tauri 同属
> **平台扩展**而非核心 MVP 能力。它是补写的故事——包自 `0.0.24` 起已发布但 `requirements/` 下一直没有对应需求文件。
