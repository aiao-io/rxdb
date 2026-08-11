---
id: US-703
title: PGlite 全文搜索
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-01
updated: 2026-08-11
tags: [search, plugin, pglite, postgresql]
inherited_acs:
  - from: US-702
    ac: 7
    note: SQLite FTS5 与三框架绑定已交付，PGlite tsvector/tsquery 链路独立验收。
---

# 用户故事：PGlite 全文搜索

## 作为/我想要/以便

**作为** 使用 PGlite 的 Local-first 开发者
**我想要** 通过与 SQLite 相同的 `@aiao/rxdb-plugin-search` API 执行 PostgreSQL 全文搜索
**以便** 更换本地适配器时不需要改写搜索 UI 和业务逻辑

## 现状基线

`packages/rxdb-adapter-pglite/src/fts/` 已经存在并且是**公开 API**：`buildCreateFtsTableSql`、`buildFtsTriggersSql`、`FTS_COLUMN`、`DEFAULT_FTS_REGCONFIG`、`DEFAULT_FTS_ARRAY_KIND` 与 `FtsField` / `FtsOptions` / `FtsArrayKind` 经由 `src/index.ts` 的 `export * from './fts/index.js'` 导出，并已记录在 `requirements/api-baseline/rxdb-adapter-pglite.json`。

因此本故事不是从零实现 PostgreSQL FTS，而是把这层纯函数 DDL 接进搜索插件的安装流程。相应约束：

- 这些符号已在基线中，任何签名调整都是破坏性变更，必须同步更新 api-baseline 并说明迁移方式。
- 现有形状刻意对齐 `@aiao/rxdb-adapter-sqlite-core/fts5`，backend 抽象应保持这种对称，不要为 PGlite 单独发明一套命名。

## 范围边界

### In Scope

- 把已有 PGlite `tsvector` / GIN / trigger 能力接入搜索插件安装流程
- 存量数据 backfill、schema drift 检测和幂等迁移记录
- `tsquery` 编译、相关性排序、snippet、scope、分页和反应式刷新
- Angular / React / Vue 保持现有 `useSearch` / `SearchController` API 不变

### Out of Scope

- Supabase/PostgreSQL 服务端搜索
- 中文专用分词器、拼写纠错和语义检索
- 改变现有 SQLite FTS5 公开行为

## 验收标准

| #   | 前置条件                          | 操作                       | 预期结果                                                                                    | 状态 |
| --- | --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| 1   | PGlite 实体含 searchable 字段     | 初始化搜索插件             | 创建 tsvector、GIN 索引和同步 trigger，存量数据完成回填                                     | ⬜   |
| 2   | PGlite 搜索索引已就绪             | 调用 `db.search()`         | 结果按 PG 原生相关性排序，字段、snippet 和分页语义与 SQLite 一致                            | ⬜   |
| 3   | 集合发生 INSERT/UPDATE/DELETE     | 观察活动搜索 handle        | 绕过 debounce 刷新，无重复派发                                                              | ⬜   |
| 4   | 重复连接或 searchable schema 变化 | 重新安装插件               | 相同 schema 幂等，不同 schema fail-fast                                                     | ⬜   |
| 5   | 三框架共享 parity fixture         | Angular / React / Vue 运行 | 现有公开 API 和用户可见行为不变                                                             | ⬜   |
| 6   | SQLite FTS5 回归套件              | 运行                       | 全部通过，不为 PGlite 增加运行时 fallback                                                   | ⬜   |
| 7   | 存量 backfill 执行到一半被中断    | 重新初始化搜索插件         | 索引状态可判定：要么继续回填至完成，要么 fail-fast 并说明恢复动作；不得把半成品索引当作就绪 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#7 的动机：AC#1 只声明「存量数据完成回填」这一 happy path。大表回填会跨多个事务，页面刷新、标签页关闭、PGlite worker 终止或 SQL 报错都可能停在中途；此时 trigger 已装、GIN 索引已建，`db.search()` 会静默返回不完整结果——即 SQLite FTS5 侧已经踩过的「索引与内容表不一致」问题。因此回填进度必须持久化（沿用 AC#4 的迁移记录），而不是靠「表存在」推断就绪。

## 技术约束

- 通过显式 search backend 抽象隔离 SQLite FTS5 与 PostgreSQL FTS，不在查询引擎中散落 adapter 分支
- SQL 中的查询值必须参数化，regconfig 必须白名单校验
- 加密字段继续禁止加入搜索索引

## 实现文件

- `packages/rxdb-plugin-search/src/` — backend 抽象、安装和查询管线
- `packages/rxdb-adapter-pglite/src/fts/` — PostgreSQL FTS DDL 与 trigger
- `packages/rxdb-plugin-search-*/` — 三框架 parity 回归

## References

- [US-702 全文搜索](./US-702-full-text-search.md)
- [PGlite 适配器](../adapter/US-202-pglite-adapter.md)
