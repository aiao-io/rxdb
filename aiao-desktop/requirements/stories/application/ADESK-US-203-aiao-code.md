---
id: ADESK-US-203
title: 接入 Aiao Code
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, orbit, aiao-vscode, online]
dependsOn: [ADESK-US-201, ADESK-US-202]
capabilities: []
---

# 用户故事：接入 Aiao Code

## 作为/我想要/以便

**作为** 在桌面里写代码的人
**我想要** 在 Aiao Desktop 里直接打开 Aiao Code（vscode.aiao.io 上线的浏览器开发工作台），新建项目、编辑、在终端里跑命令
**以便** 不离开桌面就能开发，Aiao Code 发布新版时桌面里的也跟着更新。

## 范围边界

### In Scope

- 登记为集成应用 `vscode`：显示名 Aiao Code，图标与 Aiao Code 自己的应用图标一致，入口 `https://vscode.aiao.io/`，单窗口，授予跨源隔离与剪贴板读写，就绪时限 60 秒（冷启动要下载整个工作台）。
- 用线上发布版本（[D-13](../../decisions.md#d-13aiao-code-用线上发布版本)）：桌面不打包、不固定 Aiao Code 的版本，vscode.aiao.io 发布即生效。
- Aiao Code 一侧的配合由它自己的 [US-410](../../../../apps/aiao-vscode/requirements/stories/US-410-desktop-embedding.md) 承接：启动前与桌面握手、工作台挂载后报告就绪、启动失败报告原因、托管响应头补 `Cross-Origin-Resource-Policy: cross-origin`；独立打开时行为不变。
- 线上验收脚本：本地起桌面的正式构建，对真实的 vscode.aiao.io 跑（要外网，不进 CI）；也能把 vscode.aiao.io 指到本地构建的产物，用于 Aiao Code 发布前的验证。

### Out of Scope

- 「导入文件夹（副本）」：浏览器禁止跨源 iframe 弹出文件选择器。
- 「登录 GitHub」：OAuth 弹窗被 sandbox 拦下；桌面与 vscode.aiao.io 不同站点时存储分区，登录状态也不共享。
- 与直接访问 vscode.aiao.io 共用项目：桌面部署在 aiao.io 之外（包括本地开发）时，浏览器按顶层站点分区存储，桌面里的 Aiao Code 是另一份项目数据。
- 桌面的浅色 / 深色外观与 Aiao Code 主题联动、窗口标题跟随项目名。
- Aiao Code 窗口跨刷新恢复。

## 验收标准

| #   | 前置条件                               | 操作                                                     | 预期结果                                                      | 状态 |
| --- | -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| 1   | 桌面正式构建，真实网络，全新浏览器配置 | 从 Dock 打开 Aiao Code                                   | 工作台出现并向桌面报告就绪，加载状态消失                      | ✅   |
| 2   | Aiao Code 已就绪                       | 读应用里的运行环境                                       | `crossOriginIsolated` 为 true                                 | ✅   |
| 3   | Aiao Code 已就绪                       | 新建 vanilla 项目，打开终端，执行 `echo AIAO_DESKTOP_OK` | 终端显示运行中，输出 `AIAO_DESKTOP_OK`                        | ✅   |
| 4   | 已新建项目                             | 最小化再还原                                             | 工作台没有重新加载，当前项目与终端输出还在                    | ✅   |
| 5   | 已新建项目                             | 关闭窗口，再从启动台打开                                 | 重新就绪，刚才新建的项目还在（数据在 Aiao Code 自己的来源里） | ✅   |
| 6   | Aiao Code 已就绪                       | 依次完成 #1～#5                                          | 桌面页面没有错误                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：线上验收脚本 `aiao-desktop-e2e:verify-aiao-code`（[verify-aiao-code.mjs](../../../apps/e2e/src/verify-aiao-code.mjs)），输出 JSON 的 `checks` 与 AC 一一对应：#1 `workbenchReady`，#2 `crossOriginIsolated`，#3 `terminalRuns`，#4 `restoreKeepsWorkbench`，#5 `reopenKeepsProject`，#6 `noDesktopErrors`。2026-11-13 发布前先用 `--vscode-dist` 把 vscode.aiao.io 指到带握手与 CORP 的本地产物，6 项全过；当时的线上版本没有 CORP，窗口按预期显示「vscode.aiao.io didn’t connect」。同日 Aiao Code 发布到 vscode.aiao.io（Pages 部署 `408194ed`，源提交 `4e9de996`）后对线上重跑，6 项全过：从 Dock 打开到就绪 3.3 s，终端 5.4 s 进入运行中，关闭后重开 1.4 s。登记项本身（Dock、启动台、菜单栏）由 [ADESK-US-201](ADESK-US-201-application-system.md) 的冒烟覆盖。结论见[验收台账](../../verification-report.md#应用体系与集成应用)。

## 技术笔记

- vscode.aiao.io 原来只有 COOP / COEP，文档响应没有 CORP，带 COEP 的宿主页嵌不进去（2026-11-13 实测 `ERR_BLOCKED_BY_RESPONSE`）。补上 CORP 后在 Orbit 同款 sandbox 里实测：工作台约 1.5 秒出现，`crossOriginIsolated` 为 true，Service Worker 正常接管；`window.open` 被 sandbox 拦下，`showDirectoryPicker` 报 `SecurityError`，即上面两条已知限制。
- 就绪的定义：Aiao Code 的工作台已经挂载到页面上（与它自己的 `ready` 信号同一时刻），不是 iframe 的 `load`。
- Aiao Code 的发布流程（[deploy/README](../../../../apps/aiao-vscode/deploy/README.md)）发布后要跑一次本故事的线上验收，握手或响应头被改坏时桌面会第一个发现。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/registry.ts` — Aiao Code 登记项。
- `aiao-desktop/apps/web/src/app/components/icon-sprite.html` — Aiao Code 图标。
- `aiao-desktop/apps/e2e/src/verify-aiao-code.mjs` — 线上验收脚本。
- `apps/aiao-vscode/src/main.ts`、`src/app/orbit-embedding.ts`、`public/_headers` — Aiao Code 一侧的握手、就绪与响应头（[US-410](../../../../apps/aiao-vscode/requirements/stories/US-410-desktop-embedding.md)）。

## References

- [ADESK-EPIC-003](../../epics/ADESK-EPIC-003.md)
- [D-13](../../decisions.md#d-13aiao-code-用线上发布版本)
- [Aiao Code（apps/aiao-vscode）](../../../../apps/aiao-vscode/README.md)
