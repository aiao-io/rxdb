# 数据库适配器

适配器决定数据在哪执行、怎么持久化、什么时候跟远端交换。选型前记住三个边界：

- SQLite 适配器是浏览器内的真实执行层，不是缓存封装
- Supabase 适配器是同步接入方案，不等于托管云服务本身
- OPFS 是 SQLite 的持久化增强，不是独立的适配器

## 适配器总览

| 包                               | 文档                            | 底层引擎                  | FTS5 | 全文搜索 | AI/向量 | 用途                                     |
| -------------------------------- | ------------------------------- | ------------------------- | ---- | -------- | ------- | ---------------------------------------- |
| `@aiao/rxdb-adapter-wa-sqlite`   | [SQLite](./sqlite.md)           | wa-sqlite                 | ❌   | ❌       | ❌      | 默认浏览器本地存储，**推荐**             |
| `@aiao/rxdb-adapter-sqlite`      | [SQLite](./sqlite.md)           | @sqlite.org/sqlite-wasm   | ✅   | ❌       | ❌      | 官方构建，通用场景                       |
| `@aiao/rxdb-adapter-sqlite-wasm` | [SQLite WASM](./sqlite-wasm.md) | @subframe7536/sqlite-wasm | ✅   | ✅       | ❌      | 全文搜索 / 跨平台 VFS                    |
| `@aiao/rxdb-adapter-sqliteai`    | [SQLiteAI](./sqliteai.md)       | @sqliteai/sqlite-wasm     | ✅   | ❌       | ✅      | 本地 AI / 语义检索                       |
| `@aiao/rxdb-adapter-pglite`      | [PGlite](./pglite.md)           | PGlite (PostgreSQL)       | —    | —        | —       | 更强 SQL / PostgreSQL 兼容               |
| `@aiao/rxdb-adapter-supabase`    | [Supabase](./supabase.md)       | —                         | —    | —        | —       | 远端 PostgreSQL 同步                     |
| `@aiao/rxdb-adapter-http`        | [HTTP](./http.md)               | —                         | —    | —        | —       | 自有 REST API 远端，仅 QueryCache        |
| `@aiao/rxdb-adapter-encrypted`   | [字段加密](./encrypted.md)      | —                         | —    | —        | —       | AES-GCM-256 字段加密，叠加在本地适配器上 |
| `@aiao/rxdb-adapter-sqlite-core` | —                               | —                         | —    | —        | —       | SQLite 共享核心代码（内部依赖）          |

> **一句话决策**：默认 wa-sqlite → 全文搜索换 sqlite-wasm → AI 换 sqliteai → SQL 复杂换 PGlite → 云同步叠 Supabase（自有 REST API 则叠 HTTP）→ 加密叠 encrypted。

## 数据类型支持

| 适配器             | `bigint`            | `binary`           | 远程同步 |
| ------------------ | ------------------- | ------------------ | -------- |
| 四个 SQLite 适配器 | SQLite `INTEGER`    | SQLite `BLOB`      | —        |
| PGlite             | PostgreSQL `bigint` | PostgreSQL `bytea` | —        |
| Supabase           | ❌                  | ❌                 | ❌       |
| HTTP               | ❌                  | ❌                 | ❌       |

所有本地适配器均支持 `bigint` 和 `Uint8Array` 的 CRUD、查询、索引及 change 历史。
Supabase 与 HTTP 不支持这两种类型的远程同步；仅在本地使用的实体可与远程同步实体共存。

## 推荐阅读顺序

1. [快速开始](../getting-started/README.md)
2. [模型定义](../model-definition/README.md)
3. [模型查询](../model-query/README.md)
4. 回到这里挑适配器
