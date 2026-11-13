# Aiao Desktop 后续方向

## 当前孵化

先用门禁与冒烟守住产品结构和既有桌面行为（[ADESK-EPIC-001](epics/ADESK-EPIC-001.md)、[ADESK-EPIC-002](epics/ADESK-EPIC-002.md)），再按具体场景扩展。

## 已立项（Backlog）

以下方向已立故事、写明验收范围，状态见 [status-overview](status-overview.md)，排队与摘要见 [roadmap](roadmap.md)：

- **窗口布局跨刷新保留** → [ADESK-US-104](stories/desktop/ADESK-US-104-window-layout-persistence.md)：打开的窗口在刷新后恢复位置、大小与状态；已关闭的不恢复，失败窗口跳过并提示。
- **多标签页实时互通** → [ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md)：一个标签页里的改动在另一个标签页即时可见，同一 OPFS 库的跨标签页写入串行化。
- **旧库升级路径** → [ADESK-US-106](stories/desktop/ADESK-US-106-database-upgrade-path.md)：用上一版产物建库再换新版打开，数据保留、新数据域补写、不兼容时明确报错。
- **跨浏览器验收** → [ADESK-US-005](stories/platform/ADESK-US-005-cross-browser-smoke.md)：冒烟在 Safari 与 Firefox 上跑通，窄屏与触屏核心交互验收，写明浏览器支持矩阵。
- **单元测试与覆盖率** → [ADESK-US-006](stories/platform/ADESK-US-006-web-test-coverage-gate.md)：web 单测接入覆盖率门槛并挡住回退。
- **与集成应用同站部署** → [ADESK-US-004](stories/platform/ADESK-US-004-custom-domain.md)：绑定 aiao.io 下的域名，Aiao Code 存储不再分区；外网内容的来源与隐私说明一并补齐。
- **Applications 投影与宿主能力基线** → [ADESK-US-205](stories/application/ADESK-US-205-application-management.md)、[ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)：清单是唯一真相源、预装应用受保护、Dock 拖放与持久化；应用懒加载与窗口、菜单、通知、剪贴板、文件的统一宿主能力。
- **受管应用目录** → [ADESK-US-207](stories/application/ADESK-US-207-managed-app-catalog.md)：运营批准的目录支持安装、更新、卸载与回退。

## 候选方向

以下方向仍需要具体使用场景、能力缺口和独立验收范围后再立故事，不随当前故事自动承诺：

- **运行时应用分发**：在受管目录之外，用户安装任意 Web 应用、应用商店、代码签名和批准流程。
- **扩展宿主能力**：在 [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的最小能力集之外，继续增加 OAuth 弹窗、复杂文件选择、拖放数据通道等；每项先定 Orbit 请求名、权限与失败语义（[D-12](decisions.md#d-12集成应用的接入契约)）。
- **外网内容本地化**：壁纸随构建分发；地图与天气在无网时给出明确的占位说明。
