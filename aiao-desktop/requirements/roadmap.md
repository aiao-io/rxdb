# Aiao Desktop 路线图

2026-11-14：已立项的22个故事均已有实现，当前工作是验收与依赖关闭。状态只见[状态总览](status-overview.md)，原始结果见[验收台账](verification-report.md)与[证据索引](evidence/2026-11-14/README.md)。未立项的候选方向仍留在[后续方向](future-requirements.md)。

## 验收收尾顺序

1. [ADESK-US-008 冒烟套件化](stories/platform/ADESK-US-008-smoke-suite.md)：独立组与夹具已实现并运行；性能数值对照通过，但基线为实现后回溯，需评审该历史流程保留项。首次拆分超出1.1倍的失败报告同样保留。
2. [ADESK-US-106 旧库升级路径](stories/desktop/ADESK-US-106-database-upgrade-path.md)：真实旧生产部署升级与异常路径通过，待US-008关闭。B0前旧部署没有降级保护，升级后的库不可回滚到它。
3. [ADESK-US-205 应用管理](stories/application/ADESK-US-205-application-management.md)：A～D阶段的Applications、保护与Dock管理已验收，待US-106关闭。
4. [ADESK-US-206 应用运行时与宿主能力](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)：A、C、D阶段完成；B阶段体积数值通过，保留实现前基线缺失的评审项，且关闭依赖US-205。
5. [ADESK-US-104 窗口布局](stories/desktop/ADESK-US-104-window-layout-persistence.md)：Chromium的AC通过，待US-008与US-206关闭。

## 其他待验收故事

- [ADESK-US-105 多标签页互通](stories/desktop/ADESK-US-105-multi-tab-sync.md)：两阶段AC通过，待US-008关闭。
- [ADESK-US-107 外壳交互](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)：自动化路径通过，剩本机Chrome普通标签页的真实物理键盘逐项验收。
- [ADESK-US-108 无障碍](stories/desktop/ADESK-US-108-accessibility.md)：ARIA树与纯键盘路径通过，剩真实VoiceOver播报记录。
- [ADESK-US-005 跨浏览器](stories/platform/ADESK-US-005-cross-browser-smoke.md)：重复完整复测并保存逐项报告；Firefox的跨源iframe自动化缺口、WebKit的剪贴板授权缺口尚不能宣称完整或已完成有限支持。
- [ADESK-US-004 自定义域名](stories/platform/ADESK-US-004-custom-domain.md)：域名绑定、同站项目及已有GitHub登录状态已实测；剩本次正式发布对账及双域名文件数据隔离的完整证据。旧生产构建写文件后的存储元数据失败已保留，需在发布当前已验证产物后复测。

阶段AC通过不自动关闭故事；`dependsOn`和所有AC仍是Done的必要条件。本轮没有合并main或发布当前工作区。

## 扩大使用范围的条件

扩大使用范围前，仍需完整文件工作流、备份恢复、保存失败与配额边界、明确的浏览器支持矩阵、升级与回滚边界。TextEdit新文档另存、导出导入与完整离线目前未立项；这些方向不能借“完成所有需求”直接扩大成新承诺，立项前提见[后续方向](future-requirements.md)。

新方向先补具体场景、验收范围和对冒烟的影响，再立故事。改变产品边界时同步更新[决策](decisions.md)。
