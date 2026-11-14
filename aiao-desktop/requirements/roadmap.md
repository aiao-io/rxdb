# Aiao Desktop 路线图

2026-11-14：本轮覆盖22个已立项故事。状态只见[状态总览](status-overview.md)，原始结果见[验收台账](verification-report.md)与[证据索引](evidence/2026-11-14/README.md)。未立项方向留在[后续方向](future-requirements.md)。

## 本次收尾

1. 按[D-20](decisions.md#d-20接受两项回溯基线例外并批准本次正式发布)接受US-008 #10与US-206 #7的一次历史流程例外。固定历史提交、数值门槛、回溯测量时间与首次拆分失败样本保留。
2. 按依赖顺序关闭US-008、US-106、US-205、US-206，再关闭US-104、US-105与US-005。各故事AC与硬依赖均须满足。
3. 执行已授权的正式发布，核对独有部署地址的全部文件、两个生产入口、双域名用户数据隔离及真实线上Aiao Code；取得本次结果后关闭[ADESK-US-004 自定义域名](stories/platform/ADESK-US-004-custom-domain.md)。
4. [US-107](stories/desktop/ADESK-US-107-shell-interaction-coverage.md)仍需操作者在本机Chrome普通标签页逐项按物理键盘；[US-108](stories/desktop/ADESK-US-108-accessibility.md)仍需VoiceOver V01～V14实际播报。

浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；其他浏览器记录保留为历史或可选诊断。数据库升级后不能回滚到B0（6859fe56）之前缺少降级保护的旧生产版本。

## 扩大使用范围的条件

扩大使用范围前，仍需完整文件工作流、备份恢复、保存失败与配额边界、明确的浏览器支持矩阵、升级与回滚边界。TextEdit新文档另存、导出导入与完整离线目前未立项；这些方向不能借“完成所有需求”直接扩大成新承诺，立项前提见[后续方向](future-requirements.md)。

新方向先补具体场景、验收范围和对冒烟的影响，再立故事。改变产品边界时同步更新[决策](decisions.md)。
