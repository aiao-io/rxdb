# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> **完成记录**与 spec 关闭快照已移至 [CHANGELOG.md](CHANGELOG.md)。

**最后同步**: 2026-08-16

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 35   |
| 👀 In Review   | 0    |
| 📝 Backlog     | 22   |
| 🚧 In Progress | 4    |
| 🚫 Blocked     | 0    |
| **合计**       | 61   |

> 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，请勿手写维护。
>
> **口径**：合计等于 `requirements/stories/*/US-*.md` 的文件数，**包含 4 个 📄 父故事**
> （[US-012](stories/core/US-012-field-semantic-metadata.md)、[US-306](stories/collaboration/US-306-working-tree-index.md)、
> [US-015](stories/core/US-015-plugin-inject-dependency.md)、[US-904](stories/future/US-904-devtools-native-storage-contract.md)，
> 均为 `Backlog`）。父故事不直接交付，
> 其状态在全部子故事 Done 后才随之关闭；因此 Backlog 22 中有 4 条是共享契约文档，
> 实际待开发切片为 18 条。epic 文件不计入本表。
>
> ⚠️ **US-015 是唯一一个「已降为父故事但子故事文件尚未创建」的条目**——US-012 / US-306 拆分当天就写出了子文件，
> US-015 只改了父标记。在 `US-015a` / `US-015b` 落盘之前，epic-008 的这一段**没有任何可交付切片**，
> 见下方 [生命周期作用域](#生命周期作用域) 小节的开工前置。
> 2026-08-13 的评审把 US-012 拆成 US-012a/b/c、US-207 拆出 US-208、US-305 升级为 epic-006 并拆成 US-305～US-308，Backlog 因此从 4 增至 11；这是拆分而不是新增范围。
> 同日补写了 [US-209](stories/adapter/US-209-miniprogram-adapter.md)（微信小程序适配器），适配器实现早已合并，故直接记为 `In Review` 而非 `Backlog`；2026-08-15 收尾项全部关闭，转 `Done`（Done 32 → 33，In Review 1 → 0，合计不变）。
> 同日 US-207 二次拆分：Tauri 半边迁至 [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)（Backlog），US-207 收敛到 Electron 并转 `In Progress`。Backlog 一进一出仍为 11，合计 45 → 46。
> 2026-08-15 新增 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)（Backlog）认领下方「子路径导出表面」缺口，并为它新建 [epic-007](epics/epic-007-public-api-gates.md) 与 `stories/tooling/`（编号段 US-601~699，此前未分配）。这是把已存在的缺口登记成故事，不是新增范围；Backlog 11 → 12，合计 46 → 47。
> 同日 [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) 开工转 `In Progress`（Backlog 12 → 11，In Progress 2 → 3，合计不变）。
> 同日二次评审确认 US-306 仍同时持有写入口捕获、Index 状态机、三框架与 benchmark，INVEST「Small」仍不成立；
> 保留 US-306 为父契约并拆出 US-306a/b/c。三个子故事是既有范围的交付切片，Backlog 11 → 14，合计 47 → 50。
> 同日新建 [epic-008](epics/epic-008-lifecycle-scope.md)（生命周期作用域）并登记
> [US-013](stories/core/US-013-lifecycle-scope-primitive.md) / [US-014](stories/core/US-014-plugin-scope-contract.md) / [US-015](stories/core/US-015-plugin-inject-dependency.md)（均 Backlog）：
> 把仓库内已存在的九处「登记副作用 → 拆卸时撤销」的手工账本收敛成一个作用域原语，是把既有实现缺口登记成故事，不是新增产品范围。
> 其中 [graph 插件](../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35) 的 `destroy()` 是空的且**契约里没有位置可写**
> （`#repository_config_map` 只有 `.set` / `.get`，无反注册 API），属既有泄漏。Backlog 14 → 17，合计 50 → 53。
> 同日把 US-015 降为父契约故事，切片指派给 US-015a / US-015b，并把 US-016 / US-017 从 epic 目标转为待创建故事。
> **子故事文件尚未落盘**，因此本次拆分**不产生任何计数变化**（合计仍为 53）——
> 只有 `US-015a` / `US-015b` 真正写出来时才 Backlog +2。父故事数 2 → 3，实际待开发切片 15 → 14。
> 同日再新增 [US-504](stories/plugin/US-504-electron-local-file-storage.md) / [US-505](stories/plugin/US-505-tauri-local-file-storage.md)（`rxdb-plugin-storage` 桌面原生文件后端的 Electron / Tauri 两半，挂 epic-004）。这是**新增范围**：[US-502](stories/plugin/US-502-storage-plugin.md) 只承诺过 OPFS。可行性评审结论写在 US-504 内——OPFS 特定入口唯一（`getStorageRootHandle()`），但根句柄之后服务全程直接调用句柄 API，「换根即可、其余零改动」只对 handle shim 案成立（接缝两案 plan 阶段冻结）；host 通道复用 US-207 已发布的契约。拆分沿 US-207 → US-210 先例：Electron 半边可即刻排期，Tauri 半边被 US-210（meta 的桌面 adapter）前置。Backlog 11 → 13，合计 47 → 49。
> 同日新增 [US-904](stories/future/US-904-devtools-native-storage-contract.md)（Backlog），补齐 Electron 原生 SQLite 与本地文件后端的 DevTools 调试面。现有扩展的逻辑数据页可复用 connector，但 OPFS 页、数据库下载与清理都硬编码浏览器存储；本故事要求 provider 能力协商、真实 Electron 链路和无 fallback 的安全边界。Tauri WebView 不承载 Chrome MV3 扩展，明确不混入本故事。Backlog 13 → 14，合计 49 → 50。
> 同日按 Electron / Tauri 运行模型拆出 [US-905](stories/future/US-905-tauri-native-devtools.md)（Backlog）：Tauri 不能加载 Chrome MV3 扩展，因此复用 US-904 的平台无关面板和 provider 协议，以开发态受限 WebView window 承载，不复制第二套 UI / wire。依赖 US-210 / US-505 的 Tauri SQLite 与原生文件 host。Backlog 14 → 15，合计 50 → 51。
> 同日再次评审把 US-904 拆为 [US-904a](stories/future/US-904a-electron-mv3-devtools-feasibility.md) / [US-904b](stories/future/US-904b-devtools-v2-protocol.md) / [US-904c](stories/future/US-904d-electron-native-devtools-integration.md)，把 US-905 拆为 [US-905a](stories/future/US-905-tauri-native-devtools.md) / [US-905b](stories/future/US-905-tauri-native-devtools.md)。父故事保留为契约文档，新增 5 条 Backlog 只反映真实交付切分，**不新增范围**；Backlog 15 → 20，合计 51 → 56。
> 同日第三次评审修正依赖与安全契约：US-904a 只门禁 Electron 的 US-904c，US-904b 与其并行且不再阻塞 Tauri；US-905b 直接消费 US-904b conformance suite，不等待 US-904c。wire v2 保留一个 minor 的 v1/v2 迁移桥，provider 改用语义 kind，并冻结 capability/descriptor/mutation policy、流式 transfer 与有界 immutable snapshot。状态数量不变。
> 同日第四次评审确认 US-904b 仍横跨控制面、provider 数据面和 UI/Chrome 迁移，INVEST Small 不成立，继续拆为 [US-904b1](stories/future/US-904b-devtools-v2-protocol.md) / [US-904b2](stories/future/US-904b-devtools-v2-protocol.md) / [US-904b3](stories/future/US-904c-devtools-shared-panel-chrome-migration.md)（当轮文件名为 `US-904b3-devtools-shared-panel-chrome-migration.md`，第五次评审拆分后改名，此处链接已指向现名）。父故事 US-904b 保留为契约文档，新增 3 条 Backlog 只反映真实交付切分，**不新增范围**；同时关闭 background 代 ACK 导致的 v2 降级、`none` 事件泄漏、无界 ID tombstone、跨 transport binary/数值歧义、平台错误分叉和 snapshot 等锁无 deadline 六个缺口。Backlog 20 → 23，合计 56 → 59。
> 同日第五次评审复查 US-904/US-905 全链，落三类修正。**协议缺陷（P0）**：v1/v2 协商窗口原以 panel 初始化起算，但 connector bootstrap 与 content script 注入（要等 `chrome.permissions.request` 用户授权，延迟无上界）都可能晚于 panel，计时器会在任何一条握手到达前过期，让「双方都支持 v2」稳定退回 v1——同一「双方永久互等」的失败模式在 [bridge.ts](../apps/rxdb-devtools-extension/src/content/bridge.ts) 已有先例注释。改为**证据触发**：panel 在无 session 状态下每次观察到 legacy HANDSHAKE 都补发一次 `PROTOCOL_HELLO`，1,000 ms 窗口从首次暂存起算且只启动一次，无 session 的迟到握手不算非法帧，v1 facade 进入后为终态并置降级标记。另冻结 `crypto.randomUUID()` 在非安全上下文（扩展显式接受 `http:` 页面）不可用，须用 `getRandomValues` 构造 v4；补齐流式 transfer 的 15 秒 idle + 10 分钟总时长两道时限与 `transfer_timeout`（US-904b2 原「继承 US-904b1 的 15 秒 idle deadline」引用了一个 b1 从未定义的值）。**INVEST（P1）**：US-904b3 同时含「行为中性的面板抽取」与「行为收敛的 Chrome v2 迁移」，拆为 [US-904b3](stories/future/US-904c-devtools-shared-panel-chrome-migration.md)（library 抽取，不依赖协议冻结，可与 b1/b2 并行）与 [US-904b4](stories/future/US-904c-devtools-shared-panel-chrome-migration.md)（四段 relay、ACK 所有权、OPFS provider 迁移、下载收敛、浏览器回归）；US-905a 仍门禁在 b4，保持「Chrome 先做 v2 参考实现」的风险姿态不变。US-904a 补齐「关键项」定义与唯一可容忍差异（fixture 静态窄 host permission，须记 variance 且生产 manifest 不动），并点名 US-905a 窗口模型为 `unsupported` 分支的替代承载。US-905 依赖式补回 US-210。**文档一致性（P2）**：US-904/904c/905/905b 中重复冻结数值改为引用 b1/b2，避免两处漂移；v1 兼容形态（完整 facade vs 版本闸门）作为 plan 阶段必答取舍写入 US-904b/b4。Backlog 23 → 24，合计 59 → 60。
> 同日 [US-504](stories/plugin/US-504-electron-local-file-storage.md) 交付转 `Done`（Backlog 24 → 23，Done 33 → 34，合计不变）。四个 plan 阶段决策落定：窄接口 `StorageFilesystem`、临界区下沉 host 侧（跨窗口互斥不再依赖 Chromium Web Locks）、新增 `StorageBackendError { code }`、逻辑名→物理名确定性可逆编码（编码后超单组件 255 字节即以 `name_too_long` 拒绝，是与 OPFS 后端唯一的有意分歧）。同轮复核 [US-505](stories/plugin/US-505-tauri-local-file-storage.md)：US-210 未交付，其 AC#11 的启用分支不可达，本轮只做文档动作，不写不可达代码，状态维持 `Backlog`。
> 同日把 US-904/US-905 全链**文档整合**为 6 篇（原 11 篇 1651 行）：三份「不直接交付」的父契约（旧 US-904 / US-904b / US-905）合并为唯一的 [US-904 共享契约](stories/future/US-904-devtools-native-storage-contract.md)；旧 b1+b2 合并为 [US-904b](stories/future/US-904b-devtools-v2-protocol.md)（v2 全部数值、状态机与错误联合的**唯一真相源**，消除跨文件「只引用不重定义」的漂移风险）；旧 b3+b4 合并为 [US-904c](stories/future/US-904c-devtools-shared-panel-chrome-migration.md)，旧 US-905a+905b 合并为 [US-905](stories/future/US-905-tauri-native-devtools.md)，两者各自保留第五次评审确立的 INVEST 切分——以**故事内两阶段**表达，并硬性要求阶段 1（行为中性）与阶段 2（行为收敛）是独立 PR/commit 序列，阶段 1 的 diff 不得含 wire 类型/错误码/权限判定变化；旧 US-904c 顺延重编号为 [US-904d](stories/future/US-904d-electron-native-devtools-integration.md)。并行性不变：904c 阶段 1 ∥ 904b，905 阶段 1 ∥ US-210/505。**无规范性内容增删**，仅合并与重编号；上方历史条目保留当轮旧编号，链接已指向现名（b1/b2→904b，b3/b4→904c，旧 904c→904d，905a/b→905）。Backlog 23 → 18，合计 60 → 55。
> 2026-08-16 [US-505](stories/plugin/US-505-tauri-local-file-storage.md) 开工转 `In Progress`（Backlog 18 → 17，In Progress 3 → 4，合计不变），同时**作废上一条 2026-08-15 的复核结论**。那条判「AC#11 的启用分支不可达」有两处站不住：[setup_rxdb_desktop.ts](../apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts) 早已把 `sync.local.adapter` 配成 `DESKTOP_ADAPTER_NAME`，通过分支一直存在，「死代码」的前提不成立；且它把 US-210 当作全有全无的门禁，实际被门禁的只有 AC#1/#7。plan 阶段冻结**最小 Rust command**（复用既有 `rxdb_desktop_request` 通道，`capabilities/default.json` 零改动，不引入 `fs` / `shell` 权限），判据是 `lockBackend` 而不是任何一条风险权衡：`tauri-plugin-fs` 只提供文件读写原语，**给不出跨窗口的锁仲裁**，选它等于 AC#9 无法成立。渲染端因此接近零新代码（US-504 交付的 `desktop.ts` 本就运行时无关），实做全在 Rust 侧 `src-tauri/src/rxdb/file/`；一条 IPC 通道上的两套协议按 `kind` **精确成员判定**分流，且必须先于 SQL 解析器。11 条 AC 中 5 条 ✅、4 条 ⚠️、2 条 ⬜，未关闭的分别要打包应用真实重启、三家真实 webview、三平台打包矩阵，与 US-210 AC#1/#9 卡在同一缺口；本轮按既定范围**不建** `apps/dev-rxdb-tauri-e2e`（tauri-driver 不支持 macOS，本机无法验证）。门禁：`cargo test` 113 条、`cargo clippy` 零警告、`test-conformance` 9 文件 602 条、`dev-rxdb-tauri` 12 文件 70 条，均绿。
> 同日 [US-904b](stories/future/US-904b-devtools-v2-protocol.md) 交付转 `Done`（Backlog 17 → 16，Done 34 → 35，合计不变）。交付范围**只有** `packages/rxdb-devtools`：v2 控制面（证据触发协商、ACK 所有权、session 身份、三层授权矩阵、有界 ID 预算）、provider 数据面（descriptor、base64 transfer、snapshot、穷举错误联合），以及一套 fake 四段 relay / fake provider / conformance suite；**不抽 Angular 面板、不碰 Chrome relay、不接任何 native host**，24 条 AC 全部以 fake 验收。plan 阶段冻结三处取舍：① v1 兼容只实现 **facade 的进入状态机**（到期发 legacy ACK、无等待进入、终态 + 降级标记），legacy 命令映射按 US-904:144-146 仍归 US-904c，本轮不预判；② **panel 协商端属于本包的公开导出**而非测试专用——US-904c:65/87/153 三条合起来只允许 904c 写平台相关的 transport driver，故状态机必须平台无关地由本包导出；③ `./testing` 是唯一新增子路径，因为 suite 必须 `import 'vitest'`，而它**不受 `requirements/api-baseline/` 保护**（baseline 只扫 `src/index.ts`），日后收窄其导出须按 [README.md](README.md) 在 PR 描述手动声明 breaking。门禁：`lint typecheck test build` 全绿，30 文件 757 条测试，覆盖率 97.72 / 94.55 / 99.14 / 99.51（stmts/branch/funcs/lines，高于本包 96/91/98/98 baseline），`audit:api-surface` 更新后零 diff——主入口新增 132 个符号而非 plan 预估的 40–45，是**有意放宽**：面板要构造 REQUEST payload、host 作者要实现 provider 接缝、relay 要在不解析 payload 的前提下转发，任一类型不导出下游就只能抄一份不会随本包演进的副本；`v2/session.ts`、`v2/transfer.ts` 的状态机与 tombstone 容器、`internal/guards.ts` 仍不导出。回归：`connector.boundaries.spec.ts` 只此一处 diff（`none` 档「HANDSHAKE_ACK 后仍 flush 事件」按 US-904:169 的安全收敛授权改为零泄漏），其余 6 个 spec 文件与 `rxdb-devtools-extension` 零改动通过。24 条 AC 中 19 条 ✅、5 条 ⚠️：#13（跨真实重连）与 #24（OPFS/SQLite/WAL 零读取）只能由 US-904c 的真实四段 relay 关闭，#19（不整文件驻留内存）与 #21（storage 独占锁内物化）要 US-904d / US-905 的真实 host 才可观测，#23（错误映射穷尽性）本轮只做到「每个 `DEVTOOLS_PROVIDER_ERROR_CODES` 成员至少被一条 fixture 产出」的 meta-test，fixture 表从 `./testing` 导出，逼下游**加行**而不是加 default 分支。
> **2026-08-16 合并 `main`（本分支 001-working-tree-commits）**：两侧各自独立追加故事，上方两段历史里的
> 递进计数分别只在各自分支内自洽，合并后一律作废。当前计数按真相源重新推导
> （`grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c`）：Done 35、In Progress 4、Backlog 22、合计 61。
> 父故事由 3 条增至 4 条（新增 [US-904](stories/future/US-904-devtools-native-storage-contract.md)），实际待开发切片 18 条。

## 项目统计

| 维度         | 数值                                                                                                                                                                                                |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 总包目录     | 29 个公开 npm 包                                                                                                                                                                                    |
| 支持框架     | Angular 22 / React 19 / Vue 3.5                                                                                                                                                                     |
| 支持平台     | Web / Electron / Tauri / PWA / 小程序                                                                                                                                                               |
| 存储适配器   | 8 个具名适配器：wa-sqlite / sqlite-wasm / sqlite (@sqlite.org) / sqliteai / wa-sqlite-miniprogram / desktop / PGlite / Supabase；另有 sqlite-core 共享基类与 encrypted 加密工具包（两者均非适配器） |
| 演示应用     | 6 个 (Angular / Electron / React / Supabase / Tauri / Vue) + DevTools 扩展                                                                                                                          |
| E2E 测试套件 | 5 个 (Angular / Electron / React / Supabase / Vue)                                                                                                                                                  |

> 基础设施包（`@aiao/utils` 通用工具、`@aiao/rxdb-test` 跨框架测试 fixture）不单独立 story；前者属于公用底座，后者由 [US-702](stories/future/US-702-full-text-search.md) 等业务 story 引用其 fixture（`cross-framework-fixtures/`）。

### 已知的需求覆盖缺口

- ~~`@aiao/rxdb-adapter-miniprogram` 没有任何 story~~ → 2026-08-13 补写 [US-209](stories/adapter/US-209-miniprogram-adapter.md)，2026-08-15 收尾完成转 `Done`：本包已在 [coverage-baseline.json](../scripts/audit/coverage-baseline.json) 中留下趋势基准（**注意：覆盖率硬门槛一直生效**，`coverage-check.mjs` 按包类型卡 80%/90%，与是否在 baseline 中无关；baseline 只用于「比上次低」的软警告）、[compatibility.md](../website/docs/compatibility.md) 补了能力边界专节、根 README 不再声称支持 Alipay、[examples/README.md](../examples/README.md) 声明示例不在 CI 覆盖范围。
- **`exports` 子路径入口的导出表面不受 API baseline 保护**（US-209 AC#8 的决策产物）。[api-surface.mjs](../scripts/audit/api-surface.mjs) 的 v1 边界只扫主入口 `src/index.ts`，**8 个公开包共 12 个子路径入口**（`rxdb-adapter-miniprogram/runtime`、`rxdb-adapter-wa-sqlite/client`、`rxdb-plugin-graph/{sqlite,generator}` 等；`rxdb-test` 的 5 个不计——整包非产品 API）按 [versioning-policy.md](versioning-policy.md) 属于公开 API 但只能人工审查。**清单本身已受门禁保护**（`KNOWN_UNCOVERED_SUBPATHS` + `subpath-inventory.mjs`，新增/删除子路径不同步即失败），**仍缺的是扫描子路径导出表面** → 2026-08-15 由 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领（Backlog，缺口在它交付前依然敞开）。
- **小程序运行时的搜索能力仍无故事覆盖**。`@aiao/rxdb-plugin-search` 只白名单 `sqlite-wasm`，小程序侧能否加载 FTS5 扩展不在 US-209 范围内，见下方跨框架矩阵脚注。

## 按 Epic 索引

### [核心 MVP](epics/epic-001-core-mvp.md)

#### 核心引擎

- ✅ [US-001 定义数据模型](stories/core/US-001-model-definition.md)
- ✅ [US-002 客户端代码生成](stories/core/US-002-client-generation.md)
- ✅ [US-003 数据查询](stories/core/US-003-data-query.md)
- ✅ [US-004 数据变更](stories/core/US-004-data-mutation.md)
- ✅ [US-005 关系映射](stories/core/US-005-relationship-mapping.md)
- ✅ [US-006 响应式查询](stories/core/US-006-reactive-queries.md)
- ✅ [US-007 变更追踪](stories/core/US-007-change-tracking.md)
- ✅ [US-008 事务支持](stories/core/US-008-transaction-support.md)
- ✅ [US-009 跨 Tab 同步](stories/core/US-009-cross-tab-sync.md)
- ✅ [US-010 树形数据结构](stories/core/US-010-tree-entity.md)

#### 框架集成

- ✅ [US-101 Angular 集成](stories/framework/US-101-angular-integration.md)
- ✅ [US-102 React 集成](stories/framework/US-102-react-integration.md)
- ✅ [US-103 Vue 集成](stories/framework/US-103-vue-integration.md)

#### 存储适配器

- ✅ [US-201 SQLite 适配器](stories/adapter/US-201-sqlite-adapter.md)
- ✅ [US-202 PGlite 适配器](stories/adapter/US-202-pglite-adapter.md)
- ✅ [US-204 SQLite WASM 适配器](stories/adapter/US-204-sqlite-wasm-adapter.md)
- ✅ [US-205 SQLiteAI 适配器](stories/adapter/US-205-sqliteai-adapter.md)

#### Plugin 包

- ✅ [US-501 Workspace 插件](stories/plugin/US-501-workspace-plugin.md)
- ✅ [US-502 Storage 插件](stories/plugin/US-502-storage-plugin.md)
- ✅ [US-503 图数据插件](stories/plugin/US-503-graph-data.md)

### [数据同步与协作](epics/epic-002-data-sync.md)

- ✅ [US-301 版本控制](stories/collaboration/US-301-version-control.md)
- ✅ [US-302 撤销/重做](stories/collaboration/US-302-undo-redo.md)
- ✅ [US-203 Supabase 适配器](stories/adapter/US-203-supabase-adapter.md)
- ✅ [US-803 本地数据加密](stories/future/US-803-local-encryption.md)

> 原挂在本 Epic 下的 US-305 已升级为 [epic-006](epics/epic-006-working-tree-commits.md)，见下方独立小节。

### [UI 与开发者工具](epics/epic-003-ui-developer-tools.md)

- ✅ [US-402 代码编辑器](stories/ui/US-402-code-editor.md)
- ✅ [US-902 DevTools 面板](stories/future/US-902-devtools-panel.md)
- 📄 [US-904 DevTools 原生本地存储调试共享契约](stories/future/US-904-devtools-native-storage-contract.md) — **父故事/共享契约文档，不直接交付**
  - ⬜ [US-904a Electron 43 MV3 DevTools 可行性门禁](stories/future/US-904a-electron-mv3-devtools-feasibility.md) — 无 native host 前置；只门禁 904d，可与 904b/904c 共享链并行
  - ✅ [US-904b DevTools v2 协议](stories/future/US-904b-devtools-v2-protocol.md) — 控制面（ACK 所有权、证据触发协商、session、授权、ID 总预算）+ provider 数据面（descriptor、base64 transfer、snapshot、穷举错误）；v2 全部数值与状态机的唯一真相源
  - ⬜ [US-904c DevTools 共享面板与 Chrome v2 迁移](stories/future/US-904c-devtools-shared-panel-chrome-migration.md) — 阶段 1 行为中性的 private library 抽取（无协议前置，可与 904b 并行）；阶段 2 四段 relay、v2 切换、下载收敛与浏览器回归
  - ⬜ [US-904d Electron 原生存储 DevTools 集成](stories/future/US-904d-electron-native-devtools-integration.md) — 依赖 904a(supported)、904c、US-207、US-504；真实 Electron provider/E2E
  - ⬜ [US-905 Tauri DevTools 调试窗口与原生存储集成](stories/future/US-905-tauri-native-devtools.md) — 阶段 1 受限窗口/transport（依赖 904c，可与 US-210/505 并行）；阶段 2 依赖 US-210/505，不等待 Electron 904d

> US-401 / US-701 查询构建器系列已随 PR #251 清理出本仓库，详见 [CHANGELOG](CHANGELOG.md)。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ⬜ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- 🚧 [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md) — `@aiao/rxdb-adapter-desktop` 与主进程 host 已落地，AC#1–#7 ✅（2026-08-14 接入 `@aiao/rxdb-test/encrypted` 五套共享套件关闭 AC#2，786 用例全绿）；仅剩 AC#8 三平台打包矩阵
- ⬜ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — 从 US-207 拆出，PGlite callback transaction 不能跨 IPC 序列化
- 🚧 [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md) — 从 US-207 二次拆出。事务门禁判定 `tauri-plugin-sql` 不可用（池连接不固定 + 完全没有变更事件 API），改为自写 Rust command 持有 `rusqlite::Connection`；AC#2–#8 ✅（Rust 宿主跑 21 shared + 5 encrypted 共享套件，585 用例零跳过，空闲机器上连跑 5 次全绿；与 cargo 目标并行抢 CPU 时会有变更事件时序 flake，Node 宿主同条件无，详见故事）；AC#1 ⚠️ 缺跨进程重启 e2e，AC#9 三平台打包矩阵未做
- ✅ [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md) — 实验性；2026-08-15 完成覆盖率门禁登记、子路径 API baseline 决策与文档收尾
- ✅ [US-504 Electron 本地文件存储](stories/plugin/US-504-electron-local-file-storage.md) — 2026-08-15 交付：窄接口 `StorageFilesystem` 接缝（OPFS 默认实现行为冻结）+ host 侧仲裁路径锁 + `StorageBackendError { code }`；文件内容落 `userData/rxdb-files`，与 US-207 的 SQLite 同一备份域。AC#1–#9 ✅，`dev-rxdb-electron-e2e` 11/11（含重启、整目录拷贝、传输中途 SIGKILL），`rxdb-plugin-storage` node 200/200 + browser 20/20
- 🚧 [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边。2026-08-16 开工：2026-08-15 记下的「被 US-210 前置阻塞、任何实现都是不可达代码」判断经复核**作废**——`setup_rxdb_desktop.ts` 早已把 `sync.local` 配成桌面 adapter，AC#11 的通过分支一直存在；真正共享的只是 `apps/dev-rxdb-tauri-e2e` 与打包矩阵这个下游缺口。传输层冻结为**最小 Rust command**（复用 `rxdb_desktop_request`，capability 零改动；plugin-fs 给不出 `lockBackend`，选它 AC#9 无法成立）。AC#2 / #4 / #9 / #10 / #11 ✅，AC#1 / #3 / #5 / #8 ⚠️，AC#6 / #7 ⬜；`cargo test` 113 条、`test-conformance` 602 条（含 15 条后端一致性 + 2 条持久性）全绿

### [类型系统演进](epics/epic-005-type-system-evolution.md)

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- 📄 [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md) — **父故事/共享契约文档，不直接交付**
  - ⬜ [US-012a 字段 format 声明与注册期校验](stories/core/US-012a-field-format-declaration.md)
  - ⬜ [US-012b 实体字段描述 DTO](stories/core/US-012b-entity-fields-dto.md)
  - ⬜ [US-012c 字段值校验、生成器透传与三框架契约](stories/core/US-012c-field-value-validation-codegen.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- 🚧 [US-304 跨 realm writer lease 与迁移 fencing](stories/collaboration/US-304-writer-lease-migration-fencing.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

由 2026-08-13 的评审从原 US-305 升级而来：原故事持有 4 个 user story、28 条 FR、7 个关键实体，
横跨 `packages/rxdb/src/version/`、`src/system/`、workspace 插件、三个框架包与三个 demo，INVEST「Small」不成立。
拆分后每个交付故事都能独立证明「写入 → 刷新 → 读回」。交付顺序为
**US-305 → US-306a → US-306b → US-306c →（US-307 ∥ US-308）**。
US-307 / US-308 的**核心持久层半边**可与 US-306c 并行开工，但两者的三框架入口、a11y 与 benchmark 采样
都要复用 US-306c 冻结的 `useWorkingTree()` 契约与 `bench-working-tree` target，必须排在其后
（口径以 [epic-006 依赖顺序](epics/epic-006-working-tree-commits.md) 为准）。

- ⬜ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 基础层：commit 图 / branch ref / baseline，并建 `WorkingTreeActivationState`（FR-052）与桥接血统预检（FR-030）
- 📄 [US-306 工作树、缓存区与提交操作](stories/collaboration/US-306-working-tree-index.md) — **父故事/共享契约，不直接交付**；其 FR/AC 承接表是 [发布门禁 2](epics/epic-006-working-tree-commits.md) 的审计依据
  - ⬜ [US-306a 工作树写入捕获与持久化](stories/collaboration/US-306a-working-tree-capture.md) — 全部业务写入口 → `WorkingTreeEntry` 原子捕获、意图登记、6 个 v1 后端 conformance
  - ⬜ [US-306b 缓存区与提交状态机](stories/collaboration/US-306b-index-commit-state-machine.md) — status/diff、index 依赖闭包、commit residual rebase、revision CAS
  - ⬜ [US-306c 三框架工作树交互面与性能门禁](stories/collaboration/US-306c-cross-framework-working-tree.md) — `useWorkingTree()` 三端契约与 `bench-working-tree` target 的归属方
- ⬜ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — 依赖 US-306a 的捕获层落盘、US-306b 的 `WorkingTreeRestoreSession` 建表、US-306c 的三端契约扩展
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — 依赖 US-304 收敛；`CommitConflict` 类型由 US-306b 登记，本故事只扩展 activation 维度

> **阻塞口径**：上表全部 ⬜ Backlog，且链首是 **US-305**（不是 US-306a）——它同时是 US-306a、US-306b 与 US-307 的前置。
> 整条链目前有两个硬前置：
>
> 1. [US-304](stories/collaboration/US-304-writer-lease-migration-fencing.md) 仍是 🚧 In Progress，US-305 / US-306a
>    都要消费它的 writer 身份与迁移 epoch fencing；
> 2. US-305 是首个真实 system schema 迁移发布，其 FR-030 要求 `requirements/migration-release.json` 指向一个
>    位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`，
>    历史 bridge 版本 `v0.0.25` 的 tagged commit 又已被 squash 移出主线，因此**必须先从主线发布一个新的非迁移
>    bridge 版本**，US-305 的发布门禁才可能转绿。这一条不随代码进度自动解除，需要单独排期。
>
> 汇总表的「🚫 Blocked = 0」统计的是**故事 YAML 里显式写成 `status: Blocked`** 的数量，
> 不代表没有前置阻塞；两者不要互相推断。

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

2026-08-15 新建，用来接收「某道门禁的覆盖面小于它被引用时暗示的范围」这类缺口。
不属于产品能力，因此不挂进 epic-001~006 中的任何一个。

- ⬜ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md) — 认领上方「已知的需求覆盖缺口」第 2 条

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

2026-08-15 新建，把仓库内九处「安装时登记 → 拆卸时逐一撤销」的手工账本收敛成一个作用域原语。
它既不是用户可见能力（不挂 epic-001），也不是门禁覆盖面问题（不挂 epic-007），而是一层横切实现约束。

- ⬜ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语，语义由测试冻结
- ⬜ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包迁移；**独立关闭三处已知泄漏**（graph 注册、storage 属性、workspace 订阅）
- 📄 [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — **父契约故事，不直接交付**；只冻结 `inject` 的封闭依赖类别与不变量
  - 🚧 `US-015a` 适配器依赖纪元 — **文件未创建**
  - 🚧 `US-015b` 插件依赖图 — **文件未创建**；价值待证：今天没有任何插件声明 `plugin:*` 依赖
- 🚧 `US-016` 连接纪元与停机收敛 — **文件未创建**；价值待证
- 🚧 `US-017` 三框架宿主作用域 — **文件未创建**；价值待证

> 🚧 = 已在其它文档中被引用、但 `stories/` 下没有对应文件，**因此不计入任何统计**。
> 它与汇总表的 🚫 Blocked 无关（后者统计的是 YAML 里显式 `status: Blocked` 的既有故事，仍为 0）。
>
> **交付顺序**：**US-013 → US-014** 为硬序，不可交换。
> **US-014 完成时，本 Epic 的三处已知泄漏已全部关闭**——后续 015a/015b/016/017 不得凭 Epic 惯性排期，
> 每一条都要在自己的故事里写出「今天用户踩得到的具体症状」，写不出就留在 Backlog。
> 这是过度设计判据，不是建议。
>
> 本 Epic 会制造一次 `IRxDBPlugin` 成员签名变更（含 `destroy()` 由必选转可选），
> 而 [api-surface.mjs](../scripts/audit/api-surface.mjs) 只记录 `{name, kind}`（见 [rxdb.json](api-baseline/rxdb.json)），
> **成员怎么改都不产生 diff**。该盲区由 US-014 用类型契约测试就地补上，
> 不扩大 [epic-007](epics/epic-007-public-api-gates.md) 的范围。

## 跨框架 API 对称矩阵

| Hook               | Angular | React | Vue |
| :----------------- | :-----: | :---: | :-: |
| `useGet`           |   ✅    |  ✅   | ✅  |
| `useFind`          |   ✅    |  ✅   | ✅  |
| `useFindOne`       |   ✅    |  ✅   | ✅  |
| `useFindOneOrFail` |   ✅    |  ✅   | ✅  |
| `useFindAll`       |   ✅    |  ✅   | ✅  |
| `useFindByCursor`  |   ✅    |  ✅   | ✅  |
| `useCount`         |   ✅    |  ✅   | ✅  |
| Tree hooks         |   ✅    |  ✅   | ✅  |
| Graph hooks        |   ✅    |  ✅   | ✅  |
| InfiniteScroll     |   ✅    |  ✅   | ✅  |
| `useSearch`        |   ✅    |  ✅   | ✅  |

> `useSearch` 的三端 API 对称成立，但**能力边界不对称于适配器**：
> [adapter-guard.ts](../packages/rxdb-plugin-search/src/core/adapter-guard.ts) 的 `SUPPORTED_SEARCH_ADAPTERS` 目前只有 `sqlite-wasm`，
> 其余 adapter 在 `createRxDatabase` 阶段直接抛 `SearchUnsupportedAdapterError`（不降级、不挂载 `.search`）。
> PGlite 侧由 [US-703](stories/future/US-703-pglite-full-text-search.md) 认领；wa-sqlite / sqlite / sqliteai / miniprogram / desktop 的搜索支持尚无故事覆盖
> （[US-209](stories/adapter/US-209-miniprogram-adapter.md) 只覆盖小程序适配器本身，不含 FTS5；
> [US-207](stories/adapter/US-207-desktop-local-database.md) / [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) 同样不含 FTS5）。

## 适配器能力对比

| 适配器                  | 包名                             | `ADAPTER_NAME`          | 类型   | 核心能力                                                                                                                     | 需求覆盖                                                                                                                     |
| :---------------------- | :------------------------------- | :---------------------- | :----- | :--------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| wa-sqlite               | `@aiao/rxdb-adapter-wa-sqlite`   | `wa-sqlite`             | Local  | rhashimoto/wa-sqlite，Worker/OPFS VFS、AsyncQueueExecutor                                                                    | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                           |
| sqlite-wasm (subframe)  | `@aiao/rxdb-adapter-sqlite-wasm` | `sqlite-wasm`           | Local  | `@subframe7536/sqlite-wasm`，oo1 API                                                                                         | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                      |
| sqlite (@sqlite.org)    | `@aiao/rxdb-adapter-sqlite`      | `sqlite`                | Local  | `@sqlite.org/sqlite-wasm` 官方包，与 subframe 版本接口一致                                                                   | [US-204](stories/adapter/US-204-sqlite-wasm-adapter.md)                                                                      |
| sqlite-core（共享层）   | `@aiao/rxdb-adapter-sqlite-core` | —                       | 共享层 | `RxDBAdapterSqliteBase` / execute / trigger，五个 SQLite adapter 复用                                                        | [US-201](stories/adapter/US-201-sqlite-adapter.md)                                                                           |
| sqliteai                | `@aiao/rxdb-adapter-sqliteai`    | `sqliteai`              | Local  | 向量列 + AI SQL 函数，支撑本地 RAG                                                                                           | [US-205](stories/adapter/US-205-sqliteai-adapter.md)                                                                         |
| miniprogram             | `@aiao/rxdb-adapter-miniprogram` | `wa-sqlite-miniprogram` | Local  | **实验性**，仅微信逻辑层：`WXWebAssembly` + 同步文件 VFS，强制单连接                                                         | [US-209](stories/adapter/US-209-miniprogram-adapter.md)                                                                      |
| PGlite                  | `@aiao/rxdb-adapter-pglite`      | `pglite`                | Local  | LISTEN/NOTIFY 触发器，延迟约束                                                                                               | [US-202](stories/adapter/US-202-pglite-adapter.md)                                                                           |
| desktop                 | `@aiao/rxdb-adapter-desktop`     | `desktop`               | Local  | 桌面宿主 SQLite：Electron 走 `node:sqlite` host；Tauri 侧本包只提供 transport，真正的 host 是 `src-tauri` 的 Rust `rusqlite` | [US-207](stories/adapter/US-207-desktop-local-database.md) · [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) |
| encrypted（加密工具包） | `@aiao/rxdb-adapter-encrypted`   | —                       | 工具包 | 密钥环 + 信封编解码；**不是适配器、也不包装适配器**，由 sqlite-core / pglite 内部消费                                        | [US-803](stories/future/US-803-local-encryption.md)                                                                          |
| Supabase                | `@aiao/rxdb-adapter-supabase`    | `supabase`              | Remote | RPC 推送、PostgREST、Realtime                                                                                                | [US-203](stories/adapter/US-203-supabase-adapter.md)                                                                         |

> `encrypted` 包的 [index.ts](../packages/rxdb-adapter-encrypted/src/index.ts) 只导出 `Keyring` / `createKeyring` / 信封编解码 / 校验与错误类型，**没有任何 `IRxDBAdapter` 实现**；
> [RxDBAdapterSqliteBase.ts:43](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L43) 与 [RxDBAdapterPGlite.ts:47](../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L47) 直接 import 它，加密是**内建**能力而非外层包装。
> 因此按适配器 `name` 判定能力时不存在「先解包」这一步（见 [epic-006 启用与存储边界](epics/epic-006-working-tree-commits.md)）。
