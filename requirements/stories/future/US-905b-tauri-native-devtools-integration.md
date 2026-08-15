---
id: US-905b
title: Tauri 原生存储 DevTools 集成
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, tauri, sqlite, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent: 窗口、共享 v2 与业务 host 都是前置，本故事只接真实 Tauri providers
- [x] Negotiable: provider 注册位置与三平台 smoke 调度可遵循现有应用结构
- [x] Valuable: Tauri 开发者能检查真实 SQLite、事件、metadata 和原生文件
- [x] Estimable: provider、Settings、安全边界、重启 E2E 与三平台 smoke 已分项
- [x] Small: 不改共享协议、不建窗口模型、不实现数据库导出
- [x] Testable: 真实 WebView/Rust/host、1001 条诊断、重启与三平台 smoke 可验收
-->

# 用户故事：Tauri 原生存储 DevTools 集成

> 共享契约见 [US-905](./US-905-tauri-native-storage-devtools.md)。本故事把 US-210 / US-505 的
> 真实 host 接入 US-905a 已完成的窗口和 transport。

## 作为/我想要/以便

**作为** 使用 Tauri 原生存储的开发者
**我想要** 在共享 RxDB DevTools 面板检查真实 SQLite 数据、事件和应用作用域文件
**以便** 使用与 Chrome/Electron 一致的诊断语义定位持久化问题，不误查 WebView fallback

## 启动门禁

- [US-905a](./US-905a-tauri-devtools-window-transport.md) 已交付窗口与 transport。
- US-904b1/b2 已冻结控制面与 native provider conformance；US-904b3 已交付 private panel。
- [US-210](../adapter/US-210-tauri-sqlite-local-database.md) 与
  [US-505](../plugin/US-505-tauri-local-file-storage.md) 已交付真实 Tauri host。

## 范围边界

### In Scope

- Tauri SQLite provider 通过主 WebView connector 查询实体、全部 `RXDB_EVENT_TYPES`、branch 与
  Storage metadata；调试窗口不直接打开数据库或取得 writer lease
- Tauri native files provider 只暴露插件专用逻辑根，支持浏览、刷新、上传、下载、新建目录和删除
- 三个领域只声明 US-904b2 的语义 kind，`runtime: tauri` 只用于显示；显式开发 fixture 以
  `capabilities: full` + `mutationPolicy: allow` 开启文件变更，省略 mutation policy 时保持只读
- 文件上传/下载原样实现 US-904b2 的 RFC 4648 base64 transfer，provider 声明真实
  `maxTransferBytes`，覆盖边界大小、
  乱序/重复/缺块、取消、超时与断连，不在 WebView/Rust 整体缓存文件
- 1001 条以上有界 immutable snapshot、两类缺失、临时文件/journal/在途上传排除，以及包含等锁的
  15 秒 deadline、`snapshot_busy` / `snapshot_too_large` / `snapshot_expired`
- Settings 数据库下载始终 `export_unsupported`；清理只按 provider 明确能力启用，不操作 WebView
  OPFS / IndexedDB fallback
- 调试 WebView、主 WebView、transport 与 Rust/host 分层校验身份、capability、descriptor、mutation
  policy、操作和逻辑路径，并执行共享 v2 限额
- 真实临时应用目录、SQLite、native files、WebView/Rust/host 重启 E2E
- macOS、Windows、Linux desktop 开发构建的窗口、握手、session 释放和 release capability smoke

### Out of Scope

- 修改 US-210 / US-505 的事务、路径解析、原子写入、补偿、备份域或 writer lease
- 数据库导入导出、SQLite/WAL 热备份、export lease、任意 SQL 或应用目录浏览
- Tauri mobile、远程设备调试或网络 attach
- 用 fake/in-process transport 替代真实 Rust/WebView/host E2E

## 验收标准

| #   | 前置条件                                              | 操作                                                   | 预期结果                                                                                                                         | 状态 |
| --- | ----------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 应用通过 US-210 使用应用作用域 SQLite                 | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与主窗口一致；调试窗口不打开数据库、不取得 writer lease、不创建 OPFS/IDB fallback        | ⬜   |
| 2   | 应用通过 US-505 使用 native files 并显式允许 mutation | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件根，字节一致；UI 仅用 `runtime: tauri` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                     | ⬜   |
| 3   | 1001 条以上 metadata/files、两类缺失和在途上传        | 读取完整诊断 snapshot                                  | 请求进入起 15 秒覆盖等锁/物化/重试；不漏尾页或误报临时状态；busy/too-large/expired 与共享错误一致                               | ⬜   |
| 4   | 打开 Settings                                         | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明能力返回 `provider_unsupported`，不读取 SQLite/WAL、OPFS/IDB 或其他应用目录   | ⬜   |
| 5   | 错误窗口/旧 session，或合法窗口在授权组合下伪造操作   | 通过真实 transport 发送                                | 各层拒绝错误身份；未授权 provider 调用为 0，未 opt-in mutation 不执行；响应不含路径、SQL 绑定值、加密字段或文件内容              | ⬜   |
| 6   | session 有订阅、迟到响应、snapshot 和未完成传输       | 关闭/刷新窗口或退出应用                                | 订阅、请求、snapshot、传输、临时文件和 host session 全释放；重开拒绝旧身份与迟到数据                                             | ⬜   |
| 7   | 真实临时应用目录、US-210 SQLite 与 US-505 files       | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 panel/双 WebView/transport/Rust/host，不用 fake 替代                                    | ⬜   |
| 8   | Tauri provider 接入 US-904b1/b2 conformance 与 b3 panel | 运行共享 provider 与 panel 回归                       | 控制面、safe integer、base64、descriptor、分页、授权、错误和 session 重建通过；不等待 Electron，也不复制组件、状态机或 wire      | ⬜   |
| 9   | macOS、Windows、Linux desktop dev/release 构建        | 打开/关闭调试窗口并检查产物                            | 三平台完成加载、握手、session 释放；release 无调试 capability/command/bootstrap，高成本打包 smoke 只在 release 分支或 tag 运行   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 主 WebView 是唯一 connector/provider owner；调试窗口不持有数据库连接、文件根句柄或业务 service。
- provider 只通过 US-210 / US-505 的窄 host 接缝工作，不暴露通用 SQL/filesystem command。
- session 只做关联，不做授权；capability、descriptor 和 mutation policy 在 connector 与 Rust/host 两侧重复校验。
- v2 身份、在途/总 ID 预算和 session 轮换复用 US-904b1；provider、base64 transfer、snapshot deadline
  和穷举错误复用 US-904b2，不增加 Tauri 私有 kind/error/encoding/fallback。
- Chrome / Electron / Tauri 各用薄 transport driver 运行同一 conformance suite；原生启动与打包 smoke
  可按 runner 拆分，不强迫三种自动化运行时共用同一个 spec 文件。

## 实现文件

- `packages/rxdb-adapter-desktop/src/` — Tauri SQLite 只读诊断 provider
- `packages/rxdb-plugin-storage/src/` — Tauri native files 调试 provider
- `apps/dev-rxdb-tauri/src/` — provider 注册与 UI 接线
- `apps/dev-rxdb-tauri/src-tauri/` — 受限 Rust host 接线
- `apps/dev-rxdb-tauri-e2e/` — 本故事拥有 native provider、重启、安全边界与三平台 specs
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-905 Tauri 原生本地存储 DevTools 契约](./US-905-tauri-native-storage-devtools.md)
- [US-905a Tauri DevTools 窗口与 v2 transport](./US-905a-tauri-devtools-window-transport.md)
- [US-904b DevTools 共享 v2 协议与面板契约](./US-904b-devtools-shared-protocol-panel.md)
- [US-904b1 DevTools v2 控制面](./US-904b1-devtools-v2-control-plane.md)
- [US-904b2 DevTools provider 数据面](./US-904b2-devtools-provider-data-plane.md)
- [US-904b3 DevTools 共享面板与 Chrome 迁移](./US-904b3-devtools-shared-panel-chrome-migration.md)
- [US-210 Tauri 连接应用作用域 SQLite 文件](../adapter/US-210-tauri-sqlite-local-database.md)
- [US-505 Tauri 本地文件存储](../plugin/US-505-tauri-local-file-storage.md)
