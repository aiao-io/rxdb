# Aiao Desktop 状态总览

2026-11-14 更新。状态真相源是故事 YAML；AC通过、故事关闭与线上发布分别记录。当前12条Done、10条In Review。按用户明确要求和[D-19](decisions.md#d-19只验收桌面-chrome)，本轮只验收桌面Chrome；US-005当前AC已全部通过，因US-008硬依赖未关闭而保持In Review。Safari、Firefox、WebKit记录保留为历史或可选，不再阻塞本轮验收。当前尚有5项AC未关闭：历史基线流程2项、物理键盘1项、VoiceOver 1项、正式发布1项。

## 状态汇总

| 状态           | 数量 |
| -------------- | ---- |
| ✅ Done        | 12   |
| 🚧 In Progress | 0    |
| 👀 In Review   | 10   |
| 📝 Backlog     | 0    |
| 🚫 Blocked     | 0    |
| **合计**       | 22   |

## 进行中（0 条）

无。

## 待评审（10 条）

- [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](stories/application/ADESK-US-205-application-management.md)：当前AC全部通过，等待US-008硬依赖关闭。
- [ADESK-US-206 应用懒加载与统一系统能力](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-104 窗口布局跨刷新保留](stories/desktop/ADESK-US-104-window-layout-persistence.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-105 多标签页实时互通](stories/desktop/ADESK-US-105-multi-tab-sync.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-106 旧库升级路径](stories/desktop/ADESK-US-106-database-upgrade-path.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-107 外壳交互验收补齐](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-108 无障碍：读屏与纯键盘路径](stories/desktop/ADESK-US-108-accessibility.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-004 绑定自定义域名与同站托管](stories/platform/ADESK-US-004-custom-domain.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-005 Chrome 与窄屏验收](stories/platform/ADESK-US-005-cross-browser-smoke.md)：见故事本轮验收的剩余项与依赖关闭条件。
- [ADESK-US-008 冒烟套件化](stories/platform/ADESK-US-008-smoke-suite.md)：见故事本轮验收的剩余项与依赖关闭条件。

## 按 Epic 索引

### ADESK-EPIC-001 产品工程结构

- ✅ [ADESK-US-001 产品根目录与多应用拆分](stories/platform/ADESK-US-001-product-root.md)
- ✅ [ADESK-US-002 本地开发入口与开发导航](stories/platform/ADESK-US-002-local-dev-dashboard.md)
- ✅ [ADESK-US-003 一键发布到 Cloudflare Pages](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)
- 👀 [ADESK-US-004 绑定自定义域名与同站托管](stories/platform/ADESK-US-004-custom-domain.md)
- 👀 [ADESK-US-005 Chrome 与窄屏验收](stories/platform/ADESK-US-005-cross-browser-smoke.md)
- ✅ [ADESK-US-006 web 单测覆盖率门槛](stories/platform/ADESK-US-006-web-test-coverage-gate.md)
- ✅ [ADESK-US-007 外网内容来源与隐私说明](stories/platform/ADESK-US-007-external-content-disclosure.md)
- 👀 [ADESK-US-008 冒烟套件化](stories/platform/ADESK-US-008-smoke-suite.md)

### ADESK-EPIC-002 macOS 风格桌面

- ✅ [ADESK-US-101 桌面外壳与内置应用基线](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)
- ✅ [ADESK-US-102 本地数据与真实磁盘](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)
- ✅ [ADESK-US-103 内置游戏「几猫3A大作」](stories/desktop/ADESK-US-103-saltline-game.md)
- 👀 [ADESK-US-104 窗口布局跨刷新保留](stories/desktop/ADESK-US-104-window-layout-persistence.md)
- 👀 [ADESK-US-105 多标签页实时互通](stories/desktop/ADESK-US-105-multi-tab-sync.md)
- 👀 [ADESK-US-106 旧库升级路径](stories/desktop/ADESK-US-106-database-upgrade-path.md)
- 👀 [ADESK-US-107 外壳交互验收补齐](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)
- 👀 [ADESK-US-108 无障碍：读屏与纯键盘路径](stories/desktop/ADESK-US-108-accessibility.md)

### ADESK-EPIC-003 应用体系与集成应用

- ✅ [ADESK-US-201 应用体系与统一登记表](stories/application/ADESK-US-201-application-system.md)
- ✅ [ADESK-US-202 集成应用的运行宿主](stories/application/ADESK-US-202-integrated-app-runtime.md)
- ✅ [ADESK-US-203 接入 Aiao Code](stories/application/ADESK-US-203-aiao-code.md)
- ✅ [ADESK-US-204 透明窗口与窗口接口](stories/application/ADESK-US-204-transparent-window.md)
- 👀 [ADESK-US-205 Applications 目录、预装应用与 Dock 管理](stories/application/ADESK-US-205-application-management.md)
- 👀 [ADESK-US-206 应用懒加载与统一系统能力](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)
