---
id: DESKTOP-EPIC-008
status: In Progress
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 可验证交付与部署

## 愿景

用双模式、三框架、真实环境和正式产物证据支撑产品发布。

## 目标

- [ ] 避免某一交互模式只有外观而无法实际使用（[DESKTOP-US-701](../stories/quality/DESKTOP-US-701-accessibility-environments.md)）。
- [ ] 避免双模式、多框架和 Orbit 接入各自通过但组合失败（[DESKTOP-US-702](../stories/quality/DESKTOP-US-702-release-verification.md)）。
- [ ] 让独立发布和问题复现可持续（[DESKTOP-US-703](../stories/quality/DESKTOP-US-703-deployment-diagnostics.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-701 支持环境与无障碍验收](../stories/quality/DESKTOP-US-701-accessibility-environments.md)（High，M1）
- [DESKTOP-US-702 产品旅程、性能与回归门禁](../stories/quality/DESKTOP-US-702-release-verification.md)（High，M2）
- [DESKTOP-US-703 静态部署、版本信息与诊断](../stories/quality/DESKTOP-US-703-deployment-diagnostics.md)（High，M2）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
