---
id: US-904
title: DevTools 原生本地存储调试
status: In Progress
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-09-01
tags:
  [tooling, devtools, desktop, electron, protocol, provider, security, transfer, snapshot, conformance, chrome, browser]
decision: supported
evidence: ./US-904-phase-a-evidence.md
---

<!--
INVEST 检查清单:
- [x] Independent: 阶段 A/B 无协议前置；阶段 C 阶段 1 只依赖现有 v1 面板；只有阶段 D 受
      US-207 / US-504 与阶段 A 结论约束，对应 host 关闭前不得实现该 provider
- [x] Negotiable: 内部服务、adapter 组织与 fixture 形态可在 plan 阶段决定，wire 与安全边界不可漂移
- [x] Valuable: Chrome、Electron、Tauri 共用协议、provider 语义、面板与错误模型
- [x] Estimable: 版本选择、session、授权、ID 预算、binary 编码、transfer/snapshot 状态机与错误映射
      均有固定状态机与数值上限
- [ ] Small: 体量偏大——同时覆盖运行时可行性实证、完整 v2 协议、Angular 面板抽取、Chrome 四段 relay
      迁移与 Electron 真实链路。按「交付阶段」表的 A / B → C → D 顺序分批交付，每个阶段有独立可验收的
      AC 区段；不拆成独立故事文件
- [x] Testable: 扩展加载、协商、数据面、文件操作、安全边界与三平台证据在每个阶段都有独立 AC
-->

# 用户故事：DevTools 原生本地存储调试

> 本文件是 Chrome / Electron / Tauri 三条 surface 共享的运行模型、协议不变量、能力矩阵、安全边界与
> 发布约束，**同时**是 Electron 侧全部实现的交付载体。Tauri 侧的窗口、transport 与 native provider
> 由 [US-905](./US-905-tauri-native-devtools.md) 单独交付，只消费本文件冻结的共享产物。

## 交付阶段

| 阶段 | 交付                                                    | 直接前置                                     | AC 区段   | 状态                                                                                        |
| ---- | ------------------------------------------------------- | -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| A    | Electron 43 + 当前 MV3 扩展 stop/go 实证                | 无                                           | AC#1～6   | ✅ 已交付（supported）                                                                      |
| B    | v2 控制面（协商/session/授权/ID 预算）+ provider 数据面 | 无                                           | AC#7～30  | ✅ 已交付（5 条保留）                                                                       |
| C    | 私有 Angular 面板 library + Chrome 四段 relay v2 迁移   | 阶段 B（仅其阶段 2）                         | AC#31～44 | 🚧 C1 已交付（AC#34 待人工浏览器回归）；C2 已交付（AC#38/#39 待跨版本实证，#42 待人工回归） |
| D    | Electron desktop SQLite / native files 接入与真实 E2E   | 阶段 A(supported) + 阶段 C + US-207 / US-504 | AC#45～53 | ⬜ 未开始                                                                                   |

- 阶段 A 与阶段 B 相互独立，可并行开工；阶段 C 的阶段 1（行为中性抽取）也可与阶段 B 并行。
- 阶段 B 已交付：本包内的 v2 协议、provider 数据面与 conformance suite 全部落地，5 条 AC 因只能由真实
  链路关闭而保留为 `⚠️`（见「保留项：fake 关不掉的 5 条」）。
- 阶段 A 的结论写在本文件 frontmatter 的 `decision` / `evidence`。`decision: unsupported` 时**只有阶段 D**
  转 `Blocked` 并记录替代故事，阶段 B / C 的共享链与 US-905 继续推进；本故事整体 `status` 相应转
  `Blocked` 并在此处注明。全部阶段关闭后才置 `Done`。
- **阶段 A 已交付，`decision: supported`**（见 [可行性记录](./US-904-phase-a-evidence.md)）：AC#1～#4 的
  全部关键项在 Electron 43.4.0 / Chromium 150 上真实通过，只用到一项可容忍差异（AC#3 的授权 UI）。
  阶段 D 不转 `Blocked`，但新增两个由实证带出的约束：**(a)** Electron 43 缺少整个 `chrome.permissions`
  命名空间，阶段 D 必须做显式能力探测与 Electron 专属授权路径，**不得写静默 fallback**；
  **(b)** 扩展面板只在 dock 模式（`mode: 'bottom'`）的 DevTools 中注册，`detach` / `undocked` 下根本不出现，
  阶段 D 的 E2E 必须固定 dock 模式。

## 作为/我想要/以便

**作为** 使用 Aiao 构建浏览器、Electron 或 Tauri 应用的开发者
**我想要** 在同一个 RxDB DevTools 面板中检查逻辑实体、实时事件、Storage metadata 与真实的物理存储（OPFS / 桌面 SQLite / 原生文件）
**以便** 不离开现有调试工作流，就能定位数据库记录、文件索引与文件本体之间的持久化不一致，而不会误查 WebView fallback

## 背景与缺口

现有扩展的 Database / Events / Storage 页通过 `@aiao/rxdb-devtools` 查询逻辑数据，理论上不依赖具体
adapter；但没有真实桌面 adapter 的集成证据。物理存储相关能力则明确绑定浏览器：

- OPFS 页直接通过 content script 调用 `navigator.storage.getDirectory()`；
- 数据库下载只在 OPFS 中搜索 SQLite 文件；
- 清理动作只处理 OPFS、IndexedDB 与 localStorage；
- inspected page 权限只接受 `http:` / `https:` / `file:`，没有桌面接入流程。

因此桌面应用即使已经使用 [US-207](../adapter/US-207-desktop-local-database.md) /
[US-210](../adapter/US-210-tauri-sqlite-local-database.md) 的原生 SQLite 和
[US-504](../plugin/US-504-electron-local-file-storage.md) /
[US-505](../plugin/US-505-tauri-local-file-storage.md) 的原生文件后端，扩展仍可能展示错误的 WebView
存储、执行无效清理，或把「未清理桌面数据」误报为成功。

## 运行模型

三条 surface 共用同一套面板、协议状态机与 provider 语义，只有 transport 段不同：

```text
Chrome:   shared panel → chrome.runtime.Port → MV3 service worker → content script → inspected page connector
Electron: shared panel（unpacked MV3 扩展）→ 同上四段 → renderer connector → preload → main/host（US-207 / US-504）
Tauri:    shared panel（rxdb-devtools WebView window）→ 定向 Tauri transport → main WebView connector → Rust host（US-210 / US-505）
```

- Tauri WebView 不支持安装 Chrome Manifest V3 扩展，因此 **不承诺「把 CRX 装进 Tauri」**；它复用面板与
  协议，以标签固定的受限调试窗口承载。
- 调试窗口 / 扩展都不是第二个 RxDB writer：不直接打开 SQLite，不持有文件根句柄或业务
  service 实例，只通过宿主页面中的 connector 使用受限调试能力。

## 依赖图与门禁

```text
阶段 A ──────────────────────────────────────┐（仅门禁阶段 D）
阶段 B ──→ 阶段 C ──┬──→ 阶段 D ←── 阶段 A(supported) + US-207 + US-504
                    └──→ US-905  ←── US-210 + US-505（仅其阶段 2）
US-210 → US-505
```

- **阶段 A** 只门禁阶段 D；结论不阻塞平台无关共享链和 Tauri。必须在 frontmatter 写入 `decision` /
  `evidence`；`unsupported` 时阶段 D 转 `Blocked` 并记录「按 US-905 的受限窗口模型另立 Electron 承载
  故事」为替代路径，不能永久留在普通 Backlog。
- **阶段 C 的阶段 1**（行为中性的面板 library 抽取）在现有 v1 wire 上完成，**可与阶段 B 并行开工**；
  只有其阶段 2（v2 切换与 relay 改造）门禁在阶段 B。
- **US-905 阶段 1**（窗口 + transport + fake provider）只依赖阶段 C，可与 US-210 / US-505 并行；
  只有其阶段 2（真实 native provider）等待它们。
- US-905 之所以门禁在阶段 C 而不是阶段 B，是因为 **Chrome 是 v2 的参考实现**：先有一个真实平台
  跑通四段 relay，Tauri 才不会成为第一个发现协议缺陷的地方。
- 桌面集成只消费已冻结的共享产物，不得反向增加平台私有 wire、kind、错误码或 fallback。

## 能力矩阵

| 运行时 / 后端                         | 逻辑数据库 / 事件  | 物理文件页         | 数据库下载 / 清理                           | 承载   |
| ------------------------------------- | ------------------ | ------------------ | ------------------------------------------- | ------ |
| Chrome / Web（OPFS）                  | 保持现状           | 现有 OPFS provider | 下载 unsupported；清理保持现状              | 阶段 C |
| Electron / desktop SQLite（US-207）   | `rxdb`             | 不适用             | 下载 unsupported；清理按 provider 能力启用  | 阶段 D |
| Electron / native files（US-504）     | metadata 经 `rxdb` | `native-files`     | 下载 unsupported；文件操作限插件专用根      | 阶段 D |
| Tauri / wa-sqlite `OPFSCoopSyncVFS`   | `rxdb`             | `opfs`             | 下载 unsupported；清理按 `settings: opfs`   | US-905 |
| Tauri / wa-sqlite `IDBBatchAtomicVFS` | `rxdb`             | `unavailable`      | 下载 unsupported；清理按 `settings: idb`    | US-905 |
| Tauri / wa-sqlite `unavailable`       | `unavailable`      | `unavailable`      | 下载与清理均 unsupported，不创建 fallback   | US-905 |
| Tauri / US-210 SQLite                 | `rxdb`             | `unavailable`      | 下载 unsupported；清理按 `settings: sqlite` | US-905 |
| Tauri / US-505 native files           | metadata 经 `rxdb` | `native-files`     | 下载 unsupported；文件操作限插件专用根      | US-905 |

- 表中 `database` / `files` / `settings` 是**可组合能力，不是互斥运行模式**：US-207 SQLite 与 US-504
  native files 会在同一 session 同时出现，US-210 与 US-505 同理。
- wa-sqlite demo 必须按运行时**实际选中**的 VFS 声明能力，不得从 adapter 名称、URL 或平台推断 OPFS。

## 共享不变量

跨全部阶段与 US-905 生效；具体数值、状态机与错误联合以「阶段 B — v2 协议」为唯一真相源，
其他文件只引用、不复述。

- **宽外层、严内层。** 外层只识别来源、方向、消息类和版本范围；选定版本后使用 exact-key guard。
  没有共同版本时返回结构化 `protocol_unsupported`，不建立 session。
- **ACK 所有权只有一处。** relay（background / content / transport）不得代替 panel 提前 ACK；
  v2 胜出后不能短暂进入 v1 或建立第二个 session。
- **session 不是授权凭据。** `sessionId` 由 connector/provider owner 生成，只绑定生命周期与路由。
  同源脚本可以观察并伪造页面消息，因此每个操作必须同时通过 `DevToolsCapability`、descriptor 操作
  白名单和 provider host 的二次校验；wire 中回显的 capability / policy 不得成为权限来源。
- **授权三层矩阵。** `none` 只允许生命周期（握手、PING、`CLEAR_EVENT_BUFFER`、DISCONNECT）；
  `readonly` 才允许实体/事件/branch 读取、诊断、文件浏览与下载；`full` 才允许 branch 与文件变更。
  文件 mutation 与 `settings.clear` 还要求 provider owner 从可信配置显式注册 `mutationPolicy: allow`，
  省略即只读。`none` 不创建事件订阅、不写 buffer，也不发送任何业务数据。
- **语义 kind，不是平台分支。** `database` 为 `rxdb | unavailable`；`files` 为
  `opfs | native-files | unavailable`；`settings` 为 `opfs | idb | sqlite | unavailable`。
  `runtime: browser | electron | tauri` **只用于显示**，不能决定行为。
- **命名收敛。** v2 生命周期命令为 `CLEAR_EVENT_BUFFER`，Settings 数据清理由 `settings.clear` 表达，
  不复用含糊的 legacy `CLEAR`；v1 facade 只在边界内映射旧命令。
- **有界资源。** 同一 session 的在途数与终态 ID 记录都有硬上限；达到总预算后轮换 session，不以无界
  tombstone 换取「永不复用」。
- **统一 binary wire 与数值 guard。** 使用 RFC 4648 base64 与 decoded-byte 计量；所有大小、索引、
  offset、页数和版本字段必须是范围内的 safe integer，NaN、Infinity、负数、溢出与非规范编码必须在
  分配资源前拒绝。
- **穷举错误联合。** provider 的业务失败与协议失败共用同一联合；DOMException、Node error、Rust error
  和绝对路径只能映射到共享错误码，不得穿透 transport，也不得临时发明平台私有码。
- **snapshot 的 deadline 从请求进入开始**，覆盖等锁、物化、重试、分页资源登记与取消，不能只计算持锁时间。
- **事件清单以导出的 `RXDB_EVENT_TYPES` 为唯一真相源**，不硬编码数量。
- **面板平台无关。** 面板 UI、状态服务与 provider 消费逻辑只依赖 transport token；Chrome runtime /
  PortService / `ipcRenderer` / Tauri global 只能作为该 token 在各 app 侧的 adapter。
- **同一 conformance suite。** Chrome、Electron、Tauri 通过薄 transport driver 运行同一套断言；
  fake driver 不能替代真实 Chrome Port/background/content relay 或真实桌面 host E2E。
- **v1 bridge 至少保留一个 fixed release 次版本**；删除前同步迁移文档、扩展最低 connector 版本与发布说明。
  兼容形态在阶段 C 的 plan 阶段二选一并写明理由：**完整 facade**（旧 connector 继续可用，但要长期维护
  两套语义映射，且必须写明维护到哪个版本）或**版本闸门**（只回一条「connector 版本过低，请升级到 ≥ X」
  并停止会话，维护成本低但直接打断旧应用的调试）。
- **私有面板 library。** `modules/rxdb-devtools-panel/` 住在 `modules/` 而非 `packages/`，沿用本仓
  `modules/angular`、`modules/angular-todo` 的既有范式：**不进 pnpm workspace，只经 tsconfig paths
  以源码嵌入被消费**（见 `pnpm-workspace.yaml` 的注释）。依赖关系由 Nx 项目图承担——`nx graph` 会记录
  `rxdb-devtools-extension → rxdb-devtools-panel` 的 static 边，与 `dev-rxdb-angular → angular` 同理，
  因此「源码别名让依赖不可见」这一风险不成立。它落在 `packages/*` 之外，天然不增加公开 npm 包数量、
  不进 API baseline、不进 fixed release group，无需任何否定匹配或 `private` 豁免；package manifest 仍设
  `private: true` 作为本地 `npm publish` 的兜底闸。
- **开发态隔离。** 扩展加载 / 调试窗口只在显式开发配置下启用；默认生产包不包含、不自动启用，
  release 产物不含调试 bootstrap、专用 command 或只服务调试窗口的 capability。

## 全链 Out of Scope

- 在用户的普通生产包中捆绑或默认开启调试扩展 / 调试窗口
- 在 Tauri 中加载 Chrome CRX、MV3 service worker、content script 或 `chrome.*` API
- 暴露绝对数据库路径、应用数据目录、任意文件选择器、shell、原始 IPC、通用 `invoke` 或 Node API
- 任意 SQL 控制台、schema 修改器、SQLite 修复器、VACUUM、数据库导入导出或格式转换
- SQLite / WAL 热拷贝、一致性备份和 export lease。可靠导出需要 adapter 参与阻止重连并生成一致快照，
  必须另立故事；本故事只**禁用**当前不安全入口（数据库下载在 browser / Electron / Tauri 一律返回
  `export_unsupported`，执行路径零 OPFS / SQLite / WAL 读取）
- 原生文件内容编辑器、十六进制预览、大文件全文预览或远端 blob 同步
- 修改 US-207 / US-504 / US-210 / US-505 的持久化布局、事务、路径编码、原子写入、锁、补偿、备份域与
  写入语义
- Tauri mobile（iOS / Android）、远程设备调试、浏览器远程 attach 或网络调试服务
- 将共享 Angular 面板发布为公共 npm 包
- Tauri 的窗口、transport 与 native provider —— 属 [US-905](./US-905-tauri-native-devtools.md)

> 禁用不安全数据库下载、对超过 `maxTransferBytes` 的传输显式报错、`none` 档零泄漏收敛属于**安全收敛**，
> 不受「用户可见行为不变」约束；不得为了「回归不变」保留热拷贝、全 origin 遍历或 basename 猜归属。

---

## 阶段 A — Electron 43 MV3 可行性门禁

只回答一个问题：工作区锁定的 Electron 43 能否运行现有 Chrome MV3 DevTools 扩展的完整链路。

### In Scope

- 用当前 `rxdb-devtools-extension` 构建产物和最小 Electron 页面执行 `loadExtension`
- 验证 MV3 service worker 启动、`chrome.devtools.panels` 创建面板、`chrome.scripting` 注入、按需
  host permission 与 runtime Port 双向消息
- 固定 Electron、Chromium、扩展 manifest 与构建版本，保存逐项 supported / unsupported 结果和失败日志
- 验证开发进程退出后 extension session、service worker 与 Port 均释放
- 形成 stop/go 结论：只有全部**关键项**supported 才解锁阶段 D；平台无关的阶段 B / C 共享链不受本门禁影响

### 关键项与可容忍差异

「关键项」不是「全部 AC 逐字通过」，必须先冻结以下清单，否则门禁无法判定：

| 判据                                                   | 级别                  | 依据                                                             |
| ------------------------------------------------------ | --------------------- | ---------------------------------------------------------------- |
| AC#1 `loadExtension` + MV3 service worker 启动         | 关键，任何失败即 stop | 没有 service worker 就没有四段中继，Chrome 扩展形态整体不成立    |
| AC#2 `chrome.devtools.panels.create` 与一次完整往返    | 关键，任何失败即 stop | panel 宿主与 relay 是阶段 D 的全部价值                           |
| AC#4 Port 断开与 session/worker 清理可观察             | 关键，任何失败即 stop | 泄漏的旧连接会让阶段 B 的 session 轮换在 Electron 上不可验证     |
| AC#3 `chrome.permissions.request` 按需授予 host 权限   | **可容忍差异**        | Electron 的 fixture 只加载受控本地页面，授权 UI 本身不是被测能力 |
| AC#3 `chrome.scripting` 在已获授权的 origin 上完成注入 | 关键，任何失败即 stop | 注入失败等于 connector 永远进不了页面                            |

- AC#3 的可容忍差异仅限一种形态：**Electron 开发 fixture 的扩展 manifest 改用静态窄 host permission**
  （只覆盖 fixture 自身 origin），从而绕过运行时授权 UI。必须在 `evidence` 中作为 variance 显式记录，
  并同时保留一条「Chrome 生产 manifest 未改动、仍为 `optional_host_permissions`」的核对
- 任何其他形式的降级（放宽 `<all_urls>`、注入到非 fixture origin、用 mock 顶替 `chrome.scripting`）
  都不算差异，直接判 `unsupported`

### Out of Scope（阶段 A）

- 抽取 `modules/rxdb-devtools-panel/`、修改正式 wire 或新增 provider
- 接入 US-207 SQLite、US-504 原生文件或任何业务数据
- 用 Chrome 成功、mock API 或渲染进程单测替代 Electron 43 证据
- unsupported 时直接实现独立 DevTools window；该分支必须先修改本文件的共享契约再另行排期。替代承载
  形态已经有现成蓝本——[US-905](./US-905-tauri-native-devtools.md) 阶段 1 的「受限调试窗口 +
  定向 v2 transport」模型，本阶段只负责点名它，不设计 Electron 版本

### 技术约束（阶段 A）

- fixture 必须运行真实 Electron 主进程与 DevTools，不能用浏览器 extension E2E、JSDOM 或 API stub 代替。
- 不为通过门禁修改生产权限、关闭 `contextIsolation`、开启 `nodeIntegration` 或暴露原始 IPC。
- 可行性代码必须与正式 provider 解耦，unsupported 结论也应能删除 fixture 而不留下运行时 fallback。
- `supported` 不是本阶段关闭的必然结果；可信的 `unsupported` 证据同样可以关闭本阶段，但必须填写
  `decision` / `evidence`，并把阶段 D 转为 `Blocked`，不能让它永久伪装成普通 Backlog。

---

## 阶段 B — v2 协议：控制面、provider 数据面与 conformance

**本阶段是 v2 全部数值、状态机与错误联合的唯一真相源**；阶段 C / D 与 US-905 只引用，不重定义。
真实 Chrome relay 由阶段 C 承接。

无协议前置。三个领域（`database` / `files` / `settings`）全部使用共享 fake provider 验收，
不等待阶段 A 或任何 native host。

### In Scope（阶段 B）

**控制面**

- v2 宽外层消息与 exact-key 内层 guard
- eager legacy HANDSHAKE、`PROTOCOL_HELLO`、v2 HANDSHAKE/ACK 和 v1 facade 的确定状态机
- panel/background/content/connector 四段 relay 的单一 ACK 所有权 contract fixture
- canonical UUID v4 `sessionId`，有界 `requestId` / `transferId` 生命周期和 session 轮换
- `none` / `readonly` / `full` 的授权矩阵、静默拒绝和零数据泄漏
- 控制面错误、超时、断连、迟到帧和资源清理 conformance

**provider 数据面**

- 三领域可辨识 provider descriptor、语义 kind、操作集合、runtime 显示信息和资源限制
- 文件 list/download/upload/create-directory/delete 的共享 request/response schema
- base64 binary wire、safe-integer guard、流式 transfer 状态机和内存/消息上限
- Storage metadata / committed files 的有界 immutable snapshot 与确定性字节计量
- 穷举 v2 provider error union、平台异常映射 contract 和完整 conformance suite

### Out of Scope（阶段 B）

- Angular panel 抽取、Chrome runtime 接线或浏览器页面回归（阶段 C）
- Electron transport 与 native host（阶段 D）、Tauri 全部内容（US-905）
- 数据库导入导出、SQLite/WAL 热备份和 export lease
- 原生文件布局、路径编码、原子写入和补偿算法；真实 provider 只能适配既有业务语义

### 控制面契约

#### 版本选择与 ACK 所有权

- `PROTOCOL_HELLO` payload 精确为 `{ supportedVersions: number[] }`；数组非空、降序、去重，最多 8 项，
  每项是 1～255 的正 safe integer。connector 选择双方共同支持的最高版本
- v2 connector 初始化时立即发送**字节级兼容现有 v1 guard**的 legacy HANDSHAKE，旧 panel 可由旧
  background 立即 ACK，无协商等待进入 v1 facade
- v2 connector 收到 `PROTOCOL_HELLO` 后发送 payload 精确为 `{ protocolVersion: 2, sessionId, capabilities }`
  的 v2 HANDSHAKE。connector 在**每次**收到合法 HELLO 时都要响应，不能因为已经发过 eager legacy
  HANDSHAKE 就把后到的 HELLO 当重复消息丢弃
- v2 HANDSHAKE_ACK payload 精确为 `{ protocolVersion: 2, sessionId }`。只有 panel 可以生成 ACK；新
  background/content 只校验和转发，禁止看到 HANDSHAKE 就自行合成 ACK
- 双方没有共同版本时返回 `protocol_unsupported` 和本端 `supportedVersions`，不建立 session
- 同一 transport connection 最多建立一个 session。重复 ACK、错误回显或交叉握手在分配 provider
  资源前拒绝；无 session 时的重复 HELLO 按下方补发规则处理，不算非法帧

#### 补发与 1,000 ms 决策窗口

握手窗口**不以 panel 初始化为起点**。panel 打开时 inspected page 的 connector 可能尚未 bootstrap，
content script 也可能还没注入（注入要等 `chrome.permissions.request` 的用户授权，耗时无上界）。
以 init 起算的计时器会在任何一条握手到达之前就过期，让「双方都支持 v2」的组合稳定退回 v1。
因此固定为**证据触发**：

- panel 在两个时机发送 `PROTOCOL_HELLO`：① 自身初始化时；② **每次在无 session 状态下观察到 legacy
  HANDSHAKE 时立即补发一次**。补发与暂存在同一 tick 完成，保证「connector 已存活」这件事一被证实，
  对端就立刻收到一次 HELLO
- 1,000 ms 决策窗口从**首次暂存 legacy HANDSHAKE**的那一刻开始计时。窗口只启动一次，后续 legacy
  HANDSHAKE 只替换暂存内容、不延长窗口，避免高频重握手的 connector 把窗口无限拖住
- 窗口内收到合法 v2 HANDSHAKE 必须选择 v2 并取消计时器；窗口到期时若仍只有暂存的 legacy
  HANDSHAKE，由 panel 发送 legacy ACK 进入 v1 facade
- **无 session 时迟到的 legacy HANDSHAKE 不是非法帧**，一律走上述暂存 + 补发 HELLO 路径。只有在
  session 已建立后到达的握手才按迟到帧拒绝
- v2 胜出后不得短暂进入 v1 状态，任何迟到 legacy/v2 握手都不能重置状态
- v1 facade 一旦进入即为**终态，直到 transport 重连**：此后到达的 v2 HANDSHAKE 被拒绝，同时置一个
  panel 本地可见的降级标记（提示重连以升级），不得中途切换协议版本或并存两个状态机

窗口起点改为证据触发后，「connector 存活 → 收到补发 HELLO → 回 v2 HANDSHAKE」只需要一个 relay
往返，1,000 ms 对本地四段 relay 有充足余量；而注入与授权造成的任意长延迟不再计入窗口。

#### 身份与有界 ID 生命周期

- `sessionId` 由 connector/provider owner 生成 canonical UUID v4；panel 只回显。session 关闭后永不复用
- connector 运行在被检查页面里，而扩展显式接受 `http:` 页面，`crypto.randomUUID()` 在非安全上下文
  （如 `http://192.168.1.10:4200` 这类局域网 dev server）是 `undefined`。实现必须用
  `crypto.getRandomValues()` 构造 v4（设置 version/variant 位），不得直接依赖 `randomUUID`，
  也不得回落到 `Math.random()`
- `requestId` / `transferId` 是 1～128 个 ASCII 字符，只允许 `[A-Za-z0-9._:-]`；非法值返回
  `invalid_identifier`
- 同一 session 最多 32 个在途 request、2 个在途 transfer、4,096 个终态 request ID 和 256 个终态
  transfer ID。终态 ID 在当前 session 内不得复用，分别返回 `request_duplicate` / `transfer_duplicate`
- 总 ID 预算耗尽返回 `session_budget_exhausted`，不再登记新操作。panel 等在途操作归零后执行
  DISCONNECT 并重新握手；断连会直接取消在途操作，不能边保留旧请求边偷换 session
- 实现只保存当前 session 的有限 tombstone；不得为「永不复用」建立跨 session 或无界历史集合
- 非流式 request 的端到端 deadline 为 15 秒，从通过 guard 开始计算；超时返回 `request_timeout`
- 流式 transfer 不适用端到端 15 秒（1 GiB 上限下必然误杀），改用两道独立时限：
  - **idle deadline 15 秒**：只有通过 guard 的 `TRANSFER_START` / `TRANSFER_CHUNK` /
    `TRANSFER_COMPLETE` 帧才刷新。被拒帧（非法 base64、乱序、越限等）一律不刷新
  - **总时长上限 10 分钟**：从 START 通过 guard 起算，覆盖整个 transfer。取该值是因为 1 GiB 上限下
    它等价于要求约 1.7 MiB/s 的最低吞吐，本地 IPC / Port 远高于此
  - 任一时限到期返回 `transfer_timeout`（属控制面错误，不进入 provider 错误联合），并按终态规则
    丢弃临时文件与资源

#### 能力与数据泄漏边界

| 最低 capability | 允许的操作                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| `none`          | HANDSHAKE、PING、`CLEAR_EVENT_BUFFER`、DISCONNECT                                          |
| `readonly`      | inspect/query/events/get branches；实体/事件/branch 读取、Storage 诊断、文件 list/download |
| `full`          | branch mutation、文件 upload/create-directory/delete 与 `settings.clear`                   |

- v2 不再使用含糊的 `CLEAR`：`CLEAR_EVENT_BUFFER` 只清本 session 的事件缓冲，不清数据库、Storage、
  OPFS 或文件；Settings 清理由 `settings.clear` 定义。v1 facade 可在边界内映射 legacy `CLEAR`
- `none` 不只是拒绝入站查询：connector 不创建 RxDB event subscription，不把事件写入 buffer，也不发送
  DB_INFO、EVENT、BRANCHES、实体、Storage、文件或错误中的业务数据
- `readonly` / `full` 只由 connector/provider owner 的本地可信配置决定；HANDSHAKE 和 descriptor 中的
  capability 是告知，不是权限输入。客户端回显或请求中的更高档位一律忽略
- capability 拒绝沿用静默丢弃，且 provider 调用、host 调用、订阅和资源分配次数均为 0
- descriptor 未声明或 mutation 未 opt-in 属于**已识别 provider 请求**，返回结构化 `provider_unsupported`，
  不能与 capability 拒绝混为一谈

#### 控制面错误

`protocol_unsupported`、`invalid_message`、`invalid_identifier`、`session_invalid`、`session_closed`、
`session_budget_exhausted`、`request_limit_exceeded`、`transfer_limit_exceeded`、`request_timeout`、
`transfer_timeout`、`request_duplicate`、`transfer_duplicate`。错误 envelope 不包含原 payload、实体值、
路径、SQL、文件内容或平台异常文本。

### provider 数据面契约

#### Descriptor 与授权

每个 session 恰有一份 descriptor 集合；每个领域最多一个 descriptor，payload 使用 exact-key union：

| 领域       | kind                                      | 可声明操作                                              |
| ---------- | ----------------------------------------- | ------------------------------------------------------- |
| `database` | `rxdb` / `unavailable`                    | inspect、query、events、get/switch/create/delete branch |
| `files`    | `opfs` / `native-files` / `unavailable`   | list、download、upload、create-directory、delete        |
| `settings` | `opfs` / `idb` / `sqlite` / `unavailable` | clear；export 固定存在但只返回 `export_unsupported`     |

- descriptor 精确包含 `domain`、`version: 1`、`kind`、`operations`、`runtime`、`limits`；operations 去重并
  使用协议定义顺序。`unavailable` operations 必须为空并带共享 reason code
- `runtime: browser | electron | tauri` 只用于显示；相同 kind 在三个 runtime 上运行同一 conformance，
  不得按 URL、adapter 名、平台或缺失字段推断行为
- provider 必须声明 `maxTransferBytes`。它是 0～1 GiB 的非负 safe integer；files 声明 transfer 操作时
  必须大于 0。browser OPFS 固定 50 MiB，panel/connector/provider 使用各自上限的最小值
- 文件 mutation 与 `settings.clear` 还要求 provider owner 从可信配置显式注册 `mutationPolicy: allow`；
  省略即只读。wire payload 中自称的 policy/capability 不参与授权
- connector dispatch 前校验，provider/host 执行前使用自身绑定的配置独立校验

#### 数值与 binary wire

- 所有协议数值必须通过统一 guard：`Number.isSafeInteger(value)`，并满足字段规定的非负/正数和上限；
  NaN、Infinity、`-1`、超过 `MAX_SAFE_INTEGER`、小数和数字字符串均返回 `invalid_message`
- `TRANSFER_CHUNK` 精确携带 `chunkIndex`、`offset`、`dataBase64`。`dataBase64` 使用 RFC 4648 standard
  alphabet、带规范 padding；解码后必须为 1～256 KiB。限制按**解码后字节数**计算，编码字符串长度
  只受 exact guard 推导，不作为文件大小
- 非规范 padding、URL-safe alphabet、非法字符、解码失败或重新编码不等于原文均返回
  `payload_encoding_invalid`，且不得重置 idle deadline 或分配/写入资源
- `totalBytes`、`offset`、`chunkIndex`、`pageSize`、`maxTransferBytes` 均为 safe integer；分页默认 100、
  最大 500，pageSize 必须为 1～500
- transport adapter 可以在自己的底层帧中编码字符串，但交给共享状态机的 v2 payload 必须保持上述形状；
  fake driver 不得用只有 structured clone 才能传递的 Uint8Array 偷换正式 wire

#### Transfer 状态机

- 并发数、总 ID 预算与两道时限见上文「身份与有界 ID 生命周期」
- idle deadline 只被通过 guard 的 `TRANSFER_START` / `TRANSFER_CHUNK` / `TRANSFER_COMPLETE` 刷新；
  被拒帧（`payload_encoding_invalid`、`transfer_sequence_invalid`、`transfer_size_exceeded` 等）不刷新
- 固定流程为 `TRANSFER_START → TRANSFER_CHUNK* → TRANSFER_COMPLETE`，任一方可发送
  `TRANSFER_CANCEL`。START 声明 `totalBytes`；超过协商上限返回 `transfer_size_exceeded`
- chunkIndex 从 0 连续递增，offset 从 0 开始且等于此前 decoded bytes 累计值。乱序、重复、不连续、
  空 chunk 或累计超过 totalBytes 返回 `transfer_sequence_invalid`
- COMPLETE 时累计字节必须等于 totalBytes，否则 `transfer_incomplete`。零字节文件只允许 START 后直接
  COMPLETE，不能发送空 CHUNK
- 只有 COMPLETE 全部校验通过才能提交临时文件。取消、超时、断连、错误和 session 轮换必须丢弃临时
  文件并释放资源；终态后的帧返回 `transfer_closed`，不能复活 transfer
- panel、connector、provider 和 host 逐块处理，不得把完整文件、完整 base64 或所有 chunk 同时缓存在
  renderer、extension service worker、WebView、Rust 或主进程内存

#### Immutable snapshot

- provider 在 storage 全局独占锁内同时物化 metadata 与 committed logical files，按
  `(logicalPath, id)` 排序后释放锁；临时文件、rollback journal 和未完成 transfer 只能由 committed-file
  枚举排除，panel 不猜名称前缀
- 规范记录固定为 JSON tuple `[side, logicalPath, id, size, contentVersion]`；`side` 为 `meta | file`，
  不存在的标量写 `null`。容量是每条 tuple 执行 `TextEncoder(JSON.stringify(tuple)).byteLength` 后求和，
  不计 transport envelope，所有实现使用同一 helper
- 每 snapshot 最多 100,000 条或 32 MiB 规范记录；任何一项超过立即返回 `snapshot_too_large`，不截断
- 每 session 只允许一个活动 snapshot；cursor 绑定 session/snapshot/page offset，page offset 必须落在已物化
  边界。60 秒无活动释放，后续页返回 `snapshot_expired`
- snapshot 端到端 deadline 固定 15 秒，从 request 通过 guard 开始，覆盖等待全局锁、物化、最多 3 次
  epoch 重试和资源登记。deadline 或重试耗尽返回 `snapshot_busy`；取消/断连立即中止等待和枚举
- 锁所有权丢失或 capture epoch 改变返回内部 invalidated 信号并以新 snapshotId 从头重试；不得拼接两个
  时点的数据。只有最后一页 `complete: true` 后 panel 才能得出两类缺失结论

#### 穷举 provider 错误联合

除控制面错误外，v2 对外只允许以下 provider 错误码：

`provider_unsupported`、`provider_unavailable`、`invalid_path`、`resource_not_found`、
`resource_conflict`、`permission_denied`、`storage_quota_exceeded`、`payload_too_large`、
`payload_encoding_invalid`、`transfer_sequence_invalid`、`transfer_size_exceeded`、
`transfer_incomplete`、`transfer_closed`、`snapshot_expired`、`snapshot_busy`、
`snapshot_too_large`、`export_unsupported`、`operation_failed`。

DOMException、Node/Rust 错误码和 host 私有错误必须映射到上述联合；无法安全归类时只用
`operation_failed`。对外错误可以带 `retryable: boolean` 和脱敏 message，不得带绝对路径、SQL/绑定值、
加密字段、文件内容、stack 或原始平台 code。新增错误必须先修改共享 union 和三 driver conformance，
transport 不得临时发明平台私有码。

---

## 阶段 C — 共享面板 library 与 Chrome v2 迁移

把现有面板搬进私有 Angular library，再把 token 背后的实现从 v1 切到 v2，并在真实 Chrome 扩展链路上
留下兼容基准证据。

### 两个子阶段与门禁

本阶段按两个**必须分开审查**的子阶段推进，避免「行为中性」和「行为收敛」两类 diff 混在同一次审查里：

| 子阶段                    | 内容                                                             | 门禁                            |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| **C1：行为中性抽取**      | 在**现有 v1 wire 上**抽出私有 Angular library 与 transport token | 无协议前置，**可与阶段 B 并行** |
| **C2：v2 迁移与安全收敛** | 四段 relay 改造、OPFS provider 迁移、禁用不安全下载、浏览器回归  | 阶段 B 已交付                   |

[US-902](./US-902-devtools-panel.md) 的既有面板与浏览器行为是 C1 的回归基准。

### In Scope（阶段 C）

**C1 — 共享面板 library**

- 用 generator 创建 `modules/rxdb-devtools-panel/` 私有 Angular library
- 迁入面板组件、状态服务与视图模型；迁移前后用户可见行为、路由和文案保持一致
- 定义平台无关 transport token（消息收发 + 连接生命周期），Chrome runtime/PortService 只作为该 token
  的一个 adapter 在 `apps/rxdb-devtools-extension/` 侧注入
- 共享 UI 不读取 `chrome.*`、PortService、`ipcRenderer`、Tauri global 或桌面 host global
- 私有 library 的 workspace、Nx release、包数量和 API baseline 隔离
- 抽取后重跑既有浏览器回归（Database、Events、branch、Storage metadata、OPFS、Settings 清理）

**C2 — Chrome v2 迁移**

- 改造 background/content relay：background 不再看到 HANDSHAKE 就代发 ACK，所有 ACK 由 panel 按
  阶段 B 状态机决定
- panel 侧 Chrome transport driver 实现证据触发协商：init 发 `PROTOCOL_HELLO`，并在每次无 session
  状态下观察到 legacy HANDSHAKE 时补发一次
- 完整跑通 new/new v2、new panel/old connector bridge、old panel/new connector facade 和无共同版本路径
- Chrome OPFS provider 接入阶段 B 的 descriptor、base64 transfer、错误映射与 snapshot conformance，
  删除旧 OPFS 私有状态机
- 删除不安全数据库下载路径：按钮禁用，强制命令 `export_unsupported`，执行路径零 OPFS 读取
- 普通 Chrome 页面在 `none` 档的零数据泄漏回归，以及 readonly/full 的既有功能回归
- v1 bridge 的保留窗口与移除前的文档/最低版本同步约定

### Out of Scope（阶段 C）

- 修改阶段 B 已冻结的 wire、错误、资源上限、transfer 或 snapshot 状态机
- Electron extension 加载（阶段 D）、Tauri window/transport（US-905）或任何 native provider
- 数据库备份、export lease 或新的安全下载实现
- 发布新的公共 Angular/npm 包

### 私有 library 边界

- library 落在 `modules/` 而非 `packages/`，因此不被 `nx.json.release.projects` 的 `packages/*`、
  `scripts/audit/api-surface.mjs` 与包数量统计扫到——隔离是**结构性**的，不靠否定匹配或 `private` 豁免。
  `release.projects` 必须保持朴素的 `["packages/*"]`，不得为它增设否定项；publish dry-run 不得出现该 project
- `modules/rxdb-devtools-panel/package.json` 仍设 `private: true`（本地 `npm publish` 的兜底闸），
  不得声明 `npm:public` tag 或 publish target
- Chrome/Electron/Tauri 经 tsconfig paths 以**源码嵌入**消费，同 `modules/` 其余成员；依赖关系由 Nx 项目图
  记录（`nx graph` 须存在 app → panel 的 static 边），不得复制源码
- API baseline 与公开包统计继续只包含现有公开 npm 包；本阶段不改变 `capability-matrix.md` 的公开包统计
  （31 个 `packages/*`、0 个 `private: true`、30 个受 baseline 保护，逐字不变）
- library 构建不得把 Chrome types/runtime 变成传递依赖；surface adapter 在各 app 侧提供 transport

### transport token 契约

- token 只暴露平台无关的收发与连接生命周期；不出现 tab id、Port、window label、`invoke` 或 IPC 概念
- token 的消息形状在 C1 保持**当前 v1 wire**；C2 只替换实现，不为 v2 重新设计 token
- 至少存在两个实现：Chrome adapter 与用于单测的内存 fake，证明 token 确实是唯一接缝

### 真实 Chrome relay

```text
shared panel → chrome.runtime.Port → MV3 background service worker → content script → inspected page connector
```

- 四段每一段都执行外层来源/方向/版本检查；版本选定后执行阶段 B 的 exact-key guard
- background 只负责 inspected tab/Port 路由和生命周期，不签发 session、不合成 ACK、不解释 provider payload
- content script 只做定向转发和必要的 transport 编解码；不能成为第二份协议状态机
- connector 是 session/provider owner；panel 是 ACK owner。service worker 重启、Port 重连和页面刷新必须
  生成可判定的新连接，不能复用旧 session
- content script 的注入时机受 `chrome.permissions.request` 用户授权影响，延迟无上界。因此协商窗口必须按
  阶段 B 的证据触发规则计时，不得以 panel 初始化为起点

### 技术约束（阶段 C）

- **C1 与 C2 必须是独立的 PR / commit 序列**：C1 的 diff 不得包含 wire 消息类型、错误码或权限判定的
  变化；C2 的行为收敛不得夹带组件搬迁。
- 组件不得通过 `inject()` 直接取 Chrome service，只能取 transport token；adapter 在 app 的 provider 中绑定。
- library 不得依赖 `apps/` 下的任何代码，方向只能是 app → library。
- v1 bridge 至少保留一个 fixed release 次版本；移除前同步 `website/docs/migration/v1.md`、扩展最低
  connector 版本与 release notes。plan 阶段必须显式记录 v1 兼容形态的取舍（完整 facade vs 版本闸门，
  见「共享不变量」），选定 facade 时要写明它需要维护到哪个版本。
- Chrome adapter 只能实现 transport driver 和必要编码，不能修改共享错误名、资源上限或平台语义。
- 浏览器数据库下载的禁用是安全收敛，不得为了「回归不变」保留热拷贝、全 origin 遍历或 basename 猜归属。

---

## 阶段 D — Electron 原生存储集成

实现 Electron desktop SQLite 与 native files provider，并在真实应用链路验收。

### 启动门禁（阶段 D）

- 阶段 A 已完成、`decision: supported` 且 `evidence` 非空。若为 `unsupported`，本阶段转 `Blocked`，
  并按 [US-905](./US-905-tauri-native-devtools.md) 的受限窗口模型另立承载故事替代。
- 阶段 B 与阶段 C 已交付，分别冻结 v2 协议/conformance 与共享 panel library / Chrome v2 relay 基准。
- [US-207](../adapter/US-207-desktop-local-database.md) 已交付 Electron SQLite 与 desktop host 接缝；
  不等待其无关的三平台打包矩阵。[US-504](../plugin/US-504-electron-local-file-storage.md) 已交付原生文件接缝。

### In Scope（阶段 D）

- `dev-rxdb-electron` 仅在显式开发配置下加载工作区 unpacked 扩展；production 产物不含扩展源码、
  加载路径、bootstrap 或新增权限
- Electron SQLite provider 通过 connector 的语义 API 查询实体、全部 `RXDB_EVENT_TYPES`、branch 和
  Storage metadata，不向扩展开放任意 SQL
- Electron native files provider 只暴露插件专用逻辑根，支持浏览、刷新、上传、下载、新建目录和删除
- 三个领域只声明阶段 B 的语义 kind，`runtime: electron` 只用于显示；显式开发 fixture 以
  `capabilities: full` + `mutationPolicy: allow` 开启文件变更，省略 mutation policy 时保持只读
- 文件上传/下载原样实现阶段 B 的 RFC 4648 base64 transfer 状态机，provider 声明真实
  `maxTransferBytes`，覆盖边界大小、乱序/重复/缺块、取消、超时与断连，不在 renderer 或 main 整体缓存文件
- 诊断在 storage 全局独占锁内物化有界 immutable snapshot，覆盖 1001 条以上数据、两类缺失、
  临时文件/journal/在途上传排除、`snapshot_busy` 与 `snapshot_too_large`
- Settings 数据库下载始终 `export_unsupported`；清理仅按 provider 明确能力启用
- connector、preload 与 main/host 分层校验 session、请求、传输、操作和逻辑路径；关闭 DevTools、
  页面刷新或应用退出时释放所有资源
- 真实临时 `userData`、desktop SQLite、native files、扩展和应用重启 E2E

### Out of Scope（阶段 D）

- 修改 US-207 / US-504 的持久化布局、事务、路径编码、锁或补偿语义
- 数据库导入导出、SQLite/WAL 热备份、export lease、任意 SQL 或绝对路径浏览
- Tauri transport/window/provider —— 属 [US-905](./US-905-tauri-native-devtools.md)
- 只用 mock host、in-process transport 或 Angular service 测试代替真实链路

### 技术约束（阶段 D）

- 扩展不得读取 `globalThis.__aiaoRxdbDesktopHost__`、原始 `ipcRenderer` 或应用数据目录句柄。
- US-207 / US-504 把窄调试能力注册给 connector；connector 统一执行 v2 序列化、脱敏、超时和生命周期。
- native files provider 只接收逻辑路径和有界分块，host 继续负责路径解析、二次校验与原子落盘。
- session 只做关联，不做授权；capability、descriptor 和 mutation policy 在 connector 与 host 两侧重复校验。
- 所有控制面、provider、传输、snapshot 与错误限制原样使用阶段 B；面板消费阶段 C 的 private
  workspace library，relay 语义沿用阶段 C 已验证的 Chrome 基准，不增加 Electron 私有 kind/error/fallback。

---

## 验收标准

### 阶段 A — Electron 43 MV3 可行性门禁（AC#1～6）

| #   | 前置条件                           | 操作                                              | 预期结果                                                                                                                                                                                                                                      | 状态 |
| --- | ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 43 与工作区扩展已构建     | 通过 `session.defaultSession.loadExtension` 加载  | 返回有效 extension，MV3 service worker 启动；失败时记录稳定复现步骤、版本和原始错误                                                                                                                                                           | ✅   |
| 2   | 打开 fixture 页面的 DevTools       | 扩展执行 `chrome.devtools.panels.create`          | RxDB panel 真实出现并能完成一次 panel → service worker → inspected page → panel 往返                                                                                                                                                          | ✅   |
| 3   | fixture 初始未授予目标 origin 权限 | 由扩展请求权限并执行 `chrome.scripting`           | host permission 按需授予，脚本只注入目标页面；拒绝权限时返回可见错误，不扩大 manifest 常驻权限。若仅 `chrome.permissions.request` 不可用，可按「关键项与可容忍差异」改用 fixture 静态窄 host permission 并记录 variance，注入本身仍须真实通过 | ✅   |
| 4   | runtime Port 已建立                | 刷新 inspected page、关闭 DevTools 和应用         | Port 断开与 service worker/session 清理可观察，不残留能接收下一次启动消息的旧连接                                                                                                                                                             | ✅   |
| 5   | AC#1～#4 已逐项执行                | 写入 `evidence` 指向的可行性记录并更新 `decision` | 每项都有版本、命令、结果与日志，并逐条标注关键/可容忍差异；用到 AC#3 差异时必须同时记录 variance 与「Chrome 生产 manifest 未改动」核对；`decision` 只能从 `pending` 变为 `supported` 或 `unsupported`，不得写"理论可行"或用 mock 补证据       | ✅   |
| 6   | 可行性结论已冻结                   | 检查后续排期                                      | `supported` 解锁阶段 D；`unsupported` 时阶段 D 转 `Blocked`，并记录「按 US-905 阶段 1 窗口模型另立 Electron 承载故事」为替代路径；阶段 B / C 共享链与 US-905 不受影响                                                                         | ✅   |

阶段 A 关闭说明（完整证据见 [US-904 阶段 A 可行性记录](./US-904-phase-a-evidence.md)）：

- 判定 `supported`。fixture：`apps/dev-rxdb-electron/tools/devtools-mv3-probe.mjs`（真实 Electron 主进程
  与真实 DevTools，只记录事实）+ `apps/dev-rxdb-electron-e2e/src/devtools-mv3-feasibility.spec.ts`（逐条断言）。
  两者不被生产主进程 import，可整体删除而不留运行时 fallback。
- AC#1 实际调用的是 `session.defaultSession.extensions.loadExtension`；`session.loadExtension` 在
  Electron 43 已弃用，能力等价。
- AC#3 用到了本 AC 自身允许的那一项可容忍差异（fixture 静态窄 host permission `http://127.0.0.1/*`），
  variance 与「Chrome 生产 manifest 未改动」核对都已记录，并由 spec 持续核对。注入本身与未授权 origin
  的负向用例均真实通过，未使用 `<all_urls>`，未 mock 任何 `chrome.*` API。

### 阶段 B — v2 控制面（AC#7～20）

| #   | 前置条件                                                              | 操作                                                       | 预期结果                                                                                                                               | 状态      |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7   | 新 panel + v2 connector，经 fake background/content                   | 同时投递 eager legacy 与 v2 HANDSHAKE                      | background/content 不代 ACK；决策窗口内 v2 胜出，只建立一个 UUID v4 session，从未进入 v1 状态                                          | ✅        |
| 8   | 新 panel 先启动，v2 connector 在其后 bootstrap；relay 就绪延迟 5 秒   | 投递 eager legacy HANDSHAKE（panel 的首个 HELLO 早已丢失） | panel 暂存时同 tick 补发 HELLO，connector 响应 v2 HANDSHAKE，最终仍选 v2；**不因 panel 先于 connector 存在而降级到 v1**                | ✅        |
| 9   | 新 panel + v1 connector，legacy HANDSHAKE 在 panel init 后 5 秒才到达 | 暂存 legacy HANDSHAKE 并等待                               | 1,000 ms 窗口从**首次暂存**起算（非 panel init）；到期后由 panel 发送 legacy ACK 进入 bridge；不展示任何 v2/provider 能力              | ✅        |
| 10  | 无 session 状态下 connector 高频重发 legacy HANDSHAKE                 | 在窗口内持续投递                                           | 窗口只启动一次且不被延长，暂存内容被替换；到期仍按最后一次暂存进入 v1 facade                                                           | ✅        |
| 11  | v1 panel + v2 connector                                               | 旧 background ACK eager legacy HANDSHAKE                   | 无协商等待进入 v1 facade；不建立 v2 session，不执行新操作                                                                              | ✅        |
| 12  | 双方版本无交集、HELLO 非降序/重复/超长或含非法数字                    | 执行协商                                                   | 合法无交集返回 `protocol_unsupported`；非法形状返回 `invalid_message`；都不建立 session                                                | ✅        |
| 13  | 已进入 v1 facade                                                      | 投递迟到的合法 v2 HANDSHAKE                                | facade 是终态：拒绝该握手、不切换版本、不并存第二个状态机；置 panel 本地可见降级标记，只有 transport 重连才重新协商                    | ✅        |
| 14  | v2 session 已建立                                                     | 注入错误 ACK、重复 HELLO、迟到握手、旧 session 和额外键    | exact-key 和状态机拒绝；当前 session、版本与 UI 状态不变。与 AC#8/#9 的「无 session 迟到 legacy 握手」路径区分，后者必须被接受进入暂存 | ✅        |
| 15  | capability 为 none，握手前后各产生事件                                | ACK、PING、查询并观察内部订阅和消息总线                    | 只返回生命周期消息；事件订阅、buffer、DB_INFO/EVENT/BRANCHES/provider 调用均为 0                                                       | ✅        |
| 16  | none/readonly/full 分别运行控制面矩阵                                 | 伪造查询、branch mutation 与更高 capability 回显           | none 零数据；readonly 只读；full 仅允许自身操作；wire 回显不能扩大本地配置                                                             | ✅        |
| 17  | session 达到 32 个请求或 2 个传输                                     | 再登记一个                                                 | 返回对应 limit 错误且不分配资源                                                                                                        | ✅        |
| 18  | 连续完成 4,096 请求或 256 个传输                                      | 再登记唯一 ID，并尝试复用旧 ID                             | 新登记返回 `session_budget_exhausted`，复用返回 duplicate；tombstone 数量不超过固定上限，轮换后旧 session 消息全部拒绝                 | ✅        |
| 19  | 请求进行中或已超时                                                    | 断连、重握手并投递迟到响应                                 | 计时器和资源释放；迟到数据不进入新状态，旧 session 不复活                                                                              | ⚠️ →AC#39 |
| 20  | fake transfer 帧序列（不含真实 provider）                             | 分别制造 idle 静默、被拒帧刷新尝试和超长总时长             | 合法帧刷新 idle，被拒帧不刷新；idle 15 秒或总时长 10 分钟到期返回 `transfer_timeout`，临时资源释放且不复活                             | ✅        |

### 阶段 B — provider 数据面（AC#21～30）

| #   | 前置条件                                                              | 操作                                         | 预期结果                                                                                                                               | 状态           |
| --- | --------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 21  | fake providers 覆盖三个领域和全部 kind                                | 只改变 runtime 并运行 descriptor conformance | 相同 kind 的操作、状态和错误不变；unknown/duplicate/missing descriptor 被 exact guard 拒绝                                             | ✅             |
| 22  | none/readonly/full 与 mutation allow/omit 全组合                      | 调用全部 provider operations                 | capability、descriptor、policy 三层矩阵成立；被拒调用为 0，wire 自称权限不能扩大可信配置                                               | ✅             |
| 23  | 数值字段含边界值、NaN、Infinity、小数、负数和溢出                     | 运行所有 request/descriptor guards           | 仅范围内 safe integer 通过；非法值在资源分配前统一 `invalid_message`                                                                   | ✅             |
| 24  | base64 含正常、边界 chunk、非法字符、非规范 padding/URL-safe          | 传过 fake JSON driver 并重新编码             | decoded bytes 一致；非法输入 `payload_encoding_invalid`，不写入、不刷新 timeout                                                        | ✅             |
| 25  | 零字节、正常多 chunk、乱序、重复、缺块、越限、取消、idle 超时和迟到帧 | 执行完整 transfer 状态机                     | 仅合法 COMPLETE 提交；被拒帧不刷新 idle，超时返回 `transfer_timeout`；错误码稳定，其他终态无半写文件、孤儿 metadata 或完整文件内存副本 | ⚠️ →阶段 D/905 |
| 26  | provider 上限缺失、为 0、超过 1 GiB 或双方上限不同                    | 启动上传/下载                                | descriptor guard 或 min-limit 生效；超过协商总量 `transfer_size_exceeded`                                                              | ✅             |
| 27  | fixture 含 1001 条记录、两类缺失和内部临时状态                        | 以默认页大小读取 snapshot                    | 独占锁内物化、tuple 稳定排序和字节计量，不漏尾页；只在 complete 后报告，临时状态不误报                                                 | ⚠️ →阶段 D/905 |
| 28  | 等锁、epoch 连续失效、条目/字节超限、60 秒过期                        | 创建并翻页                                   | 请求进入起 15 秒内结束；分别返回 busy/too_large/expired，取消能中止等待，不保留旧结论或截断页                                          | ✅             |
| 29  | OPFS/Node/Rust 代表性 not-found/conflict/permission/quota 错误        | 运行共享错误映射 contract                    | 三端映射为同一穷举错误码，响应不泄漏路径、stack、平台 code 或内容                                                                      | ⚠️ 部分        |
| 30  | database export 在任意 kind/runtime 下被强制调用                      | 监控 provider/filesystem                     | 固定 `export_unsupported`，provider、OPFS、SQLite、WAL 和应用目录读取次数均为 0                                                        | ⚠️ →AC#43      |

#### 保留项：fake 关不掉的 5 条

阶段 B 的 19 条 ✅ 全部有对应断言且在 `pnpm nx test rxdb-devtools` 中绿。下列 5 条**不写 ✅**——
fake 能证明的部分已证明，剩下的部分不是「还没写测试」，而是本包结构上不可测：

| AC  | 本轮 fake 验收到的程度                                                                                                                                                     | 谁最终关闭                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 19  | 计时器与资源释放、迟到响应不进新状态、旧 session 帧被拒，均已断言；但「断连」由 fake relay 自己定义。service worker 重启、Port 重连与页面刷新的真实语义不在本包            | 阶段 C AC#39                                        |
| 25  | 状态机全部终态、错误码稳定性、`peakRetainedBytes ≤ 256 KiB` 已断言；「不得整文件驻留内存」只有这一个代理指标，Rust / 主进程那一半在本包结构上不可观测                      | 阶段 D / US-905                                     |
| 27  | tuple 稳定排序、字节计量、不漏尾页、只在 complete 后报告已由 `provider/snapshot` 单测断言；fake 锁只能证明**调用顺序**，证明不了真实独占锁排斥并发写者                     | 阶段 D / US-905                                     |
| 29  | 三来源代表性 fixture 全部映射到同一联合且响应脱敏；穷尽性只做到「`DEVTOOLS_PROVIDER_ERROR_CODES` 每个成员都至少被一条 fixture 产出」的 meta-test，真实平台异常空间无法枚举 | 部分；阶段 D / US-905 补 fixture **加行**而非加分支 |
| 30  | `export_unsupported` 固定返回、provider 与 host 读取计数为 0 已断言；但本包没有真实 OPFS/SQLite/WAL 代码路径，这是在数一个从未存在过的调用                                 | 阶段 C AC#43                                        |

### 阶段 C1 — 行为中性抽取（AC#31～35）

| #   | 前置条件                           | 操作                                                              | 预期结果                                                                                                                           | 状态 |
| --- | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 31  | generator 创建私有 panel library   | 检查 project、manifest、graph 与 release dry-run                  | `nx graph` 存在 app → panel 的 static 边；project 落在 `packages/*` 之外，不在 public tag、API baseline、版本改写或 publish 列表中 | ✅   |
| 32  | Chrome surface 构建                | 扫描共享 library import graph                                     | UI/状态服务只依赖 transport token；不引用 chrome runtime、PortService 或任何桌面 global                                            | ✅   |
| 33  | 抽取完成                           | 只用内存 fake transport 在单测中启动面板并渲染各页                | 面板可在无任何 `chrome.*` 的环境下装配；token 是唯一接缝                                                                           | ✅   |
| 34  | 抽取前的浏览器回归基线已记录       | 抽取后重跑 Database、Events、branch、Storage、OPFS、Settings 清理 | 用户可见行为、wire 消息与错误展示与基线一致；**C1 不引入任何协议或行为差异**                                                       | ⬜   |
| 35  | 公开包统计与 API baseline 已有基线 | 运行 API surface 审计与包数量统计                                 | 公开包数量与 baseline 条目不变；`modules/rxdb-devtools-panel/` 不产生任何公开子路径入口                                            | ✅   |

### 阶段 C2 — Chrome v2 迁移（AC#36～44）

| #   | 前置条件                                                           | 操作                                               | 预期结果                                                                                                   | 状态    |
| --- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| 36  | new panel + v2 connector，真实 background/content/Port             | 同时交换 eager legacy 与 v2 HANDSHAKE              | background 不代 ACK；确定选择 v2，只建立一个 session，从未短暂进入 v1                                      | ✅      |
| 37  | panel 先于 inspected page connector 就绪，且注入需先获得 host 授权 | 授权后刷新页面，观察握手                           | panel 在观察到 legacy HANDSHAKE 时补发 HELLO，窗口自暂存起算；双方均支持 v2 时仍选 v2，不因授权耗时而降级  | ✅      |
| 38  | new panel/old connector 与 old panel/new connector                 | 分别通过真实扩展 relay 调试既有页面                | 前者窗口到期后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                        | ⬜      |
| 39  | 双方版本无交集、service worker 重启、页面刷新和 Port 重连          | 观察 UI 与 session                                 | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态 | ⬜      |
| 40  | Chrome OPFS provider                                               | 运行阶段 B 全部 data-plane conformance             | descriptor、base64、限额、transfer、snapshot 和穷举错误全部通过，不保留旧 OPFS 私有状态机                  | ⚠️ 部分 |
| 41  | capability 为 none，握手前后产生事件并伪造查询                     | 经过真实四段 relay 观察页面消息和 provider 调用    | 仅生命周期消息；EVENT/DB_INFO/BRANCHES/Storage/files、订阅、buffer、provider 调用全部为 0                  | ✅      |
| 42  | readonly/full 普通 Chrome 页面使用现有 Web adapters                | 查询、事件、branch、OPFS、Storage 与 Settings 清理 | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                               | ⬜      |
| 43  | Settings 展示数据库下载                                            | 点击按钮并强制发送 export 命令                     | 按钮禁用；返回 `export_unsupported`；`navigator.storage.getDirectory()`、SQLite/WAL 和文件读取次数均为 0   | ✅      |
| 44  | Chrome 与 fake native thin driver                                  | 运行同一 panel/provider conformance                | 状态、错误、授权和资源清理一致；事件集合只来自 `RXDB_EVENT_TYPES`，fixture、状态机和错误断言没有平台副本   | ⚠️ 部分 |

#### 本轮落地：中继两段换成真实实现

C2 的第一、二个增量已合入，两者都不触碰组件搬迁（C1 的边界）：

1. **两代协议共用一条 Chrome 链路。** `background-core` 与 `bridge-core` 原先以 v1 专用的
   `isDevToolsMessage` 及其两值方向枚举作闸，v2 帧在 Chrome 上**一条都过不去**——阶段 B 冻结的协议
   在这个宿主上是死的。现由 `modules/rxdb-devtools-panel/wire/relay.ts` 的
   `relayDirectionOf` / `isRelayFrameTowards` / `DevToolsRelayFrame` 统一判定：**宽外层**（认两代信封）
   ＋ **方向必判**。宽而不是按 payload 严校验，是因为 service worker 与页面 connector 的升级时机
   本就不同（扩展更新 vs 页面刷新），payload 严校验会让先升级的一侧静默吞掉另一侧的合法帧。
2. **conformance 在真实中继逻辑上复跑。** `FakeRelay.attachNode()` 开出中间两段的接缝，
   `apps/rxdb-devtools-extension/src/testing/chrome-relay-nodes.ts` 把真实的
   `createBackgroundController` 与 `bridge-core` 装进去，`chrome-conformance.spec.ts` 与内存对照组
   **只差一个 `createNodes`**：80 条控制面 / 数据面断言、fixture、错误码表一行都没有复制。

#### 保留项：模拟 Port 关不掉的部分

| AC  | 本轮验收到的程度                                                                                                                                                                                                                                   | 谁最终关闭      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 36  | ~~Port 是模拟的~~ **已由 `apps/rxdb-devtools-extension-e2e` 关闭**：真实 `chrome.runtime.connect` / `chrome.scripting` 注入 / `window.postMessage` 四段全通，页面侧录到唯一一条 v2 `HANDSHAKE_ACK`（`protocol: 2`），端口车道上没有任何 legacy ACK | ✅ 已关闭       |
| 41  | ~~「页面消息」是合成的 window 事件~~ **已由扩展 e2e 关闭**：`?capabilities=none&emitOnInit=1` 的页面在 init 同一 tick 发事件（确定性的「握手之前」），握手后再发一次，四条车道上 EVENT / DB_INFO / BRANCHES 均为 0                                 | ✅ 已关闭       |
| 44  | Chrome driver 与内存 driver 跑同一套件、同一 fixture、同一错误断言，结构上无处写平台副本。缺的是对照的另一端——native thin driver 要等阶段 D / US-905                                                                                               | 阶段 D / US-905 |

AC#38 / #39 保持 ⬜：两者要的是**跨版本**与**真实断连**的实证——前者需要同时装一份旧
connector 与一份旧面板产物，后者需要 service worker 重启与 Port 重连。两件事都不是再写一条
断言能得到的，本轮不假装关闭。AC#42 与 AC#34 同属人工浏览器回归，一并留给那一次回归。
AC#40 保留在 ⚠️：私有 OPFS 状态机已随 `apps/rxdb-devtools-extension/src/content/opfs*.ts` 整体删除
（`content/` 下现在只剩 bridge），OPFS provider 的 descriptor、限额、transfer 绑定、穷举错误
都有单测；缺的一半是让阶段 B 的 data-plane conformance **直接跑在 OPFS provider 上**——
suite 现在跑的是 JSON fake driver，而 vitest 里没有真实 OPFS host。

#### 本轮落地：panel 侧 v2 数据面客户端与导出停用

1. **panel 侧 v2 数据面客户端。** 阶段 B 只交付了 connector 侧的 `endpoint.ts`，
   panel 侧除协商状态机外没有任何请求 / 事件 / 上传的对端实现，面板服务无从改接。
   `packages/rxdb-devtools/src/v2/panel-endpoint.ts` 补上这一半：协商接线、请求额度、
   事件订阅与上传驱动共用一个组合根。三处与 connector 侧**有意不对称**的地方写在模块头里，
   其中一条是协议缺口的诚实映射——冻结的 wire 上 `TRANSFER_COMPLETE` 成功时**不产生任何帧**，
   于是上传只能报 `'sent'` 而不是 `'ok'`（不在阶段 C 私自补消息类型）。
2. **数据库导出停用（AC#43 的面板侧）。** 删除 `scripts/download-database.ts` 整条打包路径，
   Settings 的导出按钮改为常量禁用，强制命令固定回 `export_unsupported`。
   `navigator.storage.getDirectory()` / SQLite / WAL 的读取次数因此**结构上**为 0——
   代码不存在，而不是「记得别调用」。

AC#43 的保留半边是 connector 侧：v2 `settings.export` 需要真实 settings provider 才能在
对端也拒一次（面板与 connector 各拒一次是有意的纵深，见 AC#50）——已由下一节补齐。

#### 本轮落地：页内 provider 接缝装配

1. **`CONNECTOR_PROVIDER_DESCRIPTORS` 原本是空集，`CONNECTOR_PROVIDERS.provider()` 原本直接抛错。**
   阶段 B 交付的是端点与授权层，页内**没有任何 provider 实现**，所以阶段 C2 不只是「面板改接
   v2」，还得先把浏览器侧的 provider 本体造出来，否则协商成功后每个请求都撞在抛错上。
2. **`files` — OPFS provider**（`src/browser/opfs-files-provider.ts`）。`list` 返回子树；
   写操作（`upload` / `create-directory` / `delete`）走临时文件 + `commit()` 落地，半写文件不对
   其他读者可见。`create-directory` 先用 `create: false` 探一次，因为 OPFS 的 `create: true` 幂等
   成功，不探就永远报不出 `resource_conflict`。
3. **`files.download` 的字节不过 wire。** 阶段 B 的 `TRANSFER_*` 虽然方向标注为 `'both'`，
   但 connector→panel 这一向**两端都没实现**。浏览器 `opfs` kind 因此仍由页面自己的下载路径
   保存文件（AC#42 的可见行为不变）；真正的 connector→panel 字节通道是阶段 D `native-files`
   的前置项，不在阶段 C 私自补。
4. **`settings` — 恒定拒绝的 `export`**（`src/browser/settings-provider.ts`），补齐 AC#43 的
   connector 侧：绕过面板 UI 直接发命令的调用在对端同样拿到 `export_unsupported`，且该拒绝在
   任何 host 动作**之前**返回。`clear` 不宣告——面板仍走 v1 脚本注入，宣告一个服务不了的操作
   等于让面板据此点亮按钮。
5. **`database` 不宣告**（而不是宣告 `kind: 'unavailable'`）。领域缺席 = 「本处未实现」→
   `provider_unsupported`；`unavailable` = 「本运行时有但此刻用不了」→ `provider_unavailable`。
   两者在面板上的提示语与重试入口不同，不能混。
6. **写路径默认关闭。** `CONNECTOR_MUTATION_POLICY = 'omit'`：`files` 的三个写操作都是 `full` 档，
   「接上 provider」不应顺带打开写入，owner 要写必须显式表态。此后 `mutationPolicy` 升为
   `DevToolsOptions` 的公开可选项：档位说的是「面板被允许下达多重的命令」，写策略说的是
   「页面愿不愿意被写盘」，两个决策者不能合成一个开关。被拒时对端收到的是
   `provider_unsupported`——与「没有这个领域」同形，不让对端靠错误码反推页面开了哪些写能力。

#### 本轮落地：扩展 e2e，以及它当场抓到的信道分流缺陷

1. **`apps/rxdb-devtools-extension-e2e` 立项。** Playwright 以持久化上下文加载 unpacked 扩展，
   跑通 panel → background → content script → 页面的**真实**四段中继，承接 AC#36 / #41。
   页面侧用的是 `packages/rxdb-devtools/dist` 的**发布产物**，不是测试里 new 的源码类。
2. **它立刻抓到一个两侧单测都看不见的缺陷：v2 帧被私有端口吞掉。** `bridge-core` 的
   `forwardExtensionMessage` 在握手之后把**所有**下行帧塞进私有 `MessagePort`，而端口是
   **v1 命令面**的传输层——connector 的 `#port.onmessage` 只解 v1 消息，v2 帧收发两个方向都
   固定在 window 总线上。于是 `PROTOCOL_HELLO` 石沉大海、协商窗口静默到期，
   「两端都支持 v2」在真实 Chrome 里**稳定**退回 v1 facade。两侧单测各自绿着，是因为
   它们各自定义了对端。现按信封版本分流：v1 走端口，v2 走 window 总线。
3. **真实路径约束：先授权，再刷新被检查页面。** bridge 由 `chrome.scripting` 在面板确认 host
   权限后注入，而注入的脚本**不跨导航存活**；面板只在 `chrome.devtools.network.onNavigated`
   时重新注入。因此「面板打开之前就加载好的页面」两端会永久互等——这正是 AC#37 措辞里
   「授权后刷新页面」的由来，e2e 按这条真实路径走。
4. **variance（与阶段 A 对 AC#3 的容忍同源，必须计入）：** Playwright 打不开 DevTools 自己的
   面板宿主，`chrome.devtools` 只在那个宿主里存在，故面板被当作普通扩展页打开并桩掉
   `tabId` / `eval('location.href')` / `onNavigated` 三项；测试用扩展**副本**的 manifest 静态写入
   `host_permissions: ['http://localhost/*']`（Chrome 的 host pattern 不带端口），
   生产 manifest 的 `optional_host_permissions` 原样保留，仍由 `manifest.config.spec.ts` 守住。
   补的是**宿主**，不是被测物：Port、background、注入与页面消息四段都是真的。

#### C2 冻结的三条决策

1. **v1 兼容形态取「完整 facade」，维护到 `@aiao/rxdb-devtools` 1.x 结束**（共享不变量与
   AC#28 要求在 plan 阶段二选一并写明理由）。取 facade 而不是版本闸门，是因为 connector 随
   **页面**发布、面板随**扩展**发布，两者的升级时机由不同的人决定；版本闸门会让一个没能力
   立刻升级页面的用户直接失去 DevTools，而这正是他最需要它的时候。代价是两套语义映射要
   长期并存——因此写死维护窗口：2.0 起移除 facade，届时只回「connector 版本过低」。
2. **`database` 领域在 v2 里有意不宣告，`database-state` / `devtools-state` 两个面板服务继续跑 v1。**
   这与 plan 原文「三个服务一起改接 v2」不同，改动的理由写在这里：v2 的 `database` 领域没有
   provider（阶段 C2 只把 `files` 迁过去），宣告一个服务不了的领域等于让面板据此点亮入口。
   两代协议并存期间，连接判定必须认两种证据——`connector.ts` 的 `#syncLegacyConnectionToSession`
   正是为此存在：v2 session 一开，v1 的事件 buffer 也算已连接，否则 Database / Events 两页
   在真实 Chrome 上会永远是空的（v2 赢下协商后，面板**永远不会**发那条 legacy ACK）。
3. **`TRANSFER_COMPLETE` 无成功应答、`files.download` 无 connector→panel 字节通道，两处协议缺口
   照实映射，不在阶段 C 私自补消息类型**（上传只报 `'sent'`；浏览器 `opfs` kind 仍由页面自己
   保存文件）。真正的字节通道是阶段 D `native-files` 的前置项。

#### 已知噪声（不改，记录在案）

v2 session 一建立，端点就去开 `database.events` 订阅，而 `database` 领域有意未宣告，
于是每条 v2 session 都会向面板发一条 `ERROR{requestId: null, provider_unsupported}`。
端点这么做是对的——订阅失败必须发出去，否则对端会等一条永远不来的 EVENT；面板在 `v2` 状态下
忽略它，数据面不受影响（事件仍走 v1）。要消掉它只有两条路：宣告 `database` descriptor（阶段 D 及
之后的范围），或让端点对「本就没有该领域」的订阅失败保持沉默（改的是阶段 B 冻结的语义）。
两条都不属于 C2，故留噪声、留记录。

### 阶段 D — Electron 原生存储集成（AC#45～53）

| #   | 前置条件                                                         | 操作                                                   | 预期结果                                                                                                                                         | 状态 |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 45  | 分别构建显式开发配置与 production                                | 检查产物并启动                                         | dev 加载唯一工作区扩展并握手；production 无扩展源码、加载路径、bootstrap 和新增权限                                                              | ⚠️   |
| 46  | 应用使用 US-207 desktop SQLite                                   | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与应用一致；不创建或查询 OPFS/IndexedDB fallback                                                         | ⚠️   |
| 47  | 应用使用 US-504 原生文件后端并显式允许 mutation                  | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件专用根，字节一致；UI 仅用 `runtime: electron` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                              | ⚠️   |
| 48  | 1001 条以上 metadata/files、两类缺失和一条在途上传               | 读取完整诊断 snapshot                                  | 从请求进入起算的共享 deadline（阶段 B）覆盖等锁/物化/重试；不漏尾页或误报临时状态；失效/超限/过期分别返回 shared busy/too-large/expired          | ✅   |
| 49  | 打开 Settings                                                    | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明清理返回 `provider_unsupported`，不读取 OPFS/SQLite/WAL 或其他目录                            | ⚠️   |
| 50  | 同源脚本/content script 持有合法 session，或构造越界路径         | 在 none/readonly/full、mutation 开/关组合下伪造操作    | connector、preload、host 各自校验；未授权 provider 调用为 0，未 opt-in mutation 不执行；根外无读写，错误不含路径、SQL 绑定值、加密字段或文件内容 | ✅   |
| 51  | session A 有订阅、迟到响应和未完成传输                           | 关闭/刷新后建立 session B 并投递 A 消息                | A 的 host session 与资源释放；B 拒绝旧身份，不显示旧实体、错误、事件或进度                                                                       | ⚠️   |
| 52  | 真实临时 userData、SQLite 与原生文件后端                         | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 extension/renderer/preload/main/host，不用 mock 替代                                                    | ✅   |
| 53  | Electron 薄 driver 接入阶段 B conformance 与阶段 C panel library | 运行全部共享断言                                       | 控制面、descriptor、base64、safe integer、授权、传输、快照、错误和 session 重建通过；不复制 UI、wire、fixture 或错误码                           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

**阶段 D 交付记录（2026-08-31）**：AC#48（snapshot wire 复用 `files.list` 的 snapshot 参数，协议无独立 snapshot 类型）、
AC#50（`desktop-host-request-guard` 三族 29 kind 闭集 + preload 内联闸 + host 桥分派前显式拒绝）、
AC#53（`electron-relay-nodes` 薄 driver 跑共享 conformance 80 条）三条已完全关闭。
AC#45/46/47/49/51 的 provider/装配/单测侧已落地（加载隔离、database provider、native-files、settings、session teardown），
但「真实 DevTools 关闭/刷新/退出、真实 userData 重启重连」的 E2E 侧当时全部挂 AC#52——
其中重启重连那一段已由下面的 AC#52 关闭，AC#45/46/47/49/51 的 E2E 侧仍未补齐。

**AC#52 交付记录（2026-09-03，真机跑通）**：`apps/dev-rxdb-electron-e2e/src/devtools-restart-persistence.spec.ts`。
两次启动共用同一个临时 userData，链路上没有任何替身：`electron-builder --dir` 产物里的真实 main / preload / host、
真实 renderer、真实 MV3 扩展构建产物、真实 DevTools 前端与它注册的扩展面板。证据两路各覆盖一段：

- **实体**：`DesktopLaunch` 每次启动追加一行。第二次启动后面板同时读到两行（`DesktopLaunch 2 条`），
  且第一次那行的 `startedAt` 逐字符不变。这条数据从 SQLite 出发经 host → main → preload → renderer connector →
  content bridge → background → 面板，中间任一段换成桩都读不到它。
- **文件**：1 MiB 确定性文件走原生文件后端落盘。面板 Storage 页读回它的 `StorageFileMeta`；应用侧再把字节流式读回
  算 SHA-256，与**直接在磁盘上**对同一文件算出的摘要比对，重启前后一致。

「本机无法验证」那句判断已被这次实测推翻。同一次实测钉死两条 Electron 侧事实：

1. **自定义 scheme 不在 Chromium 扩展 match pattern 的合法 scheme 集里。** 桌面生产入口 `app://`
   （`main.utils.ts` 的 `APP_SCHEME`）永远拿不到 host permission：`['app://-/*']`、`['<all_urls>']`、两者并列
   三种写法实测全部让 `chrome.scripting.executeScript` 抛「Cannot access contents of the page」。
   连 `<all_urls>` 都不行——它只覆盖 http/https/file/ftp。
2. **Electron 没有 `chrome.permissions` 命名空间**，`optional_host_permissions` 的授权集恒为空；
   Electron 上必须有一条**静态** `host_permissions` 才注得进去，运行时请求那条路不存在。

因此该 E2E 用应用自己的 `--serve` 路径把 inspected page 换成 `http://localhost:<port>`（main / preload / host
一律不动，**只换 renderer 的 origin**），并用扩展 dist 的**临时副本**写入 `host_permissions: ['http://localhost/*']`。
这与上面阶段 C2 第 4 条对 `apps/rxdb-devtools-extension-e2e` 记录的 variance 同源同形态：补的是**宿主**，不是被测物。
生产 manifest 保持 optional-only，由 `manifest.config.spec.ts` 的两条否定契约守住（不加 `host_permissions`、
不为 `app://` 显式声明 `web_accessible_resources`——加了也不工作，只多一份安装警告与权限面）。

失败在此前完全无声：SW 里 `configureLogger(import.meta.env.DEV)` 关掉了生产日志，Chromium 的安装警告在 release
构建里也不落 stderr。唯一能看见真因的通道是**在 `panel.html` 帧里直接 `chrome.scripting.executeScript`**
（经 `devToolsWebContents.mainFrame.framesInSubtree` 找到该帧再 `executeJavaScript`）。这也顺带纠正了
「Playwright 打不开 DevTools 宿主」的推论边界：**浏览器**侧确实打不开（`apps/rxdb-devtools-extension-e2e` 的
variance 依然成立），但 **Electron 侧可以**——不走 page 级 CDP，走主进程的 `app.evaluate()` + `openDevTools({mode:'bottom'})`。
另有两个必踩的坑：DevTools `TabbedPane` 会把放不下的 tab **移出 DOM**，读 tab 条前必须 `win.setSize(1600, 1000)`，
否则扩展面板恒读不到、被误判成「面板没登记」；`chrome.scripting` 在**隔离世界**执行，用主世界的
`window.__AIAO_RXDB_DEVTOOLS_BRIDGE__` 判断「桥有没有注进去」永远是 false，那个观测口径是错的。

同时删除 `apps/dev-rxdb-electron/tools/devtools-stage-d-probe.mjs`：那份骨架的驱动形态（独立 Electron 脚本
`loadURL('app://-/index.html')`）已被上面第 1 条证伪，永远接不通面板；留着只会把 AC#46/47/49/51 的后续工作
引向死路。剩余 AC 的 E2E 应当从 `devtools-restart-persistence.spec.ts` 这套已跑通的驱动（`attachPanel` /
`readPanel`）出发。（`requirements/reviews/next-0831-branch-review.md` 里对该文件的引用是当时的快照，不回改。）

**顺带的产品结论（需 owner 单独决策，不在本条范围）**：开发者拿**打包产物**（`app://` 入口）时用不了 DevTools
扩展面板。阶段 D 的范围本就声明「production 无扩展源码与加载路径」，所以这不构成生产缺陷；但若希望开发者能在
打包态调试，唯一可行形态是给 dev 构建保留 `--serve` 入口。是否为此立故事请 owner 判定。

## 实现所有权

| 路径                                   | 阶段       | 边界                                                                                                               |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/rxdb-devtools/src/`          | B          | v2 envelope、协商、session、授权、ID 预算、错误和生命周期                                                          |
| `packages/rxdb-devtools/src/provider/` | B          | descriptor、授权、transfer、snapshot、错误和规范化 helper                                                          |
| `packages/rxdb-devtools/src/testing/`  | B          | fake 四段 relay、fake providers、JSON driver 与完整 conformance suite                                              |
| `modules/rxdb-devtools-panel/`         | C          | 源码嵌入式 Angular library、共享面板、状态服务与 transport token（不在 `packages/*`，故不触碰 release/audit 配置） |
| `apps/rxdb-devtools-extension/`        | A / C      | A ✅ 只用现有构建产物，源码零改动；C 拥有 Chrome adapter、四段 relay、v2 迁移与禁用不安全下载                      |
| `apps/dev-rxdb-electron/`              | A / D      | A ✅ `tools/devtools-mv3-probe.mjs`；D 做开发态加载、preload/main 接线与生产隔离                                   |
| `apps/dev-rxdb-electron-e2e/`          | A / D      | A ✅ `src/devtools-mv3-feasibility.spec.ts`；D 提供持久化、重启与安全边界 E2E                                      |
| `apps/dev-rxdb-tauri/`                 | US-905     | DevTools bootstrap、Tauri transport adapter、受限窗口与 dev-only capability                                        |
| `packages/rxdb-adapter-electron/`      | D          | Electron SQLite 只读诊断 provider，不增加任意 SQL                                                                  |
| `packages/rxdb-adapter-tauri/`         | US-905     | Tauri SQLite 只读诊断 provider，不增加任意 SQL                                                                     |
| `packages/rxdb-plugin-storage/`        | D / US-905 | Electron / Tauri 原生文件调试 provider，复用业务路径与流式语义                                                     |
| `apps/dev-rxdb-tauri-e2e/`             | 共享       | US-210 / US-905 先开工者用 generator 创建一次；各故事只拥有自己的 specs                                            |
| `requirements/api-baseline/`           | 改动方     | 只有新增公开 API 时同步                                                                                            |

## 依赖与排期

- [US-207](../adapter/US-207-desktop-local-database.md)：提供 Electron SQLite 与 desktop host 安全契约；
  阶段 D 不依赖其未完成的三平台打包矩阵
- [US-504](../plugin/US-504-electron-local-file-storage.md)：提供 Electron 原生文件后端与文件消息；
  阶段 D 应在其 provider 接缝冻结后实现，避免 DevTools 反向定义业务存储协议
- [US-210](../adapter/US-210-tauri-sqlite-local-database.md)：提供应用作用域 SQLite 与 Tauri host（US-905 用）
- [US-505](../plugin/US-505-tauri-local-file-storage.md)：提供 Tauri 原生文件后端；其本身依赖 US-210
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：若调试 provider 新增公开子路径入口，
  必须纳入 API baseline。US-601 已 `Done`（2026-08-24），**人工审查流程那一段已作废**——
  子路径入口现在由 `api-surface.mjs` + `subpath-inventory.mjs` 自动守护，新增入口不同步清单直接 CI 红

## References

- [US-905 Tauri DevTools 调试窗口与原生存储集成](./US-905-tauri-native-devtools.md) — 复用本文件的协议与面板，
  同时是阶段 A `unsupported` 分支的替代承载蓝本
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-903 BigInt / Binary DevTools](./US-903-bigint-binary-devtools.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
