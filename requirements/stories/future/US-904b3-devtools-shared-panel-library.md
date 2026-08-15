---
id: US-904b3
title: DevTools 共享面板与 Chrome v2 迁移
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, angular, browser, chrome, migration]
---

<!--
INVEST 检查清单:
- [x] Independent: 消费 US-904b1/b2，不依赖 Electron/Tauri native host
- [x] Negotiable: Angular service/component 拆分可调整，私有发布边界与真实 Chrome relay 证据不可省略
- [x] Valuable: 三种 surface 共用一套面板，Chrome 迁移成为真实协议基准
- [x] Estimable: library、transport token、四段 relay、数据库下载收敛和浏览器回归已分项
- [x] Small: 不设计协议/状态机，不接桌面 provider
- [x] Testable: 真实 extension background/content/Port 与普通 Chrome 页面可自动验收
-->

# 用户故事：DevTools 共享面板与 Chrome v2 迁移

> 共享契约见 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。本故事消费 US-904b1/b2，
> 只负责私有共享面板、Chrome adapter 和 v1/v2 真实迁移证据。

## 作为/我想要/以便

**作为** Chrome、Electron、Tauri DevTools surface 的维护者
**我想要** 从正式 workspace dependency 消费同一 Angular 面板和 transport token
**以便** UI、状态机、错误展示和 provider 交互只有一个实现，Chrome 成为可复现的兼容基准

## 启动门禁

- [US-904b1](./US-904b1-devtools-v2-control-plane.md) 已冻结控制面和四段 relay contract。
- [US-904b2](./US-904b2-devtools-provider-data-plane.md) 已冻结 provider 数据面和 conformance suite。

## 范围边界

### In Scope

- 用 generator 创建 `packages/rxdb-devtools-panel/` 私有 Angular library，迁入面板组件、状态服务和
  平台无关 transport token
- Chrome runtime/PortService 只作为 transport adapter 注入；共享 UI 不读取 `chrome.*`、PortService、
  `ipcRenderer`、Tauri global 或桌面 host global
- 修改 background/content relay：新 background 不再看到 HANDSHAKE 就代发 ACK，所有 ACK 由 panel
  按 US-904b1 状态机决定
- 完整跑通 new/new v2、new panel/old connector bridge、old panel/new connector facade 和无共同版本路径
- Chrome OPFS provider 接入 US-904b2 descriptor、base64 transfer、错误映射与 snapshot conformance
- Database、Events、branch、Storage metadata、OPFS 和 Settings 清理的浏览器回归
- 删除不安全数据库下载路径：按钮禁用，强制命令 `export_unsupported`，执行路径零 OPFS 读取
- 普通 Chrome 页面在 `none` 档的零数据泄漏回归，以及 readonly/full 的既有功能回归
- 私有 library 的 workspace、Nx release、包数量和 API baseline 隔离

### Out of Scope

- 修改 US-904b1/b2 已冻结的 wire、错误、transfer 或 snapshot 状态机
- Electron extension 加载、Tauri window/transport 或任何 native provider
- 数据库备份、export lease 或新的安全下载实现
- 发布新的公共 Angular/npm 包

## 私有 library 边界

- `packages/rxdb-devtools-panel/package.json` 必须 `private: true`，不得声明 `npm:public` tag 或 publish target
- `nx.json.release.projects` 必须显式排除该 project；fixed release version/publish dry-run 不得修改或发布它
- Chrome/Electron/Tauri 通过 package manager workspace dependency 消费，不使用 tsconfig path 绕过依赖
- API baseline 与公开包统计继续只包含现有公开 npm 包；本故事不改变 `status-overview.md` 的“28 个公开包”
- library 构建不得把 Chrome types/runtime 变成传递依赖；surface adapter 在各 app 侧提供 transport

## 真实 Chrome relay

```text
shared panel
  -> chrome.runtime.Port
  -> MV3 background service worker
  -> content script
  -> inspected page connector
```

- 四段每一段都执行外层来源/方向/版本检查；版本选定后执行 US-904b1/b2 exact-key guard
- background 只负责 inspected tab/Port 路由和生命周期，不签发 session、不合成 ACK、不解释 provider payload
- content script 只做定向转发和必要的 transport 编解码；不能成为第二份协议状态机
- connector 是 session/provider owner；panel 是 ACK owner。service worker 重启、Port 重连和页面刷新必须生成
  可判定的新连接，不能复用旧 session

## 验收标准

| #   | 前置条件                                                  | 操作                                               | 预期结果                                                                                                   | 状态 |
| --- | --------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1   | generator 创建私有 panel library                          | 检查 project、manifest、graph 与 release dry-run   | 正式 workspace dependency 生效；private project 不在 public tag、API baseline、版本改写或 publish 列表中   | ⬜   |
| 2   | Chrome surface 构建                                       | 扫描共享 library import graph                      | UI/状态服务只依赖 transport token；不引用 chrome runtime、PortService 或任何桌面 global                    | ⬜   |
| 3   | new panel + v2 connector，真实 background/content/Port    | 同时交换 eager legacy 与 v2 HANDSHAKE              | background 不代 ACK；1 秒内确定选择 v2，只建立一个 session，从未短暂进入 v1                                | ⬜   |
| 4   | new panel/old connector 与 old panel/new connector        | 分别通过真实扩展 relay 调试既有页面                | 前者 1 秒后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                           | ⬜   |
| 5   | 双方版本无交集、service worker 重启、页面刷新和 Port 重连 | 观察 UI 与 session                                 | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态 | ⬜   |
| 6   | Chrome OPFS provider                                      | 运行 US-904b2 全部 data-plane conformance          | descriptor、base64、限额、transfer、snapshot 和穷举错误全部通过，不保留旧 OPFS 私有状态机                  | ⬜   |
| 7   | capability 为 none，握手前后产生事件并伪造查询            | 经过真实四段 relay 观察页面消息和 provider 调用    | 仅生命周期消息；EVENT/DB_INFO/BRANCHES/Storage/files、订阅、buffer、provider 调用全部为 0                  | ⬜   |
| 8   | readonly/full 普通 Chrome 页面使用现有 Web adapters       | 查询、事件、branch、OPFS、Storage 与 Settings 清理 | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                               | ⬜   |
| 9   | Settings 展示数据库下载                                   | 点击按钮并强制发送 export 命令                     | 按钮禁用；返回 `export_unsupported`；`navigator.storage.getDirectory()`、SQLite/WAL 和文件读取次数均为 0   | ⬜   |
| 10  | Chrome 与 fake native thin driver                         | 运行同一 panel/provider conformance                | 状态、错误、授权和资源清理一致；事件集合只来自 `RXDB_EVENT_TYPES`，fixture、状态机和错误断言没有平台副本   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- v1 bridge 至少保留一个 fixed release 次版本；移除前同步 `website/docs/migration/v1.md`、扩展最低
  connector 版本与 release notes。
- Chrome adapter 只能实现 transport driver 和必要编码，不能修改共享错误名、资源上限或平台语义。
- 浏览器数据库下载的禁用是安全收敛，不得为了“回归不变”保留热拷贝、全 origin 遍历或 basename 猜归属。

## 实现文件

- `packages/rxdb-devtools-panel/` — 私有 Angular library、共享面板、状态服务和 transport token
- `apps/rxdb-devtools-extension/src/` — Chrome adapter、background/content relay、迁移桥和浏览器回归
- `nx.json` — 私有 project 的 fixed release exclusion
- `requirements/api-baseline/` — 断言该 private project 不进入公开 API 清单

## References

- [US-904b 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b1 v2 控制面与安全边界](./US-904b1-devtools-v2-control-plane.md)
- [US-904b2 provider 数据面与 conformance](./US-904b2-devtools-provider-data-plane.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
