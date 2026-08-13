---
id: US-210
title: Tauri 连接应用作用域 SQLite 文件
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-08-13
tags: [adapter, desktop, tauri, sqlite, transaction]
inherited_acs:
  - from: US-207
    ac: 2
    note: Tauri SQLite 的持久化与权限最小化验收整条迁入本故事。
  - from: US-207
    ac: 3
    note: Tauri 事务门禁（单物理连接语义）整条迁入本故事。
  - from: US-207
    ac: 10
    note: 仅继承「Tauri 三平台打包 smoke test」半句；Electron 半边仍由 US-207 承诺。
---

<!--
INVEST 检查清单:
- [x] Independent: 复用 US-207 抽出的桌面存储配置与 host 契约，Tauri 侧可独立设计与交付
- [x] Negotiable: 「配置单连接池」与「Rust command 持有 sqlx 连接」两种事务方案在 plan 阶段二选一
- [x] Valuable: Tauri 应用的数据落在可备份、可迁移的应用作用域 SQLite 文件中
- [x] Estimable: 范围收敛到单一运行时（Tauri）与单一引擎（SQLite）
- [x] Small: 不含 Electron 路径、不含 PGlite、不含导入导出与备份修复
- [x] Testable: 事务语义、权限最小化、断连重连与三平台打包 smoke test 均有独立 AC
-->

# 用户故事：Tauri 连接应用作用域 SQLite 文件

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** 通过 `tauri-plugin-sql` 把 RxDB 连接到应用作用域内的 SQLite 文件
**以便** 数据跨应用重启持久化、可被桌面备份机制管理，且不必为此授予 shell 或全文件系统权限

## 来源与边界

本故事从 [US-207](./US-207-desktop-local-database.md) 拆出，手法与当初拆出 [US-208](./US-208-electron-pglite-data-directory.md) 相同。

拆分原因：US-207 的 Tauri 半边卡在一个**尚未验证的外部前提**——`@tauri-apps/plugin-sql`
的 JavaScript API 只公开 `load/get/select/execute/close`，没有事务对象，因而无从确认
BEGIN / 业务语句 / COMMIT 是否落在同一物理连接。这个未知量一旦为否，Tauri 侧要回到 plan 阶段
重新定方案（见「事务门禁」），而 Electron 侧的实现与验收完全不受它影响。两者绑在一条故事里，
等于让已经能交付的一半陪着另一半一起停在 Backlog。

US-207 已经承诺的内容不在本故事重做：桌面存储的可辨识联合配置、renderer 不直接接触
`fs` / `ipcRenderer` / 任意 `invoke` 的运行时边界、`SqliteClientLike` 契约本身。
本故事复用这些约束，只补 Tauri 侧的传输实现、权限面与事务语义。

### In Scope

- Tauri 使用 `tauri-plugin-sql` 的 SQLite feature 连接应用作用域内的 SQLite 文件
- 权限面收敛到 `sql:default` 与写入所需的 `sql:allow-execute`，不授予 shell 或全文件系统权限
- 事务语义门禁：BEGIN、业务语句与 COMMIT/ROLLBACK 必须固定在同一物理连接
- 用集成测试锁定当前插件版本对 `sqlite:<name>.sqlite3` 的真实解析结果，对外只承诺「应用作用域内的逻辑数据库名」
- 复用 US-207 的桌面存储配置与 renderer client 契约，实现 Tauri 传输层
- `dev-rxdb-tauri` 的最小接入示例与真实临时文件的重启恢复验证
- 新建 `apps/dev-rxdb-tauri-e2e` 与三平台打包 smoke test

### Out of Scope

- Electron SQLite 文件路径（[US-207](./US-207-desktop-local-database.md)）
- Electron PGlite data directory（[US-208](./US-208-electron-pglite-data-directory.md)）
- Tauri 直接打开 PGlite data directory。`tauri-plugin-sql` 的 PostgreSQL feature 是数据库客户端，
  不是本地 PGlite 引擎；PGlite 自定义 filesystem 又要求同步文件 API，普通异步 Tauri command
  无法直接实现。若未来引入 Node/Bun sidecar，必须另立 story 评估打包体积、进程生命周期和 IPC 事务语义
- 连接 MySQL、远程 PostgreSQL 或其他网络数据库
- 让用户通过系统文件选择器打开应用数据目录之外的任意数据库；此能力需要独立的路径授权与安全模型
- 数据库导入、导出、热备份、损坏修复和格式转换
- 监听其他进程直接写入同一 SQLite 文件所产生的实时变更

## 验收标准

| #   | 前置条件                                                                                    | 操作                                                                  | 预期结果                                                                                                                                                   | 状态 |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Tauri 应用已启用 `tauri-plugin-sql` 的 SQLite feature、`sql:default` 与 `sql:allow-execute` | 通过应用作用域内的 `sqlite:<name>.sqlite3` 连接、写入、断开并重启应用 | 在同一 SQLite 文件中读回数据；未授予额外 shell 或全文件系统权限                                                                                            | ⬜   |
| 2   | Tauri SQLite 已连接                                                                         | 在一次 RxDB 事务中执行至少两次写入，并分别测试 commit 与中途抛错      | 所有语句固定在同一物理连接；commit 全部可见，rollback 后全部不可见。若 `tauri-plugin-sql` 的连接池不能保证该语义，连接必须失败并报告能力缺失，不得伪造事务 | ⬜   |
| 3   | Tauri SQLite 已连接                                                                         | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅              | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                                                               | ⬜   |
| 4   | SQLite 文件路径不存在                                                                       | 首次连接                                                              | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                                         | ⬜   |
| 5   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持                                   | 发起连接                                                              | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                                         | ⬜   |
| 6   | 同一 SQLite 文件已有有效 writer lease 或迁移 owner                                          | 第二个窗口或进程尝试以 writer 身份连接                                | 沿用 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库      | ⬜   |
| 7   | SQLite 文件存在应用未知的普通业务表                                                         | Aiao 首次连接并初始化系统 schema                                      | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                                           | ⬜   |
| 8   | 存在未提交事务或在途查询                                                                    | 调用 `disconnect()` 或关闭窗口                                        | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                                                   | ⬜   |
| 9   | 构建打包后的 Tauri 应用                                                                     | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test               | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储                                                                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#2（事务门禁）是本故事最大的未知量，也是本故事从 US-207 拆出的直接原因，应最先验证；
> 结论为「插件无法保证单连接事务」时，本故事需要回到 plan 阶段重新定方案，而不是降级为假事务。
>
> AC#6 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 AC2/AC6 收敛。
>
> AC#9 需要 `apps/dev-rxdb-tauri-e2e`（当前不存在，见「实现文件」）与三平台打包 CI 矩阵。
> 打包 smoke test 成本高，应只在 release 分支或 tag 触发，不进 PR 门禁。

## 技术笔记

### 事务门禁

- `@tauri-apps/plugin-sql` 当前 JavaScript API 只公开 `load/get/select/execute/close`，没有事务对象。
- RxDB 的 callback transaction 需要 BEGIN、业务查询与 COMMIT/ROLLBACK 落在同一物理连接。
  不能因为 SQL 文本能执行 `BEGIN` 就假设连接池会固定连接。

| 方案                       | 做法                                                              | 主要风险                                                       |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 配置单连接池               | 把插件的 `sqlx` 池上限设为 1 并串行化整个事务                     | 依赖插件是否暴露该配置；单连接会让并发读也排队                 |
| Rust command 持有事务      | 最小 Rust command 持有 `sqlx::SqliteConnection` 与事务 ID         | 需要自写 command 与权限项；事务 ID 的悬挂回收要额外设计        |

两种方案都必须先通过同一套事务与事件测试，再在 plan 阶段冻结选择。不得把多条独立 `execute()` 包装成假事务。

### 路径解析

Tauri SQL 指南将 SQLite 路径描述为相对 `AppConfig`，JavaScript API reference 描述为相对
`BaseDirectory::App`。**两处文档不一致**，实现前必须用集成测试锁定当前插件版本的真实解析结果；
对外只承诺「应用作用域内的逻辑数据库名」，不泄漏也不猜测物理根目录。

### 依赖

- AC#6 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 收敛。
- 桌面存储配置的可辨识联合与 renderer client 契约由 [US-207](./US-207-desktop-local-database.md) 先抽出，
  本故事复用；若 Tauri 侧发现契约不足以承载，改动应回到 US-207 的那一层，而不是在本故事里另起一套。

## 实现文件

- `packages/rxdb-adapter-desktop/` — Tauri 传输实现（复用 US-207 的 renderer client 与存储配置）
- `apps/dev-rxdb-tauri/src-tauri/` — `tauri-plugin-sql` SQLite feature、权限和必要的事务 command
- `apps/dev-rxdb-tauri/src/app/` — Tauri renderer 接入示例与连接状态
- `apps/dev-rxdb-tauri-e2e/` — **当前不存在**，AC#9 需要新建；三平台打包矩阵的 CI 成本应在 plan 阶段单独评估
- `requirements/api-baseline/` — 若新增公开 API 则同步基线

## References

- [US-207 Electron 连接本地 SQLite 文件](./US-207-desktop-local-database.md) — 本故事的来源与共享的桌面存储配置 / host 契约
- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 同样从 US-207 拆出
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md)
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/)
