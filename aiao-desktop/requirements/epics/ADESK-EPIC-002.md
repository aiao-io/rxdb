---
id: ADESK-EPIC-002
status: Done
startDate: 2026-11-11
targetDate: 2026-11-12
owner: jimmy
---

# macOS 风格桌面

## 愿景

在浏览器里还原一套 macOS 风格的桌面：外壳、窗口与内置应用都是 Angular 组件，由正式构建上的冒烟守住，没有外网也能完整打开。

## 目标

- [x] 桌面外壳与 29 个内置应用的基线行为由正式构建上的浏览器冒烟守住（[ADESK-US-101](../stories/desktop/ADESK-US-101-desktop-shell-baseline.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-101 桌面外壳与内置应用基线](../stories/desktop/ADESK-US-101-desktop-shell-baseline.md) (High)

## 非目标

- 跨刷新保留状态、正式部署与跨浏览器验收，见 [future-requirements](../future-requirements.md)，立项后另开故事。
