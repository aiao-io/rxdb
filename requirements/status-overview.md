# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> **完成记录**与 spec 关闭快照已移至 [CHANGELOG.md](CHANGELOG.md)。

**最后同步**: 2026-08-13

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 32   |
| 👀 In Review   | 1    |
| 📝 Backlog     | 11   |
| 🚧 In Progress | 1    |
| 🚫 Blocked     | 0    |
| **合计**       | 45   |

> 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，请勿手写维护。
> 2026-08-13 的评审把 US-012 拆成 US-012a/b/c、US-207 拆出 US-208、US-305 升级为 epic-006 并拆成 US-305～US-308，Backlog 因此从 4 增至 11；这是拆分而不是新增范围。
> 同日补写了 [US-209](stories/adapter/US-209-miniprogram-adapter.md)（微信小程序适配器），适配器实现早已合并，故直接记为 `In Review` 而非 `Backlog`。

## 项目统计

| 维度         | 数值                                                                                                                                 |
| :----------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| 总包目录     | 28 个公开 npm 包                                                                                                                     |
| 支持框架     | Angular 22 / React 19 / Vue 3.5                                                                                                      |
| 支持平台     | Web / Electron / Tauri / PWA / 小程序                                                                                                |
| 存储适配器   | wa-sqlite / sqlite-wasm / sqlite (@sqlite.org) / sqliteai / wa-sqlite-miniprogram / PGlite / Supabase + 共享 core + encrypted 包装层 |
| 演示应用     | 6 个 (Angular / Electron / React / Supabase / Tauri / Vue) + DevTools 扩展                                                           |
| E2E 测试套件 | 5 个 (Angular / Electron / React / Supabase / Vue)                                                                                   |

> 基础设施包（`@aiao/utils` 通用工具、`@aiao/rxdb-test` 跨框架测试 fixture）不单独立 story；前者属于公用底座，后者由 [US-702](stories/future/US-702-full-text-search.md) 等业务 story 引用其 fixture（`cross-framework-fixtures/`）。

### 已知的需求覆盖缺口

- ~~`@aiao/rxdb-adapter-miniprogram` 没有任何 story~~ → 2026-08-13 补写 [US-209](stories/adapter/US-209-miniprogram-adapter.md)。适配器实现与 12 个 spec / 92 个用例早已合并，故事按事实把已实现能力标 ✅，只把**门禁与文档缺口**留作 ⬜：本包不在 [coverage-baseline.json](../scripts/audit/coverage-baseline.json) 中（覆盖率不受门禁保护）、`./runtime` 子路径导出不受 API baseline 覆盖（[api-surface.mjs:41](../scripts/audit/api-surface.mjs#L41) 的 v1 边界）、[compatibility.md](../website/docs/compatibility.md) 未列出本包、根 README 仍声称支持 Alipay。
- **小程序运行时的搜索能力仍无故事覆盖**。`@aiao/rxdb-plugin-search` 只白名单 `sqlite-wasm`，小程序侧能否加载 FTS5 扩展不在 US-209 范围内，见下方跨框架矩阵脚注。

## 按 Epic 索引

### [核心 MVP](epics/epic-001-core-mvp.md)

#### 核心引擎

- ✅ [US-001 定义数据模型](stories/core/US-001-model-definition.md)
- ✅ [US-002 客户端代码生成](stories/core/US-002-client-generation.md)
- ✅ [US-003 数据查询](stories/core/US-003-data-query.md)
- ✅ [US-004 数据变更](stories/core/US-004-data-mutation.md)
- ✅ [US-005 关系映射](stories/core/US-005-relationship-mapping.md)
- ✅ [US-006 响应式查询](stories/core/US-006-reactive-queries.md)
- ✅ [US-007 变更追踪](stories/core/US-007-change-tracking.md)
- ✅ [US-008 事务支持](stories/core/US-008-transaction-support.md)
- ✅ [US-009 跨 Tab 同步](stories/core/US-009-cross-tab-sync.md)
- ✅ [US-010 树形数据结构](stories/core/US-010-tree-entity.md)

#### 框架集成

- ✅ [US-101 Angular 集成](stories/framework/US-101-angular-integration.md)
- ✅ [US-102 React 集成](stories/framework/US-102-react-integration.md)
- ✅ [US-103 Vue 集成](stories/framework/US-103-vue-integration.md)

#### 存储适配器

- ✅ [US-201 SQLite 适配器](stories/adapter/US-201-sqlite-adapter.md)
- ✅ [US-202 PGlite 适配器](stories/adapter/US-202-pglite-adapter.md)
- ✅ [US-204 SQLite WASM 适配器](stories/adapter/US-204-sqlite-wasm-adapter.md)
- ✅ [US-205 SQLiteAI 适配器](stories/adapter/US-205-sqliteai-adapter.md)

#### Plugin 包

- ✅ [US-501 Workspace 插件](stories/plugin/US-501-workspace-plugin.md)
- ✅ [US-502 Storage 插件](stories/plugin/US-502-storage-plugin.md)
- ✅ [US-503 图数据插件](stories/plugin/US-503-graph-data.md)

### [数据同步与协作](epics/epic-002-data-sync.md)

- ✅ [US-301 版本控制](stories/collaboration/US-301-version-control.md)
- ✅ [US-302 撤销/重做](stories/collaboration/US-302-undo-redo.md)
- ✅ [US-203 Supabase 适配器](stories/adapter/US-203-supabase-adapter.md)
- ✅ [US-803 本地数据加密](stories/future/US-803-local-encryption.md)

> 原挂在本 Epic 下的 US-305 已升级为 [epic-006](epics/epic-006-working-tree-commits.md)，见下方独立小节。

### [UI 与开发者工具](epics/epic-003-ui-developer-tools.md)

- ✅ [US-402 代码编辑器](stories/ui/US-402-code-editor.md)
- ✅ [US-902 DevTools 面板](stories/future/US-902-devtools-panel.md)

> US-401 / US-701 查询构建器系列已随 PR #251 清理出本仓库，详见 [CHANGELOG](CHANGELOG.md)。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ⬜ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- ⬜ [US-207 Electron/Tauri 连接本地数据库](stories/adapter/US-207-desktop-local-database.md) — 桌面 SQLite 文件路径
- ⬜ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — 从 US-207 拆出，PGlite callback transaction 不能跨 IPC 序列化
- 👀 [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md) — 实验性，适配器已合并，剩余为覆盖率门禁登记与文档收尾

### [类型系统演进](epics/epic-005-type-system-evolution.md)

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- 📄 [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md) — **父故事/共享契约文档，不直接交付**
  - ⬜ [US-012a 字段 format 声明与注册期校验](stories/core/US-012a-field-format-declaration.md)
  - ⬜ [US-012b 实体字段描述 DTO](stories/core/US-012b-entity-fields-dto.md)
  - ⬜ [US-012c 字段值校验、生成器透传与三框架契约](stories/core/US-012c-field-value-validation-codegen.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- 🚧 [US-304 跨 realm writer lease 与迁移 fencing](stories/collaboration/US-304-writer-lease-migration-fencing.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

由 2026-08-13 的评审从原 US-305 升级而来：原故事持有 4 个 user story、28 条 FR、7 个关键实体，
横跨 `packages/rxdb/src/version/`、`src/system/`、workspace 插件、三个框架包与三个 demo，INVEST「Small」不成立。
拆分后每个故事都能独立证明「写入 → 刷新 → 读回」。**必须按顺序交付**，后一个依赖前一个的存储布局。

- ⬜ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 基础层
- ⬜ [US-306 工作树、缓存区与提交操作](stories/collaboration/US-306-working-tree-index.md)
- ⬜ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md)
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — 依赖 US-304 收敛

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
> PGlite 侧由 [US-703](stories/future/US-703-pglite-full-text-search.md) 认领；wa-sqlite / sqlite / sqliteai / miniprogram 的搜索支持尚无故事覆盖
> （[US-209](stories/adapter/US-209-miniprogram-adapter.md) 只覆盖小程序适配器本身，不含 FTS5）。

## 适配器能力对比

| 适配器                 | 包名                             | `ADAPTER_NAME`          | 类型   | 核心能力                                                              | 需求覆盖                                                |
| :--------------------- | :------------------------------- | :---------------------- | :----- | :-------------------------------------------------------------------- | :------------------------------------------------------ |
| wa-sqlite              | `@aiao/rxdb-adapter-wa-sqlite`   | `wa-sqlite`             | Local  | rhashimoto/wa-sqlite，Worker/OPFS VFS、AsyncQueueExecutor             | [US-201](stories/adapter/US-201-sqlite-adapter.md)      |
| sqlite-wasm (subframe) | `@aiao/rxdb-adapter-sqlite-wasm` | `sqlite-wasm`           | Local  | `@subframe7536/sqlite-wasm`，oo1 API                                  | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md) |
| sqlite (@sqlite.org)   | `@aiao/rxdb-adapter-sqlite`      | `sqlite`                | Local  | `@sqlite.org/sqlite-wasm` 官方包，与 subframe 版本接口一致            | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md) |
| sqlite-core（共享层）  | `@aiao/rxdb-adapter-sqlite-core` | —                       | 共享层 | `RxDBAdapterSqliteBase` / execute / trigger，五个 SQLite adapter 复用 | [US-201](stories/adapter/US-201-sqlite-adapter.md)      |
| sqliteai               | `@aiao/rxdb-adapter-sqliteai`    | `sqliteai`              | Local  | 向量列 + AI SQL 函数，支撑本地 RAG                                    | [US-205](stories/adapter/US-205-sqliteai-adapter.md)    |
| miniprogram            | `@aiao/rxdb-adapter-miniprogram` | `wa-sqlite-miniprogram` | Local  | **实验性**，仅微信逻辑层：`WXWebAssembly` + 同步文件 VFS，强制单连接  | [US-209](stories/adapter/US-209-miniprogram-adapter.md) |
| PGlite                 | `@aiao/rxdb-adapter-pglite`      | `pglite`                | Local  | LISTEN/NOTIFY 触发器，延迟约束                                        | [US-202](stories/adapter/US-202-pglite-adapter.md)      |
| encrypted（包装层）    | `@aiao/rxdb-adapter-encrypted`   | —                       | 包装层 | 透明字段加密，包装任意底层 adapter                                    | [US-803](stories/future/US-803-local-encryption.md)     |
| Supabase               | `@aiao/rxdb-adapter-supabase`    | `supabase`              | Remote | RPC 推送、PostgREST、Realtime                                         | [US-203](stories/adapter/US-203-supabase-adapter.md)    |
