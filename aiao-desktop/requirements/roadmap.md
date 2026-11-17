# Aiao Desktop 路线图

2026-11-14：本轮覆盖22个已立项故事。状态只见[状态总览](status-overview.md)，原始结果见[验收台账](verification-report.md)与[证据索引](evidence/2026-11-14/README.md)。未立项方向留在[后续方向](future-requirements.md)。

## 自动完成增量（2026-11-17）

按[自动完成计划](plans/2026-11-17-autonomous-completion.md)推进全部可自动完成的缺口。先实施 [ADESK-US-109 文档保存与关闭保护](stories/desktop/ADESK-US-109-document-workflow.md)，接续 [ADESK-US-110 文件管理](stories/desktop/ADESK-US-110-file-management.md)，再推进 [ADESK-US-111 数据保障](stories/desktop/ADESK-US-111-backup-and-storage-health.md) 与 [ADESK-US-207 批准目录及版本生命周期](stories/application/ADESK-US-207-approved-app-catalog.md)，再实施 [ADESK-US-112 运行状态与隐藏资源管理](stories/desktop/ADESK-US-112-runtime-activity.md)和 [ADESK-US-113 离线资源与真实网络状态](stories/desktop/ADESK-US-113-offline-resources.md)，最后汇总两个产品的自动验收。人工读屏和用户研究保留原证据要求。

2026-11-17 进度：A01～A05 已完成本地自动验收，包括 US-112、US-113 与 US-208；内置应用补缺及 React 自动验收仍继续，未作本轮生产发布。

## 本次收尾

1. 按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受US-008 #10与US-206 #7的一次历史流程例外。固定历史提交、数值门槛、回溯测量时间与首次拆分失败样本保留。
2. 按依赖顺序关闭US-008、US-106、US-205、US-206，再关闭US-104、US-105与US-005。各故事AC与硬依赖均须满足。
3. 执行已授权的正式发布，核对独有部署地址的全部文件、两个生产入口、双域名用户数据隔离及真实线上Aiao Code；取得本次结果后关闭[ADESK-US-004 自定义域名](stories/platform/ADESK-US-004-custom-domain.md)。
4. [US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)已按真实物理键盘记录关闭；[US-108](stories/desktop/ADESK-US-108-accessibility.md)仍需VoiceOver V01～V14实际播报。

浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；其他浏览器记录保留为历史或可选诊断。数据库升级后不能回滚到B0（6859fe56）之前缺少降级保护的旧生产版本。

## PWA 增量（2026-11-16）

[ADESK-US-009 PWA 安装与离线桌面](stories/platform/ADESK-US-009-pwa.md)：生产构建接入安装清单与 Service Worker，验收桌面预缓存、离线重开、本地数据和版本切换。范围限定为本地桌面与已缓存资源；远程集成应用、外网内容和未下载的终端资源不属于完整离线承诺，生产发布单独安排。

## 扩大使用范围的条件

扩大使用范围前，仍需完整文件工作流、备份恢复、保存失败与配额边界、明确的浏览器支持矩阵、升级与回滚边界。TextEdit 文档工作流、Finder 文件管理、完整备份和存储故障恢复已由 ADESK-US-109～111 完成；后续应用目录和运行能力按自动完成计划逐项立项和验收，原方向见[后续方向](future-requirements.md)。

新方向先补具体场景、验收范围和对冒烟的影响，再立故事。改变产品边界时同步更新[决策](decisions.md)。

[ADESK-US-208 Aiao Code 文件复制与嵌入边界](stories/application/ADESK-US-208-aiao-code-file-copy.md) 已完成本地正式构建自动验收：单文件和项目归档显式复制、嵌入目录输入与登录限制；两个存储域独立，单次 512 KiB，真实账号与线上发布单列。

A06 已建立[逐应用台账](plans/2026-11-17-builtin-workflows.md)，[US-114 内置内容复制与打印](stories/desktop/ADESK-US-114-content-actions.md)已完成，继续处理草稿保护及其余主要任务。

[US-115 提醒事项草稿保护](stories/desktop/ADESK-US-115-reminder-drafts.md)已完成：失败保留输入、稳定 ID 重试、关闭等待及五组关联回归通过；继续 Notes 等其余写入流程。

[US-116 备忘录编辑保护](stories/desktop/ADESK-US-116-note-drafts.md)已完成：保存失败、导航等待、并发冲突、副本恢复与六组正式构建回归通过。

[US-117 本地会话与草稿保护](stories/desktop/ADESK-US-117-local-messages.md)已完成自动验收；真实远程通讯仍未接入。

[US-118 本地邮件草稿](stories/desktop/ADESK-US-118-local-mail-drafts.md)已完成自动验收，真实邮件收发仍未接入。
