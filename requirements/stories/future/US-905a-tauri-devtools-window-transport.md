---
id: US-905a
title: Tauri DevTools 窗口与 v2 transport
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, tauri, transport, security]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖 US-904b，用 fake provider 验收，不等待 US-210 / US-505
- [x] Negotiable: Tauri event 或窄 command 可按身份校验与取消证据冻结
- [x] Valuable: 提前关闭窗口、跨 WebView transport 和 release 权限隔离风险
- [x] Estimable: bootstrap、身份/授权、fixture、transfer、VFS 映射与生命周期边界已固定
- [x] Small: 不接真实 SQLite/native files host，不做三平台 native provider smoke
- [x] Testable: 真实 Tauri 窗口与 Rust/WebView transport 可用 fake provider 自动验收
-->

# 用户故事：Tauri DevTools 窗口与 v2 transport

> 共享范围与安全契约见 [US-905](./US-905-tauri-native-storage-devtools.md)。本故事只建立开发态
> Tauri 调试窗口和 transport，原生 SQLite / files 由 US-905b 接入。

## 作为/我想要/以便

**作为** Tauri DevTools 的实现者
**我想要** 在真实应用内以受限窗口承载 US-904b 的共享面板和 v2 transport
**以便** 不等待原生存储后端，也能验证窗口安全边界、生命周期和发布产物隔离

## 启动门禁

- 只依赖 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。
- 可与 US-210、US-505 并行；不得反向定义它们的数据库、事务或文件 host 契约。

## 范围边界

### In Scope

- `dev-rxdb-tauri` 在显式开发配置下创建唯一 `rxdb-devtools` WebView window，并加载共享 panel
- 在主 WebView connector 与调试 WebView 之间实现定向 v2 transport，绑定 session、sender identity、
  主窗口 label、调试窗口 label 和 provider owner
- 使用 US-904b 的共享 fake `database` / `files` / `settings` providers 和 fixtures，验证所有消息、限额、
  capability/descriptor/mutation policy、transfer、snapshot、错误与生命周期，不复制 Tauri 私有 wire
- dev/release 使用不同 capability 输入；release 产物不含调试窗口 bootstrap、专用 command 或只服务
  `rxdb-devtools` label 的 capability
- wa-sqlite demo 按运行时真实选中的 `OPFSCoopSyncVFS`、`IDBBatchAtomicVFS` 或 `unavailable`
  映射 `opfs`、`idb`、`unavailable` 语义 provider，`runtime: tauri` 只用于显示，不能根据 adapter 名、
  URL 或平台猜测行为
- 真实 Tauri 窗口打开、关闭、主窗口刷新、应用退出和同 label 重开证据
- 创建或复用 `apps/dev-rxdb-tauri-e2e`：US-210 与本故事中先开工者用 generator 创建一次，双方只维护
  自己拥有的 spec

### Out of Scope

- US-210 SQLite、US-505 native files 或任何真实原生存储 provider
- 在 Tauri 中加载 CRX、Manifest V3 service worker、content script 或 `chrome.*` API
- 让调试窗口获得 SQL、filesystem、shell、原始 event 总线或通用 `invoke` 权限
- 数据库导入导出、热备份、export lease、Tauri mobile 或远程调试

## 验收标准

| #   | 前置条件                                                               | 操作                                                             | 预期结果                                                                                                                                     | 状态 |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 分别构建显式 dev 与 release 配置                                       | 检查产物并启动                                                   | dev 只创建一个 `rxdb-devtools` 窗口并握手；release 无入口、bootstrap、专用 command 和只服务该 label 的 capability                            | ⬜   |
| 2   | 真实主窗口与调试窗口已打开                                             | 用共享 fake providers 执行查询、事件、授权、transfer 和 snapshot | conformance suite 全部通过；Tauri 只适配 transport，不复制 panel、provider 类型、fixture、错误码或状态机                                     | ⬜   |
| 3   | 非调试窗口、错误 sender/label，或合法 sender 伪造越权操作              | 通过 transport 发送                                              | 错误身份在 WebView/transport/Rust 均拒绝；合法 sender 仍受 capability/descriptor/mutation policy 限制，session/label 不能充当授权            | ⬜   |
| 4   | session A 有订阅、请求和未完成传输                                     | 关闭窗口，以同 label 重开 B 并投递 A 消息                        | A 的资源释放，B 获得新 UUID v4 session 并拒绝全部旧身份、事件、响应与 chunk                                                                  | ⬜   |
| 5   | 主窗口刷新、transport 断开或应用退出                                   | 观察 connector/provider 生命周期                                 | 订阅、计时器、snapshot、请求、传输和临时文件均取消；provider owner 释放，不留下可复用 host session                                           | ⬜   |
| 6   | wa-sqlite 分别实际选择 OPFS、IDB、unavailable                          | 打开调试窗口查看 provider                                        | 分别声明 `files: opfs`、`settings: idb` 或结构化 unavailable；均带 `runtime: tauri`，但行为只由 kind/operations 决定                         | ⬜   |
| 7   | 版本不兼容、伪造授权、传输乱序/取消、限额与 snapshot 失效/超限 fixture | 通过 Tauri transport 执行                                        | 错误、资源释放、`snapshot_busy` / `snapshot_too_large` 与 US-904b 完全一致，不增加平台错误码或 fallback                                      | ⬜   |
| 8   | `apps/dev-rxdb-tauri-e2e` 已由 US-210 或本故事创建                     | 检查项目与 specs                                                 | workspace 中只有一个 generator 创建的 E2E project；本故事只拥有 DevTools window/transport/release-isolation specs，不接管 US-210 数据库 spec | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- Tauri event 与窄 command 在 plan 阶段按定向投递、调用方身份、取消语义和测试性二选一；不得暴露
  `invoke(command, payload)` 通用入口或广播未脱敏业务数据。
- 调试窗口 capability 按 label 最小授权，不继承主窗口的 SQL/filesystem 权限。
- 主 WebView connector/provider owner 签发 session；session 和窗口 label 只绑定生命周期/路由，不替代
  capability、descriptor 与 mutation policy 授权。
- 共享面板通过正式 workspace dependency 消费 `packages/rxdb-devtools-panel/`，不复制源码或用
  tsconfig path 绕过依赖。
- v2 的标识、并发、transfer 状态机、snapshot、授权、超时与错误码全部继承 US-904b。

## 实现文件

- `apps/dev-rxdb-tauri/src/` — 共享 panel bootstrap、Tauri transport adapter 与开发入口
- `apps/dev-rxdb-tauri/src-tauri/` — label/sender 绑定的窗口、消息桥与 dev-only capability
- `apps/dev-rxdb-tauri-e2e/` — 本故事拥有窗口、transport、生命周期和 release 隔离 specs

## References

- [US-905 Tauri 原生本地存储 DevTools 契约](./US-905-tauri-native-storage-devtools.md)
- [US-904b DevTools 共享 v2 协议与面板](./US-904b-devtools-shared-protocol-panel.md)
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
