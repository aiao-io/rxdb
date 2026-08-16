---
id: US-904d
title: Electron 原生存储 DevTools 集成
status: Backlog
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, electron, sqlite, filesystem]
---

<!--
INVEST 检查清单:
- [x] Independent: 共享协议与业务 host 均为前置，本故事只做 Electron provider 和真实接线
- [x] Negotiable: 开发配置入口和 E2E fixture 组织可按现有应用模式调整
- [x] Valuable: 面板能看到真正的 Electron SQLite 与原生文件，而非 WebView fallback
- [x] Estimable: SQLite、文件、Settings、安全边界和真实链路证据已分项
- [x] Small: 不改共享 v2、不实现 Tauri、不设计数据库导出
- [x] Testable: 真实 extension/renderer/preload/main、重启、越界和 1001 条诊断均可验收
-->

# 用户故事：Electron 原生存储 DevTools 集成

> 跨故事契约见 [US-904](./US-904-devtools-native-storage-contract.md)；协议数值与状态机见
> [US-904b](./US-904b-devtools-v2-protocol.md)。本故事只实现 Electron desktop SQLite 与 native files
> provider，并在真实应用链路验收。

## 作为/我想要/以便

**作为** 使用 Electron 桌面后端的开发者
**我想要** 在 RxDB DevTools 中检查真实 SQLite 数据、事件、storage metadata 和原生文件
**以便** 定位逻辑数据与应用数据目录持久化结果之间的不一致，而不会误查 WebView 存储

## 启动门禁

- [US-904a](./US-904a-electron-mv3-devtools-feasibility.md) 已完成、`decision: supported` 且 `evidence`
  非空。若为 `unsupported`，本故事转 `Blocked`，并按 [US-905](./US-905-tauri-native-devtools.md) 的
  受限窗口模型另立承载故事替代。
- [US-904b](./US-904b-devtools-v2-protocol.md) 与
  [US-904c](./US-904c-devtools-shared-panel-chrome-migration.md) 已 `Done`，分别冻结 v2 协议/conformance
  与共享 panel library / Chrome v2 relay 基准。
- [US-207](../adapter/US-207-desktop-local-database.md) 已交付 Electron SQLite 与 desktop host 接缝；
  不等待其无关的三平台打包矩阵。[US-504](../plugin/US-504-electron-local-file-storage.md) 已交付原生文件接缝。

## 范围边界

### In Scope

- `dev-rxdb-electron` 仅在显式开发配置下加载工作区 unpacked 扩展；production 产物不含扩展源码、
  加载路径、bootstrap 或新增权限
- Electron SQLite provider 通过 connector 的语义 API 查询实体、全部 `RXDB_EVENT_TYPES`、branch 和
  Storage metadata，不向扩展开放任意 SQL
- Electron native files provider 只暴露插件专用逻辑根，支持浏览、刷新、上传、下载、新建目录和删除
- 三个领域只声明 US-904b 的语义 kind，`runtime: electron` 只用于显示；显式开发 fixture 以
  `capabilities: full` + `mutationPolicy: allow` 开启文件变更，省略 mutation policy 时保持只读
- 文件上传/下载原样实现 US-904b 的 RFC 4648 base64 transfer 状态机，provider 声明真实
  `maxTransferBytes`，覆盖边界大小、乱序/重复/缺块、取消、超时与断连，不在 renderer 或 main 整体缓存文件
- 诊断在 storage 全局独占锁内物化有界 immutable snapshot，覆盖 1001 条以上数据、两类缺失、
  临时文件/journal/在途上传排除、`snapshot_busy` 与 `snapshot_too_large`
- Settings 数据库下载始终 `export_unsupported`；清理仅按 provider 明确能力启用
- connector、preload 与 main/host 分层校验 session、请求、传输、操作和逻辑路径；关闭 DevTools、
  页面刷新或应用退出时释放所有资源
- 真实临时 `userData`、desktop SQLite、native files、扩展和应用重启 E2E

### Out of Scope

- 修改 US-207 / US-504 的持久化布局、事务、路径编码、锁或补偿语义
- 数据库导入导出、SQLite/WAL 热备份、export lease、任意 SQL 或绝对路径浏览
- Tauri transport/window/provider
- 只用 mock host、in-process transport 或 Angular service 测试代替真实链路

## 验收标准

| #   | 前置条件                                                   | 操作                                                   | 预期结果                                                                                                                                         | 状态 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 分别构建显式开发配置与 production                          | 检查产物并启动                                         | dev 加载唯一工作区扩展并握手；production 无扩展源码、加载路径、bootstrap 和新增权限                                                              | ⬜   |
| 2   | 应用使用 US-207 desktop SQLite                             | 查询实体、逐类派发事件并切换 branch                    | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与应用一致；不创建或查询 OPFS/IndexedDB fallback                                                         | ⬜   |
| 3   | 应用使用 US-504 原生文件后端并显式允许 mutation            | 浏览并执行正常/零字节/边界大小上传下载、新建目录、删除 | 只操作插件专用根，字节一致；UI 仅用 `runtime: electron` 显示来源；全程流式，失败/取消/超时无半写文件或孤儿 metadata                              | ⬜   |
| 4   | 1001 条以上 metadata/files、两类缺失和一条在途上传         | 读取完整诊断 snapshot                                  | 从请求进入起算的共享 deadline（US-904b）覆盖等锁/物化/重试；不漏尾页或误报临时状态；失效/超限/过期分别返回 shared busy/too-large/expired         | ⬜   |
| 5   | 打开 Settings                                              | 尝试数据库下载和未声明的清理                           | 下载禁用且强制命令返回 `export_unsupported`；未声明清理返回 `provider_unsupported`，不读取 OPFS/SQLite/WAL 或其他目录                            | ⬜   |
| 6   | 同源脚本/content script 持有合法 session，或构造越界路径   | 在 none/readonly/full、mutation 开/关组合下伪造操作    | connector、preload、host 各自校验；未授权 provider 调用为 0，未 opt-in mutation 不执行；根外无读写，错误不含路径、SQL 绑定值、加密字段或文件内容 | ⬜   |
| 7   | session A 有订阅、迟到响应和未完成传输                     | 关闭/刷新后建立 session B 并投递 A 消息                | A 的 host session 与资源释放；B 拒绝旧身份，不显示旧实体、错误、事件或进度                                                                       | ⬜   |
| 8   | 真实临时 userData、SQLite 与原生文件后端                   | 跑 E2E，重启应用后重新连接                             | 重启前后同一实体和文件一致；证据经过真实 extension/renderer/preload/main/host，不用 mock 替代                                                    | ⬜   |
| 9   | Electron 薄 driver 接入 US-904b conformance 与 904c panel library | 运行全部共享断言                                 | 控制面、descriptor、base64、safe integer、授权、传输、快照、错误和 session 重建通过；不复制 UI、wire、fixture 或错误码                           | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 扩展不得读取 `globalThis.__aiaoRxdbDesktopHost__`、原始 `ipcRenderer` 或应用数据目录句柄。
- US-207 / US-504 把窄调试能力注册给 connector；connector 统一执行 v2 序列化、脱敏、超时和生命周期。
- native files provider 只接收逻辑路径和有界分块，host 继续负责路径解析、二次校验与原子落盘。
- session 只做关联，不做授权；capability、descriptor 和 mutation policy 在 connector 与 host 两侧重复校验。
- 所有控制面、provider、传输、snapshot 与错误限制原样使用 US-904b；面板消费 US-904c 的 private
  workspace library，relay 语义沿用 US-904c 已验证的 Chrome 基准，不增加 Electron 私有 kind/error/fallback。

## 实现文件

- `packages/rxdb-adapter-desktop/src/` — Electron SQLite 只读诊断 provider
- `packages/rxdb-plugin-storage/src/` — Electron native files 调试 provider
- `apps/dev-rxdb-electron/src-electron/` — 开发加载、preload/main 接线与生产隔离
- `apps/dev-rxdb-electron-e2e/` — 真实扩展、持久化、重启与安全边界 E2E
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 DevTools 原生本地存储调试共享契约](./US-904-devtools-native-storage-contract.md)
- [US-904a Electron 43 MV3 可行性门禁](./US-904a-electron-mv3-devtools-feasibility.md)
- [US-904b DevTools v2 协议](./US-904b-devtools-v2-protocol.md)
- [US-904c DevTools 共享面板与 Chrome v2 迁移](./US-904c-devtools-shared-panel-chrome-migration.md)
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md)
- [US-504 Electron 本地文件存储](../plugin/US-504-electron-local-file-storage.md)
