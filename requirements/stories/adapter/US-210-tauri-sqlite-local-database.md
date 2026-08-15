---
id: US-210
title: Tauri 连接应用作用域 SQLite 文件
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-08-15
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
- [x] Negotiable: 「配置单连接池」与「Rust command 持有连接」两种事务方案在 plan 阶段二选一（已选后者，见「事务门禁」）
- [x] Valuable: Tauri 应用的数据落在可备份、可迁移的应用作用域 SQLite 文件中
- [x] Estimable: 范围收敛到单一运行时（Tauri）与单一引擎（SQLite）
- [x] Small: 不含 Electron 路径、不含 PGlite、不含导入导出与备份修复
- [x] Testable: 事务语义、权限最小化、断连重连与三平台打包 smoke test 均有独立 AC
-->

# 用户故事：Tauri 连接应用作用域 SQLite 文件

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** 把 RxDB 连接到应用作用域内的 SQLite 文件
**以便** 数据跨应用重启持久化、可被桌面备份机制管理，且不必为此授予 shell 或全文件系统权限

> 原文写的是「通过 `tauri-plugin-sql`」。该插件已在 plan 阶段被门禁否决（见「事务门禁」），
> 但故事的价值从不取决于用哪个插件，所以这里只删手段、不改价值。

## 来源与边界

本故事从 [US-207](./US-207-desktop-local-database.md) 拆出，手法与当初拆出 [US-208](./US-208-electron-pglite-data-directory.md) 相同。

拆分原因：US-207 的 Tauri 半边卡在一个**尚未验证的外部前提**——`@tauri-apps/plugin-sql`
的 JavaScript API 只公开 `load/get/select/execute/close`，没有事务对象，因而无从确认
BEGIN / 业务语句 / COMMIT 是否落在同一物理连接。这个未知量一旦为否，Tauri 侧要回到 plan 阶段
重新定方案（见「事务门禁」），而 Electron 侧的实现与验收完全不受它影响。两者绑在一条故事里，
等于让已经能交付的一半陪着另一半一起停在 Backlog。

**拆分的判断被验证是对的**：那个未知量最终确实为否，Tauri 侧也确实回到了 plan 阶段换方案。
若当初没拆，US-207 的 Electron 半边会一直陪着它停在 Backlog。

US-207 已经承诺的内容不在本故事重做：桌面存储的可辨识联合配置、renderer 不直接接触
`fs` / `ipcRenderer` / 任意 `invoke` 的运行时边界、`SqliteClientLike` 契约本身。
本故事复用这些约束，只补 Tauri 侧的传输实现、权限面与事务语义。

### In Scope

- Tauri 连接应用作用域内的 SQLite 文件
- 权限面：不授予 shell 或全文件系统权限，也不引入 `sql` / `fs` 插件权限
- 事务语义门禁：BEGIN、业务语句与 COMMIT/ROLLBACK 必须固定在同一物理连接
- 用集成测试锁定 `<name>.sqlite3` 的真实解析结果，对外只承诺「应用作用域内的逻辑数据库名」
- 复用 US-207 的桌面存储配置与 renderer client 契约，实现 Tauri 传输层
- `dev-rxdb-tauri` 的最小接入示例与真实临时文件的重启恢复验证
- 创建或复用 `apps/dev-rxdb-tauri-e2e`，并增加本故事拥有的 SQLite / 事务 / 三平台打包 smoke specs；
  与 US-905 阶段 1 并行时由先开工者用 generator 创建一次，不复制第二个 E2E project

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

| #   | 前置条件                                                  | 操作                                                             | 预期结果                                                                                                                                              | 状态 |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Tauri 应用已注册 `rxdb_desktop_request` 命令              | 通过应用作用域内的 `<name>.sqlite3` 连接、写入、断开并重启应用   | 在同一 SQLite 文件中读回数据；未授予额外 shell 或全文件系统权限                                                                                       | ⚠️   |
| 2   | Tauri SQLite 已连接                                       | 在一次 RxDB 事务中执行至少两次写入，并分别测试 commit 与中途抛错 | 所有语句固定在同一物理连接；commit 全部可见，rollback 后全部不可见。若连接池不能保证该语义，连接必须失败并报告能力缺失，不得伪造事务                  | ✅   |
| 3   | Tauri SQLite 已连接                                       | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅         | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                                                          | ✅   |
| 4   | SQLite 文件路径不存在                                     | 首次连接                                                         | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                                    | ✅   |
| 5   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持 | 发起连接                                                         | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                                    | ✅   |
| 6   | 同一 SQLite 文件已有有效 writer lease 或迁移 owner        | 第二个窗口或进程尝试以 writer 身份连接                           | 沿用 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 契约拒绝冲突写入，不绕过保护或静默切换到另一份数据库 | ✅   |
| 7   | SQLite 文件存在应用未知的普通业务表                       | Aiao 首次连接并初始化系统 schema                                 | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                                      | ✅   |
| 8   | 存在未提交事务或在途查询                                  | 调用 `disconnect()` 或关闭窗口                                   | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                                              | ✅   |
| 9   | 构建打包后的 Tauri 应用                                   | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test          | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储                                                                                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC#2（事务门禁）已判定：`tauri-plugin-sql` 不可用，改为自写 Rust command。** 详见「事务门禁」。
> 门禁的结论不是「降级为假事务」，而是换掉了实现手段——`rusqlite::Connection` 一 session 一条，
> 单连接语义由构造保证，无需依赖任何池配置。
>
> AC#6 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 AC2/AC6 收敛。
> 本故事只验「第二个 writer 在**连接时**被 lease 挡住」，不关闭 US-304 AC6（挂起 → 迁移 → 恢复写入），
> 与 [US-207](./US-207-desktop-local-database.md) 的边界一致。
>
> AC#9 需要 `apps/dev-rxdb-tauri-e2e` 与三平台打包 CI 矩阵。该 project 由 US-210 / US-905 阶段 1
> 中先开工者创建一次，但 AC#9 的 SQLite、事务与打包 specs 仍由本故事负责。
> 打包 smoke test 成本高，应只在 release 分支或 tag 触发，不进 PR 门禁。
> 本次未做，与 US-207 的同类 AC 保持同一状态；附带原因：macOS 没有官方 WKWebView WebDriver，
> `tauri-driver` 只支持 Windows / Linux，三平台矩阵需要单独评估驱动方案。

### 当前证据

`apps/dev-rxdb-tauri/conformance/setup.spec.ts` 把 `@aiao/rxdb-adapter-sqlite-core/testing` 的
21 个共享套件 + `@aiao/rxdb-test/encrypted` 的 5 套加密套件**原样**跑在 Rust 宿主上
（只排除 `createSqliteClientSuite`，它校验的是 wasm 后端的 worker 选项组合，桌面客户端不接受
任何 worker 选项）。`pnpm nx run dev-rxdb-tauri:test-conformance` 为 **585 passed / 7 files / 0 skipped**。

这批套件与 Electron 路径跑的是同一份断言、同一批工厂形状，只把 in-process 的 `node:sqlite`
换成 stdio 子进程里的 `rusqlite`。「Tauri 路径的行为与其它后端一致」这句话因此有机械保证，
而不是靠人肉比对两份实现。

**跑这个 target 时不要抢 CPU**：空闲机器上连跑 5 次都是 585/585；但把 CPU 打满
（`yes` × 核数），或者把它和 `cargo-check` / `cargo-clippy` / `cargo-test` 一起塞进
`nx run-many` 并行跑，就会随机挂 1–4 条。挂掉的用例每次都不一样，却全落在同一族：
**改完立刻读，读到的还是改之前的值**（典型是级联删除后 `MenuLarge.get(deletedId)` 本该
reject，却把缓存里的旧实体交了出来）。

两侧宿主的通知机制是**同一套**（TEMP 触发器 + `rxdb_desktop_notify` 标量函数，防抖窗口
同为 16ms），差的只是 Rust 宿主隔着一层进程边界和管道。套件默认假设变更事件在下一次读
之前就已送达：in-process 的 Node 宿主稳稳成立（同样打满 CPU，3 次全绿），隔着管道的
Rust 宿主被调度饿住时就不成立了。

「那把事件发早点」是个死路，已经验过：把 `batchTimeout` 调成 0（每条语句立刻派发），
空闲机器上稳定挂 10–12 条，而且换成了另一族用例——套件同时**依赖**这 16ms 窗口把连续
几次写合并成一批。窗口既不能取消也不能放大，只能不去和别人抢 CPU。

所以这是**测试宿主**的时序特征，不是 Tauri 路径本身的缺陷：生产环境的 Tauri IPC 在同一个
进程内，比 stdio 子进程快一个量级。但「没复现出问题」不等于「证明了不会有问题」——真正的
证明要等 AC#9 的打包 e2e 用真 IPC 跑一遍。

| AC  | 证据                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | `transactionSqliteResultSuite`；`session.rs` 的 `keeps_transactions_isolated_between_sessions`（一方未提交的写入对另一方不可见，提交后立刻可见）与 `rolls_a_transaction_back`                                                                                                    |
| 3   | 上述 21 + 5 套套件全绿、零跳过（满载时的时序敏感性见上文）                                                                                                                                                                                                                       |
| 4   | `paths.rs` 的 `creates_the_scoped_directory_and_joins_the_logical_name`；`session.rs` 的 `open_reports_a_logical_location_not_a_filesystem_path`——物理根目录不出协议                                                                                                             |
| 5   | `engine.rs` 的 `reports_database_corrupted_without_touching_the_original_bytes` / `reports_open_failed_without_leaving_an_empty_database_behind`；`paths.rs` 的 `does_not_create_anything_for_an_invalid_name`；`protocol.rs` 的 `rejects_engines_outside_the_capability_matrix` |
| 6   | `conformance/writer-lease.spec.ts`「registers one live lease per window」/「refuses to migrate the system schema while another window holds a live lease」                                                                                                                       |
| 7   | `systemSchemaMigrationSuite`（共享套件，含未知表保留）                                                                                                                                                                                                                           |
| 8   | `engine.rs` 的 `releases_the_file_handle_so_it_can_be_renamed`：close 后 `-wal` 已 TRUNCATE checkpoint、句柄已交还，文件可直接 `rename`，且未提交的写入已回滚                                                                                                                    |

AC#5 的两条失败路径是补这份文档时才发现没有直接用例的——错误码映射表
（`sqlite_error_code`）一直在，但没有任何一条用例真的拿一个坏文件去撞它。补的时候把断言
写成了「**原字节一个不动**」而不只是「错误码等于 `database_corrupted`」：
`SQLITE_OPEN_CREATE` 让「打不开就当空库新建」离默认行为只有一步之遥，而那等于静默销毁
用户的文件——应用照常显示已连接，只是里面什么都没有了。只断言错误码的话，这个退化不会被抓到。

**AC#1 标 ⚠️ 而不是 ✅**：自动化只到「同一个宿主进程内断开重连读回同一份数据」，
而这条 AC 要的是**关掉应用再打开**。US-207 的对应 AC 由
`apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts` 的跨进程启动计数（1 → 2）兑现，
Tauri 侧没有等价 e2e —— 它正是被推迟的 AC#9 的一部分。

这个区别不是形式主义：US-207 就是靠「跨进程累计计数」这条断言，抓到了库目录名与 Chromium
WebSQL 目录撞车导致的**静默丢数据**（每次启动拿到一个全新空库，应用照常显示「已连接」）。
「写一条读一条」在单次启动内恒绿，哪怕数据只活在内存里。Tauri 的 `app_data_dir()` 与
`rxdb-data/` 子目录没有已知的同类冲突，但**没有已知冲突不等于验过**。

`writer-lease.spec.ts` 单开一个文件而不并进共享套件：套件里每个用例只有一个 adapter，
验不到「第二个 writer」这半边，而 `rust-adapter-factory.ts` 刻意给每次构造发唯一库名
（套件之间不能互相看见对方的表），两个窗口也就撞不到一起。

## 技术笔记

### 事务门禁（已判定：不用 `tauri-plugin-sql`）

原问题：`@tauri-apps/plugin-sql` 的 JavaScript API 只公开 `load/get/select/execute/close`，
没有事务对象，因而无从确认 BEGIN / 业务语句 / COMMIT 是否落在同一物理连接。
不能因为 SQL 文本能执行 `BEGIN` 就假设连接池会固定连接。

**结论是「否」，且否得比预想的更彻底。** 两条独立证据：

1. **事务**：插件 Rust 侧对 `Pool<Db>` 执行 `query.execute(&*db)`，连续调用可能落在不同物理连接上。
   `BEGIN` / 业务语句 / `COMMIT` 无法固定在同一条连接，JS 侧也没有任何 API 能表达「这几条要在一起」。
2. **变更事件**：插件**完全没有变更事件 API**。AC#3 要求的响应式订阅无从实现。

第 2 点与事务无关、且不是配置能救的——就算把池上限设成 1 解决了第 1 点，AC#3 依然没有着落。
所以「配置单连接池」这一行不是风险高，是**做不到**；下表保留原始判断以备回溯：

| 方案                  | 做法                                          | 判定                                                                       |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| 配置单连接池          | 把插件的 `sqlx` 池上限设为 1 并串行化整个事务 | ❌ 即便成立也解决不了「没有变更事件 API」                                  |
| Rust command 持有连接 | 自写 command 持有 `rusqlite::Connection`      | ✅ 采用。一个 session 一条连接，单连接语义由**构造**保证，不依赖任何池配置 |

采用方案的额外收益是拿回了事件通路：引擎用 **TEMP 触发器 + 自定义标量函数 `rxdb_desktop_notify`**
发变更事件，而不是 `update_hook`——后者在 truncate optimization（`DELETE FROM t` 无 WHERE）下
**不触发**，而行触发器会触发，共享套件恰好断言了这个行为。

原「事务 ID 的悬挂回收要额外设计」这条风险仍然成立，实现里由 `session.rs` 的 session 表 +
`RunEvent::Exit` 上的 `close_all()` 承担（见 AC#8）。

### 与 Node 宿主的三处有意差异

Rust 引擎不是 `node-sqlite-engine.ts` 的逐行翻译，以下三处**故意**不同，理由记在各自的代码注释里：

| 处       | Node 侧                                              | Rust 侧                  | 理由                                                                 |
| -------- | ---------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 语句切分 | `sqlite-script.ts`（SQLite `complete.c` 的手工移植） | `sqlite3_complete()` FFI | 语义天然一致，零移植风险                                             |
| 只读判定 | `execute-sql.utils.ts` 的正则                        | `Statement::readonly()`  | 更准确；共享套件的 `rowsAffected` 断言在两者下结果相同               |
| 忙等     | 5000ms / 1ms→100ms 的同步自旋退避                    | `PRAGMA busy_timeout`    | Rust 有真线程，不会像 `node:sqlite` 那样把持锁方的续体冻在同一线程上 |

### 路径解析

原计划是「用集成测试锁定 `tauri-plugin-sql` 对 `sqlite:<name>.sqlite3` 的真实解析结果」——
Tauri SQL 指南说相对 `AppConfig`，JavaScript API reference 说相对 `BaseDirectory::App`，两处文档不一致。
弃用插件后这个不一致**不再与本故事相关**：路径由 `paths.rs` 自己解析，
`app.path().app_data_dir()` + `rxdb-data/` 子目录，没有第二种说法。

子目录**不能叫 `databases`**：US-207 在 Electron 上踩过——`userData/databases` 是 Chromium 自己的
WebSQL 目录，其存储层在启动时会删掉目录里没有登记过的文件，表现为每次启动拿到一个全新空库。
Tauri 的 WebView 不是 Chromium（macOS 上是 WKWebView），但目录名沿用同一个结论，成本为零。

对外仍只承诺「应用作用域内的逻辑数据库名」：`open` 应答里的位置是 `desktop-sqlite://app-scope`，
物理根目录不出协议。库名先校验、再 `create_dir_all`——顺序反了的话，一个非法库名也会先把目录建出来。

### 权限面

**`capabilities/default.json` 没有任何改动。** `generate_handler!` 注册的 app 自定义命令
不受 capability 门禁约束——只有 `core:` / `plugin:` 前缀的命令才是。于是 AC#1 的
「未授予额外 shell 或全文件系统权限」不是靠配置克制得来的，而是**根本没有可授的东西**：
既没引入 `sql` / `fs` 插件，renderer 能触达的宿主能力也恰好是 `rxdb_desktop_request`
这一个命令 + `rxdb-desktop-change` 这一个事件。这比原计划的 `sql:default` + `sql:allow-execute`
（等价于「可执行任意 SQL」）严格更小。

### 命令为什么必须是 `async`

`rxdb_desktop_request` 写成 `async fn` 并把 `host.handle()` 放进
`tauri::async_runtime::spawn_blocking`，两层都不是可选的：

- **非 async 命令跑在主线程上。** 两个窗口各自发起 `BEGIN IMMEDIATE` 时，先拿到锁的那个
  要等自己的后续语句，而后续语句排在主线程队列里——队列前面正是另一个窗口的等锁调用。
  死锁，且表现为整个 UI 冻住。
- **纯 `async fn` 也不行。** `rusqlite` 是阻塞接口，直接在 async 上下文里跑会占住 tokio
  的 worker 线程；库一忙，其它 command 一起饿死。`spawn_blocking` 把它放到专用线程池。

### 依赖

- AC#6 依赖 [US-304](../collaboration/US-304-writer-lease-migration-fencing.md) 的 writer lease/fencing 收敛。
- 桌面存储配置的可辨识联合与 renderer client 契约由 [US-207](./US-207-desktop-local-database.md) 先抽出，
  本故事复用；若 Tauri 侧发现契约不足以承载，改动应回到 US-207 的那一层，而不是在本故事里另起一套。

## 实现文件

- `packages/rxdb-adapter-desktop/src/tauri-host-transport.ts` — Tauri 传输实现。`invoke` / `listen`
  由调用方注入，包本身不依赖 `@tauri-apps/api`（与 Electron bridge 收窄 window 是同一手法）
- `packages/rxdb-adapter-desktop/src/desktop-json-codec.ts` — `$bigint` / `$u8` / `$date` / `$esc`
  标签编码。Tauri 的 IPC 是 JSON，而协议实际携带 `bigint` / `Uint8Array` / `Date`。
  这是**传输层编码，不是协议变更**：`DESKTOP_HOST_PROTOCOL_VERSION` 仍为 `1`，Electron 路径一字未动
- `apps/dev-rxdb-tauri/src-tauri/src/rxdb/` — Rust 宿主：`protocol.rs` / `value.rs` / `engine.rs` /
  `session.rs` / `paths.rs` / `commands.rs`
- `apps/dev-rxdb-tauri/src-tauri/src/bin/rxdb_host_stdio.rs` — **测试专用**二进制，不含 `tauri::App`；
  stdin 逐行读请求、stdout 逐行写应答，供一致性套件 spawn
- `apps/dev-rxdb-tauri/conformance/` — 共享套件的 Rust 宿主入口与 `writer-lease.spec.ts`
- `apps/dev-rxdb-tauri/src/app/setup_rxdb.ts` — 运行时选路：Tauri 窗口用 desktop 适配器，
  浏览器预览用 wa-sqlite。适配器名与工厂**成对返回**，避免两处判定漂移
- `apps/dev-rxdb-tauri-e2e/` — **当前不存在**，AC#9 需要新建；与 US-905 阶段 1 共享 project，先开工者用
  generator 创建一次，本故事只拥有 AC#9 的 SQLite、事务与三平台打包 specs；三平台打包矩阵的 CI 成本
  应在 plan 阶段单独评估
- `requirements/api-baseline/rxdb-adapter-desktop.json` — 已同步（新增 6 项导出，35 → 41）

## References

- [US-207 Electron 连接本地 SQLite 文件](./US-207-desktop-local-database.md) — 本故事的来源与共享的桌面存储配置 / host 契约
- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 同样从 US-207 拆出
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md)
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/) — **已否决**，见「事务门禁」
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/) — 同上；两处文档对 SQLite 路径基准的描述不一致
- [Tauri Commands](https://v2.tauri.app/develop/calling-rust/) — 命令的线程模型（非 async 命令跑在主线程上）
