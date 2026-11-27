---
id: US-411
title: 在 Aiao Desktop 的透明窗口里自绘标题栏
status: In Review
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-13
updated: 2026-11-13
tags: [aiao-vscode, orbit, window, tauri]
---

# 在 Aiao Desktop 的透明窗口里自绘标题栏

作为在 Aiao Desktop 里写代码的人，我要 Aiao Code 的标题栏就是窗口的标题栏：左侧是 macOS 的红黄绿，点了就关闭、最小化、缩放，空白处能拖动窗口，外面不再套一层桌面的标题栏。
桌面方的需求是 [ADESK-US-204](../../../../aiao-desktop/requirements/stories/application/ADESK-US-204-transparent-window.md)（决策 [D-14](../../../../aiao-desktop/requirements/decisions.md#d-14透明窗口与窗口接口参考-tauri)），本故事只管 Aiao Code 这一侧，做法参考 Tauri 应用区分网页与桌面窗口。

## 范围

- 环境判断：被桌面嵌入且桌面给的窗口外观是 `transparent` 时，用 `@aiao/orbit/window` 的 `getCurrentWindow()`（对应 Tauri 的同名函数）拿到当前窗口；直接访问、被普通 iframe 嵌入、PWA 的窗口控件覆盖层模式都不变。
- 标题栏：`.wb-title` 左侧装上红黄绿，分别调用 `close()`、`minimize()`、`toggleMaximize()`；窗口不在前台时置灰，悬停显示符号；显示模式记为 `desktop-window`。
- 拖动区：`.wb-title` 标上 `data-orbit-drag-region`（对应 `data-tauri-drag-region`），其中的按钮与输入框自动挖空；挂载后开始跟踪，组件销毁时清空。
- 启动顺序：工作台挂载、开始上报拖动区、`setDecorations(false)` 之后才报告就绪，桌面在就绪时收起自己的标题栏。

不在范围：Windows / Linux 样式的窗口按钮（桌面目前只有 macOS 外观）、窗口标题跟随项目名。

## 验收

| 行为                                                                      | 证据                                                                                          | 状态 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| 透明窗口：标题栏左侧红黄绿调用宿主的关闭 / 最小化 / 缩放，失去前台时置灰  | `host-window.spec.ts`                                                                         | ✅   |
| 标题栏是拖动区，按钮与输入框挖空；卸载时移除按钮与拖动区                  | `host-window.spec.ts`；桌面验收 `verify-aiao-code` 的 `titleBarDragsWindow`（本地产物与线上） | ✅   |
| 先隐藏桌面标题栏、上报拖动区，再报告就绪；标准窗口或没有宿主窗口时不调用  | `app.component.spec.ts`                                                                       | ✅   |
| 线上：桌面里的 Aiao Code 是透明窗口，拖动、缩放、最小化与关闭都走自绘按钮 | `aiao-desktop-e2e:verify-aiao-code` 对本地产物与线上（部署 `22477575`）各 9 项全过            | ✅   |
| 直接访问与原有工作台行为不回归                                            | `aiao-vscode:test`；发布前的 `workbench.config.ts` e2e 10 个用例通过                          | ✅   |

## 实现文件

- `apps/aiao-vscode/src/workbench/host-window.ts` — 红黄绿、拖动区与状态跟随。
- `apps/aiao-vscode/src/workbench/mount.ts`、`workbench-style.ts`、`display-mode.ts` — 挂载选项 `hostWindow`、样式与显示模式。
- `apps/aiao-vscode/src/app/app.component.ts` — 取当前窗口、开始跟踪拖动区、隐藏桌面标题栏后报告就绪。
