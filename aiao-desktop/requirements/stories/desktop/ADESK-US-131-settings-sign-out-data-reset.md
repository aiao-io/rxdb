---
id: ADESK-US-131
title: 设置里的退出与重置本地数据
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-25
updated: 2026-11-25
tags: [desktop, settings, data-reset]
dependsOn: [ADESK-US-106]
capabilities: []
---

# 用户故事：设置里的退出与重置本地数据

## 作为/我想要/以便

**作为** 在浏览器里使用桌面的用户，**我想要** 在系统设置里点击头像就能退出并抹掉这台浏览器上的全部本地数据，**以便** 把桌面交给下一个人、或从打不开的数据里恢复，而不必清掉浏览器里其他站点的数据。

## 范围边界

- 退出指「抹掉本产品数据并回到全新桌面」，与数据问题阻断界面（[US-106](ADESK-US-106-database-upgrade-path.md)）的抹除是同一套实现与清除范围：文件、设置、应用记录与之前的恢复副本永久删除；游戏、终端运行时镜像、远程应用与下载的备份保留。
- 点击侧栏头像进入设置里的 Apple Account 账户详情页（macOS 账户页样式）：大头像与姓名在上，账户内容信息居中，页尾是 Sign Out；账户页不在侧栏列表与搜索里，只从头像进入。
- 抹除是破坏性的：先确认，取消不改变任何数据；执行失败时留在账户页里说明原因，可以重试，绝不静默吞掉。
- localStorage 本身不可用（隐私模式、被站点禁用）时也要能清理：意图日志记不下来就强制删除本产品数据（此前会拒绝执行，用户被「Local storage is unavailable」卡住）；活动指针读不到时按默认位置继续启动，不因此拒绝打开桌面。多标签页协调在这类环境下退化为 Web Locks 串行。
- 不改变 Apple 菜单与 ⇧⌘Q 的「Log Out」（关窗回到锁屏），那是另一种会话行为，两者并存。

## 验收标准

| #   | 前置条件                   | 操作                                | 预期结果                                                                  | 状态 |
| --- | -------------------------- | ----------------------------------- | ------------------------------------------------------------------------- | ---- |
| 1   | 设置窗口打开               | 点击侧栏头像                        | 主区域进入 Apple Account 账户详情页：头像、姓名、账户内容信息与页尾的 Sign Out… | ✅   |
| 2   | 同上                       | 焦点在头像行上按 Enter              | 同样进入账户详情页                                                        | ✅   |
| 3   | 账户详情页                 | 点 Sign Out…，看确认文案，点 Cancel | 显示清除范围说明，取消后回到原样、数据没有变化                            | ✅   |
| 4   | 开着静音（已写入本地数据） | 头像 → Sign Out… → 确认 Sign Out    | 页面刷新回到全新桌面，静音回到默认（本地数据已被抹掉）                    | ✅   |
| 5   | localStorage 读写抛错      | 走抹除（阻断界面或设置退出）        | 本产品库文件与文件体仍被删除，删除失败照常报错可重试                      | ✅   |

## 验收证据

- AC 1～4 由 `settings-workflow` 冒烟分组的 `accountMenu`、`accountMenuKeyboard`、`signOutConfirmCancel`、`signOutErasesAndReloads` 检查项覆盖（正式构建、桌面 Chromium），运行记录见 [US-131 证据留档](ADESK-US-131-settings-sign-out-data-reset-evidence.md)。
- AC 5 由 web 单测覆盖：`desktop-erase.spec.ts` 的 `tolerantStorage` 与 `forceDesktopErase`、`desktop-data.spec.ts` 的「localStorage 不可用也能抹掉」。键盘路径经 Playwright 合成事件验证代码路径；真实键盘行为以 [US-108](ADESK-US-108-accessibility.md) 台账为准。

## 实现文件

- [账户详情页](../../../apps/web/src/app/apps/settings/panes/account-pane.ts)、[账户分区登记](../../../apps/web/src/app/apps/settings/settings-data.ts)与[设置侧栏头像入口](../../../apps/web/src/app/apps/settings/settings.ts)。
- [抹除与容错存储](../../../apps/web/src/app/data/desktop-erase.ts)（`tolerantStorage`、`forceDesktopErase`）、[DesktopData 抹除链路](../../../apps/web/src/app/data/desktop-data.ts)。
- [冒烟检查](../../../apps/e2e/src/groups/settings-workflow.mjs)。
