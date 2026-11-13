# Aiao Desktop 路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态，也不复制故事清单；只写顺序、依赖和立项前提。每个未关闭的故事都要在下面出现一次（需求门禁检查）。

## 下一批次

排序依据：先补验收能力，再动会改写已存数据的故事，最后做依赖运行时重构的故事。

1. **验收能力与披露，可并行**：[ADESK-US-008](stories/platform/ADESK-US-008-smoke-suite.md) 冒烟套件化——104、105、106、107、108、005、205、206 都要往冒烟里加不同形态的检查组，单体脚本撑不住；[ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md) 外网内容来源与隐私说明——站点已公开，不依赖其他故事。
2. [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 旧库升级路径（含降级保护）：205 是第一个会改写已有用户数据的故事（`/Applications` 的 `.app` 包与 Dock 布局偏好），要先有「旧版建库 → 新版打开」的验收入口。
3. [ADESK-US-205](stories/application/ADESK-US-205-application-management.md) Applications 目录、预装应用与 Dock 管理，分四个阶段。
4. [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 应用懒加载与统一系统能力，分四个阶段。
5. [ADESK-US-104](stories/desktop/ADESK-US-104-window-layout-persistence.md) 窗口布局跨刷新保留：恢复窗口要经 206 的应用运行时，否则要返工。

## 不排顺序

彼此独立，随时可做：[ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md) 多标签页实时互通（要 008 的多页夹具）、[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 外壳交互验收补齐、[ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 无障碍、[ADESK-US-006](stories/platform/ADESK-US-006-web-test-coverage-gate.md) web 单测覆盖率门槛、[ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md) 跨浏览器与窄屏验收（要 008 的引擎参数）、[ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md) 绑定自定义域名与同站托管（域名要由用户在 Cloudflare 面板绑定）。

## 立项前提

[future-requirements](future-requirements.md) 里的候选方向都要先有具体场景、验收范围和对既有冒烟的影响分析，再立故事进入本页。其中数据落盘已由 [D-07](decisions.md#d-07系统数据存在本地-sqlite) 定案，正式部署已由 [D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令) 定案；改变产品边界的方向立项时同步更新 [decisions](decisions.md)。
