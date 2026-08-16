# 能力矩阵

> 本文回答「仓库现在能做什么、哪些组合还不支持」。故事状态见 [status-overview.md](status-overview.md)，排期见 [roadmap.md](roadmap.md)。

## 项目统计

| 维度         | 数值                                                                                                                                                                                                |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 总包目录     | 29 个公开 npm 包                                                                                                                                                                                    |
| 支持框架     | Angular 22 / React 19 / Vue 3.5                                                                                                                                                                     |
| 支持平台     | Web / Electron / Tauri / PWA / 小程序                                                                                                                                                               |
| 存储适配器   | 8 个具名适配器：wa-sqlite / sqlite-wasm / sqlite (@sqlite.org) / sqliteai / wa-sqlite-miniprogram / desktop / PGlite / Supabase；另有 sqlite-core 共享基类与 encrypted 加密工具包（两者均非适配器） |
| 演示应用     | 6 个 (Angular / Electron / React / Supabase / Tauri / Vue) + DevTools 扩展                                                                                                                          |
| E2E 测试套件 | 5 个 (Angular / Electron / React / Supabase / Vue)                                                                                                                                                  |

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

> `useSearch` 的三端 API 对称成立，但**能力边界不对称于适配器**：
> [adapter-guard.ts](../packages/rxdb-plugin-search/src/core/adapter-guard.ts) 的 `SUPPORTED_SEARCH_ADAPTERS` 目前只有 `sqlite-wasm`，
> 其余 adapter 在 `createRxDatabase` 阶段直接抛 `SearchUnsupportedAdapterError`（不降级、不挂载 `.search`）。
> PGlite 侧由 [US-703](stories/future/US-703-pglite-full-text-search.md) 认领；wa-sqlite / sqlite / sqliteai / miniprogram / desktop 的搜索支持尚无故事覆盖
> （[US-209](stories/adapter/US-209-miniprogram-adapter.md) 只覆盖小程序适配器本身，不含 FTS5；
> [US-207](stories/adapter/US-207-desktop-local-database.md) / [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) 同样不含 FTS5）。

## 适配器能力对比

| 适配器                  | 包名                             | `ADAPTER_NAME`          | 类型   | 核心能力                                                                                                                     | 需求覆盖                                                                                                                     |
| :---------------------- | :------------------------------- | :---------------------- | :----- | :--------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| wa-sqlite               | `@aiao/rxdb-adapter-wa-sqlite`   | `wa-sqlite`             | Local  | rhashimoto/wa-sqlite，Worker/OPFS VFS、AsyncQueueExecutor                                                                    | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                           |
| sqlite-wasm (subframe)  | `@aiao/rxdb-adapter-sqlite-wasm` | `sqlite-wasm`           | Local  | `@subframe7536/sqlite-wasm`，oo1 API                                                                                         | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                      |
| sqlite (@sqlite.org)    | `@aiao/rxdb-adapter-sqlite`      | `sqlite`                | Local  | `@sqlite.org/sqlite-wasm` 官方包，与 subframe 版本接口一致                                                                   | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                      |
| sqlite-core（共享层）   | `@aiao/rxdb-adapter-sqlite-core` | —                       | 共享层 | `RxDBAdapterSqliteBase` / execute / trigger，五个 SQLite adapter 复用                                                        | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                           |
| sqliteai                | `@aiao/rxdb-adapter-sqliteai`    | `sqliteai`              | Local  | 向量列 + AI SQL 函数，支撑本地 RAG                                                                                           | [US-205](stories/adapter/US-205-sqliteai-adapter.md)                                                                         |
| miniprogram             | `@aiao/rxdb-adapter-miniprogram` | `wa-sqlite-miniprogram` | Local  | **实验性**，仅微信逻辑层：`WXWebAssembly` + 同步文件 VFS，强制单连接                                                         | [US-209](stories/adapter/US-209-miniprogram-adapter.md)（已交）· [多端扩展 US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)（Backlog） |
| PGlite                  | `@aiao/rxdb-adapter-pglite`      | `pglite`                | Local  | LISTEN/NOTIFY 触发器，延迟约束                                                                                               | [US-202](stories/adapter/US-202-pglite-adapter.md)                                                                           |
| desktop                 | `@aiao/rxdb-adapter-desktop`     | `desktop`               | Local  | 桌面宿主 SQLite：Electron 走 `node:sqlite` host；Tauri 侧本包只提供 transport，真正的 host 是 `src-tauri` 的 Rust `rusqlite` | [US-207](stories/adapter/US-207-desktop-local-database.md) · [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) |
| encrypted（加密工具包） | `@aiao/rxdb-adapter-encrypted`   | —                       | 工具包 | 密钥环 + 信封编解码；**不是适配器、也不包装适配器**，由 sqlite-core / pglite 内部消费                                        | [US-803](stories/future/US-803-local-encryption.md)                                                                          |
| Supabase                | `@aiao/rxdb-adapter-supabase`    | `supabase`              | Remote | RPC 推送、PostgREST、Realtime                                                                                                | [US-203](stories/adapter/US-203-supabase-adapter.md)                                                                         |

> `encrypted` 包的 [index.ts](../packages/rxdb-adapter-encrypted/src/index.ts) 只导出 `Keyring` / `createKeyring` / 信封编解码 / 校验与错误类型，**没有任何 `IRxDBAdapter` 实现**；
> [RxDBAdapterSqliteBase.ts:43](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L43) 与 [RxDBAdapterPGlite.ts:47](../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L47) 直接 import 它，加密是**内建**能力而非外层包装。
> 因此按适配器 `name` 判定能力时不存在「先解包」这一步（见 [epic-006 启用与存储边界](epics/epic-006-working-tree-commits.md)）。

## 已知的需求覆盖缺口

- `@aiao/rxdb-adapter-miniprogram` 的**微信路径**由 [US-209](stories/adapter/US-209-miniprogram-adapter.md) 覆盖（`Done`）：本包已在 [coverage-baseline.json](../scripts/audit/coverage-baseline.json) 中留下趋势基准（**注意：覆盖率硬门槛一直生效**，`coverage-check.mjs` 按包类型卡 80%/90%，与是否在 baseline 中无关；baseline 只用于「比上次低」的软警告）、[compatibility.md](../website/docs/compatibility.md) 补了能力边界专节、根 README 不再声称支持 Alipay、[examples/README.md](../examples/README.md) 声明示例不在 CI 覆盖范围。
- **非微信小程序平台仍无实现**（支付宝 / 抖音 / 百度 / QQ）。Taro 示例保留了多端 `build:*`，适配器构造函数却只认 `wx` + `WXWebAssembly`。缺口由 [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 认领（Backlog，三阶段：先抽宿主契约再按可行性门禁放行）；阶段没关之前文档仍写「仅微信」。
- **`exports` 子路径入口的导出表面不受 API baseline 保护**（US-209 AC#8 的决策产物）。[api-surface.mjs](../scripts/audit/api-surface.mjs) 的 v1 边界只扫主入口 `src/index.ts`，**8 个公开包共 12 个子路径入口**（`rxdb-adapter-miniprogram/runtime`、`rxdb-adapter-wa-sqlite/client`、`rxdb-plugin-graph/{sqlite,generator}` 等；`rxdb-test` 的 5 个不计——整包非产品 API）按 [versioning-policy.md](versioning-policy.md) 属于公开 API 但只能人工审查。**清单本身已受门禁保护**（`KNOWN_UNCOVERED_SUBPATHS` + `subpath-inventory.mjs`，新增/删除子路径不同步即失败），**仍缺的是扫描子路径导出表面** → 由 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领（Backlog，缺口在它交付前依然敞开）。
- **小程序运行时的搜索能力仍无故事覆盖**。`@aiao/rxdb-plugin-search` 只白名单 `sqlite-wasm`，小程序侧能否加载 FTS5 扩展不在 US-209 范围内，见上方跨框架矩阵脚注。
