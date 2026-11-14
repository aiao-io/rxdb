---
id: ADESK-EPIC-002
status: In Progress
startDate: 2026-11-11
targetDate: TBD
owner: jimmy
---

# macOS 风格桌面

## 愿景

在浏览器里还原一套 macOS 风格的桌面：外壳、窗口与内置应用都是 Angular 组件，由正式构建上的冒烟守住，没有外网也能完整打开。

## 目标

- [x] 桌面外壳与启动台里的内置应用的基线行为由正式构建上的浏览器冒烟守住（[ADESK-US-101](../stories/desktop/ADESK-US-101-desktop-shell-baseline.md)）。
- [x] 系统与应用数据存在本地 SQLite，磁盘是真文件，终端看到并修改同一块磁盘（[ADESK-US-102](../stories/desktop/ADESK-US-102-local-data-and-real-disk.md)）。
- [x] 随桌面发布的单文件 3D 游戏「几猫3A大作」作为内置应用，在同源 iframe 里运行（[ADESK-US-103](../stories/desktop/ADESK-US-103-saltline-game.md)）。
- [ ] 打开过的窗口在刷新后恢复位置、大小与状态（[ADESK-US-104](../stories/desktop/ADESK-US-104-window-layout-persistence.md)）。
- [ ] 一个标签页里的改动在另一个标签页即时可见（[ADESK-US-105](../stories/desktop/ADESK-US-105-multi-tab-sync.md)）。
- [ ] 桌面升级后旧库的数据保留、新数据域补写（[ADESK-US-106](../stories/desktop/ADESK-US-106-database-upgrade-path.md)）。
- [ ] 开机、锁屏、睡眠、状态栏面板、控制中心与窗口拖动/缩放/全屏进冒烟验收（[ADESK-US-107](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md)）。
- [ ] 读屏与纯键盘路径可用，无障碍树断言进冒烟（[ADESK-US-108](../stories/desktop/ADESK-US-108-accessibility.md)）。

当前未勾选项包含已经实现、等待验收或依赖关闭的故事，具体保留项见状态总览。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-101 桌面外壳与内置应用基线](../stories/desktop/ADESK-US-101-desktop-shell-baseline.md) (High)
- [ADESK-US-102 本地数据与真实磁盘](../stories/desktop/ADESK-US-102-local-data-and-real-disk.md) (High)
- [ADESK-US-103 内置游戏「几猫3A大作」](../stories/desktop/ADESK-US-103-saltline-game.md) (Medium)
- [ADESK-US-104 窗口布局跨刷新保留](../stories/desktop/ADESK-US-104-window-layout-persistence.md) (High)
- [ADESK-US-105 多标签页实时互通](../stories/desktop/ADESK-US-105-multi-tab-sync.md) (Medium)
- [ADESK-US-106 旧库升级路径](../stories/desktop/ADESK-US-106-database-upgrade-path.md) (Medium)
- [ADESK-US-107 外壳交互验收补齐](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md) (Medium)
- [ADESK-US-108 无障碍：读屏与纯键盘路径](../stories/desktop/ADESK-US-108-accessibility.md) (Medium)

## 非目标

- 外网内容本地化（壁纸随构建分发、无网占位）：见 [future-requirements](../future-requirements.md)，其余原候选方向已立项，见 [roadmap](../roadmap.md)。
