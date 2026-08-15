---
id: US-905
title: DevTools 调试 Tauri 原生本地存储
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, tauri, sqlite, filesystem, parent-story]
---

<!--
INVEST 检查清单（本文件是拆分后的父故事/契约文档，不直接交付）:
- [x] Independent (独立): 窗口/transport 与真实 provider 已拆开，US-905a 不等待 US-210 / US-505
- [x] Negotiable (可协商): Tauri event 或窄 command 承载消息可在 plan 阶段用安全性与测试结果冻结
- [x] Valuable (有价值): Tauri 开发者获得与 Chrome / Electron 一致的数据库、事件和本地文件调试体验
- [x] Estimable (可估算): 未知量和实现边界已分别落入 US-905a / US-905b
- [ ] Small (小): **不成立，已于 2026-08-15 拆分**；交付由 US-905a / US-905b 承担
- [x] Testable (可测试): 窗口启停、握手、数据与文件操作、权限边界、生命周期和三平台 smoke 均可验收
-->

# 用户故事：DevTools 调试 Tauri 原生本地存储（契约父故事）

> **本文件不直接交付。** 它是两条子故事共享的运行模型、安全和协议契约；`status` 是子故事的
> 汇总视图，两条全部 `Done` 时才置 `Done`。
>
> | 子故事                                                    | 交付                                                     |
> | --------------------------------------------------------- | -------------------------------------------------------- |
> | [US-905a](./US-905a-tauri-devtools-window-transport.md)   | Tauri dev window、v2 transport、fake provider 与产物隔离 |
> | [US-905b](./US-905b-tauri-native-devtools-integration.md) | Tauri SQLite/native files provider 与真实三平台证据      |

## 作为/我想要/以便

**作为** 使用 Aiao 构建 Tauri 桌面应用的开发者
**我想要** 在开发态打开与 `rxdb-devtools-extension` 同源的 RxDB 调试面板，检查 Tauri SQLite、实时事件、storage metadata 与应用作用域内的原生文件
**以便** 在不依赖 Chrome 扩展的前提下，使用一致的界面和诊断语义定位数据库记录、文件索引与文件本体之间的问题

## 运行模型

Tauri WebView 不支持安装 Chrome Manifest V3 扩展，因此本故事不承诺“把 CRX 装进 Tauri”。
正确模型是复用 [US-904b](./US-904b-devtools-shared-protocol-panel.md) 共享链交付的控制面、provider
数据面、面板与状态服务，在显式开发配置下创建标签固定的 `rxdb-devtools` 调试窗口：

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

### 子故事顺序与启动门禁

- **US-905a：窗口与 transport。** 只依赖 US-904b3（传递包含 b1/b2）；实现开发态窗口、定向消息、
  v2 session 生命周期、
  release capability 产物隔离和共享 fake provider 验收，可与 US-210 / US-505 并行。
- **US-905b：真实 provider 与三平台证据。** 依赖 US-905a、US-904b1/b2 conformance、US-210、US-505；接入真实
  SQLite/native files，完成诊断、Settings、重启 E2E 和 macOS / Windows / Linux smoke。

固定关系为 **US-904b1 → US-904b2 → US-904b3 → US-905a**，以及
**US-904b2 + US-905a + US-210 + US-505 → US-905b**。不得等待全部 native host 完成后才开始
US-905a，也不得由 Tauri adapter 复制或反向修改共享 wire。

## 范围边界

### In Scope

- `dev-rxdb-tauri` 在显式开发配置下创建独立 `rxdb-devtools` WebView window，并加载与 Chrome /
  Electron 共用的 DevTools 面板；关闭配置时不注册窗口、快捷入口或调试权限，release 构建产物
  不包含只服务 `rxdb-devtools` label 的 capability
- 为 `@aiao/rxdb-devtools` 接入 Tauri transport，承载现有握手、实体查询、全部
  `RXDB_EVENT_TYPES`、branch、Storage metadata 与版本化 provider 消息，不复制第二套业务协议
- 原样消费 US-904b1 的控制面和 US-904b2 的 provider 数据面；Tauri 不新增平台私有错误码、
  生命周期、binary 编码或数值 guard
- provider 只使用 `rxdb`、`opfs`、`native-files`、`idb`、`sqlite`、`unavailable` 等语义 kind；
  `runtime: tauri` 只用于显示，不增加 `tauri-*` kind 或按平台分支
- 调试窗口通过 US-210 检查当前 Tauri SQLite 的逻辑数据库、实体与事件，通过 US-505 浏览
  插件专用原生文件根
- 文件页支持与 US-904b2 对称的刷新、目录导航、上传、下载、新建目录和删除，原样复用 base64 transfer
  状态机；Storage 页消费在全局独占锁内物化的有界 immutable snapshot。snapshot 未完成或失效时
  不展示确定性诊断，容量超限明确显示 `snapshot_too_large`
- Settings 数据库下载始终禁用并返回 `export_unsupported`；清理动作只按 provider 明确能力启用，
  不转而处理 WebView OPFS / IndexedDB
- 调试窗口、主窗口与 Rust 侧都校验消息版本、方向、窗口标签、capability、descriptor、mutation
  policy、操作类型和逻辑路径；错误响应
  保留稳定类别但不泄漏绝对路径、SQL 绑定值、加密字段或文件内容
- 调试窗口关闭、主窗口刷新、应用退出或 transport 断开时，取消订阅、终止在途传输并释放
  provider session；重开同 label 窗口后生成新 `sessionId`，迟到的旧消息在 connector、transport
  和 host 三层均被拒绝
- macOS、Windows、Linux 的 Tauri desktop 开发构建均能打开调试窗口；功能行为使用真实 WebView、
  Rust bridge、SQLite 文件和原生文件目录验证
- 现有 wa-sqlite demo 必须按运行时实际选中的 `OPFSCoopSyncVFS`、`IDBBatchAtomicVFS` 或
  `unavailable` 声明能力，不得从 adapter 名称推断 OPFS

### 能力矩阵

| Tauri 后端                      | 逻辑数据库 / 事件  | 物理文件页     | 数据库下载 / 清理                                |
| ------------------------------- | ------------------ | -------------- | ------------------------------------------------ |
| wa-sqlite / `OPFSCoopSyncVFS`   | `rxdb`             | `opfs`         | 下载 unsupported；清理按 `settings: opfs` 能力   |
| wa-sqlite / `IDBBatchAtomicVFS` | `rxdb`             | `unavailable`  | 下载 unsupported；清理按 `settings: idb` 能力    |
| wa-sqlite / `unavailable`       | `unavailable`      | `unavailable`  | 下载与清理均 unsupported，不创建 fallback        |
| US-210 Tauri SQLite             | `rxdb`             | `unavailable`  | 下载 unsupported；清理按 `settings: sqlite` 能力 |
| US-505 Tauri native files       | metadata 经 `rxdb` | `native-files` | 下载 unsupported；文件操作限插件专用根           |

表中数据库与文件 provider 是可组合能力，不是互斥运行模式。例如 US-210 SQLite 与 US-505 native
files 会在同一 session 同时出现。

### Out of Scope

- 在 Tauri 中加载 Chrome CRX / Manifest V3 background、content script 或 `chrome.*` API
- Tauri mobile（iOS / Android）、远程设备调试、浏览器远程 attach 或网络调试服务
- 默认在 release 包中启用调试窗口；生产构建不得因本故事扩大 Tauri capability
- 让调试窗口直接调用 `tauri-plugin-sql`、filesystem plugin、shell、任意 command 或原始 event 总线
- 任意 SQL 控制台、数据库修复、SQLite / WAL 热备份、数据库导入导出、export lease 与格式转换；
  本系列只禁用不安全下载，可靠导出必须另立故事
- 任意应用目录浏览、绝对路径展示、文件内容编辑器、大文件全文预览或远端 blob 同步
- 修改 US-210 / US-505 的事务、路径解析、原子写入、补偿、备份域与 writer lease 语义

## 验收标准

**本父故事不直接持有 AC。** 落地和关闭判定只看子故事：

| 契约范围                                                 | 去向                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Tauri dev window、v2 transport、身份/授权与 release 隔离 | [US-905a](./US-905a-tauri-devtools-window-transport.md)   |
| Tauri SQLite/native files、安全边界、重启与三平台证据    | [US-905b](./US-905b-tauri-native-devtools-integration.md) |

## 技术约束

- 面板组件、状态机、provider 类型和错误分类必须与 US-904b1/b2/b3 共用同一实现；Tauri 只新增 transport /
  bootstrap adapter，统一从 `packages/rxdb-devtools-panel/` 消费
- Tauri transport 复用 US-904b1 的 v2 与“宽外层、严内层”解析；外层必须能返回 `protocol_unsupported`，
  版本匹配后未知消息、额外字段、错误 direction、错误 session 和非预期窗口标签一律拒绝
- 每次创建窗口都由主 WebView connector/provider owner 在 HANDSHAKE 生成新 `sessionId`，panel 只回显，
  transport 将其绑定主窗口 label、调试窗口 label 和 provider owner；session 不是授权 secret；
  握手后的 EVENT、BRANCHES、请求、响应和传输分块全部校验该身份，Rust 侧不能仅凭可复用的
  `rxdb-devtools` label 接受消息
- 调试窗口 capability 按 `rxdb-devtools` label 最小授权，不得继承主窗口的 SQL / filesystem 权限；
  dev/release 使用不同的 capability 输入，release 产物静态检查不得包含只服务调试窗口的授权、
  command 名或 bootstrap 入口
- 主 WebView 是唯一 RxDB connector 与 provider owner；调试窗口不持有数据库连接、writer lease、
  文件根句柄或业务 service 实例
- provider operation 继续执行 US-904b1/b2 的 capability/descriptor/mutation policy 矩阵；调试窗口 capability
  只限制 Rust/WebView 权限，不能替代业务操作授权
- Tauri event 与窄 command 两案必须在 plan 阶段用跨窗口定向投递、调用方身份校验、取消语义和
  测试可控性决策；不得暴露通用 `invoke(command, payload)` 或广播未脱敏业务数据
- 共享面板固定消费 US-904b3 生成的 private Nx library，通过 workspace dependency 正式连接，
  不用 tsconfig path 绕过 package 依赖
- v2 的 ID、在途/总预算与 session 轮换继承 US-904b1；RFC 4648 base64、decoded-byte 256 KiB chunk、
  safe integer、offset、总字节、100/500 分页和穷举错误继承 US-904b2。Tauri 不放宽限制
- 诊断 snapshot 使用 100,000 条/32 MiB、单 session 一个活动快照和 60 秒 idle 上限；从请求进入起
  15 秒包含等锁/物化/重试，busy、too-large、expired 原样使用共享错误；数据库下载一律 unsupported

## 依赖与排期

- [US-904b3](./US-904b3-devtools-shared-panel-chrome-migration.md)：US-905a 的唯一直接功能前置；它已
  传递依赖 US-904b1/b2，提供 private panel、v2、provider conformance 与真实 Chrome 基准。
  US-905b 不等待 Electron MV3 或 US-904c
- [US-210](../adapter/US-210-tauri-sqlite-local-database.md)：提供应用作用域 SQLite 与 Tauri host
- [US-505](../plugin/US-505-tauri-local-file-storage.md)：提供原生文件后端；其本身依赖 US-210
- [US-601](../tooling/US-601-subpath-api-surface-baseline.md)：新增公开入口必须纳入 API baseline；
  在 US-601 完成前按人工审查流程登记

前置关系：**US-904b1 → US-904b2 → US-904b3 → US-905a**；**US-210 → US-505**；
**US-904b2 + US-905a + US-505 → US-905b**。US-905a 与 US-210 / US-505 可并行，只有
US-905b 等待真实 native host。

## 实现所有权

| 路径                             | 所有者  | 边界                                                      |
| -------------------------------- | ------- | --------------------------------------------------------- |
| `packages/rxdb-devtools-panel/`  | US-904b3 | 三种 surface 共用 private 面板；US-905a/905b 只消费       |
| `apps/dev-rxdb-tauri/src/`       | US-905a | DevTools bootstrap、Tauri transport adapter 与开发入口    |
| `apps/dev-rxdb-tauri/src-tauri/` | US-905a | label/sender 受限窗口、消息桥与 dev-only capability       |
| `packages/rxdb-adapter-desktop/` | US-905b | Tauri SQLite 只读诊断 provider                            |
| `packages/rxdb-plugin-storage/`  | US-905b | Tauri native files 调试 provider                          |
| `apps/dev-rxdb-tauri-e2e/`       | 共享    | US-210/US-905a 先开工者创建一次；各故事只拥有自己的 specs |
| `requirements/api-baseline/`     | 改动方  | 只有新增公开 API 时同步                                   |

## References

- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [US-904 DevTools 调试 Electron 原生本地存储](./US-904-electron-native-storage-devtools.md)
- [US-904b 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b1 v2 控制面](./US-904b1-devtools-v2-control-plane.md)
- [US-904b2 provider 数据面](./US-904b2-devtools-provider-data-plane.md)
- [US-904b3 共享面板与 Chrome 迁移](./US-904b3-devtools-shared-panel-chrome-migration.md)
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
