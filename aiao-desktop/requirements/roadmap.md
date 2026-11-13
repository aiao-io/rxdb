# Aiao Desktop 路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态，也不复制故事清单；只写顺序、依赖和立项前提。每个未关闭的故事都要在下面出现一次（需求门禁检查）。

## 下一批次

排序依据：先补验收能力，再动会改写已存数据的故事，最后做依赖运行时重构的故事。

1. **验收能力与披露，可并行**：[ADESK-US-008](stories/platform/ADESK-US-008-smoke-suite.md) 冒烟套件化——104、105、106、107、108、005、205、206 都要往冒烟里加不同形态的检查组，单体脚本撑不住；[ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md) 外网内容来源与隐私说明——站点已公开，不依赖其他故事；[ADESK-US-006](stories/platform/ADESK-US-006-web-test-coverage-gate.md) web 单测覆盖率门槛——窗口管理、FileSystem 与磁盘层是 105、205、206 要改的高风险逻辑，先补测再改。
2. [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md) 旧库升级路径（含降级保护与回滚目标的版本基线）：205 是第一个会改写已有用户数据的故事（`/Applications` 的 `.app` 包与 Dock 布局偏好），要先有「旧版建库 → 新版打开」的验收入口，以及允许回滚到哪些版本的边界。
3. [ADESK-US-205](stories/application/ADESK-US-205-application-management.md) Applications 目录、预装应用与 Dock 管理，分四个阶段。
4. [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 应用懒加载与统一系统能力，分四个阶段。
5. [ADESK-US-104](stories/desktop/ADESK-US-104-window-layout-persistence.md) 窗口布局跨刷新保留：恢复窗口要经 206 的应用运行时，否则要返工。

## 主链外的工作

不在上面的主链里，彼此不强排先后，各自按硬依赖启动（有的要等 008 的夹具，不是「随时可做」）：[ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md) 多标签页实时互通（要 008 的多页夹具；阶段 A 的并发写实测关系到已存数据的安全，建议在 205 开工前先做）、[ADESK-US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md) 外壳交互验收补齐、[ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 无障碍、[ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md) 跨浏览器与窄屏验收（要 008 的引擎参数）、[ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md) 绑定自定义域名与同站托管（域名要由用户在 Cloudflare 面板绑定；换域名不迁移桌面的本地数据，绑定前先读故事里的说明）。

阶段与故事的依赖：frontmatter 的 `dependsOn` 管关闭条件，阶段表的「依赖」列管启动时机，允许阶段交错。例如 206 阶段 A 在 205 阶段 A 完成后即可开始，但 206 整体 Done 要等 205 Done；104 排在 206 之后，是因为恢复窗口要经 206 的应用运行时。

## 扩大使用范围的条件

在评估更多内置应用、应用分发，或把桌面推荐给更多人之前，先做到下面五条（产品定位见[需求首页](README.md#产品定位)）：

1. **一个完整的文件工作流**：创建文件，在 Finder、TextEdit 与终端之间处理，保存、关闭、再次打开后内容不变——包括新建的 TextEdit 文档可以保存（现在没有保存入口）。
2. **一条备份恢复路径**：能把自己的数据导出，在新的浏览器配置里导入后内容一致（候选「本地数据保障」，见[后续方向](future-requirements.md#使用闭环与数据保障)）。
3. **保存失败不丢已保存的内容**：保存失败有提示，磁盘上的旧内容不变，编辑内容保留；配额不足与存储不可用有说明。
4. **支持矩阵明确**：浏览器分档（完整 / 有限 / 不支持）写进能力矩阵，窄屏的取舍已定（[ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md)）。
5. **升级与回滚验证通过**：旧库升级不丢数据，降级有保护，允许回滚到哪些版本有明确的边界（[ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md)）。

这是对「下一次可扩大使用范围」的定义，不是新的工作承诺：第 2、3 条还没有立故事，立项前提见下一节和[后续方向](future-requirements.md)。

## 立项前提

[future-requirements](future-requirements.md) 里的候选方向都要先有具体场景、验收范围和对既有冒烟的影响分析，再立故事进入本页。其中数据落盘已由 [D-07](decisions.md#d-07系统数据存在本地-sqlite) 定案，正式部署已由 [D-16](decisions.md#d-16发布到-cloudflare-pages一键发布命令) 定案；改变产品边界的方向立项时同步更新 [decisions](decisions.md)。
