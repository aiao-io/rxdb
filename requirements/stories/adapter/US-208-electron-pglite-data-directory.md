---
id: US-208
title: Electron PGlite 数据目录与事务宿主
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-08-16
tags: [adapter, desktop, electron, pglite, ipc, transaction]
inherited_acs:
  - from: US-207
    ac: 4
    note: Electron PGlite data directory 的持久化与类型保真验收整条迁入本故事。
  - from: US-207
    ac: 11
    note: 仅继承「Electron PGlite 三平台通过」半句；SQLite 三平台仍由 US-207 承诺。
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-207 抽出的桌面 host 契约，但 PGlite 事务 host 可独立设计与交付
- [x] Negotiable: IPC 事务协议与「adapter 托管在主进程」两种方案在 plan 阶段二选一
- [x] Valuable: PGlite 数据落在可备份、可迁移的原生目录中，而不是 WebView 存储
- [x] Estimable: 范围收敛到单一运行时（Electron）与单一引擎（PGlite）
- [x] Small: 不含 SQLite 路径、不含 Tauri、不含导入导出与备份修复
- [x] Testable: 事务语义、类型保真、断连重连与三平台打包 smoke test 均有独立 AC
-->

# 用户故事：Electron PGlite 数据目录与事务宿主

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 桌面应用的开发者
**我想要** 在主进程中用 PGlite 的 Node filesystem backend 打开 data directory，并从 renderer 正常使用事务
**以便** PGlite 数据跨应用重启持久化、可被桌面备份机制管理，且 renderer 不需要获得 Node 文件系统权限

## 来源与边界

本故事从 [US-207](./US-207-desktop-local-database.md) 拆出。拆分原因写在 US-207 的 INVEST「Small」一项：
**PGlite 的 callback transaction 不能跨 IPC 序列化**，需要一套 US-207 的 SQLite 路径不需要的事务 host
协议。把两者混编会让 US-207 无法在不做这件事的前提下验收。

US-207 已经承诺的内容不在本故事重做：桌面存储的可辨识联合配置、Electron 安全基线
（不开 `nodeIntegration`、不关 `contextIsolation`/`sandbox`、preload 只暴露窄接口）、
renderer 不直接接触 `fs` / `ipcRenderer` 的运行时边界。本故事复用这些约束，只补 PGlite 侧。

### In Scope

- Electron 主进程使用 PGlite Node filesystem backend 打开 data directory，renderer 通过类型化 IPC 使用
- 显式的 `begin / query / commit / rollback` 事务 ID 协议，或将完整 adapter 托管在主进程；**两种方案必须通过同一套事务与事件测试后再定**
- 关系、JSONB、bigint/binary 的跨进程类型保真
- 系统 schema 迁移、change codec 水位线、writer lease 在 IPC 之上保持有效
- `disconnect()` 等待在途事务与持久化刷新完成后释放目录句柄，同一目录可安全断开重连
- `dev-rxdb-electron` 的最小接入示例与真实临时目录的重启恢复验证

### Out of Scope

- Tauri PGlite。Tauri 没有 Node 主进程，PGlite `BaseFilesystem` 的 `open/read/write/fstat` 是同步契约，
  无法用异步 Tauri command 逐次代理。若未来引入 Node/Bun sidecar，必须另立 story 评估打包体积、
  进程生命周期和 IPC 事务语义
- Electron SQLite 文件路径（[US-207](./US-207-desktop-local-database.md)）
- Tauri SQLite 文件路径（[US-210](./US-210-tauri-sqlite-local-database.md)）
- 将 data directory 打包或伪装成单个 `.pglite` 文件
- 数据库导入、导出、热备份、损坏修复和格式转换
- 监听其他进程直接写入同一 data directory 所产生的实时变更

## 验收标准

| #   | 前置条件                                               | 操作                                                                                 | 预期结果                                                                                                                                       | 状态 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 应用配置 PGlite data directory                | 写入包含关系、JSONB 与 bigint/binary 的实体，调用 `disconnect()`，重启后重连同一目录 | 数据和类型逐值一致，系统 schema 与 change codec 水位线保持有效                                                                                 | ⬜   |
| 2   | PGlite host 已连接                                     | 在一次 RxDB callback transaction 中跨 IPC 执行多次读写，并分别测试 commit 与中途抛错 | 全部语句绑定同一事务 ID 与同一物理连接；commit 全部可见，rollback 后全部不可见。协议无法保证该语义时连接必须失败并报告能力缺失，不得伪造事务   | ⬜   |
| 3   | 事务进行中 renderer 崩溃或窗口关闭                     | 主进程检测到 IPC 通道断开                                                            | 该事务 ID 被回滚并释放，不留下悬挂事务或被长期持有的连接；后续重连可正常开启新事务                                                             | ⬜   |
| 4   | 任一受支持的 PGlite 桌面连接已建立                     | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅                             | 用户可见行为与浏览器内 PGlite adapter 一致，标准测试套件无跳过项                                                                               | ⬜   |
| 5   | data directory 不存在                                  | 首次连接                                                                             | 仅在已授权的应用作用域中创建目录；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                             | ⬜   |
| 6   | 目录无权限、目录内容不是有效 PGlite data directory     | 发起连接                                                                             | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                             | ⬜   |
| 7   | 同一 data directory 已有有效 writer lease 或迁移 owner | 第二个窗口或进程尝试以 writer 身份连接                                               | 沿用 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库 | ⬜   |
| 8   | 目录中存在应用未知的普通业务表                         | Aiao 首次连接并初始化系统 schema                                                     | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                               | ⬜   |
| 9   | 存在未提交事务或在途查询                               | 调用 `disconnect()` 或关闭窗口                                                       | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该目录                                                               | ⬜   |
| 10  | 构建打包后的 Electron 应用                             | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test                              | 三平台均通过；测试使用真实临时目录而非 mock 或浏览器存储                                                                                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 事务 host 方案二选一

AC#2 是本故事最大的未知量，应最先验证。两种候选：

| 方案                     | 做法                                                            | 主要风险                                                     |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| IPC 事务 ID 协议         | 主进程持有连接，renderer 侧 adapter 用事务 ID 串联多次 IPC 调用 | 每条语句一次 IPC 往返；崩溃时的悬挂事务回收（AC#3）          |
| adapter 完整托管在主进程 | renderer 只发高层 repository 请求，adapter 与连接都在主进程     | 响应式订阅、变更通知与加密解锁需要跨进程重建，接口面显著变大 |

两种方案都必须先通过同一套事务与事件测试，再在 plan 阶段冻结选择。不得把多条独立请求包装成假事务。

### 类型保真

bigint、binary 与 JSONB 跨 `structuredClone` / IPC 序列化的行为必须逐值验证。
`Uint8Array` 与 `bigint` 在 Electron IPC（structured clone）中可直接传输，但
`postMessage` 与 `ipcRenderer.invoke` 的序列化路径不完全一致，需要按实际使用的通道锁定。

### 依赖

- AC#7 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 收敛；
  反过来，桌面多窗口与应用重启场景可作为 US-304 AC6「长时间挂起后恢复」缺失证据的来源。
- 桌面 host 契约（`SqliteClientLike` 的同类物、PGlite 客户端契约）由 US-207 先抽出，本故事复用后补齐可代理的事务与事件契约。

## 实现文件

- `packages/rxdb-adapter-pglite/src/` — 消除对具体 `PGliteClient` 实例的耦合，补齐可代理的事务与事件契约
- `packages/rxdb-adapter-desktop/` — Electron PGlite renderer client 与 host protocol
- `apps/dev-rxdb-electron/src-electron/` — PGlite 主进程 host、目录解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包应用的真实目录持久化测试
- `requirements/api-baseline/` — 新增公开桌面 PGlite API 基线

## References

- [US-207 Electron 连接本地 SQLite 文件](./US-207-desktop-local-database.md) — 本故事的来源与共享的桌面 host 契约
- [US-210 Tauri 连接应用作用域 SQLite 文件](./US-210-tauri-sqlite-local-database.md) — 桌面本地 SQLite 的 Tauri 半边，不在本故事范围
- [US-202 PGlite 适配器](./US-202-pglite-adapter.md)
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
