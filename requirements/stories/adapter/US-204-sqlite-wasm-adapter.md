---
id: US-204
title: SQLite WASM 适配器（subframe / official）
status: Done
priority: High
epic: epic-001-core-mvp
created: 2026-04-15
updated: 2026-10-06
tags: [adapter, sqlite, wasm]
---

# 用户故事：SQLite WASM 适配器

## 作为/我想要/以便

**作为** 开发者
**我想要** 在浏览器中使用社区维护的 `@subframe7536/sqlite-wasm` / `@sqlite.org/sqlite-wasm` 官方包作为存储后端
**以便** 在不同 WASM 发行版与 VFS 之间自由选择，并避免被单一 wa-sqlite 依赖锁死

## 验收标准

| #   | 前置条件                           | 操作                            | 预期结果                                | 状态 |
| --- | ---------------------------------- | ------------------------------- | --------------------------------------- | ---- |
| 1   | `@subframe7536/sqlite-wasm` 包安装 | 创建适配器实例                  | 通过 `initSQLiteCore` 初始化连接        | ✅   |
| 2   | OPFS / IDB VFS                     | 经 `vfs` 选项选择持久化策略     | 使用对应的 subframe 存储预设            | ✅   |
| 3   | RuleGroup 查询                     | 编译执行                        | 与 wa-sqlite 适配器结果一致             | ✅   |
| 4   | 适配器 core 共享                   | `rxdb-adapter-sqlite-core` 提取 | SQLite 系适配器复用执行/事务/触发器代码 | ✅   |
| 5   | 标准适配器测试套件                 | 运行                            | 全部通过                                | ✅   |
| 6   | `@sqlite.org/sqlite-wasm` 官方包   | 创建适配器实例                  | 通过 oo1 API 初始化连接，适配器能力一致 | ✅   |
| 7   | FTS5 能力检测                      | 启用搜索插件                    | adapter guard 正确暴露能力              | ✅   |

## 技术笔记

- 包：`packages/rxdb-adapter-sqlite-wasm`（subframe7536）+ `packages/rxdb-adapter-sqlite`（@sqlite.org 官方）
- 共享层：`packages/rxdb-adapter-sqlite-core` — `RxDBAdapterSqliteBase`、`Oo1ClientBase`、execute/transaction/trigger/version 工具
- 客户端：官方版（`SqliteOfficialClient`）与 sqliteai 继承 `Oo1ClientBase`；subframe 版（`SqliteClient`）直接基于 `initSQLiteCore`，VFS 预设为 `memory` / `idb` / `idb-memory` / `opfs` / `fs-handle`，选项形状与官方版（`opfs` 布尔）不同
- 与 wa-sqlite 适配器关系：适配器能力一致，backend client 与加载选项不同；用户可按场景选择
- benchmarks：`benchmarks/` 应用可选各 SQLite 系适配器

## 实现文件

- `packages/rxdb-adapter-sqlite-core/` — 共享核心
- `packages/rxdb-adapter-sqlite-wasm/` — subframe7536 后端
- `packages/rxdb-adapter-sqlite/` — @sqlite.org 官方后端

## 参考

- [US-201 wa-sqlite 适配器](US-201-sqlite-adapter.md)
- [Epic: 核心 MVP 功能](../../epics/epic-001-core-mvp.md)
