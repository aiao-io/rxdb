---
id: US-904c
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

> 共享契约见 [US-904](./US-904-electron-native-storage-devtools.md)。本故事只实现 Electron
> desktop SQLite 与 native files provider，并在真实应用链路验收。

## 作为/我想要/以便

**作为** 使用 Electron 桌面后端的开发者
**我想要** 在 RxDB DevTools 中检查真实 SQLite 数据、事件、storage metadata 和原生文件
**以便** 定位逻辑数据与应用数据目录持久化结果之间的不一致，而不会误查 WebView 存储

## 启动门禁

- US-904a 已完成且结论为 `supported`，US-904b 已冻结 v2 与共享 panel。
- [US-207](../adapter/US-207-desktop-local-database.md) 已交付 Electron SQLite 与 desktop host 接缝；
  不等待其无关的三平台打包矩阵。[US-504](../plugin/US-504-electron-local-file-storage.md) 已交付原生文件接缝。

## 范围边界

### In Scope

- `dev-rxdb-electron` 仅在显式开发配置下加载工作区 unpacked 扩展；production 产物不含扩展源码、
  加载路径、bootstrap 或新增权限
- Electron SQLite provider 通过 connector 的语义 API 查询实体、全部 `RXDB_EVENT_TYPES`、branch 和
  Storage metadata，不向扩展开放任意 SQL
- Electron native files provider 只暴露插件专用逻辑根，支持浏览、刷新、上传、下载、新建目录和删除
- 诊断使用 v2 分页快照，覆盖 1001 条以上数据、两类缺失、临时文件/journal/在途上传排除和
  `snapshot_busy`
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

| #   | 前置条件                                                      | 操作                                              | 预期结果                                                                                                                                     | 状态 |
| --- | ------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 分别构建显式开发配置与 production                            | 检查产物并启动                                    | dev 加载唯一工作区扩展并握手；production 无扩展源码、加载路径、bootstrap 和新增权限                                                           | ⬜   |
| 2   | 应用使用 US-207 desktop SQLite                              | 查询实体、逐类派发事件并切换 branch               | 数据、全部 `RXDB_EVENT_TYPES` 和 branch 与应用一致；不创建或查询 OPFS/IndexedDB fallback                                                      | ⬜   |
| 3   | 应用使用 US-504 原生文件后端                                | 浏览、上传、下载、新建目录、删除并刷新            | 只操作插件专用存储根，字节一致；UI 标明 Electron native provider，不暴露绝对路径，失败无半写文件或孤儿 metadata                               | ⬜   |
| 4   | 1001 条以上 metadata/文件、两类缺失和一条在途上传           | 读取完整诊断快照                                  | 不漏尾页，只在 complete 后报告真实差异；临时文件、journal、在途上传不误报；连续失效按 v2 上限返回 `snapshot_busy`                             | ⬜   |
| 5   | 打开 Settings                                               | 尝试数据库下载和未声明的清理                      | 下载禁用且强制命令返回 `export_unsupported`；未声明清理返回 `provider_unsupported`，不读取 OPFS/SQLite/WAL 或其他目录                          | ⬜   |
| 6   | renderer/content script 构造绝对路径、越界路径或未知操作    | 通过 DevTools 通道发送                            | connector、preload、host 各自拒绝；其他应用目录无读写，响应不含路径、SQL 绑定值、加密字段或文件内容                                            | ⬜   |
| 7   | session A 有订阅、迟到响应和未完成传输                     | 关闭/刷新后建立 session B 并投递 A 消息           | A 的 host session 与资源释放；B 拒绝旧身份，不显示旧实体、错误、事件或进度                                                                    | ⬜   |
| 8   | 真实临时 userData、SQLite 与原生文件后端                    | 跑 E2E，重启应用后重新连接                        | 重启前后同一实体和文件一致；证据经过真实 extension/renderer/preload/main/host，不用 mock 替代                                                 | ⬜   |
| 9   | Chrome 与 Electron 使用 US-904b 同一 fixture               | 运行共享 panel/provider 回归                      | 同一 descriptor、分页、错误和 session 重建产生相同面板状态；Electron adapter 不复制 UI、wire 或错误码                                        | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 扩展不得读取 `globalThis.__aiaoRxdbDesktopHost__`、原始 `ipcRenderer` 或应用数据目录句柄。
- US-207 / US-504 把窄调试能力注册给 connector；connector 统一执行 v2 序列化、脱敏、超时和生命周期。
- native files provider 只接收逻辑路径和有界分块，host 继续负责路径解析、二次校验与原子落盘。
- 所有标识、并发、传输、分页与超时限制原样使用 US-904b，不增加 Electron 私有 fallback。

## 实现文件

- `packages/rxdb-adapter-desktop/src/` — Electron SQLite 只读诊断 provider
- `packages/rxdb-plugin-storage/src/` — Electron native files 调试 provider
- `apps/dev-rxdb-electron/src-electron/` — 开发加载、preload/main 接线与生产隔离
- `apps/dev-rxdb-electron-e2e/` — 真实扩展、持久化、重启与安全边界 E2E
- `requirements/api-baseline/` — 只有新增公开入口时同步

## References

- [US-904 Electron 原生本地存储 DevTools 契约](./US-904-electron-native-storage-devtools.md)
- [US-904b DevTools 共享 v2 协议与面板](./US-904b-devtools-shared-protocol-panel.md)
- [US-207 Electron 连接本地 SQLite 文件](../adapter/US-207-desktop-local-database.md)
- [US-504 Electron 本地文件存储](../plugin/US-504-electron-local-file-storage.md)
