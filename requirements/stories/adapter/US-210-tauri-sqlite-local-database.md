---
id: US-210
title: Tauri 连接应用作用域 SQLite 文件
status: In Progress
priority: High
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-08-17
tags: [adapter, desktop, tauri, sqlite, transaction]
inherited_acs:
  - from: US-207
    ac: 1
    note: >-
      ac 一律是 US-207 的**当前**编号——US-207 拆出 US-208 / US-210 后由 11 条重编为 8 条，
      各条括注的「原 AC#N」只用于回溯 git 历史，不要拿它索引今天的 US-207。
      本条：Tauri SQLite 的跨重启持久化与权限最小化验收（原 AC#2）迁入本故事 AC#1；
      US-207 AC#1 是它的 Electron 对偶。
  - from: US-207
    ac: 2
    note: 事务门禁（单物理连接语义，原 AC#3）迁入本故事 AC#2；在今天的 US-207 里它并入 AC#2 的「事务」一项。
  - from: US-207
    ac: 8
    note: 仅继承「Tauri 三平台打包 smoke test」半句（原 AC#10 的一半）；Electron 半边仍由 US-207 AC#8 承诺。
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

**桌面本地 SQLite** 是 Electron 与 Tauri 两条路径；缺一则桌面 Local-first 不完整。
本故事交付 **Tauri + SQLite** 半边，Electron 半边是
[US-207](./US-207-desktop-local-database.md)。

本故事从 US-207 拆出，手法与当初拆出 [US-208](./US-208-electron-pglite-data-directory.md) 相同。

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

| #   | 前置条件                                                  | 操作                                                             | 预期结果                                                                                                                             | 状态 |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | Tauri 应用已注册 `rxdb_desktop_request` 命令              | 通过应用作用域内的 `<name>.sqlite3` 连接、写入、断开并重启应用   | 在同一 SQLite 文件中读回数据；未授予额外 shell 或全文件系统权限                                                                      | ⚠️   |
| 2   | Tauri SQLite 已连接                                       | 在一次 RxDB 事务中执行至少两次写入，并分别测试 commit 与中途抛错 | 所有语句固定在同一物理连接；commit 全部可见，rollback 后全部不可见。若连接池不能保证该语义，连接必须失败并报告能力缺失，不得伪造事务 | ✅   |
| 3   | Tauri SQLite 已连接                                       | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅         | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                                         | ✅   |
| 4   | SQLite 文件路径不存在                                     | 首次连接                                                         | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                   | ✅   |
| 5   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持 | 发起连接                                                         | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                   | ✅   |
| 6   | 同一 SQLite 文件已被另一个窗口打开并持有写锁              | 第二个窗口发起写事务                                             | 由 `PRAGMA busy_timeout` 原地等待持锁方提交；超时报可判别的 `database_busy`，不静默切换到另一份数据库                                | ⚠️   |
| 7   | SQLite 文件存在应用未知的普通业务表                       | Aiao 首次连接并初始化系统 schema                                 | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                     | ✅   |
| 8   | 存在未提交事务或在途查询                                  | 调用 `disconnect()` 或关闭窗口                                   | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                             | ✅   |
| 9   | 构建打包后的 Tauri 应用                                   | 在 macOS、Windows、Linux CI 中启动产物、写入、退出、再次启动    | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储，且断言形态为跨进程累计。三平台**统一不使用 WebDriver**（理由见下） | ⬜   |
| 10  | Rust 宿主与 renderer 编译自不同协议版本                   | 发起连接                                                        | 连接失败并报可判别的错误码；不建库、不按旧协议降级解释载荷                                                                          | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC#2（事务门禁）已判定：`tauri-plugin-sql` 不可用，改为自写 Rust command。** 详见「事务门禁」。
> 门禁的结论不是「降级为假事务」，而是换掉了实现手段——`rusqlite::Connection` 一 session 一条，
> 单连接语义由构造保证，无需依赖任何池配置。
>
> **AC#6 标 ⚠️**：`busy_timeout` 与 `database_busy` 的映射都在，但没有一条用例真的让两个会话撞写锁。
> 原计划的跨 realm writer lease 与迁移 fencing 已于 2026-08-16 取消（连同其代码与 US-304 一并删除），
> 本故事不再承诺「第二个 writer 在连接时被拒」；缺的是一条两会话争锁的直接用例。
>
> 关闭判据是**行为**与 [US-207](./US-207-desktop-local-database.md) AC#5 一致——第二个 writer 要么
> 等到持锁方提交后成功，要么超时报可判别的 `database_busy`，任何情况下不静默改道到另一份数据库。
> **不是实现或用例形态对齐**：两侧忙等机制是有意不同的（Node 侧 host 层异步退避重试，
> Rust 侧 `PRAGMA busy_timeout` 原地等待，理由见下文「三处有意差异」），照实现抄会做出错的东西。
>
> **AC#9 已解除阻塞（2026-08-17），从 🚫 改回 ⬜。** 此前判定「做不到」的理由是
> macOS 没有官方 WKWebView WebDriver、`tauri-driver` 只支持 Windows / Linux。
> 该理由**只对「用 WebDriver 驱 UI」这一种实现方式成立**，而这条 AC 从来不需要驱 UI——
> 它要验的是「打包产物能不能跨重启保住数据」，不是「点了按钮界面有没有变」。
>
> **改判后的方案：三平台统一用进程级驱动，全都不上 WebDriver。** 打包产物在
> 「自检模式」下启动（环境变量触发）：连库、写一行、退出；同一份数据目录连跑两次，
> 断言启动计数 1 → 2。三平台跑的是同一段代码，AC 文本里因此不必写「三平台用的不是同一种驱动」。
> 这比原方案严格更好：WebDriver 路线本来就要在 macOS 上另开一格例外。
>
> 代价要写明：**这条路验不到 UI 交互**。将来若要验「点击按钮 → 数据落库」，macOS 的驱动缺口
> 依然存在，那时再单开 spike。本 AC 不背这个债——它的前置条件里没有一个字提到界面。
>
> **AC#1 与 AC#9 是同一次实现。** AC#1 要的「关掉应用再打开还能读回」正是上述两次启动的断言，
> 差别只在 AC#9 还要求它在三个平台上跑。所以 AC#1 不再是「等 AC#9」，两者一起关。
> 鉴于 US-207 正是靠「跨进程累计计数」这条断言抓到静默丢数据（见下文），断言形态不能退化成
> 单次启动内的「写一条读一条」。
>
> `apps/dev-rxdb-tauri-e2e` 仍需新建（该 project 由 US-210 / US-905 阶段 1 中先开工者创建一次，
> 但 AC#9 的 SQLite、事务与打包 specs 由本故事负责）。三平台矩阵挂在
> [US-207「三平台打包 CI」](./US-207-desktop-local-database.md#三平台打包-ci阶段-2)
> 那条 release workflow 上，与 Electron 侧共用一次触发，不进 PR 门禁。

### 当前证据

`apps/dev-rxdb-tauri/conformance/setup.spec.ts` 把 `@aiao/rxdb-adapter-sqlite-core/testing` 的
21 个共享套件 + `@aiao/rxdb-test/encrypted` 的 5 套加密套件**原样**跑在 Rust 宿主上
（只排除 `createSqliteClientSuite`，它校验的是 wasm 后端的 worker 选项组合，桌面客户端不接受
任何 worker 选项）。`pnpm nx run dev-rxdb-tauri:test-conformance` 跑 `conformance/` 全部 8 个 spec，
为 **596 passed / 8 files / 0 skipped**；其中本故事的 SQL 侧是 6 个 spec / **577 passed**，
另 2 个（`storage-parity` / `storage-persistence`，19 条）属
[US-505](../plugin/US-505-tauri-local-file-storage.md)。

> 上面的条数是**快照，不是判据**。判据是「0 skipped 且不低于上次基线」——
> 把具体数字写进完成判据，过期后要么假红、要么被人默默改小对齐，两种都比不写更糟。

这批套件与 Electron 路径跑的是同一份断言、同一批工厂形状，只把 in-process 的 `node:sqlite`
换成 stdio 子进程里的 `rusqlite`。「Tauri 路径的行为与其它后端一致」这句话因此有机械保证，
而不是靠人肉比对两份实现。

**跑这个 target 时不要抢 CPU**：空闲机器上连跑 5 次全绿；但把 CPU 打满
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
| 6   | `engine.rs` 设置 `busy_timeout`、`protocol.rs` 的 `database_busy` 错误码映射、`session.rs` 的两会话隔离用例；**缺**两会话争写锁的直接用例                                                                                                                                        |
| 7   | `systemSchemaMigrationSuite`（共享套件，含未知表保留）                                                                                                                                                                                                                           |
| 8   | `engine.rs` 的 `releases_the_file_handle_so_it_can_be_renamed`：close 后 `-wal` 已 TRUNCATE checkpoint、句柄已交还，文件可直接 `rename`，且未提交的写入已回滚                                                                                                                    |
| 10  | 拒绝动作本身在共享层，与 Electron 路径同一份代码（见 [US-207 AC#9](./US-207-desktop-local-database.md)）；Rust 侧 `session.rs` 的 `open` 应答带上 `protocol.rs` 的 `PROTOCOL_VERSION`，`session.rs:315` 断言它出现在应答里。**缺**：没有任何用例让两端版本真的不一致，见下 |

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

补 AC#6 的用例时不能并进共享套件：套件里每个用例只有一个 adapter，验不到「第二个 writer」这半边，
而 `rust-adapter-factory.ts` 刻意给每次构造发唯一库名（套件之间不能互相看见对方的表），
两个窗口也就撞不到一起——争锁用例必须自己单开一个文件、显式共用同一个库名。

## 交付阶段

与 [US-207「交付阶段」](./US-207-desktop-local-database.md#交付阶段) 同构：本故事也已超出
INVEST「Small」，**不拆新故事**，改为划阶段，每阶段独立验收。

| 阶段 | 内容                            | 完成判据                                                                                                     | 状态      |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 1    | 核心能力：AC#2～#5、AC#7、AC#8  | 6 条 AC 全绿，一致性套件 0 skipped                                                                            | ✅ 已交付 |
| 2    | 收尾保留项：AC#6、AC#10         | AC#6 补一条两会话争写锁的直接用例；AC#10 把两侧协议常量绑起来                                                 | ⚠️ 进行中 |
| 3    | 打包验证：AC#1、AC#9            | 三平台 release workflow 绿；两者是同一次实现，见 AC#9 上方说明                                                | ⬜ 未开始 |
| 4    | Tauri 包化：T1～T7              | 见各任务判据；与 [US-207 E1～E7](./US-207-desktop-local-database.md#包边界重整) 同批做，共用一次改名          | ⬜ 未开始 |

本故事只有在四个阶段都完成后才标 `Done`。阶段 2 与阶段 3 之间没有依赖，可并行；
阶段 4 必须在 [US-207 E1](./US-207-desktop-local-database.md#任务) 把共享层下沉之后开工——
新包要引用的共享层今天还在 `@aiao/rxdb-adapter-desktop` 里。

## Tauri 包化

本故事的实现今天**没有一行在 packages 里**：JS 传输层寄居在
`@aiao/rxdb-adapter-desktop`，Rust 宿主、stdio 测试二进制与全部一致性用例（写本条时 SQL 侧 577 条）
全在 `apps/dev-rxdb-tauri/` 这个 demo 应用里。装了 npm 包的用户拿到的只是一根传输管子，管子那头的
`rusqlite` 引擎要自己照着 demo 重写一遍——AC#2/#3 承诺的「与其它后端行为一致」于是只对本仓库成立。

目标是 `packages/rxdb-adapter-tauri` 一个包同时装 **npm 包与 Rust crate**，demo 反过来依赖它。
Electron 半边的改名与共享层下沉见 [US-207「包边界重整」](./US-207-desktop-local-database.md#包边界重整)。

**`ADAPTER_NAME` 分裂已于 2026-08-17 落定**（决策、命名惯例与七处连带改动见
[US-207「已落定的决策」](./US-207-desktop-local-database.md#已落定的决策adapter_name-分裂2026-08-17)）：
本故事的适配器名为 **`sqlite-tauri`**，构造选项 `runtime: 'tauri'` 随之删除。
本节不另起一套命名，改名与 US-207 E3 同批执行——两个包共用一次破坏性变更，
分两次做等于让用户改两遍代码。

### 开工前仍未落定的决策：插件形态会让权限面结论反转

「权限面」小节今天的论证是**根本没有可授的东西**：`generate_handler!` 注册的 app 自定义命令
不受 capability 门禁约束，只有 `core:` / `plugin:` 前缀的命令才是，于是
`capabilities/default.json` 全程零改动。

**把宿主做成 Tauri 插件，命令就带上 `plugin:` 前缀，恰好落进门禁。** 宿主 app 从此必须显式授予
`rxdb:allow-request` 之类的权限项，AC#1 的论证形态从「无可授之物」退化成「授予面收敛到两个命令」，
而「`capabilities/` 零改动」这句话不再成立。二选一：

| 形态                                     | 权限面                                                       | 代价                                                                         |
| ---------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Tauri 插件（`tauri::plugin::Builder`）   | 命令进 capability 门禁，宿主须显式授权；插件可自带默认权限集 | 接入是一行 `.plugin(rxdb::init())`，生态惯例，但 AC#1 与「权限面」小节要重写 |
| 普通 crate，宿主自己 `generate_handler!` | 维持现状：无可授之物，`capabilities/` 零改动                 | 接入要抄一段注册代码；「一行接入」的包化收益打折                             |

**结论必须写回 AC#1 与「权限面」小节**，不能让两处各说各话。

### 任务

| #   | 任务                                                                                                                                                                                                                                   | 完成判据                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | 新建 `packages/rxdb-adapter-tauri`：npm 包（`src/`）与 Rust crate（`rust/`）同居一个 Nx project                                                                                                                                        | `tag:js-lib` 的 `run-many -t lint test build` 覆盖到它；crate 名与是否发 crates.io 一并定（见 T7）                                                                                                                          |
| T2  | Rust 宿主整体迁入：`apps/dev-rxdb-tauri/src-tauri/src/rxdb/`（`protocol.rs` / `value.rs` / `engine.rs` / `session.rs` / `paths.rs` / `router.rs` / `script.rs` / `error.rs` / `commands.rs` + `file/`）与 `src/bin/rxdb_host_stdio.rs` | 按上述决策定形为插件或普通 crate；`apps/dev-rxdb-tauri/src-tauri/src/rxdb/` 目录不再存在；`cargo test` 现有用例（迁移时约 118 条）在新位置全绿、零忽略，条数以迁移当天实测为准                                              |
| T3  | JS 侧迁入：`tauri-host-transport.ts` 与 `desktop-json-codec.ts` 及其单测从 desktop 包迁入。codec 跟着 Tauri 走而不是留共享层——`grep` 证实其唯一消费者是 `tauri-host-transport.ts`，Rust 侧有对应实现                                   | 新包 renderer 入口不含任何 Node builtin；`DESKTOP_HOST_PROTOCOL_VERSION` 仍为 `1`（拆包不是协议变更，Electron 路径应一字未动）                                                                                              |
| T4  | 一致性套件迁入：`conformance/` 的 `rust-adapter-factory.ts` / `rust-host-transport.ts` + 6 个 SQL 侧 spec 归本故事；`storage-parity.spec.ts` / `storage-persistence.spec.ts` 归 [US-505](../plugin/US-505-tauri-local-file-storage.md) | 迁移前后同一命令的用例数一致且 0 skipped（以迁移当天的迁移前实测为基线，写本条时为 SQL 侧 577 / 6 files、含 storage 596 / 8 files）；`rust-host-transport.ts` 里指向 `../src-tauri/target/debug/` 的 `HOST_BINARY` 路径同步 |
| T5  | Nx target 搬家：`cargo-check` / `cargo-clippy` / `cargo-test` / `build-test-host` / `test-conformance` 五个 target 从 `apps/dev-rxdb-tauri/project.json` 移到新包                                                                      | `pnpm nx run rxdb-adapter-tauri:test-conformance` 绿；demo 只保留 `dev` / `serve` / `tauri-build`，后者 `dependsOn` 新包的三条 Rust 门禁                                                                                    |
| T6  | demo 反向依赖：`src-tauri/Cargo.toml` 以 path 依赖引用新 crate，`src-tauri/src/` 只剩 `main.rs` / `lib.rs`；`src/app/setup_rxdb*.ts` 与 `README.md` 改指 `@aiao/rxdb-adapter-tauri`                                                    | `pnpm nx run dev-rxdb-tauri:tauri-build` 绿；demo 的接入代码就是文档里给用户看的那段                                                                                                                                        |
| T7  | Rust crate 的发布形态：crate 名（生态惯例是 `tauri-plugin-*`）、是否发 crates.io、与 npm 包的版本联动                                                                                                                                  | 不发 crates.io 则用户只能 path / git 依赖，「用户能复用」这个包化目标只兑现一半——要么发，要么把这条限制写进包 README；npm 侧在 Nx fixed release group 内，cargo 版本号需另行对齐                                            |

拆包不改本故事任何一条 AC 的语义，只换证据锚点的路径；唯一有实质影响的是上面那条权限面决策。

另有一件本故事的代码要交出去：`src/app/setup_rxdb.ts` 的 `selectLocalBackend()` —— 「Tauri 窗口走
宿主 SQLite、浏览器预览走 wa-sqlite」的判定不是 demo 的私事，是所有「一份代码同时发 web 与桌面」
的应用都要写的那段。它连同「静态 import 两条分支会把 transport 打进浏览器 bundle」这个现存缺陷，
归 [US-207「Web 回落」E8～E11](./US-207-desktop-local-database.md#web-回落同一份代码跑三端)。

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
两级回收承担：`RunEvent::Exit` 上的 `close_all()`（见 AC#8），以及 `WindowEvent::Destroyed`
上按 window label 的 `close_owner()`。只有前者是不够的——窗口崩溃或被单独关掉后，它的连接与
（US-505 的）文件锁会一直活到整个应用退出，而 `file.lockAcquire` 是无超时的等待，
另一个窗口从此再也拿不到那把锁。归属表在 `router.rs`，不在两套宿主里：宿主是传输无关的，
一致性测试的 stdio 二进制原样复用它们，那里没有「窗口」可言。

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

### AC#10 为什么标 ⚠️ 而不是 ✅

这条 AC 于 2026-08-17 补入，与
[US-207 AC#9](./US-207-desktop-local-database.md#ac9-为什么值得单列一条) 是同一件事在两条路径上的对偶。
补的理由在那边写全了：实现和用例都在，缺的是没有 AC 认领，于是**谁删掉这段校验都不算违反验收标准**。

标 ⚠️ 是因为 Tauri 侧比 Electron 侧多一个薄弱环节。拒绝动作本身在共享层（renderer 收到
`open` 应答后比对 `DESKTOP_HOST_PROTOCOL_VERSION`），两条路径同一份代码，这半边是稳的。
不稳的是**版本号在 Rust 侧是手抄的第二份**：

| 侧          | 常量                                                          |
| ----------- | ------------------------------------------------------------- |
| TypeScript  | `DESKTOP_HOST_PROTOCOL_VERSION`（`desktop-host-protocol.ts`） |
| Rust        | `PROTOCOL_VERSION: i64 = 1`（`protocol.rs:17`）              |

两个常量之间**没有任何机械联系**：改了 TS 那个，`cargo test` 一条不红；改了 Rust 那个，
`pnpm nx test` 一条不红。Electron 侧没有这个问题——host 与 renderer 读的是同一个 TS 常量。

后果不是「版本不匹配没被拦住」（共享层会拦），而是**漂移本身要到运行时才暴露**：
协议真变更时漏改一侧，一致性套件照常全绿（它们两侧都用当时的代码构建），
问题留给用户在真 IPC 上撞。

关闭 ⚠️ 需要一条把两个常量绑起来的断言。最省的做法是让一致性套件在握手时
断言 Rust 宿主报的版本号等于 TS 常量——`session.rs:315` 今天断言的是「应答里有这个字段」，
差的是「等于对面那个值」。改判为 ✅ 的判据就是这一条。

### 依赖

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
- `apps/dev-rxdb-tauri/conformance/` — 共享套件的 Rust 宿主入口
- `apps/dev-rxdb-tauri/src/app/setup_rxdb.ts` — 运行时选路：Tauri 窗口用 desktop 适配器，
  浏览器预览用 wa-sqlite。适配器名与工厂**成对返回**，避免两处判定漂移
- `apps/dev-rxdb-tauri-e2e/` — **当前不存在**，AC#9 需要新建；与 US-905 阶段 1 共享 project，先开工者用
  generator 创建一次，本故事只拥有 AC#9 的 SQLite、事务与三平台打包 specs；三平台打包矩阵的 CI 成本
  应在 plan 阶段单独评估
- `requirements/api-baseline/rxdb-adapter-desktop.json` — 已同步；条目总数以 `api-surface.mjs --check` 为准，不在本文写死（写本条时 48 项）

## References

- [US-207 Electron 连接本地 SQLite 文件](./US-207-desktop-local-database.md) — 桌面本地 SQLite 的 Electron 半边，也是本故事的来源与共享 host 契约
- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 同样从 US-207 拆出，不含 Tauri
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/) — **已否决**，见「事务门禁」
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/) — 同上；两处文档对 SQLite 路径基准的描述不一致
- [Tauri Commands](https://v2.tauri.app/develop/calling-rust/) — 命令的线程模型（非 async 命令跑在主线程上）
