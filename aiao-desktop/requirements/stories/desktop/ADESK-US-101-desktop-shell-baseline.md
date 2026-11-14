---
id: ADESK-US-101
title: 桌面外壳与内置应用基线
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-12
updated: 2026-11-13
tags: [desktop, shell, e2e]
dependsOn: []
capabilities: []
---

# 用户故事：桌面外壳与内置应用基线

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 像在 macOS 上一样，通过菜单栏、Dock、启动台和聚焦搜索打开应用、操作窗口
**以便** 不安装任何东西，就能在浏览器里用桌面外壳和启动台里的内置应用（外壳与应用能做什么、不能做什么，以本故事的范围边界和[能力矩阵](../../capability-matrix.md)为准）。

## 范围边界

### In Scope

- 外壳：菜单栏（Apple 菜单与前台应用菜单）、Dock、桌面、窗口（打开、关闭、最小化进 Dock 与还原）、启动台、聚焦搜索、通知中心。
- 内置应用：启动台列出的内置应用都能打开；Finder 浏览虚拟文件系统，Calculator 能计算，Notes 能输入，Terminal 在页面里运行 Vivari。
- 正式构建上的 Chromium 冒烟（`apps/e2e`）：外网请求全部拦截，全程不出现页面错误。

### Out of Scope

- 保存状态：本故事验收时文件与设置只在内存中；本地库与真实磁盘由 [ADESK-US-102](ADESK-US-102-local-data-and-real-disk.md) 承接。
- 外网内容的显示效果（壁纸、地图瓦片、天气、Safari 阅读模式、网站图标、网页字体），见 [D-04](../../decisions.md#d-04外网内容可缺失)。
- 开机、锁屏与睡眠流程，窗口拖动、缩放与全屏，状态栏面板与控制中心，各应用的内部功能。
- 非 Chromium 浏览器、触屏与移动端尺寸、无障碍，以及正式部署。

## 验收标准

| #   | 前置条件                | 操作                                                 | 预期结果                                                                                                                                                                  | 状态 |
| --- | ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 正式构建，视口 1440×900 | 打开 `/?boot=0`                                      | Finder 窗口、菜单栏与默认的 Dock 入口出现（入口清单由 [ADESK-US-201](../application/ADESK-US-201-application-system.md) #4 接替）；页面没有运行时全局入口，也没有内联脚本 | ✅   |
| 2   | 桌面已打开              | 在 Finder 里双击 `Documents`                         | 窗口标题变为 `Documents`                                                                                                                                                  | ✅   |
| 3   | 从 Dock 打开 Calculator | 依次按 AC、1、2、+、3、=                             | 显示 15                                                                                                                                                                   | ✅   |
| 4   | Calculator 在前台       | 打开 Apple 菜单，再看前台应用菜单                    | Apple 菜单含 `About This Mac`；前台应用菜单显示 `Calculator`                                                                                                              | ✅   |
| 5   | Calculator 已打开       | 点黄色按钮最小化，再点 Dock 里的 Calculator          | 窗口隐藏进 Dock，再完整还原                                                                                                                                               | ✅   |
| 6   | 从 Dock 打开 Terminal   | 输入 `echo VIVARI_SMOKE` 并回车                      | 页面处于跨源隔离；命令与输出都出现在 xterm 里，命令由 Vivari 在页面里执行                                                                                                 | ✅   |
| 7   | 桌面已打开              | 点 Dock 里的启动台，再按 Esc                         | 启动台打开，随后关闭                                                                                                                                                      | ✅   |
| 8   | 桌面已打开              | 按 ⌘ 空格，输入 `calc`                               | 聚焦搜索选中 Calculator                                                                                                                                                   | ✅   |
| 9   | 桌面已打开              | 点两次菜单栏时钟                                     | 第一次打开带小组件的通知中心，第二次关闭                                                                                                                                  | ✅   |
| 10  | 桌面已打开              | 从 Dock 打开 Notes，再从启动台逐个搜索并打开内置应用 | Notes 有输入框；每个内置应用的窗口都出现（游戏与集成应用另有检查组）                                                                                                      | ✅   |
| 11  | 外网请求全部拦截        | 依次完成 #1～#10                                     | 没有页面错误；控制台错误只有资源加载失败                                                                                                                                  | ✅   |

验收证据：[smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`）。各 AC 对应输出 JSON 里的检查项：#1 `shell`，#2 `finderNavigates`，#3 `calculatorWorks`，#4 `appleMenu` 与 `appMenu`，#5 `minimized` 与 `restored`，#6 `terminalState`，#7 `launchpadOpens` 与 `launchpadCloses`，#8 `spotlightFinds`（用脚本派发的按键触发，真实键盘上的可用性见[能力矩阵](../../capability-matrix.md#快捷键)），#9 `notificationsOpen` 与 `notificationsClose`，#10 `notesWorks`、`everyAppOpens` 与 `unopened`，#11 脚本收集的页面错误与控制台错误。结论见[验收台账](../../verification-report.md#浏览器冒烟)。

## 技术笔记

桌面最初是一份单文件 HTML 的全局脚本运行时，现已全部改写为 Angular 组件与服务：页面不再挂 `WM`、`APPS` 等全局入口，也不注入脚本（AC#1 验证）。应用由 [registry.ts](../../../apps/web/src/app/apps/registry.ts) 登记，App Store、Podcasts、TV 与 Books 共用书架组件。终端要求跨源隔离（[D-05](../../decisions.md#d-05终端依赖跨源隔离)），冒烟的静态服务器与开发服务器都返回所需的响应头。`?boot=0` 或 `#noboot` 跳过开机动画，冒烟依赖这一点。

## 实现文件

- `aiao-desktop/apps/web/src/app/pages/desktop-page.ts` — 桌面页，组合外壳各层。
- `aiao-desktop/apps/web/src/app/components/` — 菜单栏、Dock、窗口层、启动台、聚焦搜索、通知中心与小组件。
- `aiao-desktop/apps/web/src/app/services/` — 窗口管理、Dock、会话（开机、锁屏、睡眠）、虚拟文件系统等页面级状态。
- `aiao-desktop/apps/web/src/app/apps/` — 内置应用与应用登记表。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 冒烟。

## 2026-11-14 回归

启动台搜索后立即按Enter，改为使用当前筛选结果，避免DOM尚未刷新时打开旧网格首项。确定性[红测试](../../evidence/2026-11-14/app-search-enter-red.json)与[绿测试](../../evidence/2026-11-14/app-search-enter-green.json)覆盖FaceTime；原有逐应用启动断言保留。

## References

- [ADESK-EPIC-002](../../epics/ADESK-EPIC-002.md)
- [D-04](../../decisions.md#d-04外网内容可缺失)、[D-05](../../decisions.md#d-05终端依赖跨源隔离)
