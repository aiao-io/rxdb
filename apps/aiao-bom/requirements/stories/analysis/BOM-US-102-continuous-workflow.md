---
id: BOM-US-102
title: 连续工作条件、结果快照与窄屏操作
status: In Review
priority: High
epic: BOM-EPIC-002
created: 2026-11-06
updated: 2026-11-06
tags: [bom, analysis]
dependsOn: [BOM-US-001]
capabilities: [rxdb:US-525]
---

# 用户故事：连续工作条件、结果快照与窄屏操作

## 作为/我想要/以便

作为连续核对多个结果的工程师，我想跨页保留同一生产任务并区分已执行与待更新条件，以便避免下载和交接错批量的结果。

## 范围边界

### In Scope

共享条件、URL、快照、发生项路径树、首次入口、键盘和窄屏交互。

### Out of Scope

跨设备同步、未载入资源的离线首次访问和整站离线刷新。

## 验收标准

| #   | 前置条件                     | 操作                                          | 预期结果                                                                                                           | 状态 |
| --- | ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 已查询指定物料、日期与计划量 | 跨页、返回和刷新                              | 共享条件与 URL 可恢复，结果只在身份和数据版本匹配时可复用                                                          | ✅   |
| 2   | 已有执行结果                 | 修改计划量或其他条件并尝试下载                | 旧结果明确待更新，重新执行后下载绑定相同条件、manifest 与数据版本                                                  | ✅   |
| 3   | 从概览开始十台生产任务       | 依次查看结构、成本和反查并退出引导            | 上下文连续，退出保留工作条件                                                                                       | ✅   |
| 4   | 375px 视口且使用键盘         | 打开导航、Tab、Escape，进入路径计算详情再返回 | 焦点有去向，Tab 在菜单内循环，页面无横向溢出且路径身份保留；核对中选中变化定位用量依据，返回恢复原行焦点与工作条件 | ✅   |

## 实现文件

- [bom-workspace-state.spec.ts](../../../../../modules/bom-workspace/src/app/bom-workspace-state.spec.ts)
- [export-snapshot.spec.ts](../../../../../modules/bom-workspace/src/app/presentation/export-snapshot.spec.ts)
- [bom-product-workflow.spec.ts](../../../../aiao-bom-e2e/src/bom-product-workflow.spec.ts)
- [bom-redesign.spec.ts](../../../../aiao-bom-e2e/src/bom-redesign.spec.ts)
- [review.page.spec.ts](../../../../../modules/bom-workspace/src/app/pages/review/review.page.spec.ts)
- [bom-change-review.spec.ts](../../../../aiao-bom-e2e/src/bom-change-review.spec.ts)

## 验收证据

本地应用验收通过，当前 AC 标为 ✅；证据符号包括 `计划量从 10 改为 20 时旧结果待更新，重新展开后下载保留同一批量`、`搜索电池后快捷反查，回到结构及刷新均保留日期和计划量`、`375 像素导航进入当前链接，Tab 循环，Escape 返回打开按钮`。

复验命令和结果见[验收台账](../../verification-report.md)与[应用化验收记录](../../plans/application-promotion-verification.md)。story 保留 In Review，等待 PR 评审及合并后再置 Done。

## References

- [应用决策](../../decisions.md)
- [应用约定](../../CONVENTIONS.md)
