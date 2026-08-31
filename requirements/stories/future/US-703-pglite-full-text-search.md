---
id: US-703
title: PGlite 全文搜索
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-01
updated: 2026-08-31
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
| 1   | PGlite 实体含 searchable 字段     | 初始化搜索插件                                                                                             | 创建 tsvector、GIN 索引和同步 trigger，存量数据完成回填                                                                         | ✅   |
| 2   | PGlite 搜索索引已就绪             | 调用 `db.search()`                                                                                         | 结果按 PG 原生相关性排序，字段、snippet 和分页语义与 SQLite 一致                                                                | ✅   |
| 3   | 集合发生 INSERT/UPDATE/DELETE     | 观察活动搜索 handle                                                                                        | 绕过 debounce 刷新，无重复派发                                                                                                  | ✅   |
| 4   | 重复连接或 searchable schema 变化 | 重新安装插件                                                                                               | 相同 schema 幂等，不同 schema fail-fast                                                                                         | ✅   |
| 5   | 三框架共享 parity fixture         | Angular / React / Vue 运行                                                                                 | 现有公开 API 和用户可见行为不变                                                                                                 | ✅   |
| 6   | SQLite FTS5 回归套件              | 运行                                                                                                       | 全部通过，不为 PGlite 增加运行时 fallback                                                                                       | ✅   |
| 7   | 存量 backfill 执行到一半被中断    | 重新初始化搜索插件                                                                                         | 索引状态可判定：要么继续回填至完成，要么 fail-fast 并说明恢复动作；不得把半成品索引当作就绪                                     | ✅   |
| 8   | backend 抽象已落地                | 用 `sqlite-core` 家族的每个 adapter（`wa-sqlite` / `sqlite-wasm` / `sqlite` / `sqliteai`）分别装载搜索插件 | 具备 FTS5 能力的一律放行并通过同一套搜索行为套件；确实不支持的必须给出可判别的能力缺失原因，而不是因为名字不在硬编码 Set 里被拒 | ✅   |
| 9   | backend 抽象改动了搜索插件公开面  | 运行 api-baseline 校验                                                                                     | 「现状基线」表中 11 个 FTS5 专有导出的处置与基线一致；若有改名或降为内部，按 versioning-policy 标为破坏性并给出迁移写法         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### AC#8 的完成记录（2026-08-31）

放行判定与能力探测两层早已落地，本轮的收尾是把「分别装载并跑同一套搜索行为套件」这半句补上：

- 把硬编码 `sqlite-wasm` 的两个 integration spec 抽成按 adapter 参数化的共享套件
  `search-behavior.suite.ts`（11 条查询/snippet/分页/fallback 断言）与 `fts5-installer.suite.ts`
  （建表/回填/迁移/并发窗口），复用 `@aiao/rxdb-adapter-sqlite-core/testing` 的 `AdapterFactory` 契约装配。
- 4 个 adapter 各通过新增的 test-only `./testing` 子路径（`import.meta.glob`，不拖进 lib typecheck）导出 factory，
  `sqlite-wasm` / `sqlite` / `sqliteai` 三个各自跑通同一套行为断言。
- 跑套件时当场暴露并修掉两个此前被 `sqlite-wasm` 单独掩盖的 `sqlite-core` 缺陷：`Oo1ClientBase` 的 OO1 UDF
  注册 arity 误判（rest 参数回调使 `length` 恒为 1，`rxdb_fts_bigram` / `regexp` / `regexp_replace` 被当零参函数），
  以及 `execute_oo1_helper` 对空 bindings 也调 `statement.bind([])` 撞 OO1「no bindable parameters」。
- `wa-sqlite` 的 npm 预编译 wasm 未编 `SQLITE_ENABLE_FTS5`（`strings` 无 fts5 符号），属生产构建管线变更而非
  现成替换；按 AC#8「确实不支持给可判别原因」路径，`backend-registry.ts` 把 `wa-sqlite` 从 `supported` 改为
  `unverified` + reason「wasm build does not enable SQLITE_ENABLE_FTS5」，其 spec 改为断言「装载即被可判别拒绝」。

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

## 已冻结的决策

### 决策 1（AC#9）：11 个 FTS5 专有导出保持原名原义，backend 层另起中立入口

三条路里选「保持」。理由：改名与降为内部都是破坏性变更，而本故事的价值是**加一个 backend**，
不是重命名一批导出；versioning-policy 下不值得为内部整洁打破下游编译。
`SearchBackend` / `SearchBackendCapabilities` / `resolveSearchBackend` 等是**新增**导出，走正常基线新增流程。

判定依据：`node scripts/audit/api-surface.mjs` 对 `rxdb-plugin-search.json` 的 diff **只有新增行，零删除零改名**
（`git diff` 中该文件 `-` 行数为 0），新增 13 项。

### 决策 2（AC#8）：`wa-sqlite-miniprogram` 不纳入放行名单

故事原文要求「实测，不能假设」，而小程序环境本机跑不出来。它在能力表中登记为
`fts5: 'unverified'`，guard 抛出的原因与「未登记」可判别地区分开
（`unsupported-adapter.spec.ts` 最后一条用例钉死这两条原因串不相等）。待 US-211 或实测后改判。

### 决策 3（AC#7）：回填进度的哨兵是数据本身，不另建记账记录

计划里原本写的是加一条 `backfill__<sig>__pending` 记录。实现时发现不需要，也不应该：
PG 侧 `_fts IS NULL` 本身就是持久化的、由数据派生的进度哨兵——`ADD COLUMN` 给存量行留 NULL，
trigger 装上后所有新写入立刻非 NULL。多一条记账记录就多一个会与真实数据不一致的来源，
而且它盖不住「`ALTER TABLE` 与 `CREATE TRIGGER` 之间插进来的写入」这个窗口，哨兵能盖住。

FTS5 侧沿用同一模型的另一半：两条 migration 记录**只在全部完成后**才写，中断即整批重来。
两侧各有一条对称的 spec 断言（`fts5-runtime.spec.ts` 的「回填中断」/ `pg-backend-integration.spec.ts` 的 AC#7 两条）。

### 决策 4（实现期新增）：pglite 是**真**可选 peer，靠惰性加载兑现

`index.ts` 导出 `createPgTsvectorBackend`，而它静态引入 `@aiao/rxdb-adapter-pglite/fts` 时，
只装了 SQLite adapter 的下游连 `import '@aiao/rxdb-plugin-search'` 都会失败——
三个框架绑定包的 spec 整片变红就是这么暴露的，"optional" 成了一句空话。

处置（`packages/rxdb-plugin-search/src/backend/pg/pg-fts-contract.ts`）：
三个字面量常量（`FTS_COLUMN` / `DEFAULT_FTS_REGCONFIG` / `DEFAULT_FTS_ARRAY_KIND`）本地声明，
由 `pg-fts-contract.spec.ts` 与适配器真值逐个对等断言兜住漂移；
两个真正含 SQL 逻辑的 DDL 构造器**照旧复用**（抄一份必然与适配器漂移，正是整套设计要消灭的），
改成安装期 `await import()`。同一条 spec 还扫描 `backend/pg/*.ts` 的源码，
钉死运行时模块里不得再出现对该包的静态 `import ... from`。

## 交付记录（2026-08-29）

- 新增 `packages/rxdb-plugin-search/src/backend/`：`search-backend.ts`（契约与能力声明）、
  `backend-registry.ts`（adapter 名 → 后端的唯一真相表）、`fts5-backend.ts`（现有 FTS5 逻辑的薄壳）、
  `pg/`（`pg-backend` / `pg-runtime` / `pg-engine` / `pg-search-sql` / `pg-query-compiler` / `pg-statements` / `pg-fts-contract`）。
- `adapter-guard.ts` 由 registry 派生，`SUPPORTED_SEARCH_ADAPTERS` 保留导出但不再硬编码。
- `plugin.ts` 构造期解析后端（fail-fast，不返回降级 handle），能力探测折进**第一个实体的**
  `bootstrapTransaction`——不另开事务，也不可能被绕过。
- 迁移记录命名空间按后端隔离（`fts5__` vs `pgfts__`），同一张表换过后端时不会互认历史签名。
- 验证：`rxdb-plugin-search` 32 文件 / 288 用例全绿（含 10 条真 PGlite 集成用例）；
  `lint typecheck test build` 覆盖 `rxdb-plugin-search` / `rxdb-adapter-pglite` / `rxdb-adapter-sqlite-core` /
  `rxdb-adapter-wa-sqlite` 全绿、零 ESLint 警告；三框架绑定包 test 全绿且公开面零变化。

## 后续

- `wa-sqlite` 的 FTS5 能力：需用 `-DSQLITE_ENABLE_FTS5` 重编译 wasm 或评估第三方 FTS5-enabled fork
  替换依赖，届时再把 `backend-registry.ts` 里 `wa-sqlite` 从 `unverified` 升回 `supported`。
- `wa-sqlite-miniprogram` 的 FTS5 实测（决策 2）随 US-211 一并处理。

## References

- [US-702 全文搜索](./US-702-full-text-search.md) — 其 AC#4 的 ✅ 覆盖面被本故事 AC#8 收紧为可验证口径
- [PGlite 适配器](../adapter/US-202-pglite-adapter.md)
