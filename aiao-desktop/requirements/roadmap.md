# Aiao Desktop 路线图

2026-11-14：本轮覆盖22个已立项故事。状态只见[状态总览](status-overview.md)，原始结果见[验收台账](verification-report.md)与[证据索引](evidence/2026-11-14/README.md)。未立项方向留在[后续方向](future-requirements.md)。

## 自动完成增量（2026-11-17）

按[自动完成计划](plans/2026-11-17-autonomous-completion.md)推进全部可自动完成的缺口。先实施 [ADESK-US-109 文档保存与关闭保护](stories/desktop/ADESK-US-109-document-workflow.md)，接续 [ADESK-US-110 文件管理](stories/desktop/ADESK-US-110-file-management.md)，再推进 [ADESK-US-111 数据保障](stories/desktop/ADESK-US-111-backup-and-storage-health.md) 与 [ADESK-US-207 批准目录及版本生命周期](stories/application/ADESK-US-207-approved-app-catalog.md)，再实施 [ADESK-US-112 运行状态与隐藏资源管理](stories/desktop/ADESK-US-112-runtime-activity.md)和 [ADESK-US-113 离线资源与真实网络状态](stories/desktop/ADESK-US-113-offline-resources.md)，最后汇总两个产品的自动验收。人工读屏和用户研究保留原证据要求。

2026-11-18 进度：A01～A05 已完成本地自动验收，包括 US-112、US-113 与 US-208；A06 已完成 US-114～US-127 的本地自动验收，媒体、书架等应用流程及 React 自动验收仍继续，未作本轮生产发布。

## 本次收尾

1. 按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受US-008 #10与US-206 #7的一次历史流程例外。固定历史提交、数值门槛、回溯测量时间与首次拆分失败样本保留。
2. 按依赖顺序关闭US-008、US-106、US-205、US-206，再关闭US-104、US-105与US-005。各故事AC与硬依赖均须满足。
3. 执行已授权的正式发布，核对独有部署地址的全部文件、两个生产入口、双域名用户数据隔离及真实线上Aiao Code；取得本次结果后关闭[ADESK-US-004 自定义域名](stories/platform/ADESK-US-004-custom-domain.md)。
4. [US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)已按真实物理键盘记录关闭；[US-108](stories/desktop/ADESK-US-108-accessibility.md)仍需VoiceOver V01～V14实际播报。

浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；其他浏览器记录保留为历史或可选诊断。数据库升级后不能回滚到B0（6859fe56）之前缺少降级保护的旧生产版本。

## PWA 增量（2026-11-16）

[ADESK-US-009 PWA 安装与离线桌面](stories/platform/ADESK-US-009-pwa.md)：生产构建接入安装清单与 Service Worker，验收桌面预缓存、离线重开、本地数据和版本切换。范围限定为本地桌面与已缓存资源；远程集成应用、外网内容和未下载的终端资源不属于完整离线承诺，生产发布单独安排。

## 原生桌面版立项（2026-11-22）

新增 [ADESK-EPIC-005 原生桌面版与本地运行时](epics/ADESK-EPIC-005.md)，首版目标是 macOS 与 Windows 的 Tauri 安装版。范围按安装启动、工作区迁移、升级卸载三个故事拆开，先完成用户可见边界和真实设备验收口径，再决定实现排期。

- [ADESK-US-010 Tauri 安装版与首次启动](stories/platform/ADESK-US-010-tauri-install-and-launch.md) 负责安装包、独立启动、离线核心外壳和最小权限。
- [ADESK-US-011 Tauri 本地工作区与显式迁移](stories/platform/ADESK-US-011-tauri-local-workspace-migration.md) 负责应用数据目录、备份迁移、原子恢复和浏览器工作区隔离。
- [ADESK-US-012 Tauri 升级、卸载与故障恢复](stories/platform/ADESK-US-012-tauri-update-and-uninstall.md) 负责手动升级、迁移失败、卸载保留和重装恢复。

浏览器版与 PWA 继续按现有故事验收。Tauri 真实设备安装、数据目录和生命周期证据不能由浏览器冒烟替代。

## 浏览器会话连续性（2026-11-21）

[ADESK-US-128 浏览器关闭后恢复工作区](stories/desktop/ADESK-US-128-browser-session-restore.md) 已完成。持久浏览器上下文已验证最近活跃标签页、恢复权竞争、持久快照、显式关闭窗口、损坏快照和单窗口失败恢复。

## Finder 仿真与本地邮件分享（2026-11-20）

[ADESK-US-129 Finder 仿真文件操作、虚拟列表与本地邮件分享](stories/desktop/ADESK-US-129-finder-parity-and-mail.md)已完成本地正式构建验收。文件和文件夹支持拖动移动、Option/Alt 拖动复制、剪切粘贴、多选、列表和分栏虚拟滚动、列宽调整；Finder Share 复用本地 Mail 草稿能力，真实远程邮件收发仍未接入。

应用按需运行（US-206）之后，验证桌面冷启动、浮层首次打开与同页重开。见[ADESK-US-130 桌面冷启动与首次使用时加载](stories/desktop/ADESK-US-130-desktop-on-demand.md)。

## 文件简介与打开方式（2026-11-24）

[ADESK-US-212 文件简介与打开方式](stories/desktop/ADESK-US-212-file-info-and-open-with.md) 已立项：右键与 ⌘I 的「显示简介」面板、扩展名级默认打开方式（Change All 与 Always Open With）、Safari 打开本地 html（沙盒框）与 Preview 按页渲染 PDF（pdf.js）。决策见 D-28。

## GitHub 开发工作台（2026-11-21）

[ADESK-US-209 GitHub 应用与 OPFS Git 工作区](stories/application/ADESK-US-209-github-opfs-workbench.md) 已完成范围评审和阶段 A～C 验收。实现包括 GitHub Desktop 形态入口、独立 OPFS Git 工作区、Git Worker、OAuth / PAT、GitHub API 远端操作、冲突处理和正式 Chromium 冒烟。本故事不与 Finder 虚拟磁盘自动同步，也不承诺跨设备恢复。证据见 [US-209-evidence.md](stories/application/ADESK-US-209-evidence.md)。

## 远程应用仿真与调度

[ADESK-US-210 远程应用仿真与调度](stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md) 已进入 Backlog，归入 [ADESK-EPIC-006](epics/ADESK-EPIC-006.md)。范围先覆盖远程目标和会话、操作与结果回传、Claude 工具、远程 Finder、远程网络应用、任务调度、断线恢复和权限审计。该故事是产品未来扩大使用范围的立项入口，当前浏览器版和 PWA 不提供远程执行能力。

## 扩大使用范围的条件

扩大使用范围前，仍需完整文件工作流、备份恢复、保存失败与配额边界、明确的浏览器支持矩阵、升级与回滚边界。TextEdit 文档工作流、Finder 文件管理、完整备份和存储故障恢复已由 ADESK-US-109～111 完成；后续应用目录和运行能力按自动完成计划逐项立项和验收，原方向见[后续方向](future-requirements.md)。

新方向先补具体场景、验收范围和对冒烟的影响，再立故事。改变产品边界时同步更新[决策](decisions.md)。

[ADESK-US-208 Aiao Code 文件复制与嵌入边界](stories/application/ADESK-US-208-aiao-code-file-copy.md) 已完成本地正式构建自动验收：单文件和项目归档显式复制、嵌入目录输入与登录限制；两个存储域独立，单次 512 KiB，真实账号与线上发布单列。

A06 已建立[逐应用台账](plans/2026-11-17-builtin-workflows.md)，[US-114 内置内容复制与打印](stories/desktop/ADESK-US-114-content-actions.md)已完成，继续处理草稿保护及其余主要任务。

[US-115 提醒事项草稿保护](stories/desktop/ADESK-US-115-reminder-drafts.md)已完成：失败保留输入、稳定 ID 重试、关闭等待及五组关联回归通过；继续 Notes 等其余写入流程。

[US-116 备忘录编辑保护](stories/desktop/ADESK-US-116-note-drafts.md)已完成：保存失败、导航等待、并发冲突、副本恢复与六组正式构建回归通过。

[US-117 本地会话与草稿保护](stories/desktop/ADESK-US-117-local-messages.md)已完成自动验收；真实远程通讯仍未接入。

[US-118 本地邮件草稿](stories/desktop/ADESK-US-118-local-mail-drafts.md)已完成自动验收，真实邮件收发仍未接入。

[US-119 日历事件草稿](stories/desktop/ADESK-US-119-calendar-drafts.md)已完成自动验收，严格日期/时间校验、失败重试、关闭等待、并发冲突和保存副本均有正式构建证据；远程日历账号、邀请和同步仍未接入。

[US-120 联系人搜索与本地编辑](stories/desktop/ADESK-US-120-contacts-workflow.md)已完成自动验收：搜索、非法草稿保留、真实 SQLite 创建/更新/删除与冲突保护均有正式构建证据；远程联系人账号、电话、消息和邮件发送仍未接入。

[US-121 备忘录置顶与取消置顶](stories/desktop/ADESK-US-121-notes-pin.md)已完成自动验收：工具栏、File 菜单和右键菜单切换 Pin/Unpin，真实 SQLite 持久化与置顶优先排序均有正式构建证据。

[US-122 提醒事项列表筛选与动态统计](stories/desktop/ADESK-US-122-reminder-filters.md)已完成自动验收：五个本地列表动态统计、筛选、Flag/Unflag 持久化和 `flagged` schema 迁移均有正式构建证据。

[US-123 备忘录新建文件夹](stories/desktop/ADESK-US-123-notes-folders.md)已完成自动验收：用户文件夹真实 SQLite 持久化、自定义目录中新建笔记、重复名称拒绝和刷新恢复均有正式构建证据。

[US-124 Freeform 笔迹保存与失败保护](stories/desktop/ADESK-US-124-freeform-workflow.md)已完成自动验收：笔迹持久化、INSERT/DELETE 失败保留、Retry 恢复和刷新恢复均有正式构建证据。

[US-125 Stocks 本地搜索与演示数据声明](stories/desktop/ADESK-US-125-stocks-search-and-demo-data.md)已完成自动验收：本地自选股支持代码和公司名搜索、空结果与清空恢复，页面明确标出无实时行情源；实时行情、交易和远程同步仍未接入。

[US-126 Font Book 字体族搜索](stories/desktop/ADESK-US-126-fontbook-search.md)已完成自动验收：本地字体族支持名称搜索、空结果和清空恢复，筛选后的字体标题与示例文字保持一致；系统字体安装、删除和冲突管理仍未接入。

[US-127 Settings 分区搜索](stories/desktop/ADESK-US-127-settings-search.md)已完成自动验收：本地设置分区支持名称搜索、空结果、清空恢复和面板联动；各面板完整系统 API、远程账号、权限中心和跨设备同步仍未接入。A06 剩余项见[逐应用台账](plans/2026-11-17-builtin-workflows.md)。

## Git 工作区增量（2026-11-22）

[ADESK-US-211 终端、GitHub Desktop 与 Aiao Code 共用仓库](stories/application/ADESK-US-211-git-terminal-workspace.md) 在 US-209 之上增加终端 Git、按目录打开与拖放、远端配置，以及跨源编辑器保存回原仓库。验收先核对本地历史和暂存区，再验证远端分支读回，最后验证跨源窗口保存与重开。[2026-11-23 验收记录](evidence/2026-11-23/git-workspace.md)
