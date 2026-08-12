---
id: US-703
title: PGlite 全文搜索
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-01
updated: 2026-08-13
tags: [search, plugin, pglite, postgresql, sqlite]
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

### 搜索插件的公开面已经绑死 FTS5

`requirements/api-baseline/rxdb-plugin-search.json` 中有 11 个导出是 FTS5 专有的，不是"实现细节"：

| 导出                                                                                                      | 绑死之处                                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FtsInstallPlan` / `InstallFtsResult` / `FtsExecutor` / `installFtsForEntity`                             | external-content 表 `_fts_<table>`、`content_rowid` 主键绑定            |
| `buildBackfillSql` / `buildResetFtsSql`                                                                   | `INSERT INTO fts(fts) VALUES('delete-all')` 是 FTS5 专有指令            |
| `buildFieldMatchExpression`                                                                               | 生成 `"col" : (match)`，FTS5 列过滤语法，PostgreSQL 无对应              |
| `buildFieldSearchSql` / `buildFieldContainsSql` / `buildSourceRowCountSql` / `MAX_CONTAINS_FALLBACK_ROWS` | `json_each` / `group_concat` 是 SQLite 函数，行数上限也是 SQLite 侧策略 |

引入 backend 抽象时这批符号只有三条路：保持原名原义（backend 层另起中立入口）、改名（破坏性）、或降为内部（同样破坏性）。
必须在 plan 阶段选定并写进 AC#9，不能等实现时临场决定。

### 缺口：SQLite 侧白名单只放行一个 adapter

`packages/rxdb-plugin-search/src/core/adapter-guard.ts` 当前是硬编码单值：

```ts
export const SUPPORTED_SEARCH_ADAPTERS = new Set<string>(['sqlite-wasm']);
```

但 FTS5 的 DDL 构造器在 `packages/rxdb-adapter-sqlite-core/src/fts5/`——**所有 SQLite adapter 共享的基类包**。
即 `wa-sqlite`、`sqlite`、`sqliteai`、`wa-sqlite-miniprogram` 四个 adapter 在技术上具备同样的 FTS5 能力，却被 guard 直接 throw。

这与 [US-702](./US-702-full-text-search.md) AC#4 标注 ✅ 的表述"SQLite 适配器 → 使用 FTS5 虚拟表"不一致：
实际支持的是"一个 SQLite 适配器"。这个缺口目前不属于任何故事，本故事一并承接——因为
guard 从"硬编码 adapter 名单"改成"按 backend 能力查表"正是 backend 抽象的直接产物，
不能靠给 Set 再 append 一个 `'pglite'` 字符串了事。

## 范围边界

### In Scope

- 把已有 PGlite `tsvector` / GIN / trigger 能力接入搜索插件安装流程
- 存量数据 backfill、schema drift 检测和幂等迁移记录
- `tsquery` 编译、相关性排序、snippet、scope、分页和反应式刷新
- Angular / React / Vue 保持现有 `useSearch` / `SearchController` API 不变
- 将 `adapter-guard.ts` 的硬编码 adapter 名单换成 backend 能力查表，覆盖全部 `sqlite-core` 家族 adapter（AC#8）
- 明确 backend 抽象对 `rxdb-plugin-search` api-baseline 的影响并完成处置（AC#9）

### Out of Scope

- Supabase/PostgreSQL 服务端搜索
- 中文专用分词器、拼写纠错和语义检索
- 改变现有 SQLite FTS5 公开行为

## 验收标准

| #   | 前置条件                          | 操作                                                                                                       | 预期结果                                                                                                                        | 状态 |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | PGlite 实体含 searchable 字段     | 初始化搜索插件                                                                                             | 创建 tsvector、GIN 索引和同步 trigger，存量数据完成回填                                                                         | ⬜   |
| 2   | PGlite 搜索索引已就绪             | 调用 `db.search()`                                                                                         | 结果按 PG 原生相关性排序，字段、snippet 和分页语义与 SQLite 一致                                                                | ⬜   |
| 3   | 集合发生 INSERT/UPDATE/DELETE     | 观察活动搜索 handle                                                                                        | 绕过 debounce 刷新，无重复派发                                                                                                  | ⬜   |
| 4   | 重复连接或 searchable schema 变化 | 重新安装插件                                                                                               | 相同 schema 幂等，不同 schema fail-fast                                                                                         | ⬜   |
| 5   | 三框架共享 parity fixture         | Angular / React / Vue 运行                                                                                 | 现有公开 API 和用户可见行为不变                                                                                                 | ⬜   |
| 6   | SQLite FTS5 回归套件              | 运行                                                                                                       | 全部通过，不为 PGlite 增加运行时 fallback                                                                                       | ⬜   |
| 7   | 存量 backfill 执行到一半被中断    | 重新初始化搜索插件                                                                                         | 索引状态可判定：要么继续回填至完成，要么 fail-fast 并说明恢复动作；不得把半成品索引当作就绪                                     | ⬜   |
| 8   | backend 抽象已落地                | 用 `sqlite-core` 家族的每个 adapter（`wa-sqlite` / `sqlite-wasm` / `sqlite` / `sqliteai`）分别装载搜索插件 | 具备 FTS5 能力的一律放行并通过同一套搜索行为套件；确实不支持的必须给出可判别的能力缺失原因，而不是因为名字不在硬编码 Set 里被拒 | ⬜   |
| 9   | backend 抽象改动了搜索插件公开面  | 运行 api-baseline 校验                                                                                     | 「现状基线」表中 11 个 FTS5 专有导出的处置与基线一致；若有改名或降为内部，CHANGELOG 标为破坏性并给出迁移写法                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#7 的动机：AC#1 只声明「存量数据完成回填」这一 happy path。大表回填会跨多个事务，页面刷新、标签页关闭、PGlite worker 终止或 SQL 报错都可能停在中途；此时 trigger 已装、GIN 索引已建，`db.search()` 会静默返回不完整结果——即 SQLite FTS5 侧已经踩过的「索引与内容表不一致」问题。因此回填进度必须持久化（沿用 AC#4 的迁移记录），而不是靠「表存在」推断就绪。
>
> AC#8 的动机：见「缺口：SQLite 侧白名单只放行一个 adapter」。本故事是唯一会重写 `adapter-guard.ts` 的故事，
> 顺手把白名单从字符串比对换成 backend 能力查表；否则加 PGlite 只会让硬编码 Set 从 1 项变 2 项，
> 另外四个 SQLite adapter 继续在同一个坑里。`wa-sqlite-miniprogram` 是否纳入取决于小程序环境能否加载 FTS5 扩展，
> 需要实测，不能假设。
>
> AC#9 的动机：backend 抽象不是纯内部重构。11 个导出已经在 api-baseline 里，
> 无声改名会直接打破下游编译，而 `MAX_CONTAINS_FALLBACK_ROWS` 这类 SQLite 专有策略常量在 PostgreSQL 侧没有对应语义，
> 更需要明确它是留在 SQLite backend 命名空间下，还是升为跨 backend 概念。

## 技术约束

- 通过显式 search backend 抽象隔离 SQLite FTS5 与 PostgreSQL FTS，不在查询引擎中散落 adapter 分支
- adapter 是否可用由 backend 声明的能力决定，不由 adapter 名字决定；不受支持时仍按现有约定 fail-fast，不返回降级 handle
- SQL 中的查询值必须参数化，regconfig 必须白名单校验
- 加密字段继续禁止加入搜索索引

## 实现文件

- `packages/rxdb-plugin-search/src/core/adapter-guard.ts` — 硬编码 `SUPPORTED_SEARCH_ADAPTERS` 换成 backend 能力查表
- `packages/rxdb-plugin-search/src/core/fts5-installer.ts` / `fts5-runtime.ts` — 现有 FTS5 实现下沉为 SQLite backend
- `packages/rxdb-plugin-search/src/` — backend 抽象、安装和查询管线
- `packages/rxdb-adapter-pglite/src/fts/` — PostgreSQL FTS DDL 与 trigger（已存在且已进基线）
- `packages/rxdb-adapter-sqlite-core/src/fts5/` — SQLite backend 复用的共享 DDL 构造器
- `packages/rxdb-plugin-search-*/` — 三框架 parity 回归
- `requirements/api-baseline/rxdb-plugin-search.json` — AC#9 的判定依据

## References

- [US-702 全文搜索](./US-702-full-text-search.md) — 其 AC#4 的 ✅ 覆盖面被本故事 AC#8 收紧为可验证口径
- [PGlite 适配器](../adapter/US-202-pglite-adapter.md)
