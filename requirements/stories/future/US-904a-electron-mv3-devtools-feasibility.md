---
id: US-904a
title: Electron 43 MV3 DevTools 可行性门禁
status: Backlog
priority: High
epic: epic-003-ui-developer-tools
created: 2026-08-15
updated: 2026-08-15
tags: [tooling, devtools, desktop, electron, mv3, feasibility]
---

<!--
INVEST 检查清单:
- [x] Independent: 只验证 Electron 43 与现有 unpacked MV3 扩展，不依赖 US-207 / US-504
- [x] Negotiable: fixture 的页面内容与启动方式可调整，必须保留真实 Electron 进程证据
- [x] Valuable: 在抽共享面板前关闭最昂贵的运行时未知量
- [x] Estimable: API 组合、成功判据和 unsupported 分支已列全
- [x] Small: 不抽面板、不设计 provider、不接 SQLite 或原生文件
- [x] Testable: supported / unsupported 都有可复现的版本、日志和 stop/go 结论
-->

# 用户故事：Electron 43 MV3 DevTools 可行性门禁

> 共享范围与安全契约见 [US-904](./US-904-electron-native-storage-devtools.md)。本故事只回答一个问题：
> 工作区锁定的 Electron 43 能否运行现有 Chrome MV3 DevTools 扩展的完整链路。

## 作为/我想要/以便

**作为** 负责桌面 DevTools 的开发者
**我想要** 在真实 Electron 43 中加载工作区构建的 unpacked MV3 扩展并验证关键 API
**以便** 在投入共享面板和 native provider 前得到可复现的 supported / unsupported 决策

## 范围边界

### In Scope

- 用当前 `rxdb-devtools-extension` 构建产物和最小 Electron 页面执行 `loadExtension`
- 验证 MV3 service worker 启动、`chrome.devtools.panels` 创建面板、`chrome.scripting` 注入、按需
  host permission 与 runtime Port 双向消息
- 固定 Electron、Chromium、扩展 manifest 与构建版本，保存逐项 supported / unsupported 结果和失败日志
- 验证开发进程退出后 extension session、service worker 与 Port 均释放
- 形成 stop/go 结论：只有全部关键项 supported 才解锁 US-904b

### Out of Scope

- 抽取 `packages/rxdb-devtools-panel/`、修改正式 wire 或新增 provider
- 接入 US-207 SQLite、US-504 原生文件或任何业务数据
- 用 Chrome 成功、mock API 或渲染进程单测替代 Electron 43 证据
- unsupported 时直接实现独立 DevTools window；该分支必须先修改 US-904 父契约再另行排期

## 验收标准

| #   | 前置条件                                      | 操作                                      | 预期结果                                                                                                      | 状态 |
| --- | --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Electron 43 与工作区扩展已构建               | 通过 `session.defaultSession.loadExtension` 加载 | 返回有效 extension，MV3 service worker 启动；失败时记录稳定复现步骤、版本和原始错误                           | ⬜   |
| 2   | 打开 fixture 页面的 DevTools                 | 扩展执行 `chrome.devtools.panels.create`  | RxDB panel 真实出现并能完成一次 panel → service worker → inspected page → panel 往返                         | ⬜   |
| 3   | fixture 初始未授予目标 origin 权限           | 由扩展请求权限并执行 `chrome.scripting`   | host permission 按需授予，脚本只注入目标页面；拒绝权限时返回可见错误，不扩大 manifest 常驻权限                | ⬜   |
| 4   | runtime Port 已建立                          | 刷新 inspected page、关闭 DevTools 和应用 | Port 断开与 service worker/session 清理可观察，不残留能接收下一次启动消息的旧连接                             | ⬜   |
| 5   | AC#1～#4 已逐项执行                           | 写入可行性记录                            | 每项都有版本、命令、结果与日志；结论只有 `supported` 或 `unsupported`，不得写“理论可行”或用 mock 补证据      | ⬜   |
| 6   | 可行性结论已冻结                             | 检查后续排期                              | 仅 `supported` 解锁 US-904b；`unsupported` 时 US-904b/904c 保持 Backlog，并先修订父契约选择新的承载模型       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- fixture 必须运行真实 Electron 主进程与 DevTools，不能用浏览器 extension E2E、JSDOM 或 API stub 代替。
- 不为通过门禁修改生产权限、关闭 `contextIsolation`、开启 `nodeIntegration` 或暴露原始 IPC。
- 可行性代码必须与正式 provider 解耦，unsupported 结论也应能删除 fixture 而不留下运行时 fallback。

## 依赖与排期

- 无 US-207 / US-504 前置依赖；本故事必须先于 US-904b、US-904c。
- `supported` 是 US-904b 的硬门禁，不是本故事关闭的必然结果；可信的 `unsupported` 证据同样可以关闭本故事。

## 实现文件

- `apps/rxdb-devtools-extension/` — 使用现有构建产物，不抽共享面板
- `apps/dev-rxdb-electron/` — 最小显式开发 fixture 与 Electron 43 加载脚本
- `apps/dev-rxdb-electron-e2e/` — 真实 DevTools panel、Port 和生命周期证据

## References

- [US-904 Electron 原生本地存储 DevTools 契约](./US-904-electron-native-storage-devtools.md)
- [US-902 DevTools 面板](./US-902-devtools-panel.md)

