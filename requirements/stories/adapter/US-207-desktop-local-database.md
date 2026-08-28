---
id: US-207
title: Electron 连接本地 SQLite 文件
status: Done
priority: High
epic: epic-004-future-features
created: 2026-08-08
updated: 2026-08-18
tags: [adapter, desktop, electron, sqlite]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖远程同步或 UI 功能即可交付
- [x] Negotiable (可协商): 桌面 host 与 renderer 的传输实现可替换
- [x] Valuable (有价值): 数据落在可备份、可迁移的原生本地存储中
- [x] Estimable (可估算): 单一运行时（Electron）+ 单一引擎（SQLite）
- [ ] Small (小): **不成立，已改为分阶段交付**。9 条 AC 本身是收敛的（Electron PGlite 拆至 US-208、
      Tauri 拆至 US-210），但文末「包边界重整」E1～E7 与「Web 回落」E8～E11 各是一条独立故事的体量。
      不再拆故事，改为在本故事内划四个阶段，各阶段有独立完成判据，见「交付阶段」
- [x] Testable (可测试): 持久化、事务、失败路径与打包 smoke test 均有独立 AC
-->

# 用户故事：Electron 连接本地 SQLite 文件

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 桌面应用的开发者
**我想要** 将 RxDB 连接到应用本地的 SQLite 文件
**以便** 数据可以跨应用重启持久化，并能通过桌面系统的文件备份和迁移机制管理，而不是只存在于 WebView 的 OPFS 或 IndexedDB 中

## 拆分说明

**桌面本地 SQLite** 是 Electron 与 Tauri 两条路径；缺一则桌面 Local-first 不完整。
本故事只交付 **Electron + SQLite** 半边，Tauri 半边是
[US-210](./US-210-tauri-sqlite-local-database.md)。PGlite 另半边是
[US-208](./US-208-electron-pglite-data-directory.md)。

| 范围                        | 归属                                                 |
| --------------------------- | ---------------------------------------------------- |
| Electron SQLite（含三平台） | 本故事                                               |
| Electron PGlite data dir    | [US-208](./US-208-electron-pglite-data-directory.md) |
| Tauri SQLite（含三平台）    | [US-210](./US-210-tauri-sqlite-local-database.md)    |

两条拆分线各有理由，都是 INVEST「Small」不成立：

- **PGlite 分出去**，因为它需要一套 SQLite 路径不需要的 IPC 事务 host，混编会让本故事同时背两种事务模型。
- **Tauri 分出去**，因为两者**风险量级不对等**：Electron 侧只是工程量，Tauri 侧卡在一个外部前提——
  `@tauri-apps/plugin-sql` 的 JavaScript API 没有事务对象，无从确认 BEGIN / 业务语句 / COMMIT
  是否落在同一物理连接。该前提为否时 Tauri 侧要回 plan 阶段重定方案，而 Electron 侧完全不受影响；
  绑在一起等于让已可交付的一半陪着另一半停在 Backlog。

桌面 host 契约（renderer client / host protocol / 安全基线）在本故事抽出，US-208 与 US-210 复用。

## 范围边界

### In Scope

- 提供明确的桌面存储配置，使用可辨识联合区分存储引擎；配置的联合形状必须能在不破坏现有取值的前提下容纳 [US-208](./US-208-electron-pglite-data-directory.md) 的 PGlite data directory，且不得把 PGlite 描述成单文件数据库。
- 抽出可被桌面 host 实现的 renderer client / host protocol 契约与 Electron 安全基线，供 [US-208](./US-208-electron-pglite-data-directory.md) 与 [US-210](./US-210-tauri-sqlite-local-database.md) 复用。
- Electron 在主进程中打开 SQLite 文件，renderer 只通过类型化、参数校验后的 IPC 使用数据库能力；不得开启 `nodeIntegration` 或关闭 `contextIsolation`/`sandbox`。
- 必须保持现有 RxDB 的查询、事务、变更通知、系统 schema 迁移与加密能力，不允许用功能降级换取文件持久化。
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

| #   | 前置条件                                                  | 操作                                                     | 预期结果                                                                                                             | 状态 |
| --- | --------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 应用配置 SQLite 文件存储                         | 首次连接、写入实体、断开并重启应用后再次连接             | 在同一文件中读回数据；断言形态必须跨进程累计，不能是单次启动内「写一条读一条」（理由见下方证据）                     | ✅   |
| 2   | Electron SQLite 已连接                                    | 执行查询、变更、事务、分支切换、加密字段解锁与响应式订阅 | 用户可见行为与现有 SQLite adapter 一致，标准测试套件无跳过项                                                         | ✅   |
| 3   | SQLite 文件路径不存在                                     | 首次连接                                                 | 仅在已授权的应用作用域中创建存储；返回已解析的逻辑位置用于诊断，不向 renderer 暴露额外文件系统能力                   | ✅   |
| 4   | 路径无权限、SQLite 文件损坏或 runtime/engine 组合不受支持 | 发起连接                                                 | 返回稳定、可判别的错误码与原始原因；不创建同名空库，不回退到 memory/OPFS/IndexedDB                                   | ✅   |
| 5   | 同一 SQLite 文件已被另一个窗口打开并持有写锁              | 第二个窗口发起写事务                                     | 在异步层等待持锁方提交后继续；重试预算耗尽报可判别的 `database_busy`，事务中途撞锁不静默重发，也不切换到另一份数据库 | ✅   |
| 6   | SQLite 文件存在应用未知的普通业务表                       | Aiao 首次连接并初始化系统 schema                         | 保留未知表和数据；只创建或迁移 Aiao 自有系统对象，失败时事务回滚                                                     | ✅   |
| 7   | 存在未提交事务或在途查询                                  | 调用 `disconnect()` 或关闭窗口                           | 停止接受新任务，等待或回滚在途工作，刷新持久化数据并关闭句柄；随后可重命名该 SQLite 文件                             | ✅   |
| 8   | 构建打包后的 Electron 应用                                | 在 macOS、Windows、Linux CI 中运行桌面持久化 smoke test  | 三平台均通过；测试使用真实临时文件而非 mock 或浏览器存储                                                             | ✅   |
| 9   | host 与 renderer 编译自不同协议版本                       | 发起连接                                                 | 连接失败并报可判别的错误码；不建库、不按旧协议降级解释载荷                                                           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 发布前需人工确认的三条性质

`@aiao/rxdb-adapter-electron` 是**双入口**包（`.` 给 renderer、`./host` 给特权侧），以下三条性质
**在 workspace 内测里结构性地测不到**——单测走 tsconfig paths 读源码，永远不经过打包。由
`scripts/audit/desktop-adapter-consumer.mjs` 在 release workflow 的 `adapter-consumer` job 上跑真 tarball 验证：

1. 两个入口在 NodeNext 与 Bundler 两种解析模式下都能编译；
2. **renderer 入口的产物里不出现 `node:sqlite`**——`src/index.ts` 的 TSDoc 把「可以安全地打进
   renderer bundle」写成了承诺，而真串味只有产物里看得见，且后果是安全退化而非构建报错；
3. host 入口真能开库、建表、写入、读回、关闭，应答一律经 renderer 入口导出的
   `assertDesktopHostResponse` 解包——于是这条往返同时证明两个入口的协议是配套的。

该 job **不进 PR 门禁**（要 `pnpm pack` 再装进临时项目，耗时与 PR 上每次都跑的收益不成比例）；
它也是那条 workflow 里唯一**不上矩阵**的 job（`pnpm pack` → 临时消费者 → 双模式 typecheck → host
真开库往返，没有一步与 OS 有关）。脚本用 `process.cwd()` 当 workspace 根，**必须从仓库根目录调用**。
拆包后这三条要在**两个**包上各跑一遍（E7），脚本用 `TARGETS` 表参数化包名，不复制第二份。

### 未关闭项

多窗口写并发只由 SQLite 自身的锁与 host 的异步退避重试承担；**跨 realm writer lease 与迁移 epoch
fencing 已取消**（US-304，连同代码删除），本故事不承诺「第二个 writer 在连接时被拒」这类跨 realm 排他语义。

## 交付阶段

本故事的体量已超出 INVEST「Small」：9 条 AC 之外，文末两节各挂着一整套任务。
**不拆成新故事**（拆了要重建交叉引用、重分 epic、重写 `inherited_acs`，而这几节的上下文
恰恰全在本文里），改为在故事内划阶段。每个阶段有独立的完成判据，**逐阶段推进、逐阶段验收**。

| 阶段 | 内容                                   | 完成判据                                                                                                                                                                                                               | 状态      |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1    | 核心能力：AC#1～#7、AC#9               | 8 条 AC 全绿，共享套件 0 skipped                                                                                                                                                                                       | ✅ 已交付 |
| 2    | 打包与发布门禁：AC#8 +「三条发布性质」 | release 触发的三平台 workflow（`electron-smoke` × 3 + `tauri-smoke` × 3 + `adapter-consumer` + `gate`）全绿；`release-desktop.yml` 与 `desktop-adapter-consumer.mjs` 已落地                                            | ✅ 已交付 |
| 3    | 包边界重整：E1～E7                     | 见各任务判据；与 [US-210 T1～T7](./US-210-tauri-sqlite-local-database.md#tauri-包化) 同批做，两侧共用一次 `ADAPTER_NAME` 改名。E1～E7 全部交付；E6 的 `npm deprecate` 判定**不做**（旧包保留可更新），判据已随之收窄   | ✅ 已交付 |
| 4    | Web 回落：E8～E11                      | 见各任务判据；「选择器是否公开 API」已判定为**否**（留在应用里）。E8～E11 全部交付：两个 demo 共用同一形态的选择器，Electron 侧两卡已合并成一张，E11 的产物断言落成 `scripts/audit/desktop-lazy-backend.mjs` 并进了 CI | ✅ 已交付 |

**分阶段不等于降低完成判据**：本故事只有在四个阶段都完成后才标 `Done`。
`status-overview.md` 的「进行中」记录当前停在哪个阶段，读到「进行中」的人由此知道
欠的是 AC 还是后续阶段，不必翻回本文猜。

阶段间的依赖是真的，不是排序偏好：

- **阶段 3 必须在阶段 2 之后**。阶段 2 要在打包产物上验「renderer 入口不含 `node:sqlite`」，
  而阶段 3 正是把入口切开重排——先立门禁再动结构，动坏了当场红；反过来则是拆完才发现串味，
  已无从判断是拆坏的还是本来就坏的。
- **阶段 4 必须在阶段 3 之后**。E8 的选择器要「不依赖任何适配器包」，而拆包前只有
  `@aiao/rxdb-adapter-desktop` 一个包，选择器无处可放；E1 把共享层下沉到
  `@aiao/rxdb-adapter-sqlite-core/desktop-host` 之后才有位置——这个前置已经满足。

## 包边界重整

E1～E7 已全部落地：`packages/rxdb-adapter-desktop` 与 `@aiao/rxdb-adapter-desktop` 依赖在仓库里已不存在，
拆成 `-electron` / `-tauri` 两包，共享层下沉到 `rxdb-adapter-sqlite-core/desktop-host`；迁移文档
`website/docs/migration/desktop-split.md` 已交付。**`npm deprecate` 判定不做**——旧包
`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上、未来仍可继续发版，迁移路径只靠文档给。

拆包前，`@aiao/rxdb-adapter-desktop` 一个包同时装了三层东西：跨运行时的协议与 renderer client
（`desktop-host-protocol.ts` / `desktop-sqlite-client.ts` / `desktop-storage.ts`）、Electron 的
`node:sqlite` 宿主（`node-sqlite-engine.ts` / `desktop-sqlite-host.ts` / `desktop-file-host.ts`）、
以及 Tauri 的传输层（`tauri-host-transport.ts`）。第三层的**真正实现**——Rust 宿主与跑在它上面的
一致性套件——却在 `apps/dev-rxdb-tauri/` 里，装了包的用户拿不到，只能照着 demo 抄一遍。

目标形态是**两个运行时包 + 一个已有共享层**，`desktop` 这个包名消失：

| 目标                                         | 内容                                                        | 归属                                                            |
| -------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `@aiao/rxdb-adapter-sqlite-core`（新子路径） | 协议、renderer client、存储配置联合、错误类型               | 本节 E1                                                         |
| `@aiao/rxdb-adapter-electron`                | `node:sqlite` 引擎、SQL 与文件宿主、`./host` 特权入口       | 本节 E2～E7                                                     |
| `@aiao/rxdb-adapter-tauri`                   | Tauri 传输 + JSON 标签编解码 + Rust 宿主 crate + 一致性套件 | [US-210](./US-210-tauri-sqlite-local-database.md)「Tauri 包化」 |

拆包不改任何一条 AC 的语义：本故事的 9 条 AC 在改名后逐条原样成立，只是证据锚点换了包名。
它也**不是**发布 1.0 前的可选整理——`@aiao/rxdb-adapter-desktop@0.0.25` 已在 registry 上，
拖到有真实用户之后再改名，成本从「改 21 个引用点」变成「改用户代码」。

### 已落定的决策：`ADAPTER_NAME` 分裂（2026-08-17）

`desktop-adapter.interface.ts` 的 `ADAPTER_NAME = 'desktop'` 是用户写进
`rxdb.config.sync.local.adapter` 的运行时字符串，不是内部常量；`RxDBAdapterDesktop` 今天靠
构造选项 `runtime: 'electron' | 'tauri'` 区分两条路径（`DesktopRuntime`，`desktop-storage.ts`）。

**决策：分裂。** 两包各注册自己的名字，不再共用 `desktop`。

被否掉的是「两包继续注册同一个 `desktop` 名」：它对用户代码零改动，但一个进程内两个包会
互斥注册，冲突只能在**运行时**报错。而拆包的目的正是让「装了哪个包」在**构建期**就确定——
留一个运行时冲突点进去，等于把拆包本该消除的那类问题换了个地方保留。

**命名遵循已有惯例 `<引擎>-<运行时>`**，参照 `@aiao/rxdb-adapter-miniprogram` 的
`ADAPTER_NAME = 'wa-sqlite-miniprogram'`（不是 `'miniprogram'`）：

| 适配器            | `ADAPTER_NAME`    | 归属                                                     |
| ----------------- | ----------------- | -------------------------------------------------------- |
| Electron + SQLite | `sqlite-electron` | 本故事 E3                                                |
| Tauri + SQLite    | `sqlite-tauri`    | [US-210](./US-210-tauri-sqlite-local-database.md) T1～T7 |
| Electron + PGlite | `pglite-electron` | [US-208](./US-208-electron-pglite-data-directory.md)     |

**PGlite 单独占一个名，不并进 `sqlite-electron`。** 理由不是对称美感：两者是不同的引擎、
不同的事务模型（PGlite 的 callback transaction 跨不了 IPC，需要一套 SQLite 路径不需要的
事务 host，正是当初拆出 US-208 的原因），共用一个适配器名意味着同一个名字下藏着两种事务语义，
用户无从在配置里表达自己要哪一种。US-208 的实现落在哪个包由该故事定，但**名字必须是第三个**。

分裂的连带改动（E3 的完成判据即为这几处全部同步）：

| 处                                                                              | 改动                                                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DesktopOptions.runtime` 与 `DesktopRuntime`                                    | **删除**。名字已经表达了运行时，再留一个选项就是同一件事的两个真相来源     |
| `SupportedDesktopStorage<TRuntime>`（`desktop-storage.ts:51`）                  | 泛型失去输入，退化成两个具体类型，各归各包                                 |
| `SUPPORTED_RUNTIMES`（`desktop-storage.ts:141`）与连接前的能力矩阵校验          | 删除。「Tauri 永不支持 PGlite」不再需要运行时校验——那个组合没有对应的名字  |
| [US-505](../plugin/US-505-tauri-local-file-storage.md) AC#11 `adapter_mismatch` | 判别依据从 `runtime` 改为适配器名                                          |
| `apps/dev-rxdb-tauri/src/app/setup_rxdb.ts` 的运行时选路                        | 返回的适配器名改为 `sqlite-tauri`；这段判定本身在阶段 4 的 E8 上移         |
| [capability-matrix](../../capability-matrix.md) 的 desktop 行                   | 拆成三行                                                                   |
| `website/docs/migration/`                                                       | 旧 `desktop` 名的迁移映射 → 已写成 `migration/desktop-split.md`（E6 上半） |

**这是破坏性改动，且必须赶在有真实用户之前做**——`@aiao/rxdb-adapter-desktop@0.0.25` 已在
registry 上。改名成本今天是「改 21 个引用点」，拖下去就变成「改用户代码」。

### 任务

| #     | 任务                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 完成判据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 ✅ | 共享层下沉：`desktop-host-protocol.ts` / `desktop-sqlite-client.ts` / `desktop-storage.ts` / `desktop-error.ts` 与 `desktop-adapter.interface.ts` 的跨运行时部分迁入 `packages/rxdb-adapter-sqlite-core`，以**子路径入口**暴露                                                                                                                                                                                                                                  | 已达成：落在 `src/desktop/`，经 `./desktop-host` 子路径暴露，不进主入口；`rxdb-adapter-sqlite-core.json` 无 diff（子路径本就不进根基线）；`KNOWN_UNCOVERED_SUBPATHS` 已登记 `./desktop-host`，计数注释同步为「10 个包共 16 个入口」                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| E2 ✅ | `packages/rxdb-adapter-desktop` → `packages/rxdb-adapter-electron`，包名 `@aiao/rxdb-adapter-electron`；只留 Electron 专有实现与 `./host` 入口，`tauri-host-transport.ts` 与 `desktop-json-codec.ts` 移出（US-210 T3）                                                                                                                                                                                                                                          | 已达成：`dependencies` 只剩 `@aiao/rxdb` 与 `@aiao/rxdb-adapter-sqlite-core`，`src/` 无一处 import Tauri；`public-api.spec.ts` 的「keeps every Node builtin behind the host entry」在新包内继续绿；`.` 与 `./host` 双入口保留。**原判据「包内 `grep -ri tauri` 零命中」作废**——README 与 TSDoc 里指向 tauri 包的散文交叉引用是该留的，要守的是「无 Tauri 代码与依赖」                                                                                                                                                                                                                                                                                                                         |
| E3 ✅ | 执行 `ADAPTER_NAME` 分裂（决策已落定，见上）：`'desktop'` → `'sqlite-electron'` / `'sqlite-tauri'`，`RxDBAdapterDesktop` / `DESKTOP_*` / `RxDBAdapterDesktopError` 随包名改，删除 `runtime` 选项与 `DesktopRuntime`                                                                                                                                                                                                                                             | 已达成：上表七处连带改动全部同步；`grep -rn "runtime: 'electron'\|runtime: 'tauri'\|DesktopRuntime" --include="*.ts"` 零命中；`capability-matrix.md` 的 desktop 行拆成 `sqlite-electron` / `sqlite-tauri` / `pglite-electron` 三行                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| E4 ✅ | api-baseline 拆分：`rxdb-adapter-desktop.json` 删除，其导出按运行时归属拆入新增的 `rxdb-adapter-electron.json` / `rxdb-adapter-tauri.json`                                                                                                                                                                                                                                                                                                                      | 已达成：新增 electron（43 项）与 tauri（50 项）两份基线，其中 41 项是两包各自 re-export 的共享层。**原判据「总数不变」作废**：并集 51 → 52，差额逐条可归因于 E3 的决策而非疏漏——`DESKTOP_ADAPTER_NAME` 与 `RxDBAdapterDesktop` 各裂成两个（+2），`DesktopRuntime` 与 `SupportedDesktopStorage` 删除（−2），`assertSupportedDesktopStorage` → `assertDesktopSqliteStorage` 更名，`TauriOptions` 新增（+1）                                                                                                                                                                                                                                                                                     |
| E5 ✅ | 引用点更新：`tsconfig.base.json` 两条 paths、`rxdb-plugin-storage`（`package.json` / `vite.config.mts` external / `src/desktop.ts` / 4 个 spec）、`dev-rxdb-electron`、`dev-rxdb-tauri`、`README.md` 目录树、`scripts/README.md`、`capability-matrix.md`、[US-601](../tooling/US-601-subpath-api-surface-baseline.md) 子路径表、[US-904](../future/US-904-devtools-native-storage-contract.md) / [US-905](../future/US-905-tauri-native-devtools.md) 实现文件表 | 已达成：代码、配置与**现状描述**里零命中；`rxdb-plugin-storage` 的 `./desktop` 入口改指共享层后不再依赖任何运行时包，`/host` 只剩测试用途。**「零命中」有一处有意的例外**：评审记录、E6 自身的迁移叙述、以及「写本条时随 `0.0.25` 发布」这类历史陈述必须留旧包名才准确，各自已补到今天路径的映射表                                                                                                                                                                                                                                                                                                                                                                                            |
| E6 ✅ | 发布迁移：改名映射写进 `website/docs/migration/`                                                                                                                                                                                                                                                                                                                                                                                                                | 两个新包在 Nx fixed release group 下与其余 `@aiao/*` 同步版本号。**已达成**：改名映射写成 `website/docs/migration/desktop-split.md`，`sidebars.ts` 与 `migration/README.md` 均已登记，`website:site-build` 在 `onBrokenLinks: 'throw'` 下通过；表格内容不是照记忆写的，是拿新旧两份 API baseline 做集合差得出的（51 → electron 43 / tauri 50，5 删 6 增 46 原名不变）。**判据变更**：原判据要求 `npm deprecate @aiao/rxdb-adapter-desktop` 并按 [versioning-policy](../../versioning-policy.md) 第 3 节走废弃周期，现**判定不做**——旧包保留在 registry 上、未来仍可继续更新，打 `deprecated` 标记会与「还会发版」自相矛盾。迁移路径靠文档给，不靠 registry 元数据；本条不再有未执行的对外动作 |
| E7 ✅ | 「发布前需人工确认的三条性质」现在要在**两个**包上各跑一遍                                                                                                                                                                                                                                                                                                                                                                                                      | 已达成：`scripts/audit/desktop-adapter-consumer.mjs` 用一张 `TARGETS` 表参数化两个包（未复制第二份脚本），2026-08-17 对真 `pnpm pack` 产物跑通——electron 报 `dual entry, NodeNext + Bundler + host round-trip`，tauri 报 `single entry, NodeNext + Bundler`（它的特权侧是 Rust，没有 JS host 可往返）。「renderer 产物图不含 Node builtin」两个包都跑，且从只读 `dist/index.js` 改成**跟着依赖图走**——E1 之后入口只是转出壳子，只读一个文件会漏掉壳子后面的串味                                                                                                                                                                                                                               |

### Web 回落：同一份代码跑三端

> **已交付**：选择器本体是 `selectLocalBackend()` / `LocalBackendCandidate` /
> 两个错误类，两个 demo 各有一份同形态的 `local-backend.ts`（`dev-rxdb-tauri` 10 条单测、
> `dev-rxdb-electron` 同构一份），候选表在各自同目录的 `setup_rxdb.ts`。
> **它是应用代码，不是框架 API** —— 曾短暂进过 `@aiao/rxdb` 的公开导出，同日判定撤回，
> 理由见下方「为什么不做成公开 API」。
> 下面这段现状描述保留为改动前的原文，读作「为什么要有选择器」。

拆成 `-electron` / `-tauri` 两个包之后，「一份前端代码同时发 web、Electron、Tauri」这个场景才真正
浮出来：浏览器里既没有 preload 注入的 `globalThis.__aiaoRxdbDesktopHost__`，也没有 Tauri 的
`__TAURI_INTERNALS__`，桌面适配器一条也连不上，应用需要落到 wa-sqlite / OPFS 这类浏览器后端。

今天这件事只存在于 demo 里，且两个 demo 不对称：`apps/dev-rxdb-tauri/src/app/setup_rxdb.ts` 的
`selectLocalBackend(globalThis)` 按 `isTauriRuntime()` 二选一，把**适配器名与建库工厂打包返回**
（分开算会让 `provideRxDB` 注册的和 initializer 要连的对不上，报错却只说「适配器不存在」）；
`apps/dev-rxdb-electron` 则是 `provideRxDB(setup_rxdb_wa-sqlite)` 写死，桌面库另挂在
`DesktopDatabaseService` 上，浏览器里直接抛 `host_unavailable`。装了包的用户拿不到这段判定，
只能照抄 demo，抄错的方式还都一样。

**这不是给铁律「无 fallback 兜底」开口子，边界必须写死在实现里**：

- 允许的是**连接前**按运行时能力挑后端 —— 候选表由应用给出，判定发生在 `connect()` 之前。
- 禁止的是**失败后**改道：`resolveDesktopHostTransport()` 抛 `host_unavailable` 必须继续抛，
  不得 catch 后转投 OPFS。同一条界在 [US-209](./US-209-miniprogram-adapter.md) AC#2 上已经划过
  （随机数池耗尽也「任何情况下都不降级」到 `Math.random`）。

**回落不是「同一个库换个地方」，是另一个库。** OPFS 里的数据与桌面文件里的数据永不互通，
没有同步也没有迁移。由此派生的要求缺一条就是静默数据分叉：

| #      | 任务                                                                                                                                                                                           | 完成判据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E8 ✅  | 判定逻辑从内联 `? :` 里拆出来：**纯函数**选择器，输入是应用给的候选表（`{ adapter, create, isAvailable }` 之类），输出成对的名字 + 工厂；不内建候选，`isTauriRuntime()` 这类探针随各运行时包走 | 选择器**不依赖任何适配器包**（内建候选表会让它反向依赖全部适配器）；两个 demo 改用它，`dev-rxdb-electron` 补齐今天缺的那一半；探针可注入，单测不靠真实 `globalThis`。**已达成**：两个 demo 各有一份 `src/app/local-backend.ts`（`selectLocalBackend()` + `LocalBackendCandidate`），单测一律注入假 `runtime`，不碰真实 `globalThis`；两侧 `setup_rxdb.ts` 都只剩一张候选表，`app.config.ts` 的调用点共用同一次判定。Electron 侧连带把两个 RxDB 实例合并成一个（详见下方「Electron 半边补齐时改了什么」）。**判据变更**：原判据写的是「上移到共享层」并以「选择器所在包不依赖适配器包」验收，2026-08-18 判定不上移（理由见下方「为什么不做成公开 API」），该条降级为对函数本身的约束——它只 import `@aiao/rxdb` 的 `RxDBError` / `RxDBAdapterName`，适配器由候选表带入                                                                                                                                                                                                                |
| E9 ✅  | 后端身份可观测：选中结果暴露给应用（连接状态旁边就能读到「现在跑在哪个后端」），且候选表禁止复用同一个 `dbName`                                                                                | demo 已有的 `desktop_demo` / `test_6` 分名不是巧合，要变成选择器的**断言**：同名候选直接拒绝构造；页面上能看出当前后端，不靠猜。**已达成（断言那半）**：`dbName` 与 `adapter` 重复都由 `RxDBLocalBackendTableError` 在问探针**之前**拒掉。写这条时发现「分名不是巧合」只对 Electron 成立 —— `dev-rxdb-tauri` 的两个候选原本**都叫 `test_6`**，桌面那份因此改名 `desktop_demo`（与 Electron 对齐），README 6 处与 e2e 的 `DATABASE_FILE` 一并更新。**已达成（展示那半）**：首页那张卡的「当前后端 / 库名」两行直接读判定结果（`data-testid="rxdb-backend"` / `rxdb-db-name`），不是模板里另写一遍的字面量；`desktop-persistence.spec.ts` 断言它等于 `DESKTOP_ADAPTER_NAME`                                                                                                                                                                                                                                                                                                           |
| E10 ✅ | storage 插件后端跟随同一次判定，不独立探测                                                                                                                                                     | meta 落桌面 SQLite、文件落 OPFS 的组合在构造期即被拒 —— 正是 [US-505](../plugin/US-505-tauri-local-file-storage.md) AC#11 `adapter_mismatch` 禁的备份域撕裂，只是判定点从插件内移到选择器上，错误码沿用不新造。**已达成**：`.use(rxDBPluginStorage, …)` 写在**建库工厂模块内部** —— `setup_rxdb_desktop.ts` 装 `createDesktopStorageFilesystem()`，`setup_rxdb_wa-sqlite.ts` 吃插件默认的 OPFS。工厂模块是被选中之后才 `import()` 的，所以「storage 用哪个后端」根本没有第二个判定点可言，不是靠约定对齐。撕裂组合仍由 `adapter_mismatch` 兜底（`createDesktopStorageFilesystem` 的 TSDoc 写明），本条把它降为不可达路径而非替代它                                                                                                                                                                                                                                                                                                                                                  |
| E11 ✅ | 候选走动态 `import()`，桌面分支不进 web bundle                                                                                                                                                 | 今天 `setup_rxdb.ts` 是**静态** import 两条分支，浏览器预览的 bundle 里带着 Tauri transport；US-505 AC#10「Tauri 传输客户端代码不进浏览器 bundle」在包一级成立、在应用一级被绕开。改后需有产物断言，否则这条只是口头承诺。**阻塞已解除**：三端 provider 统一收 `RxDBSource = RxDB \| Promise<RxDB> \| (() => RxDB \| Promise<RxDB>)`，`await import()` 可以直接交给 `provideRxDB` / `<RxDBProvider db>`，不必再自建异步 initializer + token。**已达成**：两个 demo 的 `create` 都是 `async () => (await import('./setup_rxdb_*')).default()`，产物断言落成 `scripts/audit/desktop-lazy-backend.mjs`（两个 demo 由一张 `DEMOS` 表参数化，自身 11 条单测），经各 demo 的 `audit-lazy-backend` target 进 CI 的 `extras` job。实测 electron 首屏 9 chunk / 惰性 39，tauri 首屏 4 / 惰性 41，9 个标记全在惰性侧。**「口头承诺」那句是对的**：仅有源码门禁时，`setup_rxdb.ts` 只 import 一个字符串常量就把整个桌面传输客户端带进了 `main.js`——详见下方「barrel 会把实现一起带进主 chunk」 |

#### 为什么不做成公开 API

原本挂着一条「未定」：选择器做成公开 API，还是只做 `website/docs` 的配方 + demo 的参考实现。
选择器一度确实进了 `@aiao/rxdb` 的公开导出，**2026-08-18 判定撤回**，落点是
`apps/dev-rxdb-tauri/src/app/local-backend.ts`：

- **换不到复用。** 判定本体二十来行，且全部输入（候选表、探针、建库工厂）本来就只能由应用
  提供 —— 框架能替用户做的只有那个 `for` 循环。抄一个文件比学一个 API 便宜。
- **多一个要长期兼容的公开导出。** 进了 api-baseline 就受 [versioning-policy](../../versioning-policy.md)
  约束，往后每次想改签名都是破坏性变更；换来的是二十行代码的复用。
- **三框架对称铁律会被它连累。** 公开 API 意味着 Angular / React / Vue 三端都要有对应形态，
  `provideRxDB` 那一层各写一遍 —— 为一个纯函数付三份接线成本。

撤回不影响 E8 的实质：「纯函数 + 应用注入候选 + 名字与工厂成对返回」这三条约束在应用代码里
一样成立，10 条单测原样跟着搬。**三框架对称铁律因此没有被本条触发** —— 它由
`provideRxDB` / `RxDBProvider` 的契约统一单独承担，与本条无关。

#### Electron 半边补齐时改了什么

`dev-rxdb-tauri` 是**一个** RxDB 按运行时二选一；`dev-rxdb-electron` 原本是**两个** RxDB 并存 ——
主库写死 wa-sqlite，桌面库另挂在 `DesktopDatabaseService` 上，且它是**无条件构造**的，
浏览器预览里必然抛 `host_unavailable`。把主库也交给选择器之后，Electron 窗口里选中的就是
`desktop_demo`，而 `DesktopDatabaseService` 开的还是 `desktop_demo` —— 同一个文件两个会话，
候选表刚立的「一个逻辑名对一个库」当场破功。

也就是说 E8 在 Electron 侧不是接线改动，它**要求那两张卡片合并成一张**。两卡并存曾是
`desktop-database.service.ts` 里写明的教学意图（"两张卡片摆在一起才看得出 US-207 换掉的
到底是什么"），**2026-08-18 判定合并**：那句教学意图由 E9 的「当前后端」一行接手 ——
一张卡上写着 `sqlite-electron` 还是 `wa-sqlite`，比两张卡并排更直接地回答同一个问题，
而且不必为此多开一个必然失败的 RxDB 实例。

落地范围：`DesktopDatabaseService` 删除，`LocalDatabaseService` 取而代之（读的是
`selectLocalBackend()` 的结果）；`home.page.ts` / `home.page.html` 合并成一张
`data-testid="rxdb-status-card"`，testid 从 `desktop-*` 统一改成 `rxdb-*`；
`storage.page.ts` 改注入唯一那个实例（它此前只在 Electron 窗口里有意义，`nx serve`
的浏览器预览一进来就炸）；`dev-rxdb-electron-e2e` 的 `desktop-persistence.spec.ts` +
`storage-persistence.spec.ts` 跟着改断言。这两个 e2e 需要真实 Electron 产物才跑得起来
（`dependsOn: ["dev-rxdb-electron:electron-package-dir"]`），**2026-08-18 对 electron-builder
产物跑通 12/12**——其中「本地数据库完成连接，且跑在桌面后端上」与「重启后计数递增」正是
合并成单实例后仍要成立的那两条。

#### barrel 会把实现一起带进主 chunk

E11 的产物断言不是形式主义，它当场抓到过一次**源码门禁全绿而产物是错的**：

`desktop-environment.ts`（运行时探针）与 `setup_rxdb.ts`（候选表）都必须待在主 chunk ——
前者要在建库之前判断运行时，后者要在建库之前报出后端身份。它们各自只从适配器包 import 了
**一个字符串常量**（`DESKTOP_HOST_TRANSPORT_KEY` / `ELECTRON_ADAPTER_NAME`），而这足以把
适配器包 barrel 转出的实现整个拽进 `main.js` —— 实测多出一个 6.7KB 的首屏 chunk，
里面装着 `RxDBAdapterDesktopError` 与四个错误码。深子路径 import 也躲不掉：
`DESKTOP_HOST_TRANSPORT_KEY` 与 `DesktopSqliteClient` 同住 `desktop-sqlite-client.ts`。
包上的 `sideEffects: false` 拦不住这件事，workspace 里走 tsconfig paths 读**源码**更是让
barrel 成为实际的打包边界。

对策是两处都**抄一份字面量**，代价由单测还清：`desktop-environment.spec.ts` 用包里的真常量
去构造探针的输入（断言的是「preload 按包里的键注入，探针就能探到」，比比较两个字符串更贴近
真实用法），`setup_rxdb.spec.ts` 断言适配器名与包里的常量相等。单测走源码、不进产物，
这两个 import 不花 bundle 的钱，而包里改了名字会当场变红。两处还各配一条「源码里不出现这个
包名」的静态门禁 —— 少了它，把字面量改回 import 只会让相等性断言更加成立，而 bundle 悄悄胖回去。

> 顺带记一笔：`rxdb-adapter-sqlite-core` / `rxdb-plugin-storage` / `utils` 三个包的
> `sideEffects` 声明**已补上**（`"sideEffects": false`，逐包确认过没有导入期副作用）。
> 本条没有依赖它（字面量方案与该声明无关），它是同一类问题的另一半，
> 收口记录见 [status-overview.md](../../status-overview.md) 与 [roadmap.md 零散收尾项](../../roadmap.md)。

## 技术笔记

### 运行时边界

- renderer 中的 RxDB adapter 不得直接接触 `fs`、Electron `ipcRenderer` 或任意 Tauri `invoke`；桌面 host 通过窄接口实现 `SqliteClientLike` 契约。该契约的抽象方式需要同时能承载 US-208 的 PGlite 客户端，避免 US-208 推翻本故事的 host protocol。
- Electron 主进程只接受来自当前主 frame 的请求，校验数据库标识、SQL 参数、事务 ID 和请求大小；preload 只暴露本故事需要的方法，不暴露原始 `ipcRenderer`。
- Tauri 半边的路径解析、权限面与事务门禁见 [US-210](./US-210-tauri-sqlite-local-database.md)，本故事不重做。

### 为什么不承诺 Tauri PGlite

- PGlite 的 Node filesystem backend 接受的是 PostgreSQL data directory 路径；一个数据库目录包含多个文件，配置的联合形状不能把它描述成单文件。
- Tauri 没有 Node 主进程。PGlite `BaseFilesystem` 的 `open/read/write/fstat` 等方法是同步契约，不能直接用异步 Tauri command 逐次代理。
- Electron PGlite 的可行性、IPC 事务 host 与类型保真见 [US-208](./US-208-electron-pglite-data-directory.md)，本故事不做承诺。

### 兼容性与安全

- 保持现有 `db.connect('sqlite')`、`db.connect('pglite')` 和浏览器存储默认行为不变；桌面文件存储必须通过新配置显式启用。
- 桌面配置使用可辨识联合，非法 runtime/engine 组合在类型层拒绝，并在 JavaScript 运行时再次校验。
- 不增加 memory、OPFS 或 IndexedDB fallback。文件连接失败必须暴露真实错误，避免用户误以为数据已写入目标文件。
- 新增公开 API 必须包含 TSDoc、更新 `requirements/api-baseline/`，并通过严格类型检查、ESLint 零警告与对应包覆盖率门禁。

### AC#9 为什么值得单列一条

`DESKTOP_HOST_PROTOCOL_VERSION` 是 host 与 renderer 之间的握手版本号。两者是**两份分开构建、
分开分发的代码**：host 跟着 Electron 主进程走（asar 增量更新），renderer 是网页 bundle
（有自己的缓存与 service worker）。两边不同步是常态，不是假想场景。

代码与用例一直都在（见上表 AC#9 行），缺的只是**没有任何一条 AC 认领它**。这不是文档洁癖——
「有实现有用例但没有 AC」的实际后果是**谁删掉这段校验都不算违反验收标准**：
下一个嫌它碍事的人删掉后，测试红了改测试就行，评审时也挑不出违反了哪条。
补成 AC 之后，删它就是删验收标准，得走改 AC 的流程。

失败形态本身也值得单列：版本不匹配若不拦，两端会按不同协议解释同一份载荷——
字段错位、类型误读，比直接报错难查一个量级。所以 AC 里写死「不建库、不按旧协议降级解释」，
而不只是「报错」：降级解释是这里唯一有诱惑力的错误做法。

**「不建库」半条才真正兑现。** 在那之前版本核对读的是 `open` 应答，而 `open`
已经建库、开连接、登记会话了——`parseOpenResultOrClose` 能补发 `close` 收回会话，却收不回
那个已经落在磁盘上的空库文件。修法是给协议加一条无副作用的 `handshake` 请求（无参数、
不碰会话表、不碰路径解析），排在 `open` 之前协商版本。这条请求**没有**抬高
`DESKTOP_HOST_PROTOCOL_VERSION`：它对 host 是纯增量的，老 renderer 直接发 `open` 行为一字不变；
而老到不认识这个 kind 的 host 会回 `protocol_violation`，那条路径同样碰不到文件系统。
客户端**不做**「握手不认识就退回去直接 open」的兜底——版本号存在的意义正是不许降级。
两端实现与用例见 [US-210 AC#10 一节](./US-210-tauri-sqlite-local-database.md#ac10-的三半各自是怎么关掉的)。

[US-210](./US-210-tauri-sqlite-local-database.md) AC#10 与
[US-208](./US-208-electron-pglite-data-directory.md) AC#11 是它在另两条路径上的对偶。
校验代码在共享层，三条 AC 因此共用同一份实现，但各自的 host 是独立实现的，
不能只在一处验。

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/` — 抽取可由桌面 host 实现的客户端与事务契约
- `packages/rxdb-adapter-sqlite-core/src/desktop/` — 桌面配置、renderer client、host protocol 与错误类型
  （E1 从原 `rxdb-adapter-desktop` 下沉至此，以 `./desktop-host` 子路径暴露；US-208 与 US-210 复用同一层）
- `packages/rxdb-adapter-electron/` — Electron 专有实现：`node:sqlite` 引擎、SQL / 文件宿主与 `./host` 特权入口
- `apps/dev-rxdb-electron/src-electron/` — SQLite 主进程 host、路径解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — Electron renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包 Electron 应用的真实文件持久化测试；AC#8 的三平台矩阵靠
  workflow 兑现，spec 一行没改（`_electron.launch()` 与平台无关）。这批 spec **不需要装
  Playwright 浏览器**：`nxE2EPreset` 没给 `projects`，每条用例都走 `_electron.launch()`，
  `Page` 只作类型导入——所以 workflow 里没有 `playwright-chromium` 那一步，×3 平台各省一次下载
- `apps/dev-rxdb-electron/tools/copy-app-manifest.mjs` — 两个打包 target 里的 `cp package.json`
  换成它。nx `run-commands` 在 Windows 上走 `cmd.exe`，**`cp` 根本不存在**；这条命令此前从没在
  Windows 上跑过（`ci-windows.yml` 不跑这两个 target），AC#8 的矩阵是第一次
- `.github/workflows/release-desktop.yml` — **阶段 2 新增**，release 触发的三平台 workflow（AC#8 三平台矩阵）；现有 `main.yml` / `pr.yml` 全是 `ubuntu-latest`，一字未改
- `.github/actions/xvfb/action.yml` — **阶段 2 新增**，Linux 上的常驻 Xvfb（Electron 与 Tauri 都要）
- `scripts/audit/desktop-adapter-consumer.mjs` — **阶段 2 恢复**，只在上述 workflow 里跑
- `requirements/api-baseline/` — 新增公开桌面 adapter API 基线
- `packages/rxdb-adapter-electron/src/__tests__/encrypted-*.spec.ts` — AC#2 的五套 `@aiao/rxdb-test/encrypted` 共享套件接线

Tauri 侧的实现文件（`apps/dev-rxdb-tauri/`、`apps/dev-rxdb-tauri-e2e/`）随 AC#2 / AC#3
一并迁至 [US-210](./US-210-tauri-sqlite-local-database.md)，本故事不再涉及。

## References

- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 从本故事拆出，复用本故事的桌面 host 契约
- [US-210 Tauri 连接应用作用域 SQLite 文件](./US-210-tauri-sqlite-local-database.md) — 桌面本地 SQLite 的 Tauri 半边，复用本故事的桌面 host 契约
- [US-201 SQLite 适配器](US-201-sqlite-adapter.md)
- [US-202 PGlite 适配器](US-202-pglite-adapter.md)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
