# Tasks: 双交互模式 Web 桌面产品

日期：2026-11-07。覆盖全部当前故事；逐 AC 证据由验收台账维护。勾选只代表任务定义满足；实机或发布证据缺失不得用自动化结果替代。遵循红→绿→重构。

## Phase 1: Setup

- [x] T001 补齐实施计划、研究、数据模型、SDK 与验证指南：specs/001-web-desktop-product/{plan,research,data-model,quickstart}.md 和 contracts/desktop-sdk.md
- [x] T002 用 Nx 生成器创建应用与 lint/test/build/typecheck/e2e 目标：apps/web-desktop/project.json、vite.config.mts、playwright.config.ts
- [x] T003 校验 42 故事/256 AC、依赖环、状态派生和本地链接：apps/web-desktop/tools/requirements-check.mjs

## Phase 2: Foundational

- [x] T004 先写持久化、文件冲突、状态机与拒绝授权红测试：apps/web-desktop/src/core/{files,permissions,session}.spec.ts 和 src/host/windows.spec.ts
- [x] T005 实现版本化原子 IndexedDB 存储（v1/v2/v3/v4→v5 迁移，数据库版本 1、物理 storageVersion=1 的逐文件字节存储及旧单条布局原子拆分）、所有权前置及提交检查、显式存储错误：apps/web-desktop/src/core/{database,database-storage}.ts；独立存储校验见 storage.browser.spec.ts
- [x] T006 实现文件 name 非空/无路径分隔符、revision 正整数、同目录唯一且无环、bytes 与元数据原子提交：apps/web-desktop/src/core/files.ts
- [x] T007 实现稳定类型与身份边界：apps/web-desktop/src/core/types.ts、src/host/bridge.ts

## Phase 3: US1 文件工作闭环

独立验证：两种模式从新建到保存关闭重开，文件字节一致。

- [ ] T008 [US1] DESKTOP-US-601 逐 AC 编写文件管理成功/失败/取消用例：apps/web-desktop/src/core/files.spec.ts、src/host/bridge.spec.ts；浏览器为 e2e/{desktop,editor,file-manager}.spec.ts，两模式覆盖空态、键盘选择/目录搜索、重名拒绝与明确改名、非法名称/目录环、新建/移动 QUOTA 与 abort 回滚、导入期间搜索变更的晚到刷新；文件/目录作用域和提交前撤权见服务边界测试；完整支持环境待验收
- [ ] T009 [US1] DESKTOP-US-601 实现虚拟文件系统与文件管理器，保持对应故事全部 AC：apps/web-desktop/src/core/files.ts、src/host/{bridge,permission-labels}.ts、src/apps/files-view.tsx；文件授权显示真实虚拟路径并保持不透明 ID 判权；列表刷新读取当前导航位置，避免导入完成覆盖新搜索；完整支持环境待验收，证据见 requirements/verification-report.md
- [ ] T010 [US1] DESKTOP-US-602 逐 AC 编写编辑与保存的成功/失败/取消用例：apps/web-desktop/src/apps/editor.spec.ts；浏览器交互为 e2e/{desktop,editor}.spec.ts，两模式补齐独立历史、另存为原稿保留、QUOTA 草稿保护与重试、重命名/跨目录移动取消和稳定文件 ID 恢复；完整支持环境待验收
- [ ] T011 [US1] DESKTOP-US-602 实现 内置文本编辑器与保存闭环，保持对应故事全部 AC 约束：apps/web-desktop/src/apps/editor.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T012 [US1] DESKTOP-US-701 先以数字 AC 编写 支持环境与无障碍验收 的成功/失败/取消用例：apps/web-desktop/src/host/accessibility.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T013 [US1] DESKTOP-US-701 实现 支持环境与无障碍验收，保持对应故事全部 AC 约束：apps/web-desktop/src/host/accessibility.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T014 [US1] DESKTOP-US-702 先以数字 AC 编写 产品旅程、性能与回归门禁 的成功/失败/取消用例：apps/web-desktop/src/host/verification.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T015 [US1] DESKTOP-US-702 实现 产品旅程、性能与回归门禁，保持对应故事全部 AC 约束：apps/web-desktop/src/host/verification.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T016 [US1] DESKTOP-US-703 先以数字 AC 编写 静态部署、版本信息与诊断 的成功/失败/取消用例：apps/web-desktop/src/host/diagnostics.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T017 [US1] DESKTOP-US-703 实现 静态部署、版本信息与诊断，保持对应故事全部 AC 约束：apps/web-desktop/src/host/diagnostics.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T018 [US1] DESKTOP-US-001 先以数字 AC 编写 首次进入与交互模式选择 的成功/失败/取消用例：apps/web-desktop/src/host/first-run.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T019 [US1] DESKTOP-US-001 实现 首次进入与交互模式选择，保持对应故事全部 AC 约束：apps/web-desktop/src/host/first-run.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T020 [US1] DESKTOP-US-501 先以数字 AC 编写会话恢复的成功/失败/取消用例：apps/web-desktop/src/core/{session,layout,database.browser}.spec.ts、src/host/{windows,runtime.browser,recovery.browser}.spec.ts；浏览器为 e2e/{desktop,navigation,session,recovery}.spec.ts；已验证未安装快照的逐项重试/移除、安装后恢复及工作区迁移；完整支持环境与其余失败分支待验收
- [ ] T021 [US1] DESKTOP-US-501 实现会话 v5、稳定窗口身份、未安装恢复待办、当前位置、完整窗口还原链、失败项重试、恢复边界提示和受损数据显式重置：apps/web-desktop/src/core/{session,layout}.ts、src/host/{runtime,windows,updates,recovery,recovery-view}.ts(x)、src/apps/{session,navigation,files-view,settings-view,editor-view}.ts(x)；仍须满足原故事全部 AC；证据见 requirements/verification-report.md

## Phase 4: US2 多任务与双模式

独立验证：双实例、脏内容、模态和最小化下切换20次，身份与内容不变。

- [ ] T022 [US2] DESKTOP-US-002 先以数字 AC 编写 macOS 桌面与应用交互 的成功/失败/取消用例：apps/web-desktop/src/host/shell.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T023 [US2] DESKTOP-US-002 实现 macOS 桌面与应用交互，保持对应故事全部 AC 约束：apps/web-desktop/src/host/shell.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T024 [US2] DESKTOP-US-003 先以数字 AC 编写 Windows 桌面与应用交互 的成功/失败/取消用例：apps/web-desktop/src/host/shell.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T025 [US2] DESKTOP-US-003 实现 Windows 桌面与应用交互，保持对应故事全部 AC 约束：apps/web-desktop/src/host/shell.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T026 [US2] DESKTOP-US-004 先以数字 AC 编写 运行中切换桌面交互模式 的成功/失败/取消用例：apps/web-desktop/src/host/shell.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T027 [US2] DESKTOP-US-004 实现 运行中切换桌面交互模式，保持对应故事全部 AC 约束：apps/web-desktop/src/host/shell.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T028 [US2] DESKTOP-US-005 先以数字 AC 编写 桌面偏好与个性化设置 的成功/失败/取消用例：apps/web-desktop/src/apps/settings.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T029 [US2] DESKTOP-US-005 实现 桌面偏好与个性化设置，保持对应故事全部 AC 约束：apps/web-desktop/src/apps/settings.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T030 [US2] DESKTOP-US-101 先以数字 AC 编写 窗口创建、层级与焦点 的成功/失败/取消用例：apps/web-desktop/src/host/windows.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T031 [US2] DESKTOP-US-101 实现 窗口创建、层级与焦点，保持对应故事全部 AC 约束：apps/web-desktop/src/host/windows.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T032 [US2] DESKTOP-US-102 先以数字 AC 编写 窗口移动、缩放与可见边界 的成功/失败/取消用例：apps/web-desktop/src/host/windows.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T033 [US2] DESKTOP-US-102 实现 窗口移动、缩放与可见边界，保持对应故事全部 AC 约束：apps/web-desktop/src/host/windows.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T034 [US2] DESKTOP-US-103 先以数字 AC 编写 最小化、最大化、贴靠与全屏 的成功/失败/取消用例：apps/web-desktop/src/host/windows.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T035 [US2] DESKTOP-US-103 实现 最小化、最大化、贴靠与全屏，保持对应故事全部 AC 约束：apps/web-desktop/src/host/windows.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T036 [US2] DESKTOP-US-104 先以数字 AC 编写 关闭、退出与未保存内容保护 的成功/失败/取消用例：apps/web-desktop/src/host/close.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T037 [US2] DESKTOP-US-104 实现 关闭、退出与未保存内容保护，保持对应故事全部 AC 约束：apps/web-desktop/src/host/close.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T038 [US2] DESKTOP-US-105 先以数字 AC 编写 键盘操作与快捷命令 的成功/失败/取消用例：apps/web-desktop/src/host/keyboard.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T039 [US2] DESKTOP-US-105 实现 键盘操作与快捷命令，保持对应故事全部 AC 约束：apps/web-desktop/src/host/keyboard.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T040 [US2] DESKTOP-US-106 先以数字 AC 编写 窗口概览与快速切换 的成功/失败/取消用例：apps/web-desktop/src/host/overview.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T041 [US2] DESKTOP-US-106 实现 窗口概览与快速切换，保持对应故事全部 AC 约束：apps/web-desktop/src/host/overview.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T042 [US2] DESKTOP-US-107 先以数字 AC 编写 桌面内的虚拟工作区 的成功/失败/取消用例：apps/web-desktop/src/core/workspaces.spec.ts、src/host/windows.spec.ts；浏览器交互纳入 e2e/desktop.spec.ts、workspaces.spec.ts，仍待完整支持环境
- [ ] T043 [US2] DESKTOP-US-107 实现 桌面内的虚拟工作区，保持对应故事全部 AC 约束：apps/web-desktop/src/core/workspaces.ts、src/host/{bridge,runtime,windows}.ts、src/apps/settings-view.tsx 与 src/host/shell.tsx；证据关联 apps/web-desktop/requirements/verification-report.md

## Phase 5: US3 受控应用与协作

独立验证：受控安装、授权拒绝/撤销、定向通信与文件关联。

- [ ] T044 [US3] DESKTOP-US-201 先以数字 AC 编写 应用目录与安装 的成功/失败/取消用例：apps/web-desktop/src/core/catalog.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T045 [US3] DESKTOP-US-201 实现 应用目录与安装，保持对应故事全部 AC 约束：apps/web-desktop/src/core/catalog.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T046 [US3] DESKTOP-US-202 先以数字 AC 编写 应用描述与兼容性校验 的成功/失败/取消用例：apps/web-desktop/src/core/catalog.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T047 [US3] DESKTOP-US-202 实现 应用描述与兼容性校验，保持对应故事全部 AC 约束：apps/web-desktop/src/core/catalog.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T048 [US3] DESKTOP-US-203 先以数字 AC 编写 启动与单实例、多实例策略 的成功/失败/取消用例：apps/web-desktop/src/host/runtime.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T049 [US3] DESKTOP-US-203 实现 启动与单实例、多实例策略，保持对应故事全部 AC 约束：apps/web-desktop/src/host/runtime.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T050 [US3] DESKTOP-US-206 先以数字 AC 编写 应用启动器、搜索与固定 的成功/失败/取消用例：apps/web-desktop/src/host/launcher.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T051 [US3] DESKTOP-US-206 实现 应用启动器、搜索与固定，保持对应故事全部 AC 约束：apps/web-desktop/src/host/launcher.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T052 [US3] DESKTOP-US-401 逐 AC 编写桌面授权/撤销用例：apps/web-desktop/src/core/permissions.spec.ts、src/host/{bridge,permission-labels}.spec.ts；浏览器为 e2e/{desktop,file-manager,permissions,trash,updates}.spec.ts，文件范围可读、单窗口授权不跨文件/实例、按文件撤权及拒绝保存草稿保护、退出后本次授权失效与持久授权跨刷新已有本机证据；其余能力/撤权时序和完整支持环境待验收
- [ ] T053 [US3] DESKTOP-US-401 实现桌面能力授权与撤销，保持对应故事全部 AC：apps/web-desktop/src/core/permissions.ts、src/host/{runtime,bridge,permission-labels}.ts、src/apps/settings-view.tsx；提示及设置显示中文能力与真实文件范围，说明授权有效期；回收和永久删除范围保留可识别的撤销入口，显示字段不写回原授权身份；其余 AC 及支持环境待验收，证据见 requirements/verification-report.md
- [ ] T054 [US3] DESKTOP-US-402 先以数字 AC 编写 应用与桌面交互协议 的成功/失败/取消用例：apps/web-desktop/src/host/bridge.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T055 [US3] DESKTOP-US-402 实现 应用与桌面交互协议，保持对应故事全部 AC 约束：apps/web-desktop/src/host/bridge.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T056 [US3] DESKTOP-US-403 先以数字 AC 编写 按作用域通信与跨应用协作 的成功/失败/取消用例：apps/web-desktop/src/host/messaging.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T057 [US3] DESKTOP-US-403 实现 按作用域通信与跨应用协作，保持对应故事全部 AC 约束：apps/web-desktop/src/host/messaging.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T058 [US3] DESKTOP-US-404 先以数字 AC 编写 文件关联与打开方式 的成功/失败/取消用例：apps/web-desktop/src/core/associations.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T059 [US3] DESKTOP-US-404 实现 文件关联与打开方式，保持对应故事全部 AC 约束：apps/web-desktop/src/core/associations.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md

## Phase 6: US5 内核接入与维护

独立验证：三框架真实渲染、双实例隔离、故障与30轮回收、原消费回归。

- [ ] T060 [US5] DESKTOP-US-301 先以数字 AC 编写 Orbit 独立应用运行内核 的成功/失败/取消用例：apps/web-desktop/src/host/runtime.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T061 [US5] DESKTOP-US-301 实现 Orbit 独立应用运行内核，保持对应故事全部 AC 约束：apps/web-desktop/src/host/runtime.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T062 [US5] DESKTOP-US-302 先以数字 AC 编写 应用运行环境与样式隔离 的成功/失败/取消用例：apps/web-desktop/src/host/runtime.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T063 [US5] DESKTOP-US-302 实现 应用运行环境与样式隔离，保持对应故事全部 AC 约束：apps/web-desktop/src/host/runtime.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T064 [US5] DESKTOP-US-303 先以数字 AC 编写 实例生命周期与资源回收 的成功/失败/取消用例：apps/web-desktop/src/host/runtime.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T065 [US5] DESKTOP-US-303 实现 实例生命周期与资源回收，保持对应故事全部 AC 约束：apps/web-desktop/src/host/runtime.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T066 [US5] DESKTOP-US-304 先以数字 AC 编写 多实例身份与数据作用域 的成功/失败/取消用例：apps/web-desktop/src/core/app-data.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T067 [US5] DESKTOP-US-304 实现 多实例身份与数据作用域，保持对应故事全部 AC 约束：apps/web-desktop/src/core/app-data.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T068 [US5] DESKTOP-US-305 逐 AC 编写资源和实例导航的成功/失败/取消用例：apps/web-desktop/src/core/{routes.spec,release-cache.browser.spec}.ts、src/apps/{navigation,files-navigation,editor-navigation,session}.spec.ts、src/host/{bridge.spec,runtime.browser.spec}.ts；浏览器为 e2e/navigation.spec.ts、updates.spec.ts；完整环境待验收
- [ ] T069 [US5] DESKTOP-US-305 实现相对资源、实例 path/query/hash、前进后退与指定位置：apps/web-desktop/src/core/{routes,release-cache}.ts、src/apps/{navigation,session,files-navigation,editor-navigation}.ts 和各视图；src/host/{bridge,runtime}.ts、shell.tsx；全部 AC 证据见 requirements/verification-report.md
- [ ] T070 [US5] DESKTOP-US-306 先以数字 AC 编写故障与重试恢复用例：apps/web-desktop/src/host/runtime.browser.spec.ts、updates.browser.spec.ts；浏览器为 e2e/desktop.spec.ts、updates.spec.ts；完整产品失败组合待补
- [ ] T071 [US5] DESKTOP-US-306 实现 应用故障呈现与恢复，保持对应故事全部 AC 约束：apps/web-desktop/src/host/runtime.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T072 [US5] DESKTOP-US-307 逐 AC 编写预取、调度、挂起与清理的成功/失败/取消用例：apps/web-desktop/src/core/{resource-scheduler,resource-references}.spec.ts、release-cache.browser.spec.ts；src/host/{prefetch,suspension,application-resources,service-worker}.spec.ts；src/apps/session.spec.ts；浏览器旅程为 apps/web-desktop/e2e/background.spec.ts；完整支持环境待验收
- [ ] T073 [US5] DESKTOP-US-307 实现预取、协作挂起和按版本引用清理：apps/web-desktop/src/core/{resource-scheduler,resource-references,release-cache}.ts；src/host/{prefetch,suspension,application-resources,runtime,updates,bridge}.ts；src/apps/session.ts 和内置应用视图；tools/service-worker.js；UI 位于 src/host/shell.tsx；完整 AC 证据见 apps/web-desktop/requirements/verification-report.md
- [ ] T074 [US5] DESKTOP-US-308 逐 AC 编写三框架接入与既有消费迁移用例：src/samples/document.spec.ts 验证共用文档、授权失败、导航、关闭与晚到保存；e2e/frameworks.spec.ts 验证真实三端安装、六实例隔离、双模式切换及独立下载；既有文档站主题/路由和完整支持环境继续待验收
- [ ] T075 [US5] DESKTOP-US-308 实现同任务三端样例与既有消费迁移：apps/web-desktop/src/samples/{document,main,angular,vue}.ts、react.tsx、style.css，sample-{angular,react,vue}.html；目录和版本资源纳入既有 catalog/release 流程，公共文档模型与 AppSession 共用；其余 AC、既有文档站和实机矩阵待验收，证据见 requirements/verification-report.md

## Phase 7: US4 离线、版本与数据带出

独立验证：断网正式产物、版本中断、损坏恢复、多页接管和二进制带出。

- [x] T076 [US4] DESKTOP-US-204 先以数字 AC 编写 应用更新与版本回退 的成功/失败/取消用例：apps/web-desktop/src/core/releases.spec.ts、apps/web-desktop/src/core/release-cache.browser.spec.ts、apps/web-desktop/src/host/updates.browser.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/updates.spec.ts
- [x] T077 [US4] DESKTOP-US-204 实现 应用更新与版本回退，保持对应故事全部 AC 约束：apps/web-desktop/src/core/releases.ts、apps/web-desktop/src/core/release-cache.ts、apps/web-desktop/src/host/updates.ts；UI 位于 apps/web-desktop/src/apps/catalog-view.tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T078 [US4] DESKTOP-US-205 先以数字 AC 编写 卸载与应用数据管理 的成功/失败/取消用例：apps/web-desktop/src/core/catalog.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T079 [US4] DESKTOP-US-205 实现 卸载与应用数据管理，保持对应故事全部 AC 约束：apps/web-desktop/src/core/catalog.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T080 [US4] DESKTOP-US-603 逐 AC 编写导入与下载的成功/失败/取消用例：apps/web-desktop/src/core/{files.spec,storage.browser.spec}.ts；浏览器交互为 e2e/{desktop,import-export,import-limits}.spec.ts，覆盖两模式拖入/下载、主动内容不执行、读取故障、整批取消/QUOTA/abort、真实 50/200 MiB 与 100 文件边界；完整支持环境待验收
- [ ] T081 [US4] DESKTOP-US-603 实现整批导入及真实下载，保持对应故事全部 AC：apps/web-desktop/src/core/{files,database,database-storage}.ts、src/apps/{files-view,session}.ts(x)；逐文件存储保证真实 200 MiB 批次，字节与元数据同事务，旧布局原子迁移；完整支持环境待验收，证据见 requirements/verification-report.md
- [ ] T082 [US4] DESKTOP-US-604 先以数字 AC 编写 回收站、恢复与永久删除 的成功/失败/取消用例：apps/web-desktop/src/core/files.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/trash.spec.ts；两模式恢复、草稿保护、确认/取消、撤权及 QUOTA 重试已验证，完整支持环境与其余边界待验收
- [ ] T083 [US4] DESKTOP-US-604 实现 回收站、恢复与永久删除，保持对应故事全部 AC 约束：apps/web-desktop/src/core/files.ts、src/host/bridge.ts、src/apps/{files-view,editor-view}.tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T084 [US4] DESKTOP-US-405 先以数字 AC 编写 通知与剪贴板能力 的成功/失败/取消用例：apps/web-desktop/src/host/notifications.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T085 [US4] DESKTOP-US-405 实现 通知与剪贴板能力，保持对应故事全部 AC 约束：apps/web-desktop/src/host/notifications.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T086 [US4] DESKTOP-US-502 先以数字 AC 编写 离线启动与资源完整性 的成功/失败/取消用例：apps/web-desktop/src/core/release-cache.browser.spec.ts、apps/web-desktop/src/host/offline.spec.ts、application-resources.spec.ts、service-worker.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts、offline-upgrade.spec.ts
- [ ] T087 [US4] DESKTOP-US-502 实现 离线启动与资源完整性，保持对应故事全部 AC 约束：apps/web-desktop/src/core/release-cache.ts、apps/web-desktop/src/host/application-resources.ts、offline.ts、runtime.ts、tools/service-worker.js；UI 位于 src/host/shell.tsx；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T088 [US4] DESKTOP-US-503 先以数字 AC 编写 桌面备份、恢复与重置 的成功/失败/取消用例：apps/web-desktop/src/core/backup.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/{desktop,backup}.spec.ts；已有下载/恢复/取消/损坏/额度失败旅程，全量重置两阶段取消及重新入门旅程已验证；替换/清除 QUOTA 与 put 后事务 abort 回滚已验证；实机进程中断与完整支持环境待验收
- [ ] T089 [US4] DESKTOP-US-503 实现 桌面备份、恢复与重置，保持对应故事全部 AC 约束：apps/web-desktop/src/core/backup.ts、src/host/{runtime,bridge}.ts、src/apps/settings-view.tsx；原子替换后重启会话，失败保留旧快照；证据关联 apps/web-desktop/requirements/verification-report.md
- [ ] T090 [US4] DESKTOP-US-504 先以数字 AC 编写 多标签页访问与写入协调 的成功/失败/取消用例：apps/web-desktop/src/host/ownership.spec.ts；浏览器交互纳入 apps/web-desktop/e2e/desktop.spec.ts
- [ ] T091 [US4] DESKTOP-US-504 实现 多标签页访问与写入协调，保持对应故事全部 AC 约束：apps/web-desktop/src/host/ownership.ts；涉及 UI 使用同目录 .tsx；证据关联 apps/web-desktop/requirements/verification-report.md

## Phase 8: Polish & release verification

- [ ] T092 全部新增逻辑 lint/typecheck/test/build，应用核心四项覆盖率≥80%，Orbit 四项≥90%，修复失败：apps/web-desktop/vitest.config.mts、packages/orbit/vite.config.mts
- [ ] T093 正式产物两模式旅程、键盘与 axe、离线/多页/冲突/备份失败分支：apps/web-desktop/e2e/desktop.spec.ts
- [ ] T094 30次冷启动/30次热打开/20实例100次交互/30轮回收及堆引用测量，记录原始样本：apps/web-desktop/e2e/performance.spec.ts、requirements/verification-report.md
- [ ] T095 macOS Chrome/Edge/Safari 与 Windows Chrome/Edge、真实中文 IME/读屏/200% 缩放验收；10 名新用户任务记录：apps/web-desktop/requirements/verification-report.md
- [ ] T096 HTTPS 正式部署和深链/资源基址/缓存切换验证，去敏诊断与版本信息：apps/web-desktop/README.md、requirements/verification-report.md
- [ ] T097 同步故事状态、产品计数、逐 AC 证据，执行 Spec Kit converge 追加任何剩余差距：apps/web-desktop/requirements/、specs/001-web-desktop-product/tasks.md

## Dependencies and execution strategy

Phase 1 → Phase 2 → US1 → US2 → US3 → US5 → US4 → 发布验证。原子故事硬依赖仍以 YAML 为准：先完成被依赖的基础设施再验收消费者；同阶段允许先补所需基础能力。US1 的 MVP 不替代全部当前范围。

同阶段不同文件的测试可并行准备；实现需等各自红测试确认。公共写集合 database/types/bridge 串行修改。不得为并行提高 Nx worker 数量；本机正式验证 parallel=1。

每个 US 的成功标准见对应独立验证，所有原子 AC 仍须逐条登记。真实环境和用户研究需要外部证据，不能自动勾选为完成。可选 Git hooks 跳过；不自动合并 main 或发布。
