# Aiao Desktop 路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。

## 当前批次

前四条故事都已交付：产品根目录与多应用拆分（[ADESK-US-001](stories/platform/ADESK-US-001-product-root.md)）、本地开发入口与开发导航（[ADESK-US-002](stories/platform/ADESK-US-002-local-dev-dashboard.md)），由冒烟守住的桌面外壳与内置应用基线（[ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md)），以及本地数据与真实磁盘（[ADESK-US-102](stories/desktop/ADESK-US-102-local-data-and-real-disk.md)）：系统与应用数据进本地 SQLite，磁盘是真文件，终端看到并修改同一块磁盘。之后桌面里加了内置游戏「几猫3A大作」（[ADESK-US-103](stories/desktop/ADESK-US-103-saltline-game.md)）：随桌面发布的单文件 3D 游戏，在同源 iframe 里运行（[D-15](decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)），已交付。

应用体系与集成应用（[ADESK-EPIC-003](epics/ADESK-EPIC-003.md)）也已交付：[ADESK-US-201](stories/application/ADESK-US-201-application-system.md)（应用体系与统一登记表）与 [ADESK-US-202](stories/application/ADESK-US-202-integrated-app-runtime.md)（集成应用的运行宿主）由单测与冒烟守住；[ADESK-US-203](stories/application/ADESK-US-203-aiao-code.md) 接入 Aiao Code，2026-11-13 随 Aiao Code 发布到 vscode.aiao.io 后对线上验收通过。Aiao Code 以后每次发布，都要再跑一次 `aiao-desktop-e2e:verify-aiao-code`（[D-13](decisions.md#d-13aiao-code-用线上发布版本)）。

[ADESK-US-204](stories/application/ADESK-US-204-transparent-window.md) 透明窗口与窗口接口（参考 Tauri，[D-14](decisions.md#d-14透明窗口与窗口接口参考-tauri)）也已交付：2026-11-13 Aiao Code 发布自绘标题栏后对线上验收通过，桌面里的 Aiao Code 不再外套桌面的标题栏。

## 已立项（Backlog）

以下方向已立故事、有验收范围，等待排期实现（状态见 [status-overview](status-overview.md)）：

- [ADESK-US-205](stories/application/ADESK-US-205-application-management.md) 把统一清单投影成 Applications，补齐 `saltline.html` 这类预装 bundled HTML、远程 iframe 应用的受管 `.app` 表现、不可删除保护、Dock 固定/运行态/拖放和本地持久化。
- [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 把内置组件、应用数据、同源 HTML 与远程 iframe 都改成按需载荷，并以 `DesktopAppContext` 提供窗口、菜单、通知、剪贴板和文件等系统能力。
- [ADESK-US-207](stories/application/ADESK-US-207-managed-app-catalog.md) 受管应用目录：运营批准的目录支持安装、更新、卸载与回退。
- [ADESK-US-104](stories/desktop/ADESK-US-104-window-layout-persistence.md) 窗口布局跨刷新保留：打开的窗口在刷新后恢复位置、大小与状态。
- [ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md) 多标签页实时互通：一个标签页的改动在另一个标签页即时可见。
- [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 旧库升级路径：升级后数据保留、新数据域补写、不兼容时明确报错。
- [ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 外壳交互验收补齐：开机、锁屏、睡眠、状态栏面板、控制中心与窗口拖动/缩放/全屏进冒烟。
- [ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 无障碍：读屏与纯键盘路径，无障碍树断言进冒烟。
- [ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md) 绑定自定义域名与同站托管：绑定 aiao.io 下域名后发布命令纳入核对，桌面里的 Aiao Code 与直接访问同站。
- [ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md) 跨浏览器与窄屏验收：Safari、Firefox 与窄屏触屏的冒烟与支持矩阵。
- [ADESK-US-006](stories/platform/ADESK-US-006-web-test-coverage-gate.md) web 单测覆盖率门槛：覆盖率接入门禁与 CI，补齐高风险服务单测。

产品第一次对外托管：[ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md) 建立了一键发布命令 `pnpm nx run aiao-desktop:deploy`（[D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令)），2026-11-13 首次发布到 Cloudflare Pages（`https://aiao-desktop.pages.dev`），并对线上跑了桌面加 Aiao Code 的真实组合验收。下一步是绑定 aiao.io 下的域名与 Aiao Code 同站，见已立项的 [ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md)。

## 立项前提

已立项方向见上文「已立项（Backlog）」；[future-requirements](future-requirements.md) 里剩下的候选方向都要先有具体场景、验收范围和对既有冒烟的影响分析，再立故事进入本页。其中数据落盘已由 [D-07](decisions.md#d-07系统数据存在本地-sqlite) 定案，正式部署已由 [D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令) 定案；改变产品边界的方向立项时同步更新 [decisions](decisions.md)。
