---
id: ADESK-US-107
title: 外壳交互验收补齐
status: Backlog
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-13
updated: 2026-11-13
tags: [desktop, shell, e2e]
dependsOn: [ADESK-US-101, ADESK-US-102]
capabilities: []
---

# 用户故事：外壳交互验收补齐

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 开机、锁屏、睡眠与窗口操作这些每天都会碰到的流程被验收守住
**以便** 这些行为改坏时在发布前就被发现，而不是只在代码里「应该能用」。

## 范围边界

### In Scope

- 开机流程（boot-screen 的动画与跳过入口）、锁屏与解锁（lock-screen）、睡眠与唤醒（session 服务）：进正式构建的冒烟。
- 菜单栏的状态栏面板（时钟、Wi-Fi 等）与控制中心：打开、切换与开关行为；开关与系统设置的持久化联动（[ADESK-US-102](ADESK-US-102-local-data-and-real-disk.md)）。
- 窗口交互：标题栏拖动、边角缩放、绿色按钮缩放与还原、多窗口的层叠与聚焦、⌘` 循环切换。集成应用 iframe 不截拖动指针已由 [ADESK-US-202](../application/ADESK-US-202-integrated-app-runtime.md) 验过，这里补内置应用与多窗口排布。
- 验收暴露的问题在此故事内修复；验收全部落在正式构建的 Chromium 冒烟里（与现有冒烟同标准：外网拦截、无页面错误）。

### Out of Scope

- 各内置应用的内部功能逐项验收（30 个应用，另立方向）。
- 触屏、窄屏与非 Chromium 浏览器（见 [ADESK-US-005](../platform/ADESK-US-005-cross-browser-smoke.md)）。
- 无障碍（读屏与纯键盘路径，见 [ADESK-US-108](ADESK-US-108-accessibility.md)）。

## 验收标准

| #   | 前置条件                   | 操作                                                       | 预期结果                                                                         | 状态 |
| --- | -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| 1   | 正式构建，视口 1440×900    | 打开桌面（不带 `boot=0`）                                  | 开机画面出现并进入桌面；`/?boot=0` 与 `#noboot` 仍然直接进桌面                   | ⬜    |
| 2   | 桌面已打开                 | 从 Apple 菜单选「锁屏」，再解锁                             | 锁屏画面出现，桌面与窗口被遮住；解锁后回到原状态                                   | ⬜    |
| 3   | 桌面已打开                 | 从 Apple 菜单选「睡眠」，再唤醒                             | 睡眠画面出现；唤醒后桌面照常，没有页面错误                                         | ⬜    |
| 4   | 桌面已打开                 | 点菜单栏时钟与 Wi-Fi 图标，再点外面                         | 状态栏面板打开且内容与系统状态一致，点外面后关闭                                   | ⬜    |
| 5   | 桌面已打开                 | 打开控制中心，切换深色外观，再刷新页面                     | 控制中心开关生效，刷新后设置仍在（与 US-102 的持久化联动）                        | ⬜    |
| 6   | 打开 Finder                | 拖动标题栏移动，拖右下角缩放，点绿色按钮两次               | 窗口跟随指针；缩放后 keepOnScreen 保证窗口不跑出屏幕；缩放切换与还原正常          | ⬜    |
| 7   | 打开三个窗口并互相重叠     | 依次点各窗口，再按 ⌘`                                      | 焦点与层叠顺序符合点击顺序；⌘` 把最底层的可见窗口提到最前                         | ⬜    |
| 8   | 外网请求全部拦截           | 依次完成第 1～7 条                                         | 没有页面错误；控制台错误只有资源加载失败                                           | ⬜    |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：冒烟 [smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`）新增 `shellInteraction` 检查组，各 AC 对应输出 JSON 里的检查项：第 1 条 boot、第 2 条 lock、第 3 条 sleep、第 4 条 statusPanels、第 5 条 controlCentre、第 6 条 dragResizeZoom、第 7 条 focusCycle、第 8 条脚本收集的页面错误与控制台错误。session 服务的状态机另补单测。

## 技术笔记

- 这些能力在 [US-101](ADESK-US-101-desktop-shell-baseline.md) 的 Out of Scope 里，实现早已存在（session.ts、boot-screen、lock-screen、status-panels、control-centre、window-frame），缺的是验收；冒烟目前依赖 `?boot=0` 跳过开机，开机流程的用例要么跑真动画路径，要么加一个缩短动画的测试参数。
- 睡眠在浏览器里是模拟状态（遮罩/熄屏动画），唤醒即恢复，不真的挂起页面。
- 状态栏面板与控制中心走 menu.ts / popover.ts 的通用浮层，验收时一并覆盖浮层的开关语义。

## 实现文件

- `aiao-desktop/apps/e2e/src/smoke.mjs` — `shellInteraction` 检查组。
- `aiao-desktop/apps/web/src/app/services/session.ts`、`components/boot-screen.ts`、`components/lock-screen.ts` — 开机/锁屏/睡眠修复。
- `aiao-desktop/apps/web/src/app/components/menubar/` — 状态栏面板与控制中心修复。
- `aiao-desktop/apps/web/src/app/components/window-frame.ts`、`services/window-manager.ts` — 拖动/缩放/聚焦修复。

## References

- [ADESK-US-101 桌面外壳与内置应用基线](ADESK-US-101-desktop-shell-baseline.md)
- [ADESK-US-102 本地数据与真实磁盘](ADESK-US-102-local-data-and-real-disk.md)
- [能力矩阵](../../capability-matrix.md)
