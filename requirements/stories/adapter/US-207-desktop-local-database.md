---
id: US-207
title: Electron/Tauri 连接本地数据库
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-08-08
updated: 2026-08-11
tags: [adapter, desktop, electron, tauri, sqlite, pglite]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖远程同步或 UI 功能即可交付
- [x] Negotiable (可协商): 桌面 host 与 renderer 的传输实现可替换
- [x] Valuable (有价值): 数据落在可备份、可迁移的原生本地存储中
- [x] Estimable (可估算): 仅覆盖能力矩阵中明确支持的三个组合
- [ ] Small (小): Electron PGlite 仍需独立的 IPC 事务 host；实现前必须拆为后续 story
- [x] Testable (可测试): 每个运行时/引擎组合都有持久化、事务和失败路径 AC
-->

# 用户故事：Electron/Tauri 连接本地数据库

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 或 Tauri 桌面应用的开发者
**我想要** 将 RxDB 连接到应用本地的 SQLite 文件，并在运行时具备原生文件系统能力时连接 PGlite data directory
**以便** 数据可以跨应用重启持久化，并能通过桌面系统的文件备份和迁移机制管理，而不是只存在于 WebView 的 OPFS 或 IndexedDB 中

## 范围边界

### In Scope

- 提供明确的桌面存储配置，使用可辨识联合区分 SQLite 文件与 PGlite data directory；不得把 PGlite 描述成单文件数据库。
- Tauri 使用 `tauri-plugin-sql` 的 SQLite feature 连接应用作用域内的 SQLite 文件，并仅开放 `sql:default` 与写入所需的 `sql:allow-execute` 权限。
- Electron 在主进程中打开 SQLite 文件，renderer 只通过类型化、参数校验后的 IPC 使用数据库能力；不得开启 `nodeIntegration` 或关闭 `contextIsolation`/`sandbox`。
- Electron 在主进程中使用 PGlite 的 Node filesystem backend 打开 data directory，renderer 不直接获得 Node 文件系统权限。
- 三个受支持组合必须保持现有 RxDB 的查询、事务、变更通知、系统 schema 迁移、writer lease 与加密能力，不允许用功能降级换取文件持久化。
- `disconnect()` 必须等待在途事务和持久化刷新完成，再释放数据库句柄；同一路径允许在当前进程内安全断开并重连。
- `dev-rxdb-electron` 与 `dev-rxdb-tauri` 提供最小接入示例，并用真实临时文件或目录验证重启后的数据恢复。

### 能力矩阵

| 运行时   | SQLite 文件 | PGlite data directory | 本故事结论                           |
| -------- | ----------- | --------------------- | ------------------------------------ |
| Electron | 支持        | 支持                  | In Scope                             |
| Tauri    | 支持        | 不支持                | SQLite In Scope；PGlite Out of Scope |

### Out of Scope

- Tauri 直接打开 PGlite data directory。`tauri-plugin-sql` 的 PostgreSQL feature 是数据库客户端，不是本地 PGlite 引擎；PGlite 自定义 filesystem 又要求同步文件 API，普通异步 Tauri command 无法直接实现。若未来引入 Node/Bun sidecar，必须另立 story 评估打包体积、进程生命周期和 IPC 事务语义。
- 将 PGlite data directory 打包或伪装成单个 `.pglite` 文件。
- 连接 MySQL、远程 PostgreSQL 或其他网络数据库。
- 让用户通过系统文件选择器打开应用数据目录之外的任意数据库；Tauri SQL 的 SQLite 路径基于应用作用域目录，此能力需要独立的路径授权与安全模型。
- 数据库导入、导出、热备份、损坏修复和格式转换。
- 监听其他进程直接写入同一 SQLite 文件所产生的实时变更。
- 浏览器、PWA、移动端与 WebView 内 OPFS/IndexedDB 存储；这些行为继续由现有 adapter 负责。

## 验收标准

| #   | 前置条件                                                                                    | 操作                                                                                 | 预期结果                                                                                                                                                   | 状态 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 应用配置 SQLite 文件存储                                                           | 首次连接、写入实体、断开并重启应用后再次连接                                         | 在同一文件中读回数据；连接期间现有 RxDB 标准 adapter suite 全部通过                                                                                        | ⬜   |
| 2   | Tauri 应用已启用 `tauri-plugin-sql` 的 SQLite feature、`sql:default` 与 `sql:allow-execute` | 通过应用作用域内的 `sqlite:<name>.sqlite3` 连接、写入、断开并重启应用                | 在同一 SQLite 文件中读回数据；未授予额外 shell 或全文件系统权限                                                                                            | ⬜   |
| 3   | Tauri SQLite 已连接                                                                         | 在一次 RxDB 事务中执行至少两次写入，并分别测试 commit 与中途抛错                     | 所有语句固定在同一物理连接；commit 全部可见，rollback 后全部不可见。若 `tauri-plugin-sql` 的连接池不能保证该语义，连接必须失败并报告能力缺失，不得伪造事务 | ⬜   |
| 4   | Electron 应用配置 PGlite data directory                                                     | 写入包含关系、JSONB 与 bigint/binary 的实体，调用 `disconnect()`，重启后重连同一目录 | 数据和类型逐值一致，系统 schema 与 change codec 水位线保持有效                                                                                             | ⬜   |
| 5   | 任一受支持组合已连接                                                                        | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅                             | 用户可见行为与对应现有 SQLite/PGlite adapter 一致，标准测试套件无跳过项                                                                                    | ⬜   |
| 6   | 数据库路径不存在                                                                            | 首次连接                                                                             | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                                         | ⬜   |
| 7   | 路径无权限、SQLite 文件损坏、PGlite 目录无效或 runtime/engine 组合不受支持                  | 发起连接                                                                             | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                                         | ⬜   |
| 8   | 同一存储已有有效 writer lease 或迁移 owner                                                  | 第二个窗口或进程尝试以 writer 身份连接                                               | 沿用现有 writer lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库                                                                         | ⬜   |
| 9   | 数据库存在应用未知的普通业务表                                                              | Aiao 首次连接并初始化系统 schema                                                     | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                                           | ⬜   |
| 10  | 数据库存在未提交事务或在途查询                                                              | 调用 `disconnect()` 或关闭窗口                                                       | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件或 PGlite 目录                                                     | ⬜   |
| 11  | 构建打包后的 Electron/Tauri 应用                                                            | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test                              | SQLite 三平台均通过；Electron PGlite 三平台均通过；测试使用真实临时文件/目录而非 mock 或浏览器存储                                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 拆分前置（阻塞实现）

上方 INVEST 检查清单的 Small 一项未通过：Electron PGlite 需要独立的 IPC 事务 host（见「PGlite 边界」），必须先拆为后续 story 才能进入实现。但当前 AC 表把 PGlite 与 SQLite 混编，导致本故事无法在不做那件"必须拆出去的事"的前提下验收。拆分时按下表分派，不要留下跨故事的悬空 AC：

| AC        | 归属                    | 说明                                                                                                    |
| --------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 / 2 / 3 | 本故事                  | 纯 SQLite 路径；Tauri 事务门禁（AC#3）是本故事最大的未知量，应最先验证                                  |
| 4         | 拆出（Electron PGlite） | 依赖尚未确定的事务 host 方案                                                                            |
| 5 ~ 10    | 本故事（收敛到 SQLite） | 拆分后重述为"受支持的 SQLite 组合"，PGlite 侧在新故事中复用同一批条目                                   |
| 11        | 两个故事各持一半        | 本故事只承诺"SQLite 三平台通过"；"Electron PGlite 三平台通过"随 AC#4 一并移出，不得作为本故事的验收条件 |

在拆分落地前，本故事的 status 应保持 Backlog；AC#4 与 AC#11 的 PGlite 半句不构成本故事的交付承诺。

## 技术笔记

### 运行时边界

- renderer 中的 RxDB adapter 不得直接接触 `fs`、Electron `ipcRenderer` 或任意 Tauri `invoke`；桌面 host 通过窄接口实现 `SqliteClientLike` / PGlite 客户端契约。
- Electron 主进程只接受来自当前主 frame 的请求，校验数据库标识、SQL 参数、事务 ID 和请求大小；preload 只暴露本故事需要的方法，不暴露原始 `ipcRenderer`。
- Tauri SQL 指南将 SQLite 路径描述为相对 `AppConfig`，JavaScript API reference 描述为相对 `BaseDirectory::App`。实现前必须用集成测试锁定当前插件版本的真实解析结果，对外只承诺“应用作用域内的逻辑数据库名”，不泄漏或猜测物理根目录。

### Tauri SQLite 事务门禁

- `@tauri-apps/plugin-sql` 当前 JavaScript API 只公开 `load/get/select/execute/close`，没有事务对象。
- RxDB 的 callback transaction 需要 BEGIN、业务查询与 COMMIT/ROLLBACK 落在同一物理连接。不能因为 SQL 文本能执行 `BEGIN` 就假设连接池会固定连接。
- 优先验证插件能否配置单连接池并串行化整个事务；若不能，使用最小 Rust command 持有 `sqlx::SqliteConnection` 和事务 ID。不得把多条独立 `execute()` 包装成假事务。

### PGlite 边界

- PGlite 的 Node filesystem backend 接受的是 PostgreSQL data directory 路径；一个数据库目录包含多个文件。
- Electron 侧 callback transaction 不能跨 IPC 序列化。host 协议需要显式的 `begin/query/commit/rollback` 事务 ID，或将完整 adapter 托管在主进程；两种方案都必须通过同一套事务与事件测试后再确定。
- Tauri 没有 Node 主进程。PGlite `BaseFilesystem` 的 `open/read/write/fstat` 等方法是同步契约，不能直接用异步 Tauri command 逐次代理，因此本故事不承诺 Tauri PGlite。

### 兼容性与安全

- 保持现有 `db.connect('sqlite')`、`db.connect('pglite')` 和浏览器存储默认行为不变；桌面文件存储必须通过新配置显式启用。
- 桌面配置使用可辨识联合，非法 runtime/engine 组合在类型层拒绝，并在 JavaScript 运行时再次校验。
- 不增加 memory、OPFS 或 IndexedDB fallback。文件连接失败必须暴露真实错误，避免用户误以为数据已写入目标文件。
- 新增公开 API 必须包含 TSDoc、更新 `requirements/api-baseline/`，并通过严格类型检查、ESLint 零警告与对应包覆盖率门禁。

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/` — 抽取可由桌面 host 实现的客户端与事务契约
- `packages/rxdb-adapter-pglite/src/` — 消除对具体 `PGliteClient` 实例的耦合，补齐可代理的事务与事件契约
- `packages/rxdb-adapter-desktop/` — Electron/Tauri 桌面配置、renderer client 与 host protocol
- `apps/dev-rxdb-electron/src-electron/` — SQLite/PGlite 主进程 host、路径解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — Electron renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包应用的真实文件/目录持久化测试
- `apps/dev-rxdb-tauri/src-tauri/` — `tauri-plugin-sql` SQLite feature、权限和必要的事务 command
- `apps/dev-rxdb-tauri/src/app/` — Tauri renderer 接入示例与连接状态
- `requirements/api-baseline/` — 新增公开桌面 adapter API 基线

## References

- [US-201 SQLite 适配器](US-201-sqlite-adapter.md)
- [US-202 PGlite 适配器](US-202-pglite-adapter.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
