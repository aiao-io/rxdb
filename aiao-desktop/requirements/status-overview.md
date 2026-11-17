# Aiao Desktop 状态总览

2026-11-17 更新。状态真相源是故事 YAML；AC验收、依赖关闭与生产发布分别记录。当前33条Done、1条In Progress、1条In Review。浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)已接受两项回溯基线例外并批准正式发布。本次正式发布及95个公开文件的后续对账已完成；物理键盘已逐项记录并关闭 US-107，当前仅剩 US-108 的 VoiceOver AC，按用户 2026-11-15 指示延期至后续验收。

2026-11-16 新增 PWA 安装、离线桌面与版本更新的本地正式构建验收已完成（US-009），[证据](evidence/2026-11-16/pwa.md)与既有线上发布分开记录；本次没有生产发布。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 33   |
| 🚧 In Progress | 1    |
| 👀 In Review   | 1    |
| 📝 Backlog     | 0    |
| 🚫 Blocked     | 0    |
| **合计**       | 35   |

## 自动完成计划

A01～A05 已完成并归档，包括 US-112、US-113 与 US-208；继续 A06 内置应用核查及后续自动任务，见[计划](plans/2026-11-17-autonomous-completion.md)。

## 进行中（1 条）

- [US-118 本地邮件草稿保存与失败保护](stories/desktop/ADESK-US-118-local-mail-drafts.md)：实际 Drafts 保存、导航/关闭保护与并发冲突，真实邮件收发服务未接入。

## 待评审（1 条）

- [ADESK-US-108 无障碍：读屏与纯键盘路径](stories/desktop/ADESK-US-108-accessibility.md)：VoiceOver V01～V14 实际播报验收按用户要求延期，AC#6 保持未验收。

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

- 🚧 [ADESK-US-118 本地邮件草稿保存与失败保护](stories/desktop/ADESK-US-118-local-mail-drafts.md)

### ADESK-EPIC-003 应用体系与集成应用

- ✅ [ADESK-US-201 应用体系与统一登记表](stories/application/ADESK-US-201-application-system.md)
- ✅ [ADESK-US-202 集成应用的运行宿主](stories/application/ADESK-US-202-integrated-app-runtime.md)
- ✅ [ADESK-US-203 接入 Aiao Code](stories/application/ADESK-US-203-aiao-code.md)
- ✅ [ADESK-US-204 透明窗口与窗口接口](stories/application/ADESK-US-204-transparent-window.md)
- ✅ [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](stories/application/ADESK-US-205-application-management.md)
- ✅ [ADESK-US-206 应用懒加载与统一系统能力](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)

- ✅ [ADESK-US-207 运营批准应用目录与版本管理](stories/application/ADESK-US-207-approved-app-catalog.md)

- ✅ [ADESK-US-208 Aiao Code 文件复制与嵌入边界](stories/application/ADESK-US-208-aiao-code-file-copy.md)
