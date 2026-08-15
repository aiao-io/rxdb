---
id: US-904
title: DevTools 调试 Electron 原生本地存储
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, electron, sqlite, filesystem]
---

<!--
INVEST 检查清单:
- [ ] Independent (独立): 受 US-207 / US-504 前置约束；两者关闭前不得实现对应 provider
- [x] Negotiable (可协商): 文件页复用现有 OPFS 组件还是抽统一 provider，可在 plan 阶段决定
- [x] Valuable (有价值): 开发者能在一个面板里定位实体数据、事件、文件 metadata 与原生文件本体的不一致
- [ ] Estimable (可估算): Electron 43 对当前 MV3 API 组合的支持尚未实证；AC#1 通过后才能冻结估算
- [ ] Small (小): 同时包含共享协议/面板抽取、Electron 接入和原生文件诊断；必须按「交付切分」分阶段实施
- [x] Testable (可测试): 扩展加载、握手、数据库查询、文件操作、错误路径、安全边界与浏览器回归均有独立 AC
-->

# 用户故事：DevTools 调试 Electron 原生本地存储

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

### 交付切分与 stop/go 门禁

1. **A：Electron MV3 可行性门禁。** 用当前锁定的 Electron 43 和工作区扩展构建，实证
   `loadExtension`、MV3 service worker、`chrome.devtools.panels`、`chrome.scripting`、按需 host
   permission 与 runtime Port 全链路可用。任一关键 API 不可用即停止本故事，回到 plan 选择独立
   DevTools window，不得先抽面板再赌 Electron 支持。
2. **B：平台无关协议与共享面板。** 冻结版本协商、session/request/transfer 身份、provider 能力、
   错误分类和共享 Angular 面板；Chrome adapter 回归通过后才进入桌面 provider。
3. **C：Electron provider 与真实 E2E。** 接入 desktop SQLite / native files，完成诊断、Settings
   和真实 extension / renderer / preload / main 证据。

三个阶段必须各自形成可独立审查的提交和测试证据；A 未通过时 B/C 不得启动。

## 范围边界

### In Scope

- `dev-rxdb-electron` 在显式开发配置下加载工作区构建的 unpacked 扩展；默认生产包不包含、
  不自动启用扩展
- 在现有 `@aiao/rxdb-devtools` wire 上增加可兼容解析的外层握手；版本不匹配必须返回结构化
  `protocol_unsupported`，不得在严格 payload guard 中被静默丢弃
- 增加版本化 provider 描述列表，按 `database`、`files`、`settings` 领域分别声明 kind、版本和
  操作集合；至少支持 `browser-opfs`、`electron-sqlite` 与 `electron-native-files`，同一 session
  可以同时组合数据库和文件 provider
- 每次握手生成不可复用的 `sessionId`，HANDSHAKE_ACK 明确绑定该 session；握手后的 EVENT、
  BRANCHES、请求和响应等全部消息都携带它。请求/响应另带 `requestId`，分块传输再带
  `transferId`；connector、transport 与 host 都拒绝旧 session、重复请求和串线分块
- Database、Events、branch 与 Storage metadata 行为和浏览器场景一致；事件清单以导出的
  `RXDB_EVENT_TYPES` 为唯一真相源，不硬编码数量
- 面板 UI、状态服务与 provider 消费逻辑只依赖平台无关 transport；Chrome runtime / PortService
  是 extension adapter，不得成为组件的隐式全局依赖，以便 US-905 复用同一实现
- 文件页在 Electron 原生文件后端下浏览插件专用存储根，并支持与现有 OPFS 页对称的刷新、
  目录导航、上传、下载、新建目录和删除操作
- Storage 页通过 provider 的分页诊断快照比较 `StorageFileMeta` 与已提交的逻辑文件；只有收到
  `complete: true` 才给出结论，并区分 metadata 存在但文件缺失、文件存在但 metadata 缺失。
  内部临时文件、rollback journal 和未完成传输不属于“文件缺 metadata”
- 设置页的数据库下载与清理动作必须感知后端：只有声明支持的 provider 才允许执行；桌面后端
  未提供安全实现时显示明确的 unsupported 状态，不得转而操作 OPFS / IndexedDB 或报告假成功
- 浏览器数据库下载是诊断导出，不是热备份：必须先由 connector 确认目标 RxDB 已停写并释放
  SQLite / WAL 句柄，再限定到当前数据库的已解析 provider 根，执行总字节预算、取消和同名文件
  隔离。无法确认静止状态时显示 unsupported，不得复制正在写入的文件
- 所有桌面文件请求复用 US-207 / US-504 的窄 `request` / `subscribe` host 通道；DevTools provider
  不新增任意 SQL 或绝对路径操作，content script 与扩展拿不到原始 `ipcRenderer` 或应用数据目录句柄
- 浏览器中的 OPFS、IndexedDB、事件与实体调试语义保持不变；数据库下载的范围收敛和资源预算
  属于安全修复，不受“用户可见行为不变”约束

### 能力矩阵

| 运行时                         | 逻辑数据库 / 事件                                   | 物理文件页             | 数据库下载 / 清理                                |
| ------------------------------ | --------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Chrome / Web（OPFS）           | 保持现状                                            | 保持现有 OPFS provider | 仅支持停写后的有界诊断导出；清理保持现状         |
| Electron / desktop SQLite      | 本故事                                              | 不适用                 | provider 明确支持才启用，否则显示 unsupported    |
| Electron / native file storage | metadata 本故事                                     | 本故事                 | 仅操作插件专用存储根，不触碰数据库或其他应用文件 |
| Tauri                          | [US-905](./US-905-tauri-native-storage-devtools.md) | US-905                 | US-905                                           |

### Out of Scope

- Tauri transport 与调试窗口由 [US-905](./US-905-tauri-native-storage-devtools.md) 承接。
  `rxdb-devtools-extension` 是 Chrome Manifest V3 扩展，Tauri 复用面板与协议，但不伪装成加载 CRX
- 在用户的普通生产包中捆绑或默认开启调试扩展
- 暴露绝对数据库路径、应用数据目录、任意文件选择器、shell、原始 IPC 或 Node API
- 任意 SQL 控制台、schema 修改器、SQLite 修复器、VACUUM、数据库导入或格式转换
- SQLite / WAL 热拷贝与一致性备份。US-207 已明确数据库导出和热备份不在其范围内；本故事
  不用复制正在写入的文件伪装成可靠备份
- 原生文件内容编辑器、十六进制预览、大文件全文预览或远端 blob 同步
- 修改 US-207 / US-504 的持久化布局、事务、路径编码、原子写入与补偿语义

## 验收标准

| #   | 前置条件                                                                 | 操作                                                  | 预期结果                                                                                                                                                                   | 状态 |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 43 与当前 MV3 扩展构建                                         | 加载 unpacked 扩展并打开 DevTools                     | service worker、RxDB panel、`chrome.scripting`、按需 host permission 与 runtime Port 均完成真实往返；任一关键 API 不可用则停止并回到 plan                                    | ⬜   |
| 2   | AC#1 通过，`dev-rxdb-electron` 使用显式开发配置                          | 启动应用并打开 Electron DevTools                      | 出现 RxDB 面板并完成握手；关闭开发配置后不加载扩展，生产构建产物不包含扩展源码、加载路径或权限                                                                               | ⬜   |
| 3   | Electron 已通过 US-207 连接 desktop SQLite                               | 查询实体、在应用内逐类派发事件并通过面板切换分支      | 实体数据、全部 `RXDB_EVENT_TYPES` 和分支状态与应用一致；刷新面板不创建第二份 OPFS / IndexedDB 数据库                                                                         | ⬜   |
| 4   | Electron 已通过 US-504 启用原生文件后端                                  | 打开文件页并浏览目录                                  | 展示插件专用存储根的目录和文件；UI 标明 Electron native provider，不展示同 origin OPFS 内容，不暴露绝对物理路径                                                              | ⬜   |
| 5   | 原生文件页已连接                                                         | 上传、下载、新建目录、删除并刷新                      | 行为与现有 OPFS 页公开操作对称；字节一致，失败不留下半写文件或孤儿 metadata，删除等破坏性操作需要现有确认流程                                                                | ⬜   |
| 6   | 存在 1001 条以上 metadata / 文件，并包含两类缺失与一条在途上传           | 分页加载完整诊断快照                                  | 只在 `complete: true` 后报告两类真实不一致；不漏掉尾页，不把临时文件、journal 或在途上传报成孤儿，不自动修复或猜测归属                                                    | ⬜   |
| 7   | browser OPFS、desktop SQLite、native files 分别声明不同 Settings 能力    | 查看并触发下载或清理                                  | 只启用明确声明的动作；浏览器导出先停写并释放句柄，只含当前数据库且受总量预算和取消控制；无法静止、同名异目录或其他后端均不复制、不进入归档                              | ⬜   |
| 8   | connector 与 panel 使用不兼容的协议/provider 版本，或 host 拒绝/文件占用 | 握手、刷新或执行文件操作                              | 外层握手返回结构化 `protocol_unsupported` / `provider_unsupported`；面板展示稳定错误和支持版本范围，清除陈旧结果，不 fallback                                             | ⬜   |
| 9   | renderer 或 content script 构造越界路径、绝对路径或未知调试操作          | 通过 DevTools 通道发送                                | connector 与 host 在各自信任边界拒绝；应用数据目录其他位置无读写，错误响应不包含绝对路径、SQL 绑定值、加密字段或文件内容                                                 | ⬜   |
| 10  | session A 有订阅、迟到响应和未完成传输                                   | 关闭/刷新后建立 session B，并投递 session A 的消息    | A 的订阅与 host session 已释放；B 拒绝全部旧 `sessionId` / `requestId` / `transferId`，不显示旧实体、旧错误、重复事件或旧传输进度                                         | ⬜   |
| 11  | 普通 Chrome 页面继续使用 wa-sqlite / sqlite-wasm / PGlite / OPFS         | 运行共享协议/面板测试和浏览器 smoke                   | 除 AC#7 明确收敛的安全导出外，Database、Events、OPFS、Storage 与 Settings 的既有行为不变；旧 connector 无 provider 描述时仅禁用新增能力，不按 `full` 猜测桌面能力          | ⬜   |
| 12  | Electron 使用真实临时 userData、desktop SQLite 与原生文件后端            | 运行扩展集成测试并重启应用                            | 重启前后查询同一实体和文件均一致；测试走真实 extension / renderer / preload / main 链路，不用 mock host 代替端到端证据                                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 协议采用“宽外层、严内层”：外层只解析来源、方向、协议版本和 session 身份，以便报告版本不兼容；
  版本匹配后才用 exact-key guard 校验具体消息 payload
- provider 描述是按领域组合的版本化可辨识联合；未知领域、kind、版本或操作一律 unsupported，
  旧握手的 `payload: null` 只保留逻辑数据库兼容，不授予任何新增文件或 Settings 能力
- HANDSHAKE_ACK 绑定 `sessionId`，握手后的所有 wire 消息都必须回显它；请求响应再绑定
  `requestId`，文件分块再绑定 `transferId`。三者都有长度/数量上限，关闭 session 后不得复用
- Database / Events 继续走 RxDB connector 的语义 API，不允许扩展绕过 adapter 向 host 发送任意 SQL
- 原生文件 provider 只接收逻辑路径和有界分块；host 继续负责路径解析、二次校验和原子落盘
- Storage 诊断必须分页且可判定完成；provider 只枚举已提交的逻辑文件。并发修改使快照失效时
  返回结构化 `snapshot_invalidated` 并重新开始，不拼接两个时点的数据
- 诊断导出只有在 connector 完成停写、断开并由 provider 确认句柄释放后才可开始；失败或取消
  不生成可下载产物，完成后由用户显式重载应用，不在后台静默重连
- 扩展不得直接读取 `globalThis.__aiaoRxdbDesktopHost__`。桌面 adapter / storage plugin 将受限调试
  能力注册给 connector，由 connector 统一做 wire 序列化、脱敏、超时和生命周期管理
- DevTools 断开、页面刷新或窗口关闭时必须取消订阅并终止未完成传输，不能留下 host session
- AC#1 是 stop/go 门禁，AC#12 是交付证据；只测 Angular service、content script 或
  in-process fake transport 不足以关闭本故事

## 依赖与排期

- [US-207](../adapter/US-207-desktop-local-database.md)：提供 Electron SQLite 与现有 desktop host
  安全契约；本故事不依赖其未完成的三平台打包矩阵
- [US-504](../plugin/US-504-electron-local-file-storage.md)：提供原生文件后端与文件消息；本故事应在
  其 provider 接缝冻结后实现，避免 DevTools 反向定义业务存储协议
- 现有扩展数据库下载必须在本故事阶段 B 关闭“未停写热拷贝、全 origin 遍历 + basename 猜归属、
  无总量预算、无取消”的缺口；不得用浏览器回归要求把该缺口冻结下来
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：若调试 provider 新增公开子路径入口，必须
  纳入 API baseline；在 US-601 交付前按其人工审查流程登记

## 实现文件

- `packages/rxdb-devtools/src/` — 版本协商、provider 注册、session/request/transfer 身份、wire 校验、脱敏与生命周期
- `packages/rxdb-devtools-panel/` — generator 创建的内部 Angular library；共享面板、状态机和平台无关 transport token
- `packages/rxdb-adapter-desktop/src/` — 只读数据库诊断能力适配，不新增任意 SQL 调试入口
- `packages/rxdb-plugin-storage/src/` — 原生文件调试 provider，复用业务后端的路径与流式语义
- `apps/rxdb-devtools-extension/src/` — Chrome transport adapter、受限脚本注入与安全数据库导出
- `apps/dev-rxdb-electron/src-electron/` — 显式开发模式加载扩展与真实链路 e2e 接线
- `requirements/api-baseline/` — 新增公开 API 的表面基线

## References

- [US-902 DevTools 面板](US-902-devtools-panel.md)
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md)
- [US-504 Electron 本地文件存储](../plugin/US-504-electron-local-file-storage.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
- [US-905 DevTools 调试 Tauri 原生本地存储](./US-905-tauri-native-storage-devtools.md)
