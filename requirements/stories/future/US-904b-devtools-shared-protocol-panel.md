---
id: US-904b
title: DevTools 共享 v2 协议与面板
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, protocol, angular, browser, provider, parent-story]
---

<!--
INVEST 检查清单（本文件是拆分后的父故事/契约文档，不直接交付）:
- [x] Independent: 共享链不依赖 Electron MV3 可行性或任何 native host
- [x] Negotiable: 内部服务和 transport adapter 的组织可调整，wire 与安全边界不可漂移
- [x] Valuable: Chrome、Electron、Tauri 共用协议、provider 语义、面板和错误模型
- [x] Estimable: 协议控制面、provider 数据面、共享 UI/Chrome 迁移已分别落入 US-904b1/b2/b3
- [ ] Small: 不成立，已拆成 US-904b1 / US-904b2 / US-904b3
- [x] Testable: 三条子故事各自持有协议、数据面和真实 Chrome relay 的自动验收
-->

# 用户故事：DevTools 共享 v2 协议与面板（契约父故事）

> **本文件不直接交付。** 它是三条子故事共享的版本、安全、数据面和发布边界；三条全部
> `Done` 后才把本父故事置 `Done`。
>
> | 子故事                                                           | 交付                                                    |
> | ---------------------------------------------------------------- | ------------------------------------------------------- |
> | [US-904b1](./US-904b1-devtools-v2-control-plane.md)              | v1/v2 协商、session、授权、ID 预算与控制面 conformance  |
> | [US-904b2](./US-904b2-devtools-provider-data-plane.md)           | provider 描述、传输、快照、错误映射与数据面 conformance |
> | [US-904b3](./US-904b3-devtools-shared-panel-chrome-migration.md) | 私有共享面板、Chrome 四段 relay、迁移桥与浏览器回归     |

## 作为/我想要/以便

**作为** DevTools transport/provider 的实现者
**我想要** 使用一套有版本、身份、资源上限、能力描述和共享面板的实现
**以便** Chrome、Electron、Tauri 对相同数据和错误产生相同状态，不复制 UI、wire 或平台 fallback

## 固定拆分与依赖

1. **US-904b1：控制面。** 冻结四段 relay 的 ACK 所有权、版本选择、session、授权和有界 ID 生命周期。
2. **US-904b2：provider 数据面。** 在 b1 上冻结 descriptor、binary wire、文件传输、诊断快照和错误映射。
3. **US-904b3：共享面板与 Chrome 迁移。** 消费 b1/b2，抽取内部 Angular 面板并完成真实 extension relay 回归。

固定关系为 **US-904b1 → US-904b2 → US-904b3**。整条链与
[US-904a](./US-904a-electron-mv3-devtools-feasibility.md) 并行，不依赖 US-207、US-504、US-210、
US-505 或任何 native host。Electron / Tauri 集成只消费已冻结的共享产物，不能反向增加平台私有 wire。

## 共享不变量

- v2 采用“宽外层、严内层”：外层只识别来源、方向、消息类和版本范围；选定版本后使用 exact-key guard
- 新 panel、新 background、content script 与 connector 的 ACK 所有权只有一处；relay 不得代替 panel
  提前 ACK，v2 胜出后不能短暂进入 v1 或建立第二个 session
- `sessionId` 只绑定生命周期和路由，不是授权 secret；授权只来自 connector/provider owner 的可信配置、
  descriptor 与显式 mutation policy，wire 中回显的字段不得成为 host 的权限来源
- `none` 只允许握手、PING、清事件缓冲和断连；不得订阅、缓存或发送 DB_INFO、EVENT、BRANCHES、
  Storage、文件内容或 provider 响应
- v2 生命周期命令命名为 `CLEAR_EVENT_BUFFER`；Settings 数据清理由 `settings.clear` 表达，不能复用 legacy
  `CLEAR`。v1 facade 只在边界内映射旧命令
- 同一 session 的在途数和终态 ID 记录都有硬上限；达到总预算后轮换 session，不以无界 tombstone
  换取“永不复用”
- binary wire 使用统一编码和 decoded-byte 计量；所有大小、索引、offset、页数和版本字段必须是范围内的
  safe integer，NaN、Infinity、负数、溢出和非规范编码必须在分配资源前拒绝
- provider 的正常业务失败与协议失败使用同一穷举错误联合；DOMException、Node error、Rust error 和绝对路径
  只能映射到共享错误码，不能穿透 transport
- snapshot 的 deadline 从请求进入开始，覆盖等锁、物化、重试、分页资源登记和取消；不能只计算持锁时间
- Chrome、Electron、Tauri 通过薄 transport driver 运行同一 conformance suite；fake driver 不能替代真实
  Chrome Port/background/content relay 或真实桌面 host E2E
- v1 bridge 至少保留一个 fixed release 次版本；删除前同步迁移文档、扩展最低 connector 版本和发布说明

## 范围边界

### In Scope

- `@aiao/rxdb-devtools` 的 v2 控制面和 provider 数据面
- fake providers、transport driver contract 与共享 conformance suite
- 私有 Angular panel library、Chrome adapter、v1/v2 迁移桥和既有浏览器功能回归
- 禁用当前不安全的浏览器数据库下载路径；强制命令返回 `export_unsupported` 且执行路径零 OPFS 读取

### Out of Scope

- Electron/Tauri 窗口、native host、SQLite 或原生文件系统接入
- 数据库导入导出、SQLite/WAL 热备份、export lease 或新的可靠备份实现
- 在 v1 facade 上开放 provider descriptor、native files 或任何 v2 新操作
- 将共享 Angular 面板发布为公共 npm 包

## 关闭判定

**本父故事不直接持有 AC。** 关闭只看子故事：

| 契约范围                                                | 去向                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| 版本协商、ACK 所有权、session、授权和 ID 预算           | [US-904b1](./US-904b1-devtools-v2-control-plane.md)              |
| provider、binary transfer、snapshot、错误与 conformance | [US-904b2](./US-904b2-devtools-provider-data-plane.md)           |
| 私有共享面板、Chrome relay、v1 bridge 与浏览器回归      | [US-904b3](./US-904b3-devtools-shared-panel-chrome-migration.md) |

## 实现所有权

| 路径                                   | 所有者   | 边界                                                       |
| -------------------------------------- | -------- | ---------------------------------------------------------- |
| `packages/rxdb-devtools/src/`          | US-904b1 | v2 控制面、版本、session、授权、ID 预算与生命周期          |
| `packages/rxdb-devtools/src/provider/` | US-904b2 | descriptor、transfer、snapshot、错误映射与数据面状态机     |
| `packages/rxdb-devtools/src/testing/`  | b1 / b2  | 控制面与数据面共享 conformance；不复制平台 fixture         |
| `packages/rxdb-devtools-panel/`        | US-904b3 | `private: true` 的 Angular library、面板和 transport token |
| `apps/rxdb-devtools-extension/src/`    | US-904b3 | Chrome adapter、四段 relay、迁移桥和浏览器回归             |
| `nx.json`                              | US-904b3 | 将私有 panel project 排除出 `release.projects`             |
| `requirements/api-baseline/`           | 改动方   | 只有新增公开入口时同步                                     |

`packages/rxdb-devtools-panel/` 必须是正式 workspace dependency，但 package manifest 必须设置
`private: true`，Nx tag 不得使用 `npm:public`，并从 fixed release group 的 `packages/*` 匹配中显式排除。
它不增加公开 npm 包数量，也不进入 API baseline。

## References

- [US-904 Electron 原生本地存储 DevTools 契约](./US-904-electron-native-storage-devtools.md)
- [US-904a Electron 43 MV3 可行性门禁](./US-904a-electron-mv3-devtools-feasibility.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)
- [版本与 API 稳定性策略](../../versioning-policy.md)
