---
id: US-207
title: Electron 连接本地 SQLite 文件
status: In Progress
priority: High
epic: epic-004-future-features
created: 2026-08-08
updated: 2026-08-17
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

### 当前证据

`packages/rxdb-adapter-desktop/src/__tests__/setup.spec.ts` 把 `@aiao/rxdb-adapter-sqlite-core/testing`
的 21 个共享套件原样跑在桌面工厂上（只排除 `createSqliteClientSuite`，它校验的是 wasm 后端的
worker 选项组合，桌面客户端不接受任何 worker 选项）。AC#1 / #3 / #4 / #5 / #6 / #7 另有直接用例：

| AC  | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts` 「重启后计数递增，库文件落在应用数据目录内」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | `desktop-sqlite-host.spec.ts` 「reports a logical location that leaks no filesystem path」；上面那条 e2e 顺带断言 preload 暴露面恰为 `request` / `subscribe`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | `node-sqlite-engine.spec.ts` 「reports open_failed without leaving an empty database behind」/「database_corrupted」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | `desktop-sqlite-host.spec.ts` 的 `describe('busy retry')` 三条用例（等待持锁方提交 / 预算耗尽报 `database_busy` / 事务中途不重发）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | `encrypted-{crud,tamper,bigint-binary,change-log,lifecycle}.spec.ts` —— `@aiao/rxdb-test/encrypted` 的五套共享套件跑在桌面工厂上                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 6   | `desktop-sqlite-host.spec.ts` 「preserves unknown business tables that already live in the file」                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | `node-sqlite-engine.spec.ts` 「flushes the pending batch synchronously on close」/「persists committed data across a reopen」/「releases the file handle so the database can be renamed」                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | `.github/workflows/release-desktop.yml` 的 `electron-smoke`：ubuntu / macOS / windows 三平台矩阵（`fail-fast: false`）跑 `dev-rxdb-electron-e2e:e2e`，该 target 经 `dependsOn` 先出 `electron-package-dir` 产物；数据目录是 `mkdtemp` 出来的真实临时目录                                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | `desktop-sqlite-client.ts` 的 `negotiateProtocolVersion` 在**任何有副作用的请求之前**发一条无参数的 `handshake`，用 `parseDesktopHostHandshakeResult` 比对 `DESKTOP_HOST_PROTOCOL_VERSION`，不等即抛 `protocol_violation`（`open` 应答上那道 `parseDesktopHostOpenResult` 保留为第二道防线，也是老 renderer 唯一的检查点）；`desktop-sqlite-client.spec.ts` 三条用例分别撞版本不符、握手排序（`kinds` 恰为 `['handshake', 'open']`）与「老到不认识握手的 host」，每条都断言 `openSessionCount === 0` 且工作区目录为空——「不建库」由此是断言而不是说法；`desktop-sqlite-host.spec.ts` 从 host 侧断言握手既不开会话也不 consult `resolveDatabasePath` |

AC#1 的断言形态是**跨进程**的累计启动次数（1 → 2），不是「写一条读一条」——
后者在单次启动内就能通过，哪怕数据只活在内存里也一样绿。整套 e2e 在真实 `--dir` 产物上
11/11 通过（这条持久化断言 1 条、启动 smoke 8 条、[US-504](../plugin/US-504-electron-local-file-storage.md)
的文件存储 2 条）。

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

**AC#2 的加密保留项已关闭。** 此前的缺口是「加密字段解锁」没有用例 —— 加密是
`@aiao/rxdb-adapter-encrypted` 的包裹层，与桌面 adapter 的组合从未被组合验证过。
现由 `desktopEncryptedAdapterFactory` 驱动 `@aiao/rxdb-test/encrypted` 的五套共享套件
（crud + queryValidation / tamper / bigint-binary / change-log / lifecycle），
点名的「解锁」正是 lifecycle 那一套。`pnpm nx test rxdb-adapter-desktop` 为
**931 passed / 18 files / 0 skipped**（接线加密套件当时是 786 / 15，接线前 734）。

> 这个条数是**快照，不是判据**。判据是「0 skipped 且不低于上次基线」——
> 把具体数字写进完成判据，过期后要么假红、要么被人默默改小对齐，两种都比不写更糟。

接线过程中有两处值得记下来：

- **落盘扫描必须把 `-wal` 一起读进去。** 加密套件靠扫描物理字节确认明文没有泄漏，
  而桌面引擎按持久化档位跑 `journal_mode=WAL`，刚写入的行在 checkpoint 之前只存在于
  `-wal` 里。只读主库文件的话，扫描会在一段**还没有业务数据**的字节上通过 —— 绿得毫无意义。
  `readDesktopDatabaseFile` 因此把主库与 `-wal` 拼起来读，而不是先发一条 checkpoint PRAGMA：
  后者等于让被测对象参与准备自己的检材，且覆盖面严格更小。
- **第一次跑出的 25 条失败不是加密行为的问题，是解析路径的问题。** 失败形态是
  message 全对、`name` 全错且是单字母（`o` / `r`）。根因是本包的 vitest 配置缺
  `resolve.tsconfigPaths`（兄弟包 wa-sqlite / pglite 都有），于是
  `@aiao/rxdb-adapter-sqlite-core` 走 node_modules 软链读产物，再由产物读
  `@aiao/rxdb-adapter-encrypted/dist` —— 而那是压缩过的。补上配置后全绿。
  但这暴露的是一个**真缺陷**，见下。

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

### 接线 AC#2 时顺带发现的发布缺陷：错误 `name` 在产物里退化

上面那 25 条假失败换个角度看是真信号：`EncryptedError` 基类用 `new.target.name` 写 `name`，
读的是构造函数身份，minify 一过就变成 `"n"` / `"r"`。而 `name` 是被
`@aiao/rxdb-test/encrypted` 的 `error-contract.ts` 当作**跨包 class 身份契约**用的公开 API。
也就是说装了 npm 包的用户写 `err.name === 'EncryptedLockedError'` 恒为假。
`@aiao/rxdb-plugin-search` 的 `SearchError` 有同一个写法，六个 `@public` 子类全中。

源码单测对这类退化天生免疫 —— 源码不会被 mangle，`errors.spec.ts` 里那五条
`expect(err.name).toBe(...)` 一直是绿的。所以修复配的是**产物层**的用例：

| 项目                                                                         | 修复                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-adapter-encrypted`：5 个错误类 `name` 退化                       | 基类构造器改收字面量 `name` 参数，使 `name` 不再依赖 `constructor.name`（后者会被 minifier 改写） |
| `@aiao/rxdb-plugin-search`：`SearchError` 及 5 个 `@public` 子类 `name` 退化 | 同样改字面量（`SearchError(message, name)`），已在构建产物上实测 name 正确                        |

### 发布前需人工确认的三条性质

`@aiao/rxdb-adapter-desktop` 是本仓库唯一的**双入口**包（`.` 给 renderer、`./host` 给特权侧），
以下三条性质**在 workspace 内测里结构性地测不到**——单测走 tsconfig paths 读源码，
永远不经过打包：

1. 两个入口在 NodeNext 与 Bundler 两种解析模式下都能编译；
2. **renderer 入口的产物里不出现 `node:sqlite`** —— `src/index.ts` 的 TSDoc 把「可以安全地打进
   renderer bundle」写成了承诺，而真串味只有产物里看得见，且后果是安全退化而非构建报错；
3. host 入口真能开库、建表、写入、读回、关闭，应答一律经 renderer 入口导出的
   `assertDesktopHostResponse` 解包 —— 于是这条往返同时证明两个入口的协议是配套的。

> **自动门禁已于 2026-08-17 恢复。** 这三条曾由 `scripts/audit/desktop-adapter-consumer.mjs`（254 行）
> 与 `consumer` target 在真 tarball 上守着，随发布流程改为手工执行一并删除（删除提交 `0d7f88e`）；
> 中间这段时间只能手工 `pnpm pack` 装进临时项目自行确认，实际上等于没人确认。

**已恢复（阶段 2）：脚本原样取回，只在发布时跑。** `git show 0d7f88e^:scripts/audit/desktop-adapter-consumer.mjs`
取回后逐条核对——它引用的全部导出名今天都还在，`packageDirectories`（utils / rxdb /
rxdb-adapter-encrypted / rxdb-adapter-sqlite-core / rxdb-adapter-desktop）也仍与今天的依赖闭包一致，
所以是「取回 + 核对 + 挂调用」，一行没重写。现由
[`.github/workflows/release-desktop.yml`](../../../.github/workflows/release-desktop.yml) 的
`adapter-consumer` job 执行。

它**不进 PR 门禁**：要 `pnpm pack` 再装进临时项目，耗时与 PR 上每次都跑的收益不成比例，
而这三条性质只在包的 `exports`／入口切分／host 协议变动时才可能退化——那是发布时必然经过的路口。
挂在「三平台打包 CI」那条 release workflow 上，与 AC#8 共用一次触发。

`adapter-consumer` 是那条 workflow 里唯一**不上矩阵**的 job：`pnpm pack` → 临时消费者 →
双模式 typecheck → host 真开库往返，没有一步与 OS 有关，×3 只是把同一件事做三遍。

脚本用 `process.cwd()` 当 workspace 根——**必须从仓库根目录调用**。这不是疏忽，是它当初就有的
形状；workflow 里的 `run:` 默认就在仓库根，本地手跑时注意别先 `cd` 进包目录。

阶段 3 拆包后这三条要在**两个**包上各跑一遍（E7），脚本届时参数化包名，不复制第二份。

### 发布后的真 registry 复验

上面三条性质除了在**本地 tarball** 上验过，也从真 registry 装了一次
`@aiao/rxdb-adapter-desktop@0.0.25`（`pnpm install --config.prefer-online=true`）重跑同一组断言，
验的是用户真正会装到的那个包：

- 双入口（`.` + `./host`）在 NodeNext 与 Bundler 下均通过 typecheck，且 `skipLibCheck: false`；
- 两端 `DESKTOP_HOST_PROTOCOL_VERSION` 一致；
- renderer 入口产物不含 `node:sqlite`；
- host 真开库往返：open → CREATE → INSERT → SELECT `ok` → close，收尾 `openSessionCount === 0`；
- 路径穿越被拒；
- 39 个安装文件、零测试泄漏；`workspace:*` 已替换成 `0.0.25`；`repository.url` 正确。

发布新 scoped 包时的一个已知假警报：发布成功后 `npm view @aiao/rxdb-adapter-desktop` 可能查不到，
看着像没发出去。那是 **CDN packument 传播延迟**——
run log 里的 `Published to https://registry.npmjs.org/` 才是权威，`npm view` 不是。

### 未关闭项

> 多窗口写并发只由 SQLite 自身的锁与 host 的异步退避重试承担。原计划叠加的
> **跨 realm writer lease 与迁移 epoch fencing 已于 2026-08-16 取消**（连同其代码与 US-304 一并删除），
> 本故事不再承诺「第二个 writer 在连接时被拒」这类跨 realm 排他语义。
>
> ~~AC#8 需要三平台打包 CI 矩阵。本地只跑过 macOS（`mac-arm64`）。~~
> 2026-08-17 关闭：矩阵已随 `release-desktop.yml` 落地，见下节。本地仍只跑得动 macOS，
> 另两个平台的首轮结果要等 workflow 真跑一次——这是**下节承诺的路子**，不是遗留缺口。

### 三平台打包 CI（阶段 2）

> **已落地（2026-08-17）：[`.github/workflows/release-desktop.yml`](../../../.github/workflows/release-desktop.yml)。**
> 下面这段保留的是决策过程——「为什么不进 PR 门禁」「为什么三件事共用一次触发」会在
> 有人嫌发布反馈太晚时被重新翻出来。

**AC#8 从未被技术前提挡住，只是没人加 runner。** 现有 e2e 用 Playwright 的
`_electron.launch()` 驱动打包产物（`apps/dev-rxdb-electron-e2e/src/*.spec.ts`），走的是 **CDP**，
不是 WebDriver——Electron 侧不存在 [US-210](./US-210-tauri-sqlite-local-database.md) 那个
「macOS 没有 WKWebView WebDriver」的问题。同一份 spec 换个 runner 就能跑。

今天 `.github/workflows/` 里**一个 macOS runner 都没有**：`main.yml`（push main）与
`pr.yml`（PR）全是 `ubuntu-latest`，只有 `ci-windows.yml` 是 `windows-latest` 且为
`workflow_dispatch` 手动触发。所以缺的是一条新 workflow，不是新能力。

`ci-windows.yml` 里「Windows runner 按 2 倍计费」那句注释是**本仓库不适用的**：
本仓库是 public，GitHub 标准 runner 对公开仓库不计费。它当初写手动触发的成本理由在这里不成立，
真正的理由只剩耗时（打包 + Playwright 安装）——那正好对应「只在发布时跑」。

**方案：新增一条 release 触发的 workflow**，`matrix: [ubuntu-latest, windows-latest, macos-latest]`，
一次触发同时兑现三件事：

| 承担                                                   | 内容                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| 本故事 AC#8                                            | `dev-rxdb-electron-e2e` 在三平台打包产物上跑持久化 smoke     |
| 本故事「发布前需人工确认的三条性质」                   | 恢复的 `desktop-adapter-consumer.mjs` 在真 tarball 上跑      |
| [US-210](./US-210-tauri-sqlite-local-database.md) AC#9 | Tauri 打包产物的三平台持久化 smoke（驱动方式不同，见该故事） |

三件事共用一次触发而不是各起一条：它们要的前置是同一个（三平台 runner + 打包产物），
拆成三条 workflow 会把同一份 `tauri build` / `electron-builder` 跑三遍。

**不进 PR 门禁**，与本节上文「发布前需人工确认的三条性质」同理。代价要写明白：
三平台打包的回归**发现得晚**——引入它的 PR 已经合进 main，红在发布那一刻。
这是拿「PR 反馈速度」换来的，接受它就要接受发布前偶尔需要回退一个已合入的改动。

#### 落地时定形的几件事

**一次触发，但三个 job，不合并。** 上表的三件事共用一次 `release[published]`，job 却是分开的：
Tauri 要 Rust 工具链 + WebKitGTK 开发库，Electron 要下 ~100MB 发行包，两套工具链不重叠。
合成一个 job，每台 runner 都得付两份安装税，而且墙钟从 `max` 变成 `sum`。

**Tauri 侧走 `tauri build --ci --no-bundle`。** 前端产物照样编进二进制，但省掉 macOS 签名、
Windows 安装器，以及 Linux AppImage 构建期下载 `linuxdeploy` + 需要 FUSE 这个 Tauri CI 最经典的
flaky 源。**代价**：这条路**不验证安装包本身**（Info.plist / MSI / NSIS / AppImage）。
[US-210](./US-210-tauri-sqlite-local-database.md) AC#9 的文本要的是「启动产物、写入、退出、
再次启动」，release 二进制满足；但「打包 CI 是绿的」不等于「安装包是好的」，别读串。

**不缓存 `src-tauri/target/`。** 照抄 `ci-template.yml` 的 key 会与 PR 门禁的 rust job 撞 key
但 profile 不同（debug vs release），白读几百 MB 又不会 save；换独立 key 则 3 OS × ~1GB 会啃掉
10GB 配额，而 ci-template 的注释里已经记过一次「9.43 GiB / LRU 开始驱逐 playwright 与 pnpm store」
的事故。**发布是稀有事件，PR 门禁每天几十次**，不该让前者挤后者。冷编译由 `timeout-minutes: 60` 兜住。

**`gate` job 把 `skipped` 也算失败**，与 `ci-template.yml` 的 gate 不同。那边有条件 job，
skipped 是正常状态；这条 workflow 里三个 job 全都无条件跑，skipped 只可能意味着接线坏了。

**新增 `.github/actions/xvfb/action.yml`**（Electron 与 Tauri 在 Linux 上都要显示后端），
内容是 `ci-template.yml` 那段常驻 Xvfb 的原样抽出。**本轮没有回头去改 ci-template 换用它**：
那是一处纯重构，牵进 PR 门禁的关键路径不值当，留作后续单独的 PR。

## 交付阶段

本故事的体量已超出 INVEST「Small」：9 条 AC 之外，文末两节各挂着一整套任务。
**不拆成新故事**（拆了要重建交叉引用、重分 epic、重写 `inherited_acs`，而这几节的上下文
恰恰全在本文里），改为在故事内划阶段。每个阶段有独立的完成判据，**逐阶段推进、逐阶段验收**。

| 阶段 | 内容                                   | 完成判据                                                                                                                      | 状态      |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1    | 核心能力：AC#1～#7、AC#9               | 8 条 AC 全绿，共享套件 0 skipped                                                                                              | ✅ 已交付 |
| 2    | 打包与发布门禁：AC#8 +「三条发布性质」 | release 触发的三平台 workflow 绿（见「三平台打包 CI」）。workflow 与审计脚本已落地，本机 macOS 全绿，三平台待首轮触发确认     | ✅ 已交付 |
| 3    | 包边界重整：E1～E7                     | 见各任务判据；与 [US-210 T1～T7](./US-210-tauri-sqlite-local-database.md#tauri-包化) 同批做，两侧共用一次 `ADAPTER_NAME` 改名 | ⬜ 未开始 |
| 4    | Web 回落：E8～E11                      | 见各任务判据；「选择器是否公开 API」在本阶段 plan 时定                                                                        | ⬜ 未开始 |

**分阶段不等于降低完成判据**：本故事只有在四个阶段都完成后才标 `Done`。
`status-overview.md` 的「进行中」记录当前停在哪个阶段，读到「进行中」的人由此知道
欠的是 AC 还是后续阶段，不必翻回本文猜。

阶段间的依赖是真的，不是排序偏好：

- **阶段 3 必须在阶段 2 之后**。阶段 2 要在打包产物上验「renderer 入口不含 `node:sqlite`」，
  而阶段 3 正是把入口切开重排——先立门禁再动结构，动坏了当场红；反过来则是拆完才发现串味，
  已无从判断是拆坏的还是本来就坏的。
- **阶段 4 必须在阶段 3 之后**。E8 的选择器要「不依赖任何适配器包」，而今天只有
  `@aiao/rxdb-adapter-desktop` 一个包，选择器无处可放；E1 把共享层下沉之后才有位置。

## 包边界重整

`@aiao/rxdb-adapter-desktop` 一个包同时装了三层东西：跨运行时的协议与 renderer client
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

| 处                                                                              | 改动                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DesktopOptions.runtime` 与 `DesktopRuntime`                                    | **删除**。名字已经表达了运行时，再留一个选项就是同一件事的两个真相来源    |
| `SupportedDesktopStorage<TRuntime>`（`desktop-storage.ts:51`）                  | 泛型失去输入，退化成两个具体类型，各归各包                                |
| `SUPPORTED_RUNTIMES`（`desktop-storage.ts:141`）与连接前的能力矩阵校验          | 删除。「Tauri 永不支持 PGlite」不再需要运行时校验——那个组合没有对应的名字 |
| [US-505](../plugin/US-505-tauri-local-file-storage.md) AC#11 `adapter_mismatch` | 判别依据从 `runtime` 改为适配器名                                         |
| `apps/dev-rxdb-tauri/src/app/setup_rxdb.ts` 的运行时选路                        | 返回的适配器名改为 `sqlite-tauri`；这段判定本身在阶段 4 的 E8 上移        |
| [capability-matrix](../../capability-matrix.md) 的 desktop 行                   | 拆成三行                                                                  |
| `website/docs/migration/`                                                       | 旧 `desktop` 名的迁移映射，随 E6 的废弃周期一并写                         |

**这是破坏性改动，且必须赶在有真实用户之前做**——`@aiao/rxdb-adapter-desktop@0.0.25` 已在
registry 上。改名成本今天是「改 21 个引用点」，拖下去就变成「改用户代码」。

### 任务

| #   | 任务                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 完成判据                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | 共享层下沉：`desktop-host-protocol.ts` / `desktop-sqlite-client.ts` / `desktop-storage.ts` / `desktop-error.ts` 与 `desktop-adapter.interface.ts` 的跨运行时部分迁入 `packages/rxdb-adapter-sqlite-core`，以**子路径入口**暴露                                                                                                                                                                                                                                  | 不进主入口（wa-sqlite / sqlite / sqlite-wasm / pglite / miniprogram 五个下游包吃的是主入口，协议层对它们是净负重）；`requirements/api-baseline/rxdb-adapter-sqlite-core.json` diff 为空；新子路径同步 `scripts/audit/api-surface.mjs` 的 `KNOWN_UNCOVERED_SUBPATHS`（含其「10 个包共 15 个入口」的计数注释） |
| E2  | `packages/rxdb-adapter-desktop` → `packages/rxdb-adapter-electron`，包名 `@aiao/rxdb-adapter-electron`；只留 Electron 专有实现与 `./host` 入口，`tauri-host-transport.ts` 与 `desktop-json-codec.ts` 移出（US-210 T3）                                                                                                                                                                                                                                          | 包内 `grep -ri tauri` 零命中；`public-api.spec.ts` 的「keeps every Node builtin behind the host entry」import 图断言在新包内继续绿；`.` 与 `./host` 双入口保留                                                                                                                                               |
| E3  | 执行 `ADAPTER_NAME` 分裂（决策已落定，见上）：`'desktop'` → `'sqlite-electron'` / `'sqlite-tauri'`，`RxDBAdapterDesktop` / `DESKTOP_*` / `RxDBAdapterDesktopError` 随包名改，删除 `runtime` 选项与 `DesktopRuntime`                                                                                                                                                                                                                                             | 上表七处连带改动全部同步；`grep -rn "runtime: 'electron'\|runtime: 'tauri'" --exclude-dir=node_modules` 零命中；`capability-matrix.md` 的 desktop 行拆成三行（含 US-208 的 `pglite-electron`）                                                                                                               |
| E4  | api-baseline 拆分：`rxdb-adapter-desktop.json` 删除，其导出按运行时归属拆入新增的 `rxdb-adapter-electron.json` / `rxdb-adapter-tauri.json`                                                                                                                                                                                                                                                                                                                      | `pnpm nx run-many -t build` 后 `node scripts/audit/api-surface.mjs --check` 绿；拆分前后**导出条目总数不变**（拆包不是 API 变更；写本条时 `rxdb-adapter-desktop.json` 为 48 项，以拆分当天实测为准）                                                                                                         |
| E5  | 引用点更新：`tsconfig.base.json` 两条 paths、`rxdb-plugin-storage`（`package.json` / `vite.config.mts` external / `src/desktop.ts` / 4 个 spec）、`dev-rxdb-electron`、`dev-rxdb-tauri`、`README.md` 目录树、`scripts/README.md`、`capability-matrix.md`、[US-601](../tooling/US-601-subpath-api-surface-baseline.md) 子路径表、[US-904](../future/US-904-devtools-native-storage-contract.md) / [US-905](../future/US-905-tauri-native-devtools.md) 实现文件表 | `grep -rn "@aiao/rxdb-adapter-desktop" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=out-tsc` 零命中；`rxdb-plugin-storage` 的 `./desktop` 入口改指共享层后**不再依赖任何运行时包**，其对 `/host` 的依赖只剩测试用途                                                                           |
| E6  | 发布迁移：`npm deprecate @aiao/rxdb-adapter-desktop` 指向新包名，改名映射写进 `website/docs/migration/`                                                                                                                                                                                                                                                                                                                                                         | 按 [versioning-policy](../../versioning-policy.md) 第 3 节走废弃周期；两个新包在 Nx fixed release group 下与其余 `@aiao/*` 同步版本号                                                                                                                                                                        |
| E7  | 「发布前需人工确认的三条性质」现在要在**两个**包上各跑一遍                                                                                                                                                                                                                                                                                                                                                                                                      | 双入口在 NodeNext / Bundler 下均 typecheck、renderer 入口产物不含 `node:sqlite`（Tauri 包对应「不含任何 Node builtin」）、host 入口真开库往返；由阶段 2 恢复的 `desktop-adapter-consumer.mjs` 承担，此处只需参数化包名，不复制第二份脚本                                                                     |

### Web 回落：同一份代码跑三端

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

| #   | 任务                                                                                                                                                                                            | 完成判据                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E8  | 判定逻辑从 demo 上移：共享层提供**纯函数**选择器，输入是应用给的候选表（`{ adapter, create, isAvailable }` 之类），输出成对的名字 + 工厂；不内建候选，`isTauriRuntime()` 这类探针随各运行时包走 | 选择器所在包**不依赖任何适配器包**（内建候选表会让它反向依赖全部适配器）；两个 demo 改用它，`dev-rxdb-electron` 补齐今天缺的那一半；探针可注入，单测不靠真实 `globalThis`                                                |
| E9  | 后端身份可观测：选中结果暴露给应用（连接状态旁边就能读到「现在跑在哪个后端」），且候选表禁止复用同一个 `dbName`                                                                                 | demo 已有的 `desktop_demo` / `test_6` 分名不是巧合，要变成选择器的**断言**：同名候选直接拒绝构造；页面上能看出当前后端，不靠猜                                                                                           |
| E10 | storage 插件后端跟随同一次判定，不独立探测                                                                                                                                                      | meta 落桌面 SQLite、文件落 OPFS 的组合在构造期即被拒 —— 正是 [US-505](../plugin/US-505-tauri-local-file-storage.md) AC#11 `adapter_mismatch` 禁的备份域撕裂，只是判定点从插件内移到选择器上，错误码沿用不新造            |
| E11 | 候选走动态 `import()`，桌面分支不进 web bundle                                                                                                                                                  | 今天 `setup_rxdb.ts` 是**静态** import 两条分支，浏览器预览的 bundle 里带着 Tauri transport；US-505 AC#10「Tauri 传输客户端代码不进浏览器 bundle」在包一级成立、在应用一级被绕开。改后需有产物断言，否则这条只是口头承诺 |

**未定**：选择器做成公开 API（则受三框架对称铁律约束，Angular / React / Vue 三端都要有，
`provideRxDB` 那一层各写一遍），还是只做 `website/docs` 的配方 + 两个 demo 的参考实现。
E8 的「纯函数 + 应用注入候选」在两种形态下都成立，可以先落形态、API 化与否后判。

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

**「不建库」半条于 2026-08-17 才真正兑现。** 在那之前版本核对读的是 `open` 应答，而 `open`
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
- `packages/rxdb-adapter-desktop/` — 桌面配置、renderer client 与 host protocol（US-208 与 US-210 复用同一层）
- `apps/dev-rxdb-electron/src-electron/` — SQLite 主进程 host、路径解析与 IPC 校验
- `apps/dev-rxdb-electron/src/app/` — Electron renderer 接入示例与连接状态
- `apps/dev-rxdb-electron-e2e/` — 打包 Electron 应用的真实文件持久化测试；AC#8 的三平台矩阵靠
  workflow 兑现，spec 一行没改（`_electron.launch()` 与平台无关）。这批 spec **不需要装
  Playwright 浏览器**：`nxE2EPreset` 没给 `projects`，每条用例都走 `_electron.launch()`，
  `Page` 只作类型导入——所以 workflow 里没有 `playwright-chromium` 那一步，×3 平台各省一次下载
- `apps/dev-rxdb-electron/tools/copy-app-manifest.mjs` — 两个打包 target 里的 `cp package.json`
  换成它。nx `run-commands` 在 Windows 上走 `cmd.exe`，**`cp` 根本不存在**；这条命令此前从没在
  Windows 上跑过（`ci-windows.yml` 不跑这两个 target），AC#8 的矩阵是第一次
- `.github/workflows/release-desktop.yml` — **阶段 2 新增**，release 触发的三平台 workflow，
  见「三平台打包 CI」；现有 `main.yml` / `pr.yml` 全是 `ubuntu-latest`，一字未改
- `.github/actions/xvfb/action.yml` — **阶段 2 新增**，Linux 上的常驻 Xvfb（Electron 与 Tauri 都要）
- `scripts/audit/desktop-adapter-consumer.mjs` — **阶段 2 从 `0d7f88e^` 取回**，只在上述 workflow 里跑
- `requirements/api-baseline/` — 新增公开桌面 adapter API 基线
- `packages/rxdb-adapter-desktop/src/__tests__/encrypted-*.spec.ts` — AC#2 的五套 `@aiao/rxdb-test/encrypted` 共享套件接线

Tauri 侧的实现文件（`apps/dev-rxdb-tauri/`、`apps/dev-rxdb-tauri-e2e/`）随 AC#2 / AC#3
一并迁至 [US-210](./US-210-tauri-sqlite-local-database.md)，本故事不再涉及。

## References

- [US-208 Electron PGlite 数据目录与事务宿主](./US-208-electron-pglite-data-directory.md) — 从本故事拆出，复用本故事的桌面 host 契约
- [US-210 Tauri 连接应用作用域 SQLite 文件](./US-210-tauri-sqlite-local-database.md) — 桌面本地 SQLite 的 Tauri 半边，复用本故事的桌面 host 契约
- [US-201 SQLite 适配器](US-201-sqlite-adapter.md)
- [US-202 PGlite 适配器](US-202-pglite-adapter.md)
- [PGlite Repository](https://github.com/electric-sql/pglite)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
