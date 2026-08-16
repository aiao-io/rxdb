---
id: US-904c
title: DevTools 共享面板 library 与 Chrome v2 迁移
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, angular, library, browser, chrome, migration, release, security]
---

<!--
INVEST 检查清单:
- [x] Independent: 阶段 1 只依赖现有 v1 面板；阶段 2 消费 US-904b 冻结产物，都不依赖 native host
- [x] Negotiable: Angular service/component 与 relay 内部分层可调整，私有发布边界、transport token 与 ACK 所有权不可省略
- [x] Valuable: 三种 surface 共用一套面板实现且不增加公开 npm 包；Chrome 成为 v2 的真实兼容基准
- [x] Estimable: library 创建、组件迁入、token 抽象、relay 改造、OPFS provider 迁移与下载收敛已分项
- [x] Small: 不设计协议/状态机，不接桌面 provider；两阶段以独立 PR 审查
- [x] Testable: 项目结构、import graph、release dry-run、真实 extension background/content/Port 与浏览器回归均可自动验收
-->

# 用户故事：DevTools 共享面板 library 与 Chrome v2 迁移

> 跨故事契约见 [US-904](./US-904-devtools-native-storage-contract.md)；协议数值与状态机见
> [US-904b](./US-904b-devtools-v2-protocol.md)。本故事把现有面板搬进私有 Angular library，
> 再把 token 背后的实现从 v1 切到 v2，并在真实 Chrome 扩展链路上留下兼容基准证据。

## 作为/我想要/以便

**作为** Chrome、Electron、Tauri DevTools surface 的维护者
**我想要** 从正式 workspace dependency 消费同一 Angular 面板和平台无关 transport token，并让真实 Chrome
四段中继按 v2 控制面和 provider 数据面运行
**以便** 桌面接入只写 transport adapter 而不是各自复制一套 UI，且 v2 在 Electron / Tauri 之前已经有一个
可复现、可回归的真实平台基准

## 两阶段与启动门禁

本故事按两个**必须分开审查**的阶段推进，避免「行为中性」和「行为收敛」两类 diff 混在同一次审查里：

| 阶段                          | 内容                                                             | 门禁                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| **阶段 1：行为中性抽取**      | 在**现有 v1 wire 上**抽出私有 Angular library 与 transport token | 无协议前置，**可与 US-904b 并行开工**                      |
| **阶段 2：v2 迁移与安全收敛** | 四段 relay 改造、OPFS provider 迁移、禁用不安全下载、浏览器回归  | [US-904b](./US-904b-devtools-v2-protocol.md) 已 `Done`     |

[US-902](./US-902-devtools-panel.md) 的既有面板与浏览器行为是阶段 1 的回归基准。

## 范围边界

### In Scope

**阶段 1 — 共享面板 library**

- 用 generator 创建 `packages/rxdb-devtools-panel/` 私有 Angular library
- 迁入面板组件、状态服务与视图模型；迁移前后用户可见行为、路由和文案保持一致
- 定义平台无关 transport token（消息收发 + 连接生命周期），Chrome runtime/PortService 只作为该 token
  的一个 adapter 在 `apps/rxdb-devtools-extension/` 侧注入
- 共享 UI 不读取 `chrome.*`、PortService、`ipcRenderer`、Tauri global 或桌面 host global
- 私有 library 的 workspace、Nx release、包数量和 API baseline 隔离
- 抽取后重跑既有浏览器回归（Database、Events、branch、Storage metadata、OPFS、Settings 清理）

**阶段 2 — Chrome v2 迁移**

- 改造 background/content relay：background 不再看到 HANDSHAKE 就代发 ACK，所有 ACK 由 panel 按
  US-904b 状态机决定
- panel 侧 Chrome transport driver 实现证据触发协商：init 发 `PROTOCOL_HELLO`，并在每次无 session
  状态下观察到 legacy HANDSHAKE 时补发一次
- 完整跑通 new/new v2、new panel/old connector bridge、old panel/new connector facade 和无共同版本路径
- Chrome OPFS provider 接入 US-904b descriptor、base64 transfer、错误映射与 snapshot conformance，
  删除旧 OPFS 私有状态机
- 删除不安全数据库下载路径：按钮禁用，强制命令 `export_unsupported`，执行路径零 OPFS 读取
- 普通 Chrome 页面在 `none` 档的零数据泄漏回归，以及 readonly/full 的既有功能回归
- v1 bridge 的保留窗口与移除前的文档/最低版本同步约定

### Out of Scope

- 修改 US-904b 已冻结的 wire、错误、资源上限、transfer 或 snapshot 状态机
- Electron extension 加载、Tauri window/transport 或任何 native provider
- 数据库备份、export lease 或新的安全下载实现
- 发布新的公共 Angular/npm 包

## 私有 library 边界

- `packages/rxdb-devtools-panel/package.json` 必须 `private: true`，不得声明 `npm:public` tag 或 publish target
- `nx.json.release.projects` 必须显式排除该 project；fixed release version/publish dry-run 不得修改或发布它
- Chrome/Electron/Tauri 通过 package manager workspace dependency 消费，不使用 tsconfig path 绕过依赖
- API baseline 与公开包统计继续只包含现有公开 npm 包；本故事不改变 `status-overview.md` 的「28 个公开包」
- library 构建不得把 Chrome types/runtime 变成传递依赖；surface adapter 在各 app 侧提供 transport

## transport token 契约

- token 只暴露平台无关的收发与连接生命周期；不出现 tab id、Port、window label、`invoke` 或 IPC 概念
- token 的消息形状在阶段 1 保持**当前 v1 wire**；阶段 2 只替换实现，不为 v2 重新设计 token
- 至少存在两个实现：Chrome adapter 与用于单测的内存 fake，证明 token 确实是唯一接缝

## 真实 Chrome relay

```text
shared panel → chrome.runtime.Port → MV3 background service worker → content script → inspected page connector
```

- 四段每一段都执行外层来源/方向/版本检查；版本选定后执行 US-904b exact-key guard
- background 只负责 inspected tab/Port 路由和生命周期，不签发 session、不合成 ACK、不解释 provider payload
- content script 只做定向转发和必要的 transport 编解码；不能成为第二份协议状态机
- connector 是 session/provider owner；panel 是 ACK owner。service worker 重启、Port 重连和页面刷新必须
  生成可判定的新连接，不能复用旧 session
- content script 的注入时机受 `chrome.permissions.request` 用户授权影响，延迟无上界。因此协商窗口必须按
  US-904b 的证据触发规则计时，不得以 panel 初始化为起点

## 验收标准

### 阶段 1：行为中性抽取（AC#1～#5）

| #   | 前置条件                           | 操作                                                              | 预期结果                                                                                                 | 状态 |
| --- | ---------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| 1   | generator 创建私有 panel library   | 检查 project、manifest、graph 与 release dry-run                  | 正式 workspace dependency 生效；private project 不在 public tag、API baseline、版本改写或 publish 列表中 | ⬜   |
| 2   | Chrome surface 构建                | 扫描共享 library import graph                                     | UI/状态服务只依赖 transport token；不引用 chrome runtime、PortService 或任何桌面 global                  | ⬜   |
| 3   | 抽取完成                           | 只用内存 fake transport 在单测中启动面板并渲染各页                | 面板可在无任何 `chrome.*` 的环境下装配；token 是唯一接缝                                                 | ⬜   |
| 4   | 抽取前的浏览器回归基线已记录       | 抽取后重跑 Database、Events、branch、Storage、OPFS、Settings 清理 | 用户可见行为、wire 消息与错误展示与基线一致；**阶段 1 不引入任何协议或行为差异**                         | ⬜   |
| 5   | 公开包统计与 API baseline 已有基线 | 运行 API surface 审计与包数量统计                                 | 公开包数量与 baseline 条目不变；`packages/rxdb-devtools-panel/` 不产生任何公开子路径入口                 | ⬜   |

### 阶段 2：Chrome v2 迁移（AC#6～#14）

| #   | 前置条件                                                           | 操作                                               | 预期结果                                                                                                   | 状态 |
| --- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 6   | new panel + v2 connector，真实 background/content/Port             | 同时交换 eager legacy 与 v2 HANDSHAKE              | background 不代 ACK；确定选择 v2，只建立一个 session，从未短暂进入 v1                                      | ⬜   |
| 7   | panel 先于 inspected page connector 就绪，且注入需先获得 host 授权 | 授权后刷新页面，观察握手                           | panel 在观察到 legacy HANDSHAKE 时补发 HELLO，窗口自暂存起算；双方均支持 v2 时仍选 v2，不因授权耗时而降级  | ⬜   |
| 8   | new panel/old connector 与 old panel/new connector                 | 分别通过真实扩展 relay 调试既有页面                | 前者窗口到期后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                        | ⬜   |
| 9   | 双方版本无交集、service worker 重启、页面刷新和 Port 重连          | 观察 UI 与 session                                 | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态 | ⬜   |
| 10  | Chrome OPFS provider                                               | 运行 US-904b 全部 data-plane conformance           | descriptor、base64、限额、transfer、snapshot 和穷举错误全部通过，不保留旧 OPFS 私有状态机                  | ⬜   |
| 11  | capability 为 none，握手前后产生事件并伪造查询                     | 经过真实四段 relay 观察页面消息和 provider 调用    | 仅生命周期消息；EVENT/DB_INFO/BRANCHES/Storage/files、订阅、buffer、provider 调用全部为 0                  | ⬜   |
| 12  | readonly/full 普通 Chrome 页面使用现有 Web adapters                | 查询、事件、branch、OPFS、Storage 与 Settings 清理 | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                               | ⬜   |
| 13  | Settings 展示数据库下载                                            | 点击按钮并强制发送 export 命令                     | 按钮禁用；返回 `export_unsupported`；`navigator.storage.getDirectory()`、SQLite/WAL 和文件读取次数均为 0   | ⬜   |
| 14  | Chrome 与 fake native thin driver                                  | 运行同一 panel/provider conformance                | 状态、错误、授权和资源清理一致；事件集合只来自 `RXDB_EVENT_TYPES`，fixture、状态机和错误断言没有平台副本   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- **两阶段必须是独立的 PR / commit 序列**：阶段 1 的 diff 不得包含 wire 消息类型、错误码或权限判定的
  变化；阶段 2 的行为收敛不得夹带组件搬迁。
- 组件不得通过 `inject()` 直接取 Chrome service，只能取 transport token；adapter 在 app 的 provider 中绑定。
- library 不得依赖 `apps/` 下的任何代码，方向只能是 app → library。
- v1 bridge 至少保留一个 fixed release 次版本；移除前同步 `website/docs/migration/v1.md`、扩展最低
  connector 版本与 release notes。plan 阶段必须显式记录 v1 兼容形态的取舍（完整 facade vs 版本闸门，
  见 US-904 共享不变量），选定 facade 时要写明它需要维护到哪个版本。
- Chrome adapter 只能实现 transport driver 和必要编码，不能修改共享错误名、资源上限或平台语义。
- 浏览器数据库下载的禁用是安全收敛，不得为了「回归不变」保留热拷贝、全 origin 遍历或 basename 猜归属。

## 实现文件

- `packages/rxdb-devtools-panel/` — 私有 Angular library、共享面板、状态服务和 transport token
- `apps/rxdb-devtools-extension/src/` — Chrome adapter、background/content relay、迁移桥和浏览器回归
- `packages/rxdb-devtools/src/` — 只在 v1 facade 边界内做旧命令映射，不新增 wire
- `nx.json` — 私有 project 的 fixed release exclusion
- `requirements/api-baseline/` — 断言该 private project 不进入公开 API 清单

## References

- [US-904 DevTools 原生本地存储调试共享契约](./US-904-devtools-native-storage-contract.md)
- [US-904b DevTools v2 协议](./US-904b-devtools-v2-protocol.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
