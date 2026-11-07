---
id: DESKTOP-EPIC-005
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 桌面能力与应用协作

## 愿景

用授权、身份和作用域约束桌面服务及应用协作。

## 目标

- [ ] 控制应用通过桌面服务访问文件和系统操作（[DESKTOP-US-401](../stories/integration/DESKTOP-US-401-capability-permissions.md)）。
- [ ] 把独立 Web 应用接成完整桌面应用（[DESKTOP-US-402](../stories/integration/DESKTOP-US-402-desktop-sdk.md)）。
- [ ] 完成协作并避免全局事件总线串消息（[DESKTOP-US-403](../stories/integration/DESKTOP-US-403-scoped-messaging.md)）。
- [ ] 在文件管理器和不同工具间顺畅切换（[DESKTOP-US-404](../stories/integration/DESKTOP-US-404-open-with.md)）。
- [ ] 不错过任务结果且保留对敏感操作的控制（[DESKTOP-US-405](../stories/integration/DESKTOP-US-405-notifications-clipboard.md)）。

## 故事

本清单只列范围。状态以故事 YAML 为准，派生汇总见 [状态总览](../status-overview.md)。

- [DESKTOP-US-401 桌面能力授权与撤销](../stories/integration/DESKTOP-US-401-capability-permissions.md)（High，M1）
- [DESKTOP-US-402 应用与桌面交互协议](../stories/integration/DESKTOP-US-402-desktop-sdk.md)（High，M1）
- [DESKTOP-US-403 按作用域通信与跨应用协作](../stories/integration/DESKTOP-US-403-scoped-messaging.md)（High，M1）
- [DESKTOP-US-404 文件关联与打开方式](../stories/integration/DESKTOP-US-404-open-with.md)（Medium，M2）
- [DESKTOP-US-405 通知与剪贴板能力](../stories/integration/DESKTOP-US-405-notifications-clipboard.md)（Medium，M2）

## 非目标

- 本 Epic 不扩展产品规格中排除的原生程序、任意不可信网页、账号云同步与多人协作。
- 不通过提前标记 Done 或降低验收环境来关闭未验证能力。
