---
id: US-207
title: Electron 连接本地 SQLite 文件
status: In Progress
priority: High
epic: epic-004-future-features
created: 2026-08-08
updated: 2026-08-13
tags: [adapter, desktop, electron, sqlite]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖远程同步或 UI 功能即可交付
- [x] Negotiable (可协商): 桌面 host 与 renderer 的传输实现可替换
- [x] Valuable (有价值): 数据落在可备份、可迁移的原生本地存储中
- [x] Estimable (可估算): 单一运行时（Electron）+ 单一引擎（SQLite）
- [x] Small (小): Electron PGlite 已拆至 US-208、Tauri 已拆至 US-210，本故事收敛为 Electron SQLite
- [x] Testable (可测试): 持久化、事务、失败路径与打包 smoke test 均有独立 AC
-->

# 用户故事：Electron 连接本地 SQLite 文件

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 桌面应用的开发者
**我想要** 将 RxDB 连接到应用本地的 SQLite 文件
**以便** 数据可以跨应用重启持久化，并能通过桌面系统的文件备份和迁移机制管理，而不是只存在于 WebView 的 OPFS 或 IndexedDB 中

## 拆分说明

### 2026-08-13（第一次）：拆出 US-208

本故事原先把 Electron PGlite data directory 与 SQLite 混编，导致 INVEST「Small」不成立：
PGlite 需要一套 SQLite 路径不需要的 IPC 事务 host。拆分后本故事收敛为**纯 SQLite**。

| 原 AC        | 归属                                                              |
| ------------ | ----------------------------------------------------------------- |
| 1 / 2 / 3    | 本故事（Electron SQLite、Tauri SQLite、Tauri 事务门禁）           |
| 4            | [US-208](./US-208-electron-pglite-data-directory.md) AC#1         |
| 5 ~ 10       | 本故事，重述为「受支持的 SQLite 组合」；US-208 有对应的 PGlite 版 |
| 11（SQLite） | 本故事                                                            |
| 11（PGlite） | [US-208](./US-208-electron-pglite-data-directory.md) AC#10        |

### 2026-08-13（第二次）：拆出 US-210

第一次拆分后 Electron 与 Tauri 仍并列在一条故事里，而两者的**风险量级不对等**：
Electron 侧只是工程量，Tauri 侧卡在一个尚未验证的外部前提——`@tauri-apps/plugin-sql`
的 JavaScript API 没有事务对象，无从确认 BEGIN / 业务语句 / COMMIT 是否落在同一物理连接
（原 AC#3）。该前提为否时 Tauri 侧要回到 plan 阶段重定方案，而 Electron 侧完全不受影响。
绑在一起等于让已可交付的一半陪着另一半停在 Backlog，因此按下表二次拆分。

| 上一版 AC | 归属                                                                |
| --------- | ------------------------------------------------------------------- |
| 1         | 本故事 AC#1（Electron SQLite 持久化）                               |
| 2 / 3     | [US-210](./US-210-tauri-sqlite-local-database.md) AC#1 / AC#2       |
| 4 ~ 9     | 本故事，重述为 Electron 单一运行时；US-210 有对应的 Tauri 版        |
| 10        | 按运行时对半：Electron 三平台留在本故事，Tauri 三平台归 US-210 AC#9 |

桌面 host 契约（renderer client / host protocol / 安全基线）在本故事抽出，US-208 与 US-210 复用。

## 范围边界

### In Scope

- 提供明确的桌面存储配置，使用可辨识联合区分存储引擎；配置的联合形状必须能在不破坏现有取值的前提下容纳 [US-208](./US-208-electron-pglite-data-directory.md) 的 PGlite data directory，且不得把 PGlite 描述成单文件数据库。
- 抽出可被桌面 host 实现的 renderer client / host protocol 契约与 Electron 安全基线，供 [US-208](./US-208-electron-pglite-data-directory.md) 与 [US-210](./US-210-tauri-sqlite-local-database.md) 复用。
- Electron 在主进程中打开 SQLite 文件，renderer 只通过类型化、参数校验后的 IPC 使用数据库能力；不得开启 `nodeIntegration` 或关闭 `contextIsolation`/`sandbox`。
- 必须保持现有 RxDB 的查询、事务、变更通知、系统 schema 迁移、writer lease 与加密能力，不允许用功能降级换取文件持久化。
- `disconnect()` 必须等待在途事务和持久化刷新完成，再释放数据库句柄；同一路径允许在当前进程内安全断开并重连。
- `dev-rxdb-electron` 提供最小接入示例，并用真实临时文件验证重启后的数据恢复。

### 能力矩阵

| 运行时   | SQLite 文件                                       | PGlite data directory                                      |
| -------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Electron | 本故事                                            | [US-208](./US-208-electron-pglite-data-directory.md)       |
| Tauri    | [US-210](./US-210-tauri-sqlite-local-database.md) | 不支持（无 Node 主进程，同步 filesystem 契约无法异步代理） |

### Out of Scope

- **Electron PGlite data directory**：整条迁至 [US-208](./US-208-electron-pglite-data-directory.md)，因为它需要一套 SQLite 路径不需要的 IPC 事务 host。
- **Tauri SQLite 文件**：整条迁至 [US-210](./US-210-tauri-sqlite-local-database.md)，因为 `tauri-plugin-sql` 能否保证单物理连接事务是本故事无法承担的未知量。
- Tauri 直接打开 PGlite data directory。`tauri-plugin-sql` 的 PostgreSQL feature 是数据库客户端，不是本地 PGlite 引擎；PGlite 自定义 filesystem 又要求同步文件 API，普通异步 Tauri command 无法直接实现。若未来引入 Node/Bun sidecar，必须另立 story 评估打包体积、进程生命周期和 IPC 事务语义。
- 将 PGlite data directory 打包或伪装成单个 `.pglite` 文件。
- 连接 MySQL、远程 PostgreSQL 或其他网络数据库。
- 让用户通过系统文件选择器打开应用数据目录之外的任意数据库；此能力需要独立的路径授权与安全模型。
- 数据库导入、导出、热备份、损坏修复和格式转换。
- 监听其他进程直接写入同一 SQLite 文件所产生的实时变更。
- 浏览器、PWA、移动端与 WebView 内 OPFS/IndexedDB 存储；这些行为继续由现有 adapter 负责。

## 验收标准

| #   | 前置条件                                                  | 操作                                                     | 预期结果                                                                                                                                              | 状态 |
| --- | --------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 应用配置 SQLite 文件存储                         | 首次连接、写入实体、断开并重启应用后再次连接             | 在同一文件中读回数据；连接期间现有 RxDB 标准 adapter suite 全部通过                                                                                   | ✅   |
| 2   | Electron SQLite 已连接                                    | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅 | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                                                          | ⚠️   |
| 3   | SQLite 文件路径不存在                                     | 首次连接                                                 | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                                    | ✅   |
| 4   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持 | 发起连接                                                 | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                                    | ✅   |
| 5   | 同一 SQLite 文件已有有效 writer lease 或迁移 owner        | 第二个窗口或进程尝试以 writer 身份连接                   | 沿用 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库 | ✅   |
| 6   | SQLite 文件存在应用未知的普通业务表                       | Aiao 首次连接并初始化系统 schema                         | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                                      | ✅   |
| 7   | 存在未提交事务或在途查询                                  | 调用 `disconnect()` 或关闭窗口                           | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                                              | ✅   |
| 8   | 构建打包后的 Electron 应用                                | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test  | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储                                                                                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 当前证据

`packages/rxdb-adapter-desktop/src/__tests__/setup.spec.ts` 把 `@aiao/rxdb-adapter-sqlite-core/testing`
的 21 个共享套件原样跑在桌面工厂上（只排除 `createSqliteClientSuite`，它校验的是 wasm 后端的
worker 选项组合，桌面客户端不接受任何 worker 选项）。AC#1 / #3 / #4 / #5 / #6 / #7 另有直接用例：

| AC  | 证据                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts` 「重启后计数递增，库文件落在应用数据目录内」                                                                                 |
| 3   | `desktop-sqlite-host.spec.ts` 「reports a logical location that leaks no filesystem path」；上面那条 e2e 顺带断言 preload 暴露面恰为 `request` / `subscribe`                              |
| 4   | `node-sqlite-engine.spec.ts` 「reports open_failed without leaving an empty database behind」/「database_corrupted」                                                                      |
| 5   | `writer-lease.spec.ts` 「registers one live lease per window」/「refuses to migrate the system schema while another window holds a live lease」                                           |
| 6   | `desktop-sqlite-host.spec.ts` 「preserves unknown business tables that already live in the file」                                                                                         |
| 7   | `node-sqlite-engine.spec.ts` 「flushes the pending batch synchronously on close」/「persists committed data across a reopen」/「releases the file handle so the database can be renamed」 |

AC#1 的断言形态是**跨进程**的累计启动次数（1 → 2），不是「写一条读一条」——
后者在单次启动内就能通过，哪怕数据只活在内存里也一样绿。整套 e2e 在真实 `--dir` 产物上
8/8 通过（另 7 条是启动 smoke）。

这条断言形态立刻兑现了自己的价值：它抓到一个**静默丢数据**的缺陷。库目录原名 `databases`，
而 `userData/databases` 是 Chromium 自己的 WebSQL 目录，其存储层在启动时会删掉目录里
没有登记过的文件 —— 我们的库文件正是「没登记过的」。表现为每次启动都拿到一个全新的空库：
应用照常显示「已连接」、照常写入，进程不报一个字，只是上一次的数据没了。
定位过程是同一个 `--user-data-dir` 连开两次，比对 inode 与目录内容：
第一次的行、手工放进去的 `MARKER.txt` 与一份 `.sqlite3` 拷贝全部消失，
同一层级另建的 `rxdb-data/MARKER.txt` 毫发无损 —— 由此确认是**目录名**撞车而非写入失败。

修复是把 `DESKTOP_DATABASE_DIRECTORY` 改成 `rxdb-data`，并在
[`desktop-sqlite-bridge.spec.ts`](../../../apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.spec.ts)
留下「库目录名不与 Chromium 在 userData 下自用的目录重名」这条名单断言：行为层面的验证要真跑一个
Electron 才看得到，单测里守不住，于是退一步守住名字本身，改回名单里的任何一个都当场红。
修复后连开三次实测计数为 1 / 2 / 3，库文件里 `public$desktop_launch` 确有 3 行。

一条保留项：

- **AC#2** 的「加密字段解锁」不在共享套件覆盖范围内：加密是 `@aiao/rxdb-adapter-encrypted` 的包裹层，
  与桌面 adapter 的组合尚无用例。其余五项（查询 / 变更 / 事务 / 分支切换 / 响应式订阅）全绿且无跳过。

打包这一步在本地网络受限时会以 ETIMEDOUT 失败（见 `packaged-app.ts` 的注释）。
electron-builder 只认 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 两个**环境变量**，
`.npmrc` 里的 `electron_mirror` 它不读 —— 那份配置只对 `electron` 包自己的安装脚本生效。

AC#5 的两个窗口跑在同一个 host 上，各自持有独立的 `DatabaseSync` 连接 —— 这与打包后的
Electron 完全同构（多个 renderer，同一个主进程 host，一库一连接）。实现这条 AC 时暴露出两个
真实缺陷，均已修复并各自留有用例：

| 缺陷                                                                                                                                                                        | 修复                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 第二个窗口撞上第一个窗口的写锁后直接 `database_busy`；改用 `PRAGMA busy_timeout` 等锁则更糟 —— `node:sqlite` 是同步接口，自旋会把持锁方的 `COMMIT` 续体一起冻在主进程线程上 | host 层 `BEGIN IMMEDIATE` + **异步**退避重试（`desktop-sqlite-host.spec.ts` 的 `describe('busy retry')` 三条用例）                 |
| 连接失败时 `HistoryManager` 的两条内部订阅没有 `error` 回调，RxJS 走 `reportUnhandledError`，在 Electron 里就是一次能打崩宿主的未捕获异常                                   | `packages/rxdb/src/version/HistoryManager.ts` 补 `error` 回调（`HistoryManager.spec.ts` 「不升级成 RxJS 未捕获异常，但必须留痕」） |

「第二个**进程**」这半边由 `packages/rxdb-adapter-sqlite-core/src/__tests__/system-schema-migration.multiprocess.spec.ts`
覆盖：它跑的是真正的跨 OS 进程裸连接，中间没有 host 与协议层。

> 本故事**不**关闭 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) AC6。
> AC#5 验的是第二个 writer 在**连接时**被拒，AC#1 的重启 e2e 两次启动之间没有发生迁移；
> 而 AC6 要的是「writer 挂着不动 → 别的 realm 完成迁移并抬 epoch → 该 writer 恢复后写入被 fence」。
> 这三者是不同场景，US-304 AC6 仍需一条自己的用例（挂起 → 迁移 → 恢复写入）。
>
> AC#8 需要三平台打包 CI 矩阵。本地只跑过 macOS（`mac-arm64`）。
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
- `packages/rxdb-adapter-desktop/` — 桌面配置、renderer client 与 host protocol（US-208 与 US-210 复用同一层）
- `apps/dev-rxdb-electron/src-electron/` — SQLite 主进程 host、路径解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — Electron renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包 Electron 应用的真实文件持久化测试；AC#8 的三平台矩阵在此扩展
- `requirements/api-baseline/` — 新增公开桌面 adapter API 基线

Tauri 侧的实现文件（`apps/dev-rxdb-tauri/`、`apps/dev-rxdb-tauri-e2e/`）随 AC#2 / AC#3
一并迁至 [US-210](./US-210-tauri-sqlite-local-database.md)，本故事不再涉及。

## References

- [US-208 Electron PGlite data directory](./US-208-electron-pglite-data-directory.md) — 从本故事拆出，复用本故事的桌面 host 契约
- [US-210 Tauri SQLite 本地数据库](./US-210-tauri-sqlite-local-database.md) — 从本故事拆出，复用本故事的桌面 host 契约
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md) — AC#5 的依赖
- [US-201 SQLite 适配器](US-201-sqlite-adapter.md)
- [US-202 PGlite 适配器](US-202-pglite-adapter.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
