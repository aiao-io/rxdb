# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> **完成记录**与 spec 关闭快照已移至 [CHANGELOG.md](CHANGELOG.md)。

**最后同步**: 2026-08-11

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 32   |
| 👀 In Review   | 0    |
| 📝 Backlog     | 4    |
| 🚧 In Progress | 1    |
| 🚫 Blocked     | 0    |

> 数字由 `find requirements/stories -name "US-*.md" | xargs awk '/^status:/' | sort | uniq -c` 推导，请勿手写维护。

## 项目统计

| 维度         | 数值                                                                                      |
| :----------- | :---------------------------------------------------------------------------------------- |
| 总包目录     | 27 个公开 npm 包                                                                          |
| 支持框架     | Angular 22 / React 19 / Vue 3.5                                                           |
| 支持平台     | Web / Electron / Tauri / PWA                                                              |
| 存储适配器   | wa-sqlite / sqlite-wasm / sqlite (@sqlite.org) / sqliteai / PGlite / Supabase + 共享 core |
| 演示应用     | 6 个 (Angular / Electron / React / Supabase / Tauri / Vue) + DevTools 扩展                |
| E2E 测试套件 | 4 个 (Angular / React / Supabase / Vue)                                                   |

> 基础设施包（`@aiao/utils` 通用工具、`@aiao/rxdb-test` 跨框架测试 fixture）不单独立 story；前者属于公用底座，后者由 [US-702](stories/future/US-702-full-text-search.md) 等业务 story 引用其 fixture（`cross-framework-fixtures/`）。

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
- ⬜ [US-305 持久化 Git 式工作区提交](stories/collaboration/US-305-persistent-workspace-commits.md)
- ✅ [US-803 本地数据加密](stories/future/US-803-local-encryption.md)

### [UI 与开发者工具](epics/epic-003-ui-developer-tools.md)

- ✅ [US-402 代码编辑器](stories/ui/US-402-code-editor.md)
- ✅ [US-902 DevTools 面板](stories/future/US-902-devtools-panel.md)

> US-401 / US-701 查询构建器系列已随 PR #251 清理出本仓库，详见 [CHANGELOG](CHANGELOG.md)。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ⬜ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- ⬜ [US-207 Electron/Tauri 连接本地数据库](stories/adapter/US-207-desktop-local-database.md)

### [类型系统演进](epics/epic-005-type-system-evolution.md)

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- ⬜ [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- 🚧 [US-304 跨 realm writer lease 与迁移 fencing](stories/collaboration/US-304-writer-lease-migration-fencing.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)

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

## 适配器能力对比

| 适配器                 | 包名                             | 类型   | 核心能力                                                              |
| :--------------------- | :------------------------------- | :----- | :-------------------------------------------------------------------- |
| wa-sqlite              | `@aiao/rxdb-adapter-wa-sqlite`   | Local  | rhashimoto/wa-sqlite，Worker/OPFS VFS、AsyncQueueExecutor             |
| sqlite-wasm (subframe) | `@aiao/rxdb-adapter-sqlite-wasm` | Local  | `@subframe7536/sqlite-wasm`，oo1 API                                  |
| sqlite (@sqlite.org)   | `@aiao/rxdb-adapter-sqlite`      | Local  | `@sqlite.org/sqlite-wasm` 官方包，与 subframe 版本接口一致            |
| sqlite-core（共享层）  | `@aiao/rxdb-adapter-sqlite-core` | Local  | `RxDBAdapterSqliteBase` / execute / trigger，四个 SQLite adapter 复用 |
| sqliteai               | `@aiao/rxdb-adapter-sqliteai`    | Local  | 向量列 + AI SQL 函数，支撑本地 RAG                                    |
| PGlite                 | `@aiao/rxdb-adapter-pglite`      | Local  | LISTEN/NOTIFY 触发器，延迟约束                                        |
| Supabase               | `@aiao/rxdb-adapter-supabase`    | Remote | RPC 推送、PostgREST、Realtime                                         |
