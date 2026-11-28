---
id: US-210
title: Tauri 连接应用作用域 SQLite 文件
status: Done
priority: High
epic: epic-004-future-features
created: 2026-08-13
updated: 2026-11-16
tags: [adapter, desktop, tauri, sqlite, transaction]
inherited_acs:
  - from: US-207
    ac: 1
    note: >-
      ac 一律是 US-207 的**当前**编号——US-207 拆出 US-208 / US-210 后由 11 条重编为 9 条。
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
| 1   | Tauri 应用已注册 `rxdb_desktop_request` 命令              | 通过应用作用域内的 `<name>.sqlite3` 连接、写入、断开并重启应用   | 在同一 SQLite 文件中读回数据；未授予额外 shell 或全文件系统权限                                                                      | ✅   |
| 2   | Tauri SQLite 已连接                                       | 在一次 RxDB 事务中执行至少两次写入，并分别测试 commit 与中途抛错 | 所有语句固定在同一物理连接；commit 全部可见，rollback 后全部不可见。若连接池不能保证该语义，连接必须失败并报告能力缺失，不得伪造事务 | ✅   |
| 3   | Tauri SQLite 已连接                                       | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅         | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                                         | ✅   |
| 4   | SQLite 文件路径不存在                                     | 首次连接                                                         | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                                   | ✅   |
| 5   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持 | 发起连接                                                         | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                                   | ✅   |
| 6   | 同一 SQLite 文件已被另一个窗口打开并持有写锁              | 第二个窗口发起写事务                                             | 由 `PRAGMA busy_timeout` 原地等待持锁方提交；超时报可判别的 `database_busy`，不静默切换到另一份数据库                                | ✅   |
| 7   | SQLite 文件存在应用未知的普通业务表                       | Aiao 首次连接并初始化系统 schema                                 | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                                     | ✅   |
| 8   | 存在未提交事务或在途查询                                  | 调用 `disconnect()` 或关闭窗口                                   | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                                             | ✅   |
| 9   | 构建打包后的 Tauri 应用                                   | 在 macOS、Windows、Linux CI 中启动产物、写入、退出、再次启动     | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储，且断言形态为跨进程累计。三平台**统一不使用 WebDriver**（理由见下）         | ✅   |
| 10  | Rust 宿主与 renderer 编译自不同协议版本                   | 发起连接                                                         | 连接失败并报可判别的错误码；不建库、不按旧协议降级解释载荷                                                                           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

**验收边界**：

- AC#2 由自写 Rust command 与每 session 一条 `rusqlite::Connection` 保证单连接事务，方案依据见「事务门禁」。
- AC#6 的 `conformance/write-lock-contention.spec.ts` 验证真实写锁竞争：第二个 writer 等待提交后成功，或超时报
  `database_busy`，始终使用同一数据库。Node host 用异步退避，Rust 用 `PRAGMA busy_timeout`；不承诺连接时拒绝第二个 writer。
- AC#1 / #9 由打包产物的进程级自检驱动验收：同一数据目录连续启动，累计计数 1 → 2。
  三平台统一使用该驱动；真实 WebView 的下载 / fetch 能力另由 US-505 验收。
  自检不覆盖 UI 点击交互，macOS 的 UI 驱动缺口不由此替代。
- AC#10 在 `open` 之前以无参数、无副作用的 `handshake` 协商版本；不匹配时不建库、不登记会话、不解析路径。

`apps/dev-rxdb-tauri-e2e` 的打包产物任务叫 `desktop-smoke`，与 US-905 的 `devtools-smoke` 共用 project。
它不进入 `ci-template.yml` 自动发现的 ubuntu 单 OS `e2e` 跑道；`vitest.smoke.mts` 也避开普通 Vitest target 推断。
三 OS 矩阵由 `release-desktop.yml` 在发布、手动 dispatch 和桌面相关 PR 时触发，与 Electron 共用触发入口。

## 交付阶段

与 [US-207「交付阶段」](./US-207-desktop-local-database.md#交付阶段) 同构：本故事也已超出
INVEST「Small」，**不拆新故事**，改为划阶段，每阶段独立验收。

| 阶段 | 内容                           | 完成判据                                                                                                                                                                                                                                                                                                                                  | 状态      |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1    | 核心能力：AC#2～#5、AC#7、AC#8 | 6 条 AC 全绿，一致性套件 0 skipped                                                                                                                                                                                                                                                                                                        | ✅ 已交付 |
| 2    | 收尾保留项：AC#6、AC#10        | AC#6 补一条两会话争写锁的直接用例；AC#10 把两侧协议常量绑起来，并加一条无副作用的 `handshake` 请求在 `open` 之前协商版本。两条 AC 均已全绿                                                                                                                                                                                                | ✅ 已交付 |
| 3    | 打包验证：AC#1、AC#9           | 三平台 release workflow 绿；两者是同一次实现，见 AC#9 上方说明。本机 macOS 已跑通（含反向验证）；**三平台首轮已确认**（2026-08-17 [run 32075648469](https://github.com/aiao-io/rxdb/actions/runs/32075648469) 与 2026-08-19 [run 32311812029](https://github.com/aiao-io/rxdb/actions/runs/32311812029)，`tauri-smoke` 三平台均 success） | ✅ 已交付 |
| 4    | Tauri 包化：T1～T7             | 见各任务判据；与 [US-207 E1～E7](./US-207-desktop-local-database.md#包边界重整) 同批做，共用一次改名。T3（JS 侧迁入）已随 E2/E3 交付                                                                                                                                                                                                      | ✅ 已交付 |

四个阶段全部关闭，本故事随之标 `Done`。阶段 2 与阶段 3 之间没有依赖，可并行；
阶段 4 的前置——[US-207 E1](./US-207-desktop-local-database.md#任务) 把共享层下沉到
`@aiao/rxdb-adapter-sqlite-core/desktop-host`——已完成，T1～T7 不再被它挡住。

## Tauri 包化

**两侧都搬完了**：`packages/rxdb-adapter-tauri` 现在一个 Nx project 同时装着
**npm 包**（`src/`：传输层与 JSON codec，协议、renderer client、存储联合与错误类型从
`@aiao/rxdb-adapter-sqlite-core/desktop-host` 转出）与 **Rust crate**（`rust/`：`aiao-rxdb-tauri`，
宿主本体 + stdio 测试二进制），一致性套件（`conformance/`）跟着 crate 一起进来。
demo 反过来 path 依赖这个 crate——**demo 依赖包，正是包化的验收方式本身**：它证明「用户照着 demo 抄」
这条路真的通，而不是仓库内部另有一套接线。

搬之前的问题是：装了 npm 包的用户拿到的只是一根传输管子，管子那头的 `rusqlite` 引擎要自己照着
demo 重写一遍——AC#2/#3 承诺的「与其它后端行为一致」于是只对本仓库成立。现在引擎随 crate 分发，
这句话对包的使用者也成立了；**但只在 git / path 依赖的前提下**，见 T7 与
[`rust/README.md`](../../../packages/rxdb-adapter-tauri/rust/README.md)。

Electron 半边的改名与共享层下沉见 [US-207「包边界重整」](./US-207-desktop-local-database.md#包边界重整)。

**`ADAPTER_NAME` 分裂已落定**（决策、命名惯例与七处连带改动见
[US-207「已落定的决策」](./US-207-desktop-local-database.md#已落定的决策adapter_name-分裂)）：
本故事的适配器名为 **`sqlite-tauri`**，构造选项 `runtime: 'tauri'` 随之删除。
本节不另起一套命名，改名与 US-207 E3 同批执行——两个包共用一次破坏性变更，
分两次做等于让用户改两遍代码。

### 已落定的决策：普通 crate，不做 Tauri 插件

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

**选了第二行：普通 crate。** 换来的是 AC#1 与「权限面」小节**一个字都不用改**——
`capabilities/default.json` 在整个 T2 里零改动，「未授予额外 shell 或全文件系统权限」继续是
结构性事实（根本没有可授的东西），而不是退化成「授予面收敛到两个命令」这种要靠配置维持的承诺。

付的代价是接入不再是一行：宿主应用要自己抄三个钩子——`generate_handler!` 注册命令、`setup` 里
`app.manage(DesktopHost::new(...))`、以及 `WindowEvent::Destroyed` / `RunEvent::Exit` 两处回收。
完整那段就在 `apps/dev-rxdb-tauri/src-tauri/src/lib.rs` 里，也原样抄进了包 README——
**demo 的接线代码就是文档**，两份不会漂。

这笔交换是划算的：三个钩子抄一次，写完就不动了；而 capability 门禁一旦进来，是每个使用本包的
应用都要长期维护的一份权限清单，且 AC#1 那条「结构性事实」从此需要靠人读配置来复核。

### 任务

| #     | 任务                                                                                                                                                                                                                                   | 判据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 ✅ | 新建 `packages/rxdb-adapter-tauri`：npm 包（`src/`）与 Rust crate（`rust/`）同居一个 Nx project                                                                                                                                        | crate 名 `aiao-rxdb-tauri`（`[lib] name = "aiao_rxdb_tauri"`），`publish = false`（见 T7）；`tag:js-lib` 的 `run-many -t lint test build` 覆盖它，并补进 Rust 那五个 target                                                                                                                                                                                                                                                                                                                                                                  |
| T2 ✅ | Rust 宿主整体迁入：`apps/dev-rxdb-tauri/src-tauri/src/rxdb/`（`protocol.rs` / `value.rs` / `engine.rs` / `session.rs` / `paths.rs` / `router.rs` / `script.rs` / `error.rs` / `commands.rs` + `file/`）与 `src/bin/rxdb_host_stdio.rs` | 定形为**普通 crate**（见上节决策）；`src-tauri/src/rxdb/` 目录已不存在，全部 `git mv` 到 `packages/rxdb-adapter-tauri/rust/src/`（`rxdb/mod.rs` → `lib.rs`）；`cargo test --locked` **crate 131 + demo 16 = 147 条**全绿零忽略；`selfcheck.rs` **不迁**——它是 demo 应用的自检接线，不属于宿主                                                                                                                                                                                                                                                |
| T3 ✅ | JS 侧迁入：`tauri-host-transport.ts` 与 `desktop-json-codec.ts` 及其单测从 desktop 包迁入。codec 跟着 Tauri 走而不是留共享层——`grep` 证实其唯一消费者是 `tauri-host-transport.ts`，Rust 侧有对应实现                                   | `packages/rxdb-adapter-tauri` renderer 入口不含任何 Node builtin（`tsconfig.lib.json` 的 `types: []` + `desktop-adapter-consumer.mjs` 的产物依赖图遍历双重固定）；拆包不是协议变更，Electron 路径一字未动                                                                                                                                                                                                                                                                                                                                    |
| T4 ✅ | 一致性套件迁入：`conformance/` 的 `rust-adapter-factory.ts` / `rust-host-transport.ts` + 8 个 SQL 侧 spec 归本故事；`storage-parity.spec.ts` / `storage-persistence.spec.ts` 归 [US-505](../plugin/US-505-tauri-local-file-storage.md) | `605 passed / 10 files / 0 skipped`；`HOST_BINARY` 已改指 `../rust/target/debug/`。连带修掉两处只有搬家才会暴露的问题：`conformance/` 进包后 `@aiao/rxdb-adapter-tauri` 成了自引用（`@nx/enforce-module-boundaries` 报错），六个文件改走 `../src/index.js`——**仍走桶文件**，绕过桶去 sqlite-core 取 `DESKTOP_HOST_PROTOCOL_VERSION` 会让 AC#10 那条机械链接当场失效；`vitest.conformance.mts` 进 `eslint.config.mjs` 的 `ignoredFiles`，否则 `@nx/dependency-checks` 要求把 `vitest` 写进本包 `dependencies`（等于让每个用户拖一份测试框架） |
| T5 ✅ | Nx target 搬家：`cargo-check` / `cargo-clippy` / `cargo-test` / `build-test-host` / `test-conformance` 五个 target 从 `apps/dev-rxdb-tauri/project.json` 移到新包                                                                      | `pnpm nx run rxdb-adapter-tauri:test-conformance` 绿；demo 的三个 cargo target 没有删——`cargo clippy` 不 lint path 依赖，只 lint 主包，删了等于让 `lib.rs` + `selfcheck.rs` 这 500 多行彻底脱离门禁。于是 `tauri-build` 的 `dependsOn` 是**六条**：两个项目各三条。CI 侧无需改清单：`ci-template.yml` 的 rust job 由 `nx show projects --withTarget=cargo-test` 动态取，实测已含新包                                                                                                                                                         |
| T6 ✅ | demo 反向依赖：`src-tauri/Cargo.toml` 以 path 依赖引用新 crate，`src-tauri/src/` 只剩 `main.rs` / `lib.rs` / `selfcheck.rs` / `devtools_config.rs`；`src/app/setup_rxdb*.ts` 与 `README.md` 改指 `@aiao/rxdb-adapter-tauri`            | `pnpm nx run dev-rxdb-tauri:tauri-build` 绿（`.app` + `.dmg` 都出，六条 cargo 门禁全过）；demo 侧 `src-tauri/src/` 只剩 `main.rs` / `lib.rs` / `selfcheck.rs` / `devtools_config.rs`（后者为 US-905 的 devtools 配置，非宿主）                                                                                                                                                                                                                                                                                                               |
| T7 ✅ | Rust crate 的发布形态：crate 名（生态惯例是 `tauri-plugin-*`）、是否发 crates.io、与 npm 包的版本联动                                                                                                                                  | 已决：crate 名 `aiao-rxdb-tauri`（不用 `tauri-plugin-*`——它不是插件，见上节决策），**本轮不发 crates.io**，`publish = false` 让手滑的 `cargo publish` 直接失败。限制与四条代价（依赖方也发不了 crates.io、无 semver 解析、要能访问 GitHub、版本对齐靠手工）逐条写进 [`rust/README.md`](../../../packages/rxdb-adapter-tauri/rust/README.md)。**「用户能复用」因此只兑现一半**：写应用（binary）不受影响，写库的人会撞墙。发布本身留作后续任务                                                                                                |

拆包不改本故事任何一条 AC 的语义，只换证据锚点的路径；唯一有实质影响的是上面那条权限面决策，
而它的结论恰好是「维持现状」——AC#1 与「权限面」小节一字未改。

本故事另有一段代码曾被提名上移：`selectLocalBackend()` —— 「Tauri 窗口走宿主 SQLite、
浏览器预览走 wa-sqlite」的判定。**2026-08-18 判定为不上移**，它留在 demo 里
（`src/app/local-backend.ts`，候选表在 `src/app/setup_rxdb.ts`）：判定本体二十来行，
候选与探针本来就只能由应用提供，进 `@aiao/rxdb` 换不到任何复用，只会多一个必须长期
兼容的公开 API。要复用的人照抄这两个文件比调一个框架 API 更直接。

与之同源的另一件事归 US-207：两条候选分支走动态 `import()`，桌面 transport 不进浏览器 bundle，
见 [US-207「Web 回落」E8～E11](./US-207-desktop-local-database.md#web-回落同一份代码跑三端)。

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

| 处       | Node 侧                                                 | Rust 侧                  | 理由                                                                 |
| -------- | ------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| 语句切分 | `sqlite-script.ts`（SQLite `complete.c` 的手工移植）    | `sqlite3_complete()` FFI | 语义天然一致，零移植风险                                             |
| 只读判定 | `execute-sql.utils.ts` 的正则                           | `Statement::readonly()`  | 更准确；共享套件的 `rowsAffected` 断言在两者下结果相同               |
| 忙等     | host 层 `setTimeout` 异步退避（5000ms 预算，1ms→100ms） | `PRAGMA busy_timeout`    | Rust 有真线程，不会像 `node:sqlite` 那样把持锁方的续体冻在同一线程上 |

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

### AC#10：协议版本与无副作用握手

TypeScript 的 `DESKTOP_HOST_PROTOCOL_VERSION` 与 Rust `protocol.rs` 的 `PROTOCOL_VERSION: i64`
是跨语言常量，由 `protocol-handshake.spec.ts` 的两层断言保持一致：运行中的宿主应答版本等于 TS 常量，
直接读取 Rust 源码提取的版本也等于 TS 常量。源码提取失败必须显式报错并给出路径，不能跳过。

版本不匹配用 `rxdb_host_stdio` 测试替身的 `RXDB_HOST_STDIO_PROTOCOL_VERSION` 注入，按 JSON 指针
`/result/protocolVersion` 改写应答；产品协议没有可配置版本或降级分支。

- 请求为 `{ kind: 'handshake' }`；`parse_request` 重新构造 `Request::Handshake`，不透传 renderer 的额外字段，
  由 `parses_a_handshake_that_carries_nothing` 验证。
- 应答为 `{ kind: 'handshake', result: { protocolVersion } }`；`open` 应答保留版本作为第二道检查。
- 不识别握手的旧 host 返回 `protocol_violation: unknown request kind handshake`，客户端直接失败，不退回 `open`。
  旧 renderer 直接 `open` 仍受新 host 的应答版本检查约束。
- Rust 的 `handshake_reports_the_protocol_version_without_touching_the_disk` 使用未创建的根目录，握手后断言目录仍不存在；
  TS 对偶由 `electron-sqlite-host.spec.ts` 的路径解析器零调用断言覆盖。

### 依赖

- 桌面存储配置的可辨识联合与 renderer client 契约由 [US-207](./US-207-desktop-local-database.md) 先抽出，
  本故事复用；若 Tauri 侧发现契约不足以承载，改动应回到 US-207 的那一层，而不是在本故事里另起一套。

## 实现文件

| 文件                                                          | 阶段 | 说明                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxdb-adapter-tauri/src/tauri-host-transport.ts`     | 4    | Tauri 传输实现。`invoke` / `listen` 由调用方注入，包本身不依赖 `@tauri-apps/api`（与 Electron bridge 收窄 window 是同一手法）                                                                                                                                                                                                                |
| `packages/rxdb-adapter-tauri/src/desktop-json-codec.ts`       | 4    | `$bigint` / `$u8` / `$date` / `$esc` 标签编码。Tauri 的 IPC 是 JSON，而协议实际携带 `bigint` / `Uint8Array` / `Date`。这是**传输层编码，不是协议变更**，Electron 路径一字未动                                                                                                                                                                |
| `packages/rxdb-adapter-tauri/rust/`                           | 4    | Rust 宿主 crate `aiao-rxdb-tauri`：`src/protocol.rs` / `value.rs` / `engine.rs` / `session.rs` / `paths.rs` / `router.rs` / `script.rs` / `error.rs` / `commands.rs` + `file/`。**只有 `commands.rs` 依赖 `tauri`**——正是这一点让 stdio 二进制能在没有 `tauri::App` 的情况下原样复用其余全部代码。`publish = false`，引用方式见同目录 README |
| `packages/rxdb-adapter-tauri/rust/src/bin/rxdb_host_stdio.rs` | 4    | **测试专用**二进制，不含 `tauri::App`；stdin 逐行读请求、stdout 逐行写应答，供一致性套件 spawn（不进任何产品包）                                                                                                                                                                                                                             |
| `packages/rxdb-adapter-tauri/conformance/`                    | 4    | 共享套件的 Rust 宿主入口。一律从 `../src/index.js` 取符号：包内自引用过不了 `@nx/enforce-module-boundaries`，而绕过桶文件会让 AC#10 失效                                                                                                                                                                                                     |
| `apps/dev-rxdb-tauri/src-tauri/src/lib.rs`                    | 4    | 宿主应用侧的**接线**（`generate_handler!` + `app.manage` + 两处回收钩子）。这段就是包 README 里给用户抄的那份，两边不会漂                                                                                                                                                                                                                    |
| `apps/dev-rxdb-tauri/src/app/setup_rxdb.ts`                   | 1    | 运行时选路：Tauri 窗口用 desktop 适配器，浏览器预览用 wa-sqlite。适配器名与工厂**成对返回**，避免两处判定漂移                                                                                                                                                                                                                                |
| `apps/dev-rxdb-tauri/src-tauri/src/selfcheck.rs`              | 3    | 自检模式的纯函数 `plan_from_env`：两个环境变量成对出现才算数，只设其一 / 相对路径 / 目录不存在一律 `Err` → 退出码 3，且发生在**建窗之前**。不设默认值是有意的——默认到某个「合理」位置，只会让测试悄悄写进真实用户数据目录                                                                                                                    |
| `apps/dev-rxdb-tauri-e2e/`                                    | 3    | AC#1 / AC#9 的跨进程 smoke（本故事创建；US-905 的 devtools specs 也在同一个 project 里）。target 叫 `desktop-smoke`、配置叫 `vitest.smoke.mts`，两个名字都是为了避开自动发现，理由见上文 AC#9 段落                                                                                                                                           |
| `apps/dev-rxdb-tauri/src-tauri/tauri.conf.json`               | 3    | `beforeDevCommand` / `beforeBuildCommand` 用 `pnpm exec`，不用 `corepack pnpm exec`：`.nvmrc` 钉的是 Node 26，而 Node 25 起不再随发行版附带 Corepack（Node.js TSC 决议）。这条理由只能写在这里：`tauri.conf.json` 是严格 JSON，注释放不进去                                                                                                  |
| `requirements/api-baseline/rxdb-adapter-tauri.json`           | 4    | 已同步（US-207 E2/E3 拆包后由 `rxdb-adapter-desktop.json` 分成 electron / tauri 两份）；条目总数以 `api-surface.mjs --check` 为准，不在本文写死。**Rust crate 不在这份基线里**——`api-surface.mjs` 只扫 npm 包的导出，crate 的公开表面今天没有任何机械约束，这也是 T7 暂不发 crates.io 的理由之一                                             |

## References

- [US-207 Electron 连接本地 SQLite 文件](./US-207-desktop-local-database.md) — 桌面本地 SQLite 的 Electron 半边，也是本故事的来源与共享 host 契约
- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 同样从 US-207 拆出，不含 Tauri
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/) — **已否决**，见「事务门禁」
- [Tauri SQL JavaScript API](https://v2.tauri.app/reference/javascript/sql/) — 同上；两处文档对 SQLite 路径基准的描述不一致
- [Tauri Commands](https://v2.tauri.app/develop/calling-rust/) — 命令的线程模型（非 async 命令跑在主线程上）
