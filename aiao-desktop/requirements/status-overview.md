# Aiao Desktop 状态总览

2026-11-23 更新。状态真相源是故事 YAML；AC验收、依赖关闭与生产发布分别记录。当前48条Done、0条In Progress、1条In Review、4条Backlog。浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)已接受两项回溯基线例外并批准正式发布。本次正式发布及95个公开文件的后续对账已完成；物理键盘已逐项记录并关闭 US-107，当前仅剩 US-108 的 VoiceOver AC，按用户 2026-11-15 指示延期至后续验收。

2026-11-16 新增 PWA 安装、离线桌面与版本更新的本地正式构建验收已完成（US-009），[证据](evidence/2026-11-16/pwa.md)与既有线上发布分开记录；本次没有生产发布。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 48   |
| 🚧 In Progress | 0    |
| 👀 In Review   | 1    |
| 📝 Backlog     | 4    |
| 🚫 Blocked     | 0    |
| **合计**       | 53   |

## 自动完成计划

A01～A05 已完成并归档，包括 US-112、US-113 与 US-208；A06 已完成 US-114～US-127 的本地自动验收，剩余应用主要流程和 A07～A09 继续推进，见[计划](plans/2026-11-17-autonomous-completion.md)。

US-119 Calendar、US-120 Contacts、US-122 Reminders、US-123 Notes 文件夹、US-124 Freeform、US-125 Stocks、US-126 Font Book 和 US-127 Settings 已完成，A06 台账仍保留媒体、书架、其他搜索筛选和主要操作等未核查应用流程。

## 进行中（0 条）

## 待评审（1 条）

- [ADESK-US-108 无障碍：读屏与纯键盘路径](stories/desktop/ADESK-US-108-accessibility.md)：VoiceOver V01～V14 实际播报验收按用户要求延期，AC#6 保持未验收。

## 待开发（4 条）

- [ADESK-US-010 Tauri 安装版与首次启动](stories/platform/ADESK-US-010-tauri-install-and-launch.md)：先建立 macOS / Windows 的独立安装和启动入口。
- [ADESK-US-011 Tauri 本地工作区与显式迁移](stories/platform/ADESK-US-011-tauri-local-workspace-migration.md)：在安装版中保存本地工作区，并通过显式备份迁移已有成果。
- [ADESK-US-012 Tauri 升级、卸载与故障恢复](stories/platform/ADESK-US-012-tauri-update-and-uninstall.md)：定义升级失败、卸载保留和重新安装恢复路径。
- [ADESK-US-210 远程应用仿真与调度](stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)：在本地桌面操作授权的远程 Claude 工具、Finder 和网络应用，接收远程结果并维护任务调度与权限边界。

## 按 Epic 索引

### ADESK-EPIC-001 产品工程结构

- ✅ [ADESK-US-001 产品根目录与多应用拆分](stories/platform/ADESK-US-001-product-root.md)
- ✅ [ADESK-US-002 本地开发入口与开发导航](stories/platform/ADESK-US-002-local-dev-dashboard.md)
- ✅ [ADESK-US-003 一键发布到 Cloudflare Pages](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)
- ✅ [ADESK-US-004 绑定自定义域名与同站托管](stories/platform/ADESK-US-004-custom-domain.md)
- ✅ [ADESK-US-005 Chrome 与窄屏验收](stories/platform/ADESK-US-005-cross-browser-smoke.md)
- ✅ [ADESK-US-006 web 单测覆盖率门槛](stories/platform/ADESK-US-006-web-test-coverage-gate.md)
- ✅ [ADESK-US-007 外网内容来源与隐私说明](stories/platform/ADESK-US-007-external-content-disclosure.md)
- ✅ [ADESK-US-008 冒烟套件化](stories/platform/ADESK-US-008-smoke-suite.md)

- ✅ [ADESK-US-009 PWA 安装与离线桌面](stories/platform/ADESK-US-009-pwa.md)

### ADESK-EPIC-002 macOS 风格桌面

- ✅ [ADESK-US-101 桌面外壳与内置应用基线](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)
- ✅ [ADESK-US-102 本地数据与真实磁盘](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)
- ✅ [ADESK-US-103 内置游戏「几猫3A大作」](stories/desktop/ADESK-US-103-saltline-game.md)
- ✅ [ADESK-US-104 窗口布局跨刷新保留](stories/desktop/ADESK-US-104-window-layout-persistence.md)
- ✅ [ADESK-US-105 多标签页实时互通](stories/desktop/ADESK-US-105-multi-tab-sync.md)
- ✅ [ADESK-US-106 旧库升级路径](stories/desktop/ADESK-US-106-database-upgrade-path.md)
- ✅ [ADESK-US-107 外壳交互验收补齐](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)
- 👀 [ADESK-US-108 无障碍：读屏与纯键盘路径](stories/desktop/ADESK-US-108-accessibility.md)

- ✅ [ADESK-US-109 文档保存、冲突与未保存内容保护](stories/desktop/ADESK-US-109-document-workflow.md)

- ✅ [ADESK-US-110 Finder 文件管理与废纸篓恢复](stories/desktop/ADESK-US-110-file-management.md)
- ✅ [ADESK-US-111 完整备份恢复与存储健康](stories/desktop/ADESK-US-111-backup-and-storage-health.md)

- ✅ [ADESK-US-112 应用运行状态与隐藏资源管理](stories/desktop/ADESK-US-112-runtime-activity.md)

- ✅ [ADESK-US-113 本地壁纸与天气地图的真实网络状态](stories/desktop/ADESK-US-113-offline-resources.md)

- ✅ [ADESK-US-114 内置内容复制与打印](stories/desktop/ADESK-US-114-content-actions.md)

- ✅ [ADESK-US-115 提醒事项草稿与写入失败保护](stories/desktop/ADESK-US-115-reminder-drafts.md)

- ✅ [ADESK-US-116 备忘录保存与编辑内容保护](stories/desktop/ADESK-US-116-note-drafts.md)

- ✅ [ADESK-US-117 本地会话草稿保护与通讯范围说明](stories/desktop/ADESK-US-117-local-messages.md)

- ✅ [ADESK-US-118 本地邮件草稿保存与失败保护](stories/desktop/ADESK-US-118-local-mail-drafts.md)
- ✅ [ADESK-US-119 日历事件草稿与失败保护](stories/desktop/ADESK-US-119-calendar-drafts.md)
- ✅ [ADESK-US-120 联系人搜索与本地编辑流程](stories/desktop/ADESK-US-120-contacts-workflow.md)
- ✅ [ADESK-US-121 备忘录置顶与取消置顶](stories/desktop/ADESK-US-121-notes-pin.md)
- ✅ [ADESK-US-122 提醒事项列表筛选与动态统计](stories/desktop/ADESK-US-122-reminder-filters.md)
- ✅ [ADESK-US-123 备忘录新建文件夹](stories/desktop/ADESK-US-123-notes-folders.md)
- ✅ [ADESK-US-124 Freeform 笔迹保存与失败保护](stories/desktop/ADESK-US-124-freeform-workflow.md)
- ✅ [ADESK-US-125 Stocks 本地搜索与演示数据声明](stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md)
- ✅ [ADESK-US-126 Font Book 字体族搜索](stories/desktop/ADESK-US-126-fontbook-search.md)
- ✅ [ADESK-US-127 Settings 分区搜索](stories/desktop/ADESK-US-127-settings-search.md)
- ✅ [ADESK-US-128 浏览器关闭后恢复工作区](stories/desktop/ADESK-US-128-browser-session-restore.md)
- ✅ [ADESK-US-129 Finder 仿真文件操作、虚拟列表与本地邮件分享](stories/desktop/ADESK-US-129-finder-parity-and-mail.md)
- ✅ [ADESK-US-130 桌面冷启动与首次使用时加载](stories/desktop/ADESK-US-130-desktop-on-demand.md)

### ADESK-EPIC-003 应用体系与集成应用

- ✅ [ADESK-US-201 应用体系与统一登记表](stories/application/ADESK-US-201-application-system.md)
- ✅ [ADESK-US-202 集成应用的运行宿主](stories/application/ADESK-US-202-integrated-app-runtime.md)
- ✅ [ADESK-US-203 接入 Aiao Code](stories/application/ADESK-US-203-aiao-code.md)
- ✅ [ADESK-US-204 透明窗口与窗口接口](stories/application/ADESK-US-204-transparent-window.md)
- ✅ [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](stories/application/ADESK-US-205-application-management.md)
- ✅ [ADESK-US-206 应用懒加载与统一系统能力](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)

- ✅ [ADESK-US-207 运营批准应用目录与版本管理](stories/application/ADESK-US-207-approved-app-catalog.md)

- ✅ [ADESK-US-208 Aiao Code 文件复制与嵌入边界](stories/application/ADESK-US-208-aiao-code-file-copy.md)

### ADESK-EPIC-004 GitHub 开发工作台

- ✅ [ADESK-US-209 GitHub 应用与 OPFS Git 工作区](stories/application/ADESK-US-209-github-opfs-workbench.md)

- ✅ [ADESK-US-211 终端、GitHub Desktop 与 Aiao Code 共用仓库](stories/application/ADESK-US-211-git-terminal-workspace.md)

### ADESK-EPIC-005 原生桌面版与本地运行时

- ⬜ [ADESK-US-010 Tauri 安装版与首次启动](stories/platform/ADESK-US-010-tauri-install-and-launch.md)
- ⬜ [ADESK-US-011 Tauri 本地工作区与显式迁移](stories/platform/ADESK-US-011-tauri-local-workspace-migration.md)
- ⬜ [ADESK-US-012 Tauri 升级、卸载与故障恢复](stories/platform/ADESK-US-012-tauri-update-and-uninstall.md)

### ADESK-EPIC-006 远程应用仿真与调度

- ⬜ [ADESK-US-210 远程应用仿真与调度](stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)
