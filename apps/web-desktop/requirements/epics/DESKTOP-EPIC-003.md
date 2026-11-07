---
id: DESKTOP-EPIC-003
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# Web 应用全生命周期

## 愿景

把可信 Web 应用从目录带到桌面，并支持安装、运行、更新和卸载。

## 目标

- [ ] 安全识别应用来源并按需扩展桌面（[DESKTOP-US-201](../stories/application/DESKTOP-US-201-catalog-install.md)）。
- [ ] 让桌面知道如何安装、启动和管理应用（[DESKTOP-US-202](../stories/application/DESKTOP-US-202-application-manifest.md)）。
- [ ] 同时处理不同内容并避免重复打开（[DESKTOP-US-203](../stories/application/DESKTOP-US-203-launch-instances.md)）。
- [ ] 避免半更新和不兼容版本破坏工作（[DESKTOP-US-204](../stories/application/DESKTOP-US-204-update-rollback.md)）。
- [ ] 控制本地数据而不误删其他应用内容（[DESKTOP-US-205](../stories/application/DESKTOP-US-205-uninstall-data.md)）。
- [ ] 用少量操作启动常用工具（[DESKTOP-US-206](../stories/application/DESKTOP-US-206-launcher-pinning.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-201 应用目录与安装](../stories/application/DESKTOP-US-201-catalog-install.md)（High，M1）
- [DESKTOP-US-202 应用描述与兼容性校验](../stories/application/DESKTOP-US-202-application-manifest.md)（High，M1）
- [DESKTOP-US-203 启动与单实例、多实例策略](../stories/application/DESKTOP-US-203-launch-instances.md)（High，M1）
- [DESKTOP-US-204 应用更新与版本回退](../stories/application/DESKTOP-US-204-update-rollback.md)（High，M2）
- [DESKTOP-US-205 卸载与应用数据管理](../stories/application/DESKTOP-US-205-uninstall-data.md)（High，M2）
- [DESKTOP-US-206 应用启动器、搜索与固定](../stories/application/DESKTOP-US-206-launcher-pinning.md)（Medium，M1）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
