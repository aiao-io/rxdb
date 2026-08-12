---
id: US-207
title: Electron/Tauri 连接本地数据库
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-08-08
updated: 2026-08-13
tags: [adapter, desktop, electron, tauri, sqlite]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖远程同步或 UI 功能即可交付
- [x] Negotiable (可协商): 桌面 host 与 renderer 的传输实现可替换
- [x] Valuable (有价值): 数据落在可备份、可迁移的原生本地存储中
- [x] Estimable (可估算): 仅覆盖能力矩阵中明确支持的两个 SQLite 组合
- [x] Small (小): Electron PGlite 已拆至 US-208，本故事收敛为纯 SQLite 路径
- [x] Testable (可测试): 每个运行时/引擎组合都有持久化、事务和失败路径 AC
-->

# 用户故事：Electron/Tauri 连接本地 SQLite 文件

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 或 Tauri 桌面应用的开发者
**我想要** 将 RxDB 连接到应用本地的 SQLite 文件
**以便** 数据可以跨应用重启持久化，并能通过桌面系统的文件备份和迁移机制管理，而不是只存在于 WebView 的 OPFS 或 IndexedDB 中

## 拆分说明（2026-08-13）

本故事原先把 Electron PGlite data directory 与 SQLite 混编，导致 INVEST「Small」不成立：
PGlite 需要一套 SQLite 路径不需要的 IPC 事务 host。现已按下表完成拆分，本故事收敛为**纯 SQLite**。

| 原 AC       | 归属                                                              |
| ----------- | ----------------------------------------------------------------- |
| 1 / 2 / 3   | 本故事（Electron SQLite、Tauri SQLite、Tauri 事务门禁）           |
| 4           | [US-208](./US-208-electron-pglite-data-directory.md) AC#1         |
| 5 ~ 10      | 本故事，重述为「受支持的 SQLite 组合」；US-208 有对应的 PGlite 版 |
| 11（SQLite） | 本故事                                                            |
| 11（PGlite） | [US-208](./US-208-electron-pglite-data-directory.md) AC#10        |

桌面 host 契约（renderer client / host protocol / 安全基线）在本故事先抽出，US-208 复用后补 PGlite 事务与事件契约。

## 范围边界

### In Scope

- 提供明确的桌面存储配置，使用可辨识联合区分存储引擎；配置的联合形状必须能在不破坏现有取值的前提下容纳 [US-208](./US-208-electron-pglite-data-directory.md) 的 PGlite data directory，且不得把 PGlite 描述成单文件数据库。
- 抽出可被桌面 host 实现的 renderer client / host protocol 契约与 Electron 安全基线，供 US-208 复用。
- Tauri 使用 `tauri-plugin-sql` 的 SQLite feature 连接应用作用域内的 SQLite 文件，并仅开放 `sql:default` 与写入所需的 `sql:allow-execute` 权限。
- Electron 在主进程中打开 SQLite 文件，renderer 只通过类型化、参数校验后的 IPC 使用数据库能力；不得开启 `nodeIntegration` 或关闭 `contextIsolation`/`sandbox`。
- 两个受支持的 SQLite 组合必须保持现有 RxDB 的查询、事务、变更通知、系统 schema 迁移、writer lease 与加密能力，不允许用功能降级换取文件持久化。
- `disconnect()` 必须等待在途事务和持久化刷新完成，再释放数据库句柄；同一路径允许在当前进程内安全断开并重连。
- `dev-rxdb-electron` 与 `dev-rxdb-tauri` 提供最小接入示例，并用真实临时文件验证重启后的数据恢复。

### 能力矩阵

| 运行时   | SQLite 文件 | PGlite data directory                                        |
| -------- | ----------- | ------------------------------------------------------------ |
| Electron | 本故事      | [US-208](./US-208-electron-pglite-data-directory.md)          |
| Tauri    | 本故事      | 不支持（无 Node 主进程，同步 filesystem 契约无法异步代理）   |

### Out of Scope

- **Electron PGlite data directory**：整条迁至 [US-208](./US-208-electron-pglite-data-directory.md)，因为它需要一套 SQLite 路径不需要的 IPC 事务 host。
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
| 4   | 任一受支持的 SQLite 组合已连接                                                              | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅                             | 用户可见行为与对应现有 SQLite adapter 一致，标准测试套件无跳过项                                                                                           | ⬜   |
| 5   | SQLite 文件路径不存在                                                                       | 首次连接                                                                             | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                                         | ⬜   |
| 6   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持                                   | 发起连接                                                                             | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                                         | ⬜   |
| 7   | 同一 SQLite 文件已有有效 writer lease 或迁移 owner                                          | 第二个窗口或进程尝试以 writer 身份连接                                               | 沿用 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库      | ⬜   |
| 8   | SQLite 文件存在应用未知的普通业务表                                                         | Aiao 首次连接并初始化系统 schema                                                     | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                                           | ⬜   |
| 9   | 存在未提交事务或在途查询                                                                    | 调用 `disconnect()` 或关闭窗口                                                       | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                                                   | ⬜   |
| 10  | 构建打包后的 Electron/Tauri 应用                                                            | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test                              | Electron SQLite 与 Tauri SQLite 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储                                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#3（Tauri 事务门禁）是本故事最大的未知量，应最先验证；结论为「插件无法保证单连接事务」时，
> 本故事的 Tauri 部分需要回到 plan 阶段重新定方案，而不是降级为假事务。
>
> AC#7 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 AC2/AC6 收敛。
> 反过来，桌面多窗口与应用重启场景可作为 US-304 AC6「长时间挂起后恢复」缺失证据的来源，两者建议协同排期。
>
> AC#10 需要 `apps/dev-rxdb-tauri-e2e`（当前不存在，见「实现文件」）与三平台打包 CI 矩阵。
> 打包 smoke test 成本高，应只在 release 分支或 tag 触发，不进 PR 门禁。

## 技术笔记

### 运行时边界

- renderer 中的 RxDB adapter 不得直接接触 `fs`、Electron `ipcRenderer` 或任意 Tauri `invoke`；桌面 host 通过窄接口实现 `SqliteClientLike` 契约。该契约的抽象方式需要同时能承载 US-208 的 PGlite 客户端，避免 US-208 推翻本故事的 host protocol。
- Electron 主进程只接受来自当前主 frame 的请求，校验数据库标识、SQL 参数、事务 ID 和请求大小；preload 只暴露本故事需要的方法，不暴露原始 `ipcRenderer`。
- Tauri SQL 指南将 SQLite 路径描述为相对 `AppConfig`，JavaScript API reference 描述为相对 `BaseDirectory::App`。实现前必须用集成测试锁定当前插件版本的真实解析结果，对外只承诺“应用作用域内的逻辑数据库名”，不泄漏或猜测物理根目录。

### Tauri SQLite 事务门禁

- `@tauri-apps/plugin-sql` 当前 JavaScript API 只公开 `load/get/select/execute/close`，没有事务对象。
- RxDB 的 callback transaction 需要 BEGIN、业务查询与 COMMIT/ROLLBACK 落在同一物理连接。不能因为 SQL 文本能执行 `BEGIN` 就假设连接池会固定连接。
- 优先验证插件能否配置单连接池并串行化整个事务；若不能，使用最小 Rust command 持有 `sqlx::SqliteConnection` 和事务 ID。不得把多条独立 `execute()` 包装成假事务。

### 为什么不承诺 Tauri PGlite

- PGlite 的 Node filesystem backend 接受的是 PostgreSQL data directory 路径；一个数据库目录包含多个文件，配置的联合形状不能把它描述成单文件。
- Tauri 没有 Node 主进程。PGlite `BaseFilesystem` 的 `open/read/write/fstat` 等方法是同步契约，不能直接用异步 Tauri command 逐次代理。
- Electron PGlite 的可行性、IPC 事务 host 与类型保真见 [US-208](./US-208-electron-pglite-data-directory.md)，本故事不做承诺。

### 兼容性与安全

- 保持现有 `db.connect('sqlite')`、`db.connect('pglite')` 和浏览器存储默认行为不变；桌面文件存储必须通过新配置显式启用。
- 桌面配置使用可辨识联合，非法 runtime/engine 组合在类型层拒绝，并在 JavaScript 运行时再次校验。
- 不增加 memory、OPFS 或 IndexedDB fallback。文件连接失败必须暴露真实错误，避免用户误以为数据已写入目标文件。
- 新增公开 API 必须包含 TSDoc、更新 `requirements/api-baseline/`，并通过严格类型检查、ESLint 零警告与对应包覆盖率门禁。

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/` — 抽取可由桌面 host 实现的客户端与事务契约
- `packages/rxdb-adapter-desktop/` — Electron/Tauri 桌面配置、renderer client 与 host protocol（US-208 复用同一层）
- `apps/dev-rxdb-electron/src-electron/` — SQLite 主进程 host、路径解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — Electron renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包 Electron 应用的真实文件持久化测试
- `apps/dev-rxdb-tauri/src-tauri/` — `tauri-plugin-sql` SQLite feature、权限和必要的事务 command
- `apps/dev-rxdb-tauri/src/app/` — Tauri renderer 接入示例与连接状态
- `apps/dev-rxdb-tauri-e2e/` — **当前不存在**，AC#10 的 Tauri 半边需要新建；三平台打包矩阵的 CI 成本应在 plan 阶段单独评估
- `requirements/api-baseline/` — 新增公开桌面 adapter API 基线

## References

- [US-208 Electron PGlite data directory](./US-208-electron-pglite-data-directory.md) — 从本故事拆出，复用本故事的桌面 host 契约
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md) — AC#7 的依赖
- [US-201 SQLite 适配器](US-201-sqlite-adapter.md)
- [US-202 PGlite 适配器](US-202-pglite-adapter.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
