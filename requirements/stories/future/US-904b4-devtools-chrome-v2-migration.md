---
id: US-904b4
title: DevTools Chrome v2 迁移
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, browser, chrome, migration, security]
---

<!--
INVEST 检查清单:
- [x] Independent: 消费 US-904b1/b2/b3 的冻结产物，不依赖 Electron/Tauri native host
- [x] Negotiable: relay 内部分层与 adapter 组织可调整，ACK 所有权与四段来源校验不可省略
- [x] Valuable: Chrome 成为 v2 的真实兼容基准，并关闭不安全数据库下载
- [x] Estimable: relay 改造、OPFS provider 迁移、下载收敛与浏览器回归已分项
- [x] Small: 不设计协议/状态机，不创建共享 library，不接桌面 provider
- [x] Testable: 真实 extension background/content/Port 与普通 Chrome 页面可自动验收
-->

# 用户故事：DevTools Chrome v2 迁移

> 共享契约见 [US-904b](./US-904b-devtools-shared-protocol-panel.md)。本故事把 US-904b3 抽出的共享面板
> 从 v1 切到 US-904b1/b2 的 v2 协议，并在真实 Chrome 扩展链路上留下兼容基准证据。

## 作为/我想要/以便

**作为** RxDB DevTools 扩展的维护者
**我想要** 让真实 Chrome 四段中继按 v2 控制面和 provider 数据面运行
**以便** Electron 与 Tauri 接入前，v2 已经有一个可复现、可回归的真实平台基准

## 启动门禁

- [US-904b1](./US-904b1-devtools-v2-control-plane.md) 已冻结控制面、协商窗口和 ACK 所有权。
- [US-904b2](./US-904b2-devtools-provider-data-plane.md) 已冻结 provider 数据面和 conformance suite。
- [US-904b3](./US-904b3-devtools-shared-panel-library.md) 已交付 `packages/rxdb-devtools-panel/`
  私有 library 与 transport token；本故事只替换 token 背后的实现，不再搬运组件。

## 范围边界

### In Scope

- 改造 background/content relay：background 不再看到 HANDSHAKE 就代发 ACK，所有 ACK 由 panel
  按 US-904b1 状态机决定
- panel 侧 Chrome transport driver 实现 US-904b1 的证据触发协商：init 发 `PROTOCOL_HELLO`，
  并在每次无 session 状态下观察到 legacy HANDSHAKE 时补发一次
- 完整跑通 new/new v2、new panel/old connector bridge、old panel/new connector facade 和无共同版本路径
- Chrome OPFS provider 接入 US-904b2 descriptor、base64 transfer、错误映射与 snapshot conformance，
  删除旧 OPFS 私有状态机
- 删除不安全数据库下载路径：按钮禁用，强制命令 `export_unsupported`，执行路径零 OPFS 读取
- Database、Events、branch、Storage metadata、OPFS 和 Settings 清理的浏览器回归
- 普通 Chrome 页面在 `none` 档的零数据泄漏回归，以及 readonly/full 的既有功能回归
- v1 bridge 的保留窗口与移除前的文档/最低版本同步约定

### Out of Scope

- 修改 US-904b1/b2 已冻结的 wire、错误、transfer 或 snapshot 状态机
- 创建或搬迁 `packages/rxdb-devtools-panel/`、调整其 private/release 边界（US-904b3）
- Electron extension 加载、Tauri window/transport 或任何 native provider
- 数据库备份、export lease 或新的安全下载实现

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
- content script 的注入时机受 `chrome.permissions.request` 用户授权影响，延迟无上界。因此协商窗口
  必须按 US-904b1 的证据触发规则计时，不得以 panel 初始化为起点

## 验收标准

| #   | 前置条件                                                           | 操作                                               | 预期结果                                                                                                   | 状态 |
| --- | ------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1   | new panel + v2 connector，真实 background/content/Port             | 同时交换 eager legacy 与 v2 HANDSHAKE              | background 不代 ACK；确定选择 v2，只建立一个 session，从未短暂进入 v1                                      | ⬜   |
| 2   | panel 先于 inspected page connector 就绪，且注入需先获得 host 授权 | 授权后刷新页面，观察握手                           | panel 在观察到 legacy HANDSHAKE 时补发 HELLO，窗口自暂存起算；双方均支持 v2 时仍选 v2，不因授权耗时而降级  | ⬜   |
| 3   | new panel/old connector 与 old panel/new connector                 | 分别通过真实扩展 relay 调试既有页面                | 前者窗口到期后 bridge，后者无等待 facade；既有页面可用且都不获得 v2/provider 新能力                        | ⬜   |
| 4   | 双方版本无交集、service worker 重启、页面刷新和 Port 重连          | 观察 UI 与 session                                 | 可见 `protocol_unsupported` 或确定重连；旧订阅、请求、transfer、snapshot、计时器清理，迟到消息不进入新状态 | ⬜   |
| 5   | Chrome OPFS provider                                               | 运行 US-904b2 全部 data-plane conformance          | descriptor、base64、限额、transfer、snapshot 和穷举错误全部通过，不保留旧 OPFS 私有状态机                  | ⬜   |
| 6   | capability 为 none，握手前后产生事件并伪造查询                     | 经过真实四段 relay 观察页面消息和 provider 调用    | 仅生命周期消息；EVENT/DB_INFO/BRANCHES/Storage/files、订阅、buffer、provider 调用全部为 0                  | ⬜   |
| 7   | readonly/full 普通 Chrome 页面使用现有 Web adapters                | 查询、事件、branch、OPFS、Storage 与 Settings 清理 | 除数据库下载和超过协商上限的传输明确拒绝外，用户可见行为不变                                               | ⬜   |
| 8   | Settings 展示数据库下载                                            | 点击按钮并强制发送 export 命令                     | 按钮禁用；返回 `export_unsupported`；`navigator.storage.getDirectory()`、SQLite/WAL 和文件读取次数均为 0   | ⬜   |
| 9   | Chrome 与 fake native thin driver                                  | 运行同一 panel/provider conformance                | 状态、错误、授权和资源清理一致；事件集合只来自 `RXDB_EVENT_TYPES`，fixture、状态机和错误断言没有平台副本   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- v1 bridge 至少保留一个 fixed release 次版本；移除前同步 `website/docs/migration/v1.md`、扩展最低
  connector 版本与 release notes。
- plan 阶段必须显式记录 v1 兼容形态的取舍：**完整 facade**（旧 connector 继续可用，维护成本高）
  与**版本闸门**（只回一条“connector 版本过低，请升级到 ≥ X”并停止会话，维护成本低但破坏旧应用）。
  选定 facade 时要写明它需要维护到哪个版本，避免它无限期存在。
- Chrome adapter 只能实现 transport driver 和必要编码，不能修改共享错误名、资源上限或平台语义。
- 浏览器数据库下载的禁用是安全收敛，不得为了“回归不变”保留热拷贝、全 origin 遍历或 basename 猜归属。

## 实现文件

- `apps/rxdb-devtools-extension/src/` — Chrome adapter、background/content relay、迁移桥和浏览器回归
- `packages/rxdb-devtools/src/` — 只在 v1 facade 边界内做旧命令映射，不新增 wire

## References

- [US-904b 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b1 v2 控制面与安全边界](./US-904b1-devtools-v2-control-plane.md)
- [US-904b2 provider 数据面与 conformance](./US-904b2-devtools-provider-data-plane.md)
- [US-904b3 DevTools 共享面板 library 抽取](./US-904b3-devtools-shared-panel-library.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
