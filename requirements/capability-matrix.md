# 能力矩阵

> 本文回答「仓库现在能做什么、哪些组合还不支持」。故事状态见 [status-overview.md](status-overview.md)，排期见 [roadmap.md](roadmap.md)。

## 项目统计

| 维度         | 数值                                                                                                                                                                                                                                                                                   |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 总包目录     | **31 个** `packages/*`（有 `package.json` 的公开包），全部公开发布（无 `private: true`）。其中 **30 个**受 API baseline 保护——[api-baseline/](api-baseline/) 的 json 文件数即此数，缺的一个是 `rxdb-test`（非产品 API，见下方脚注）。两个数不同义，引用时别互换                        |
| 支持框架     | Angular 22 / React 19 / Vue 3.5                                                                                                                                                                                                                                                        |
| 支持平台     | Web / Electron / Tauri / PWA / 小程序                                                                                                                                                                                                                                                  |
| 存储适配器   | 11 个具名适配器：wa-sqlite / sqlite-wasm / sqlite (@sqlite.org) / sqliteai / wa-sqlite-miniprogram / sqlite-electron / sqlite-tauri / pglite / pglite-electron / supabase / http（以代码里的 `ADAPTER_NAME` 为准）；另有 sqlite-core 共享基类与 encrypted 加密工具包（两者均非适配器） |
| 演示应用     | 7 个 (Angular / Electron / HTTP / React / Supabase / Tauri / Vue) + DevTools 扩展；HTTP demo 附参考后端 `dev-rxdb-http-server`                                                                                                                                                         |
| E2E 测试套件 | 7 个 (Angular / Electron / HTTP / React / Supabase / Tauri / Vue)                                                                                                                                                                                                                      |

> 基础设施包（`@aiao/utils` 通用工具、`@aiao/rxdb-test` 跨框架测试 fixture）不单独立 story；前者属于公用底座，后者由 [US-702](stories/future/US-702-full-text-search.md) 等业务 story 引用其 fixture（`cross-framework-fixtures/`）。

## 跨框架 API 对称矩阵

| Hook               | Angular | React | Vue |
| :----------------- | :-----: | :---: | :-: |
| `useGet`           |   ✅    |  ✅   | ✅  |
| `useFind`          |   ✅    |  ✅   | ✅  |
| `useFindOne`       |   ✅    |  ✅   | ✅  |
| `useFindOneOrFail` |   ✅    |  ✅   | ✅  |
| `useFindAll`       |   ✅    |  ✅   | ✅  |
| `useFindByCursor`  |   ✅    |  ✅   | ✅  |
| `useCount`         |   ✅    |  ✅   | ✅  |
| Tree hooks         |   ✅    |  ✅   | ✅  |
| Graph hooks        |   ✅    |  ✅   | ✅  |
| InfiniteScroll     |   ✅    |  ✅   | ✅  |
| `useSearch`        |   ✅    |  ✅   | ✅  |

> `useSearch` 的三端 API 对称成立，但**能力边界不对称于适配器**。放行名单已随
> [US-703](stories/future/US-703-pglite-full-text-search.md)（Done，2026-08-31）从「硬编码一个 `sqlite-wasm`」
> 改成 [backend-registry.ts](../packages/rxdb-plugin-search/src/backend/backend-registry.ts) 的登记表，
> `SUPPORTED_SEARCH_ADAPTERS` 由 `status === 'supported'` 的项**派生**：
>
> | adapter                 | 后端          | 状态          | 说明                                                                                                  |
> | ----------------------- | ------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
> | `sqlite-wasm`           | `fts5`        | ✅ supported  | CJK bigram 函数 `rxdb_fts_bigram` 注册在共享基类 `SqliteClient`                                       |
> | `sqlite` / `sqliteai`   | `fts5`        | ✅ supported  | 同上，由 `Oo1ClientBase` 覆盖                                                                         |
> | `pglite`                | `pg-tsvector` | ✅ supported  | US-703 交付                                                                                           |
> | `wa-sqlite`             | `fts5`        | ⚠️ unverified | npm 预编译 wasm 未编入 FTS5 模块；补齐要 `-DSQLITE_ENABLE_FTS5` 重编译，属构建管线变更（US-703 AC#8） |
> | `wa-sqlite-miniprogram` | `fts5`        | ⚠️ unverified | 小程序宿主能否提供 FTS5 与自定义函数注册须真机实测，本轮无环境                                        |
>
> `unverified` 与未登记的 adapter 一样在 `createRxDatabase` 阶段抛 `SearchUnsupportedAdapterError`
> （不降级、不挂载 `.search`），区别只在错误里带不带可判别 `reason`。桌面宿主
> （`sqlite-electron` / `sqlite-tauri`）**有意不进表**：SQL 在宿主侧执行，宿主没注册那个函数，
> 缺的不是验证而是宿主实现；`http` / `supabase` 同理，缺的是本地 SQL 连接本身。

## 适配器能力对比

| 适配器                  | 包名                             | `ADAPTER_NAME`          | 类型   | 核心能力                                                                                                                                                                                                                                                                                           | 需求覆盖                                                                                                                                                                                                                                                       |
| :---------------------- | :------------------------------- | :---------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wa-sqlite               | `@aiao/rxdb-adapter-wa-sqlite`   | `wa-sqlite`             | Local  | rhashimoto/wa-sqlite，Worker/OPFS VFS、AsyncQueueExecutor                                                                                                                                                                                                                                          | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                                                                                                                                                             |
| sqlite-wasm (subframe)  | `@aiao/rxdb-adapter-sqlite-wasm` | `sqlite-wasm`           | Local  | `@subframe7536/sqlite-wasm`，oo1 API                                                                                                                                                                                                                                                               | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                                                                                                                                                        |
| sqlite (@sqlite.org)    | `@aiao/rxdb-adapter-sqlite`      | `sqlite`                | Local  | `@sqlite.org/sqlite-wasm` 官方包，与 subframe 版本接口一致                                                                                                                                                                                                                                         | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                                                                                                                                                        |
| sqlite-core（共享层）   | `@aiao/rxdb-adapter-sqlite-core` | —                       | 共享层 | `RxDBAdapterSqliteBase` / execute / trigger，五个 SQLite adapter 复用                                                                                                                                                                                                                              | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                                                                                                                                                             |
| sqliteai                | `@aiao/rxdb-adapter-sqliteai`    | `sqliteai`              | Local  | 向量列 + AI SQL 函数，支撑本地 RAG                                                                                                                                                                                                                                                                 | [US-205](stories/adapter/US-205-sqliteai-adapter.md)                                                                                                                                                                                                           |
| miniprogram             | `@aiao/rxdb-adapter-miniprogram` | `wa-sqlite-miniprogram` | Local  | **实验性**，仅微信逻辑层：`WXWebAssembly` + 同步文件 VFS，强制单连接                                                                                                                                                                                                                               | [US-209](stories/adapter/US-209-miniprogram-adapter.md)（已交）· [多端扩展 US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)（Backlog）                                                                                                           |
| PGlite                  | `@aiao/rxdb-adapter-pglite`      | `pglite`                | Local  | LISTEN/NOTIFY 触发器，延迟约束                                                                                                                                                                                                                                                                     | [US-202](stories/adapter/US-202-pglite-adapter.md)                                                                                                                                                                                                             |
| electron (SQLite)       | `@aiao/rxdb-adapter-electron`    | `sqlite-electron`       | Local  | Electron 宿主 SQLite：`node:sqlite` host 挡在 `./host` 子路径入口后，renderer 侧不含任何 Node 内建                                                                                                                                                                                                 | [US-207](stories/adapter/US-207-desktop-local-database.md)                                                                                                                                                                                                     |
| tauri (SQLite)          | `@aiao/rxdb-adapter-tauri`       | `sqlite-tauri`          | Local  | Tauri 宿主 SQLite：本包只有 WebView 侧的 transport + JSON codec，真正的 host 是 `src-tauri` 的 Rust `rusqlite`（不经 npm 分发）                                                                                                                                                                    | [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)                                                                                                                                                                                                |
| electron (PGlite)       | `@aiao/rxdb-adapter-electron`    | `pglite-electron`       | Local  | PGlite 数据目录 + 跨 IPC 的事务 host，落在同一个包的 `./pglite`（renderer）/ `./pglite-host`（主进程）子路径下；引擎与事务模型都不同于 `sqlite-electron`，故仍占第三个 `name`。事务走「IPC 事务 ID 协议」（主进程持连接，renderer 用事务 ID 串联多次往返）                                         | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)（In Review，11 条 AC 关 10；只剩 AC#10 三平台打包 smoke）                                                                                                                                   |
| encrypted（加密工具包） | `@aiao/rxdb-adapter-encrypted`   | —                       | 工具包 | 密钥环 + 信封编解码；**不是适配器、也不包装适配器**，由 sqlite-core / pglite 内部消费                                                                                                                                                                                                              | [US-803](stories/future/US-803-local-encryption.md)                                                                                                                                                                                                            |
| Supabase                | `@aiao/rxdb-adapter-supabase`    | `supabase`              | Remote | RPC 推送、PostgREST、Realtime                                                                                                                                                                                                                                                                      | [US-203](stories/adapter/US-203-supabase-adapter.md)                                                                                                                                                                                                           |
| HTTP                    | `@aiao/rxdb-adapter-http`        | `http`                  | Remote | 远端权威 HTTP + **独立注册**的 sqlite 行缓存；v1 **只支持 `SyncType.QueryCache`**，`pullChanges`/`mergeChanges`/`getChangeCount` 一律 throw unsupported（不返回空数组/`0`）；`getRepository`/`saveMany`/`removeMany`/`mutations`/`rawQuery` 亦无实现；bigint / binary 字段在 `connect()` fail-fast | [US-212](stories/adapter/US-212-http-adapter.md)（已发 `stable`，两阶段全关）；SSE 变更通知由 [US-023](stories/core/US-023-querycache-remote-invalidation.md) 承接（`changeFeed` 缺省关闭）；行缓存 eviction 见 [roadmap「明确不排期」](roadmap.md#明确不排期) |

> `encrypted` 包的 [index.ts](../packages/rxdb-adapter-encrypted/src/index.ts) 只导出 `Keyring` / `createKeyring` / 信封编解码 / 校验与错误类型，**没有任何 `IRxDBAdapter` 实现**；
> [RxDBAdapterSqliteBase.ts:33](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L33) 与 [RxDBAdapterPGlite.ts:26](../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L26) 直接 import 它，加密是**内建**能力而非外层包装。
> 因此按适配器 `name` 判定能力时不存在「先解包」这一步（见 [epic-006 启用与存储边界](epics/epic-006-working-tree-commits.md)）。

## 已知的需求覆盖缺口

- **非微信小程序平台仍无实现**（支付宝 / 抖音 / 百度 / QQ）。Taro 示例保留了多端 `build:*`，适配器构造函数却只认 `wx` + `WXWebAssembly`。缺口由 [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 认领（Backlog，三阶段：先抽宿主契约再按可行性门禁放行）；阶段没关之前文档仍写「仅微信」。
- **小程序运行时的搜索能力仍无故事覆盖**。`wa-sqlite-miniprogram` 已在 [backend-registry.ts](../packages/rxdb-plugin-search/src/backend/backend-registry.ts) 登记为 `unverified`（登记 ≠ 放行，仍抛 `SearchUnsupportedAdapterError`），但小程序宿主能否加载 FTS5 并注册 `rxdb_fts_bigram` 须真机实测，不在 US-209 范围内，也无故事认领。
- **两个 `unverified` 后端待转正**，均为环境/构建管线问题而非设计缺口：`wa-sqlite` 要用 `-DSQLITE_ENABLE_FTS5` 重编译 wasm（npm 预编译产物未编入 FTS5，见 [US-703](stories/future/US-703-pglite-full-text-search.md) AC#8）；`wa-sqlite-miniprogram` 同上一条。SQLite FTS5（[US-702](stories/future/US-702-full-text-search.md)）与 PGlite `pg-tsvector`（US-703，Done 2026-08-31）本身均已交付，引擎侧不再有能力不对称。
- **PGlite 的 QueryCache 行契约存在同族缺口**：`upsert_many_sql.ts` 未检查缺非空列（sqlite-core 侧已由 [US-022](stories/core/US-022-querycache-remote-row-contract.md) 的 `assertQueryCacheRowContract` 守护），由 [US-024](stories/core/US-024-pglite-querycache-row-contract.md) 认领（Backlog）。
