# 完成记录

本文件记录用户故事的状态变更与 spec 关闭快照。**它不是真相源**——当前状态以 [stories/\*.md](stories/) 的 YAML `status` 字段为准；本文件只是按时间线归档"什么时候完成了什么"。

新条目追加到最上方。

## Story 状态变更

### 2026-08-16 — 取消子故事文件，10 个 `US-XXXa/b/c` 合并回 4 个父文件（无规范性内容增删）

- 撤销「父故事 + `US-XXXa/b/c` 子故事文件」这一整套约定。子文件拆分同时做了两件事：把父文件移出 Backlog
  （不再可开工），却依赖另一次改动把等量可交付项放回去——US-015 就卡在这个断层上整整一天
  （降级已发生、`US-015a` / `US-015b` 始终没落盘，epic-008 因此在 US-014 之后没有任何可开工切片）。
  改为**一个编号一个文件**，体量过大时在正文用 `## 交付阶段` 表切成 A / B / C…，
  AC 表按阶段分段编号，实现文件表加「阶段」列。外部引用因此永远指向同一个路径。
- 合并映射（10 个子文件已 `git rm`，内容全部并入父文件，AC 逐条保留）：

  | 合并前                                | 合并后                                                                                 |
  | :------------------------------------ | :------------------------------------------------------------------------------------- |
  | US-012a / US-012b / US-012c           | [US-012](stories/core/US-012-field-semantic-metadata.md) 阶段 A / B / C                |
  | US-306a / US-306b / US-306c           | [US-306](stories/collaboration/US-306-working-tree-index.md) 阶段 A / B / C            |
  | US-904a / US-904b / US-904c / US-904d | [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 A / B / C / D |
  | `US-015a` / `US-015b`（从未落盘）     | [US-015](stories/core/US-015-plugin-inject-dependency.md) 阶段 A / B                   |

- US-015 相应**从父故事回退为普通可交付故事**：从 git 历史取回被拆散前的 15 条 AC，重排为按阶段分段的 20 条
  （阶段 A 12 条含 Cordis 四类并发测试与 search 插件迁移，阶段 B 6 条，横切 2 条）。
  epic-008 在 US-014 之后重新有可开工切片。
- US-904 的状态由子故事的最高进度接管：`Backlog` → `In Progress`（阶段 B 已交付，含 5 条 fake 关不掉的保留 AC；
  阶段 A / C / D 未开始）。US-904a 的机器可读门禁 frontmatter（`decision: pending` / `evidence: null`）随之落到父文件。
- [US-905](stories/future/US-905-tauri-native-devtools.md) **不参与合并**：它有自己的用户价值、前置与关闭条件，
  按新规则该占独立编号；只把对 904b/c/d 的引用改指 US-904 的对应阶段。
- 派生视图与规则文档同步：`README.md`（新增「大故事用交付阶段，不用子故事文件」，删除「拆分即落盘」硬规则）、
  `template.md`、`status-overview.md`、`roadmap.md`、`release-plan.md`、epic-002/003/005/006/008、
  US-305 / US-307 / US-308 / US-014 / US-905，以及 `specs/` 与 `packages/rxdb-devtools` 的 TSDoc 引用。
  派生计数按真相源重推：**Done 34、In Progress 5、Backlog 12、合计 51**（合并前 35 / 4 / 22 / 61）。
  计数变化全部来自文件数减少与 US-904 状态接管，**没有任何一条 AC 被增删**。
- 本条以上的历史条目**保留当轮旧编号**作为记录，链接已改指合并后的文件。

### 2026-08-16 — `main` 合并进 `001-working-tree-commits`（无状态变更）

- 两侧各自追加故事后合并，**没有任何一条 story 的 `status` 因合并而改变**；
  但两边的派生计数各自只在本分支内自洽，已按真相源重新推导：
  Done 35、In Progress 4、Backlog 22、合计 61（父故事 3 → 4，实际待开发切片 18）。
  上方两侧历史条目里的递进计数（`…→…`）保留作为当轮记录，**不再表示当前值**。
- `packages/rxdb-devtools/src/connector.ts` 是唯一一处**语义**冲突：本分支加的
  v1 私有 `MessagePort` 传输层与 `main` 加的 US-904b v2 端点互不知情地改了同几行。
  两者都保留，接缝按信道划分：**v1 命令走私有端口，v2 帧始终走 `window` 总线**——
  入站 v2 帧本来就只从总线进来（端口的 `onmessage` 只收 v1 命令），出站若也切到端口，
  对端在总线上发 `PROTOCOL_HELLO` 却要去另一个信道找回应，协商永不闭合。
  eager legacy 握手仍随附本次会话的 port2：端点只决定它何时出门，不知道 v1 还要求它带端口。
- `connector.boundaries.spec.ts` 的 `none` 档用例取 `main` 的零泄漏判据（US-904:169 授权的安全收敛），
  本分支的「window 总线命令白名单」用例原样保留。门禁：`rxdb-devtools` 30 文件 781 条测试全绿，
  `rxdb-devtools-extension` 26 文件 212 条零改动通过，两包 `lint typecheck build` 全绿。
- `packages/rxdb-plugin-storage/tsconfig.lib.json` 取本分支的删除：那段 `paths` 是误提交的
  根级副本（同目录下无第二个包有它），`main` 只是往里加了两行；`main` 真正的改动
  （`rxdb-adapter-desktop` 的 project reference）在冲突区之外，已保留。

### 2026-08-16 — US-904b DevTools v2 协议冻结（Backlog → Done）

- [US-904b](stories/future/US-904-devtools-native-storage-contract.md) 交付，成为 v2 **全部数值、状态机与错误联合的唯一真相源**；
  同文件的阶段 C / 阶段 D 与 US-905 只引用，不重定义。范围只有 `packages/rxdb-devtools`：
  控制面（证据触发协商、1,000 ms 决策窗口、ACK 所有权、session 身份、三层授权矩阵、有界 ID 预算与 tombstone 轮换）、
  provider 数据面（三领域 descriptor、RFC 4648 base64 transfer、有界 immutable snapshot、穷举错误联合），
  外加 fake 四段 relay / fake provider / conformance suite。**不抽面板、不碰 Chrome relay、不接 native host。**
- 新增 `./testing` 子路径（suite 必须 `import 'vitest'`，运行时主入口不能背上测试框架）。
  四处协同登记已同步：`package.json` exports + 可选 peer `vitest`、`vite.config.mts` 多入口、
  `tsconfig.base.json` 路径、`api-surface.mjs` 的 `KNOWN_UNCOVERED_SUBPATHS`（9 包 14 入口 → 10 包 15 入口）。
  该入口**不受 API 基线保护**（基线只扫 `src/index.ts`），日后收窄其导出须在 PR 描述手动声明 breaking。
- API 基线主入口新增 132 个符号（plan 预估 40–45），零删除。放宽是有意的：
  面板要构造 REQUEST payload、host 作者要实现 provider 接缝、relay 要在不解析 payload 的前提下转发，
  任一类型不导出，下游只能抄一份不随本包演进的副本。`v2/session.ts` / `v2/transfer.ts` 的状态机与
  tombstone 容器、`internal/guards.ts` 仍不导出——那是端点实现细节，导出即允许下游复刻并行语义。
- 唯一的行为回归是授权的：`connector.boundaries.spec.ts` 里「`none` 档 HANDSHAKE_ACK 后仍 flush 事件」
  改为零泄漏（不订阅、不写 buffer、不发业务数据），依据 US-904:169 的安全收敛豁免。
  其余 6 个 spec 文件与 `rxdb-devtools-extension` 零改动通过。
- 门禁：30 文件 757 条测试全绿，覆盖率 97.72 / 94.55 / 99.14 / 99.51（高于本包 96/91/98/98 baseline），
  `audit:api-surface` 更新后零 diff，`lint typecheck test build` 全绿。
- 24 条 AC 中 19 条 ✅、5 条 ⚠️（AC#13 / #19 / #21 / #23 / #24）。保留项不是「还没写测试」而是本包结构上不可测：
  真实重连语义与 OPFS/SQLite/WAL 零读取由阶段 C 关闭，内存驻留与 storage 独占锁由阶段 D / US-905 关闭，
  错误映射穷尽性本轮只到 meta-test（`DEVTOOLS_PROVIDER_ERROR_CODES` 每个成员至少一条 fixture），
  fixture 表从 `./testing` 导出，逼下游**加行**而非加 default 分支。详见该故事的「保留项」小节。
- 派生视图同步：`status-overview.md`（Backlog 17 → 16，Done 34 → 35，合计 55 不变；epic-003 索引条目转 ✅）、
  `US-904` 的阶段表新增状态列。

### 2026-08-16 — US-505 Tauri 本地文件存储开工（Backlog → In Progress）

- 本条**作废 2026-08-15 的复核结论**「US-210 未交付 → AC#11 启用分支不可达 → 本轮只补文档」。
  该判断有两处站不住：[setup_rxdb_desktop.ts](../apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts)
  早已把 `sync.local.adapter` 配成 `DESKTOP_ADAPTER_NAME`，通过分支一直存在，「死代码」的前提不成立；
  且它把 US-210 当成全有全无的门禁，实际被门禁的只有 AC#1 / #7。
- plan 阶段冻结 **最小 Rust command**：复用既有 `rxdb_desktop_request` 通道，`capabilities/default.json`
  零改动，不引入 `fs` / `shell` 权限。判据是 `lockBackend` 而非风险权衡——`tauri-plugin-fs` 只提供
  文件读写原语，**给不出跨窗口的锁仲裁**，选它等于 AC#9 无法成立。
- 渲染端接近零新代码（US-504 交付的 `desktop.ts` 本就运行时无关），实做全在 `src-tauri/src/rxdb/file/`；
  同一条 IPC 通道上的两套协议按 `kind` **精确成员判定**分流，且必须排在 SQL 解析器之前。
- 11 条 AC 中 5 条 ✅、4 条 ⚠️、2 条 ⬜，未关闭项分别要打包应用真实重启、三家真实 webview、三平台打包矩阵，
  与 US-210 AC#1 / #9 卡在同一缺口。本轮按既定范围**不建** `apps/dev-rxdb-tauri-e2e`（tauri-driver 不支持 macOS）。
- 门禁：`cargo test` 113 条、`cargo clippy` 零警告、`test-conformance` 9 文件 602 条、`dev-rxdb-tauri` 12 文件 70 条，均绿。

### 2026-08-15 — US-504 Electron 本地文件存储交付（Backlog → Done）

- [US-504](stories/plugin/US-504-electron-local-file-storage.md) 是 `rxdb-plugin-storage` 桌面原生文件后端的
  Electron 半边（Tauri 半边为 [US-505](stories/plugin/US-505-tauri-local-file-storage.md)）。这是**新增范围**：
  [US-502](stories/plugin/US-502-storage-plugin.md) 只承诺过 OPFS。
- 四个 plan 阶段决策落定：① 窄接口 `StorageFilesystem`；② 临界区下沉 host 侧，跨窗口互斥不再依赖 Chromium Web Locks；
  ③ 新增 `StorageBackendError { code }`；④ 逻辑名→物理名确定性可逆编码，编码后超单组件 255 字节即以
  `name_too_long` 拒绝——这是与 OPFS 后端**唯一的有意分歧**。
- 文件落 `userData/rxdb-files`，与 US-207 的 SQLite 同一备份域；host 通道复用 US-207 已发布的契约。
- 可行性结论：OPFS 特定入口唯一（`getStorageRootHandle()`），但根句柄之后服务全程直接调用句柄 API，
  「换根即可、其余零改动」只对 handle shim 案成立，接缝两案在 plan 阶段冻结。

### 2026-08-15 — US-904 / US-905 DevTools 链五轮评审拆分与重编号

同日连续五轮评审，最终把该链**文档整合**为 6 篇（原 11 篇 1651 行）。全程只做切分、合并与重编号，**无规范性内容增删**。

重编号映射（上方历史条目保留当轮旧编号，链接已指向现名）：

| 当轮编号                          | 现名（2026-08-16 二次合并后）                                                    |
| :-------------------------------- | :------------------------------------------------------------------------------- |
| US-904b1 + b2                     | [US-904 阶段 B](stories/future/US-904-devtools-native-storage-contract.md)       |
| US-904b3 + b4                     | [US-904 阶段 C](stories/future/US-904-devtools-native-storage-contract.md)       |
| 旧 US-904c                        | [US-904 阶段 D](stories/future/US-904-devtools-native-storage-contract.md)       |
| US-905a + 905b                    | [US-905](stories/future/US-905-tauri-native-devtools.md)                         |
| 旧 US-904 / 904b / 905 三份父契约 | 合并为唯一的 [US-904](stories/future/US-904-devtools-native-storage-contract.md) |

各轮落定的决策：

- **协议缺陷（P0，第五轮）**：v1/v2 协商窗口原以 panel 初始化起算，但 connector bootstrap 与 content script
  注入（要等 `chrome.permissions.request` 用户授权，延迟无上界）都可能晚于 panel，计时器会在任何一条握手到达前
  过期，让「双方都支持 v2」稳定退回 v1——同一「双方永久互等」的失败模式在
  [bridge.ts](../apps/rxdb-devtools-extension/src/content/bridge.ts) 已有先例注释。改为**证据触发**：
  panel 在无 session 状态下每次观察到 legacy HANDSHAKE 都补发一次 `PROTOCOL_HELLO`，1,000 ms 窗口从首次暂存起算
  且只启动一次，无 session 的迟到握手不算非法帧，v1 facade 进入后为终态并置降级标记。
- 冻结 `crypto.randomUUID()` 在非安全上下文（扩展显式接受 `http:` 页面）不可用，须用 `getRandomValues` 构造 v4；
  补齐流式 transfer 的 15 秒 idle + 10 分钟总时长两道时限与 `transfer_timeout`（原文引用了一个从未定义的值）。
- **依赖与安全契约（第三轮）**：阶段 A 只门禁 Electron 侧，阶段 B 与其并行且不阻塞 Tauri；
  wire v2 保留一个 minor 的 v1/v2 迁移桥，provider 改用语义 kind，冻结 capability/descriptor/mutation policy、
  流式 transfer 与有界 immutable snapshot。
- **INVEST（第四、五轮）**：当轮的 US-904b 横跨控制面、provider 数据面与 UI/Chrome 迁移，Small 不成立，
  据此切出「行为中性的面板抽取」与「行为收敛的 Chrome v2 迁移」两段；合并后以**故事内两阶段**表达，
  并硬性要求两阶段是独立 PR/commit 序列，阶段 1 的 diff 不得含 wire 类型、错误码或权限判定变化。
- 同轮关闭六个缺口：background 代 ACK 导致的 v2 降级、`none` 事件泄漏、无界 ID tombstone、
  跨 transport binary/数值歧义、平台错误分叉、snapshot 等锁无 deadline。
- 并行性最终形态不变：US-904 阶段 C1 ∥ 阶段 B，US-905 阶段 1 ∥ US-210 / US-505。

### 2026-08-15 — 新建 epic-008 生命周期作用域，登记 US-013 / US-014 / US-015

- 新建 [epic-008](epics/epic-008-lifecycle-scope.md)，登记
  [US-013](stories/core/US-013-lifecycle-scope-primitive.md) /
  [US-014](stories/core/US-014-plugin-scope-contract.md) /
  [US-015](stories/core/US-015-plugin-inject-dependency.md)：把仓库内已存在的九处
  「登记副作用 → 拆卸时撤销」手工账本收敛成一个作用域原语。这是把既有实现缺口登记成故事，**不是新增产品范围**。
- 判据是既有泄漏而非设计偏好：[graph 插件](../packages/rxdb-plugin-graph/src/plugin.ts#L33-L35) 的 `destroy()`
  是空的且**契约里没有位置可写**（`#repository_config_map` 只有 `.set` / `.get`，无反注册 API）。
- 同日把 US-015 降为父契约故事，切片指派给待创建的 `US-015a` / `US-015b`，US-016 / US-017 从 epic 目标转为待创建故事。
  该轮不产生任何计数变化，且两个子文件始终未落盘——**这正是 2026-08-16 取消整套子故事约定的直接诱因**，
  US-015 已回退为普通可交付故事，两个切片改为它的阶段 A / 阶段 B。

### 2026-08-15 — epic-006 二次评审与 US-306 拆分

- 复核发现历史 bridge `v0.0.25` 的 tagged commit 经后续 squash 脱离当前发布主线，不能通过 migration gate 的
  ancestor 校验。US-305 改为从 release manifest 读取当前主线上的有效 bridge；禁止移动或重打历史 tag。
- metadata-only 远端分支首次切换改为 durable materialization staging：冻结终止水位/scope，分页落盘，最终 switch
  事务一次性物化；现有绑定当前分支并直接写业务表的 pull 路径不能直接复用。
- Index 独立重放闭包补齐跨事务实体关系依赖，覆盖 Parent→Child INSERT、Child→Parent DELETE、关系键更新与环。
- `CommitConflict` 收敛为一次性命令诊断；durable `status().conflicted` 只由 restore session 派生。
- restore 固定为只生成未暂存工作树，流程明确为 `restore → stage → commit`。
- US-306 保留为父契约并拆出三段，分别承接写入口捕获、Index/commit 状态机、三框架与性能门禁
  （2026-08-16 合并回 US-306 的阶段 A / B / C）。
  派生统计 Backlog 11 → 14，合计 47 → 50；这是既有范围拆分，不是新增产品范围。

### 2026-08-15 — 新增 US-601 与 epic-007（缺口登记，非新增范围）

- 上一条 US-209 收尾留下的「扫描子路径**导出表面**」缺口由新故事
  [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领（`Backlog`）。
  **缺口在它交付前依然敞开**：`KNOWN_UNCOVERED_SUBPATHS` 只守清单，不守表面。
- 新建 [epic-007 公开 API 门禁](epics/epic-007-public-api-gates.md)：门禁不是产品能力，
  挂进 epic-001~006 会让那个 epic 的愿景失真。它同时收纳另外两处**尚无故事认领**的门禁缺口
  （迁移发布的三个 git 钩子只在打 tag 时跑、手工发布无 `pnpm test-all` 前置校验）。
- 新建 `stories/tooling/`，占用此前未分配的编号段 **US-601~699**。
- 派生视图同步：`status-overview.md`（Backlog 11 → 12，合计 46 → 47）、`README.md`
  （目录表、P2 排期建议、约束 7）、`versioning-policy.md` 与 `api-surface.mjs` 的「尚无故事认领」措辞。
- 顺带修一处派生视图漂移：`epic-004` 的故事列表缺 US-210（`status-overview.md` 一直列着）。

### 2026-08-15 — US-209 小程序适配器门禁与文档收尾（In Review → Done）

- `@aiao/rxdb-adapter-miniprogram` 登记进 `scripts/audit/coverage-baseline.json`（99/97/100/100，向下取整）。
  这是**趋势基准**而非门禁开关：`coverage-check.mjs` 的 80%/90% 硬阈值对所有非 private 包一直生效，
  本包此前已被卡着；登记后才有「比上次低」的回归警告。原 story 里「不受门禁保护」的措辞已修正。
- AC#8 子路径决策落定为「**导出表面**记录为已知不覆盖」：`api-surface.mjs` 新增 `KNOWN_UNCOVERED_SUBPATHS`
  （8 个公开包共 12 个入口）作为清单真相源，`subpath-inventory.mjs` 把**清单本身**纳入门禁——
  新增/删除子路径不同步清单即 CI 红。扫描子路径导出表面仍是未认领缺口。
- 策略文档双向对齐：`requirements/versioning-policy.md` 与对外的 `website/docs/versioning.md`
  同时写明子路径属于公开 API 但表面不受基线保护，消除「基线守护全部公开 API」的错误承诺。
- 文档口径收敛到「实验性、仅微信」：`website/docs/compatibility.md` 新增能力边界专节
  （平台/并发/日志模式/崩溃恢复/数据量/随机源/全文搜索），原「浏览器能力 × 适配器」表扩为「运行时能力 × 适配器」；
  根 `README.md` 不再声称支持 Alipay。
- `examples/README.md` 声明示例目录不在 CI 覆盖范围（独立 pnpm workspace、无 `project.json`、依赖已发布版本），
  改动后须手工验证。
- `packages/rxdb-adapter-miniprogram/src/index.ts` 删除逐字重复的 `@packageDocumentation` 块。

### 2026-08-01 — US-303 / US-304 迁移隔离拆分

- US-303 的 change codec、原子系统迁移、回滚重试、历史/branch/跨 Tab 兼容均已验收，状态转为 Done。
- 原 US-303 AC13 转移到新的 US-304；接收 story 以 `inherited_acs` 机器可读地记录来源。
- US-304 负责先发布旧格式兼容的 writer lease/guard 桥接协议，再实现 drain barrier、fencing、stale writer 拒绝和跨 realm/进程迁移 gate。
- Epic 005 继续 In Progress，发布门禁新增 US-304；不再把无法由当前版本单独满足的协议前置条件伪装为 US-303 未完成代码。

### 2026-07-31 — 事务执行器 C2 落地 + bigint/binary origin 隔离

**事务执行器重构（C2）**

- 新增 `SqliteTransactionExecutor`（`packages/rxdb-adapter-sqlite-core`）与 `PGliteTransactionExecutor`（`packages/rxdb-adapter-pglite`），作为对应适配器的 `TransactionExecutor` 实现
- 适配器 `transaction()` 回调签名由 `(client)` 收紧为 `(executor: TransactionExecutor)`；零参回调仍然兼容，TypeScript 自动允许形参更少
- `MigrationType.up()` 签名由 `()` 改为 `(executor: TransactionExecutor)` —— `up()` 是唯一能在事务体内运行的用户代码，必须把 executor 交给用户，否则用户在 `up()` 里的写会落回队列并永久挂起
- `mergeChanges()` 加在 **executor** 上而非 `adapter.mergeChanges()` 加 executor 形参：「持有 executor 才算在本事务内」必须只有一处判据；同步链路里 4 个事务体的主力写正是它
- `runInTransaction()` 复用当前事务的 executor（新增 `#current_executor`，**仅**服务这一个遗留入口）；C2 翻转时与 `#transaction_lock` 一并删除
- 隔离契约套件：增加 `transaction-executor.spec.ts`，sqlite-wasm 5/5 与 PGlite 5/5，包含「逃逸的 executor 在 committed / rolled-back 两条路径上都抛错」
- 设计文档同步更新：`code-reviews/transaction-executor-design.md` §6.2 / §6.2.1 / §6.2.2 / §6.3
- 公开 API 基线变化：`@aiao/rxdb` 暴露的 `TransactionFun` 回调参数类型由 `SqliteClientLike` 升级为 `TransactionExecutor`，新导出 `mergeChanges()` / `executor.run()` 等事务作用域 API

**bigint/binary origin 深度克隆**

- `transaction_pglite_result.ts` 与 `transaction_sqlite_result.ts` 在 `forcedUpdate` 时改用 `structuredClone(entityData)` 写入 `status.origin`，避免实体引用与 origin 共享同一 `Uint8Array` / 复杂对象
- 替代原有 `{ ...entityData }` 浅克隆 —— 浅克隆对 `Uint8Array` 等引用类型只复制引用不复制字节，原地修改 entity 字段会污染 origin 快照
- 公开行为对调用方不变：`status.origin` 仍是变更前的快照；新增保护是 silent data corruption 的修正式修复

**实体 Proxy 对 binary 重赋值的 patch 追踪**

- `proxy.ts` set 陷阱新增 `isBinaryReassignment` 分支：`binary` 字段原地修改不触发 patch，新引用赋值（即使字节相同）必须登记为变更
- 配套 2 条 vitest 用例（`proxy.spec.ts`）覆盖「就地修改 → 不登记」「新引用赋值 → 登记」
- `shared-bigint-binary-entity.suite.ts` 增 1 条用例验证 save 流程；`bigint-binary.suite.ts` 增 2 条用例覆盖 encrypted binary（in-place 静默 / 新引用生效 / undo 回到原始字节）
- 同步覆盖到 PGlite 测试与 system schema migration 测试（`migration-watermark.spec.ts` 已加 executor 适配）

**EntityStatus typed-id 指纹防碰撞**

- 新增 vitest 用例（`entity-status.spec.ts`）断言 `1`、`1n`、`'1'` 三种 typed id 生成的 query fingerprint 互不相同
- 为 `US-303 change codec` 中「query fingerprint / history scope key / change action key 必须区分 bigint、number 与 string」AC 提供先行护栏

**system schema 迁移套件加固**

- `shared-system-schema-migration.suite.ts` 旧 UUID 升级用例新增 Todo 实体行重建 + `versionManager.createBranch` + `history.undo`，验证迁移后业务实体可正常纳入版本历史与撤销
- PGlite 同构测试（`system-schema-migration.spec.ts`）：新增真实磁盘库重连升级用例 `RxDB.connect 自动升级磁盘旧库，旧 change 可切换分支并撤销`，覆盖更接近生产环境的迁移路径

**影响范围**

- `@aiao/rxdb`：事务回调签名；`MigrationType.up` 签名；`TransactionExecutor` 接口新增 `mergeChanges`
- `@aiao/rxdb-adapter-sqlite-core`：新增 `SqliteTransactionExecutor`，内部 helper 形参放宽到 `SqlStatementSink`
- `@aiao/rxdb-adapter-pglite`：新增 `PGliteTransactionExecutor`
- 所有调用 `rxdb.transaction(...)` 的既有代码（无参形式）仍可编译运行 —— TS 允许回调形参更少
- 自定义 migration 必须能接 `(executor)` 形参，否则迁移中的数据写入将永远挂在队列上

### 2026-05-15 — query-builder 系列清理

- 删除 US-401 查询构建器 UI、US-701 查询构建器
- 后续若以新的形态重做，将开新编号 story（不复用 US-401 / US-701）

**保留作为参考**：

- `IQueryBuilder` / `IRule` / `ICombinator` 等 where 条件类型仍保留在 `@aiao/rxdb` 入口，所有 Repository 的 `find/findAll/observe` 仍以该类型为参数 — 未来 UI 实现可直接复用
- 原 spec 文件可从 git 历史取回（删除于 commit `35f0ccdf`，路径 `requirements/stories/ui/US-401-query-builder-ui.md`、`requirements/stories/future/US-701-advanced-query-builder.md`）

**前置条件（重启 story 前满足）**：

1. 三框架 (`rxdb-{angular,react,vue}`) 完成 P0 稳定性（拖拽、虚拟滚动、批量操作的 e2e 回归零失败）
2. 决定 UI 形态：Visual Query Builder 还是 SQL-like DSL；若选前者，需先评估 `react-querybuilder` 等三方件的 Vue/Angular 端可移植性
3. 与 `rxdb-plugin-search` 的关系定义清楚（全文 vs. 结构化查询的 UX 边界）

## 计数演进归档

2026-08-13 / 08-15 两轮评审在 `status-overview.md` 里留下过一串递进计数（`Backlog N → M，合计 X → Y`）。
这些数字**只在当轮分支内自洽**，已被 2026-08-16 的 `main` 合并整体作废，此处仅归档动作本身。
当前计数一律由真相源推导：`grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c`。

| 日期       | 动作                                                                            | 当轮记录的计数变化                                                          |
| :--------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------- |
| 2026-08-13 | US-012 拆 a/b/c、US-207 拆出 US-208、US-305 升级为 epic-006 并拆 305~308        | Backlog 4 → 11（拆分，非新增范围）                                          |
| 2026-08-13 | 补写 US-209（实现早已合并，直接记 `In Review`）                                 | 合计 +1                                                                     |
| 2026-08-13 | US-207 二次拆分，Tauri 半边迁至 US-210；US-207 收敛到 Electron 转 `In Progress` | 合计 45 → 46，Backlog 仍 11                                                 |
| 2026-08-15 | 新增 US-601 + epic-007 + `stories/tooling/`                                     | Backlog 11 → 12，合计 46 → 47                                               |
| 2026-08-15 | US-210 开工                                                                     | Backlog 12 → 11，In Progress 2 → 3                                          |
| 2026-08-15 | US-306 拆出三段（后合并回阶段 A/B/C）                                           | Backlog 11 → 14，合计 47 → 50                                               |
| 2026-08-15 | 新增 US-504 / US-505                                                            | Backlog 11 → 13，合计 47 → 49                                               |
| 2026-08-15 | 新增 US-904                                                                     | Backlog 13 → 14，合计 49 → 50                                               |
| 2026-08-15 | 新增 US-905                                                                     | Backlog 14 → 15，合计 50 → 51                                               |
| 2026-08-15 | epic-008 新建，登记 US-013 / US-014 / US-015                                    | Backlog 14 → 17，合计 50 → 53                                               |
| 2026-08-15 | US-015 降为父契约（子故事文件未落盘，已于 08-16 回退）                          | 无变化，父故事 2 → 3                                                        |
| 2026-08-15 | US-904 / US-905 第二至第五轮拆分                                                | Backlog 15 → 24，合计 51 → 60                                               |
| 2026-08-15 | US-209 收尾转 `Done`                                                            | Done 32 → 33，In Review 1 → 0                                               |
| 2026-08-15 | US-504 交付转 `Done`                                                            | Backlog 24 → 23，Done 33 → 34                                               |
| 2026-08-15 | US-904 / US-905 链文档整合为 6 篇（11 篇 → 6 篇，含重编号）                     | Backlog 23 → 18，合计 60 → 55                                               |
| 2026-08-16 | US-505 开工                                                                     | Backlog 18 → 17，In Progress 3 → 4                                          |
| 2026-08-16 | US-904b 交付转 `Done`                                                           | Backlog 17 → 16，Done 34 → 35                                               |
| 2026-08-16 | 合并 `main`                                                                     | 以上递进全部作废；重新推导为 Done 35 / In Progress 4 / Backlog 22 / 合计 61 |
| 2026-08-16 | 10 个 `US-XXXa/b/c` 子故事文件合并回 4 个父文件                                 | Done 35 → 34，In Progress 4 → 5，Backlog 22 → 12，合计 61 → 51              |

## 依赖锁定记录

### `@codemirror/view` 钉死 `6.42.1`

`packages/code-editor-{angular,react,vue}/package.json` 与根 `package.json` `dependencies` 已显式锁定 `@codemirror/view: 6.42.1`（无脱字符），并在根 `overrides`（npm 兼容）与 `pnpm.overrides`（pnpm 优先读）双写以阻止任何间接依赖把它 hoist 回 `^6.43.0`。

**状态**：TECH DEBT。原始锁定 commit 未保留根因记录。

**解锁前 checklist**（任一未满足都保留 pin）：

1. 升级到 `@codemirror/view@latest` 并跑 `pnpm nx affected -t test build e2e --base=origin/main`
2. 跑 `pnpm nx run dev-rxdb-angular:serve`、`dev-rxdb-react:serve`、`dev-rxdb-vue:serve` 各打开 code-editor 演示页，验证编辑/合并视图无 console 错误
3. 跑 `pnpm nx test code-editor-angular code-editor-react code-editor-vue --coverage`
4. 检查 `@codemirror/state` 当前 minor (`^6.5.4`) 与目标 `@codemirror/view` minor 的 changelog，确认无 ABI 破坏

若 1-4 全过，移除根 `package.json` 的 `dependencies`/`overrides`/`pnpm.overrides` 三处 pin，并在本节追加 `解锁日期 + commit hash`。

## Spec 关闭快照

_当前仓库无遗留的 spec 关闭快照。_
