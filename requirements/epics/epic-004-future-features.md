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
- [ ] Electron/Tauri 桌面应用连接原生本地数据库

## 故事

- ✅ [全文搜索](../stories/future/US-702-full-text-search.md) — `@aiao/rxdb-plugin-search`（FTS5 + 三端绑定 + parity e2e + perf baseline）
- ⬜ [PGlite 全文搜索](../stories/future/US-703-pglite-full-text-search.md) — tsvector/GIN 与现有搜索 API 集成
- ⬜ [US-207 Electron/Tauri 连接本地数据库](../stories/adapter/US-207-desktop-local-database.md) — Tauri/Electron SQLite 文件与 Electron PGlite data directory
