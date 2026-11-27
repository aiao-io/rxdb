---
id: ADESK-US-130
title: 桌面冷启动与首次使用时加载
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-22
updated: 2026-11-22
tags: [desktop, performance, lazy-loading]
dependsOn: [ADESK-US-206]
capabilities: []
---

# 用户故事：桌面冷启动与首次使用时加载

## 作为/我想要/以便

**作为** 打开浏览器桌面的用户，**我想要** 先得到可操作的桌面，只在打开应用、菜单或面板时载入它们，**以便** 把首次访问的带宽留给眼前的窗口和小组件。

## 范围边界

- 默认 Finder、恢复的窗口、可见桌面小组件及其首次读取的数据属于当次启动所需内容。正常开机时按需显示开机与登录界面，跳过开机时直接进入桌面。
- 验收覆盖生产构建在桌面 Chromium 中的页面请求。PWA 在桌面稳定后另行预缓存，以支持断网后首次打开内置应用，见 [US-009](../platform/ADESK-US-009-pwa.md)。

## 验收标准

| #   | 前置条件                         | 操作                                                       | 预期结果                                                                                             | 状态 |
| --- | -------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | 新库、跳过开机动画、没有窗口快照 | 进入桌面，等待 Finder 和可见小组件就绪                     | 只请求桌面需要的脚本与种子，未打开的应用、终端运行时、浮层与状态面板均留到首次使用                   | ✅   |
| 2   | 桌面就绪                         | 依次打开菜单、启动台、聚焦搜索、菜单栏面板和通知中心       | 每次首次打开只请求对应界面及共享依赖，同一页面再次打开复用已下载脚本，搜索与小组件仍能读取自己的数据 | ✅   |
| 3   | 保存过屏幕亮度                   | 刷新桌面，在打开任何浮层前查看亮度，再用键盘打开和关闭面板 | 亮度自动恢复，键盘焦点进入面板，关闭后回到触发按钮                                                   | ✅   |

## 验收证据

- AC 1、2 由 `startupLoadsOnlyShellScripts`、`terminalRuntimeOnDemand`、各面板首次打开、取消加载和同页重开等请求断言覆盖。[网络记录](../../evidence/2026-11-22/lazy-loading.json)
- AC 3 由 `brightnessBeforeFirstPanel` 和 `statusPanelsOnDemand` 的焦点断言覆盖。[外壳交互记录](../../evidence/2026-11-22/shell-interaction.json)
- 生产构建比较与复现方法见[验收台账](../../verification-report.md)。

## 实现文件

- [桌面外壳](../../../apps/web/src/app/components/desktop-shell.html)与[浮层](../../../apps/web/src/app/components/overlay-layer.html)按可见状态装载。
- [应用登记表](../../../apps/web/src/app/apps/registry.ts)与[菜单栏](../../../apps/web/src/app/components/menubar.ts)提供首次打开的入口。
