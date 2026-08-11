---
id: US-205
title: SQLiteAI 适配器（向量与 AI 能力）
status: Done
priority: High
epic: epic-001-core-mvp
created: 2026-04-20
updated: 2026-05-10
tags: [adapter, sqlite, ai, vector]
---

# 用户故事：SQLiteAI 适配器

## 作为/我想要/以便

**作为** 构建 Local-first AI 应用的开发者
**我想要** 使用 `@sqliteai/sqlite-wasm` 作为存储后端
**以便** 在浏览器内同时获得标准 SQLite 能力 + 向量检索 + AI 函数（embedding / cosine_distance），无需引入额外向量库

## 验收标准

| #   | 前置条件                     | 操作                   | 预期结果                                | 状态 |
| --- | ---------------------------- | ---------------------- | --------------------------------------- | ---- |
| 1   | `@sqliteai/sqlite-wasm` 安装 | 创建适配器实例         | 初始化连接，加载向量扩展                | ✅   |
| 2   | RuleGroup 查询               | 编译执行               | 与 wa-sqlite / sqlite-wasm 适配器一致   | ✅   |
| 3   | 标准适配器测试套件           | 运行                   | 全部通过                                | ✅   |
| 4   | 向量列                       | 声明 + 写入            | 支持向量类型（fastpath benchmark 验证） | ✅   |
| 5   | benchmarks 报告              | 单条 / 批量写入 / 查询 | 已落地 baseline                         | ✅   |

## 技术笔记

- 包：`packages/rxdb-adapter-sqliteai`
- 复用 `rxdb-adapter-sqlite-core`，仅替换 backend client（`SqliteaiClient`）
- AI 能力路径：sqliteai 提供的 SQL 函数（向量距离、embedding helper）通过 SQL 直接暴露

## 实现文件

- `packages/rxdb-adapter-sqliteai/src/RxDBAdapterSqliteai.ts`
- `packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts`
- `benchmarks/` — 性能报告

## 后续工作

- 将 sqliteai 暴露的 AI/vector 函数封装为独立的 `@aiao/rxdb-plugin-rag` API（见阶段 3 路线图）

## 参考

- [PR #238](https://github.com/aiao-io/aiao/pull/238) — rxdb adapter sqliteai
- [Epic: 核心 MVP 功能](../../epics/epic-001-core-mvp.md)
