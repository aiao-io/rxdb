---
id: ADESK-US-108
title: 无障碍：读屏与纯键盘路径
status: Backlog
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-13
updated: 2026-11-13
tags: [desktop, a11y, e2e]
dependsOn: [ADESK-US-101]
capabilities: []
---

# 用户故事：无障碍：读屏与纯键盘路径

## 作为/我想要/以便

**作为** 依赖读屏或只用键盘使用 Aiao Desktop 的人
**我想要** 桌面的核心流程能读、能用键盘完整操作
**以便** 不依赖鼠标或屏幕也能用 Finder、Dock 与窗口操作。

## 范围边界

### In Scope

- 纯键盘路径：Tab 焦点顺序、菜单栏/Dock/启动台/聚焦搜索的键盘操作、窗口打开/最小化/关闭的快捷键、Finder 的键盘导航。
- 读屏（无障碍树）：窗口标题、Dock 图标、菜单项与 Finder 条目的可读名称与角色；焦点切换、窗口开关等动态变化正确更新。
- 无障碍树断言（role/name）进 `aiao-desktop-e2e:e2e` 冒烟；读屏实测在本机（macOS VoiceOver 或等价工具）跑关键路径，作为补充证据写进验收台账。
- 验收暴露的可达性问题在此故事内修复。

### Out of Scope

- WCAG 全量合规与视觉对比度审计（axe 扫描可小步引入，不承诺全量）。
- 每个内置应用的逐项无障碍（各应用内部功能属另立方向）。
- 触屏、窄屏与非 Chromium 浏览器（见 [ADESK-US-005](../platform/ADESK-US-005-cross-browser-smoke.md)）。

## 验收标准

| #   | 前置条件     | 操作                                                    | 预期结果                                                                               | 状态 |
| --- | ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| 1   | 正式构建     | 只按 Tab 从菜单栏走到 Dock、启动台与聚焦搜索            | 焦点按可见顺序移动，不卡死、不落到不可见元素；Enter/Space 能触发对应动作               | ⬜   |
| 2   | 桌面已打开   | 纯键盘打开 Finder、打开「前往」菜单、切换目录、关闭窗口 | 完整流程只用键盘完成                                                                   | ⬜   |
| 3   | 打开多个窗口 | 用键盘切换窗口与最小化/还原                             | 焦点与窗口状态同步变化，菜单栏显示前台应用                                             | ⬜   |
| 4   | 无障碍树可读 | 读 Finder 窗口标题、Dock 图标、菜单项与启动台条目       | 每项有可读名称与正确角色；窗口开关时树正确更新                                         | ⬜   |
| 5   | 冒烟运行     | 无障碍树断言接入 `aiao-desktop-e2e:e2e`                 | 检查项全过；外网拦截下没有页面错误                                                     | ⬜   |
| 6   | 本机 macOS   | 用 VoiceOver（或等价读屏）跑一遍 AC#1～#3 的每条路径    | 每一步都播报焦点元素的名称与角色，没有播报为空或只报「组」的步骤；逐条结论写入验收台账 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1～5 条由冒烟的无障碍树断言与键盘驱动用例覆盖（`aiao-desktop-e2e:e2e` 新增 `a11y` 检查组）；第 6 条是只在本机跑的读屏实测，不进 CI，结论记录在验收台账。

## 技术笔记

- 外壳组件多为自绘（窗口框架、Dock、菜单、浮层），需要补 role/aria 与焦点管理；自定义浮层（popover/overlay）的焦点陷阱与恢复要自建。
- 外壳模板里现有的 `tabindex="-1"`（让可点击的非 button 元素满足 lint 的交互规则、又不让鼠标点击出现焦点环）不在 Tab 顺序里，与 AC#1 直接冲突。要改成可聚焦（`tabindex="0"` 或直接用 `button`），焦点环用 `:focus-visible` 只在键盘操作时显示，并把这条约定写进 [AGENTS.md](../../../AGENTS.md)，否则新代码会再写回去。
- 窗口层叠是无障碍的关键点：后台窗口对读屏隐藏（aria-hidden 或等价手段），只暴露前台窗口的内容。
- Playwright 的无障碍树断言可以进 CI；VoiceOver 实测只能在本机 macOS 上跑，作为人工证据。

## 实现文件

- `aiao-desktop/apps/web/src/app/components/` — 窗口框架、Dock、菜单栏、浮层的 role/aria 与焦点管理。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — `a11y` 检查组。
- `aiao-desktop/requirements/verification-report.md` — 读屏实测结论。

## References

- [ADESK-US-101 桌面外壳与内置应用基线](ADESK-US-101-desktop-shell-baseline.md)
- [能力矩阵](../../capability-matrix.md)
- [验收台账](../../verification-report.md)
