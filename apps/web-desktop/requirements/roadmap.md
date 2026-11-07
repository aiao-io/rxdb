# Web Desktop 交付顺序

用户要求覆盖完整 Web 桌面产品与无界源码重构。本路线图划分验收切片，不承诺工期，也不把 M1 当作删减 1.0 故事的理由。当前全为 Backlog；先编实施计划与估算，再按硬依赖推进。

## M0：运行内核与接入验证

本组 7 条故事。组内依赖以 YAML dependsOn 为准，不按编号直接开工。

- [DESKTOP-US-301 无界源码内化与独立运行内核](stories/runtime/DESKTOP-US-301-in-repository-runtime.md)
- [DESKTOP-US-302 应用运行环境与样式隔离](stories/runtime/DESKTOP-US-302-application-isolation.md)
- [DESKTOP-US-303 实例生命周期与资源回收](stories/runtime/DESKTOP-US-303-lifecycle-cleanup.md)
- [DESKTOP-US-304 多实例身份与数据作用域](stories/runtime/DESKTOP-US-304-instance-storage-scope.md)
- [DESKTOP-US-305 应用资源加载与独立路由](stories/runtime/DESKTOP-US-305-resources-routing.md)
- [DESKTOP-US-306 应用故障呈现与恢复](stories/runtime/DESKTOP-US-306-failure-recovery.md)
- [DESKTOP-US-308 三框架接入与既有无界消费迁移](stories/runtime/DESKTOP-US-308-framework-parity.md)

关闭条件：仓内源码能独立构建；三框架夹具可并行运行并通过隔离、路由、多实例、清理与故障分支；上游来源和迁移范围可追溯。DESKTOP-US-308 在夹具宿主验证协议，完整桌面组合在 M1/M2 再验收。

## M1：双模式桌面最小工作闭环

本组 20 条故事。组内依赖以 YAML dependsOn 为准，不按编号直接开工。

- [DESKTOP-US-001 首次进入与交互模式选择](stories/shell/DESKTOP-US-001-first-run.md)
- [DESKTOP-US-002 macOS 桌面与应用交互](stories/shell/DESKTOP-US-002-macos-interaction.md)
- [DESKTOP-US-003 Windows 桌面与应用交互](stories/shell/DESKTOP-US-003-windows-interaction.md)
- [DESKTOP-US-004 运行中切换桌面交互模式](stories/shell/DESKTOP-US-004-switch-mode.md)
- [DESKTOP-US-101 窗口创建、层级与焦点](stories/window/DESKTOP-US-101-window-focus.md)
- [DESKTOP-US-102 窗口移动、缩放与可见边界](stories/window/DESKTOP-US-102-move-resize.md)
- [DESKTOP-US-103 最小化、最大化、贴靠与全屏](stories/window/DESKTOP-US-103-window-states.md)
- [DESKTOP-US-104 关闭、退出与未保存内容保护](stories/window/DESKTOP-US-104-close-quit-dirty.md)
- [DESKTOP-US-105 键盘操作与快捷命令](stories/window/DESKTOP-US-105-keyboard-navigation.md)
- [DESKTOP-US-201 应用目录与安装](stories/application/DESKTOP-US-201-catalog-install.md)
- [DESKTOP-US-202 应用描述与兼容性校验](stories/application/DESKTOP-US-202-application-manifest.md)
- [DESKTOP-US-203 启动与单实例、多实例策略](stories/application/DESKTOP-US-203-launch-instances.md)
- [DESKTOP-US-206 应用启动器、搜索与固定](stories/application/DESKTOP-US-206-launcher-pinning.md)
- [DESKTOP-US-401 桌面能力授权与撤销](stories/integration/DESKTOP-US-401-capability-permissions.md)
- [DESKTOP-US-402 应用与桌面交互协议](stories/integration/DESKTOP-US-402-desktop-sdk.md)
- [DESKTOP-US-403 按作用域通信与跨应用协作](stories/integration/DESKTOP-US-403-scoped-messaging.md)
- [DESKTOP-US-501 本地桌面状态与会话恢复](stories/workspace/DESKTOP-US-501-local-session.md)
- [DESKTOP-US-601 虚拟文件系统与文件管理器](stories/files/DESKTOP-US-601-file-manager.md)
- [DESKTOP-US-602 内置文本编辑器与保存闭环](stories/files/DESKTOP-US-602-text-editor.md)
- [DESKTOP-US-701 支持环境与无障碍验收](stories/quality/DESKTOP-US-701-accessibility-environments.md)

关闭条件：关闭 M0 和本组全部故事；两种模式都能从进入桌面到打开文件管理器、编辑保存、切换模式及刷新恢复，并在支持浏览器与真实操作系统完成基础无障碍验证。

## M2：1.0 完整体验与发布

本组 15 条故事。组内依赖以 YAML dependsOn 为准，不按编号直接开工。

- [DESKTOP-US-005 桌面偏好与个性化设置](stories/shell/DESKTOP-US-005-personalization.md)
- [DESKTOP-US-106 窗口概览与快速切换](stories/window/DESKTOP-US-106-window-overview.md)
- [DESKTOP-US-107 桌面内的虚拟工作区](stories/window/DESKTOP-US-107-virtual-workspaces.md)
- [DESKTOP-US-204 应用更新与版本回退](stories/application/DESKTOP-US-204-update-rollback.md)
- [DESKTOP-US-205 卸载与应用数据管理](stories/application/DESKTOP-US-205-uninstall-data.md)
- [DESKTOP-US-307 预加载与后台资源管理](stories/runtime/DESKTOP-US-307-preload-suspension.md)
- [DESKTOP-US-404 文件关联与打开方式](stories/integration/DESKTOP-US-404-open-with.md)
- [DESKTOP-US-405 通知与剪贴板能力](stories/integration/DESKTOP-US-405-notifications-clipboard.md)
- [DESKTOP-US-502 离线启动与资源完整性](stories/workspace/DESKTOP-US-502-offline-cache.md)
- [DESKTOP-US-503 桌面备份、恢复与重置](stories/workspace/DESKTOP-US-503-backup-reset.md)
- [DESKTOP-US-504 多标签页访问与写入协调](stories/workspace/DESKTOP-US-504-multi-tab-ownership.md)
- [DESKTOP-US-603 本机文件导入与下载导出](stories/files/DESKTOP-US-603-import-export.md)
- [DESKTOP-US-604 回收站、恢复与永久删除](stories/files/DESKTOP-US-604-trash-recovery.md)
- [DESKTOP-US-702 产品旅程、性能与回归门禁](stories/quality/DESKTOP-US-702-release-verification.md)
- [DESKTOP-US-703 静态部署、版本信息与诊断](stories/quality/DESKTOP-US-703-deployment-diagnostics.md)

关闭条件：关闭 M0、M1 与本组全部故事；离线、升级回退、卸载、备份、多标签页、文件导入导出和实机性能证据完整，正式 HTTPS 部署可复验。

## 关键依赖

仓内内核 → 隔离与资源/实例管理 → 应用描述与授权 → 桌面窗口及 SDK → 文件管理与编辑 → 双模式切换和恢复 → 离线及升级备份 → 完整发布证据。

M1 必须同时交付两种模式。不能先把一个模式标 Done 再把另一模式作为候选，也不能只交付某一个框架的公共适配。M2 发布验证 DESKTOP-US-702 的检查清单覆盖该里程碑全部故事，其依赖表只列测试设施和环境前置。

## 合并与准入

需求编写属于当前授权；本轮不实施或合并运行内核。后续实现需按仓库规则评审范围、填写技术设计并先写行为测试。候选领域规则如被适用，按根需求毕业路径处理，不能以本目录存在代替审批。平台公共包变化与桌面功能在同一个 PR 中统一评审和合入。
