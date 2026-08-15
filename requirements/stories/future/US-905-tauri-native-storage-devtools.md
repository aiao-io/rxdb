---
id: US-905
title: DevTools 调试 Tauri 原生本地存储
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, tauri, sqlite, filesystem]
---

<!--
INVEST 检查清单:
- [ ] Independent (独立): 被 US-904、US-210、US-505 三条前置链阻断，全部关闭前不得开工
- [x] Negotiable (可协商): Tauri event 或窄 command 承载消息可在 plan 阶段用安全性与测试结果冻结
- [x] Valuable (有价值): Tauri 开发者获得与 Chrome / Electron 一致的数据库、事件和本地文件调试体验
- [ ] Estimable (可估算): 需等待 US-904 冻结 transport/provider 契约，并由 US-210 / US-505 关闭真实 host 未知量
- [ ] Small (小): 包含窗口 bootstrap、跨 WebView transport、release capability 隔离和三平台 E2E；plan 必须拆成两个交付阶段
- [x] Testable (可测试): 窗口启停、握手、数据与文件操作、权限边界、生命周期和三平台 smoke 均可验收
-->

# 用户故事：DevTools 调试 Tauri 原生本地存储

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** 在开发态打开与 `rxdb-devtools-extension` 同源的 RxDB 调试面板，检查 Tauri SQLite、实时事件、storage metadata 与应用作用域内的原生文件
**以便** 在不依赖 Chrome 扩展的前提下，使用一致的界面和诊断语义定位数据库记录、文件索引与文件本体之间的问题

## 运行模型

Tauri WebView 不支持安装 Chrome Manifest V3 扩展，因此本故事不承诺“把 CRX 装进 Tauri”。
正确模型是复用 [US-904](./US-904-electron-native-storage-devtools.md) 抽出的平台无关面板、状态服务、
provider 协议与组件，在显式开发配置下创建标签固定的 `rxdb-devtools` 调试窗口：

```text
Tauri main WebView (@aiao/rxdb-devtools connector)
        | 版本化、双向、严格校验的 Tauri transport
        v
rxdb-devtools WebView (共享 DevTools panel)
        | provider request
        v
US-210 SQLite host / US-505 native file host
```

调试窗口不是第二个 RxDB writer，不直接打开 SQLite，也不获得 Tauri SQL / filesystem 原始权限；
它只通过主 WebView 中的 connector 使用受限调试能力。

### 启动门禁与交付切分

- **启动门禁：** US-904、US-210、US-505 全部关闭，且 US-904 的共享 fixture 已覆盖版本不匹配、
  session 重建、provider 分页和浏览器回归。门禁未满足时不得先写 Tauri 私有 wire 或复制 UI。
- **A：窗口与 transport。** 只实现开发态窗口、定向消息、版本协商、session 生命周期和 release
  capability 产物隔离，用共享 fake provider 验收。
- **B：真实 provider 与三平台证据。** 接入 US-210 / US-505，完成文件诊断、Settings、重启 E2E
  和 macOS / Windows / Linux smoke。

## 范围边界

### In Scope

- `dev-rxdb-tauri` 在显式开发配置下创建独立 `rxdb-devtools` WebView window，并加载与 Chrome /
  Electron 共用的 DevTools 面板；关闭配置时不注册窗口、快捷入口或调试权限，release 构建产物
  不包含只服务 `rxdb-devtools` label 的 capability
- 为 `@aiao/rxdb-devtools` 接入 Tauri transport，承载现有握手、实体查询、全部
  `RXDB_EVENT_TYPES`、branch、Storage metadata 与版本化 provider 消息，不复制第二套业务协议
- 原样消费 US-904 冻结的外层版本协商、provider 描述以及 `sessionId` / `requestId` /
  `transferId`；Tauri 不新增平台私有的错误码或生命周期语义
- 调试窗口通过 US-210 检查当前 Tauri SQLite 的逻辑数据库、实体与事件，通过 US-505 浏览
  插件专用原生文件根
- 文件页支持与 US-904 对称的刷新、目录导航、上传、下载、新建目录和删除；Storage 页消费
  US-904 的完整分页诊断快照。snapshot 未完成或已失效时不展示确定性诊断
- Settings 动作按 provider 能力启用；未实现安全数据库导出或清理时显示结构化 unsupported，
  不转而处理 WebView OPFS / IndexedDB
- 调试窗口、主窗口与 Rust 侧都校验消息版本、方向、窗口标签、操作类型和逻辑路径；错误响应
  保留稳定类别但不泄漏绝对路径、SQL 绑定值、加密字段或文件内容
- 调试窗口关闭、主窗口刷新、应用退出或 transport 断开时，取消订阅、终止在途传输并释放
  provider session；重开同 label 窗口后生成新 `sessionId`，迟到的旧消息在 connector、transport
  和 host 三层均被拒绝
- macOS、Windows、Linux 的 Tauri desktop 开发构建均能打开调试窗口；功能行为使用真实 WebView、
  Rust bridge、SQLite 文件和原生文件目录验证
- 现有 wa-sqlite demo 必须按运行时实际选中的 `OPFSCoopSyncVFS`、`IDBBatchAtomicVFS` 或
  `unavailable` 声明能力，不得从 adapter 名称推断 OPFS

### 能力矩阵

| Tauri 后端                      | 逻辑数据库 / 事件      | 物理文件页            | 数据库下载 / 清理                              |
| ------------------------------- | ---------------------- | --------------------- | ---------------------------------------------- |
| wa-sqlite / `OPFSCoopSyncVFS`   | 保持 Web 能力          | browser OPFS provider | 使用 US-904 收敛后的浏览器 provider 行为       |
| wa-sqlite / `IDBBatchAtomicVFS` | 保持 Web 能力          | unsupported           | 仅启用 provider 明确声明的 IDB 动作            |
| wa-sqlite / `unavailable`       | 结构化 unavailable     | unsupported           | unsupported，不创建 fallback                   |
| US-210 Tauri SQLite             | 本故事                 | 不适用                | provider 明确支持才启用，否则显示 unsupported  |
| US-505 Tauri native files       | metadata 本故事        | 本故事                | 仅操作插件专用存储根，不触碰其他应用作用域文件 |

表中数据库与文件 provider 是可组合能力，不是互斥运行模式。例如 US-210 SQLite 与 US-505 native
files 会在同一 session 同时出现。

### Out of Scope

- 在 Tauri 中加载 Chrome CRX / Manifest V3 background、content script 或 `chrome.*` API
- Tauri mobile（iOS / Android）、远程设备调试、浏览器远程 attach 或网络调试服务
- 默认在 release 包中启用调试窗口；生产构建不得因本故事扩大 Tauri capability
- 让调试窗口直接调用 `tauri-plugin-sql`、filesystem plugin、shell、任意 command 或原始 event 总线
- 任意 SQL 控制台、数据库修复、SQLite / WAL 热备份、数据库导入导出与格式转换
- 任意应用目录浏览、绝对路径展示、文件内容编辑器、大文件全文预览或远端 blob 同步
- 修改 US-210 / US-505 的事务、路径解析、原子写入、补偿、备份域与 writer lease 语义

## 验收标准

| #   | 前置条件                                                                            | 操作                                                 | 预期结果                                                                                                                                                                           | 状态 |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 分别构建显式开发调试配置与 release 配置                                              | 检查产物并启动应用                                   | dev 创建唯一 `rxdb-devtools` 窗口并握手；release 无窗口入口、bootstrap 代码、专用 command 和只服务该 label 的 capability                                                           | ⬜   |
| 2   | session A 有订阅、迟到响应和未完成传输                                               | 关闭窗口，以同 label 重开 session B，再投递 A 的消息 | A 的订阅、在途请求与 provider session 已释放；B 拒绝旧 `sessionId` / `requestId` / `transferId`，不显示旧实体、旧错误、重复事件或旧进度                                         | ⬜   |
| 3   | Tauri 已通过 US-210 连接应用作用域 SQLite                                            | 查询实体、逐类派发事件并通过面板切换分支             | 数据、全部 `RXDB_EVENT_TYPES` 和分支状态与主窗口一致；调试窗口不直接打开数据库、不取得 writer lease，也不创建 OPFS / IndexedDB fallback                                         | ⬜   |
| 4   | Tauri 已通过 US-505 启用原生文件后端                                                 | 浏览、上传、下载、新建目录、删除并刷新               | 只操作插件专用存储根；字节一致，失败无半写文件或孤儿 metadata，UI 标明 Tauri native provider 且不暴露绝对路径                                                                    | ⬜   |
| 5   | 存在 1001 条以上 metadata / 文件、两类缺失和一条在途上传                             | 分页加载 Storage 诊断快照                            | 只在 `complete: true` 后显示真实不一致；尾页不遗漏，临时文件、journal、未完成传输不被误报；失效快照返回 `snapshot_invalidated` 后从头重试                                    | ⬜   |
| 6   | Tauri SQLite / native files provider 未声明下载或清理能力                            | 打开 Settings 并尝试相关动作                         | 动作禁用或返回结构化 unsupported；WebView OPFS / IndexedDB、SQLite 和原生文件均不被误操作，也不显示“全部成功”                                                                    | ⬜   |
| 7   | connector 与 panel 使用不兼容版本，或主窗口刷新、host 拒绝、文件占用                 | 握手、查询或执行文件操作                             | 返回与 US-904 相同的结构化版本/运行错误和支持版本范围；状态原子清空并取消在途工作，不 fallback 到其他后端                                                                     | ⬜   |
| 8   | 非 `rxdb-devtools` 窗口发送消息，或 payload 含未知操作、额外字段、旧 session、越界路径 | 通过 Tauri transport 请求                           | connector、transport 与 host 在各自信任边界拒绝；其他应用目录无读写，响应不泄漏绝对路径、SQL 绑定值、加密字段或文件内容                                                      | ⬜   |
| 9   | Chrome Extension、Electron DevTools 与 Tauri DevTools 使用同一 fixture               | 运行共享面板与协议测试                               | 三种 surface 对同一 provider、分页、版本错误和 session 重建 fixture 产生相同状态与可见操作；Tauri 不复制组件、状态机、错误码或 wire 类型                                     | ⬜   |
| 10  | 分别选择 OPFS、IDB 和 unavailable 的 wa-sqlite 能力结果                               | 打开调试窗口并检查文件页与 Settings                  | provider 描述与实际 VFS 一致；IDB/unavailable 不展示 OPFS 文件或数据库导出，不从 adapter 名、URL、平台或全局变量猜测能力                                                     | ⬜   |
| 11  | 真实临时应用目录、US-210 SQLite 与 US-505 文件后端                                   | 运行 Tauri e2e，重启应用后重新连接调试窗口           | 重启前后查询同一实体和文件均一致；测试经过真实 panel / WebView / transport / Rust / host 链路，不用 in-process fake transport 代替端到端证据                                 | ⬜   |
| 12  | macOS、Windows、Linux 的 Tauri desktop 开发构建                                      | 启动应用并打开、关闭调试窗口                         | 三平台均完成窗口加载、握手、session 释放和 release capability 产物检查；高成本打包测试只在 release 分支或 tag 运行，不进入普通 PR 门禁                                      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 面板组件、状态机、provider 类型和错误分类必须与 US-904 共用同一实现；Tauri 只新增 transport /
  bootstrap adapter，统一从 `packages/rxdb-devtools-panel/` 消费
- Tauri transport 复用 US-904 的“宽外层、严内层”解析；外层必须能返回 `protocol_unsupported`，
  版本匹配后未知消息、额外字段、错误 direction、错误 session 和非预期窗口标签一律拒绝
- 每次创建窗口都生成新 `sessionId`，并绑定主窗口 label、调试窗口 label 和 provider owner；
  握手后的 EVENT、BRANCHES、请求、响应和传输分块全部校验该身份，Rust 侧不能仅凭可复用的
  `rxdb-devtools` label 接受消息
- 调试窗口 capability 按 `rxdb-devtools` label 最小授权，不得继承主窗口的 SQL / filesystem 权限；
  dev/release 使用不同的 capability 输入，release 产物静态检查不得包含只服务调试窗口的授权、
  command 名或 bootstrap 入口
- 主 WebView 是唯一 RxDB connector 与 provider owner；调试窗口不持有数据库连接、writer lease、
  文件根句柄或业务 service 实例
- Tauri event 与窄 command 两案必须在 plan 阶段用跨窗口定向投递、调用方身份校验、取消语义和
  测试可控性决策；不得暴露通用 `invoke(command, payload)` 或广播未脱敏业务数据
- 共享面板固定消费 US-904 生成的内部 Nx library，通过 workspace dependency 正式连接，
  不用 tsconfig path 绕过 package 依赖

## 依赖与排期

- [US-904](./US-904-electron-native-storage-devtools.md)：先关闭 Electron MV3 stop/go 门禁，并冻结
  平台无关 panel transport、provider 联合、session 身份、分页诊断和共享 UI；本故事只实现 Tauri adapter
- [US-210](../adapter/US-210-tauri-sqlite-local-database.md)：提供应用作用域 SQLite 与 Tauri host
- [US-505](../plugin/US-505-tauri-local-file-storage.md)：提供原生文件后端；其本身依赖 US-210
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：新增公开入口必须纳入 API baseline；
  在 US-601 完成前按人工审查流程登记

前置关系：**US-210 -> US-505 -> US-905**，同时 **US-904 -> US-905**。US-904 与
US-210 / US-505 可以并行，但两条前置链都关闭前不得启动 US-905，也不得由 US-905 反向定义
共享 wire、Tauri 数据库或文件 host 契约。

## 实现文件

- `packages/rxdb-devtools/src/` — 复用 US-904 冻结的 connector transport、provider wire、session 身份与严格校验
- `packages/rxdb-devtools-panel/` — 三种 surface 共用的面板 UI、状态机和 transport token；US-905 只消费不复制
- `apps/dev-rxdb-tauri/src/` — DevTools bootstrap、Tauri transport adapter 与显式开发入口
- `apps/dev-rxdb-tauri/src-tauri/` — label 受限的调试窗口、消息桥与开发态 capability
- `apps/dev-rxdb-tauri-e2e/` — 真实 Tauri 调试链路；该项目当前不存在，由 US-210 首次创建后复用
- `requirements/api-baseline/` — 新增公开 API 的表面基线

## References

- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-904 DevTools 调试 Electron 原生本地存储](./US-904-electron-native-storage-devtools.md)
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
