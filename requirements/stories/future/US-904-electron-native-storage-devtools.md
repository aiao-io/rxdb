---
id: US-904
title: DevTools 调试 Electron 原生本地存储
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, electron, sqlite, filesystem, parent-story]
---

<!--
INVEST 检查清单（本文件是拆分后的父故事/契约文档，不直接交付）:
- [ ] Independent (独立): 受 US-207 / US-504 前置约束；两者关闭前不得实现对应 provider
- [x] Negotiable (可协商): 文件页复用现有 OPFS 组件还是抽统一 provider，可在 plan 阶段决定
- [x] Valuable (有价值): 开发者能在一个面板里定位实体数据、事件、文件 metadata 与原生文件本体的不一致
- [x] Estimable (可估算): 未知量和实现边界已分别落入 US-904a / US-904b / US-904c
- [ ] Small (小): **不成立，已于 2026-08-15 拆分**；交付由 US-904a / US-904b / US-904c 承担
- [x] Testable (可测试): 扩展加载、握手、数据库查询、文件操作、错误路径、安全边界与浏览器回归均有独立 AC
-->

# 用户故事：DevTools 调试 Electron 原生本地存储（契约父故事）

> **本文件不直接交付。** 它是三条子故事共享的范围、安全和协议契约。US-904a 为 `supported`
> 时，三条全部 `Done` 才把父故事置 `Done`；US-904a 为 `unsupported` 时，US-904b 继续交付，
> US-904c 与本父故事转 `Blocked` 并记录替代承载故事，不能永久留在普通 Backlog。
>
> | 子故事                                                       | 交付                                              |
> | ------------------------------------------------------------ | ------------------------------------------------- |
> | [US-904a](./US-904a-electron-mv3-devtools-feasibility.md)    | Electron 43 + 当前 MV3 扩展 stop/go 实证          |
> | [US-904b](./US-904b-devtools-shared-protocol-panel.md)       | v1/v2 迁移桥、共享面板、provider/诊断与浏览器回归 |
> | [US-904c](./US-904c-electron-native-devtools-integration.md) | Electron desktop SQLite/native files 接入与 E2E   |

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Electron 桌面应用的开发者
**我想要** 在 `rxdb-devtools-extension` 中检查桌面 SQLite 数据、实时事件、storage metadata 与应用数据目录内的原生文件
**以便** 不离开现有 RxDB 调试工作流，就能定位数据库记录、文件索引和文件本体之间的持久化问题

## 背景与缺口

现有扩展的 Database / Events / Storage 页通过 `@aiao/rxdb-devtools` 查询逻辑数据，理论上不依赖
具体 adapter；但没有真实 Electron + desktop adapter 的集成证据。物理存储相关能力则明确绑定浏览器：

- OPFS 页直接通过 content script 调用 `navigator.storage.getDirectory()`；
- 数据库下载只在 OPFS 中搜索 SQLite 文件；
- 清理动作只处理 OPFS、IndexedDB 与 localStorage；
- inspected page 权限只接受 `http:` / `https:` / `file:`，没有 Electron 接入流程。

因此桌面应用即使已经使用 [US-207](../adapter/US-207-desktop-local-database.md) 的原生 SQLite 和
[US-504](../plugin/US-504-electron-local-file-storage.md) 的原生文件后端，扩展仍可能展示错误的
WebView 存储、执行无效清理，或把“未清理桌面数据”误报为成功。

### 子故事依赖与 stop/go 门禁

1. **US-904a：Electron MV3 可行性门禁。** 用当前锁定的 Electron 43 和工作区扩展构建，实证
   `loadExtension`、MV3 service worker、`chrome.devtools.panels`、`chrome.scripting`、按需 host
   permission 与 runtime Port 全链路可用。任一关键 API 不可用即停止 US-904c，回到 plan 选择独立
   DevTools window；该结论不阻塞平台无关共享层和 Tauri。
2. **US-904b：平台无关协议与共享面板。** 可与 US-904a 并行，冻结版本协商、session/request/transfer
   身份、provider 能力、授权、错误分类、conformance suite 和共享 Angular 面板。
3. **US-904c：Electron provider 与真实 E2E。** 接入 desktop SQLite / native files，完成诊断、Settings
   和真实 extension / renderer / preload / main 证据；只有 US-904a 为 `supported` 才开工。

固定关系为 **US-904a ∥ US-904b**，以及 **US-904a(supported) + US-904b + US-207 + US-504 →
US-904c**。US-904a 必须在 frontmatter 写入 `decision` / `evidence`；结论为 `unsupported` 时只有
US-904c 与本父故事转 `Blocked`，US-904b 和 US-905 继续推进。

## 范围边界

### In Scope

- `dev-rxdb-electron` 在显式开发配置下加载工作区构建的 unpacked 扩展；默认生产包不包含、
  不自动启用扩展
- 在现有 `@aiao/rxdb-devtools` wire 上增加可兼容解析的外层握手与至少一个 minor 的 v1/v2 迁移桥；
  没有共同版本时返回结构化 `protocol_unsupported`，不得在严格 payload guard 中被静默丢弃
- 增加版本化 provider 描述列表，按 `database`、`files`、`settings` 领域分别声明 kind、版本、
  操作集合和资源上限。kind 只表达能力：`database` 为 `rxdb | unavailable`，`files` 为
  `opfs | native-files | unavailable`，`settings` 为 `opfs | idb | sqlite | unavailable`；
  `runtime: browser | electron | tauri` 只用于显示，不能决定行为。同一 session 可以组合三个领域
- 每次 v2 握手由 connector/provider owner 生成不可复用的 `sessionId`，panel 的 HANDSHAKE_ACK 只回显并
  绑定该 session；握手后的 EVENT、
  BRANCHES、请求和响应等全部消息都携带它。请求/响应另带 `requestId`，分块传输再带
  `transferId`；connector、transport 与 host 都拒绝旧 session、重复请求和串线分块
- `sessionId` 是生命周期与关联标识，不是授权凭据；同源脚本可以观察并伪造页面消息。每个操作必须
  同时通过 `DevToolsCapability`、descriptor 操作白名单和 provider host 二次校验。`none` 只允许生命周期，
  `readonly` 才允许实体/事件/branch 读取、诊断、文件浏览和下载，`full` 才允许 branch 与文件变更；
  provider 还必须显式配置 `mutationPolicy: allow` 才能声明上传、新建目录、删除或清理，省略时只读
- Database、Events、branch 与 Storage metadata 行为和浏览器场景一致；事件清单以导出的
  `RXDB_EVENT_TYPES` 为唯一真相源，不硬编码数量
- 面板 UI、状态服务与 provider 消费逻辑只依赖平台无关 transport；Chrome runtime / PortService
  是 extension adapter，不得成为组件的隐式全局依赖，以便 US-905 复用同一实现
- 文件页在 Electron 原生文件后端下浏览插件专用存储根，并支持与现有 OPFS 页对称的刷新、
  目录导航、上传、下载、新建目录和删除操作
- Storage 页通过 provider 的分页诊断快照比较 `StorageFileMeta` 与已提交的逻辑文件；provider 在
  storage 全局独占锁内同时物化两侧记录，按 `(logicalPath, id)` 稳定排序后释放锁，后续页只读该
  immutable snapshot。每 session 只允许一个活动 snapshot，最多 100,000 条或 32 MiB 规范化记录的
  UTF-8 字节，capture 持锁总计不超过 15 秒；超出返回 `snapshot_too_large` / `snapshot_busy`。游标绑定
  session/snapshot，60 秒无活动即释放。只有收到
  `complete: true` 才给出结论，并区分两类缺失。临时文件、rollback journal 和未完成传输由 storage
  provider 的 committed-file 枚举排除，不得由 panel 猜文件名前缀
- 设置页的数据库下载始终禁用并返回 `export_unsupported`；清理动作只有在 provider 明确声明支持时
  才允许执行，不得转而操作 OPFS / IndexedDB 或报告假成功
- 现有浏览器数据库下载直接禁用并返回结构化 `export_unsupported`；当前架构没有覆盖
  “停写 → 防重连 → 多文件一致快照 → 释放”的 export lease，不能继续复制 SQLite / WAL
- 所有桌面文件请求复用 US-207 / US-504 的窄 `request` / `subscribe` host 通道；DevTools provider
  不新增任意 SQL 或绝对路径操作，content script 与扩展拿不到原始 `ipcRenderer` 或应用数据目录句柄
- 浏览器中的 OPFS、IndexedDB、事件与实体调试语义保持不变；禁用不安全数据库下载、以及对超过
  `maxTransferBytes` 的文件传输显式报错属于安全收敛，不受“用户可见行为不变”约束

### 能力矩阵

| 运行时                         | 逻辑数据库 / 事件                                   | 物理文件页             | 数据库下载 / 清理                            |
| ------------------------------ | --------------------------------------------------- | ---------------------- | -------------------------------------------- |
| Chrome / Web（OPFS）           | 保持现状                                            | 保持现有 OPFS provider | 下载 unsupported；清理保持现状               |
| Electron / desktop SQLite      | 本故事                                              | 不适用                 | 下载 unsupported；清理按 provider 能力启用   |
| Electron / native file storage | metadata 本故事                                     | 本故事                 | 数据库下载 unsupported；文件操作限插件专用根 |
| Tauri                          | [US-905](./US-905-tauri-native-storage-devtools.md) | US-905                 | 数据库下载 unsupported；清理见 US-905        |

### Out of Scope

- Tauri transport 与调试窗口由 [US-905](./US-905-tauri-native-storage-devtools.md) 承接。
  `rxdb-devtools-extension` 是 Chrome Manifest V3 扩展，Tauri 复用面板与协议，但不伪装成加载 CRX
- 在用户的普通生产包中捆绑或默认开启调试扩展
- 暴露绝对数据库路径、应用数据目录、任意文件选择器、shell、原始 IPC 或 Node API
- 任意 SQL 控制台、schema 修改器、SQLite 修复器、VACUUM、数据库导入导出或格式转换
- SQLite / WAL 热拷贝、一致性备份和 export lease。可靠导出需要 adapter 参与阻止重连并生成
  一致快照，必须另立故事；本系列只禁用当前不安全入口
- 原生文件内容编辑器、十六进制预览、大文件全文预览或远端 blob 同步
- 修改 US-207 / US-504 的持久化布局、事务、路径编码、原子写入与补偿语义

## 验收标准

**本父故事不直接持有 AC。** 落地和关闭判定只看子故事：

| 契约范围                                                  | 去向                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| Electron 43 MV3 API 组合与真实加载                        | [US-904a](./US-904a-electron-mv3-devtools-feasibility.md)    |
| v1/v2 迁移桥、session、授权、传输、分页诊断、共享面板     | [US-904b](./US-904b-devtools-shared-protocol-panel.md)       |
| Electron SQLite/native files provider、安全边界与真实 E2E | [US-904c](./US-904c-electron-native-devtools-integration.md) |

## 技术约束

- 协议采用“宽外层、严内层”：外层只解析来源、方向、协议版本和 session 身份，以便报告版本不兼容；
  版本匹配后才用 exact-key guard 校验具体消息 payload
- provider 描述是按领域组合的版本化可辨识联合；未知领域、kind、版本或操作一律 unsupported，
  不按运行时、URL、全局变量或缺失字段猜测能力
- v2 是最终协议，但按版本策略保留至少一个 minor 的 v1/v2 迁移桥：v1 只能使用既有逻辑数据库、
  Events、branch、OPFS 与 Settings 清理能力，不能获得 provider descriptor、native files 或任何新操作。
  bridge 到期前在迁移文档与扩展发布说明中记录最低 connector 版本；只有双方无共同版本才显示
  `protocol_unsupported`，不得让扩展独立升级静默切断旧应用
- connector/provider owner 在 v2 HANDSHAKE 中签发 `sessionId`，HANDSHAKE_ACK 必须原样回显；握手后的
  所有 wire 消息都必须回显它；请求响应再绑定
  `requestId`，文件分块再绑定 `transferId`；关闭 session 后不得复用
- provider operation 的授权矩阵是共享协议的一部分；connector 在 dispatch 前校验，host 在执行前
  独立校验。被 capability 拒绝的页面命令沿用现有静默丢弃语义且 provider 调用次数为 0；未在
  descriptor 声明或未显式开启 mutation 的操作返回 `provider_unsupported`
- Database / Events 继续走 RxDB connector 的语义 API，不允许扩展绕过 adapter 向 host 发送任意 SQL
- 原生文件 provider 只接收逻辑路径和有界分块；host 继续负责路径解析、二次校验和原子落盘
- Storage 诊断必须分页且可判定完成；snapshot 在 storage 全局独占锁内一次性物化 metadata 与 committed
  logical files，并执行 100,000 条 / 32 MiB 双上限。锁所有权丢失或 capture epoch 改变时返回
  `snapshot_invalidated` 并从头重试，不拼接两个时点的数据；最多重试 3 次且总计不超过 15 秒，
  耗尽返回 `snapshot_busy`。超过容量直接 `snapshot_too_large`，不得伪装成 busy 或截断尾页
- 数据库下载在 browser、Electron、Tauri provider 上一律返回 `export_unsupported`，实现不得读取 OPFS、
  SQLite、WAL 或应用数据目录来生成替代产物
- 扩展不得直接读取 `globalThis.__aiaoRxdbDesktopHost__`。桌面 adapter / storage plugin 将受限调试
  能力注册给 connector，由 connector 统一做 wire 序列化、脱敏、超时和生命周期管理
- DevTools 断开、页面刷新或窗口关闭时必须取消订阅并终止未完成传输，不能留下 host session

### v2 协议限额

- `sessionId` 必须是 canonical UUID v4；`requestId` / `transferId` 长度为 1～128 个 ASCII 字符，
  只允许 `[A-Za-z0-9._:-]`，非法标识返回 `invalid_identifier`；同一 session 内标识终态后也不得复用，
  重复分别返回 `request_duplicate` / `transfer_duplicate`
- 每个 session 最多 32 个在途请求和 2 个在途传输，超过时分别返回
  `request_limit_exceeded` / `transfer_limit_exceeded`
- 单个 chunk 最大 256 KiB，超过时返回 `payload_too_large`；非流式请求与传输空闲超时均为 15 秒，
  超时返回 `request_timeout` 并释放对应资源
- 分页默认 100 条、最大 500 条；provider 必须声明 `maxTransferBytes`，browser OPFS 固定为 50 MiB，
  panel 与 connector 取双方声明中的较小值，缺失声明视为 `provider_unsupported`
- 文件传输固定使用 `TRANSFER_START → TRANSFER_CHUNK* → TRANSFER_COMPLETE`，任一方可发送
  `TRANSFER_CANCEL`。START 声明 `totalBytes`；chunk 带从 0 开始的 `chunkIndex` 与连续 `offset`，
  非空 chunk 不超过 256 KiB。乱序、重复或不连续返回 `transfer_sequence_invalid`；声明总量超过
  协商上限返回 `transfer_size_exceeded`；COMPLETE 时累计字节不等于 `totalBytes` 返回
  `transfer_incomplete`。只有 COMPLETE 校验通过才能提交临时文件；取消、超时、断连和错误必须丢弃
  临时文件并释放资源，迟到帧返回 `transfer_closed`。零字节文件允许 START 后直接 COMPLETE
- 稳定错误码至少包含 `protocol_unsupported`、`provider_unsupported`、`invalid_identifier`、
  `request_limit_exceeded`、`transfer_limit_exceeded`、`payload_too_large`、`request_timeout`、
  `request_duplicate`、`transfer_duplicate`、`transfer_sequence_invalid`、`transfer_size_exceeded`、
  `transfer_incomplete`、`transfer_closed`、
  `snapshot_invalidated`、`snapshot_busy`、`snapshot_too_large` 与 `export_unsupported`；各 transport
  不得改名或新增平台私有码

## 依赖与排期

- [US-207](../adapter/US-207-desktop-local-database.md)：提供 Electron SQLite 与现有 desktop host
  安全契约；本故事不依赖其未完成的三平台打包矩阵
- [US-504](../plugin/US-504-electron-local-file-storage.md)：提供原生文件后端与文件消息；本故事应在
  其 provider 接缝冻结后实现，避免 DevTools 反向定义业务存储协议
- US-904a 与 US-904b 可并行；US-904a 只门禁 Electron 承载的 US-904c，不得阻塞共享协议或 US-905
- 现有扩展数据库下载必须由 US-904b 关闭“未停写热拷贝、全 origin 遍历 + basename 猜归属、
  无总量预算、无取消”的缺口；不得用浏览器回归要求把该缺口冻结下来
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：若调试 provider 新增公开子路径入口，必须
  纳入 API baseline；在 US-601 交付前按其人工审查流程登记

## 实现所有权

| 路径                             | 所有者  | 边界                                                             |
| -------------------------------- | ------- | ---------------------------------------------------------------- |
| `apps/rxdb-devtools-extension/`  | US-904a | Electron 43 可行性 fixture；不抽面板、不接 provider              |
| `packages/rxdb-devtools/src/`    | US-904b | v1/v2 wire、provider、授权、传输、快照、校验与生命周期           |
| `packages/rxdb-devtools-panel/`  | US-904b | generator 创建的内部 Angular library、共享面板和 transport token |
| `apps/rxdb-devtools-extension/`  | US-904b | Chrome adapter 回归与禁用不安全数据库下载                        |
| `packages/rxdb-adapter-desktop/` | US-904c | Electron 只读数据库诊断 provider，不增加任意 SQL                 |
| `packages/rxdb-plugin-storage/`  | US-904c | Electron 原生文件调试 provider，复用业务路径与流式语义           |
| `apps/dev-rxdb-electron/`        | US-904c | 开发态加载、生产隔离与真实 extension/renderer/preload/main E2E   |
| `requirements/api-baseline/`     | 改动方  | 只有新增公开 API 时同步                                          |

## References

- [US-902 DevTools 面板](US-902-devtools-panel.md)
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md)
- [US-504 Electron 本地文件存储](../plugin/US-504-electron-local-file-storage.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
- [US-905 DevTools 调试 Tauri 原生本地存储](./US-905-tauri-native-storage-devtools.md)
