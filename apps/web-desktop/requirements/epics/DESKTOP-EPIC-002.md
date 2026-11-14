---
id: DESKTOP-EPIC-002
status: In Progress
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 窗口与多任务

## 愿景

使应用窗口可定位、可恢复、可完全由键盘操作。

## 目标

- [ ] 明确当前操作对象，避免输入落到错误应用（[DESKTOP-US-101](../stories/window/DESKTOP-US-101-window-focus.md)）。
- [ ] 安排并排工作且始终找得到窗口（[DESKTOP-US-102](../stories/window/DESKTOP-US-102-move-resize.md)）。
- [ ] 在浏览器工作区内高效分配屏幕空间（[DESKTOP-US-103](../stories/window/DESKTOP-US-103-window-states.md)）。
- [ ] 避免误操作造成数据丢失（[DESKTOP-US-104](../stories/window/DESKTOP-US-104-close-quit-dirty.md)）。
- [ ] 完成启动、切换、移动和关闭的主要任务（[DESKTOP-US-105](../stories/window/DESKTOP-US-105-keyboard-navigation.md)）。
- [ ] 快速找回被遮挡或最小化的工作（[DESKTOP-US-106](../stories/window/DESKTOP-US-106-window-overview.md)）。
- [ ] 把不同工作主题分开而不重复启动应用（[DESKTOP-US-107](../stories/window/DESKTOP-US-107-virtual-workspaces.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-101 窗口创建、层级与焦点](../stories/window/DESKTOP-US-101-window-focus.md)（High，M1）
- [DESKTOP-US-102 窗口移动、缩放与可见边界](../stories/window/DESKTOP-US-102-move-resize.md)（High，M1）
- [DESKTOP-US-103 最小化、最大化、贴靠与全屏](../stories/window/DESKTOP-US-103-window-states.md)（High，M1）
- [DESKTOP-US-104 关闭、退出与未保存内容保护](../stories/window/DESKTOP-US-104-close-quit-dirty.md)（High，M1）
- [DESKTOP-US-105 键盘操作与快捷命令](../stories/window/DESKTOP-US-105-keyboard-navigation.md)（High，M1）
- [DESKTOP-US-106 窗口概览与快速切换](../stories/window/DESKTOP-US-106-window-overview.md)（Medium，M2）
- [DESKTOP-US-107 桌面内的虚拟工作区](../stories/window/DESKTOP-US-107-virtual-workspaces.md)（Medium，M2）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
