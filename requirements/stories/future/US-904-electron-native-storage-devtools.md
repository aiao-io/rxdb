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
- [x] Independent (独立): 在 US-207 / US-504 的桌面 host 契约之上提供调试面，不改变数据库或文件持久化语义
- [x] Negotiable (可协商): 文件页复用现有 OPFS 组件还是抽统一 provider，可在 plan 阶段决定
- [x] Valuable (有价值): 开发者能在一个面板里定位实体数据、事件、文件 metadata 与原生文件本体的不一致
- [x] Estimable (可估算): 单一运行时（Electron）+ 现有五个面板的能力感知改造，不含 Tauri 或新的数据库管理器
- [x] Small (小): Tauri 传输与调试窗口拆到 US-905；本故事不实现 SQL 控制台、热备份、任意路径浏览、文件编辑器或生产包内置扩展
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

## 范围边界

### In Scope

- `dev-rxdb-electron` 在显式开发配置下加载工作区构建的 unpacked 扩展；默认生产包不包含、
  不自动启用扩展
- 使用现有 `@aiao/rxdb-devtools` wire 协议完成 Electron renderer 与面板握手；Database、Events、
  branch 与 Storage metadata 行为和浏览器场景一致
- 增加版本化的调试能力描述，至少区分 `browser-opfs`、`electron-sqlite` 与
  `electron-native-files`；面板按能力选择 provider，不按 URL、文件名或全局变量猜测后端
- 面板 UI、状态服务与 provider 消费逻辑只依赖平台无关 transport；Chrome runtime / PortService
  是 extension adapter，不得成为组件的隐式全局依赖，以便 US-905 复用同一实现
- 文件页在 Electron 原生文件后端下浏览插件专用存储根，并支持与现有 OPFS 页对称的刷新、
  目录导航、上传、下载、新建目录和删除操作
- Storage 页同时展示 `StorageFileMeta` 与当前文件后端，能够区分 metadata 存在但文件缺失、
  文件存在但 metadata 缺失两类不一致
- 设置页的数据库下载与清理动作必须感知后端：只有声明支持的 provider 才允许执行；桌面后端
  未提供安全实现时显示明确的 unsupported 状态，不得转而操作 OPFS / IndexedDB 或报告假成功
- 所有桌面文件请求复用 US-207 / US-504 的窄 `request` / `subscribe` host 通道；DevTools provider
  不新增任意 SQL 或绝对路径操作，content script 与扩展拿不到原始 `ipcRenderer` 或应用数据目录句柄
- 浏览器中的现有 OPFS、IndexedDB、事件与实体调试行为保持不变

### 能力矩阵

| 运行时                         | 逻辑数据库 / 事件                                   | 物理文件页             | 数据库下载 / 清理                                |
| ------------------------------ | --------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Chrome / Web（OPFS）           | 保持现状                                            | 保持现有 OPFS provider | 保持现状，但仍受当前安全与大小限制               |
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

| #   | 前置条件                                                         | 操作                                        | 预期结果                                                                                                                            | 状态 |
| --- | ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `dev-rxdb-electron` 使用显式开发配置，扩展已构建                 | 启动应用并打开 Electron DevTools            | 出现 RxDB 面板并完成握手；关闭开发配置后不加载扩展，生产构建产物不包含扩展源码或权限                                                | ⬜   |
| 2   | Electron 已通过 US-207 连接 desktop SQLite                       | 查询实体、在应用内写入并通过面板切换分支    | 实体数据、17 种事件和分支状态与应用一致；刷新面板不创建第二份 OPFS / IndexedDB 数据库                                               | ⬜   |
| 3   | Electron 已通过 US-504 启用原生文件后端                          | 打开文件页并浏览目录                        | 展示插件专用存储根的目录和文件；UI 标明 Electron native provider，不展示同 origin OPFS 内容，不暴露绝对物理路径                     | ⬜   |
| 4   | 原生文件页已连接                                                 | 上传、下载、新建目录、删除并刷新            | 行为与现有 OPFS 页公开操作对称；字节一致，失败不留下半写文件或孤儿 metadata，删除等破坏性操作需要现有确认流程                       | ⬜   |
| 5   | 人为制造 metadata 缺文件、文件缺 metadata 两种状态               | 打开 Storage 页                             | 两类不一致分别显示为稳定、可测试的诊断状态；不得把缺失项吞掉、自动修复或猜测归属                                                    | ⬜   |
| 6   | 当前后端是 desktop SQLite / native files                         | 在 Settings 查看并触发下载或清理            | 面板只启用 provider 明确声明支持的动作；不支持时返回结构化 unsupported，OPFS / IndexedDB 和桌面存储均不被误操作，也不显示“全部成功” | ⬜   |
| 7   | host 拒绝请求、协议版本不匹配、窗口已关闭或文件被占用            | 刷新或执行文件操作                          | 面板展示稳定错误类别和可诊断上下文，清除陈旧结果；不 fallback 到 OPFS、memory、IndexedDB 或另一目录                                 | ⬜   |
| 8   | renderer 或 content script 构造越界路径、绝对路径或未知调试操作  | 通过 DevTools 通道发送                      | connector 与 host 在各自信任边界拒绝；应用数据目录其他位置无读写，错误响应不包含绝对路径、SQL 绑定值、加密字段或文件内容            | ⬜   |
| 9   | 普通 Chrome 页面继续使用 wa-sqlite / sqlite-wasm / PGlite / OPFS | 运行扩展现有测试并完成一次浏览器 smoke test | Database、Events、OPFS、Storage 与 Settings 的既有用户可见行为不变                                                                  | ⬜   |
| 10  | Electron 使用真实临时 userData、desktop SQLite 与原生文件后端    | 运行扩展集成测试并重启应用                  | 重启前后查询同一实体和文件均一致；测试走真实 extension / renderer / preload / main 链路，不用 mock host 代替端到端证据              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 调试能力必须是版本化的可辨识联合；未知 provider / 版本一律 unsupported，不猜测、不降级
- Database / Events 继续走 RxDB connector 的语义 API，不允许扩展绕过 adapter 向 host 发送任意 SQL
- 原生文件 provider 只接收逻辑路径和有界分块；host 继续负责路径解析、二次校验和原子落盘
- 扩展不得直接读取 `globalThis.__aiaoRxdbDesktopHost__`。桌面 adapter / storage plugin 将受限调试
  能力注册给 connector，由 connector 统一做 wire 序列化、脱敏、超时和生命周期管理
- DevTools 断开、页面刷新或窗口关闭时必须取消订阅并终止未完成传输，不能留下 host session
- AC#10 是交付证据；只测 Angular service、content script 或 in-process fake transport 不足以关闭本故事

## 依赖与排期

- [US-207](../adapter/US-207-desktop-local-database.md)：提供 Electron SQLite 与现有 desktop host
  安全契约；本故事不依赖其未完成的三平台打包矩阵
- [US-504](../plugin/US-504-electron-local-file-storage.md)：提供原生文件后端与文件消息；本故事应在
  其 provider 接缝冻结后实现，避免 DevTools 反向定义业务存储协议
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：若调试 provider 新增公开子路径入口，必须
  纳入 API baseline；在 US-601 交付前按其人工审查流程登记

## 实现文件

- `packages/rxdb-devtools/src/` — 版本化能力描述、provider 注册、wire 校验、脱敏与生命周期
- `packages/rxdb-adapter-desktop/src/` — 只读数据库诊断能力适配，不新增任意 SQL 调试入口
- `packages/rxdb-plugin-storage/src/` — 原生文件调试 provider，复用业务后端的路径与流式语义
- `apps/rxdb-devtools-extension/src/` — provider 感知的文件页、Storage 诊断与 Settings 能力状态
- `apps/dev-rxdb-electron/src-electron/` — 显式开发模式加载扩展与真实链路 e2e 接线
- `requirements/api-baseline/` — 新增公开 API 的表面基线

## References

- [US-902 DevTools 面板](US-902-devtools-panel.md)
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md)
- [US-504 Electron 本地文件存储](../plugin/US-504-electron-local-file-storage.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
- [US-905 DevTools 调试 Tauri 原生本地存储](./US-905-tauri-native-storage-devtools.md)
