---
id: DESKTOP-EPIC-006
status: In Progress
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 本地工作连续性

## 愿景

让布局、已保存内容、离线资源和数据备份具有清楚的一致性边界。

## 目标

- [ ] 减少重复布置并保持工作连续性（[DESKTOP-US-501](../stories/workspace/DESKTOP-US-501-local-session.md)）。
- [ ] 不因短暂断网中断本地工作（[DESKTOP-US-502](../stories/workspace/DESKTOP-US-502-offline-cache.md)）。
- [ ] 在更换浏览器或误操作后找回工作（[DESKTOP-US-503](../stories/workspace/DESKTOP-US-503-backup-reset.md)）。
- [ ] 避免布局覆盖和重复应用副作用（[DESKTOP-US-504](../stories/workspace/DESKTOP-US-504-multi-tab-ownership.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-501 本地桌面状态与会话恢复](../stories/workspace/DESKTOP-US-501-local-session.md)（High，M1）
- [DESKTOP-US-502 离线启动与资源完整性](../stories/workspace/DESKTOP-US-502-offline-cache.md)（High，M2）
- [DESKTOP-US-503 桌面备份、恢复与重置](../stories/workspace/DESKTOP-US-503-backup-reset.md)（High，M2）
- [DESKTOP-US-504 多标签页访问与写入协调](../stories/workspace/DESKTOP-US-504-multi-tab-ownership.md)（High，M2）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
