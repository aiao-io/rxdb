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
- [x] 系统与应用数据存在本地 SQLite，磁盘是真文件，终端看到并修改同一块磁盘，包管理器、Python、TypeScript、Ruff 与 SQLite 资源随构建提供（[ADESK-US-102](../stories/desktop/ADESK-US-102-local-data-and-real-disk.md)）。
- [x] 随桌面发布的单文件 3D 游戏「几猫3A大作」作为内置应用，在同源 iframe 里运行（[ADESK-US-103](../stories/desktop/ADESK-US-103-saltline-game.md)）。
- [x] 打开过的窗口在刷新后恢复位置、大小与状态（[ADESK-US-104](../stories/desktop/ADESK-US-104-window-layout-persistence.md)）。
- [x] 一个标签页里的改动在另一个标签页即时可见（[ADESK-US-105](../stories/desktop/ADESK-US-105-multi-tab-sync.md)）。
- [x] 桌面升级后旧库的数据保留、新数据域补写（[ADESK-US-106](../stories/desktop/ADESK-US-106-database-upgrade-path.md)）。
- [x] 开机、锁屏、睡眠、状态栏面板、控制中心与窗口拖动/缩放/全屏进冒烟验收（[ADESK-US-107](../stories/desktop/ADESK-US-107-shell-interaction-coverage.md)）。
- [ ] 读屏与纯键盘路径可用，无障碍树断言进冒烟（[ADESK-US-108](../stories/desktop/ADESK-US-108-accessibility.md)）。

- [x] 真实运行状态与受控游戏隐藏暂停（US-112），本地壁纸与天气地图失败恢复（US-113）完成本地正式构建自动验收。
- [x] Calendar 本地事件编辑、失败保护、并发冲突与副本恢复完成本地正式构建自动验收（[ADESK-US-119](../stories/desktop/ADESK-US-119-calendar-drafts.md)）。
- [x] Contacts 搜索、联系人创建/编辑/删除、失败保留和冲突保护完成本地正式构建自动验收（[ADESK-US-120](../stories/desktop/ADESK-US-120-contacts-workflow.md)）。
- [x] Reminders 列表筛选、动态统计和 Flag/Unflag 完成本地正式构建自动验收（[ADESK-US-122](../stories/desktop/ADESK-US-122-reminder-filters.md)）。
- [x] Notes 用户文件夹、目录持久化和自定义目录中新建笔记完成本地正式构建自动验收（[ADESK-US-123](../stories/desktop/ADESK-US-123-notes-folders.md)）。
- [x] Freeform 笔迹持久化、失败保留、重试与清空完成本地正式构建自动验收（[ADESK-US-124](../stories/desktop/ADESK-US-124-freeform-workflow.md)）。
- [x] Stocks 本地代码/公司名搜索、空结果、详情联动和演示数据声明完成本地正式构建自动验收（[ADESK-US-125](../stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md)）。
- [x] Font Book 字体族搜索、空结果、清空恢复和详情联动完成本地正式构建自动验收（[ADESK-US-126](../stories/desktop/ADESK-US-126-fontbook-search.md)）。
- [x] Settings 分区搜索、空结果、清空恢复和面板联动完成本地正式构建自动验收（[ADESK-US-127](../stories/desktop/ADESK-US-127-settings-search.md)）。
- [x] Finder 文件/文件夹拖动操作、虚拟列表、分栏列宽调整和 Finder Share 本地草稿完成本地正式构建自动验收（[ADESK-US-129](../stories/desktop/ADESK-US-129-finder-parity-and-mail.md)）。
- [ ] 浏览器关闭后再次进入时恢复最近活跃工作区的窗口应用，并处理标签页竞争与失败恢复（[ADESK-US-128](../stories/desktop/ADESK-US-128-browser-session-restore.md)）。

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

- [ADESK-US-109 文档保存、冲突与未保存内容保护](../stories/desktop/ADESK-US-109-document-workflow.md) (High)
- [ADESK-US-110 Finder 文件管理与废纸篓恢复](../stories/desktop/ADESK-US-110-file-management.md) (High)
- [ADESK-US-111 完整备份恢复与存储健康](../stories/desktop/ADESK-US-111-backup-and-storage-health.md) (High)

- [ADESK-US-112 应用运行状态与隐藏资源管理](../stories/desktop/ADESK-US-112-runtime-activity.md) (High)

- [ADESK-US-113 本地壁纸与天气地图的真实网络状态](../stories/desktop/ADESK-US-113-offline-resources.md) (High)

- [ADESK-US-114 内置内容复制与打印](../stories/desktop/ADESK-US-114-content-actions.md) (High)

- [ADESK-US-115 提醒事项草稿与写入失败保护](../stories/desktop/ADESK-US-115-reminder-drafts.md) (High)

- [ADESK-US-116 备忘录保存与编辑内容保护](../stories/desktop/ADESK-US-116-note-drafts.md) (High)

- [ADESK-US-117 本地会话草稿保护与通讯范围说明](../stories/desktop/ADESK-US-117-local-messages.md) (High)

- [ADESK-US-118 本地邮件草稿保存与失败保护](../stories/desktop/ADESK-US-118-local-mail-drafts.md) (High)

- [ADESK-US-119 日历事件草稿与失败保护](../stories/desktop/ADESK-US-119-calendar-drafts.md) (High)

- [ADESK-US-120 联系人搜索与本地编辑流程](../stories/desktop/ADESK-US-120-contacts-workflow.md) (Medium)
- [ADESK-US-121 备忘录置顶与取消置顶](../stories/desktop/ADESK-US-121-notes-pin.md) (Medium)
- [ADESK-US-122 提醒事项列表筛选与动态统计](../stories/desktop/ADESK-US-122-reminder-filters.md) (Medium)
- [ADESK-US-123 备忘录新建文件夹](../stories/desktop/ADESK-US-123-notes-folders.md) (Medium)
- [ADESK-US-124 Freeform 笔迹保存与失败保护](../stories/desktop/ADESK-US-124-freeform-workflow.md) (Medium)
- [ADESK-US-125 Stocks 本地搜索与演示数据声明](../stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md) (Medium)
- [ADESK-US-126 Font Book 字体族搜索](../stories/desktop/ADESK-US-126-fontbook-search.md) (Medium)
- [ADESK-US-127 Settings 分区搜索](../stories/desktop/ADESK-US-127-settings-search.md) (Medium)
- [ADESK-US-128 浏览器关闭后恢复工作区](../stories/desktop/ADESK-US-128-browser-session-restore.md) (High)
- [ADESK-US-129 Finder 仿真文件操作、虚拟列表与本地邮件分享](../stories/desktop/ADESK-US-129-finder-parity-and-mail.md) (High)

## 非目标

- 离线世界地图、离线新天气及远程第三方应用的完整离线运行，仍见 [future-requirements](../future-requirements.md)。壁纸本地化及天气地图的失败恢复已进入 US-113。
