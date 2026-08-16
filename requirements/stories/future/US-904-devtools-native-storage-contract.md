---
id: US-904
title: DevTools 原生本地存储调试（共享契约）
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, electron, tauri, protocol, parent-story]
---

<!--
INVEST 检查清单（本文件是契约文档，不直接交付）:
- [ ] Independent: 受 US-207 / US-504 / US-210 / US-505 前置约束；对应 host 关闭前不得实现该 provider
- [x] Negotiable: 内部服务、adapter 组织与 fixture 形态可在 plan 阶段决定，wire 与安全边界不可漂移
- [x] Valuable: Chrome、Electron、Tauri 共用协议、provider 语义、面板与错误模型
- [x] Estimable: 未知量与实现边界已落入 US-904a / US-904b / US-904c / US-904d / US-905
- [ ] Small: **不成立，已拆分**；本文件只保留跨故事契约，不持有 AC
- [x] Testable: 扩展加载、协商、数据面、文件操作、安全边界与三平台证据均在子故事有独立 AC
-->

# DevTools 原生本地存储调试（共享契约）

> **本文件不直接交付。** 它是 Chrome / Electron / Tauri 三条 surface 共享的运行模型、协议不变量、
> 能力矩阵、安全边界与发布约束。`status` 是子故事的汇总视图：全部 `Done` 才置 `Done`；
> US-904a 结论为 `unsupported` 时只有 US-904d 与本文件的 Electron 部分转 `Blocked`，共享链与 Tauri 继续推进。

| 子故事                                                         | 交付                                                   | 直接前置                                  | 状态       |
| -------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- | ---------- |
| [US-904a](./US-904a-electron-mv3-devtools-feasibility.md)      | Electron 43 + 当前 MV3 扩展 stop/go 实证               | 无                                        | 📝 Backlog |
| [US-904b](./US-904b-devtools-v2-protocol.md)                   | v2 控制面（协商/session/授权/ID 预算）+ provider 数据面 | 无                                        | ✅ Done    |
| [US-904c](./US-904c-devtools-shared-panel-chrome-migration.md) | 私有 Angular 面板 library + Chrome 四段 relay v2 迁移  | US-904b（仅阶段 2）                       | 📝 Backlog |
| [US-904d](./US-904d-electron-native-devtools-integration.md)   | Electron desktop SQLite / native files 接入与真实 E2E  | US-904a(supported) + US-904c + US-207/504 | 📝 Backlog |
| [US-905](./US-905-tauri-native-devtools.md)                    | Tauri 调试窗口、transport 与原生 SQLite / files 接入   | US-904c（+ 阶段 2 需 US-210/505）         | 📝 Backlog |

> 状态列是各子故事 YAML `status` 的派生视图，真相源仍是子故事自身。US-904b 已交付：本包内的
> v2 协议、provider 数据面与 conformance suite 全部落地，5 条 AC 因只能由真实链路关闭而保留为
> `⚠️`（见该故事的「保留项」小节）。

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
- 调试窗口 / 扩展都不是第二个 RxDB writer：不直接打开 SQLite，不持有 writer lease、文件根句柄或业务
  service 实例，只通过宿主页面中的 connector 使用受限调试能力。

## 依赖图与门禁

```text
US-904a ─────────────────────────────────────┐（仅门禁 Electron）
US-904b ──→ US-904c ──┬──→ US-904d ←── US-904a(supported) + US-207 + US-504
                      └──→ US-905  ←── US-210 + US-505（仅阶段 2）
US-210 → US-505
```

- **US-904a** 只门禁 Electron 承载的 US-904d；结论不阻塞平台无关共享链和 Tauri。必须在 frontmatter
  写入 `decision` / `evidence`；`unsupported` 时 US-904d 转 `Blocked` 并记录「按 US-905 的受限窗口模型
  另立 Electron 承载故事」为替代路径，不能永久留在普通 Backlog。
- **US-904c 阶段 1**（行为中性的面板 library 抽取）在现有 v1 wire 上完成，**可与 US-904b 并行开工**；
  只有阶段 2（v2 切换与 relay 改造）门禁在 US-904b。
- **US-905 阶段 1**（窗口 + transport + fake provider）只依赖 US-904c，可与 US-210 / US-505 并行；
  只有阶段 2（真实 native provider）等待它们。
- US-905 之所以门禁在 US-904c 而不是 US-904b，是因为 **Chrome 是 v2 的参考实现**：先有一个真实平台
  跑通四段 relay，Tauri 才不会成为第一个发现协议缺陷的地方。
- 桌面集成只消费已冻结的共享产物，不得反向增加平台私有 wire、kind、错误码或 fallback。

## 能力矩阵

| 运行时 / 后端                          | 逻辑数据库 / 事件  | 物理文件页             | 数据库下载 / 清理                            | 承载    |
| -------------------------------------- | ------------------ | ---------------------- | -------------------------------------------- | ------- |
| Chrome / Web（OPFS）                   | 保持现状           | 现有 OPFS provider     | 下载 unsupported；清理保持现状               | US-904c |
| Electron / desktop SQLite（US-207）    | `rxdb`             | 不适用                 | 下载 unsupported；清理按 provider 能力启用   | US-904d |
| Electron / native files（US-504）      | metadata 经 `rxdb` | `native-files`         | 下载 unsupported；文件操作限插件专用根       | US-904d |
| Tauri / wa-sqlite `OPFSCoopSyncVFS`    | `rxdb`             | `opfs`                 | 下载 unsupported；清理按 `settings: opfs`    | US-905  |
| Tauri / wa-sqlite `IDBBatchAtomicVFS`  | `rxdb`             | `unavailable`          | 下载 unsupported；清理按 `settings: idb`     | US-905  |
| Tauri / wa-sqlite `unavailable`        | `unavailable`      | `unavailable`          | 下载与清理均 unsupported，不创建 fallback    | US-905  |
| Tauri / US-210 SQLite                  | `rxdb`             | `unavailable`          | 下载 unsupported；清理按 `settings: sqlite`  | US-905  |
| Tauri / US-505 native files            | metadata 经 `rxdb` | `native-files`         | 下载 unsupported；文件操作限插件专用根       | US-905  |

- 表中 `database` / `files` / `settings` 是**可组合能力，不是互斥运行模式**：US-207 SQLite 与 US-504
  native files 会在同一 session 同时出现，US-210 与 US-505 同理。
- wa-sqlite demo 必须按运行时**实际选中**的 VFS 声明能力，不得从 adapter 名称、URL 或平台推断 OPFS。

## 共享不变量

跨全部子故事生效；具体数值、状态机与错误联合以 [US-904b](./US-904b-devtools-v2-protocol.md) 为唯一真相源，
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
  兼容形态在 US-904c 的 plan 阶段二选一并写明理由：**完整 facade**（旧 connector 继续可用，但要长期维护
  两套语义映射，且必须写明维护到哪个版本）或**版本闸门**（只回一条「connector 版本过低，请升级到 ≥ X」
  并停止会话，维护成本低但直接打断旧应用的调试）。
- **私有面板 library。** `packages/rxdb-devtools-panel/` 必须是正式 workspace dependency，但 package
  manifest 设 `private: true`，Nx tag 不得使用 `npm:public`，并从 fixed release group 的 `packages/*`
  匹配中显式排除。它不增加公开 npm 包数量，也不进入 API baseline。
- **开发态隔离。** 扩展加载 / 调试窗口只在显式开发配置下启用；默认生产包不包含、不自动启用，
  release 产物不含调试 bootstrap、专用 command 或只服务调试窗口的 capability。

## 全链 Out of Scope

- 在用户的普通生产包中捆绑或默认开启调试扩展 / 调试窗口
- 在 Tauri 中加载 Chrome CRX、MV3 service worker、content script 或 `chrome.*` API
- 暴露绝对数据库路径、应用数据目录、任意文件选择器、shell、原始 IPC、通用 `invoke` 或 Node API
- 任意 SQL 控制台、schema 修改器、SQLite 修复器、VACUUM、数据库导入导出或格式转换
- SQLite / WAL 热拷贝、一致性备份和 export lease。可靠导出需要 adapter 参与阻止重连并生成一致快照，
  必须另立故事；本系列只**禁用**当前不安全入口（数据库下载在 browser / Electron / Tauri 一律返回
  `export_unsupported`，执行路径零 OPFS / SQLite / WAL 读取）
- 原生文件内容编辑器、十六进制预览、大文件全文预览或远端 blob 同步
- 修改 US-207 / US-504 / US-210 / US-505 的持久化布局、事务、路径编码、原子写入、锁、补偿、备份域与
  writer lease 语义
- Tauri mobile（iOS / Android）、远程设备调试、浏览器远程 attach 或网络调试服务
- 将共享 Angular 面板发布为公共 npm 包

> 禁用不安全数据库下载、对超过 `maxTransferBytes` 的传输显式报错、`none` 档零泄漏收敛属于**安全收敛**，
> 不受「用户可见行为不变」约束；不得为了「回归不变」保留热拷贝、全 origin 遍历或 basename 猜归属。

## 关闭判定

**本文件不直接持有 AC。** 落地与关闭只看子故事：

| 契约范围                                                        | 去向                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| Electron 43 MV3 API 组合与真实加载                              | [US-904a](./US-904a-electron-mv3-devtools-feasibility.md)      |
| 版本协商、ACK 所有权、session、授权、ID 预算、descriptor、transfer、snapshot、错误联合与 conformance | [US-904b](./US-904b-devtools-v2-protocol.md) |
| 私有共享面板 library、transport token、Chrome 四段 relay、v1 bridge 与浏览器回归 | [US-904c](./US-904c-devtools-shared-panel-chrome-migration.md) |
| Electron SQLite / native files provider、安全边界与真实 E2E     | [US-904d](./US-904d-electron-native-devtools-integration.md)   |
| Tauri 窗口、transport、release 隔离、native provider 与三平台证据 | [US-905](./US-905-tauri-native-devtools.md)                    |

## 实现所有权

| 路径                             | 所有者        | 边界                                                            |
| -------------------------------- | ------------- | --------------------------------------------------------------- |
| `packages/rxdb-devtools/src/`    | US-904b       | v2 控制面、provider 数据面、授权、传输、快照、错误与 conformance |
| `packages/rxdb-devtools-panel/`  | US-904c       | `private: true` 的 Angular library、共享面板与 transport token   |
| `nx.json`                        | US-904c       | 将私有 panel project 排除出 `release.projects`                   |
| `apps/rxdb-devtools-extension/`  | US-904a / 904c | 904a 只做可行性 fixture；904c 拥有 Chrome adapter、四段 relay、v2 迁移与禁用不安全下载 |
| `apps/dev-rxdb-electron/`        | US-904a / 904d | 904a 做最小加载 fixture；904d 做开发态加载、生产隔离与真实链路   |
| `apps/dev-rxdb-tauri/`           | US-905        | DevTools bootstrap、Tauri transport adapter、受限窗口与 dev-only capability |
| `packages/rxdb-adapter-desktop/` | US-904d / 905 | Electron / Tauri SQLite 只读诊断 provider，不增加任意 SQL        |
| `packages/rxdb-plugin-storage/`  | US-904d / 905 | Electron / Tauri 原生文件调试 provider，复用业务路径与流式语义   |
| `apps/dev-rxdb-tauri-e2e/`       | 共享          | US-210 / US-905 先开工者用 generator 创建一次；各故事只拥有自己的 specs |
| `requirements/api-baseline/`     | 改动方        | 只有新增公开 API 时同步                                          |

## 依赖与排期

- [US-207](../adapter/US-207-desktop-local-database.md)：提供 Electron SQLite 与 desktop host 安全契约；
  US-904d 不依赖其未完成的三平台打包矩阵
- [US-504](../plugin/US-504-electron-local-file-storage.md)：提供 Electron 原生文件后端与文件消息；
  US-904d 应在其 provider 接缝冻结后实现，避免 DevTools 反向定义业务存储协议
- [US-210](../adapter/US-210-tauri-sqlite-local-database.md)：提供应用作用域 SQLite 与 Tauri host
- [US-505](../plugin/US-505-tauri-local-file-storage.md)：提供 Tauri 原生文件后端；其本身依赖 US-210
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：若调试 provider 新增公开子路径入口，
  必须纳入 API baseline；在 US-601 交付前按其人工审查流程登记

## References

- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-903 BigInt / Binary DevTools](./US-903-bigint-binary-devtools.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
